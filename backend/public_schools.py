# PUBLIC_SCHOOL_WEBSITE_ROUTER_V1
import re

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from dependencies import get_db
from models import Announcement, SchoolGalleryItem, SchoolProfile

router = APIRouter(
    prefix="/public/schools",
    tags=["Public School Websites"],
)


@router.get("/{slug}")
def get_public_school_website(
    slug: str,
    db: Session = Depends(get_db),
):
    normalized_slug = slug.strip().lower()

    # Only accept normalized public slugs.
    if (
        len(normalized_slug) > 100
        or not re.fullmatch(r"[a-z0-9]+(?:-[a-z0-9]+)*", normalized_slug)
    ):
        raise HTTPException(
            status_code=404,
            detail="School website not found.",
        )

    profile = (
        db.query(SchoolProfile)
        .filter(SchoolProfile.slug == normalized_slug)
        .first()
    )

    if profile is None:
        raise HTTPException(
            status_code=404,
            detail="School website not found.",
        )

    # Resolve gallery ownership from the matched school's profile.
    # Never return another school's gallery.
    gallery_items = (
        db.query(SchoolGalleryItem)
        .filter(SchoolGalleryItem.admin_id == profile.admin_id)
        .order_by(SchoolGalleryItem.created_at.desc())
        .all()
    )

    # Public notices belong only to the admin who owns this school profile.
    announcements = (
        db.query(Announcement)
        .filter(Announcement.admin_id == profile.admin_id)
        .order_by(Announcement.created_at.desc(), Announcement.id.desc())
        .all()
    )
    # Explicit public allowlist: no admin ID, account details,
    # credentials, students, fee records, or other private data.
    return {
        "school": {
            "slug": profile.slug,
            "school_name": profile.school_name,
            "tagline": profile.tagline,
            "description": profile.description,
            "address": profile.address,
            "phone": profile.phone,
            "email": profile.email,
            "website": profile.website,
            "logo_url": profile.logo_url,
        },
        "gallery": [
            {
                "image_url": item.image_url,
                "caption": item.caption,
            }
            for item in gallery_items
        ],
        "notices": [
            {
                "id": item.id,
                "title": item.title,
                "message": item.message,
                "created_at": item.created_at,
                "display_date": item.display_date,
            }
            for item in announcements
        ],    }
