# ============================================================
# app/api/v1/endpoints/internal.py
#
# INTERNAL ENDPOINTS — Called by n8n only, never by the frontend.
#
# Security model:
#   These routes are NOT protected by user JWT (n8n has no user session).
#   Instead, they use a shared secret key: X-Internal-Key header.
#   This key is set in .env as INTERNAL_SECRET_KEY.
#
#   NGINX config should restrict /api/v1/internal/* to the
#   internal Docker network ONLY — never exposed to the internet.
#
# Why FastAPI instead of n8n querying Supabase directly?
#   1. RLS (Row Level Security) — Supabase service key bypasses RLS,
#      so we'd lose our tenant isolation. Routing through FastAPI
#      keeps school_id checks in one place.
#   2. Business logic stays in Python, not in n8n expressions.
#   3. Easier to test and audit.
# ============================================================

from fastapi import APIRouter, Depends, HTTPException, Header, Query
from typing import Optional
from datetime import datetime, timezone, timedelta
from decimal import Decimal
import logging

from app.core.config import settings
from app.core.database import supabase_admin
from app.schemas.common import APIResponse

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/internal", tags=["Internal — n8n Only"])


# ── Internal Auth Dependency ─────────────────────────────────────────────────

def verify_internal_key(x_internal_key: str = Header(...)):
    """
    Shared secret for n8n → FastAPI communication.
    Simple but effective when combined with network-level isolation.
    """
    if x_internal_key != settings.INTERNAL_SECRET_KEY:
        raise HTTPException(status_code=403, detail="Forbidden")
    return True


# ── 1. Student Contact Details ───────────────────────────────────────────────
# Called by: Workflow 1 (payment-success) after every payment

@router.get("/student-contact/{student_id}")
async def get_student_contact(
    student_id: str,
    x_school_id: str = Header(...),
    _: bool = Depends(verify_internal_key),
):
    """
    Returns student name, guardian phone, school name, and current
    outstanding balance. n8n calls this to build the SMS receipt message.

    X-School-Id header is mandatory — prevents cross-school data leaks
    even though this endpoint uses the service key.
    """
    # Fetch student with school ownership check
    student = (
        supabase_admin.table("students")
        .select("id, first_name, last_name, guardian_phone, school_id")
        .eq("id", student_id)
        .eq("school_id", x_school_id)          # Tenant isolation
        .maybe_single()
        .execute()
    )
    if not student.data:
        raise HTTPException(status_code=404, detail="Student not found")

    s = student.data

    # Fetch school name
    school = (
        supabase_admin.table("schools")
        .select("name")
        .eq("id", x_school_id)
        .maybe_single()
        .execute()
    )
    school_name = school.data["name"] if school.data else "Your School"

    # Fetch current outstanding balance (sum of all active invoices)
    invoices = (
        supabase_admin.table("invoices")
        .select("total_amount, amount_paid, status")
        .eq("student_id", student_id)
        .eq("school_id", x_school_id)
        .neq("status", "void")
        .execute()
    )

    outstanding_balance = Decimal("0")
    for inv in (invoices.data or []):
        if inv["status"] != "paid":
            balance = Decimal(str(inv["total_amount"])) - Decimal(str(inv["amount_paid"]))
            outstanding_balance += max(balance, Decimal("0"))

    return {
        "data": {
            "student_name":        f"{s['first_name']} {s['last_name']}",
            "guardian_phone":      s.get("guardian_phone") or "",
            "school_name":         school_name,
            "outstanding_balance": float(outstanding_balance),
        }
    }


# ── 2. Debtor List ───────────────────────────────────────────────────────────
# Called by: Workflow 2 (fee-reminder-blast) — bursar-triggered

@router.get("/debtors")
async def get_debtors(
    x_school_id: str = Header(...),
    term_id: Optional[str] = Query(None),
    status: str = Query("unpaid,partial"),
    _: bool = Depends(verify_internal_key),
):
    """
    Returns all students with outstanding balances for a given term.
    Used by the bulk SMS blast workflow — n8n iterates this list
    and sends one SMS per student.

    Returns only students with a guardian_phone — no phone = no SMS.
    """
    statuses = [s.strip() for s in status.split(",")]

    query = (
        supabase_admin.table("invoices")
        .select(
            "id, student_id, total_amount, amount_paid, status, payment_token, "
            "students(first_name, last_name, guardian_phone)"
        )
        .eq("school_id", x_school_id)
        .in_("status", statuses)
    )

    if term_id:
        query = query.eq("term_id", term_id)

    result = query.execute()

    debtors = []
    for inv in (result.data or []):
        s = inv.get("students") or {}
        phone = s.get("guardian_phone") or ""
        if not phone:
            continue    # Skip students with no guardian phone

        outstanding = float(
            Decimal(str(inv["total_amount"])) - Decimal(str(inv["amount_paid"]))
        )
        if outstanding <= 0:
            continue    # Already fully paid (edge case with trigger lag)

        debtors.append({
            "invoice_id":          inv["id"],
            "student_id":          inv["student_id"],
            "student_name":        f"{s.get('first_name', '')} {s.get('last_name', '')}".strip(),
            "guardian_phone":      phone,
            "outstanding_balance": outstanding,
            "payment_token":       inv["payment_token"],
        })

    return {"data": debtors, "count": len(debtors)}


# ── 3. Overdue Invoices (Cross-School) ──────────────────────────────────────
# Called by: Workflow 3 (daily-overdue-reminder) — scheduled, no school_id filter

@router.get("/overdue-invoices")
async def get_overdue_invoices(
    days_overdue_min: int = Query(3, ge=1),
    days_overdue_max: int = Query(60, le=365),
    status: str = Query("unpaid,partial"),
    subscription_active: bool = Query(True),
    _: bool = Depends(verify_internal_key),
):
    """
    Cross-school overdue invoice fetch — used by the daily scheduled workflow.
    No X-School-Id header needed here because this runs for ALL schools.

    Filters:
    - Only schools with active subscriptions (subscription_active=true)
    - Only invoices 3-60 days past their due_date
    - Excludes students with no guardian_phone
    """
    statuses = [s.strip() for s in status.split(",")]
    now = datetime.now(timezone.utc)
    min_due_date = (now - timedelta(days=days_overdue_max)).isoformat()
    max_due_date = (now - timedelta(days=days_overdue_min)).isoformat()

    # First get schools with active subscriptions
    if subscription_active:
        schools_result = (
            supabase_admin.table("schools")
            .select("id, name")
            .eq("subscription_status", "active")
            .execute()
        )
        active_school_ids = [s["id"] for s in (schools_result.data or [])]
        if not active_school_ids:
            return {"data": [], "count": 0}
    else:
        active_school_ids = None  # All schools

    # Fetch overdue invoices
    query = (
        supabase_admin.table("invoices")
        .select(
            "id, school_id, student_id, total_amount, amount_paid, "
            "due_date, payment_token, "
            "students(first_name, last_name, guardian_phone), "
            "schools(name)"
        )
        .in_("status", statuses)
        .lt("due_date", max_due_date)    # Due date is in the past
        .gt("due_date", min_due_date)    # But not too far in the past
    )

    if active_school_ids:
        query = query.in_("school_id", active_school_ids)

    result = query.execute()

    overdue_list = []
    for inv in (result.data or []):
        s   = inv.get("students") or {}
        sch = inv.get("schools") or {}
        phone = s.get("guardian_phone") or ""
        if not phone:
            continue

        outstanding = float(
            Decimal(str(inv["total_amount"])) - Decimal(str(inv["amount_paid"]))
        )
        if outstanding <= 0:
            continue

        # Calculate actual days overdue
        due_date = datetime.fromisoformat(inv["due_date"].replace("Z", "+00:00"))
        days_overdue = (now - due_date).days

        overdue_list.append({
            "invoice_id":          inv["id"],
            "school_id":           inv["school_id"],
            "student_id":          inv["student_id"],
            "student_name":        f"{s.get('first_name', '')} {s.get('last_name', '')}".strip(),
            "guardian_phone":      phone,
            "school_name":         sch.get("name", "Your School"),
            "outstanding_balance": outstanding,
            "days_overdue":        days_overdue,
            "payment_token":       inv["payment_token"],
        })

    logger.info(f"[Internal] Overdue invoices: {len(overdue_list)} found across all schools")
    return {"data": overdue_list, "count": len(overdue_list)}


# ── 4. Notification Log Writer ───────────────────────────────────────────────
# Called by: All 3 workflows after sending SMS/WhatsApp

@router.post("/notification-log")
async def write_notification_log(
    body: dict,
    _: bool = Depends(verify_internal_key),
):
    """
    n8n calls this to write a record to notification_logs after
    each SMS/WhatsApp attempt. Records delivery status from Termii.

    The notification_logs table (from migration 001) tracks:
    - What was sent
    - Who it was sent to
    - Whether it succeeded
    - Message preview (for debugging)
    """
    try:
        supabase_admin.table("notification_logs").insert({
            "school_id":         body.get("school_id"),
            "student_id":        body.get("student_id"),
            "payment_id":        body.get("payment_id"),
            "phone":             body.get("phone"),
            "notification_type": body.get("notification_type", "unknown"),
            "sms_status":        body.get("sms_status"),
            "whatsapp_status":   body.get("whatsapp_status"),
            "urgency_level":     body.get("urgency_level"),
            "days_overdue":      body.get("days_overdue"),
            "message_preview":   body.get("message_preview", "")[:200],  # Trim to 200 chars
            "sent_at":           datetime.now(timezone.utc).isoformat(),
        }).execute()
        return {"status": "logged"}
    except Exception as e:
        logger.error(f"[Internal] Failed to write notification log: {e}")
        # Return 200 anyway — n8n should not retry just because of a log failure
        return {"status": "log_failed", "error": str(e)}
