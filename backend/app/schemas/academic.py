# app/schemas/academic.py

from pydantic import BaseModel, Field
from typing import Optional, List
from uuid import UUID
from datetime import date, datetime


# ── Academic Sessions ────────────────────────────────────────
class SessionCreate(BaseModel):
    name: str = Field(min_length=4, max_length=20, examples=["2024/2025"])
    start_date: Optional[date] = None
    end_date: Optional[date] = None
    is_active: bool = False


class SessionUpdate(BaseModel):
    start_date: Optional[date] = None
    end_date: Optional[date] = None
    is_active: Optional[bool] = None


class SessionResponse(BaseModel):
    id: UUID
    school_id: UUID
    name: str
    start_date: Optional[date]
    end_date: Optional[date]
    is_active: bool
    created_at: datetime
    terms: Optional[List["TermResponse"]] = None   # nested when fetching detail


# ── Terms ────────────────────────────────────────────────────
class TermCreate(BaseModel):
    session_id: UUID
    name: str = Field(examples=["First Term", "Second Term", "Third Term"])
    start_date: Optional[date] = None
    end_date: Optional[date] = None
    is_active: bool = False


class TermUpdate(BaseModel):
    start_date: Optional[date] = None
    end_date: Optional[date] = None
    is_active: Optional[bool] = None


class TermResponse(BaseModel):
    id: UUID
    school_id: UUID
    session_id: UUID
    session_name: Optional[str] = None
    name: str
    start_date: Optional[date]
    end_date: Optional[date]
    is_active: bool
    created_at: datetime


# ── Classes ──────────────────────────────────────────────────
class ClassCreate(BaseModel):
    name: str = Field(min_length=2, max_length=50, examples=["JSS 1", "Primary 3", "SS 2"])
    level: Optional[str] = None
    capacity: int = Field(default=40, ge=1, le=200)


class ClassUpdate(BaseModel):
    name: Optional[str] = None
    level: Optional[str] = None
    capacity: Optional[int] = Field(default=None, ge=1, le=200)
    is_active: Optional[bool] = None


class ClassResponse(BaseModel):
    id: UUID
    school_id: UUID
    name: str
    level: Optional[str]
    capacity: int
    is_active: bool
    student_count: Optional[int] = None   # populated when listing
    created_at: datetime


# Fix forward refs
SessionResponse.model_rebuild()
