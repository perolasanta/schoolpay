# app/api/v1/endpoints/users.py
# ============================================================
# School staff management — school_admin only.
# GET  /users           → list all users in this school
# POST /users           → invite new staff member
# PATCH /users/{id}     → update role or is_active
# DELETE /users/{id}    → permanently delete a staff user (cannot delete self)
# ============================================================

import logging
from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Response, status
from pydantic import BaseModel, EmailStr

from app.core.database import make_query_client, supabase_admin
from app.core.security import TokenData, get_current_user
from app.services.auth_service import create_school_user
from app.services.activity_service import log_activity

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/users", tags=["Users"])

VALID_SCHOOL_ROLES = {"school_admin", "bursar", "teacher", "accountant"}


def require_admin(current_user: TokenData = Depends(get_current_user)) -> TokenData:
    """Only school_admin can manage users."""
    if current_user.role != "school_admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only school administrators can manage staff accounts.",
        )
    return current_user


# ── List Users ─────────────────────────────────────────────────────────────
@router.get("")
async def list_users(current_user: TokenData = Depends(get_current_user)):
    """List all staff for this school. All authenticated school users can call this
    (teachers need to see who else is in the system), but only admin can modify."""
    try:
        db = make_query_client()
        db.postgrest.schema("schoolpay")
        result = (
            db.table("users")
            .select("id, full_name, email, phone, role, is_active, last_login, created_at")
            .eq("school_id", current_user.school_id)
            .order("created_at", desc=False)
            .execute()
        )
        rows = getattr(result, "data", None) or []
        return {"success": True, "data": rows}
    except Exception as e:
        logger.error(f"list_users error: {e}")
        raise HTTPException(status_code=500, detail="Failed to load users")


# ── Create User ────────────────────────────────────────────────────────────
class CreateUserRequest(BaseModel):
    full_name: str
    email: EmailStr
    password: str
    role: str
    phone: Optional[str] = None


@router.post("", status_code=201)
async def create_user(
    body: CreateUserRequest,
    current_user: TokenData = Depends(require_admin),
):
    if body.role not in VALID_SCHOOL_ROLES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid role. Must be one of: {', '.join(VALID_SCHOOL_ROLES)}",
        )
    if len(body.password) < 8:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Password must be at least 8 characters.",
        )

    new_user = await create_school_user(
        school_id=current_user.school_id,
        email=body.email,
        password=body.password,
        full_name=body.full_name,
        role=body.role,
        phone=body.phone,
        created_by=current_user.user_id,
    )

    await log_activity(
        school_id=current_user.school_id,
        user_id=current_user.user_id,
        action="users.create",
        entity_type="user",
        entity_id=new_user["id"],
        metadata={"email": body.email, "role": body.role},
    )

    return {"success": True, "data": new_user}


# ── Update User ────────────────────────────────────────────────────────────
class UpdateUserRequest(BaseModel):
    role: Optional[str] = None
    is_active: Optional[bool] = None
    full_name: Optional[str] = None
    phone: Optional[str] = None


@router.patch("/{user_id}")
async def update_user(
    user_id: UUID,
    body: UpdateUserRequest,
    current_user: TokenData = Depends(require_admin),
):
    # Verify user belongs to this school
    db = make_query_client()
    db.postgrest.schema("schoolpay")

    try:
        existing = (
            db.table("users")
            .select("id, school_id, role, is_active, email")
            .eq("id", str(user_id))
            .eq("school_id", current_user.school_id)
            .limit(1)
            .execute()
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail="Database error")

    rows = getattr(existing, "data", None) or []
    if not rows:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found in your school.",
        )

    # Prevent admin from deactivating themselves
    if str(user_id) == current_user.user_id and body.is_active is False:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="You cannot deactivate your own account.",
        )

    if body.role is not None and body.role not in VALID_SCHOOL_ROLES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid role: {body.role}",
        )

    # Build update payload
    updates = {}
    if body.role is not None:     updates["role"] = body.role
    if body.is_active is not None: updates["is_active"] = body.is_active
    if body.full_name is not None: updates["full_name"] = body.full_name
    if body.phone is not None:     updates["phone"] = body.phone

    if not updates:
        raise HTTPException(status_code=400, detail="No fields to update")

    try:
        db2 = make_query_client()
        db2.postgrest.schema("schoolpay")
        result = (
            db2.table("users")
            .update(updates)
            .eq("id", str(user_id))
            .execute()
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail="Failed to update user")

    await log_activity(
        school_id=current_user.school_id,
        user_id=current_user.user_id,
        action="users.update",
        entity_type="user",
        entity_id=str(user_id),
        metadata=updates,
    )

    updated_rows = getattr(result, "data", None) or []
    return {"success": True, "data": updated_rows[0] if updated_rows else {}}


@router.delete("/{user_id}", status_code=204)
async def delete_user(
    user_id: UUID,
    current_user: TokenData = Depends(require_admin),
):
    """
    Permanently remove a staff user from this school.
    Activity logs are preserved (they reference user_id which remains in audit trail).
    Cannot delete yourself.
    """
    if str(user_id) == current_user.user_id:
        raise HTTPException(status_code=400, detail="You cannot delete your own account.")

    db = make_query_client()
    db.postgrest.schema("schoolpay")

    existing = (
        db.table("users")
        .select("id, email")
        .eq("id", str(user_id))
        .eq("school_id", current_user.school_id)
        .limit(1)
        .execute()
    )
    rows = getattr(existing, "data", None) or []
    if not rows:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found in your school.",
        )

    db2 = make_query_client()
    db2.postgrest.schema("schoolpay")
    db2.table("users").delete().eq("id", str(user_id)).eq("school_id", current_user.school_id).execute()

    await log_activity(
        school_id=current_user.school_id,
        user_id=current_user.user_id,
        action="users.delete",
        entity_type="user",
        entity_id=str(user_id),
        metadata={"email": rows[0].get("email")},
    )

    return Response(status_code=status.HTTP_204_NO_CONTENT)
