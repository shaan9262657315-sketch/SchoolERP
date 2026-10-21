import os
from datetime import datetime, timedelta, timezone

import jwt
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from dependencies import get_db
from models import Admin, Student
from schemas import AdminLogin, StudentLogin
from security import verify_password

router = APIRouter(prefix="/auth", tags=["Authentication"])

JWT_SECRET_KEY = os.getenv("JWT_SECRET_KEY")
JWT_ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 30


def create_access_token(user_id: int, role: str) -> str:
    if not JWT_SECRET_KEY:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Authentication is not configured.",
        )

    now = datetime.now(timezone.utc)

    return jwt.encode(
        {
            "sub": str(user_id),
            "role": role,
            "iat": now,
            "exp": now + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES),
        },
        JWT_SECRET_KEY,
        algorithm=JWT_ALGORITHM,
    )


@router.post("/student/login")
def student_login(
    credentials: StudentLogin,
    db: Session = Depends(get_db),
):
    student = (
        db.query(Student)
        .filter(
            Student.registration_number == credentials.registration_number
        )
        .first()
    )

    invalid_credentials = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Invalid registration number, date of birth, or password.",
        headers={"WWW-Authenticate": "Bearer"},
    )

    if student is None:
        raise invalid_credentials

    if student.date_of_birth != credentials.date_of_birth:
        raise invalid_credentials

    if not verify_password(credentials.password, student.password_hash):
        raise invalid_credentials

    token = create_access_token(student.id, "student")

    return {
        "access_token": token,
        "token_type": "bearer",
        "expires_in": ACCESS_TOKEN_EXPIRE_MINUTES * 60,
        "student": {
            "id": student.id,
            "registration_number": student.registration_number,
            "full_name": student.full_name,
            "class_name": student.class_name,
        },
    }


@router.post("/admin/login")
def admin_login(
    credentials: AdminLogin,
    db: Session = Depends(get_db),
):
    invalid_credentials = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Invalid username or password.",
        headers={"WWW-Authenticate": "Bearer"},
    )

    admin = (
        db.query(Admin)
        .filter(Admin.username == credentials.username)
        .first()
    )

    if admin is None:
        raise invalid_credentials

    if not admin.is_active:
        raise invalid_credentials

    if not verify_password(credentials.password, admin.password_hash):
        raise invalid_credentials

    token = create_access_token(admin.id, "admin")

    return {
        "access_token": token,
        "token_type": "bearer",
        "expires_in": ACCESS_TOKEN_EXPIRE_MINUTES * 60,
        "admin": {
            "id": admin.id,
            "username": admin.username,
        },
    }
