# app/schemas/students.py

from pydantic import BaseModel, Field, field_validator
from typing import Optional
from uuid import UUID
from datetime import date, datetime
from enum import Enum
import re


class StudentStatus(str, Enum):
    active     = "active"
    graduated  = "graduated"
    withdrawn  = "withdrawn"
    suspended  = "suspended"
    deceased   = "deceased"


class Gender(str, Enum):
    male   = "male"
    female = "female"


# ── Validators ───────────────────────────────────────────────
def validate_nigerian_phone(v: str) -> str:
    """
    Accepts: 08012345678, +2348012345678, 2348012345678
    Returns: 08012345678 (local format for SMS)
    """
    if not v:
        return v
    cleaned = re.sub(r"[\s\-\(\)]", "", v)
    if cleaned.startswith("+234"):
        cleaned = "0" + cleaned[4:]
    elif cleaned.startswith("234"):
        cleaned = "0" + cleaned[3:]
    if not re.match(r"^0[789]\d{9}$", cleaned):
        raise ValueError("Invalid Nigerian phone number. Expected format: 08012345678")
    return cleaned


# ── Create ───────────────────────────────────────────────────
class StudentCreate(BaseModel):
    admission_number: str = Field(min_length=3, max_length=30)
    first_name: str = Field(min_length=1, max_length=100)
    last_name: str = Field(min_length=1, max_length=100)
    middle_name: Optional[str] = None
    date_of_birth: Optional[date] = None
    gender: Optional[Gender] = None

    guardian_name: str = Field(min_length=2, max_length=150)
    guardian_phone: str
    guardian_email: Optional[str] = None
    guardian_relationship: str = "parent"

    alt_guardian_name: Optional[str] = None
    alt_guardian_phone: Optional[str] = None

    scholarship_percent: float = Field(default=0, ge=0, le=100)
    has_sibling_discount: bool = False

    state_of_origin: Optional[str] = None
    lga: Optional[str] = None
    religion: Optional[str] = None
    blood_group: Optional[str] = None
    genotype: Optional[str] = None
    admission_date: Optional[date] = None

    # Enroll in a class on creation (optional — can enroll separately)
    class_id: Optional[UUID] = None
    session_id: Optional[UUID] = None

    @field_validator("guardian_phone")
    @classmethod
    def validate_phone(cls, v):
        return validate_nigerian_phone(v)

    @field_validator("alt_guardian_phone")
    @classmethod
    def validate_alt_phone(cls, v):
        if v:
            return validate_nigerian_phone(v)
        return v


class StudentUpdate(BaseModel):
    first_name: Optional[str] = Field(default=None, min_length=1)
    last_name: Optional[str] = Field(default=None, min_length=1)
    middle_name: Optional[str] = None
    date_of_birth: Optional[date] = None
    gender: Optional[Gender] = None
    guardian_name: Optional[str] = None
    guardian_phone: Optional[str] = None
    guardian_email: Optional[str] = None
    alt_guardian_name: Optional[str] = None
    alt_guardian_phone: Optional[str] = None
    scholarship_percent: Optional[float] = Field(default=None, ge=0, le=100)
    has_sibling_discount: Optional[bool] = None
    state_of_origin: Optional[str] = None
    status: Optional[StudentStatus] = None

    @field_validator("guardian_phone")
    @classmethod
    def validate_phone(cls, v):
        if v:
            return validate_nigerian_phone(v)
        return v


# ── Response ─────────────────────────────────────────────────
class StudentResponse(BaseModel):
    id: UUID
    school_id: UUID
    admission_number: str
    first_name: str
    last_name: str
    middle_name: Optional[str]
    full_name: str                  # computed: first + last
    date_of_birth: Optional[date]
    gender: Optional[str]
    guardian_name: str
    guardian_phone: str
    guardian_email: Optional[str]
    guardian_relationship: str
    status: str
    scholarship_percent: float
    has_sibling_discount: bool
    state_of_origin: Optional[str]
    admission_date: Optional[date]
    created_at: datetime
    # Current enrollment info (joined)
    current_class: Optional[str] = None
    current_class_id: Optional[UUID] = None
    current_session: Optional[str] = None


class StudentListItem(BaseModel):
    """Lighter version for list views — all fields the frontend needs."""
    id: UUID
    admission_number: str
    first_name: str
    last_name: str
    full_name: str
    guardian_name: str
    guardian_phone: str
    status: str
    current_class: Optional[str] = None
    class_name: Optional[str] = None   # same value, frontend uses this name
    scholarship_percent: float

# ── Enrollment ───────────────────────────────────────────────
class EnrollmentCreate(BaseModel):
    student_id: UUID
    session_id: UUID
    class_id: UUID


class EnrollmentResponse(BaseModel):
    id: UUID
    student_id: UUID
    session_id: UUID
    class_id: UUID
    class_name: str
    session_name: str
    enrolled_at: datetime
    is_active: bool


class BulkEnrollRequest(BaseModel):
    """Enroll multiple students into a class at once."""
    student_ids: list[UUID] = Field(min_length=1, max_length=500)
    session_id: UUID
    class_id: UUID
