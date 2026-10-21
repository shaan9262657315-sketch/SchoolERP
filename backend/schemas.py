from datetime import date

from pydantic import BaseModel, ConfigDict, Field, field_validator


VALID_CLASSES = {"Nursery", "LKG", "UKG", *(str(number) for number in range(1, 13))}
VALID_SECTIONS = {"A", "B", "C"}


class StudentLogin(BaseModel):
    registration_number: str = Field(min_length=1, max_length=30)
    date_of_birth: date
    password: str = Field(min_length=1, max_length=128)


class AdminLogin(BaseModel):
    username: str = Field(min_length=1, max_length=50)
    password: str = Field(min_length=1, max_length=128)


class StudentResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    registration_number: str
    full_name: str
    date_of_birth: date
    class_name: str
    section: str
    guardian_name: str


class StudentCreate(BaseModel):
    registration_number: str = Field(min_length=1, max_length=30)
    full_name: str = Field(min_length=1, max_length=100)
    date_of_birth: date
    class_name: str = Field(min_length=1, max_length=30)
    section: str = Field(default="A", min_length=1, max_length=1)
    guardian_name: str = Field(min_length=1, max_length=100)

    @field_validator("registration_number", "full_name", "guardian_name")
    @classmethod
    def strip_and_reject_blank(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("This field cannot be blank.")
        return value

    @field_validator("class_name")
    @classmethod
    def validate_class_name(cls, value: str) -> str:
        value = value.strip()
        normalized = value.title() if value.lower() in {"nursery", "lkg", "ukg"} else value
        if normalized not in VALID_CLASSES:
            raise ValueError("Class must be Nursery, LKG, UKG, or a number from 1 to 12.")
        return normalized

    @field_validator("section")
    @classmethod
    def validate_section(cls, value: str) -> str:
        value = value.strip().upper()
        if value not in VALID_SECTIONS:
            raise ValueError("Section must be A, B, or C.")
        return value

    @field_validator("date_of_birth")
    @classmethod
    def validate_date_of_birth(cls, value: date) -> date:
        if value >= date.today():
            raise ValueError("Date of birth must be in the past.")
        return value


class SuperAdminLogin(BaseModel):
    username: str = Field(min_length=1, max_length=50)
    password: str = Field(min_length=1, max_length=128)
