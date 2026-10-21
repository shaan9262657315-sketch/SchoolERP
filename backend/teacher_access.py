from calendar import monthrange
from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.security import HTTPAuthorizationCredentials
from pydantic import BaseModel, Field, field_validator
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from auth import create_access_token
from dependencies import bearer_scheme, get_current_admin, get_db, _decode_token
from models import Admin, Teacher, ClassAssignment, Student, Attendance
from schemas import VALID_CLASSES, VALID_SECTIONS
from subscription_access import require_school_feature
from security import hash_password, verify_password

router = APIRouter(tags=["Teacher Access"])


class TeacherCreateRequest(BaseModel):
    username: str = Field(min_length=1, max_length=50)
    full_name: str = Field(min_length=1, max_length=100)
    password: str = Field(min_length=8, max_length=128)

    @field_validator("username", "full_name")
    @classmethod
    def strip_values(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("This field cannot be blank.")
        return value


class TeacherStudentCreateRequest(BaseModel):
    registration_number: str = Field(min_length=1, max_length=30)
    full_name: str = Field(min_length=1, max_length=100)
    date_of_birth: date
    guardian_name: str = Field(min_length=1, max_length=100)

    @field_validator("registration_number", "full_name", "guardian_name")
    @classmethod
    def strip_values(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("This field cannot be blank.")
        return value

    @field_validator("date_of_birth")
    @classmethod
    def validate_dob(cls, value: date) -> date:
        if value >= date.today():
            raise ValueError("Date of birth must be in the past.")
        return value


class TeacherLoginRequest(BaseModel):
    username: str = Field(min_length=1, max_length=50)
    password: str = Field(min_length=1, max_length=128)


class ClassAssignmentRequest(BaseModel):
    teacher_id: int = Field(gt=0)
    class_name: str = Field(min_length=1, max_length=30)
    section: str = Field(default="A", min_length=1, max_length=1)

    @field_validator("class_name")
    @classmethod
    def validate_class(cls, value: str) -> str:
        value = value.strip()
        value = value.title() if value.lower() in {"nursery", "lkg", "ukg"} else value
        if value not in VALID_CLASSES:
            raise ValueError("Invalid class.")
        return value

    @field_validator("section")
    @classmethod
    def validate_section(cls, value: str) -> str:
        value = value.strip().upper()
        if value not in VALID_SECTIONS:
            raise ValueError("Section must be A, B, or C.")
        return value


class AttendanceMarkItem(BaseModel):
    student_id: int = Field(gt=0)
    status: str

    @field_validator("status")
    @classmethod
    def validate_status(cls, value: str) -> str:
        value = value.strip().title()
        if value not in {"Present", "Absent", "Late"}:
            raise ValueError("Status must be Present, Absent, or Late.")
        return value


class AttendanceMarkRequest(BaseModel):
    attendance_date: date
    records: list[AttendanceMarkItem] = Field(min_length=1)


def get_current_teacher(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
    db: Session = Depends(get_db),
) -> Teacher:
    payload = _decode_token(credentials)

    if payload.get("role") != "teacher":
        raise HTTPException(status_code=403, detail="Teacher access required.")

    subject = payload.get("sub")
    if not isinstance(subject, str) or not subject.isdigit():
        raise HTTPException(status_code=401, detail="Invalid authentication token.")

    teacher = db.get(Teacher, int(subject))
    if teacher is None or not teacher.is_active:
        raise HTTPException(status_code=401, detail="Teacher account is inactive or unavailable.")

    return teacher


def get_assignment(db: Session, teacher: Teacher) -> ClassAssignment:
    assignment = (
        db.query(ClassAssignment)
        .filter(
            ClassAssignment.teacher_id == teacher.id,
            ClassAssignment.admin_id == teacher.admin_id,
        )
        .first()
    )
    if assignment is None:
        raise HTTPException(status_code=403, detail="No class has been assigned to this teacher.")
    return assignment


class TeacherStudentUpdateRequest(BaseModel):
    full_name: str = Field(min_length=1, max_length=100)
    date_of_birth: date
    guardian_name: str = Field(min_length=1, max_length=100)

    @field_validator("full_name", "guardian_name")
    @classmethod
    def strip_values(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("This field cannot be blank.")
        return value

    @field_validator("date_of_birth")
    @classmethod
    def validate_dob(cls, value: date) -> date:
        if value >= date.today():
            raise ValueError("Date of birth must be in the past.")
        return value


def safe_student(student: Student) -> dict:
    return {
        "id": student.id,
        "registration_number": student.registration_number,
        "full_name": student.full_name,
        "date_of_birth": student.date_of_birth,
        "class_name": student.class_name,
        "section": student.section,
        "guardian_name": student.guardian_name,
    }


@router.post("/auth/teacher/login")
def teacher_login(
    credentials: TeacherLoginRequest,
    db: Session = Depends(get_db),
):
    teacher = (
        db.query(Teacher)
        .filter(Teacher.username == credentials.username.strip())
        .first()
    )

    if (
        teacher is None
        or not teacher.is_active
        or not verify_password(credentials.password, teacher.password_hash)
    ):
        raise HTTPException(
            status_code=401,
            detail="Invalid username or password.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    assignment = (
        db.query(ClassAssignment)
        .filter(
            ClassAssignment.teacher_id == teacher.id,
            ClassAssignment.admin_id == teacher.admin_id,
        )
        .first()
    )

    return {
        "access_token": create_access_token(teacher.id, "teacher"),
        "token_type": "bearer",
        "expires_in": 1800,
        "teacher": {
            "id": teacher.id,
            "username": teacher.username,
            "full_name": teacher.full_name,
            "class_name": assignment.class_name if assignment else None,
            "section": assignment.section if assignment else None,
        },
    }


@router.post("/admin/teachers", dependencies=[Depends(require_school_feature("teachers"))], status_code=status.HTTP_201_CREATED)
def create_teacher(
    request: TeacherCreateRequest,
    admin: Admin = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    existing = db.query(Teacher).filter(
        Teacher.username == request.username.strip()
    ).first()

    if existing:
        raise HTTPException(status_code=409, detail="Username already exists.")

    teacher = Teacher(
        admin_id=admin.id,
        username=request.username.strip(),
        full_name=request.full_name.strip(),
        password_hash=hash_password(request.password),
        is_active=True,
    )
    db.add(teacher)

    try:
        db.commit()
        db.refresh(teacher)
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=409, detail="Username already exists.")

    return {
        "id": teacher.id,
        "username": teacher.username,
        "full_name": teacher.full_name,
        "is_active": teacher.is_active,
    }


@router.get("/admin/teachers", dependencies=[Depends(require_school_feature("teachers"))])
def list_teachers(
    admin: Admin = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    teachers = (
        db.query(Teacher)
        .filter(Teacher.admin_id == admin.id)
        .order_by(Teacher.full_name)
        .all()
    )
    assignments = {
        a.teacher_id: a
        for a in db.query(ClassAssignment)
        .filter(ClassAssignment.admin_id == admin.id)
        .all()
    }

    return [
        {
            "id": t.id,
            "username": t.username,
            "full_name": t.full_name,
            "is_active": t.is_active,
            "class_name": assignments[t.id].class_name if t.id in assignments else None,
            "section": assignments[t.id].section if t.id in assignments else None,
        }
        for t in teachers
    ]


@router.post("/admin/class-assignments", dependencies=[Depends(require_school_feature("teachers"))])
def assign_class(
    request: ClassAssignmentRequest,
    admin: Admin = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    teacher = db.query(Teacher).filter(
        Teacher.id == request.teacher_id,
        Teacher.admin_id == admin.id,
    ).first()

    if teacher is None:
        raise HTTPException(status_code=404, detail="Teacher not found.")

    existing_teacher_assignment = db.query(ClassAssignment).filter(
        ClassAssignment.teacher_id == teacher.id
    ).first()

    if existing_teacher_assignment:
        raise HTTPException(
            status_code=409,
            detail="This teacher already has a class. Reassigning is not supported by this endpoint.",
        )

    existing_class_assignment = db.query(ClassAssignment).filter(
        ClassAssignment.admin_id == admin.id,
        ClassAssignment.class_name == request.class_name,
        ClassAssignment.section == request.section,
    ).first()

    if existing_class_assignment:
        raise HTTPException(
            status_code=409,
            detail="This class and section already has a teacher assigned.",
        )

    assignment = ClassAssignment(
        admin_id=admin.id,
        teacher_id=teacher.id,
        class_name=request.class_name,
        section=request.section,
    )
    db.add(assignment)

    try:
        db.commit()
        db.refresh(assignment)
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=409, detail="Class assignment conflicts with an existing assignment.")

    return {
        "id": assignment.id,
        "teacher_id": assignment.teacher_id,
        "class_name": assignment.class_name,
        "section": assignment.section,
    }


@router.get("/admin/class-assignments", dependencies=[Depends(require_school_feature("teachers"))])
def list_class_assignments(
    admin: Admin = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    rows = (
        db.query(ClassAssignment, Teacher)
        .join(Teacher, Teacher.id == ClassAssignment.teacher_id)
        .filter(ClassAssignment.admin_id == admin.id)
        .order_by(ClassAssignment.class_name, ClassAssignment.section)
        .all()
    )

    return [
        {
            "id": assignment.id,
            "teacher_id": teacher.id,
            "teacher_name": teacher.full_name,
            "username": teacher.username,
            "class_name": assignment.class_name,
            "section": assignment.section,
        }
        for assignment, teacher in rows
    ]



@router.put("/admin/class-assignments/{assignment_id}", dependencies=[Depends(require_school_feature("teachers"))])
def update_class_assignment(
    assignment_id: int,
    request: ClassAssignmentRequest,
    admin: Admin = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    assignment = db.query(ClassAssignment).filter(
        ClassAssignment.id == assignment_id,
        ClassAssignment.admin_id == admin.id,
    ).first()

    if assignment is None:
        raise HTTPException(status_code=404, detail="Assignment not found.")

    teacher = db.query(Teacher).filter(
        Teacher.id == request.teacher_id,
        Teacher.admin_id == admin.id,
    ).first()

    if teacher is None:
        raise HTTPException(status_code=404, detail="Teacher not found.")

    teacher_conflict = db.query(ClassAssignment).filter(
        ClassAssignment.teacher_id == teacher.id,
        ClassAssignment.id != assignment.id,
    ).first()

    if teacher_conflict:
        raise HTTPException(
            status_code=409,
            detail="This teacher already has another class assignment.",
        )

    class_conflict = db.query(ClassAssignment).filter(
        ClassAssignment.admin_id == admin.id,
        ClassAssignment.class_name == request.class_name,
        ClassAssignment.section == request.section,
        ClassAssignment.id != assignment.id,
    ).first()

    if class_conflict:
        raise HTTPException(
            status_code=409,
            detail="This class and section already has a teacher assigned.",
        )

    assignment.teacher_id = teacher.id
    assignment.class_name = request.class_name
    assignment.section = request.section

    try:
        db.commit()
        db.refresh(assignment)
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=409,
            detail="Assignment conflicts with an existing assignment.",
        )

    return {
        "id": assignment.id,
        "teacher_id": assignment.teacher_id,
        "class_name": assignment.class_name,
        "section": assignment.section,
    }

@router.get("/teacher/me")
def teacher_profile(
    teacher: Teacher = Depends(get_current_teacher),
    db: Session = Depends(get_db),
):
    assignment = (
        db.query(ClassAssignment)
        .filter(
            ClassAssignment.teacher_id == teacher.id,
            ClassAssignment.admin_id == teacher.admin_id,
        )
        .first()
    )
    return {
        "id": teacher.id,
        "username": teacher.username,
        "full_name": teacher.full_name,
        "class_name": assignment.class_name if assignment else None,
        "section": assignment.section if assignment else None,
    }


@router.get("/teacher/students", dependencies=[Depends(require_school_feature("students"))])
def teacher_students(
    teacher: Teacher = Depends(get_current_teacher),
    db: Session = Depends(get_db),
):
    assignment = get_assignment(db, teacher)
    students = (
        db.query(Student)
        .filter(
            Student.admin_id == teacher.admin_id,
            Student.class_name == assignment.class_name,
            Student.section == assignment.section,
        )
        .order_by(Student.full_name)
        .all()
    )
    return [safe_student(student) for student in students]


@router.post("/teacher/students", dependencies=[Depends(require_school_feature("students"))], status_code=status.HTTP_403_FORBIDDEN)
def create_student_for_assigned_class(
    request: TeacherStudentCreateRequest,
    teacher: Teacher = Depends(get_current_teacher),
    db: Session = Depends(get_db),
):
    raise HTTPException(
        status_code=status.HTTP_403_FORBIDDEN,
        detail="Only an admin can add students.",
    )

@router.put("/teacher/students/{student_id}", dependencies=[Depends(require_school_feature("students"))], status_code=status.HTTP_403_FORBIDDEN)
def update_student_for_assigned_class(
    student_id: int,
    request: TeacherStudentUpdateRequest,
    teacher: Teacher = Depends(get_current_teacher),
    db: Session = Depends(get_db),
):
    raise HTTPException(
        status_code=status.HTTP_403_FORBIDDEN,
        detail="Only an admin can edit student details.",
    )

@router.get("/teacher/attendance/students", dependencies=[Depends(require_school_feature("attendance"))])
def teacher_attendance_students(
    teacher: Teacher = Depends(get_current_teacher),
    db: Session = Depends(get_db),
):
    assignment = get_assignment(db, teacher)
    students = (
        db.query(Student)
        .filter(
            Student.admin_id == teacher.admin_id,
            Student.class_name == assignment.class_name,
            Student.section == assignment.section,
        )
        .order_by(Student.full_name)
        .all()
    )
    return [
        {
            "id": s.id,
            "registration_number": s.registration_number,
            "full_name": s.full_name,
            "class_name": s.class_name,
            "section": s.section,
        }
        for s in students
    ]


@router.post("/teacher/attendance/mark", dependencies=[Depends(require_school_feature("attendance"))])
def teacher_mark_attendance(
    request: AttendanceMarkRequest,
    teacher: Teacher = Depends(get_current_teacher),
    db: Session = Depends(get_db),
):
    assignment = get_assignment(db, teacher)

    if request.attendance_date > date.today():
        raise HTTPException(
            status_code=400,
            detail="Attendance cannot be marked for a future date."
        )

    student_ids = [r.student_id for r in request.records]

    if len(student_ids) != len(set(student_ids)):
        raise HTTPException(status_code=400, detail="Duplicate student IDs are not allowed.")

    students = (
        db.query(Student)
        .filter(
            Student.id.in_(student_ids),
            Student.admin_id == teacher.admin_id,
            Student.class_name == assignment.class_name,
            Student.section == assignment.section,
        )
        .all()
    )

    if {s.id for s in students} != set(student_ids):
        raise HTTPException(status_code=404, detail="One or more students were not found in your assigned class.")

    try:
        for record in request.records:
            existing = (
                db.query(Attendance)
                .filter(
                    Attendance.student_id == record.student_id,
                    Attendance.attendance_date == request.attendance_date,
                )
                .first()
            )
            if existing:
                existing.status = record.status
            else:
                db.add(Attendance(
                    student_id=record.student_id,
                    attendance_date=request.attendance_date,
                    status=record.status,
                ))
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=409, detail="Attendance conflict. Reload and try again.")

    return {
        "message": "Attendance saved successfully.",
        "attendance_date": request.attendance_date,
        "records_saved": len(request.records),
    }


@router.get("/teacher/attendance/daily", dependencies=[Depends(require_school_feature("attendance"))])
def teacher_daily_attendance(
    attendance_date: date,
    teacher: Teacher = Depends(get_current_teacher),
    db: Session = Depends(get_db),
):
    assignment = get_assignment(db, teacher)
    rows = (
        db.query(Attendance, Student)
        .join(Student, Student.id == Attendance.student_id)
        .filter(
            Student.admin_id == teacher.admin_id,
            Student.class_name == assignment.class_name,
            Student.section == assignment.section,
            Attendance.attendance_date == attendance_date,
        )
        .order_by(Student.full_name)
        .all()
    )
    return [
        {
            "student_id": student.id,
            "registration_number": student.registration_number,
            "full_name": student.full_name,
            "attendance_date": record.attendance_date,
            "status": record.status,
        }
        for record, student in rows
    ]


@router.get("/teacher/attendance/monthly", dependencies=[Depends(require_school_feature("attendance"))])
def teacher_monthly_attendance(
    year: int = Query(ge=2000, le=2100),
    month: int = Query(ge=1, le=12),
    teacher: Teacher = Depends(get_current_teacher),
    db: Session = Depends(get_db),
):
    assignment = get_assignment(db, teacher)
    start_date = date(year, month, 1)
    end_date = date(year, month, monthrange(year, month)[1])

    students = (
        db.query(Student)
        .filter(
            Student.admin_id == teacher.admin_id,
            Student.class_name == assignment.class_name,
            Student.section == assignment.section,
        )
        .order_by(Student.full_name)
        .all()
    )

    report = []
    for student in students:
        records = (
            db.query(Attendance)
            .filter(
                Attendance.student_id == student.id,
                Attendance.attendance_date >= start_date,
                Attendance.attendance_date <= end_date,
            )
            .all()
        )
        present = sum(r.status == "Present" for r in records)
        late = sum(r.status == "Late" for r in records)
        absent = sum(r.status == "Absent" for r in records)
        total = len(records)

        report.append({
            "student_id": student.id,
            "registration_number": student.registration_number,
            "full_name": student.full_name,
            "class_name": student.class_name,
            "section": student.section,
            "month": month,
            "year": year,
            "present_days": present,
            "late_days": late,
            "absent_days": absent,
            "total_recorded_days": total,
            "attendance_percentage": round(((present + late) / total) * 100, 2) if total else 0.0,
        })

    return report
