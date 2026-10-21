import config_env
import os
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pathlib import Path

from admin import router as admin_router
from auth import router as auth_router
from super_admin_auth import router as super_admin_auth_router
from super_admin import router as super_admin_router
from platform_management import router as platform_management_router, initialize_platform_management
from attendance import router as attendance_router
from student import router as student_router
from teacher_access import router as teacher_access_router
from fees import router as fees_router
from announcements import router as announcements_router
from homework import router as homework_router
from results import router as results_router
from school_profile import router as school_profile_router
from public_schools import router as public_school_router

GALLERY_UPLOAD_DIR = Path(
    os.getenv(
        "SCHOOL_UPLOAD_DIR",
        str(Path(__file__).resolve().parent / "uploads" / "school_gallery"),
    )
).resolve()
GALLERY_UPLOAD_DIR.mkdir(parents=True, exist_ok=True)

app = FastAPI(
    title="School ERP API",
    description="School Management System Backend",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        origin.strip().rstrip("/")
        for origin in (
            os.getenv("CORS_ORIGINS", "").strip()
            or "http://localhost:5173,http://127.0.0.1:5173,http://localhost:5174,http://127.0.0.1:5174,http://localhost:5175,http://127.0.0.1:5175"
        ).split(",")
        if origin.strip()
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth_router)
app.include_router(super_admin_auth_router)
app.include_router(super_admin_router)
app.include_router(platform_management_router)
app.include_router(attendance_router)


@app.on_event("startup")
def create_super_admin_table_safely():
    from models import SuperAdmin
    SuperAdmin.__table__.create(bind=engine, checkfirst=True)

app.include_router(admin_router)
app.include_router(student_router)
app.include_router(teacher_access_router)
app.include_router(fees_router)
app.include_router(announcements_router)
app.include_router(homework_router)
app.include_router(results_router)
app.include_router(school_profile_router)
app.include_router(public_school_router)
app.mount("/school-gallery-files", StaticFiles(directory=str(GALLERY_UPLOAD_DIR)), name="school-gallery-files")


@app.get("/")
def home():
    return {
        "message": "School ERP Backend is running!",
        "status": "success",
    }


@app.get("/health")
def health_check():
    return {
        "status": "healthy",
        "service": "School ERP API",
    }

from database import engine
from models import FeeStructure, StudentFeeLedger, FeePayment, Announcement, Homework

@app.on_event("startup")
def initialize_fee_tables():
    FeeStructure.__table__.create(bind=engine, checkfirst=True)
    StudentFeeLedger.__table__.create(bind=engine, checkfirst=True)
    FeePayment.__table__.create(bind=engine, checkfirst=True)
    Announcement.__table__.create(bind=engine, checkfirst=True)
    Homework.__table__.create(bind=engine, checkfirst=True)







from models import Exam, ExamClass, ExamSubject, StudentMark

@app.on_event("startup")
def initialize_results_tables():
    Exam.__table__.create(bind=engine, checkfirst=True)
    ExamClass.__table__.create(bind=engine, checkfirst=True)
    ExamSubject.__table__.create(bind=engine, checkfirst=True)
    StudentMark.__table__.create(bind=engine, checkfirst=True)



from models import SchoolProfile, SchoolGalleryItem

@app.on_event("startup")
def initialize_school_profile_tables():
    SchoolProfile.__table__.create(bind=engine, checkfirst=True)
    SchoolGalleryItem.__table__.create(bind=engine, checkfirst=True)

# Safe, repeatable migration for manually selected public announcement dates.
from sqlalchemy import inspect, text

@app.on_event("startup")
def migrate_announcement_display_date():
    with engine.begin() as connection:
        columns = {
            column["name"]
            for column in inspect(connection).get_columns("announcements")
        }
        if "display_date" not in columns:
            connection.execute(
                text("ALTER TABLE announcements ADD COLUMN display_date DATE")
            )



@app.on_event("startup")
def initialize_platform_management_safely():
    initialize_platform_management()
