# ============================================================
# app/services/auth_service.py
# ============================================================

from datetime import datetime, timezone
from uuid import UUID
from typing import Optional
import logging

from fastapi import HTTPException, status
from supabase import create_client
from supabase.lib.client_options import SyncClientOptions

from app.core.config import settings
from app.core.database import supabase_admin
from app.core.security import (
    TokenData, create_access_token, create_refresh_token, verify_token
)
from app.schemas.auth import LoginRequest, TokenResponse, UserProfile
from app.services.activity_service import log_activity
from app.core.database import make_query_client

logger = logging.getLogger(__name__)


async def login_user(request: LoginRequest) -> TokenResponse:
    # Step 1: Authenticate with Supabase Auth
    try:
        # IMPORTANT: Never call sign_in_with_password on supabase_admin.
        # sign_in_with_password updates the client's session token, which
        # replaces the service role key with the user's JWT on all subsequent
        # requests. This triggers RLS and breaks all service-level queries.
        # Always use a dedicated ephemeral client for user authentication.
        # Use a dedicated auth client so supabase_admin keeps service-role auth.
        auth_client = create_client(
            settings.SUPABASE_URL,
            settings.SUPABASE_ANON_KEY,
            options=SyncClientOptions(schema="schoolpay"),
        )
        auth_response = auth_client.auth.sign_in_with_password({
            "email": request.email,
            "password": request.password,
        })
    except Exception as e:
        logger.warning(f"Login failed for {request.email}: {e}")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password",
        )

    if not auth_response.user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password",
        )

    auth_user_id = str(auth_response.user.id)

    # Step 2: Get profile from users table
    try:
        # Step 2: Fresh client for DB query — supabase_admin session may be poisoned
        
        query_client = make_query_client()

        user_result = (
            query_client
            .table("users")
            .select("*, schools(name, subdomain, subscription_status, is_active)")
            .eq("auth_id", auth_user_id)
            .limit(1)
            .execute()
        )
    except Exception as e:
        logger.error(f"DB query failed during login: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Database error during login",
        )

    if user_result is None:
        logger.error("DB query returned None during login")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Database error during login",
        )

    rows = getattr(user_result, "data", None) or []
    if not rows:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User account not found. Contact your school admin.",
        )
    user = rows[0]

    if not user.get("is_active"):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Your account is inactive. Contact your school admin.",
        )

    school_rel = user.get("schools")
    if school_rel is None:
        school = {}
    elif isinstance(school_rel, dict):
        school = school_rel
    else:
        logger.error(f"Unexpected schools relation shape during login: {type(school_rel)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Invalid school relation data",
        )

    required_user_fields = ("id", "school_id", "role", "email", "full_name")
    if any(not user.get(field) for field in required_user_fields):
        logger.error(f"Incomplete user profile during login for auth_id={auth_user_id}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="User profile is incomplete. Contact support.",
        )

    # Step 3: Check school is active
    if not school.get("is_active", False):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Your school account is inactive. Contact SchoolPay support.",
        )

    # Step 4: Update last_login
    
    try:
        make_query_client().table("users") \
            .update({"last_login": datetime.now(timezone.utc).isoformat()}) \
            .eq("id", user["id"]) \
            .execute()
    except Exception:
        pass  # Non-critical — don't fail login if this fails

    # Step 5: Create JWT
    token_data = TokenData(
        user_id=user["id"],
        school_id=user["school_id"],
        role=user["role"],
        email=user["email"],
        full_name=user["full_name"],
        is_platform_admin=False,
    )

    access_token  = create_access_token(token_data)
    refresh_token = create_refresh_token(user["id"], user["school_id"])

    # Log the login
    try:
        await log_activity(
            school_id=user["school_id"],
            user_id=user["id"],
            action="auth.login",
            entity_type="user",
            entity_id=user["id"],
            metadata={"email": user["email"], "role": user["role"]},
        )
    except Exception:
        pass  # Non-critical

    return TokenResponse(
        access_token=access_token,
        refresh_token=refresh_token,
        expires_in=settings.JWT_ACCESS_TOKEN_EXPIRE_MINUTES * 60,
        user=UserProfile(
            id=UUID(user["id"]),
            school_id=UUID(user["school_id"]),
            full_name=user["full_name"],
            email=user["email"],
            phone=user.get("phone"),
            role=user["role"],
            school_name=school.get("name", ""),
            school_subdomain=school.get("subdomain", ""),
            subscription_status=school.get("subscription_status", "trial"),
        ),
    )


async def refresh_access_token(refresh_token_str: str) -> TokenResponse:
    try:
        payload = verify_token(refresh_token_str)
    except Exception:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired refresh token. Please log in again.",
        )

    try:
        query_client = make_query_client()
        user_result = (
            query_client
            .table("users")
            .select("id, school_id, full_name, email, phone, role, is_active, schools(name, subdomain, subscription_status, is_active)")
            .eq("id", payload.user_id)
            .limit(1)
            .execute()
        )
    except Exception:
        raise HTTPException(status_code=500, detail="Database error")

    if user_result is None:
        raise HTTPException(status_code=500, detail="Database error")

    rows = getattr(user_result, "data", None) or []
    if not rows:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found",
        )

    user = rows[0]
    if not user.get("is_active"):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Your account is inactive. Contact your school admin.",
        )

    required_user_fields = ("id", "school_id", "role", "email", "full_name")
    if any(not user.get(field) for field in required_user_fields):
        raise HTTPException(status_code=500, detail="User profile is incomplete")

    school_rel = user.get("schools")
    if school_rel is None:
        school = {}
    elif isinstance(school_rel, dict):
        school = school_rel
    else:
        logger.error(f"Unexpected schools relation shape during refresh: {type(school_rel)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Invalid school relation data",
        )
    if not school.get("is_active", False):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Your school account is inactive. Contact SchoolPay support.",
        )

    token_data = TokenData(
        user_id=user["id"],
        school_id=user["school_id"],
        role=user["role"],
        email=user["email"],
        full_name=user["full_name"],
    )

    return TokenResponse(
        access_token=create_access_token(token_data),
        refresh_token=create_refresh_token(user["id"], user["school_id"]),
        expires_in=settings.JWT_ACCESS_TOKEN_EXPIRE_MINUTES * 60,
        user=UserProfile(
            id=UUID(user["id"]),
            school_id=UUID(user["school_id"]),
            full_name=user["full_name"],
            email=user["email"],
            phone=user.get("phone"),
            role=user["role"],
            school_name=school.get("name", ""),
            school_subdomain=school.get("subdomain", ""),
            subscription_status=school.get("subscription_status", "trial"),
        ),
    )


async def create_school_user(
    school_id: str,
    email: str,
    password: str,
    full_name: str,
    role: str,
    phone: Optional[str] = None,
    created_by: Optional[str] = None,
) -> dict:
    # Normalize UUID-like inputs to plain strings before JSON serialization.
    school_id_str = str(school_id)
    created_by_str = str(created_by) if created_by is not None else None

    # Step 1: Create Supabase Auth user
    try:
        auth_result = supabase_admin.auth.admin.create_user({
            "email": email,
            "password": password,
            "email_confirm": True,
        })
    except Exception as e:
        if "already registered" in str(e).lower():
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"Email {email} is already registered.",
            )
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to create auth account: {str(e)}",
        )

    if not auth_result or not getattr(auth_result, "user", None):
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Auth account was created with an invalid response.",
        )

    auth_user_id = auth_result.user.id

    # Step 2: Create profile in users table
    try:
        user_result = make_query_client().table("users").insert({
            "school_id": school_id_str,
            "auth_id": str(auth_user_id),
            "full_name": full_name,
            "email": email,
            "phone": phone,
            "role": role,
            "created_by": created_by_str,
        }).execute()
    except Exception as e:
        supabase_admin.auth.admin.delete_user(str(auth_user_id))
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to create user profile: {str(e)}",
        )

    rows = getattr(user_result, "data", None) or []
    if not rows:
        # Roll back auth user if DB insert succeeded without representation.
        try:
            supabase_admin.auth.admin.delete_user(str(auth_user_id))
        except Exception as rollback_error:
            logger.error(f"Rollback failed for auth user {auth_user_id}: {rollback_error}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="User profile was not returned after creation.",
        )

    return rows[0]

        
