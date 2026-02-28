# ============================================================
# app/core/security.py
#
# LEARNING NOTE: This file is the heart of how we protect
# every endpoint. It handles three things:
#
# 1. JWT creation  — when a user logs in, we issue a token
#    that contains their user_id, school_id, and role.
#    Every subsequent request carries this token.
#
# 2. JWT verification — FastAPI's Depends() system calls
#    get_current_user() on protected endpoints automatically.
#    If the token is missing or invalid → 401 Unauthorized.
#
# 3. Role guards — require_roles() and subscription guards
#    check what the user is allowed to do.
#    If wrong role → 403 Forbidden.
#
# How it flows:
#   Request → get_current_user() verifies JWT
#           → returns CurrentUser (has school_id, role)
#           → endpoint function receives it as a parameter
#           → optional require_roles() checks role
# ============================================================

from datetime import datetime, timedelta, timezone
from typing import Optional, List
from uuid import UUID

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from jose import JWTError, jwt
from pydantic import BaseModel

from app.core.config import settings
from app.core.database import supabase_admin

# FastAPI's built-in bearer token extractor
# Reads: Authorization: Bearer <token>
bearer_scheme = HTTPBearer()


# ── Token payload model ──────────────────────────────────────
class TokenData(BaseModel):
    """What we embed inside the JWT."""
    user_id: str
    school_id: str
    role: str                   # school_admin | bursar | staff
    email: str
    full_name: str
    is_platform_admin: bool = False


class CurrentUser(BaseModel):
    """Available in every protected endpoint via Depends."""
    user_id: UUID
    school_id: UUID
    role: str
    email: str
    full_name: str
    is_platform_admin: bool = False

    @property
    def is_admin(self) -> bool:
        return self.role == "school_admin"

    @property
    def is_bursar(self) -> bool:
        return self.role in ("school_admin", "bursar")

    @property
    def can_record_payments(self) -> bool:
        return self.role in ("school_admin", "bursar")

    @property
    def can_manage_fees(self) -> bool:
        return self.role == "school_admin"

    @property
    def can_generate_invoices(self) -> bool:
        return self.role == "school_admin"


# ── Token creation ───────────────────────────────────────────
def create_access_token(data: TokenData) -> str:
    """
    Create a signed JWT. Called after successful login.
    The token is valid for JWT_ACCESS_TOKEN_EXPIRE_MINUTES.
    """
    expire = datetime.now(timezone.utc) + timedelta(
        minutes=settings.JWT_ACCESS_TOKEN_EXPIRE_MINUTES
    )
    payload = {
        **data.model_dump(),
        "exp": expire,
        "iat": datetime.now(timezone.utc),
        "type": "access",
    }
    return jwt.encode(payload, settings.JWT_SECRET_KEY, algorithm=settings.JWT_ALGORITHM)


def create_refresh_token(user_id: str, school_id: str) -> str:
    """
    Refresh token lives longer (30 days).
    Used to issue a new access token without re-login.
    """
    expire = datetime.now(timezone.utc) + timedelta(
        days=settings.JWT_REFRESH_TOKEN_EXPIRE_DAYS
    )
    payload = {
        "user_id": user_id,
        "school_id": school_id,
        "exp": expire,
        "type": "refresh",
    }
    return jwt.encode(payload, settings.JWT_SECRET_KEY, algorithm=settings.JWT_ALGORITHM)


# ── Token verification ───────────────────────────────────────
def verify_token(token: str) -> TokenData:
    """
    Decode and verify a JWT. Raises HTTPException if invalid.
    """
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(
            token,
            settings.JWT_SECRET_KEY,
            algorithms=[settings.JWT_ALGORITHM],
        )
        if payload.get("type") != "access":
            raise credentials_exception
        return TokenData(**payload)
    except JWTError:
        raise credentials_exception


# ── FastAPI dependency: get current user ─────────────────────
async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(bearer_scheme),
) -> CurrentUser:
    """
    LEARNING NOTE: This is a FastAPI 'dependency'.
    Add it to any endpoint like this:
        async def my_endpoint(user: CurrentUser = Depends(get_current_user)):

    FastAPI will automatically:
    1. Extract the Bearer token from the Authorization header
    2. Call this function
    3. Pass the result as the `user` parameter

    If the token is missing/invalid → 401 returned automatically.
    """
    token_data = verify_token(credentials.credentials)
    return CurrentUser(
        user_id=UUID(token_data.user_id),
        school_id=UUID(token_data.school_id),
        role=token_data.role,
        email=token_data.email,
        full_name=token_data.full_name,
        is_platform_admin=token_data.is_platform_admin,
    )


# ── Role guard factory ───────────────────────────────────────
def require_roles(*allowed_roles: str):
    """
    LEARNING NOTE: This is a dependency factory.
    Call it with the roles you want to allow, and it returns
    a FastAPI dependency that enforces that check.

    Usage:
        @router.post("/fee-structures")
        async def create_fee(
            user: CurrentUser = Depends(require_roles("school_admin"))
        ):

    If user is a bursar → 403 Forbidden.
    If user is school_admin → allowed through.

    You can allow multiple roles:
        Depends(require_roles("school_admin", "bursar"))
    """
    async def check_role(
        current_user: CurrentUser = Depends(get_current_user)
    ) -> CurrentUser:
        if current_user.role not in allowed_roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Access denied. Required role: {' or '.join(allowed_roles)}",
            )
        return current_user
    return check_role


# ── Subscription guard ───────────────────────────────────────
async def require_active_subscription(
    current_user: CurrentUser = Depends(get_current_user),
) -> CurrentUser:
    """
    Blocks endpoints when a school's subscription has expired.

    LEARNING NOTE: This guard is used on every financial endpoint:
    - Generate invoices
    - Record payments
    - Send SMS

    Schools in 'trial' or 'active' status → allowed.
    Schools in 'suspended' (overdue subscription) → blocked.
    Schools in 'cancelled' → blocked.

    Grace period is handled by checking grace_period_ends date.
    """
    try:
        result = supabase_admin.table("schools") \
            .select("subscription_status, is_active, trial_ends_at") \
            .eq("id", str(current_user.school_id)) \
            .single() \
            .execute()

        school = result.data
        if not school:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="School account not found. Contact SchoolPay support.")

        if not school["is_active"]:
            raise HTTPException(
                status_code=status.HTTP_402_PAYMENT_REQUIRED,
                detail="Your school account is inactive. Contact SchoolPay support.",
            )

        if school["subscription_status"] == "suspended":
            raise HTTPException(
                status_code=status.HTTP_402_PAYMENT_REQUIRED,
                detail=(
                    "Your subscription is overdue. "
                    "Please pay your SchoolPay subscription to continue."
                ),
            )

        if school["subscription_status"] == "cancelled":
            raise HTTPException(
                status_code=status.HTTP_402_PAYMENT_REQUIRED,
                detail="This school account has been cancelled.",
            )

    except HTTPException:
        raise
    except Exception as e:
        # Don't block users if the check itself fails — log and continue
        import logging
        logging.getLogger(__name__).error(f"Subscription check error: {e}")

    return current_user


# ── Combined: authenticated + active subscription ────────────
async def get_active_user(
    current_user: CurrentUser = Depends(require_active_subscription),
) -> CurrentUser:
    """
    The most common dependency for financial endpoints.
    Checks BOTH: valid JWT + active subscription.

    Usage:
        async def generate_invoices(user: CurrentUser = Depends(get_active_user)):
    """
    return current_user


# ── Platform admin guard ─────────────────────────────────────
async def require_platform_admin(
    current_user: CurrentUser = Depends(get_current_user),
) -> CurrentUser:
    """
    Only YOU (the platform owner) can access these endpoints.
    Used for: creating schools, suspending accounts, viewing all schools.
    """
    if not current_user.is_platform_admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Platform admin access required.",
        )
    return current_user
