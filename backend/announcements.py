from datetime import date
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session
from models import Admin, Student, Announcement
from subscription_access import require_school_feature
from dependencies import get_current_admin, get_current_student, get_db

router = APIRouter(prefix="/announcements", tags=["Announcements"])

class AnnouncementCreate(BaseModel):
    title: str = Field(min_length=3, max_length=150)
    message: str = Field(min_length=1, max_length=5000)
    display_date: date | None = None

class AnnouncementUpdate(BaseModel):
    title: str = Field(min_length=3, max_length=150)
    message: str = Field(min_length=1, max_length=5000)
    display_date: date | None = None

@router.get("/student")
def student_announcements(
    current_student: Student = Depends(get_current_student),
    db: Session = Depends(get_db),
):
    if current_student.admin_id is None:
        return []
    return (
        db.query(Announcement)
        .filter(Announcement.admin_id == current_student.admin_id)
        .order_by(Announcement.created_at.desc(), Announcement.id.desc())
        .all()
    )

@router.get("/admin", dependencies=[Depends(require_school_feature("announcements"))])
def admin_announcements(
    current_admin: Admin = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    return (
        db.query(Announcement)
        .filter(Announcement.admin_id == current_admin.id)
        .order_by(Announcement.created_at.desc(), Announcement.id.desc())
        .all()
    )

@router.post("/", dependencies=[Depends(require_school_feature("announcements"))], status_code=status.HTTP_201_CREATED)
def create_announcement(
    payload: AnnouncementCreate,
    current_admin: Admin = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    item = Announcement(
        admin_id=current_admin.id,
        title=payload.title.strip(),
        message=payload.message.strip(),
        display_date=payload.display_date,
    )
    if not item.title or not item.message:
        raise HTTPException(status_code=422, detail="Title and message are required.")
    db.add(item)
    db.commit()
    db.refresh(item)
    return item


@router.put("/{announcement_id}", dependencies=[Depends(require_school_feature("announcements"))])
def update_announcement(
    announcement_id: int,
    payload: AnnouncementUpdate,
    current_admin: Admin = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    item = db.query(Announcement).filter(
        Announcement.id == announcement_id,
        Announcement.admin_id == current_admin.id,
    ).first()
    if item is None:
        raise HTTPException(status_code=404, detail="Announcement not found.")
    title = payload.title.strip()
    message = payload.message.strip()
    if not title or not message:
        raise HTTPException(status_code=422, detail="Title and message are required.")
    item.title = title
    item.message = message
    item.display_date = payload.display_date
    db.commit()
    db.refresh(item)
    return item

@router.delete("/{announcement_id}", dependencies=[Depends(require_school_feature("announcements"))], status_code=status.HTTP_204_NO_CONTENT)
def delete_announcement(
    announcement_id: int,
    current_admin: Admin = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    item = db.query(Announcement).filter(
        Announcement.id == announcement_id,
        Announcement.admin_id == current_admin.id,
    ).first()
    if item is None:
        raise HTTPException(status_code=404, detail="Announcement not found.")
    db.delete(item)
    db.commit()
