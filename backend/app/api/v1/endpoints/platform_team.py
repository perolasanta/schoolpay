# app/api/v1/endpoints/platform_team.py
# ============================================================
# Platform team management — platform_admin only.
# GET   /platform/team        → list all platform users
# POST  /platform/team        → add new team member
# PATCH /platform/team/{id}   → update role or deactivate
# ============================================================

import logging
from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, EmailStr

from app.core.database import make_query_client
from app.core.security import CurrentUser, require_platform_admin

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/platform/team", tags=["Platform Team"])

VALID_PLATFORM_ROLES = {"platform_admin", "platform_support"}


# ── List Team ──────────────────────────────────────────────────────────────
@router.get("")
async def list_team(current_user: CurrentUser = Depends(require_platform_admin)):
    try:
        db = make_query_client()
        db.postgrest.schema("schoolpay")
        try:
            result = (
                db.table("platform_users")
                .select("id, full_name, email, role, is_active, last_login, created_at")
                .order("created_at", desc=False)
                .execute()
            )
        except Exception as inner_e:
            # Backward compatibility: some DBs don't have platform_users.last_login yet.
            if "platform_users.last_login does not exist" not in str(inner_e):
                raise
            result = (
                db.table("platform_users")
                .select("id, full_name, email, role, is_active, created_at")
                .order("created_at", desc=False)
                .execute()
            )
        rows = getattr(result, "data", None) or []
        return {"success": True, "data": rows}
    except Exception as e:
        logger.error(f"list_team error: {e}")
        raise HTTPException(status_code=500, detail="Failed to load team")


# ── Add Team Member ────────────────────────────────────────────────────────
class CreateTeamMemberRequest(BaseModel):
    full_name: str
    email: EmailStr
    password: str
    role: str


@router.post("", status_code=201)
async def create_team_member(
    body: CreateTeamMemberRequest,
    current_user: CurrentUser = Depends(require_platform_admin),
):
    if body.role not in VALID_PLATFORM_ROLES:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid role. Must be one of: {', '.join(VALID_PLATFORM_ROLES)}",
        )
    if len(body.password) < 8:
        raise HTTPException(status_code=400, detail="Password must be at least 8 characters.")

    # Create Supabase Auth user
    try:
        auth_result = make_query_client().auth.admin.create_user({
            "email": body.email,
            "password": body.password,
            "email_confirm": True,
        })
    except Exception as e:
        if "already registered" in str(e).lower():
            raise HTTPException(status_code=409, detail=f"Email {body.email} already registered.")
        raise HTTPException(status_code=500, detail=f"Failed to create auth account: {e}")

    auth_id = auth_result.user.id

    # Insert into platform_users
    try:
        db = make_query_client()
        db.postgrest.schema("schoolpay")
        payload = {
            "auth_id": str(auth_id),
            "full_name": body.full_name,
            "email": body.email,
            "role": body.role,
            "created_by": str(current_user.user_id),
        }
        result = db.table("platform_users").insert(payload).execute()
    except Exception as e:
        make_query_client().auth.admin.delete_user(str(auth_id))
        raise HTTPException(status_code=500, detail=f"Failed to create profile: {e}")

    rows = getattr(result, "data", None) or []
    return {"success": True, "data": rows[0] if rows else {}}


# ── Update Team Member ─────────────────────────────────────────────────────
class UpdateTeamMemberRequest(BaseModel):
    role: Optional[str] = None
    is_active: Optional[bool] = None


@router.patch("/{member_id}")
async def update_team_member(
    member_id: UUID,
    body: UpdateTeamMemberRequest,
    current_user: CurrentUser = Depends(require_platform_admin),
):
    # Prevent self-deactivation
    if str(member_id) == str(current_user.user_id) and body.is_active is False:
        raise HTTPException(status_code=400, detail="You cannot deactivate your own account.")

    if body.role is not None and body.role not in VALID_PLATFORM_ROLES:
        raise HTTPException(status_code=400, detail=f"Invalid role: {body.role}")

    updates = {}
    if body.role is not None:      updates["role"] = body.role
    if body.is_active is not None: updates["is_active"] = body.is_active

    if not updates:
        raise HTTPException(status_code=400, detail="Nothing to update")

    try:
        db = make_query_client()
        db.postgrest.schema("schoolpay")
        result = (
            db.table("platform_users")
            .update(updates)
            .eq("id", str(member_id))
            .execute()
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail="Failed to update")

    rows = getattr(result, "data", None) or []
    return {"success": True, "data": rows[0] if rows else {}}
