# ============================================================
# app/api/v1/endpoints/platform_admin.py
#
# SUPER ADMIN ENDPOINTS — Only YOU can call these.
# Protected by require_platform_admin (is_platform_admin=True in JWT).
#
# These endpoints are your control panel over all schools.
# School admins never see these. They operate on YOUR platform tables:
#   - schools
#   - platform_subscriptions
#   - platform_users (you + your team)
#
# Endpoints:
#   POST /platform/auth/login           Platform admin login
#   GET  /platform/dashboard            KPI summary
#   GET  /platform/schools              All schools + status
#   GET  /platform/schools/{id}         One school detail
#   POST /platform/schools/{id}/activate
#   POST /platform/schools/{id}/suspend
#   GET  /platform/subscriptions        All subscription invoices
#   POST /platform/subscriptions/{id}/mark-paid
#   GET  /platform/revenue              Monthly revenue chart data
# ============================================================

from datetime import datetime, timezone, date, timedelta
from decimal import Decimal
from uuid import UUID
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel

from app.core.config import settings
from app.core.database import supabase_admin
from app.core.security import require_platform_admin, CurrentUser, create_access_token, TokenData

router = APIRouter(prefix="/platform", tags=["Platform Admin"])


# ── Platform admin login ──────────────────────────────────────
# Separate from school login. Uses platform_users table.

class PlatformLoginRequest(BaseModel):
    email: str
    password: str   # plaintext — hashed in DB via Supabase Auth


class PlatformLoginResponse(BaseModel):
    access_token: str
    admin_name: str
    admin_email: str


@router.post("/auth/login", response_model=PlatformLoginResponse)
async def platform_login(body: PlatformLoginRequest):
    """
    Platform admin login. Completely separate from school staff login.

    Uses Supabase Auth to verify password, then issues a JWT with
    is_platform_admin=True. This flag is what unlocks all /platform/* routes.

    Setup: Create your platform admin account in Supabase Auth, then
    insert a matching row in platform_users with the same email.
    """
    # Verify with Supabase Auth
    try:
        auth_res = supabase_admin.auth.sign_in_with_password({
            "email": body.email,
            "password": body.password,
        })
        if not auth_res.user:
            raise HTTPException(status_code=401, detail="Invalid email or password")
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid email or password")

    # Verify this user is in platform_users (not just any Supabase user)
    admin = (
        supabase_admin.table("platform_users")
        .select("id, full_name, email, is_active")
        .eq("email", body.email)
        .eq("is_active", True)
        .maybe_single()
        .execute()
    )
    if not admin.data:
        raise HTTPException(
            status_code=403,
            detail="This account does not have platform admin access."
        )

    a = admin.data

    # Issue JWT with is_platform_admin=True
    # school_id is set to a placeholder UUID since platform admins
    # don't belong to a school
    token = create_access_token(TokenData(
        user_id=str(a["id"]),
        school_id="00000000-0000-0000-0000-000000000000",
        role="platform_admin",
        email=a["email"],
        full_name=a["full_name"],
        is_platform_admin=True,
    ))

    return PlatformLoginResponse(
        access_token=token,
        admin_name=a["full_name"],
        admin_email=a["email"],
    )


# ── Dashboard KPIs ────────────────────────────────────────────

@router.get("/dashboard")
async def platform_dashboard(
    admin: CurrentUser = Depends(require_platform_admin)
):
    """
    Your top-level numbers. Loaded on the super admin home page.
    - Total schools (by subscription status)
    - Total active students across all schools
    - Revenue this term vs last term
    - Overdue subscriptions count
    """
    # School counts by status
    schools_res = supabase_admin.table("schools").select("id, subscription_status, is_active").execute()
    schools = schools_res.data or []

    total_schools    = len(schools)
    active_schools   = sum(1 for s in schools if s["subscription_status"] == "active")
    trial_schools    = sum(1 for s in schools if s["subscription_status"] == "trial")
    suspended_schools = sum(1 for s in schools if s["subscription_status"] == "suspended")

    # Subscription revenue
    subs_res = supabase_admin.table("platform_subscriptions").select(
        "amount_due, status, created_at, paid_at"
    ).execute()
    subs = subs_res.data or []

    total_billed   = sum(Decimal(str(s["amount_due"])) for s in subs)
    total_collected = sum(Decimal(str(s["amount_due"])) for s in subs if s["status"] == "paid")
    pending_amount  = sum(Decimal(str(s["amount_due"])) for s in subs if s["status"] == "pending")
    overdue_count   = sum(1 for s in subs if s["status"] == "overdue")

    # Active students across all schools
    enrollments_res = supabase_admin.table("student_enrollments").select("id", count="exact").eq("is_active", True).execute()
    total_students = enrollments_res.count or 0

    return {
        "schools": {
            "total":     total_schools,
            "active":    active_schools,
            "trial":     trial_schools,
            "suspended": suspended_schools,
        },
        "revenue": {
            "total_billed":    float(total_billed),
            "total_collected": float(total_collected),
            "pending":         float(pending_amount),
            "overdue_count":   overdue_count,
            "collection_rate": round(float(total_collected / total_billed * 100) if total_billed else 0, 1),
        },
        "students": {
            "total_active": total_students,
        },
    }


# ── All schools ───────────────────────────────────────────────

@router.get("/schools")
async def list_schools(
    status_filter: Optional[str] = None,
    search: Optional[str] = None,
    admin: CurrentUser = Depends(require_platform_admin),
):
    """
    All schools on the platform with their subscription status.
    Filterable by status (trial, active, suspended, cancelled).
    """
    query = supabase_admin.table("schools").select(
        "id, name, subdomain, email, phone, subscription_status, "
        "is_active, trial_ends_at, referred_by, referral_discount, "
        "created_at"
    ).order("created_at", desc=True)

    if status_filter:
        query = query.eq("subscription_status", status_filter)

    res = query.execute()
    schools = res.data or []

    if search:
        s = search.lower()
        schools = [sc for sc in schools if s in sc.get("name", "").lower() or s in sc.get("subdomain", "").lower()]

    # Enrich each school with latest subscription and student count
    enriched = []
    for sc in schools:
        # Latest subscription
        sub_res = (
            supabase_admin.table("platform_subscriptions")
            .select("term_label, amount_due, status, due_date, grace_period_ends")
            .eq("school_id", sc["id"])
            .order("created_at", desc=True)
            .limit(1)
            .execute()
        )
        latest_sub = sub_res.data[0] if sub_res.data else None

        # Student count
        enroll_res = (
            supabase_admin.table("student_enrollments")
            .select("id", count="exact")
            .eq("school_id", sc["id"])
            .eq("is_active", True)
            .execute()
        )
        student_count = enroll_res.count or 0

        enriched.append({
            **sc,
            "latest_subscription": latest_sub,
            "active_students": student_count,
        })

    return {"data": enriched, "total": len(enriched)}


# ── Single school detail ──────────────────────────────────────

@router.get("/schools/{school_id}")
async def get_school_detail(
    school_id: str,
    admin: CurrentUser = Depends(require_platform_admin),
):
    """Full detail view for one school — all subscriptions, staff count, payment totals."""
    school = (
        supabase_admin.table("schools")
        .select("*")
        .eq("id", school_id)
        .maybe_single()
        .execute()
    )
    if not school.data:
        raise HTTPException(status_code=404, detail="School not found")

    # All subscription history
    subs = (
        supabase_admin.table("platform_subscriptions")
        .select("*")
        .eq("school_id", school_id)
        .order("created_at", desc=True)
        .execute()
    )

    # Staff count
    staff = (
        supabase_admin.table("users")
        .select("id", count="exact")
        .eq("school_id", school_id)
        .eq("is_active", True)
        .execute()
    )

    # Total payments (all time)
    payments = (
        supabase_admin.table("payments")
        .select("amount")
        .eq("school_id", school_id)
        .eq("status", "success")
        .eq("is_voided", False)
        .execute()
    )
    total_payments = sum(Decimal(str(p["amount"])) for p in (payments.data or []))

    return {
        "school": school.data,
        "subscriptions": subs.data or [],
        "staff_count": staff.count or 0,
        "total_payments_processed": float(total_payments),
    }


# ── Activate school ───────────────────────────────────────────

@router.post("/schools/{school_id}/activate")
async def activate_school(
    school_id: str,
    admin: CurrentUser = Depends(require_platform_admin),
):
    """
    Activate a suspended or trial school.
    Sets subscription_status → active, is_active → true.
    """
    result = (
        supabase_admin.table("schools")
        .update({
            "subscription_status": "active",
            "is_active": True,
            "updated_at": datetime.now(timezone.utc).isoformat(),
        })
        .eq("id", school_id)
        .execute()
    )
    if not result.data:
        raise HTTPException(status_code=404, detail="School not found")

    return {"success": True, "message": "School activated successfully"}


# ── Suspend school ────────────────────────────────────────────

class SuspendRequest(BaseModel):
    reason: Optional[str] = None


@router.post("/schools/{school_id}/suspend")
async def suspend_school(
    school_id: str,
    body: SuspendRequest = SuspendRequest(),
    admin: CurrentUser = Depends(require_platform_admin),
):
    """
    Suspend a school for non-payment or policy violation.
    Sets subscription_status → suspended.
    School can still log in but cannot generate invoices or record payments.
    The subscription middleware in FastAPI blocks those endpoints automatically.
    """
    result = (
        supabase_admin.table("schools")
        .update({
            "subscription_status": "suspended",
            "updated_at": datetime.now(timezone.utc).isoformat(),
        })
        .eq("id", school_id)
        .execute()
    )
    if not result.data:
        raise HTTPException(status_code=404, detail="School not found")

    return {"success": True, "message": "School suspended"}


# ── All subscriptions ─────────────────────────────────────────

@router.get("/subscriptions")
async def list_subscriptions(
    status_filter: Optional[str] = None,
    admin: CurrentUser = Depends(require_platform_admin),
):
    """
    All platform subscription invoices — what schools owe you.
    Filterable by status: pending, paid, overdue, waived.
    """
    query = (
        supabase_admin.table("platform_subscriptions")
        .select("*, schools(name, subdomain, email, phone)")
        .order("created_at", desc=True)
    )
    if status_filter:
        query = query.eq("status", status_filter)

    res = query.execute()
    return {"data": res.data or []}


# ── Mark subscription paid ────────────────────────────────────

class MarkPaidRequest(BaseModel):
    payment_reference: Optional[str] = None
    notes: Optional[str] = None


@router.post("/subscriptions/{sub_id}/mark-paid")
async def mark_subscription_paid(
    sub_id: str,
    body: MarkPaidRequest = MarkPaidRequest(),
    admin: CurrentUser = Depends(require_platform_admin),
):
    """
    Mark a school's subscription invoice as paid.
    Also re-activates the school if it was suspended for non-payment.
    """
    # Get the subscription to find the school
    sub = (
        supabase_admin.table("platform_subscriptions")
        .select("school_id, status")
        .eq("id", sub_id)
        .maybe_single()
        .execute()
    )
    if not sub.data:
        raise HTTPException(status_code=404, detail="Subscription not found")

    # Mark paid
    supabase_admin.table("platform_subscriptions").update({
        "status": "paid",
        "paid_at": datetime.now(timezone.utc).isoformat(),
        "payment_reference": body.payment_reference,
        "notes": body.notes,
    }).eq("id", sub_id).execute()

    # Re-activate the school if it was suspended due to this subscription
    school = supabase_admin.table("schools").select("subscription_status").eq("id", sub.data["school_id"]).maybe_single().execute()
    if school.data and school.data["subscription_status"] == "suspended":
        supabase_admin.table("schools").update({
            "subscription_status": "active",
            "is_active": True,
        }).eq("id", sub.data["school_id"]).execute()

    return {"success": True, "message": "Subscription marked as paid. School re-activated if suspended."}


# ── Revenue chart data ────────────────────────────────────────

@router.get("/revenue")
async def revenue_chart(
    months: int = 12,
    admin: CurrentUser = Depends(require_platform_admin),
):
    """
    Monthly revenue data for the chart on the dashboard.
    Returns the last N months of subscription collections.
    """
    res = (
        supabase_admin.table("platform_subscriptions")
        .select("amount_due, status, paid_at, created_at")
        .order("created_at", desc=False)
        .execute()
    )
    subs = res.data or []

    # Group by month
    monthly: dict[str, dict] = {}
    for s in subs:
        # Use created_at for billed, paid_at for collected
        billed_month = s["created_at"][:7] if s.get("created_at") else None
        if billed_month:
            if billed_month not in monthly:
                monthly[billed_month] = {"month": billed_month, "billed": 0, "collected": 0}
            monthly[billed_month]["billed"] += float(s["amount_due"] or 0)
            if s["status"] == "paid" and s.get("paid_at"):
                monthly[billed_month]["collected"] += float(s["amount_due"] or 0)

    # Return last N months, fill gaps
    result = sorted(monthly.values(), key=lambda x: x["month"])[-months:]
    return {"data": result}
