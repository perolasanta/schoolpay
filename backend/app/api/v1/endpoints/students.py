# app/api/v1/endpoints/students.py

from typing import Optional
from fastapi import APIRouter, Depends, Query

from app.core.security import (
    CurrentUser, get_active_user, require_roles
)
from app.schemas.students import (
    StudentCreate, StudentUpdate, StudentResponse,
    StudentListItem, EnrollmentCreate, BulkEnrollRequest
)
from app.schemas.common import APIResponse, PaginatedResponse, PaginationParams
from app.services import student_service

router = APIRouter(prefix="/students", tags=["Students"])


@router.post("", response_model=APIResponse[StudentResponse], status_code=201)
async def create_student(
    body: StudentCreate,
    user: CurrentUser = Depends(require_roles("school_admin")),
):
    """
    Create a new student record.
    Only school_admin can create students.
    school_id comes from the JWT — never from the request body.
    """
    result = await student_service.create_student(
        school_id=str(user.school_id),
        data=body,
        created_by=str(user.user_id),
    )
    return APIResponse(data=result, message="Student created successfully")


@router.get("", response_model=PaginatedResponse[StudentListItem])
async def list_students(
    user: CurrentUser = Depends(get_active_user),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=50, ge=1, le=200),
    search: Optional[str] = Query(default=None),
    class_id: Optional[str] = Query(default=None),
    status: Optional[str] = Query(default=None),
):
    """
    List all students. All roles can view.
    Supports: search (name/admission number), class filter, status filter.
    """
    params = PaginationParams(page=page, page_size=page_size, search=search)
    items, total = await student_service.list_students(
        school_id=str(user.school_id),
        params=params,
        class_id=class_id,
        status_filter=status,
    )
    total_pages = (total + page_size - 1) // page_size
    return PaginatedResponse(
        data=items, total=total, page=page,
        page_size=page_size, total_pages=total_pages,
    )


@router.get("/{student_id}", response_model=APIResponse[StudentResponse])
async def get_student(
    student_id: str,
    user: CurrentUser = Depends(get_active_user),
):
    """Get one student's full profile including current enrollment."""
    result = await student_service.get_student(
        school_id=str(user.school_id),
        student_id=student_id,
    )
    return APIResponse(data=result)


@router.patch("/{student_id}", response_model=APIResponse[StudentResponse])
async def update_student(
    student_id: str,
    body: StudentUpdate,
    user: CurrentUser = Depends(require_roles("school_admin")),
):
    """Update student details. Only school_admin."""
    result = await student_service.update_student(
        school_id=str(user.school_id),
        student_id=student_id,
        data=body,
        updated_by=str(user.user_id),
    )
    return APIResponse(data=result, message="Student updated")


@router.post("/{student_id}/enroll", response_model=APIResponse[dict])
async def enroll_student(
    student_id: str,
    body: EnrollmentCreate,
    user: CurrentUser = Depends(require_roles("school_admin")),
):
    """Assign a student to a class for a session."""
    result = await student_service.enroll_student(
        school_id=str(user.school_id),
        student_id=student_id,
        session_id=str(body.session_id),
        class_id=str(body.class_id),
    )
    return APIResponse(data=result, message="Student enrolled successfully")


@router.post("/bulk-enroll", response_model=APIResponse[dict])
async def bulk_enroll(
    body: BulkEnrollRequest,
    user: CurrentUser = Depends(require_roles("school_admin")),
):
    """Enroll multiple students into a class at once."""
    result = await student_service.bulk_enroll(
        school_id=str(user.school_id),
        data=body,
        enrolled_by=str(user.user_id),
    )
    return APIResponse(
        data=result,
        message=f"Enrolled {result['enrolled']} students. {result['failed']} failed."
    )
