import os
import uuid
from pathlib import Path

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from dependencies import get_current_admin, get_db
from subscription_access import require_school_feature
from models import Admin, SchoolGalleryItem, SchoolProfile

router = APIRouter(prefix="/school-profile", tags=["School Profile"])

UPLOAD_DIR = Path(
    os.getenv(
        "SCHOOL_UPLOAD_DIR",
        str(Path(__file__).resolve().parent / "uploads" / "school_gallery"),
    )
).resolve()
MAX_IMAGE_BYTES = 5 * 1024 * 1024
MIME_EXTENSIONS = {
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp",
    "image/gif": ".gif",
}
IMAGE_SIGNATURES = {
    "image/jpeg": lambda b: b.startswith(b"\xff\xd8\xff"),
    "image/png": lambda b: b.startswith(b"\x89PNG\r\n\x1a\n"),
    "image/webp": lambda b: len(b) >= 12 and b[:4] == b"RIFF" and b[8:12] == b"WEBP",
    "image/gif": lambda b: b.startswith((b"GIF87a", b"GIF89a")),
}


class SchoolProfileUpdate(BaseModel):
    school_name: str = Field(default="", max_length=150)
    tagline: str = Field(default="", max_length=250)
    description: str = Field(default="", max_length=5000)
    address: str = Field(default="", max_length=2000)
    phone: str = Field(default="", max_length=40)
    email: str = Field(default="", max_length=254)
    website: str = Field(default="", max_length=300)
    logo_url: str = Field(default="", max_length=500)


def profile_response(profile):
    if profile is None:
        return {
            "id": None, "school_name": "", "tagline": "", "description": "",
            "address": "", "phone": "", "email": "", "website": "",
            "logo_url": "", "updated_at": None,
        }
    return {
        "id": profile.id,
        "school_name": profile.school_name,
        "tagline": profile.tagline,
        "description": profile.description,
        "address": profile.address,
        "phone": profile.phone,
        "email": profile.email,
        "website": profile.website,
        "logo_url": profile.logo_url,
        "updated_at": profile.updated_at,
    }


@router.get("/me", dependencies=[Depends(require_school_feature("school_profile"))])
def get_school_profile(
    current_admin: Admin = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    profile = db.query(SchoolProfile).filter(
        SchoolProfile.admin_id == current_admin.id
    ).first()
    return profile_response(profile)


@router.put("/me", dependencies=[Depends(require_school_feature("school_profile"))])
def save_school_profile(
    payload: SchoolProfileUpdate,
    current_admin: Admin = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    profile = db.query(SchoolProfile).filter(
        SchoolProfile.admin_id == current_admin.id
    ).first()
    if profile is None:
        profile = SchoolProfile(admin_id=current_admin.id)
        db.add(profile)

    for field, value in payload.model_dump().items():
        setattr(profile, field, value.strip())

    db.commit()
    db.refresh(profile)
    return profile_response(profile)


@router.get("/gallery", dependencies=[Depends(require_school_feature("school_profile"))])
def list_gallery(
    current_admin: Admin = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    items = db.query(SchoolGalleryItem).filter(
        SchoolGalleryItem.admin_id == current_admin.id
    ).order_by(SchoolGalleryItem.created_at.desc()).all()
    return [
        {
            "id": item.id,
            "image_url": item.image_url,
            "caption": item.caption,
            "created_at": item.created_at,
        }
        for item in items
    ]


@router.post("/gallery", dependencies=[Depends(require_school_feature("school_profile"))], status_code=status.HTTP_201_CREATED)
async def upload_gallery_image(
    file: UploadFile = File(...),
    caption: str = Form(default="", max_length=300),
    current_admin: Admin = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    mime_type = (file.content_type or "").lower()
    if mime_type not in MIME_EXTENSIONS:
        raise HTTPException(status_code=415, detail="Upload a JPEG, PNG, WEBP, or GIF image.")

    content = await file.read(MAX_IMAGE_BYTES + 1)
    if len(content) > MAX_IMAGE_BYTES:
        raise HTTPException(status_code=413, detail="Image must be 5 MB or smaller.")

    if not IMAGE_SIGNATURES[mime_type](content):
        raise HTTPException(status_code=415, detail="Image contents do not match the file type.")

    UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
    filename = f"{uuid.uuid4().hex}{MIME_EXTENSIONS[mime_type]}"
    destination = UPLOAD_DIR / filename
    destination.write_bytes(content)

    item = SchoolGalleryItem(
        admin_id=current_admin.id,
        image_url=f"/school-gallery-files/{filename}",
        caption=caption.strip(),
    )
    try:
        db.add(item)
        db.commit()
        db.refresh(item)
    except Exception:
        db.rollback()
        destination.unlink(missing_ok=True)
        raise
    finally:
        await file.close()

    return {
        "id": item.id,
        "image_url": item.image_url,
        "caption": item.caption,
        "created_at": item.created_at,
    }


@router.delete("/gallery/{item_id}", dependencies=[Depends(require_school_feature("school_profile"))])
def delete_gallery_image(
    item_id: int,
    current_admin: Admin = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    item = db.query(SchoolGalleryItem).filter(
        SchoolGalleryItem.id == item_id,
        SchoolGalleryItem.admin_id == current_admin.id,
    ).first()
    if item is None:
        raise HTTPException(status_code=404, detail="Gallery image not found.")

    filename = Path(item.image_url).name
    db.delete(item)
    db.commit()

    # Only remove files inside this module's upload directory.
    destination = UPLOAD_DIR / filename
    if destination.parent.resolve() == UPLOAD_DIR.resolve():
        destination.unlink(missing_ok=True)

    return {"message": "Gallery image deleted."}