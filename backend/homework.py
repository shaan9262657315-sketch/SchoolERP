from datetime import date
from fastapi import APIRouter, Depends, HTTPException, Response, status
from pydantic import BaseModel, Field, field_validator, model_validator
from sqlalchemy.orm import Session

from dependencies import get_current_student, get_db
from models import Homework, Student
from teacher_access import get_current_teacher, get_assignment
from subscription_access import require_school_feature
from models import Teacher, ClassAssignment

router = APIRouter(tags=["Homework"])


class HomeworkRequest(BaseModel):
    title: str = Field(min_length=1, max_length=150)
    subject: str = Field(min_length=1, max_length=80)
    description: str = Field(min_length=1, max_length=5000)
    assigned_date: date
    due_date: date

    @field_validator("title", "subject", "description")
    @classmethod
    def strip_text(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("This field cannot be blank.")
        return value

    @model_validator(mode="after")
    def validate_dates(self):
        if self.due_date < self.assigned_date:
            raise ValueError("Due date cannot be earlier than assigned date.")
        return self


def homework_data(item: Homework) -> dict:
    return {
        "id": item.id,
        "title": item.title,
        "subject": item.subject,
        "description": item.description,
        "class_name": item.class_name,
        "section": item.section,
        "assigned_date": item.assigned_date,
        "due_date": item.due_date,
        "created_at": item.created_at,
        "updated_at": item.updated_at,
    }


def assigned_homework_query(db: Session, teacher: Teacher, assignment: ClassAssignment):
    return db.query(Homework).filter(
        Homework.admin_id == teacher.admin_id,
        Homework.teacher_id == teacher.id,
        Homework.class_name == assignment.class_name,
        Homework.section == assignment.section,
    )


@router.get("/teacher/homework", dependencies=[Depends(require_school_feature("homework"))])
def list_teacher_homework(
    teacher: Teacher = Depends(get_current_teacher),
    db: Session = Depends(get_db),
):
    assignment = get_assignment(db, teacher)
    items = assigned_homework_query(db, teacher, assignment).order_by(
        Homework.due_date.asc(), Homework.created_at.desc()
    ).all()
    return [homework_data(item) for item in items]


@router.post("/teacher/homework", dependencies=[Depends(require_school_feature("homework"))], status_code=status.HTTP_201_CREATED)
def create_homework(
    request: HomeworkRequest,
    teacher: Teacher = Depends(get_current_teacher),
    db: Session = Depends(get_db),
):
    assignment = get_assignment(db, teacher)
    item = Homework(
        admin_id=teacher.admin_id,
        teacher_id=teacher.id,
        class_name=assignment.class_name,
        section=assignment.section,
        title=request.title,
        subject=request.subject,
        description=request.description,
        assigned_date=request.assigned_date,
        due_date=request.due_date,
    )
    db.add(item)
    db.commit()
    db.refresh(item)
    return homework_data(item)


@router.put("/teacher/homework/{homework_id}", dependencies=[Depends(require_school_feature("homework"))])
def update_homework(
    homework_id: int,
    request: HomeworkRequest,
    teacher: Teacher = Depends(get_current_teacher),
    db: Session = Depends(get_db),
):
    assignment = get_assignment(db, teacher)
    item = assigned_homework_query(db, teacher, assignment).filter(
        Homework.id == homework_id
    ).first()
    if item is None:
        raise HTTPException(status_code=404, detail="Homework not found.")
    item.title = request.title
    item.subject = request.subject
    item.description = request.description
    item.assigned_date = request.assigned_date
    item.due_date = request.due_date
    db.commit()
    db.refresh(item)
    return homework_data(item)


@router.delete("/teacher/homework/{homework_id}", dependencies=[Depends(require_school_feature("homework"))], status_code=status.HTTP_204_NO_CONTENT)
def delete_homework(
    homework_id: int,
    teacher: Teacher = Depends(get_current_teacher),
    db: Session = Depends(get_db),
):
    assignment = get_assignment(db, teacher)
    item = assigned_homework_query(db, teacher, assignment).filter(
        Homework.id == homework_id
    ).first()
    if item is None:
        raise HTTPException(status_code=404, detail="Homework not found.")
    db.delete(item)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/student/homework", dependencies=[Depends(require_school_feature("homework"))])
def list_student_homework(
    student: Student = Depends(get_current_student),
    db: Session = Depends(get_db),
):
    if student.admin_id is None:
        return []
    items = db.query(Homework).filter(
        Homework.admin_id == student.admin_id,
        Homework.class_name == student.class_name,
        Homework.section == student.section,
    ).order_by(Homework.due_date.asc(), Homework.created_at.desc()).all()
    return [homework_data(item) for item in items]
