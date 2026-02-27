# app/api/v1/router.py
# Registers all endpoint routers under /api/v1
#
# SESSION 3 additions: internal
# SESSION 4 additions: pay_page, uploads

from fastapi import APIRouter
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
    platform_team
)

api_router = APIRouter()

api_router.include_router(auth.router)
api_router.include_router(students.router)
api_router.include_router(academic.router)
api_router.include_router(fees.router)
api_router.include_router(payments.router)
api_router.include_router(internal.router)
api_router.include_router(pay_page.router)
api_router.include_router(uploads.router)
api_router.include_router(platform_admin.router)

api_router.include_router(users.router)
api_router.include_router(platform_team.router)