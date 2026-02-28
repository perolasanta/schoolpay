# app/services/invoice_service.py
#
# School-level queries → SchoolDB (school admin's operations)
# Platform-level queries → supabase_admin (your subscription billing)
# The line is clear: school generates invoices for students (SchoolDB),
# you generate a subscription invoice for the school (supabase_admin).

from typing import Optional
from uuid import UUID
from decimal import Decimal
from datetime import datetime, timezone, date, timedelta

from fastapi import HTTPException, status

from app.core.database import SchoolDB, supabase_admin
from app.core.config import settings
from app.schemas.fees import GenerateInvoicesRequest, GenerateInvoicesResponse
from app.schemas.common import PaginationParams
from app.services.activity_service import log_activity
import logging

logger = logging.getLogger(__name__)


async def generate_term_invoices(
    school_id: str,
    data: GenerateInvoicesRequest,
    generated_by: str,
) -> GenerateInvoicesResponse:
    """
    The "Generate Term Bills" button — run by school_admin.

    School-level reads/writes all go through SchoolDB.
    Only the final step (_generate_platform_subscription) uses
    supabase_admin because it writes to YOUR platform_subscriptions table,
    which lives outside the school's data boundary.
    """
    db = SchoolDB(school_id)
    term_id = str(data.term_id)

    # Validate term belongs to this school
    term_result = (
        db.select("terms", "id, name, session_id, academic_sessions(name)")
        .eq("id", term_id)
        .maybe_single()
        .execute()
    )
    if not term_result.data:
        raise HTTPException(status_code=404, detail="Term not found")

    term        = term_result.data
    session_id  = term["session_id"]
    term_name   = term["name"]
    session_name = (term.get("academic_sessions") or {}).get("name", "")

    # All active enrollments for this session
    enrollments_result = (
        db.select(
            "student_enrollments",
            "student_id, class_id, students(scholarship_percent, status)",
        )
        .eq("session_id", session_id)
        .eq("is_active", True)
        .execute()
    )
    enrollments = enrollments_result.data or []

    if not enrollments:
        raise HTTPException(
            status_code=400,
            detail="No active student enrollments found for this session. "
                   "Enroll students first.",
        )

    # Fee structures for this term, keyed by class_id
    fs_result = (
        db.select("fee_structures", "id, class_id, due_date, fee_line_items(*)")
        .eq("term_id", term_id)
        .eq("is_active", True)
        .execute()
    )
    fee_map = {fs["class_id"]: fs for fs in (fs_result.data or [])}

    # Students who already have invoices this term (skip them)
    existing_result = (
        db.select("invoices", "student_id")
        .eq("term_id", term_id)
        .execute()
    )
    already_invoiced = {r["student_id"] for r in (existing_result.data or [])}

    invoices_to_insert = []
    line_item_map      = []   # parallel list to invoices_to_insert
    skipped            = 0

    for enrollment in enrollments:
        student_id = enrollment["student_id"]
        class_id   = enrollment["class_id"]
        student    = enrollment.get("students") or {}

        if student.get("status", "active") != "active":
            skipped += 1
            continue

        if student_id in already_invoiced:
            skipped += 1
            continue

        fee_structure = fee_map.get(class_id)
        if not fee_structure:
            logger.warning(f"No fee structure for class {class_id}, term {term_id}. Skipping {student_id}.")
            skipped += 1
            continue

        line_items = fee_structure.get("fee_line_items") or []
        items_to_bill = [li for li in line_items if li["is_mandatory"]]
        if data.include_optional_fees:
            items_to_bill += [li for li in line_items if not li["is_mandatory"]]

        subtotal       = sum(Decimal(str(li["amount"])) for li in items_to_bill)
        scholarship_pct = Decimal(str(student.get("scholarship_percent", 0)))
        discount       = (subtotal * scholarship_pct / 100).quantize(Decimal("0.01"))

        arrears = Decimal("0")
        if data.apply_arrears:
            arrears = await _get_student_arrears(db, student_id, term_id, session_id)

        total = subtotal - discount + arrears

        invoices_to_insert.append({
            "student_id":       student_id,
            "term_id":          term_id,
            "fee_structure_id": fee_structure["id"],
            "subtotal":         float(subtotal),
            "discount_amount":  float(discount),
            "arrears_amount":   float(arrears),
            "late_fee_amount":  0,
            "total_amount":     float(total),
            "amount_paid":      0,
            "status":           "unpaid",
            "due_date":         fee_structure.get("due_date"),
            "currency":         "NGN",
            "generated_by":     generated_by,
            "generated_at":     datetime.now(timezone.utc).isoformat(),
        })
        line_item_map.append(items_to_bill)

    if not invoices_to_insert:
        return GenerateInvoicesResponse(
            term_id=data.term_id,
            term_name=f"{term_name} {session_name}".strip(),
            generated_count=0,
            skipped_count=skipped,
            total_expected=Decimal("0"),
            message=f"No new invoices to generate. {skipped} already existed or were skipped.",
        )

    # Bulk insert (school_id stamped automatically by SchoolDB)
    inserted = db.insert_many("invoices", invoices_to_insert)
    generated_count = len(inserted)

    # Snapshot line items for each invoice
    snapshot_rows = []
    for invoice, items in zip(inserted, line_item_map):
        for li in items:
            snapshot_rows.append({
                "invoice_id":   invoice["id"],
                "name":         li["name"],
                "category":     li["category"],
                "amount":       float(li["amount"]),
                "is_mandatory": li["is_mandatory"],
            })
    if snapshot_rows:
        db.insert_many("invoice_line_items", snapshot_rows)

    # Generate YOUR subscription invoice for this school (platform-level)
    # This is the only part that uses supabase_admin — it writes to your table
    await _generate_platform_subscription(
        school_id=school_id,
        term_label=f"{term_name} {session_name}".strip(),
        active_student_count=generated_count + skipped,
    )

    total_expected = sum(Decimal(str(inv["total_amount"])) for inv in inserted)

    await log_activity(
        school_id=school_id, user_id=generated_by,
        action="invoice.generated", entity_type="term", entity_id=term_id,
        metadata={"term": term_name, "generated": generated_count,
                  "skipped": skipped, "total": float(total_expected)},
    )

    return GenerateInvoicesResponse(
        term_id=data.term_id,
        term_name=f"{term_name} {session_name}".strip(),
        generated_count=generated_count,
        skipped_count=skipped,
        total_expected=total_expected,
        message=(
            f"Generated {generated_count} invoices totalling "
            f"₦{total_expected:,.2f}."
            + (f" {skipped} skipped." if skipped else "")
        ),
    )


async def get_invoice_by_token(payment_token: str) -> dict:
    """
    Public endpoint — no auth. Parent opens pay link.
    Uses supabase_admin here because there is no school_id in scope yet
    (we're looking up the invoice by its token, not by school).
    The token itself is the access credential.
    """
    result = (
        supabase_admin.table("invoices")
        .select(
            "id, student_id, term_id, subtotal, discount_amount, "
            "arrears_amount, late_fee_amount, total_amount, amount_paid, "
            "status, due_date, currency, payment_token, "
            "students(first_name, last_name), "
            "terms(name, academic_sessions(name)), "
            "schools(name), "
            "invoice_line_items(*)"
        )
        .eq("payment_token", payment_token)
        .maybe_single()
        .execute()
    )
    if not result.data:
        raise HTTPException(
            status_code=404,
            detail="Invoice not found. This link may be invalid.",
        )

    inv      = result.data
    student  = inv.get("students") or {}
    term     = inv.get("terms") or {}
    session  = (term.get("academic_sessions") or {})
    school   = inv.get("schools") or {}
    total    = Decimal(str(inv["total_amount"]))
    paid     = Decimal(str(inv["amount_paid"]))

    return {
        "invoice_id":   inv["id"],
        "school_name":  school.get("name", ""),
        "student_name": f"{student.get('first_name', '')} {student.get('last_name', '')}".strip(),
        "class_name":   None,   # populated in route if needed
        "term_name":    term.get("name", ""),
        "session_name": session.get("name", ""),
        "total_amount": total,
        "amount_paid":  paid,
        "balance":      total - paid,
        "status":       inv["status"],
        "due_date":     inv.get("due_date"),
        "currency":     inv.get("currency", "NGN"),
        "line_items":   inv.get("invoice_line_items") or [],
        "paystack_public_key": "",
    }


async def list_invoices(
    school_id: str,
    term_id: str,
    params: PaginationParams,
    status_filter: Optional[str] = None,
    class_id: Optional[str] = None,
) -> tuple[list, int]:
    db = SchoolDB(school_id)

    # Fetch all matching rows from the view (paginate in Python for accurate count)
    query = (
        db.raw()
        .from_("v_student_fee_status")
        .select("*")
        .eq("school_id", school_id)
        .eq("term_id", term_id)
    )
    if status_filter:
        statuses = [s.strip() for s in str(status_filter).split(",") if s.strip()]
        if len(statuses) == 1:
            query = query.eq("payment_status", statuses[0])
        elif statuses:
            query = query.in_("payment_status", statuses)
    if class_id:
        query = query.eq("class_id", class_id)
    if params.search:
        s = params.search.strip()
        query = query.or_(f"full_name.ilike.%{s}%,admission_number.ilike.%{s}%")

    result = (
        query
        .order("last_name", desc=False)
        .execute()
    )
    all_rows = result.data or []
    total = len(all_rows)

    # Paginate in Python
    paginated = all_rows[params.offset: params.offset + params.page_size]

    # ── Normalise field names for the frontend ──────────────────
    # The view uses 'payment_status' and 'invoice_id' but the frontend
    # expects 'status' and 'id'. We map them here so the frontend
    # never needs to know about the view's internal naming.
    # ── Fetch latest payment IDs for the receipt PDF link ─────
    # Build a map of invoice_id → latest successful payment id
    invoice_ids = [row.get("invoice_id") for row in paginated if row.get("invoice_id")]
    payment_map: dict = {}
    if invoice_ids:
        pay_result = (
            db.raw()
            .from_("payments")
            .select("id, invoice_id, created_at")
            .eq("school_id", school_id)
            .eq("status", "success")
            .in_("invoice_id", invoice_ids)
            .order("created_at", desc=True)
            .execute()
        )
        for p in (pay_result.data or []):
            inv_id = p["invoice_id"]
            if inv_id not in payment_map:   # first = most recent (desc order)
                payment_map[inv_id] = p["id"]

    items = []
    for row in paginated:
        invoice_id = row.get("invoice_id")
        items.append({
            "id":               invoice_id,
            "student_id":       row.get("student_id"),
            "student_name":     row.get("full_name"),
            "first_name":       row.get("first_name"),
            "last_name":        row.get("last_name"),
            "admission_number": row.get("admission_number"),
            "guardian_phone":   row.get("guardian_phone"),
            "class_name":       row.get("class_name"),
            "arm":              row.get("arm"),
            "total_amount":     float(row.get("total_amount") or 0),
            "amount_paid":      float(row.get("amount_paid") or 0),
            "balance":          float(row.get("balance") or 0),
            "status":           row.get("payment_status"),
            "due_date":         row.get("due_date"),
            "is_overdue":       row.get("is_overdue"),
            "payment_token":    row.get("payment_token"),
            "latest_payment_id": payment_map.get(invoice_id),
        })

    return items, total


# ── Internal helpers ─────────────────────────────────────────

async def _get_student_arrears(
    db: SchoolDB,
    student_id: str,
    current_term_id: str,
    session_id: str,
) -> Decimal:
    """Find unpaid balance from the previous term in this session."""
    prev = (
        db.select("terms", "id")
        .eq("session_id", session_id)
        .neq("id", current_term_id)
        .order("start_date", desc=True)
        .limit(1)
        .execute()
    )
    if not prev.data:
        return Decimal("0")

    prev_term_id = prev.data[0]["id"]
    inv = (
        db.select("invoices", "total_amount, amount_paid")
        .eq("student_id", student_id)
        .eq("term_id", prev_term_id)
        .in_("status", ["unpaid", "partial"])
        .maybe_single()
        .execute()
    )
    if not inv.data:
        return Decimal("0")

    balance = Decimal(str(inv.data["total_amount"])) - Decimal(str(inv.data["amount_paid"]))
    return max(balance, Decimal("0"))


async def _generate_platform_subscription(
    school_id: str,
    term_label: str,
    active_student_count: int,
) -> None:
    """
    Write YOUR invoice to the school into platform_subscriptions.
    This uses supabase_admin because platform_subscriptions is YOUR
    table — school admins must not be able to write to it directly.
    """
    # Idempotent — don't create a duplicate for the same term
    existing = (
        supabase_admin.table("platform_subscriptions")
        .select("id")
        .eq("school_id", school_id)
        .eq("term_label", term_label)
        .maybe_single()
        .execute()
    )
    if existing.data:
        return

    billable = max(active_student_count, settings.MINIMUM_BILLABLE_STUDENTS)
    price    = Decimal(str(settings.PLATFORM_FEE_PER_STUDENT))
    total    = price * billable

    school = (
        supabase_admin.table("schools")
        .select("referral_discount")
        .eq("id", school_id)
        .maybe_single()
        .execute()
    )
    referral_pct = Decimal(str((school.data or {}).get("referral_discount", 0)))
    discount     = (total * referral_pct / 100).quantize(Decimal("0.01"))
    amount_due   = total - discount

    due_date          = date.today() + timedelta(days=14)
    grace_period_ends = due_date + timedelta(days=settings.GRACE_PERIOD_DAYS)

    supabase_admin.table("platform_subscriptions").insert({
        "school_id":          school_id,
        "term_label":         term_label,
        "student_count":      billable,
        "price_per_student":  float(price),
        "total_amount":       float(total),
        "discount_amount":    float(discount),
        "amount_due":         float(amount_due),
        "status":             "pending",
        "due_date":           due_date.isoformat(),
        "grace_period_ends":  grace_period_ends.isoformat(),
    }).execute()
