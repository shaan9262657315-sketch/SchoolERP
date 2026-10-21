from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from dependencies import get_current_admin, get_db
from models import Admin, Student
from schemas import StudentCreate, StudentResponse
from subscription_access import require_school_feature
from security import hash_password

router = APIRouter(prefix="/admin", tags=["Admin"])


@router.get("/me")
def get_admin_profile(
    current_admin: Admin = Depends(get_current_admin),
):
    return {
        "id": current_admin.id,
        "username": current_admin.username,
        "is_active": current_admin.is_active,
    }


@router.post(
    "/students", dependencies=[Depends(require_school_feature("students"))],
    response_model=StudentResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_student(
    student_data: StudentCreate,
    current_admin: Admin = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    registration_number = student_data.registration_number.strip()

    existing_student = (
        db.query(Student)
        .filter(Student.registration_number == registration_number)
        .first()
    )

    if existing_student:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Registration number already exists.",
        )

    initial_password = student_data.date_of_birth.strftime("%d%m%Y")

    student = Student(
        admin_id=current_admin.id,
        registration_number=registration_number,
        full_name=student_data.full_name,
        date_of_birth=student_data.date_of_birth,
        password_hash=hash_password(initial_password),
        class_name=student_data.class_name,
        section=student_data.section,
        guardian_name=student_data.guardian_name,
    )

    try:
        db.add(student)
        db.commit()
        db.refresh(student)
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Registration number already exists.",
        )

    return student


@router.get("/students", dependencies=[Depends(require_school_feature("students"))], response_model=list[StudentResponse])
def list_students(
    current_admin: Admin = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    return (
        db.query(Student)
        .filter(Student.admin_id == current_admin.id)
        .order_by(Student.id)
        .all()
    )


@router.put("/students/{student_id}", dependencies=[Depends(require_school_feature("students"))], response_model=StudentResponse)
def update_student(
    student_id: int,
    student_data: StudentCreate,
    current_admin: Admin = Depends(get_current_admin),
    db: Session = Depends(get_db),
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

    registration_number = student_data.registration_number.strip()

    duplicate = (
        db.query(Student)
        .filter(
            Student.registration_number == registration_number,
            Student.id != student_id,
        )
        .first()
    )

    if duplicate:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Registration number already exists.",
        )

    student.registration_number = registration_number
    student.full_name = student_data.full_name
    student.date_of_birth = student_data.date_of_birth
    student.class_name = student_data.class_name
    student.section = student_data.section
    student.guardian_name = student_data.guardian_name

    try:
        db.commit()
        db.refresh(student)
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Registration number already exists.",
        )

    return student
