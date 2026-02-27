# ============================================================
# app/api/v1/endpoints/payments.py
#
# Client usage is clear and deliberate:
#
#   SchoolDB       → cash payments, transfer approval, void,
#                    payment history — all school-admin/bursar ops
#
#   supabase_admin → Paystack webhook ONLY
#                    Reason: webhook has no user JWT — it comes
#                    directly from Paystack's servers. We verify
#                    HMAC signature as the credential instead.
#                    We still manually verify school ownership
#                    via the invoice record itself.
#
#   httpx          → outbound calls to Paystack API and n8n
# ============================================================

import hashlib
import hmac
import json
from decimal import Decimal
from typing import Optional, List
from datetime import datetime, timezone

import httpx
from fastapi import APIRouter, Depends, HTTPException, Request, Query, status
from fastapi.responses import StreamingResponse

# We import generate_receipt_pdf inside the endpoint function to avoid circular imports,
# since it also imports some of the same database models.

from app.core.config import settings
from app.core.database import SchoolDB, supabase_admin
from app.core.security import CurrentUser, get_active_user, require_roles
from app.schemas.payments import (
    InitializePaymentRequest, InitializePaymentResponse,
    CashPaymentRequest, BankTransferRequest,
    ApproveTransferRequest, VoidPaymentRequest,
    PaymentResponse, PendingTransferItem,
)
from app.schemas.common import APIResponse
from app.services.activity_service import log_activity
from app.utils.receipt import generate_receipt_number
from app.utils.sms import notify_payment_to_n8n
from app.utils.pdf_receipt import generate_receipt_pdf

router = APIRouter(prefix="/payments", tags=["Payments"])


# ═══════════════════════════════════════════════════════════
# FLOW 1: PAYSTACK ONLINE — initialize
# ═══════════════════════════════════════════════════════════

@router.post("/initialize", response_model=APIResponse[InitializePaymentResponse])
async def initialize_payment(body: InitializePaymentRequest):
    """
    Called from the parent's browser on the public payment page.
    No JWT — the payment_token is the credential (from the SMS link).
    Uses supabase_admin because there is no user session.
    """
    invoice = (
        supabase_admin.table("invoices")
        .select("id, school_id, student_id, total_amount, amount_paid, status, currency")
        .eq("payment_token", str(body.payment_token))
        .maybe_single()
        .execute()
    )
    if not invoice.data:
        raise HTTPException(status_code=404, detail="Invoice not found")

    inv = invoice.data
    if inv["status"] == "paid":
        raise HTTPException(status_code=400, detail="This invoice is already fully paid.")

    balance = Decimal(str(inv["total_amount"])) - Decimal(str(inv["amount_paid"]))

    async with httpx.AsyncClient() as client:
        resp = await client.post(
            f"{settings.PAYSTACK_BASE_URL}/transaction/initialize",
            headers={"Authorization": f"Bearer {settings.PAYSTACK_SECRET_KEY}"},
            json={
                "email":    body.email,
                "amount":   int(balance * 100),       # kobo
                "currency": inv.get("currency", "NGN"),
                "metadata": {
                    "invoice_id":    str(body.invoice_id),
                    "school_id":     inv["school_id"],
                    "student_id":    inv["student_id"],
                    "payment_token": str(body.payment_token),
                },
                "callback_url": f"{settings.FRONTEND_URL}/payment/callback",
            },
        )

    if resp.status_code != 200:
        raise HTTPException(status_code=502, detail="Could not create payment. Try again.")

    data = resp.json()["data"]

    # Record a pending payment row so the webhook can find it by reference
    supabase_admin.table("invoices").select("school_id").eq("id", str(body.invoice_id)).execute()
    supabase_admin.table("payments").insert({
        "school_id":      inv["school_id"],
        "invoice_id":     str(body.invoice_id),
        "student_id":     inv["student_id"],
        "amount":         float(balance),
        "payment_method": "paystack",
        "reference":      data["reference"],
        "status":         "pending",
        "currency":       inv.get("currency", "NGN"),
    }).execute()

    return APIResponse(data=InitializePaymentResponse(
        authorization_url=data["authorization_url"],
        access_code=data["access_code"],
        reference=data["reference"],
    ))


# ═══════════════════════════════════════════════════════════
# FLOW 1: PAYSTACK WEBHOOK — Paystack calls this, not the user
# ═══════════════════════════════════════════════════════════

@router.post("/webhook/paystack")
async def paystack_webhook(request: Request):
    """
    Paystack calls this endpoint directly — no user JWT exists.
    HMAC signature verification is the ONLY credential check.
    We use supabase_admin here because:
      1. No JWT to work with
      2. We still verify school ownership via the stored payment record
      3. The HMAC check ensures only Paystack can trigger this
    """
    body_bytes = await request.body()

    # Verify HMAC — reject immediately if wrong
    expected = hmac.new(
        settings.PAYSTACK_WEBHOOK_SECRET.encode(),
        body_bytes,
        hashlib.sha512,
    ).hexdigest()
    received = request.headers.get("x-paystack-signature", "")

    if not hmac.compare_digest(expected, received):
        raise HTTPException(status_code=400, detail="Invalid signature")

    event = json.loads(body_bytes)
    if event.get("event") != "charge.success":
        return {"status": "ignored"}

    data      = event["data"]
    reference = data.get("reference")
    metadata  = data.get("metadata") or {}
    invoice_id = metadata.get("invoice_id")

    if not reference or not invoice_id:
        return {"status": "missing_data"}

    # Find the pending payment we created during initialize
    payment = (
        supabase_admin.table("payments")
        .select("id, school_id, student_id, amount")
        .eq("reference", reference)
        .eq("status", "pending")
        .maybe_single()
        .execute()
    )
    if not payment.data:
        return {"status": "already_processed"}

    pay = payment.data
    receipt_number = generate_receipt_number()

    supabase_admin.table("payments").update({
        "status":         "success",
        "approval_status": "approved",
        "receipt_number": receipt_number,
        "payment_date":   datetime.now(timezone.utc).isoformat(),
    }).eq("id", pay["id"]).execute()
    # DB trigger auto-updates invoice status

    await log_activity(
        school_id=pay["school_id"],
        action="payment.paystack_confirmed",
        entity_type="payment", entity_id=pay["id"],
        metadata={"reference": reference, "amount": pay["amount"]},
    )
    await notify_payment_to_n8n(
        payment_id=pay["id"], school_id=pay["school_id"],
        student_id=pay["student_id"], amount=pay["amount"],
        receipt_number=receipt_number, payment_method="paystack",
    )
    return {"status": "processed"}


# ═══════════════════════════════════════════════════════════
# FLOW 2: BANK TRANSFER
# ═══════════════════════════════════════════════════════════

@router.post("/transfer", response_model=APIResponse[PaymentResponse], status_code=201)
async def record_bank_transfer(
    body: BankTransferRequest,
    user: CurrentUser = Depends(get_active_user),
):
    """Record a bank transfer — stays pending until bursar approves."""
    db = SchoolDB(str(user.school_id))
    invoice = db.require_one("invoices", str(body.invoice_id), "id, student_id")

    row = db.insert("payments", {
        "invoice_id":       str(body.invoice_id),
        "student_id":       invoice["student_id"],
        "amount":           float(body.amount),
        "payment_method":   "bank_transfer",
        "reference":        body.reference,
        "narration":        body.narration,
        "payment_date":     body.payment_date.isoformat() if body.payment_date else datetime.now(timezone.utc).isoformat(),
        "branch":           body.branch,
        "late_fee_amount":  float(body.late_fee_amount),
        "status":           "pending",
        "approval_status":  "pending_approval",
        "currency":         "NGN",
        "recorded_by":      str(user.user_id),
    })

    await log_activity(
        school_id=str(user.school_id), user_id=str(user.user_id),
        action="payment.transfer_submitted", entity_type="payment", entity_id=row["id"],
        metadata={"amount": float(body.amount), "reference": body.reference},
    )
    return APIResponse(data=row, message="Transfer recorded. Awaiting bursar approval.")


@router.post("/transfer/approve", response_model=APIResponse[PaymentResponse])
async def approve_bank_transfer(
    body: ApproveTransferRequest,
    user: CurrentUser = Depends(require_roles("school_admin", "bursar")),
):
    """Bursar approves or rejects a pending bank transfer."""
    db = SchoolDB(str(user.school_id))

    # Verify the payment exists and belongs to this school
    payment = (
        db.select("payments", "*")
        .eq("id", str(body.payment_id))
        .eq("approval_status", "pending_approval")
        .maybe_single()
        .execute()
    )
    if not payment.data:
        raise HTTPException(status_code=404, detail="Payment not found or already processed")

    pay = payment.data
    now = datetime.now(timezone.utc).isoformat()

    if body.action == "approved":
        receipt_number = generate_receipt_number()
        db.update("payments", {
            "status":         "success",
            "approval_status": "approved",
            "receipt_number": receipt_number,
            "approved_by":    str(user.user_id),
            "approved_at":    now,
        }, record_id=str(body.payment_id))

        await log_activity(
            school_id=str(user.school_id), user_id=str(user.user_id),
            action="payment.transfer_approved", entity_type="payment",
            entity_id=str(body.payment_id),
            metadata={"amount": pay["amount"], "notes": body.notes},
        )
        await notify_payment_to_n8n(
            payment_id=str(body.payment_id), school_id=str(user.school_id),
            student_id=pay["student_id"], amount=pay["amount"],
            receipt_number=receipt_number, payment_method="bank_transfer",
        )
        message = "Transfer approved. SMS sent to parent."

    else:
        db.update("payments", {
            "status":         "failed",
            "approval_status": "rejected",
            "void_reason":    body.notes,
            "approved_by":    str(user.user_id),
            "approved_at":    now,
        }, record_id=str(body.payment_id))

        await log_activity(
            school_id=str(user.school_id), user_id=str(user.user_id),
            action="payment.transfer_rejected", entity_type="payment",
            entity_id=str(body.payment_id),
            metadata={"reason": body.notes},
        )
        message = "Transfer rejected."

    updated = db.select("payments", "*").eq("id", str(body.payment_id)).maybe_single().execute()
    return APIResponse(data=updated.data, message=message)


@router.get("/transfer/pending", response_model=APIResponse[List[PendingTransferItem]])
async def list_pending_transfers(
    user: CurrentUser = Depends(require_roles("school_admin", "bursar")),
):
    """Bursar's approval queue."""
    db = SchoolDB(str(user.school_id))
    result = (
        db.select(
            "payments",
            "*, students(first_name, last_name, admission_number)",
        )
        .eq("payment_method", "bank_transfer")
        .eq("approval_status", "pending_approval")
        .order("payment_date", desc=False)
        .execute()
    )
    items = []
    for p in (result.data or []):
        s = p.get("students") or {}
        items.append(PendingTransferItem(
            id=p["id"],
            student_name=f"{s.get('first_name', '')} {s.get('last_name', '')}".strip(),
            admission_number=s.get("admission_number", ""),
            class_name=None,
            amount=Decimal(str(p["amount"])),
            reference=p["reference"],
            proof_url=p.get("proof_url"),
            payment_date=p["payment_date"],
            narration=p.get("narration"),
        ))
    return APIResponse(data=items)


# ═══════════════════════════════════════════════════════════
# FLOW 3: CASH
# ═══════════════════════════════════════════════════════════

@router.post("/cash", response_model=APIResponse[PaymentResponse], status_code=201)
async def record_cash_payment(
    body: CashPaymentRequest,
    user: CurrentUser = Depends(require_roles("school_admin", "bursar")),
):
    """Bursar records cash at the counter. Immediate success — no approval needed."""
    db = SchoolDB(str(user.school_id))
    invoice = db.require_one("invoices", str(body.invoice_id), "id, student_id")
    receipt_number = generate_receipt_number()

    row = db.insert("payments", {
        "invoice_id":        str(body.invoice_id),
        "student_id":        invoice["student_id"],
        "amount":            float(body.amount),
        "payment_method":    "cash",
        "receipt_number":    receipt_number,
        "narration":         body.narration,
        "payment_date":      body.payment_date.isoformat() if body.payment_date else datetime.now(timezone.utc).isoformat(),
        "branch":            body.branch,
        "collection_point":  body.collection_point,
        "late_fee_amount":   float(body.late_fee_amount),
        "status":            "success",
        "approval_status":   "approved",
        "currency":          "NGN",
        "recorded_by":       str(user.user_id),
    })

    await log_activity(
        school_id=str(user.school_id), user_id=str(user.user_id),
        action="payment.cash_recorded", entity_type="payment", entity_id=row["id"],
        metadata={"amount": float(body.amount), "receipt": receipt_number},
    )
    await notify_payment_to_n8n(
        payment_id=row["id"], school_id=str(user.school_id),
        student_id=invoice["student_id"], amount=float(body.amount),
        receipt_number=receipt_number, payment_method="cash",
    )
    return APIResponse(
        data=row,
        message=f"Cash payment of ₦{body.amount:,.2f} recorded. Receipt: {receipt_number}",
    )


# ═══════════════════════════════════════════════════════════
# VOID — only school_admin, never bursar
# ═══════════════════════════════════════════════════════════

@router.post("/void", response_model=APIResponse[PaymentResponse])
async def void_payment(
    body: VoidPaymentRequest,
    user: CurrentUser = Depends(require_roles("school_admin")),
):
    """Mark a payment as voided. NEVER deletes. DB trigger recalculates invoice."""
    db = SchoolDB(str(user.school_id))

    payment = (
        db.select("payments", "id, amount")
        .eq("id", str(body.payment_id))
        .eq("is_voided", False)
        .maybe_single()
        .execute()
    )
    if not payment.data:
        raise HTTPException(status_code=404, detail="Payment not found or already voided")

    db.update("payments", {
        "is_voided":    True,
        "void_reason":  body.reason,
        "voided_by":    str(user.user_id),
        "voided_at":    datetime.now(timezone.utc).isoformat(),
    }, record_id=str(body.payment_id))

    await log_activity(
        school_id=str(user.school_id), user_id=str(user.user_id),
        action="payment.voided", entity_type="payment", entity_id=str(body.payment_id),
        metadata={"reason": body.reason, "original_amount": payment.data["amount"]},
    )
    updated = db.select("payments", "*").eq("id", str(body.payment_id)).maybe_single().execute()
    return APIResponse(data=updated.data, message="Payment voided")


# ═══════════════════════════════════════════════════════════
# PAYMENT HISTORY
# ═══════════════════════════════════════════════════════════

@router.get("/history/{invoice_id}", response_model=APIResponse[List[PaymentResponse]])
async def get_payment_history(
    invoice_id: str,
    user: CurrentUser = Depends(get_active_user),
):
    """All payments (including voided) for a specific invoice."""
    db = SchoolDB(str(user.school_id))
    result = (
        db.select("payments", "*, users(full_name)")
        .eq("invoice_id", invoice_id)
        .order("payment_date", desc=True)
        .execute()
    )
    payments = []
    for p in (result.data or []):
        p["recorded_by_name"] = (p.get("users") or {}).get("full_name")
        payments.append(p)
    return APIResponse(data=payments)


@router.get("/receipt/{payment_id}/pdf")
async def download_receipt_pdf(
    payment_id: str,
    user: CurrentUser = Depends(get_active_user),
):
    """
    Staff dashboard: download a PDF receipt for any payment by ID.
    Requires JWT — school_id is verified automatically.

    The parent-facing receipt download lives at:
        GET /pay/{token}/receipt
    and requires a payment_token instead of JWT.

    This endpoint is for:
    - Re-printing a receipt at the bursar counter
    - Attaching to a school's accounting records
    - Sending a copy to a parent who lost theirs
    """
    from fastapi.responses import StreamingResponse
    from app.utils.pdf_receipt import generate_receipt_pdf

    db = SchoolDB(str(user.school_id))

    # Fetch payment with all related data in one query
    payment = (
        db.select(
            "payments",
            "*, "
            "invoices(total_amount, amount_paid, term_id, "
            "  students(first_name, last_name, admission_number), "
            "  terms(name, academic_sessions(name)), "
            "  invoice_line_items(*)"
            "), "
            "users(full_name)"
        )
        .eq("id", payment_id)
        .eq("status", "success")
        .eq("is_voided", False)
        .maybe_single()
        .execute()
    )

    if not payment.data:
        raise HTTPException(
            status_code=404,
            detail="Payment not found, not yet confirmed, or has been voided."
        )

    pay     = payment.data
    inv     = pay.get("invoices") or {}
    student = inv.get("students") or {}
    term    = inv.get("terms") or {}
    session = (term.get("academic_sessions") or {})

    # Fetch school details for the receipt header
    school_result = (
        supabase_admin.table("schools")
        .select("name, address, phone")
        .eq("id", str(user.school_id))
        .maybe_single()
        .execute()
    )
    school = school_result.data or {}

    # Amount paid BEFORE this payment (for balance history)
    previous_payments = (
        db.select("payments", "amount")
        .eq("invoice_id", pay["invoice_id"])
        .eq("status", "success")
        .eq("is_voided", False)
        .lt("payment_date", pay["payment_date"])
        .execute()
    )
    paid_before = sum(
        Decimal(str(p["amount"])) for p in (previous_payments.data or [])
    )

    outstanding_after = (
        Decimal(str(inv.get("total_amount", 0))) -
        Decimal(str(inv.get("amount_paid", 0)))
    )

    buf = generate_receipt_pdf(
        receipt_number=pay.get("receipt_number") or "—",
        school_name=school.get("name", "School"),
        student_name=f"{student.get('first_name', '')} {student.get('last_name', '')}".strip(),
        student_admission=student.get("admission_number", ""),
        class_name="",
        term_name=term.get("name", ""),
        session_name=session.get("name", ""),
        payment_method=pay.get("payment_method", ""),
        payment_date=pay.get("payment_date"),
        amount_paid=Decimal(str(pay["amount"])),
        total_amount=Decimal(str(inv.get("total_amount", 0))),
        amount_paid_before=paid_before,
        outstanding_after=outstanding_after,
        line_items=inv.get("invoice_line_items") or [],
        recorded_by=(pay.get("users") or {}).get("full_name", ""),
        reference=pay.get("reference", ""),
        narration=pay.get("narration", ""),
        school_address=school.get("address", ""),
        school_phone=school.get("phone", ""),
    )

    receipt_no = pay.get("receipt_number") or payment_id[:8]
    filename   = f"{receipt_no.replace('/', '-')}.pdf"

    return StreamingResponse(
        buf,
        media_type="application/pdf",
        headers={"Content-Disposition": f"attachment; filename={filename}"},
    )