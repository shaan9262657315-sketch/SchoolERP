import re
from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, ConfigDict, Field, field_validator
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from dependencies import get_current_admin, get_current_student, get_db
from models import Admin, FeeStructure, Student, StudentFeeLedger
from schemas import VALID_CLASSES, VALID_SECTIONS

from subscription_access import require_school_feature
router = APIRouter(prefix="/fees/structures", tags=["Fee Structure"])

VALID_FEE_TYPES = {
    "monthly_tuition",
    "annual",
    "exam",
    "admission",
    "extra",
    "transport",
    "hostel",
    "library",
}

VALID_FREQUENCIES = {"monthly", "quarterly", "half_yearly", "yearly", "one_time"}

def validate_billing_period(period: str, frequency: str) -> str:
    period = period.strip()
    if not period:
        raise HTTPException(status_code=400, detail="Billing period cannot be blank.")

    if frequency == "monthly" and not re.fullmatch(r"\d{4}-(0[1-9]|1[0-2])", period):
        raise HTTPException(
            status_code=400,
            detail="Monthly fees require a period in YYYY-MM format, for example 2026-10.",
        )
    return period



class FeeStructureCreate(BaseModel):
    academic_year: str = Field(min_length=9, max_length=20)
    class_name: str = Field(min_length=1, max_length=30)
    section: str = Field(default="A", min_length=1, max_length=1)
    fee_type: str = Field(min_length=1, max_length=30)
    amount: Decimal = Field(gt=0, max_digits=10, decimal_places=2)
    frequency: str = Field(default="monthly", min_length=1, max_length=20)
    description: str | None = Field(default=None, max_length=255)

    @field_validator("academic_year")
    @classmethod
    def validate_academic_year(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("Academic year cannot be blank.")
        return value

    @field_validator("class_name")
    @classmethod
    def validate_class(cls, value: str) -> str:
        value = value.strip()
        normalized = {"nursery": "Nursery", "lkg": "LKG", "ukg": "UKG"}.get(value.lower(), value)
        if normalized not in VALID_CLASSES:
            raise ValueError("Invalid class.")
        return normalized

    @field_validator("section")
    @classmethod
    def validate_section(cls, value: str) -> str:
        value = value.strip().upper()
        if value not in VALID_SECTIONS:
            raise ValueError("Section must be A, B, or C.")
        return value

    @field_validator("fee_type")
    @classmethod
    def validate_fee_type(cls, value: str) -> str:
        value = value.strip().lower()
        if value not in VALID_FEE_TYPES:
            raise ValueError("Invalid fee type.")
        return value

    @field_validator("frequency")
    @classmethod
    def validate_frequency(cls, value: str) -> str:
        value = value.strip().lower()
        if value not in VALID_FREQUENCIES:
            raise ValueError("Invalid fee frequency.")
        return value

    @field_validator("description")
    @classmethod
    def clean_description(cls, value: str | None) -> str | None:
        if value is None:
            return None
        value = value.strip()
        return value or None


class FeeStructureResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    admin_id: int
    academic_year: str
    class_name: str
    section: str
    fee_type: str
    amount: Decimal
    frequency: str
    description: str | None
    is_active: bool


@router.post("", dependencies=[Depends(require_school_feature("fees"))], response_model=FeeStructureResponse, status_code=status.HTTP_201_CREATED)
def create_fee_structure(
    data: FeeStructureCreate,
    current_admin: Admin = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    fee = FeeStructure(
        admin_id=current_admin.id,
        academic_year=data.academic_year,
        class_name=data.class_name,
        section=data.section,
        fee_type=data.fee_type,
        amount=data.amount,
        frequency=data.frequency,
        description=data.description,
    )
    try:
        db.add(fee)
        db.commit()
        db.refresh(fee)
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="This fee type already exists for this class, section, and academic year.",
        )
    return fee


@router.get("", dependencies=[Depends(require_school_feature("fees"))], response_model=list[FeeStructureResponse])
def list_fee_structures(
    academic_year: str | None = None,
    class_name: str | None = None,
    section: str | None = None,
    current_admin: Admin = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    query = db.query(FeeStructure).filter(FeeStructure.admin_id == current_admin.id)
    if academic_year:
        query = query.filter(FeeStructure.academic_year == academic_year.strip())
    if class_name:
        query = query.filter(FeeStructure.class_name == class_name.strip())
    if section:
        query = query.filter(FeeStructure.section == section.strip().upper())
    return query.order_by(
        FeeStructure.academic_year,
        FeeStructure.class_name,
        FeeStructure.section,
        FeeStructure.fee_type,
    ).all()


@router.put("/{fee_id}", dependencies=[Depends(require_school_feature("fees"))], response_model=FeeStructureResponse)
def update_fee_structure(
    fee_id: int,
    data: FeeStructureCreate,
    current_admin: Admin = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    fee = (
        db.query(FeeStructure)
        .filter(
            FeeStructure.id == fee_id,
            FeeStructure.admin_id == current_admin.id,
        )
        .first()
    )
    if fee is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Fee structure not found.")

    for field, value in data.model_dump().items():
        setattr(fee, field, value)

    try:
        db.commit()
        db.refresh(fee)
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="This fee type already exists for this class, section, and academic year.",
        )
    return fee


@router.patch("/{fee_id}/deactivate", dependencies=[Depends(require_school_feature("fees"))], response_model=FeeStructureResponse)
def deactivate_fee_structure(
    fee_id: int,
    current_admin: Admin = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    fee = (
        db.query(FeeStructure)
        .filter(
            FeeStructure.id == fee_id,
            FeeStructure.admin_id == current_admin.id,
        )
        .first()
    )
    if fee is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Fee structure not found.")

    fee.is_active = False
    db.commit()
    db.refresh(fee)
    return fee

# ---------------- Student Fee Ledger APIs ----------------

from datetime import date
from decimal import Decimal
from pydantic import field_validator
from models import Student, StudentFeeLedger


class FeeLedgerCreate(BaseModel):
    student_id: int = Field(gt=0)
    academic_year: str = Field(min_length=9, max_length=20)
    fee_type: str = Field(min_length=1, max_length=30)
    period: str = Field(default="one_time", min_length=1, max_length=30)
    amount_due: Decimal = Field(gt=0, max_digits=10, decimal_places=2)
    due_date: date | None = None
    fee_structure_id: int | None = Field(default=None, gt=0)

    @field_validator("academic_year", "fee_type", "period")
    @classmethod
    def clean_text(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("This field cannot be blank.")
        return value


class FeeLedgerResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    admin_id: int
    student_id: int
    fee_structure_id: int | None
    academic_year: str
    fee_type: str
    period: str
    amount_due: Decimal
    amount_paid: Decimal
    due_date: date | None


def ledger_balance(item: StudentFeeLedger) -> Decimal:
    return Decimal(str(item.amount_due)) - Decimal(str(item.amount_paid))


@router.post("/ledger", dependencies=[Depends(require_school_feature("fees"))], response_model=FeeLedgerResponse, status_code=status.HTTP_201_CREATED)
def assign_student_fee(
    data: FeeLedgerCreate,
    current_admin: Admin = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    student = db.query(Student).filter(
        Student.id == data.student_id,
        Student.admin_id == current_admin.id,
    ).first()

    if student is None:
        raise HTTPException(status_code=404, detail="Student not found for this school.")

    if data.fee_structure_id is None:
        raise HTTPException(
            status_code=400,
            detail="Select an active fee structure before assigning a fee.",
        )

    if data.fee_structure_id is not None:
        structure = db.query(FeeStructure).filter(
            FeeStructure.id == data.fee_structure_id,
            FeeStructure.admin_id == current_admin.id,
            FeeStructure.academic_year == data.academic_year,
            FeeStructure.class_name == student.class_name,
            FeeStructure.section == student.section,
            FeeStructure.fee_type == data.fee_type,
            FeeStructure.is_active.is_(True),
        ).first()

        if structure is None:
            raise HTTPException(
                status_code=400,
                detail="Fee structure does not match this student's class, section, type and academic year.",
            )

        if Decimal(str(structure.amount)) != data.amount_due:
            raise HTTPException(
                status_code=400,
                detail="amount_due must match the selected fee structure amount.",
            )

        data.period = validate_billing_period(data.period, structure.frequency)

    ledger = StudentFeeLedger(
        admin_id=current_admin.id,
        student_id=student.id,
        fee_structure_id=data.fee_structure_id,
        academic_year=data.academic_year,
        fee_type=data.fee_type,
        period=data.period,
        amount_due=data.amount_due,
        amount_paid=Decimal("0.00"),
        due_date=data.due_date,
    )

    db.add(ledger)
    try:
        db.commit()
        db.refresh(ledger)
    except Exception as exc:
        db.rollback()
        if "uq_student_fee_ledger_period" in str(exc) or "UNIQUE constraint failed" in str(exc):
            raise HTTPException(
                status_code=409,
                detail="A ledger entry already exists for this student, fee type, academic year and period.",
            )
        raise

    return ledger



class BulkFeeLedgerCreate(BaseModel):
    fee_structure_id: int = Field(gt=0)
    period: str = Field(min_length=1, max_length=30)
    due_date: date | None = None

    @field_validator("period")
    @classmethod
    def clean_period(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("Period cannot be blank.")
        return value


@router.post("/ledger/bulk", dependencies=[Depends(require_school_feature("fees"))])
def assign_fee_to_class(
    data: BulkFeeLedgerCreate,
    current_admin: Admin = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    structure = db.query(FeeStructure).filter(
        FeeStructure.id == data.fee_structure_id,
        FeeStructure.admin_id == current_admin.id,
        FeeStructure.is_active.is_(True),
    ).first()

    if structure is None:
        raise HTTPException(
            status_code=404,
            detail="Active fee structure not found for this school.",
        )

    period = validate_billing_period(data.period, structure.frequency)

    students = db.query(Student).filter(
        Student.admin_id == current_admin.id,
        Student.class_name == structure.class_name,
        Student.section == structure.section,
    ).order_by(Student.id).all()

    created = 0
    skipped = 0
    created_ids = []

    try:
        for student in students:
            existing = db.query(StudentFeeLedger.id).filter(
                StudentFeeLedger.admin_id == current_admin.id,
                StudentFeeLedger.student_id == student.id,
                StudentFeeLedger.academic_year == structure.academic_year,
                StudentFeeLedger.fee_type == structure.fee_type,
                StudentFeeLedger.period == period,
            ).first()

            if existing:
                skipped += 1
                continue

            ledger = StudentFeeLedger(
                admin_id=current_admin.id,
                student_id=student.id,
                fee_structure_id=structure.id,
                academic_year=structure.academic_year,
                fee_type=structure.fee_type,
                period=period,
                amount_due=structure.amount,
                amount_paid=Decimal("0.00"),
                due_date=data.due_date,
            )
            db.add(ledger)
            db.flush()
            created += 1
            created_ids.append(ledger.id)

        db.commit()
    except Exception:
        db.rollback()
        raise HTTPException(
            status_code=500,
            detail="Bulk assignment failed; no changes from this batch were saved.",
        )

    return {
        "message": "Class fee assignment completed.",
        "class_name": structure.class_name,
        "section": structure.section,
        "academic_year": structure.academic_year,
        "period": period,
        "students_matched": len(students),
        "created": created,
        "skipped_existing": skipped,
        "ledger_ids": created_ids,
    }


@router.get("/ledger", dependencies=[Depends(require_school_feature("fees"))], response_model=list[FeeLedgerResponse])
def list_student_fee_ledger(
    student_id: int | None = None,
    academic_year: str | None = None,
    current_admin: Admin = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    query = db.query(StudentFeeLedger).filter(
        StudentFeeLedger.admin_id == current_admin.id
    )

    if student_id is not None:
        query = query.filter(StudentFeeLedger.student_id == student_id)

    if academic_year:
        query = query.filter(
            StudentFeeLedger.academic_year == academic_year.strip()
        )

    return query.order_by(
        StudentFeeLedger.student_id,
        StudentFeeLedger.due_date,
        StudentFeeLedger.id,
    ).all()



@router.get("/student/my-fees")
def student_my_fees(
    current_student: Student = Depends(get_current_student),
    db: Session = Depends(get_db),
):
    rows = db.query(StudentFeeLedger).filter(
        StudentFeeLedger.student_id == current_student.id,
        StudentFeeLedger.admin_id == current_student.admin_id,
    ).order_by(
        StudentFeeLedger.academic_year.desc(),
        StudentFeeLedger.due_date,
        StudentFeeLedger.id,
    ).all()

    return [
        {
            "id": row.id,
            "academic_year": row.academic_year,
            "fee_type": row.fee_type,
            "period": row.period,
            "amount_due": row.amount_due,
            "amount_paid": row.amount_paid,
            "pending_amount": ledger_balance(row),
            "due_date": row.due_date,
        }
        for row in rows
    ]
@router.get("/ledger/{ledger_id}/balance", dependencies=[Depends(require_school_feature("fees"))])
def get_fee_balance(
    ledger_id: int,
    current_admin: Admin = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    ledger = db.query(StudentFeeLedger).filter(
        StudentFeeLedger.id == ledger_id,
        StudentFeeLedger.admin_id == current_admin.id,
    ).first()

    if ledger is None:
        raise HTTPException(status_code=404, detail="Fee ledger entry not found.")

    due = Decimal(str(ledger.amount_due))
    paid = Decimal(str(ledger.amount_paid))
    return {
        "ledger_id": ledger.id,
        "amount_due": due,
        "amount_paid": paid,
        "pending_amount": due - paid,
        "status": "paid" if paid >= due else ("partial" if paid > 0 else "pending"),
    }
from datetime import datetime, timezone
from models import FeePayment
from dependencies import get_current_student
from models import Student

@router.get("/payments/history", dependencies=[Depends(require_school_feature("fees"))])
def admin_payment_history(
    student_id: int | None = None,
    current_admin: Admin = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    query = db.query(FeePayment).filter(
        FeePayment.admin_id == current_admin.id,
        FeePayment.status == "paid",
    )
    if student_id is not None:
        query = query.filter(FeePayment.student_id == student_id)
    rows = query.order_by(FeePayment.created_at.desc()).all()
    return [
        {
            "payment_id": p.id,
            "student_id": p.student_id,
            "ledger_id": p.ledger_id,
            "amount": p.amount,
            "payment_method": p.payment_method,
            "receipt_number": p.receipt_number,
            "paid_at": p.paid_at,
            "status": p.status,
        }
        for p in rows
    ]

@router.get("/payments/{payment_id}/receipt", dependencies=[Depends(require_school_feature("fees"))])
def admin_payment_receipt(
    payment_id: int,
    current_admin: Admin = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    payment = db.query(FeePayment).filter(
        FeePayment.id == payment_id,
        FeePayment.admin_id == current_admin.id,
        FeePayment.status == "paid",
    ).first()
    if payment is None:
        raise HTTPException(status_code=404, detail="Paid receipt not found.")
    receipt_student = db.query(Student).filter(
        Student.id == payment.student_id,
        Student.admin_id == current_admin.id,
    ).first()

    return {
        "receipt_number": payment.receipt_number,
        "payment_id": payment.id,
        "student_id": payment.student_id,
        "student_name": receipt_student.full_name if receipt_student else "Student record unavailable",
        "registration_number": receipt_student.registration_number if receipt_student else None,
        "class_name": receipt_student.class_name if receipt_student else None,
        "section": receipt_student.section if receipt_student else None,
        "ledger_id": payment.ledger_id,
        "amount": payment.amount,
        "payment_method": payment.payment_method,
        "paid_at": payment.paid_at,
        "status": payment.status,
    }

@router.get("/student/payments/history")
def student_payment_history(
    current_student: Student = Depends(get_current_student),
    db: Session = Depends(get_db),
):
    rows = db.query(FeePayment).filter(
        FeePayment.student_id == current_student.id,
        FeePayment.admin_id == current_student.admin_id,
        FeePayment.status == "paid",
    ).order_by(FeePayment.created_at.desc()).all()
    return [
        {
            "payment_id": p.id,
            "ledger_id": p.ledger_id,
            "amount": p.amount,
            "payment_method": p.payment_method,
            "receipt_number": p.receipt_number,
            "paid_at": p.paid_at,
            "status": p.status,
        }
        for p in rows
    ]

@router.get("/student/payments/{payment_id}/receipt")
def student_payment_receipt(
    payment_id: int,
    current_student: Student = Depends(get_current_student),
    db: Session = Depends(get_db),
):
    payment = db.query(FeePayment).filter(
        FeePayment.id == payment_id,
        FeePayment.student_id == current_student.id,
        FeePayment.admin_id == current_student.admin_id,
        FeePayment.status == "paid",
    ).first()
    if payment is None:
        raise HTTPException(status_code=404, detail="Paid receipt not found.")
    return {
        "receipt_number": payment.receipt_number,
        "payment_id": payment.id,
        "ledger_id": payment.ledger_id,
        "amount": payment.amount,
        "payment_method": payment.payment_method,
        "paid_at": payment.paid_at,
        "status": payment.status,
    }

# Razorpay online payment flow
import os
import razorpay
from pydantic import BaseModel, Field
from models import StudentFeeLedger

class RazorpayVerifyRequest(BaseModel):
    payment_id: int
    razorpay_order_id: str = Field(min_length=1, max_length=100)
    razorpay_payment_id: str = Field(min_length=1, max_length=100)
    razorpay_signature: str = Field(min_length=1, max_length=500)

def get_razorpay_client():
    key_id = os.getenv("RAZORPAY_KEY_ID")
    key_secret = os.getenv("RAZORPAY_KEY_SECRET")
    if not key_id or not key_secret:
        raise HTTPException(
            status_code=503,
            detail="Razorpay is not configured. Add Test Mode credentials to .env.",
        )
    return razorpay.Client(auth=(key_id, key_secret))

@router.post("/student/payments/order")
def create_student_payment_order(
    ledger_id: int,
    current_student: Student = Depends(get_current_student),
    db: Session = Depends(get_db),
):
    ledger = db.query(StudentFeeLedger).filter(
        StudentFeeLedger.id == ledger_id,
        StudentFeeLedger.student_id == current_student.id,
        StudentFeeLedger.admin_id == current_student.admin_id,
    ).first()
    if ledger is None:
        raise HTTPException(status_code=404, detail="Fee ledger entry not found.")

    pending = Decimal(str(ledger.amount_due)) - Decimal(str(ledger.amount_paid))
    if pending <= 0:
        raise HTTPException(status_code=400, detail="No pending fee for this ledger.")

    client = get_razorpay_client()
    amount_paise = int(pending * 100)
    try:
        order = client.order.create(data={
            "amount": amount_paise,
            "currency": "INR",
            "receipt": f"ledger_{ledger.id}_{current_student.id}",
            "notes": {
                "ledger_id": str(ledger.id),
                "student_id": str(current_student.id),
            },
        })
        payment = FeePayment(
            admin_id=current_student.admin_id,
            student_id=current_student.id,
            ledger_id=ledger.id,
            amount=pending,
            payment_method="razorpay",
            status="created",
            gateway_order_id=order["id"],
        )
        db.add(payment)
        db.commit()
        db.refresh(payment)
    except HTTPException:
        db.rollback()
        raise
    except Exception:
        db.rollback()
        raise HTTPException(status_code=502, detail="Could not create payment order.")

    return {
        "payment_id": payment.id,
        "order_id": order["id"],
        "amount": amount_paise,
        "currency": "INR",
        "key_id": os.getenv("RAZORPAY_KEY_ID"),
    }

@router.post("/student/payments/verify")
def verify_student_payment(
    data: RazorpayVerifyRequest,
    current_student: Student = Depends(get_current_student),
    db: Session = Depends(get_db),
):
    payment = db.query(FeePayment).filter(
        FeePayment.id == data.payment_id,
        FeePayment.student_id == current_student.id,
        FeePayment.admin_id == current_student.admin_id,
    ).first()
    if payment is None:
        raise HTTPException(status_code=404, detail="Payment order not found.")

    if payment.status == "paid":
        if payment.gateway_payment_id == data.razorpay_payment_id:
            return {
                "status": "paid",
                "receipt_number": payment.receipt_number,
                "message": "Payment was already verified.",
            }
        raise HTTPException(status_code=409, detail="Payment already completed.")

    if payment.status != "created" or payment.gateway_order_id != data.razorpay_order_id:
        raise HTTPException(status_code=400, detail="Payment order does not match.")

    client = get_razorpay_client()
    try:
        client.utility.verify_payment_signature({
            "razorpay_order_id": data.razorpay_order_id,
            "razorpay_payment_id": data.razorpay_payment_id,
            "razorpay_signature": data.razorpay_signature,
        })
        gateway_payment = client.payment.fetch(data.razorpay_payment_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Payment verification failed.")

    expected_paise = int(Decimal(str(payment.amount)) * 100)
    if (
        gateway_payment.get("order_id") != payment.gateway_order_id
        or int(gateway_payment.get("amount", -1)) != expected_paise
        or gateway_payment.get("currency") != "INR"
        or gateway_payment.get("status") != "captured"
    ):
        raise HTTPException(
            status_code=400,
            detail="Gateway payment is not captured or its details do not match.",
        )

    try:
        ledger = db.query(StudentFeeLedger).filter(
            StudentFeeLedger.id == payment.ledger_id,
            StudentFeeLedger.student_id == current_student.id,
            StudentFeeLedger.admin_id == current_student.admin_id,
        ).with_for_update().first()

        if ledger is None:
            raise HTTPException(status_code=404, detail="Fee ledger entry not found.")

        if Decimal(str(ledger.amount_due)) - Decimal(str(ledger.amount_paid)) < Decimal(str(payment.amount)):
            raise HTTPException(status_code=409, detail="Pending fee changed; contact school admin.")

        ledger.amount_paid = Decimal(str(ledger.amount_paid)) + Decimal(str(payment.amount))
        payment.status = "paid"
        payment.gateway_payment_id = data.razorpay_payment_id
        payment.paid_at = datetime.now(timezone.utc)
        payment.receipt_number = f"FEE-{datetime.now(timezone.utc):%Y%m}-{payment.id:06d}"
        db.commit()
        db.refresh(payment)
    except HTTPException:
        db.rollback()
        raise
    except Exception:
        db.rollback()
        raise HTTPException(status_code=500, detail="Could not finalize verified payment.")

    return {
        "status": "paid",
        "receipt_number": payment.receipt_number,
        "payment_id": payment.id,
        "message": "Payment verified successfully.",
    }

# Admin offline fee collection
class OfflineFeePaymentRequest(BaseModel):
    ledger_id: int = Field(gt=0)
    amount: Decimal = Field(gt=0, max_digits=10, decimal_places=2)
    payment_method: str = Field(min_length=1, max_length=30)
    reference_number: str | None = Field(default=None, max_length=100)
    remarks: str | None = Field(default=None, max_length=255)

    @field_validator("payment_method")
    @classmethod
    def validate_payment_method(cls, value: str) -> str:
        value = value.strip().lower()
        if value not in {"cash", "bank_transfer", "cheque"}:
            raise ValueError("Use cash, bank_transfer, or cheque.")
        return value


@router.post("/payments/offline", dependencies=[Depends(require_school_feature("fees"))], status_code=status.HTTP_201_CREATED)
def collect_offline_fee(
    data: OfflineFeePaymentRequest,
    current_admin: Admin = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    from datetime import datetime, timezone
    from models import FeePayment, StudentFeeLedger

    ledger = db.query(StudentFeeLedger).filter(
        StudentFeeLedger.id == data.ledger_id,
        StudentFeeLedger.admin_id == current_admin.id,
    ).with_for_update().first()

    if ledger is None:
        raise HTTPException(status_code=404, detail="Fee ledger entry not found.")

    pending = Decimal(str(ledger.amount_due)) - Decimal(str(ledger.amount_paid))
    if pending <= 0:
        raise HTTPException(status_code=400, detail="This fee is already fully paid.")

    if data.amount > pending:
        raise HTTPException(
            status_code=400,
            detail=f"Payment exceeds pending balance of {pending:.2f}.",
        )

    now = datetime.now(timezone.utc)
    payment = FeePayment(
        admin_id=current_admin.id,
        student_id=ledger.student_id,
        ledger_id=ledger.id,
        amount=data.amount,
        payment_method=data.payment_method,
        status="paid",
        receipt_number=f"OFF-{now:%Y%m%d%H%M%S}-{ledger.id}-{__import__('uuid').uuid4().hex[:8].upper()}",
        paid_at=now,
    )

    try:
        ledger.amount_paid = Decimal(str(ledger.amount_paid)) + data.amount
        db.add(payment)
        db.commit()
        db.refresh(payment)
    except Exception:
        db.rollback()
        raise HTTPException(status_code=500, detail="Could not record offline payment.")

    return {
        "message": "Offline payment recorded successfully.",
        "payment_id": payment.id,
        "receipt_number": payment.receipt_number,
        "student_id": payment.student_id,
        "ledger_id": payment.ledger_id,
        "amount_paid_now": str(payment.amount),
        "payment_method": payment.payment_method,
        "pending_balance": str(
            Decimal(str(ledger.amount_due)) - Decimal(str(ledger.amount_paid))
        ),
        "status": payment.status,
    }
