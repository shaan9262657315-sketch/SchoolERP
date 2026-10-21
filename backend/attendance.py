from calendar import monthrange
from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, ConfigDict, Field, field_validator
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from dependencies import get_current_admin, get_db
from subscription_access import require_school_feature
from models import Admin, Attendance, Student

router = APIRouter(prefix="/attendance", tags=["Attendance"])


class AttendanceMarkItem(BaseModel):
    student_id: int = Field(gt=0)
    status: str

    @field_validator("status")
    @classmethod
    def validate_status(cls, value: str) -> str:
        normalized = value.strip().title()
        if normalized not in {"Present", "Absent", "Late"}:
            raise ValueError("Status must be Present, Absent, or Late.")
        return normalized


class AttendanceMarkRequest(BaseModel):
    attendance_date: date
    records: list[AttendanceMarkItem] = Field(min_length=1)


class AttendanceRecordResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    student_id: int
    attendance_date: date
    status: str


@router.get("/students", dependencies=[Depends(require_school_feature("attendance"))])
def get_attendance_students(
    class_name: str = Query(min_length=1, max_length=30),
    section: str = Query(pattern="^[ABCabc]$"),
    db: Session = Depends(get_db),
    current_admin: Admin = Depends(get_current_admin),
):
    students = (
        db.query(Student)
        .filter(
            Student.admin_id == current_admin.id,
            Student.class_name == class_name.strip(),
            Student.section == section.upper(),
        )
        .order_by(Student.full_name)
        .all()
    )

    return [
        {
            "id": student.id,
            "registration_number": student.registration_number,
            "full_name": student.full_name,
            "class_name": student.class_name,
            "section": student.section,
        }
        for student in students
    ]


@router.post("/mark", dependencies=[Depends(require_school_feature("attendance"))], status_code=status.HTTP_200_OK)
def mark_attendance(
    request: AttendanceMarkRequest,
    db: Session = Depends(get_db),
    current_admin: Admin = Depends(get_current_admin),
):
    student_ids = [record.student_id for record in request.records]

    if len(student_ids) != len(set(student_ids)):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Duplicate student IDs are not allowed in one request.",
        )

    # Only students owned by the authenticated admin are eligible.
    students = (
        db.query(Student)
        .filter(
            Student.id.in_(student_ids),
            Student.admin_id == current_admin.id,
        )
        .all()
    )
    found_ids = {student.id for student in students}

    if found_ids != set(student_ids):
        # Do not disclose whether another admin owns a supplied student ID.
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="One or more students were not found.",
        )

    normalized_records = [
        (record.student_id, record.status.strip().title())
        for record in request.records
    ]

    try:
        saved_count = 0

        for student_id, normalized_status in normalized_records:
            existing = (
                db.query(Attendance)
                .filter(
                    Attendance.student_id == student_id,
                    Attendance.attendance_date == request.attendance_date,
                )
                .first()
            )

            if existing:
                existing.status = normalized_status
            else:
                db.add(
                    Attendance(
                        student_id=student_id,
                        attendance_date=request.attendance_date,
                        status=normalized_status,
                    )
                )

            saved_count += 1

        db.commit()

    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                "Attendance could not be saved because of a conflicting "
                "record. Please reload and try again."
            ),
        )

    return {
        "message": "Attendance saved successfully.",
        "attendance_date": request.attendance_date,
        "records_saved": saved_count,
    }


@router.get("/daily", dependencies=[Depends(require_school_feature("attendance"))], response_model=list[AttendanceRecordResponse])
def get_daily_attendance(
    attendance_date: date,
    class_name: str = Query(min_length=1, max_length=30),
    section: str = Query(pattern="^[ABCabc]$"),
    db: Session = Depends(get_db),
    current_admin: Admin = Depends(get_current_admin),
):
    return (
        db.query(Attendance)
        .join(Student, Attendance.student_id == Student.id)
        .filter(
            Student.admin_id == current_admin.id,
            Attendance.attendance_date == attendance_date,
            Student.class_name == class_name.strip(),
            Student.section == section.upper(),
        )
        .order_by(Student.full_name)
        .all()
    )


@router.get(
    "/student/{student_id}", dependencies=[Depends(require_school_feature("attendance"))],
    response_model=list[AttendanceRecordResponse],
)
def get_student_attendance(
    student_id: int,
    db: Session = Depends(get_db),
    current_admin: Admin = Depends(get_current_admin),
):
    student = (
        db.query(Student)
        .filter(
            Student.id == student_id,
            Student.admin_id == current_admin.id,
        )
        .first()
    )

    if student is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Student not found.",
        )

    return (
        db.query(Attendance)
        .filter(Attendance.student_id == student.id)
        .order_by(Attendance.attendance_date.desc())
        .all()
    )


@router.get("/monthly", dependencies=[Depends(require_school_feature("attendance"))])
def get_monthly_attendance(
    year: int = Query(ge=2000, le=2100),
    month: int = Query(ge=1, le=12),
    class_name: str = Query(min_length=1, max_length=30),
    section: str = Query(pattern="^[ABCabc]$"),
    db: Session = Depends(get_db),
    current_admin: Admin = Depends(get_current_admin),
):
    start_date = date(year, month, 1)
    end_date = date(year, month, monthrange(year, month)[1])

    students = (
        db.query(Student)
        .filter(
            Student.admin_id == current_admin.id,
            Student.class_name == class_name.strip(),
            Student.section == section.upper(),
        )
        .order_by(Student.full_name)
        .all()
    )

    if not students:
        return []

    student_ids = [student.id for student in students]

    records = (
        db.query(Attendance)
        .filter(
            Attendance.student_id.in_(student_ids),
            Attendance.attendance_date >= start_date,
            Attendance.attendance_date <= end_date,
        )
        .all()
    )

    summary_by_student = {}

    for record in records:
        summary = summary_by_student.setdefault(
            record.student_id,
            {"present": 0, "late": 0, "absent": 0, "total": 0},
        )

        summary["total"] += 1

        if record.status == "Present":
            summary["present"] += 1
        elif record.status == "Late":
            summary["late"] += 1
        elif record.status == "Absent":
            summary["absent"] += 1

    report = []

    for student in students:
        summary = summary_by_student.get(
            student.id,
            {"present": 0, "late": 0, "absent": 0, "total": 0},
        )

        attended = summary["present"] + summary["late"]
        total = summary["total"]
        percentage = round((attended / total) * 100, 2) if total else 0.0

        report.append({
            "student_id": student.id,
            "registration_number": student.registration_number,
            "full_name": student.full_name,
            "class_name": student.class_name,
            "section": student.section,
            "month": month,
            "year": year,
            "present_days": summary["present"],
            "late_days": summary["late"],
            "absent_days": summary["absent"],
            "total_recorded_days": total,
            "attendance_percentage": percentage,
        })

    return report
