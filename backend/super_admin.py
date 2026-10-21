import re
import unicodedata

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.exc import IntegrityError
from sqlalchemy import func
from sqlalchemy.orm import Session

from dependencies import get_db
from models import Admin, SchoolProfile, Student, Teacher
from security import hash_password

from dependencies import get_current_super_admin
from models import SuperAdmin

router = APIRouter(prefix="/super-admin", tags=["Super Admin"])


@router.get("/me")
def read_super_admin_me(
    account: SuperAdmin = Depends(get_current_super_admin),
):
    return {"id": account.id, "username": account.username, "role": "super_admin"}




class CreateSchoolRequest(BaseModel):
    school_name: str = Field(min_length=2, max_length=150)
    admin_username: str = Field(min_length=3, max_length=50)
    admin_password: str = Field(min_length=8, max_length=128)
    address: str = Field(default="", max_length=2000)


@router.post("/schools", status_code=201)
def create_school(
    payload: CreateSchoolRequest,
    account: SuperAdmin = Depends(get_current_super_admin),
    db: Session = Depends(get_db),
):
    """Create a school profile and its independent Admin account."""
    school_name = payload.school_name.strip()
    username = payload.admin_username.strip()

    if len(school_name) < 2:
        raise HTTPException(status_code=422, detail="School name is required.")

    if not re.fullmatch(r"[A-Za-z0-9_.-]{3,50}", username):
        raise HTTPException(
            status_code=422,
            detail="Username must be 3-50 characters: letters, numbers, dot, underscore or hyphen.",
        )

    if db.query(Admin).filter(Admin.username == username).first():
        raise HTTPException(
            status_code=409,
            detail="This Admin username is already in use.",
        )

    normalized = unicodedata.normalize("NFKD", school_name)
    ascii_name = normalized.encode("ascii", "ignore").decode("ascii").lower()
    base_slug = re.sub(r"[^a-z0-9]+", "-", ascii_name).strip("-")
    if not base_slug:
        base_slug = "school"

    try:
        admin = Admin(
            username=username,
            password_hash=hash_password(payload.admin_password),
            is_active=True,
        )
        db.add(admin)
        db.flush()

        slug = base_slug[:100]
        suffix = 2
        while db.query(SchoolProfile.id).filter(SchoolProfile.slug == slug).first():
            tail = f"-{suffix}"
            slug = f"{base_slug[:100-len(tail)]}{tail}"
            suffix += 1

        profile = SchoolProfile(
            admin_id=admin.id,
            school_name=school_name,
            slug=slug,
            address=payload.address.strip(),
        )
        db.add(profile)
        db.commit()
        db.refresh(profile)

        return {
            "message": "School created successfully.",
            "school": {
                "id": profile.id,
                "school_name": profile.school_name,
                "slug": profile.slug,
                "address": profile.address,
                "admin_username": admin.username,
                "admin_active": bool(admin.is_active),
                "student_count": 0,
                "teacher_count": 0,
                "public_website": f"/schools/{profile.slug}",
            },
        }
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=409,
            detail="School or Admin username conflicts with an existing record.",
        )
    except Exception:
        db.rollback()
        raise

@router.get("/schools")
def list_super_admin_schools(
    account: SuperAdmin = Depends(get_current_super_admin),
    db: Session = Depends(get_db),
):
    """List configured school profiles without exposing private student data."""
    profiles = (
        db.query(SchoolProfile, Admin)
        .join(Admin, SchoolProfile.admin_id == Admin.id)
        .order_by(SchoolProfile.school_name.asc(), SchoolProfile.id.asc())
        .all()
    )

    results = []
    for profile, admin in profiles:
        student_count = (
            db.query(func.count(Student.id))
            .filter(Student.admin_id == admin.id)
            .scalar()
        ) or 0

        teacher_count = (
            db.query(func.count(Teacher.id))
            .filter(Teacher.admin_id == admin.id)
            .scalar()
        ) or 0

        results.append({
            "id": profile.id,
            "school_name": profile.school_name or "Unnamed school",
            "slug": profile.slug,
            "address": profile.address or "",
            "tagline": profile.tagline or "",
            "description": profile.description or "",
            "phone": profile.phone or "",
            "email": profile.email or "",
            "website": profile.website or "",
            "admin_username": admin.username,
            "admin_active": bool(admin.is_active),
            "student_count": student_count,
            "teacher_count": teacher_count,
            "public_website": (
                f"/schools/{profile.slug}" if profile.slug else None
            ),
        })

    return {"total": len(results), "schools": results}

class UpdateSchoolDetailsRequest(BaseModel):
    school_name: str = Field(min_length=2, max_length=150)
    address: str = Field(default="", max_length=2000)
    tagline: str = Field(default="", max_length=250)
    description: str = Field(default="", max_length=5000)
    phone: str = Field(default="", max_length=40)
    email: str = Field(default="", max_length=254)
    website: str = Field(default="", max_length=300)


class UpdateAdminUsernameRequest(BaseModel):
    username: str = Field(min_length=3, max_length=50)


class ResetAdminPasswordRequest(BaseModel):
    new_password: str = Field(min_length=8, max_length=128)


class UpdateSchoolStatusRequest(BaseModel):
    is_active: bool


def _get_school_and_admin(db: Session, school_id: int):
    profile = db.get(SchoolProfile, school_id)
    if profile is None:
        raise HTTPException(status_code=404, detail="School not found.")

    admin = db.get(Admin, profile.admin_id)
    if admin is None:
        raise HTTPException(
            status_code=409,
            detail="This school has no linked Admin account.",
        )
    return profile, admin


@router.patch("/schools/{school_id}")
def update_school_details(
    school_id: int,
    payload: UpdateSchoolDetailsRequest,
    account: SuperAdmin = Depends(get_current_super_admin),
    db: Session = Depends(get_db),
):
    """Update school profile details without changing its public slug."""
    profile, admin = _get_school_and_admin(db, school_id)
    school_name = payload.school_name.strip()
    if len(school_name) < 2:
        raise HTTPException(status_code=422, detail="School name must contain at least 2 characters.")

    profile.school_name = school_name
    profile.address = payload.address.strip()
    profile.tagline = payload.tagline.strip()
    profile.description = payload.description.strip()
    profile.phone = payload.phone.strip()
    profile.email = payload.email.strip()
    profile.website = payload.website.strip()

    try:
        db.commit()
        db.refresh(profile)
    except Exception:
        db.rollback()
        raise

    return {
        "message": "School details updated successfully.",
        "school_id": profile.id,
        "school_name": profile.school_name,
        "slug": profile.slug,
        "admin_username": admin.username,
    }


@router.patch("/schools/{school_id}/status")
def update_school_status(
    school_id: int,
    payload: UpdateSchoolStatusRequest,
    account: SuperAdmin = Depends(get_current_super_admin),
    db: Session = Depends(get_db),
):
    """Enable or disable the school's linked Admin account."""
    profile, admin = _get_school_and_admin(db, school_id)
    admin.is_active = payload.is_active

    try:
        db.commit()
    except Exception:
        db.rollback()
        raise

    return {
        "message": "School Admin activated." if admin.is_active else "School Admin deactivated.",
        "school_id": profile.id,
        "is_active": bool(admin.is_active),
        "admin_username": admin.username,
    }


@router.patch("/schools/{school_id}/admin/username")
def update_school_admin_username(
    school_id: int,
    payload: UpdateAdminUsernameRequest,
    account: SuperAdmin = Depends(get_current_super_admin),
    db: Session = Depends(get_db),
):
    """Change the linked Admin username, checking global uniqueness."""
    profile, admin = _get_school_and_admin(db, school_id)
    username = payload.username.strip()

    if not re.fullmatch(r"[A-Za-z0-9_.-]{3,50}", username):
        raise HTTPException(
            status_code=422,
            detail="Username must be 3-50 characters: letters, numbers, dot, underscore or hyphen.",
        )

    duplicate = db.query(Admin).filter(
        Admin.username == username,
        Admin.id != admin.id,
    ).first()
    if duplicate:
        raise HTTPException(status_code=409, detail="This Admin username is already in use.")

    admin.username = username
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=409, detail="This Admin username is already in use.")
    except Exception:
        db.rollback()
        raise

    return {
        "message": "Admin username updated successfully.",
        "school_id": profile.id,
        "admin_username": admin.username,
    }


@router.patch("/schools/{school_id}/admin/password")
def reset_school_admin_password(
    school_id: int,
    payload: ResetAdminPasswordRequest,
    account: SuperAdmin = Depends(get_current_super_admin),
    db: Session = Depends(get_db),
):
    """Reset the linked Admin password using the application's password hasher."""
    profile, admin = _get_school_and_admin(db, school_id)

    if len(payload.new_password) < 8:
        raise HTTPException(status_code=422, detail="Password must contain at least 8 characters.")

    admin.password_hash = hash_password(payload.new_password)
    try:
        db.commit()
    except Exception:
        db.rollback()
        raise

    return {
        "message": "Admin password reset successfully.",
        "school_id": profile.id,
        "admin_username": admin.username,
    }
