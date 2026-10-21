from datetime import date, datetime
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field, field_validator
from sqlalchemy.orm import Session

from dependencies import get_db
from dependencies import get_current_student
from models import (
    Admin, Student, Teacher, ClassAssignment,
    Exam, ExamClass, ExamSubject, StudentMark
)
from subscription_access import require_school_feature
from teacher_access import get_current_teacher, get_assignment

router = APIRouter(tags=["Results"])


# -------------------- REQUEST SCHEMAS --------------------

class ExamRequest(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    academic_year: str = Field(min_length=4, max_length=20)
    exam_date: date

    @field_validator("name", "academic_year")
    @classmethod
    def clean_text(cls, value):
        value = value.strip()
        if not value:
            raise ValueError("This field cannot be blank.")
        return value


class SubjectRequest(BaseModel):
    subject_name: str = Field(min_length=1, max_length=100)
    max_marks: float = Field(gt=0, le=100000)

    @field_validator("subject_name")
    @classmethod
    def clean_subject(cls, value):
        value = value.strip()
        if not value:
            raise ValueError("Subject name cannot be blank.")
        return value


class StudentMarkInput(BaseModel):
    student_id: int = Field(gt=0)
    obtained_marks: float = Field(ge=0, le=100000)


class MarksRequest(BaseModel):
    marks: list[StudentMarkInput] = Field(min_length=1, max_length=500)


# -------------------- HELPERS --------------------

def teacher_exam_class(db: Session, teacher: Teacher, exam_class_id: int):
    assignment = get_assignment(db, teacher)
    item = db.query(ExamClass).filter(
        ExamClass.id == exam_class_id,
        ExamClass.admin_id == teacher.admin_id,
        ExamClass.teacher_id == teacher.id,
        ExamClass.class_name == assignment.class_name,
        ExamClass.section == assignment.section,
    ).first()
    if not item:
        raise HTTPException(status_code=404, detail="Exam class not found.")
    return item


def exam_class_data(db: Session, item: ExamClass):
    exam = db.query(Exam).filter(Exam.id == item.exam_id, Exam.admin_id == item.admin_id).first()
    subjects = db.query(ExamSubject).filter(
        ExamSubject.exam_class_id == item.id
    ).order_by(ExamSubject.id).all()
    return {
        "id": item.id,
        "exam_id": item.exam_id,
        "exam_name": exam.name if exam else "",
        "academic_year": exam.academic_year if exam else "",
        "exam_date": exam.exam_date if exam else None,
        "class_name": item.class_name,
        "section": item.section,
        "status": item.status,
        "published_at": item.published_at,
        "subjects": [
            {"id": s.id, "subject_name": s.subject_name, "max_marks": s.max_marks}
            for s in subjects
        ],
    }


def get_subject_for_teacher(db: Session, teacher: Teacher, subject_id: int):
    assignment = get_assignment(db, teacher)
    subject = db.query(ExamSubject).join(
        ExamClass, ExamSubject.exam_class_id == ExamClass.id
    ).filter(
        ExamSubject.id == subject_id,
        ExamClass.admin_id == teacher.admin_id,
        ExamClass.teacher_id == teacher.id,
        ExamClass.class_name == assignment.class_name,
        ExamClass.section == assignment.section,
    ).first()
    if not subject:
        raise HTTPException(status_code=404, detail="Subject not found.")
    return subject


def calculate_result(db: Session, exam_class: ExamClass, student: Student):
    subjects = db.query(ExamSubject).filter(
        ExamSubject.exam_class_id == exam_class.id
    ).order_by(ExamSubject.id).all()

    subject_ids = [subject.id for subject in subjects]
    marks_by_subject = {}

    if subject_ids:
        marks = db.query(StudentMark).filter(
            StudentMark.exam_subject_id.in_(subject_ids),
            StudentMark.student_id == student.id,
        ).all()
        marks_by_subject = {
            mark.exam_subject_id: mark for mark in marks
        }

    subject_results = []
    total_obtained = 0.0
    total_maximum = 0.0

    for subject in subjects:
        mark = marks_by_subject.get(subject.id)
        obtained = float(mark.obtained_marks) if mark else 0.0
        maximum = float(subject.max_marks)
        total_obtained += obtained
        total_maximum += maximum

        subject_results.append({
            "subject_id": subject.id,
            "subject_name": subject.subject_name,
            "obtained_marks": obtained if mark else None,
            "max_marks": maximum,
        })

    percentage = round(total_obtained * 100 / total_maximum, 2) if total_maximum else 0.0
    return {
        "student_id": student.id,
        "student_name": student.full_name,
        "class_name": student.class_name,
        "section": student.section,
        "subjects": subject_results,
        "total_obtained": round(total_obtained, 2),
        "total_maximum": round(total_maximum, 2),
        "percentage": percentage,
    }

def published_school_cohort_is_complete(db: Session, exam_id: int, admin_id: int):
    assignments = db.query(ClassAssignment).filter(
        ClassAssignment.admin_id == admin_id
    ).all()

    if not assignments:
        return False

    for assignment in assignments:
        item = db.query(ExamClass).filter(
            ExamClass.exam_id == exam_id,
            ExamClass.admin_id == admin_id,
            ExamClass.class_name == assignment.class_name,
            ExamClass.section == assignment.section,
            ExamClass.status == "published",
        ).first()
        if not item:
            return False

    return True


def add_ranks(db: Session, exam_class: ExamClass, student: Student, result: dict):
    # Load published classes for this exam and school.
    same_exam_classes = db.query(ExamClass).filter(
        ExamClass.exam_id == exam_class.exam_id,
        ExamClass.admin_id == exam_class.admin_id,
        ExamClass.status == "published",
    ).all()

    class_results = []
    school_results = []

    if same_exam_classes:
        cohort_ids = [cohort.id for cohort in same_exam_classes]
        cohort_keys = {
            (cohort.class_name, cohort.section)
            for cohort in same_exam_classes
        }

        # Batch-load subjects for all published classes.
        all_subjects = db.query(ExamSubject).filter(
            ExamSubject.exam_class_id.in_(cohort_ids)
        ).order_by(ExamSubject.id).all()

        subjects_by_class = {cohort_id: [] for cohort_id in cohort_ids}
        for subject in all_subjects:
            subjects_by_class[subject.exam_class_id].append(subject)

        # Batch-load students, then group by their class and section.
        all_students = db.query(Student).filter(
            Student.admin_id == exam_class.admin_id
        ).all()

        students_by_key = {key: [] for key in cohort_keys}
        for cohort_student in all_students:
            key = (cohort_student.class_name, cohort_student.section)
            if key in students_by_key:
                students_by_key[key].append(cohort_student)

        relevant_students = [
            cohort_student
            for group in students_by_key.values()
            for cohort_student in group
        ]

        subject_ids = [subject.id for subject in all_subjects]
        student_ids = [item.id for item in relevant_students]

        # Batch-load marks for all relevant students and subjects.
        marks_by_key = {}
        if subject_ids and student_ids:
            all_marks = db.query(StudentMark).filter(
                StudentMark.exam_subject_id.in_(subject_ids),
                StudentMark.student_id.in_(student_ids),
            ).all()

            marks_by_key = {
                (mark.student_id, mark.exam_subject_id): mark
                for mark in all_marks
            }

        # Calculate complete results in memory.
        for cohort in same_exam_classes:
            cohort_subjects = subjects_by_class[cohort.id]

            # Same rule as before: a class without subjects has no rank.
            if not cohort_subjects:
                continue

            cohort_students = students_by_key.get(
                (cohort.class_name, cohort.section), []
            )

            for cohort_student in cohort_students:
                total_obtained = 0.0
                total_maximum = 0.0
                complete = True

                for subject in cohort_subjects:
                    total_maximum += float(subject.max_marks)
                    mark = marks_by_key.get(
                        (cohort_student.id, subject.id)
                    )

                    if mark is None:
                        complete = False
                        break

                    total_obtained += float(mark.obtained_marks)

                if not complete:
                    continue

                percentage = (
                    round(total_obtained * 100 / total_maximum, 2)
                    if total_maximum else 0.0
                )

                item = {
                    "student_id": cohort_student.id,
                    "percentage": percentage,
                }
                school_results.append(item)

                if cohort.id == exam_class.id:
                    class_results.append(item)

    # Preserve the existing competition ranking and tie handling.
    class_results.sort(
        key=lambda item: item["percentage"], reverse=True
    )
    class_rank = None
    previous_percentage = None
    previous_rank = None

    for index, item in enumerate(class_results, start=1):
        if (
            previous_percentage is None
            or item["percentage"] != previous_percentage
        ):
            previous_rank = index
            previous_percentage = item["percentage"]

        if item["student_id"] == student.id:
            class_rank = previous_rank
            break

    # Keep the existing final/provisional school-rank rule unchanged.
    school_complete = published_school_cohort_is_complete(
        db, exam_class.exam_id, exam_class.admin_id
    )

    school_rank = None
    if school_results:
        school_results.sort(
            key=lambda item: item["percentage"], reverse=True
        )
        previous_percentage = None
        previous_rank = None

        for index, item in enumerate(school_results, start=1):
            if (
                previous_percentage is None
                or item["percentage"] != previous_percentage
            ):
                previous_rank = index
                previous_percentage = item["percentage"]

            if item["student_id"] == student.id:
                school_rank = previous_rank
                break

    result["class_rank"] = class_rank
    result["school_rank"] = school_rank
    result["school_rank_status"] = (
        "final" if school_complete else "provisional"
    )
    return result

# -------------------- TEACHER APIs --------------------

@router.get("/teacher/results/exams", dependencies=[Depends(require_school_feature("results"))])
def list_teacher_exams(
    teacher: Teacher = Depends(get_current_teacher),
    db: Session = Depends(get_db),
):
    assignment = get_assignment(db, teacher)
    items = db.query(ExamClass).filter(
        ExamClass.admin_id == teacher.admin_id,
        ExamClass.teacher_id == teacher.id,
        ExamClass.class_name == assignment.class_name,
        ExamClass.section == assignment.section,
    ).order_by(ExamClass.created_at.desc()).all()
    return [exam_class_data(db, item) for item in items]


@router.post("/teacher/results/exams", dependencies=[Depends(require_school_feature("results"))], status_code=status.HTTP_201_CREATED)
def create_exam(
    request: ExamRequest,
    teacher: Teacher = Depends(get_current_teacher),
    db: Session = Depends(get_db),
):
    assignment = get_assignment(db, teacher)

    exam = db.query(Exam).filter(
        Exam.admin_id == teacher.admin_id,
        Exam.name == request.name,
        Exam.academic_year == request.academic_year,
        Exam.exam_date == request.exam_date,
    ).first()

    if not exam:
        exam = Exam(
            admin_id=teacher.admin_id,
            name=request.name,
            academic_year=request.academic_year,
            exam_date=request.exam_date,
        )
        db.add(exam)
        db.flush()

    exam_class = db.query(ExamClass).filter(
        ExamClass.exam_id == exam.id,
        ExamClass.class_name == assignment.class_name,
        ExamClass.section == assignment.section,
    ).first()

    if exam_class:
        raise HTTPException(status_code=409, detail="This exam already exists for your class and section.")

    exam_class = ExamClass(
        exam_id=exam.id,
        admin_id=teacher.admin_id,
        teacher_id=teacher.id,
        class_name=assignment.class_name,
        section=assignment.section,
        status="draft",
    )
    db.add(exam_class)
    db.commit()
    db.refresh(exam_class)
    return exam_class_data(db, exam_class)


@router.put("/teacher/results/exams/{exam_class_id}", dependencies=[Depends(require_school_feature("results"))])
def update_exam(
    exam_class_id: int,
    request: ExamRequest,
    teacher: Teacher = Depends(get_current_teacher),
    db: Session = Depends(get_db),
):
    item = teacher_exam_class(db, teacher, exam_class_id)
    if item.status == "published":
        raise HTTPException(status_code=409, detail="Published exam details cannot be changed.")
    exam = db.query(Exam).filter(
        Exam.id == item.exam_id,
        Exam.admin_id == teacher.admin_id,
    ).first()
    if not exam:
        raise HTTPException(status_code=404, detail="Exam not found.")

    duplicate = db.query(Exam).filter(
        Exam.admin_id == teacher.admin_id,
        Exam.name == request.name,
        Exam.academic_year == request.academic_year,
        Exam.exam_date == request.exam_date,
        Exam.id != exam.id,
    ).first()
    if duplicate:
        raise HTTPException(status_code=409, detail="Another exam already uses these details.")

    exam.name = request.name
    exam.academic_year = request.academic_year
    exam.exam_date = request.exam_date
    db.commit()
    db.refresh(item)
    return exam_class_data(db, item)


@router.post("/teacher/results/exams/{exam_class_id}/subjects", dependencies=[Depends(require_school_feature("results"))], status_code=status.HTTP_201_CREATED)
def create_subject(
    exam_class_id: int,
    request: SubjectRequest,
    teacher: Teacher = Depends(get_current_teacher),
    db: Session = Depends(get_db),
):
    item = teacher_exam_class(db, teacher, exam_class_id)
    if item.status == "published":
        raise HTTPException(status_code=409, detail="Unpublish is not supported; published subjects cannot be changed.")

    subject = ExamSubject(
        exam_class_id=item.id,
        subject_name=request.subject_name,
        max_marks=request.max_marks,
    )
    db.add(subject)
    try:
        db.commit()
    except Exception:
        db.rollback()
        raise HTTPException(status_code=409, detail="This subject already exists or could not be saved.")
    db.refresh(subject)
    return {"id": subject.id, "subject_name": subject.subject_name, "max_marks": subject.max_marks}


@router.put("/teacher/results/subjects/{subject_id}", dependencies=[Depends(require_school_feature("results"))])
def update_subject(
    subject_id: int,
    request: SubjectRequest,
    teacher: Teacher = Depends(get_current_teacher),
    db: Session = Depends(get_db),
):
    subject = get_subject_for_teacher(db, teacher, subject_id)
    exam_class = db.query(ExamClass).filter(
        ExamClass.id == subject.exam_class_id,
        ExamClass.admin_id == teacher.admin_id,
        ExamClass.teacher_id == teacher.id,
    ).first()
    if not exam_class:
        raise HTTPException(status_code=404, detail="Exam class not found.")
    if exam_class.status == "published":
        raise HTTPException(status_code=409, detail="Published subjects cannot be changed.")
    marks = db.query(StudentMark).filter(StudentMark.exam_subject_id == subject.id).all()
    if any(float(mark.obtained_marks) > request.max_marks for mark in marks):
        raise HTTPException(status_code=400, detail="New maximum marks are below existing student marks.")
    duplicate = db.query(ExamSubject).filter(
        ExamSubject.exam_class_id == subject.exam_class_id,
        ExamSubject.subject_name == request.subject_name,
        ExamSubject.id != subject.id,
    ).first()
    if duplicate:
        raise HTTPException(status_code=409, detail="This subject already exists.")
    subject.subject_name = request.subject_name
    subject.max_marks = request.max_marks
    db.commit()
    return {"message": "Subject updated successfully."}


@router.delete("/teacher/results/subjects/{subject_id}", dependencies=[Depends(require_school_feature("results"))])
def delete_subject(
    subject_id: int,
    teacher: Teacher = Depends(get_current_teacher),
    db: Session = Depends(get_db),
):
    subject = get_subject_for_teacher(db, teacher, subject_id)
    exam_class = db.query(ExamClass).filter(
        ExamClass.id == subject.exam_class_id,
        ExamClass.admin_id == teacher.admin_id,
        ExamClass.teacher_id == teacher.id,
    ).first()
    if not exam_class:
        raise HTTPException(status_code=404, detail="Exam class not found.")
    if exam_class.status == "published":
        raise HTTPException(status_code=409, detail="Published subjects cannot be deleted.")
    if db.query(StudentMark).filter(StudentMark.exam_subject_id == subject.id).first():
        raise HTTPException(status_code=409, detail="Subject has saved marks. Remove its marks first before deleting it.")
    db.delete(subject)
    db.commit()
    return {"message": "Subject deleted successfully."}


@router.put("/teacher/results/subjects/{subject_id}/marks", dependencies=[Depends(require_school_feature("results"))])
def save_subject_marks(
    subject_id: int,
    request: MarksRequest,
    teacher: Teacher = Depends(get_current_teacher),
    db: Session = Depends(get_db),
):
    subject = get_subject_for_teacher(db, teacher, subject_id)
    exam_class = db.query(ExamClass).filter(
        ExamClass.id == subject.exam_class_id,
        ExamClass.admin_id == teacher.admin_id,
        ExamClass.teacher_id == teacher.id,
    ).first()
    if not exam_class:
        raise HTTPException(status_code=404, detail="Exam class not found.")
    if exam_class.status == "published":
        raise HTTPException(status_code=409, detail="Published marks cannot be changed.")

    assignment = get_assignment(db, teacher)
    seen = set()
    for entry in request.marks:
        if entry.student_id in seen:
            raise HTTPException(status_code=400, detail="Duplicate student ID in request.")
        seen.add(entry.student_id)
        if entry.obtained_marks > float(subject.max_marks):
            raise HTTPException(status_code=400, detail=f"Marks cannot exceed maximum marks ({subject.max_marks}).")
        student = db.query(Student).filter(
            Student.id == entry.student_id,
            Student.admin_id == teacher.admin_id,
            Student.class_name == assignment.class_name,
            Student.section == assignment.section,
        ).first()
        if not student:
            raise HTTPException(status_code=400, detail=f"Student {entry.student_id} is not in your assigned class.")

    for entry in request.marks:
        mark = db.query(StudentMark).filter(
            StudentMark.exam_subject_id == subject.id,
            StudentMark.student_id == entry.student_id,
        ).first()
        if mark:
            mark.obtained_marks = entry.obtained_marks
            mark.updated_at = datetime.utcnow()
        else:
            db.add(StudentMark(
                exam_subject_id=subject.id,
                student_id=entry.student_id,
                obtained_marks=entry.obtained_marks,
            ))

    db.commit()
    return {"message": "Marks saved successfully.", "saved_count": len(request.marks)}


@router.get("/teacher/results/exams/{exam_class_id}/marks", dependencies=[Depends(require_school_feature("results"))])
def list_subject_marks(
    exam_class_id: int,
    teacher: Teacher = Depends(get_current_teacher),
    db: Session = Depends(get_db),
):
    item = teacher_exam_class(db, teacher, exam_class_id)
    students = db.query(Student).filter(
        Student.admin_id == teacher.admin_id,
        Student.class_name == item.class_name,
        Student.section == item.section,
    ).order_by(Student.full_name).all()
    subjects = db.query(ExamSubject).filter(ExamSubject.exam_class_id == item.id).all()
    return {
        "exam_class_id": item.id,
        "status": item.status,
        "students": [
            {
                "student_id": student.id,
                "registration_number": student.registration_number,
                "full_name": student.full_name,
                "subjects": [
                    {
                        "subject_id": subject.id,
                        "subject_name": subject.subject_name,
                        "max_marks": subject.max_marks,
                        "obtained_marks": (
                            lambda mark: float(mark.obtained_marks) if mark else None
                        )(db.query(StudentMark).filter(
                            StudentMark.exam_subject_id == subject.id,
                            StudentMark.student_id == student.id,
                        ).first()),
                    }
                    for subject in subjects
                ],
            }
            for student in students
        ],
    }


@router.post("/teacher/results/exams/{exam_class_id}/publish", dependencies=[Depends(require_school_feature("results"))])
def publish_exam_results(
    exam_class_id: int,
    teacher: Teacher = Depends(get_current_teacher),
    db: Session = Depends(get_db),
):
    item = teacher_exam_class(db, teacher, exam_class_id)
    if item.status == "published":
        return {"message": "Results are already published."}

    subjects = db.query(ExamSubject).filter(ExamSubject.exam_class_id == item.id).all()
    students = db.query(Student).filter(
        Student.admin_id == teacher.admin_id,
        Student.class_name == item.class_name,
        Student.section == item.section,
    ).all()

    if not subjects:
        raise HTTPException(status_code=400, detail="Add at least one subject before publishing.")
    if not students:
        raise HTTPException(status_code=400, detail="No students found in this class and section.")

    missing = []
    for student in students:
        for subject in subjects:
            mark = db.query(StudentMark).filter(
                StudentMark.exam_subject_id == subject.id,
                StudentMark.student_id == student.id,
            ).first()
            if not mark:
                missing.append({"student_id": student.id, "subject": subject.subject_name})
            elif float(mark.obtained_marks) > float(subject.max_marks) or float(mark.obtained_marks) < 0:
                raise HTTPException(status_code=400, detail="A saved mark is outside the allowed range.")

    if missing:
        raise HTTPException(
            status_code=400,
            detail={"message": "Cannot publish: marks are missing.", "missing": missing[:50]},
        )

    item.status = "published"
    item.published_at = datetime.utcnow()
    db.commit()
    return {"message": "Results published successfully.", "published_at": item.published_at}


# -------------------- STUDENT API --------------------

@router.get("/student/results", dependencies=[Depends(require_school_feature("results"))])
def get_student_results(
    student: Student = Depends(get_current_student),
    db: Session = Depends(get_db),
):
    items = db.query(ExamClass).filter(
        ExamClass.admin_id == student.admin_id,
        ExamClass.class_name == student.class_name,
        ExamClass.section == student.section,
        ExamClass.status == "published",
    ).order_by(ExamClass.published_at.desc()).all()

    output = []
    for item in items:
        exam = db.query(Exam).filter(Exam.id == item.exam_id, Exam.admin_id == student.admin_id).first()
        if not exam:
            continue
        result = calculate_result(db, item, student)
        complete = bool(result["subjects"]) and all(
            subject["obtained_marks"] is not None for subject in result["subjects"]
        )
        if not complete:
            continue
        result = add_ranks(db, item, student, result)
        result.update({
            "exam_id": exam.id,
            "exam_name": exam.name,
            "academic_year": exam.academic_year,
            "exam_date": exam.exam_date,
            "published_at": item.published_at,
        })
        output.append(result)
    return output
