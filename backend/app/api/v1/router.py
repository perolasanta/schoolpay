# app/api/v1/router.py
# Registers all endpoint routers under /api/v1
#
# SESSION 3 additions: internal
# SESSION 4 additions: pay_page, uploads

import time
from collections import defaultdict, deque

from fastapi import APIRouter, Depends, HTTPException, Request, status
from app.api.v1.endpoints import (
    auth,
    students,
    academic,
    fees,
    payments,
    internal,   # Session 3 — n8n internal endpoints
    pay_page,   # Session 4 — parent public payment page
    uploads,    # Session 4 — bank transfer proof upload
    platform_admin,
    users, 
    platform_team,
    sms,          # Session 5 — SMS blast for debtors
)
from app.core.config import settings

api_router = APIRouter()

# PRIORITY-0: In-memory brute-force guard for login endpoints.
# This protects /auth/login and /platform/auth/login by IP + email rate limits.
_LOGIN_IP_ATTEMPTS: dict[str, deque[float]] = defaultdict(deque)
_LOGIN_EMAIL_ATTEMPTS: dict[str, deque[float]] = defaultdict(deque)


def _trim_attempts(bucket: deque[float], now_ts: float, window_seconds: int) -> None:
    while bucket and (now_ts - bucket[0]) > window_seconds:
        bucket.popleft()


async def login_rate_limit_guard(request: Request) -> None:
    if request.method != "POST":
        return
    if request.url.path not in {"/api/v1/auth/login", "/api/v1/platform/auth/login"}:
        return

    now_ts = time.time()
    window = settings.LOGIN_RATE_LIMIT_WINDOW_SECONDS
    ip_limit = settings.LOGIN_RATE_LIMIT_MAX_PER_IP
    email_limit = settings.LOGIN_RATE_LIMIT_MAX_PER_EMAIL

    client_ip = request.client.host if request.client else "unknown"
    ip_bucket = _LOGIN_IP_ATTEMPTS[client_ip]
    _trim_attempts(ip_bucket, now_ts, window)
    if len(ip_bucket) >= ip_limit:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Too many login attempts from this IP. Please try again later.",
        )

    email = ""
    try:
        payload = await request.json()
        email = str((payload or {}).get("email", "")).strip().lower()
    except Exception:
        email = ""

    if email:
        email_bucket = _LOGIN_EMAIL_ATTEMPTS[email]
        _trim_attempts(email_bucket, now_ts, window)
        if len(email_bucket) >= email_limit:
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail="Too many login attempts for this account. Please try again later.",
            )
        email_bucket.append(now_ts)

    ip_bucket.append(now_ts)

api_router.include_router(auth.router, dependencies=[Depends(login_rate_limit_guard)])
api_router.include_router(students.router)
api_router.include_router(academic.router, prefix="/academic")
api_router.include_router(fees.router, prefix="/fees")
api_router.include_router(payments.router)
api_router.include_router(internal.router)
api_router.include_router(pay_page.router)
api_router.include_router(uploads.router)
api_router.include_router(platform_admin.router, dependencies=[Depends(login_rate_limit_guard)])

api_router.include_router(users.router)
api_router.include_router(platform_team.router)
api_router.include_router(sms.router)
