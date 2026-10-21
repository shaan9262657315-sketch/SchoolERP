from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from dependencies import get_db

from dependencies import get_current_student
from models import Student, StudentFeeLedger
from schemas import StudentResponse

router = APIRouter(prefix="/student", tags=["Student"])


@router.get("/me", response_model=StudentResponse)
def get_student_profile(
    current_student: Student = Depends(get_current_student),
):
    return current_student

from decimal import Decimal
from models import Student, StudentFeeLedger


@router.get("/my-fees")
def get_my_fees(
    current_student: Student = Depends(get_current_student),
    db: Session = Depends(get_db),
):
    entries = (
        db.query(StudentFeeLedger)
        .filter(
            StudentFeeLedger.student_id == current_student.id,
            StudentFeeLedger.admin_id == current_student.admin_id,
        )
        .order_by(StudentFeeLedger.due_date, StudentFeeLedger.id)
        .all()
    )

    results = []
    total_due = Decimal("0.00")
    total_paid = Decimal("0.00")

    for item in entries:
        due = Decimal(str(item.amount_due))
        paid = Decimal(str(item.amount_paid))
        pending = due - paid

        total_due += due
        total_paid += paid

        results.append({
            "ledger_id": item.id,
            "academic_year": item.academic_year,
            "fee_type": item.fee_type,
            "period": item.period,
            "amount_due": due,
            "amount_paid": paid,
            "pending_amount": pending,
            "due_date": item.due_date,
            "status": "paid" if pending <= 0 else ("partial" if paid > 0 else "pending"),
        })

    return {
        "student_id": current_student.id,
        "student_name": current_student.full_name,
        "total_due": total_due,
        "total_paid": total_paid,
        "total_pending": total_due - total_paid,
        "fees": results,
    }
