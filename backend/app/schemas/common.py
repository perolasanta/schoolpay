# ============================================================
# app/schemas/common.py
#
# LEARNING NOTE: Pydantic schemas define what data looks like
# going IN (request body) and coming OUT (response body).
# They are NOT the database tables — they are the API contract.
#
# Naming convention we follow:
#   SomethingCreate  → body for POST requests (creating)
#   SomethingUpdate  → body for PATCH requests (editing)
#   SomethingResponse → what the API returns
#   SomethingList    → paginated list response
# ============================================================

from pydantic import BaseModel, Field
from typing import Optional, Generic, TypeVar, List
from datetime import datetime
from uuid import UUID

T = TypeVar("T")


# ── Standard API response wrapper ────────────────────────────
class APIResponse(BaseModel, Generic[T]):
    """
    Every endpoint returns this shape:
    {
        "success": true,
        "message": "Student created",
        "data": { ... }
    }

    This makes it easy for the React frontend to always
    know where the actual data is and whether it succeeded.
    """
    success: bool = True
    message: str = "OK"
    data: Optional[T] = None


class PaginatedResponse(BaseModel, Generic[T]):
    """
    For list endpoints that return many records.
    {
        "success": true,
        "data": [...],
        "total": 287,
        "page": 1,
        "page_size": 50,
        "total_pages": 6
    }
    """
    success: bool = True
    data: List[T] = []
    total: int = 0
    page: int = 1
    page_size: int = 50
    total_pages: int = 0


class ErrorResponse(BaseModel):
    """Returned when something goes wrong."""
    success: bool = False
    message: str
    detail: Optional[str] = None


# ── Pagination query params ───────────────────────────────────
class PaginationParams(BaseModel):
    """
    Add to any list endpoint:
        async def list_students(params: PaginationParams = Depends()):
    """
    page: int = Field(default=1, ge=1)
    page_size: int = Field(default=50, ge=1, le=200)
    search: Optional[str] = None

    @property
    def offset(self) -> int:
        return (self.page - 1) * self.page_size
