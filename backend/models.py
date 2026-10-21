from datetime import datetime
from datetime import date

from sqlalchemy import Boolean, Date, DateTime, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from database import Base


class Admin(Base):
    __tablename__ = "admins"

    id: Mapped[int] = mapped_column(
        Integer,
        primary_key=True,
        index=True,
    )

    username: Mapped[str] = mapped_column(
        String(50),
        unique=True,
        index=True,
        nullable=False,
    )

    password_hash: Mapped[str] = mapped_column(
        String(255),
        nullable=False,
    )

    is_active: Mapped[bool] = mapped_column(
        Boolean,
        default=True,
        nullable=False,
    )

    students: Mapped[list["Student"]] = relationship(
        back_populates="admin",
    )


class Student(Base):
    __tablename__ = "students"

    id: Mapped[int] = mapped_column(
        Integer,
        primary_key=True,
        index=True,
    )

    admin_id: Mapped[int | None] = mapped_column(
        ForeignKey("admins.id"),
        nullable=True,
        index=True,
    )

    admin: Mapped["Admin | None"] = relationship(
        back_populates="students",
    )

    registration_number: Mapped[str] = mapped_column(
        String(30),
        unique=True,
        index=True,
        nullable=False,
    )

    full_name: Mapped[str] = mapped_column(
        String(100),
        nullable=False,
    )

    date_of_birth: Mapped[date] = mapped_column(
        Date,
        nullable=False,
    )

    password_hash: Mapped[str] = mapped_column(
        String(255),
        nullable=False,
    )

    class_name: Mapped[str] = mapped_column(
        String(30),
        nullable=False,
    )

    section: Mapped[str] = mapped_column(
        String(1),
        nullable=False,
        default="A",
        server_default="A",
    )

    guardian_name: Mapped[str] = mapped_column(
        String(100),
        nullable=False,
    )


class Attendance(Base):
    __tablename__ = "attendance"
    __table_args__ = (
        UniqueConstraint(
            "student_id",
            "attendance_date",
            name="uq_attendance_student_date",
        ),
    )

    id: Mapped[int] = mapped_column(
        Integer,
        primary_key=True,
        index=True,
    )

    student_id: Mapped[int] = mapped_column(
        ForeignKey("students.id"),
        nullable=False,
        index=True,
    )

    attendance_date: Mapped[date] = mapped_column(
        Date,
        nullable=False,
        index=True,
    )

    status: Mapped[str] = mapped_column(
        String(10),
        nullable=False,
    )

class Teacher(Base):
    __tablename__ = "teachers"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    admin_id: Mapped[int] = mapped_column(ForeignKey("admins.id"), nullable=False, index=True)
    username: Mapped[str] = mapped_column(String(50), unique=True, nullable=False, index=True)
    full_name: Mapped[str] = mapped_column(String(100), nullable=False)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)


class ClassAssignment(Base):
    __tablename__ = "class_assignments"
    __table_args__ = (
        UniqueConstraint("teacher_id", name="uq_class_assignment_teacher"),
        UniqueConstraint("admin_id", "class_name", "section", name="uq_class_assignment_class_section"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    admin_id: Mapped[int] = mapped_column(ForeignKey("admins.id"), nullable=False, index=True)
    teacher_id: Mapped[int] = mapped_column(ForeignKey("teachers.id"), nullable=False, unique=True)
    class_name: Mapped[str] = mapped_column(String(30), nullable=False)
    section: Mapped[str] = mapped_column(String(1), nullable=False, default="A")

from sqlalchemy import Numeric, DateTime, Date

class FeeStructure(Base):
    __tablename__ = "fee_structures"
    __table_args__ = (
        UniqueConstraint(
            "admin_id",
            "academic_year",
            "class_name",
            "section",
            "fee_type",
            name="uq_fee_structure_admin_year_class_section_type",
        ),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    admin_id: Mapped[int] = mapped_column(ForeignKey("admins.id"), nullable=False, index=True)
    academic_year: Mapped[str] = mapped_column(String(20), nullable=False, index=True)
    class_name: Mapped[str] = mapped_column(String(30), nullable=False, index=True)
    section: Mapped[str] = mapped_column(String(1), nullable=False, default="A")
    fee_type: Mapped[str] = mapped_column(String(30), nullable=False)
    amount: Mapped[float] = mapped_column(Numeric(10, 2), nullable=False)
    frequency: Mapped[str] = mapped_column(String(20), nullable=False, default="monthly")
    description: Mapped[str | None] = mapped_column(String(255), nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

class StudentFeeLedger(Base):
    __tablename__ = "student_fee_ledgers"
    __table_args__ = (
        UniqueConstraint(
            "student_id",
            "academic_year",
            "fee_type",
            "period",
            name="uq_student_fee_ledger_period",
        ),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    admin_id: Mapped[int] = mapped_column(ForeignKey("admins.id"), nullable=False, index=True)
    student_id: Mapped[int] = mapped_column(ForeignKey("students.id"), nullable=False, index=True)
    fee_structure_id: Mapped[int | None] = mapped_column(ForeignKey("fee_structures.id"), nullable=True)
    academic_year: Mapped[str] = mapped_column(String(20), nullable=False, index=True)
    fee_type: Mapped[str] = mapped_column(String(30), nullable=False)
    period: Mapped[str] = mapped_column(String(30), nullable=False, default="one_time")
    amount_due: Mapped[float] = mapped_column(Numeric(10, 2), nullable=False)
    amount_paid: Mapped[float] = mapped_column(Numeric(10, 2), nullable=False, default=0)
    due_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)


class FeePayment(Base):
    __tablename__ = "fee_payments"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    admin_id: Mapped[int] = mapped_column(ForeignKey("admins.id"), nullable=False, index=True)
    student_id: Mapped[int] = mapped_column(ForeignKey("students.id"), nullable=False, index=True)
    ledger_id: Mapped[int] = mapped_column(ForeignKey("student_fee_ledgers.id"), nullable=False, index=True)
    amount: Mapped[float] = mapped_column(Numeric(10, 2), nullable=False)
    payment_method: Mapped[str] = mapped_column(String(30), nullable=False, default="online")
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="created", index=True)
    gateway_order_id: Mapped[str | None] = mapped_column(String(100), nullable=True, unique=True)
    gateway_payment_id: Mapped[str | None] = mapped_column(String(100), nullable=True, unique=True)
    receipt_number: Mapped[str | None] = mapped_column(String(50), nullable=True, unique=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)
    paid_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)



class Announcement(Base):
    __tablename__ = "announcements"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    admin_id: Mapped[int] = mapped_column(ForeignKey("admins.id"), nullable=False, index=True)
    title: Mapped[str] = mapped_column(String(150), nullable=False)
    message: Mapped[str] = mapped_column(String(5000), nullable=False)
    created_at: Mapped[datetime] = mapped_column(default=datetime.utcnow, nullable=False)
    display_date: Mapped[date | None] = mapped_column(Date, nullable=True)


class Homework(Base):
    __tablename__ = "homeworks"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    admin_id: Mapped[int] = mapped_column(ForeignKey("admins.id"), nullable=False, index=True)
    teacher_id: Mapped[int] = mapped_column(ForeignKey("teachers.id"), nullable=False, index=True)
    class_name: Mapped[str] = mapped_column(String(30), nullable=False, index=True)
    section: Mapped[str] = mapped_column(String(1), nullable=False)
    subject: Mapped[str] = mapped_column(String(80), nullable=False)
    title: Mapped[str] = mapped_column(String(150), nullable=False)
    description: Mapped[str] = mapped_column(String(5000), nullable=False)
    assigned_date: Mapped[date] = mapped_column(Date, nullable=False)
    due_date: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

from sqlalchemy import Float

# ==================== RESULTS MODULE ====================

class Exam(Base):
    __tablename__ = "exams"
    __table_args__ = (
        UniqueConstraint("admin_id", "name", "academic_year", "exam_date", name="uq_exam_school_name_year_date"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    admin_id: Mapped[int] = mapped_column(ForeignKey("admins.id"), nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    academic_year: Mapped[str] = mapped_column(String(20), nullable=False)
    exam_date: Mapped[date] = mapped_column(Date, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)


class ExamClass(Base):
    __tablename__ = "exam_classes"
    __table_args__ = (
        UniqueConstraint("exam_id", "class_name", "section", name="uq_exam_class_section"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    exam_id: Mapped[int] = mapped_column(ForeignKey("exams.id"), nullable=False, index=True)
    admin_id: Mapped[int] = mapped_column(ForeignKey("admins.id"), nullable=False, index=True)
    teacher_id: Mapped[int] = mapped_column(ForeignKey("teachers.id"), nullable=False, index=True)
    class_name: Mapped[str] = mapped_column(String(30), nullable=False, index=True)
    section: Mapped[str] = mapped_column(String(1), nullable=False)
    status: Mapped[str] = mapped_column(String(20), default="draft", nullable=False, index=True)
    published_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)


class ExamSubject(Base):
    __tablename__ = "exam_subjects"
    __table_args__ = (
        UniqueConstraint("exam_class_id", "subject_name", name="uq_exam_subject_name"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    exam_class_id: Mapped[int] = mapped_column(ForeignKey("exam_classes.id"), nullable=False, index=True)
    subject_name: Mapped[str] = mapped_column(String(100), nullable=False)
    max_marks: Mapped[float] = mapped_column(Float, nullable=False)


class StudentMark(Base):
    __tablename__ = "student_marks"
    __table_args__ = (
        UniqueConstraint("exam_subject_id", "student_id", name="uq_student_exam_subject_mark"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    exam_subject_id: Mapped[int] = mapped_column(ForeignKey("exam_subjects.id"), nullable=False, index=True)
    student_id: Mapped[int] = mapped_column(ForeignKey("students.id"), nullable=False, index=True)
    obtained_marks: Mapped[float] = mapped_column(Float, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)



class SchoolProfile(Base):
    __tablename__ = "school_profiles"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    admin_id: Mapped[int] = mapped_column(
        ForeignKey("admins.id"), unique=True, nullable=False, index=True
    )
    slug: Mapped[str | None] = mapped_column(
        String(100), unique=True, index=True, nullable=True
    )
    school_name: Mapped[str] = mapped_column(String(150), default="", nullable=False)
    tagline: Mapped[str] = mapped_column(String(250), default="", nullable=False)
    description: Mapped[str] = mapped_column(Text, default="", nullable=False)
    address: Mapped[str] = mapped_column(Text, default="", nullable=False)
    phone: Mapped[str] = mapped_column(String(40), default="", nullable=False)
    email: Mapped[str] = mapped_column(String(254), default="", nullable=False)
    website: Mapped[str] = mapped_column(String(300), default="", nullable=False)
    logo_url: Mapped[str] = mapped_column(String(500), default="", nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False
    )


class SchoolGalleryItem(Base):
    __tablename__ = "school_gallery_items"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    admin_id: Mapped[int] = mapped_column(
        ForeignKey("admins.id"), nullable=False, index=True
    )
    image_url: Mapped[str] = mapped_column(String(500), nullable=False)
    caption: Mapped[str] = mapped_column(String(300), default="", nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, nullable=False
    )


class SuperAdmin(Base):
    __tablename__ = "super_admins"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    username: Mapped[str] = mapped_column(
        String(50), unique=True, index=True, nullable=False
    )
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    is_active: Mapped[bool] = mapped_column(
        Boolean, default=True, nullable=False
    )
