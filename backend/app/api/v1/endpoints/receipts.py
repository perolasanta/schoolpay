# ============================================================
# app/api/v1/endpoints/receipts.py
#
# Session 4 additions — receipt download and proof upload.
#
# Kept separate from payments.py to avoid that file getting too long.
# All these routes are payment-adjacent but distinct:
#   - Receipt PDF generation and download
#   - Bank transfer proof upload (parent uploads screenshot)
#   - Proof signed URL (bursar views the proof)
#   - Public payment page endpoint (parent-facing, no login)
#
# Router prefix: /payments (same as payments.py — mounted together)
# ============================================================

import logging
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Query
from fastapi.responses import Response

from app.core.config import settings
from app.core.database import SchoolDB, supabase_admin
from app.core.security import CurrentUser, get_active_user, require_roles
from app.schemas.common import APIResponse
from app.utils.pdf_receipt import generate_receipt_pdf
from app.utils.file_upload import (
    upload_transfer_proof,
    get_proof_signed_url,
    upload_receipt_pdf,
    get_proof_signed_url,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/payments", tags=["Receipts & Proofs"])


# ══════════════════════════════════════════════════════════
# RECEIPT PDF DOWNLOAD
# GET /payments/{payment_id}/receipt
# ══════════════════════════════════════════════════════════

@router.get("/{payment_id}/receipt")
async def download_receipt(
    payment_id: str,
    user: CurrentUser = Depends(get_active_user),
):
    """
    Download a PDF receipt for any successful payment.
    Available to: school_admin, bursar, staff.

    Returns: PDF file (application/pdf).
    The browser will either display inline or trigger a download.

    Design note: We generate the PDF on-the-fly from the database
    rather than retrieving a stored PDF. This ensures the receipt
    always reflects the current state (e.g. if a name was corrected).
    Storage upload is done in the background for archival purposes.
    """
    db = SchoolDB(str(user.school_id))

    # Fetch payment with all related data needed for the PDF
    payment_result = (
        db.select(
            "payments",
            "*, "
            "invoices("
            "  id, subtotal, discount_amount, arrears_amount, "
            "  late_fee_amount, total_amount, amount_paid, status, due_date, "
            "  term_id, "
            "  invoice_line_items(*), "
            "  terms(name, academic_sessions(name)), "
            "  students(first_name, last_name, admission_number)"
            "), "
            "users(full_name)"
        )
        .eq("id", payment_id)
        .maybe_single()
        .execute()
    )

    if not payment_result.data:
        raise HTTPException(status_code=404, detail="Payment not found")

    p   = payment_result.data
    inv = p.get("invoices") or {}

    if p.get("status") != "success" or p.get("is_voided"):
        raise HTTPException(
            status_code=400,
            detail="Receipt is only available for successful, non-voided payments."
        )

    # Fetch school details
    school_result = (
        db.select("schools", "name, address, phone")
        .eq("id", str(user.school_id))
        .maybe_single()
        .execute()
    )
    school = school_result.data or {}

    student = inv.get("students") or {}
    term    = inv.get("terms") or {}
    session = (term.get("academic_sessions") or {})

    # Outstanding balance = total - total_amount_paid (not just this payment)
    total_paid   = float(inv.get("amount_paid", 0))
    total_amount = float(inv.get("total_amount", 0))
    outstanding  = max(total_amount - total_paid, 0)

    # Class name — fetch from current enrollment
    class_result = (
        db.select(
            "student_enrollments",
            "classes(name)",
        )
        .eq("student_id", student.get("id", inv.get("student_id", "")))
        .order("created_at", desc=True)
        .limit(1)
        .execute()
    )
    class_name = None
    if class_result.data:
        class_name = (class_result.data[0].get("classes") or {}).get("name")

    # Generate PDF
    pdf_bytes = generate_receipt_pdf(
        school_name=school.get("name", "Your School"),
        school_address=school.get("address"),
        school_phone=school.get("phone"),
        student_name=f"{student.get('first_name', '')} {student.get('last_name', '')}".strip(),
        admission_number=student.get("admission_number"),
        class_name=class_name,
        term_name=term.get("name", ""),
        session_name=session.get("name", ""),
        receipt_number=p.get("receipt_number", ""),
        payment_method=p.get("payment_method", ""),
        payment_date=p.get("payment_date"),
        recorded_by=(p.get("users") or {}).get("full_name"),
        line_items=inv.get("invoice_line_items") or [],
        subtotal=float(inv.get("subtotal", 0)),
        discount_amount=float(inv.get("discount_amount", 0)),
        arrears_amount=float(inv.get("arrears_amount", 0)),
        late_fee_amount=float(inv.get("late_fee_amount", 0)),
        total_amount=total_amount,
        amount_paid_this_time=float(p.get("amount", 0)),
        total_amount_paid=total_paid,
        outstanding_balance=outstanding,
        invoice_status=inv.get("status", "partial"),
    )

    receipt_number = p.get("receipt_number", payment_id)
    safe_filename  = receipt_number.replace("/", "-")

    # Upload to storage in background (non-blocking — if it fails, download still works)
    try:
        await upload_receipt_pdf(pdf_bytes, str(user.school_id), receipt_number)
    except Exception as e:
        logger.warning(f"Background receipt upload failed for {receipt_number}: {e}")

    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={
            "Content-Disposition": f'inline; filename="{safe_filename}.pdf"',
            "Cache-Control": "no-store",
        },
    )


# ══════════════════════════════════════════════════════════
# BANK TRANSFER PROOF UPLOAD
# POST /payments/{payment_id}/proof
# ══════════════════════════════════════════════════════════

@router.post("/{payment_id}/proof", response_model=APIResponse)
async def upload_proof(
    payment_id: str,
    file: UploadFile = File(...),
    user: CurrentUser = Depends(get_active_user),
):
    """
    Parent or bursar uploads a screenshot/PDF of bank transfer proof.
    Accepted formats: JPEG, PNG, WebP, PDF. Max size: 5MB.

    After upload, the payment row is updated with the storage path.
    The bursar sees the proof in their approval queue and can click
    to view it via a signed URL before approving or rejecting.

    Can be called:
    - By the parent via the public payment page (no auth — use token variant below)
    - By the bursar from the dashboard (JWT auth)
    """
    db = SchoolDB(str(user.school_id))

    payment = (
        db.select("payments", "id, payment_method, status, approval_status")
        .eq("id", payment_id)
        .maybe_single()
        .execute()
    )
    if not payment.data:
        raise HTTPException(status_code=404, detail="Payment not found")

    p = payment.data
    if p["payment_method"] != "bank_transfer":
        raise HTTPException(
            status_code=400,
            detail="Proof upload is only for bank transfer payments."
        )
    if p["approval_status"] == "approved":
        raise HTTPException(
            status_code=400,
            detail="Cannot upload proof for an already approved payment."
        )

    # Upload to Supabase Storage
    storage_path = await upload_transfer_proof(file, str(user.school_id), payment_id)

    # Update the payment with the proof path
    db.update("payments", {"proof_url": storage_path}, record_id=payment_id)

    return APIResponse(
        data={"proof_url": storage_path},
        message="Proof uploaded successfully. The bursar will review it shortly."
    )


@router.post("/transfer/{payment_token}/proof", response_model=APIResponse)
async def upload_proof_public(
    payment_token: str,
    file: UploadFile = File(...),
):
    """
    Public version of proof upload — called from the parent's payment page.
    No JWT needed. The payment_token (from SMS link) is the credential.

    The parent uploads their bank transfer proof on the same page they
    submitted the transfer record.
    """
    # Find the payment via the invoice's payment_token
    invoice_result = (
        supabase_admin.table("invoices")
        .select("id, school_id")
        .eq("payment_token", payment_token)
        .maybe_single()
        .execute()
    )
    if not invoice_result.data:
        raise HTTPException(status_code=404, detail="Invalid payment link.")

    inv = invoice_result.data

    # Find the most recent pending bank transfer for this invoice
    payment_result = (
        supabase_admin.table("payments")
        .select("id, approval_status, payment_method")
        .eq("invoice_id", inv["id"])
        .eq("payment_method", "bank_transfer")
        .eq("approval_status", "pending_approval")
        .order("created_at", desc=True)
        .limit(1)
        .maybe_single()
        .execute()
    )
    if not payment_result.data:
        raise HTTPException(
            status_code=404,
            detail="No pending bank transfer found for this invoice. "
                   "Please submit the transfer details first."
        )

    p = payment_result.data
    storage_path = await upload_transfer_proof(file, inv["school_id"], p["id"])

    supabase_admin.table("payments").update(
        {"proof_url": storage_path}
    ).eq("id", p["id"]).execute()

    return APIResponse(
        data={"proof_url": storage_path},
        message="Proof uploaded. The bursar will review and confirm your payment."
    )


# ══════════════════════════════════════════════════════════
# PROOF SIGNED URL (bursar views proof before approving)
# GET /payments/{payment_id}/proof-url
# ══════════════════════════════════════════════════════════

@router.get("/{payment_id}/proof-url", response_model=APIResponse)
async def get_proof_url(
    payment_id: str,
    user: CurrentUser = Depends(require_roles("school_admin", "bursar")),
):
    """
    Returns a 1-hour signed URL for the bursar to view the proof file.
    The file itself is private in Supabase Storage — this URL is the
    only way to access it.

    Frontend: open the URL in a new tab or display in an <img> / <iframe>.
    """
    db = SchoolDB(str(user.school_id))

    payment = (
        db.select("payments", "id, proof_url, payment_method")
        .eq("id", payment_id)
        .maybe_single()
        .execute()
    )
    if not payment.data:
        raise HTTPException(status_code=404, detail="Payment not found")

    proof_path = payment.data.get("proof_url")
    if not proof_path:
        raise HTTPException(
            status_code=404,
            detail="No proof has been uploaded for this payment yet."
        )

    signed_url = await get_proof_signed_url(proof_path, expires_in=3600)
    if not signed_url:
        raise HTTPException(
            status_code=502,
            detail="Could not generate proof URL. Please try again."
        )

    return APIResponse(
        data={"url": signed_url, "expires_in_seconds": 3600},
        message="URL expires in 1 hour."
    )


# ══════════════════════════════════════════════════════════
# PUBLIC PAYMENT PAGE
# GET /pay/{payment_token}
# ══════════════════════════════════════════════════════════
# NOTE: This endpoint already exists in fees.py as GET /fees/pay/{token}
# Here we add the SUBMIT BANK TRANSFER endpoint for the same page.

@router.post("/pay/{payment_token}/transfer", response_model=APIResponse)
async def submit_public_transfer(
    payment_token: str,
    amount: float,
    reference: str,
    narration: Optional[str] = None,
):
    """
    Public endpoint — parent submits bank transfer details on the payment page.
    No JWT. The payment_token from the SMS link is the credential.

    What this does:
    1. Validates the token
    2. Creates a pending bank transfer payment
    3. Returns the payment_id (parent then uploads proof to /transfer/{token}/proof)

    Flow:
    Parent opens SMS link → sees invoice → enters transfer details → submits
    → bursar gets notified → bursar views proof → approves or rejects
    """
    # Validate token
    invoice_result = (
        supabase_admin.table("invoices")
        .select("id, school_id, student_id, total_amount, amount_paid, status, currency")
        .eq("payment_token", payment_token)
        .maybe_single()
        .execute()
    )
    if not invoice_result.data:
        raise HTTPException(status_code=404, detail="Invalid payment link.")

    inv = invoice_result.data

    if inv["status"] == "paid":
        raise HTTPException(status_code=400, detail="This invoice is already fully paid.")

    if amount <= 0:
        raise HTTPException(status_code=400, detail="Amount must be greater than zero.")

    if not reference or len(reference.strip()) < 3:
        raise HTTPException(
            status_code=400,
            detail="Please enter your bank transaction reference number."
        )

    # Check for duplicate reference
    existing = (
        supabase_admin.table("payments")
        .select("id")
        .eq("school_id", inv["school_id"])
        .eq("reference", reference.strip())
        .maybe_single()
        .execute()
    )
    if existing.data:
        raise HTTPException(
            status_code=409,
            detail="This transaction reference has already been submitted. "
                   "If you believe this is an error, contact the school bursar."
        )

    payment_row = supabase_admin.table("payments").insert({
        "school_id":       inv["school_id"],
        "invoice_id":      inv["id"],
        "student_id":      inv["student_id"],
        "amount":          amount,
        "payment_method":  "bank_transfer",
        "reference":       reference.strip(),
        "narration":       narration,
        "status":          "pending",
        "approval_status": "pending_approval",
        "currency":        inv.get("currency", "NGN"),
    }).execute()

    payment = payment_row.data[0] if payment_row.data else {}

    return APIResponse(
        data={
            "payment_id":  payment.get("id"),
            "status":      "pending",
            "message":     "Transfer submitted. Please upload your proof of payment.",
            "next_step":   f"/payments/transfer/{payment_token}/proof",
        },
        message="Transfer recorded. The bursar will review within 24 hours."
    )
