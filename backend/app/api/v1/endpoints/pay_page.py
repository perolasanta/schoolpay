# ============================================================
# app/api/v1/endpoints/pay_page.py
#
# PUBLIC PAYMENT PAGE — No JWT required.
#
# The payment_token from the SMS link is the ONLY credential.
# This is by design. Parents don't have accounts. They receive
# a unique link and pay. Simple, fast, high conversion.
#
# Security model:
#   - payment_token is a UUID v4 (cryptographically random, 122 bits)
#   - Tokens are NOT sequential — impossible to guess
#   - Token is ONE-TIME use (invoice paid → page shows "Paid" status)
#   - No personal data is exposed beyond what's on the invoice
#
# Endpoints:
#   GET  /pay/{token}           → Returns invoice data for the payment page
#   POST /pay/{token}/paystack  → Initialises Paystack, returns redirect URL
#   GET  /pay/{token}/status    → Polls payment status (after Paystack callback)
# ============================================================

import hashlib
import hmac
import json
from decimal import Decimal
from datetime import datetime, timezone

import httpx
from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, EmailStr

from app.core.config import settings
from app.core.database import supabase_admin
from app.services.invoice_service import get_invoice_by_token
from app.utils.pdf_receipt import generate_receipt_pdf
from app.utils.receipt import generate_receipt_number
from app.services.activity_service import log_activity
from app.utils.sms import notify_payment_to_n8n

router = APIRouter(prefix="/pay", tags=["Parent Payment Page"])


# ── GET /pay/{token} ──────────────────────────────────────────
# React payment page calls this on load to get invoice details.
# Returns everything the page needs to render.

@router.get("/{token}")
async def get_payment_page(token: str):
    """
    Returns invoice details for the public payment page.
    No authentication — the token is the credential.

    What the parent sees:
    - School name
    - Their child's name
    - Term and session
    - Fee breakdown (line items)
    - Total, amount paid, balance due
    - Payment options available

    What we NEVER return:
    - Other students' data
    - School's internal IDs (we return token-scoped data only)
    - Any admin-level information
    """
    inv = await get_invoice_by_token(token)

    # Enrich with Paystack public key (safe — this is the PUBLIC key)
    inv["paystack_public_key"] = settings.PAYSTACK_PUBLIC_KEY
    inv["payment_token"] = token

    # Don't show the payment form if already fully paid
    balance = Decimal(str(inv["balance"]))
    inv["can_pay_online"] = balance > 0 and inv["status"] != "paid"

    return inv


# ── POST /pay/{token}/paystack ────────────────────────────────
# Parent clicks "Pay Online" → we call Paystack Initialize API
# → return the authorization_url → frontend redirects parent.

class InitiateOnlinePayment(BaseModel):
    email: EmailStr     # Paystack needs an email for their receipt


@router.post("/{token}/paystack")
async def initiate_paystack_payment(token: str, body: InitiateOnlinePayment):
    """
    Initialises a Paystack transaction for the invoice identified by token.

    Flow:
    1. Validate token → get invoice
    2. Check invoice is not already paid
    3. Call Paystack Initialize → get authorization_url
    4. Store pending payment row (so webhook can find it by reference)
    5. Return authorization_url to parent's browser
    6. Parent is redirected to Paystack checkout
    7. After payment, Paystack calls our webhook (/api/v1/payments/webhook/paystack)
    8. Webhook verifies HMAC, updates payment row, triggers n8n SMS

    IMPORTANT: Never mark the invoice paid here. ONLY the webhook does that.
    The frontend callback from Paystack is NOT trustworthy — anyone can fake it.
    """
    # Get invoice (raises 404 if token invalid)
    inv_result = (
        supabase_admin.table("invoices")
        .select(
            "id, school_id, student_id, total_amount, amount_paid, "
            "status, currency, payment_token"
        )
        .eq("payment_token", token)
        .maybe_single()
        .execute()
    )
    if not inv_result.data:
        raise HTTPException(status_code=404, detail="Invoice not found")

    inv = inv_result.data

    if inv["status"] == "paid":
        raise HTTPException(
            status_code=400,
            detail="This invoice is already fully paid. No further payment needed."
        )

    balance = Decimal(str(inv["total_amount"])) - Decimal(str(inv["amount_paid"]))
    if balance <= 0:
        raise HTTPException(status_code=400, detail="No outstanding balance on this invoice.")

    # Initialize with Paystack
    async with httpx.AsyncClient(timeout=15.0) as client:
        resp = await client.post(
            f"{settings.PAYSTACK_BASE_URL}/transaction/initialize",
            headers={"Authorization": f"Bearer {settings.PAYSTACK_SECRET_KEY}"},
            json={
                "email":    body.email,
                "amount":   int(balance * 100),     # Paystack uses kobo
                "currency": inv.get("currency", "NGN"),
                "metadata": {
                    "invoice_id":    inv["id"],
                    "school_id":     inv["school_id"],
                    "student_id":    inv["student_id"],
                    "payment_token": token,
                    # Custom fields shown on Paystack receipt
                    "custom_fields": [
                        {
                            "display_name":  "Invoice Reference",
                            "variable_name": "invoice_id",
                            "value":         inv["id"],
                        }
                    ],
                },
                "callback_url": f"{settings.PAYMENT_PAGE_URL}/pay/{token}/callback",
            },
        )

    if resp.status_code != 200:
        raise HTTPException(
            status_code=502,
            detail="Could not initiate payment. Please try again or use bank transfer."
        )

    data = resp.json()["data"]

    # Store pending row — webhook will update this to success
    supabase_admin.table("payments").insert({
        "school_id":      inv["school_id"],
        "invoice_id":     inv["id"],
        "student_id":     inv["student_id"],
        "amount":         float(balance),
        "payment_method": "paystack",
        "reference":      data["reference"],
        "status":         "pending",
        "approval_status": "approved",   # Paystack auto-approves on success
        "currency":       inv.get("currency", "NGN"),
    }).execute()

    return {
        "authorization_url": data["authorization_url"],
        "access_code":       data["access_code"],
        "reference":         data["reference"],
    }


# ── GET /pay/{token}/status ───────────────────────────────────
# Polled by the payment page after Paystack's frontend callback.
# DO NOT update payment status here — that ONLY happens via webhook.
# This endpoint just READS the current state.

@router.get("/{token}/status")
async def get_payment_status(token: str, reference: str | None = None):
    """
    Returns the current payment status for a token.
    The React page polls this after Paystack callback to decide
    whether to show "Payment Confirmed" or "Still Processing".

    We check the payments table (not Paystack directly) because
    the webhook is the source of truth. If the webhook hasn't fired yet,
    status will still be 'pending' — the page shows a "processing" state.
    """
    inv_result = (
        supabase_admin.table("invoices")
        .select("id, total_amount, amount_paid, status")
        .eq("payment_token", token)
        .maybe_single()
        .execute()
    )
    if not inv_result.data:
        raise HTTPException(status_code=404, detail="Invoice not found")

    inv = inv_result.data

    # If a reference was provided (from Paystack callback), check that payment
    payment_data = None
    if reference:
        pay = (
            supabase_admin.table("payments")
            .select("status, receipt_number, amount, payment_date")
            .eq("reference", reference)
            .maybe_single()
            .execute()
        )
        payment_data = pay.data

    balance = Decimal(str(inv["total_amount"])) - Decimal(str(inv["amount_paid"]))

    return {
        "invoice_status":   inv["status"],
        "total_amount":     float(inv["total_amount"]),
        "amount_paid":      float(inv["amount_paid"]),
        "outstanding":      float(max(balance, Decimal("0"))),
        "is_paid":          inv["status"] == "paid",
        "payment":          payment_data,
    }


# ── GET /pay/{token}/receipt ──────────────────────────────────
# Parent can download their PDF receipt from the payment page.
# No JWT — token is the credential.

@router.get("/{token}/receipt")
async def download_receipt_by_token(token: str, payment_ref: str | None = None):
    """
    Downloads the PDF receipt for the most recent successful payment
    on this invoice. Parent gets this link on the confirmation page.

    If payment_ref is provided, returns receipt for that specific payment.
    Otherwise returns the most recent successful payment's receipt.
    """
    # Resolve invoice
    inv_result = (
        supabase_admin.table("invoices")
        .select(
            "id, school_id, student_id, total_amount, amount_paid, "
            "status, currency, term_id, "
            "students(first_name, last_name, admission_number), "
            "terms(name, academic_sessions(name)), "
            "schools(name, address, phone), "
            "invoice_line_items(*)"
        )
        .eq("payment_token", token)
        .maybe_single()
        .execute()
    )
    if not inv_result.data:
        raise HTTPException(status_code=404, detail="Invoice not found")

    inv     = inv_result.data
    student = inv.get("students") or {}
    term    = inv.get("terms") or {}
    session = (term.get("academic_sessions") or {})
    school  = inv.get("schools") or {}

    # Get the specific payment
    pay_query = (
        supabase_admin.table("payments")
        .select("*, users(full_name)")
        .eq("invoice_id", inv["id"])
        .eq("status", "success")
        .eq("is_voided", False)
    )
    if payment_ref:
        pay_query = pay_query.eq("reference", payment_ref)
    else:
        pay_query = pay_query.order("payment_date", desc=True).limit(1)

    pay_result = pay_query.maybe_single().execute()
    if not pay_result.data:
        raise HTTPException(status_code=404, detail="No successful payment found for this invoice")

    pay = pay_result.data

    # Calculate balance before this payment
    all_payments = (
        supabase_admin.table("payments")
        .select("amount, payment_date")
        .eq("invoice_id", inv["id"])
        .eq("status", "success")
        .eq("is_voided", False)
        .lt("payment_date", pay["payment_date"])   # payments BEFORE this one
        .execute()
    )
    paid_before = sum(
        Decimal(str(p["amount"])) for p in (all_payments.data or [])
    )

    outstanding_after = (
        Decimal(str(inv["total_amount"])) -
        Decimal(str(inv["amount_paid"]))
    )

    # Generate PDF
    buf = generate_receipt_pdf(
        receipt_number=pay.get("receipt_number") or "—",
        school_name=school.get("name", "School"),
        student_name=f"{student.get('first_name', '')} {student.get('last_name', '')}".strip(),
        student_admission=student.get("admission_number", ""),
        class_name="",      # class data not on invoice; can enrich later
        term_name=term.get("name", ""),
        session_name=session.get("name", ""),
        payment_method=pay.get("payment_method", ""),
        payment_date=pay.get("payment_date"),
        amount_paid=Decimal(str(pay["amount"])),
        total_amount=Decimal(str(inv["total_amount"])),
        amount_paid_before=paid_before,
        outstanding_after=outstanding_after,
        line_items=inv.get("invoice_line_items") or [],
        recorded_by=(pay.get("users") or {}).get("full_name", ""),
        reference=pay.get("reference", ""),
        narration=pay.get("narration", ""),
        school_address=school.get("address", ""),
        school_phone=school.get("phone", ""),
    )

    receipt_no = pay.get("receipt_number") or "receipt"
    filename   = f"{receipt_no.replace('/', '-')}.pdf"

    return StreamingResponse(
        buf,
        media_type="application/pdf",
        headers={"Content-Disposition": f"attachment; filename={filename}"},
    )
