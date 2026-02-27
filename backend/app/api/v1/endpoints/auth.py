# ============================================================
# app/api/v1/endpoints/auth.py
#
# LEARNING NOTE: Routes are THIN. They do three things only:
# 1. Declare the HTTP method and path
# 2. Validate the request body (Pydantic does this automatically)
# 3. Call a service and return the result
#
# Business logic NEVER lives in routes.
# ============================================================

from fastapi import APIRouter, Depends, Request
from app.schemas.auth import LoginRequest, TokenResponse, RefreshRequest
from app.schemas.common import APIResponse
from app.services.auth_service import login_user, refresh_access_token
from app.core.security import get_current_user, CurrentUser

router = APIRouter(prefix="/auth", tags=["Authentication"])


@router.post("/login", response_model=APIResponse[TokenResponse])
async def login(request: Request, body: LoginRequest):
    """
    Login endpoint. Returns JWT access + refresh tokens.

    The access token contains: user_id, school_id, role.
    Every protected endpoint reads school_id from this token —
    never from the request body. This prevents school-switching attacks.
    """
    result = await login_user(body)
    return APIResponse(data=result, message="Login successful")


@router.post("/refresh", response_model=APIResponse[TokenResponse])
async def refresh(body: RefreshRequest):
    """
    Exchange a refresh token for a new access token.
    Frontend calls this automatically when access token expires.
    """
    result = await refresh_access_token(body.refresh_token)
    return APIResponse(data=result, message="Token refreshed")


@router.get("/me", response_model=APIResponse[dict])
async def get_me(user: CurrentUser = Depends(get_current_user)):
    """Returns the currently logged-in user's profile from the token."""
    return APIResponse(data={
        "user_id": str(user.user_id),
        "school_id": str(user.school_id),
        "role": user.role,
        "email": user.email,
        "full_name": user.full_name,
    })


@router.post("/logout")
async def logout(user: CurrentUser = Depends(get_current_user)):
    """
    Logout. JWTs are stateless — we can't truly invalidate them.
    The frontend deletes the token from storage.
    For production, add a token blacklist in Redis.
    """
    return APIResponse(message="Logged out successfully")
