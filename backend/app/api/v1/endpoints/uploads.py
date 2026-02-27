# ============================================================
# app/api/v1/endpoints/uploads.py
#
# BANK TRANSFER PROOF UPLOAD
#
# When a parent transfers money manually, they need to submit
# proof of payment (screenshot or PDF of bank receipt).
#
# This endpoint:
#   1. Accepts the file (image or PDF, max 5MB)
#   2. Validates MIME type and size
#   3. Uploads to Supabase Storage bucket "payment-proofs"
#   4. Links the public URL back to the payment record
#   5. Returns the URL to the frontend
#
# Storage design:
#   Bucket: payment-proofs  (private — not public by default)
#   Path:   {school_id}/{term_year}/{payment_id}.{ext}
#
#   Signed URLs are generated on demand (1-hour expiry) so
#   bursars can view the proof. We never expose the raw storage URL.
#
# Who can upload?
#   - Parents via the public payment page (token auth — no JWT)
#   - School staff via the dashboard (JWT auth)
#   Both routes call the same storage logic.
#
# Who can view?
#   - Bursars and school_admin (JWT required, school_id checked)
# ============================================================

import uuid
import mimetypes
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Query
from fastapi.responses import RedirectResponse

from app.core.config import settings
from app.core.database import supabase_admin, SchoolDB
from app.core.security import CurrentUser, require_roles

router = APIRouter(prefix="/uploads", tags=["File Uploads"])

# ── Constants ─────────────────────────────────────────────────
BUCKET_NAME         = "payment-proofs"
MAX_FILE_SIZE_BYTES = settings.MAX_FILE_SIZE_MB * 1024 * 1024
ALLOWED_MIME_TYPES  = {
    "image/jpeg":       "jpg",
    "image/png":        "png",
    "image/webp":       "webp",
    "application/pdf":  "pdf",
}
SIGNED_URL_EXPIRY   = 3600  # 1 hour in seconds


def _get_file_ext(content_type: str) -> str:
    return ALLOWED_MIME_TYPES.get(content_type, "bin")


async def _read_and_validate(file: UploadFile) -> bytes:
    """Reads file into memory, validates size and MIME type."""
    content_type = file.content_type or ""

    if content_type not in ALLOWED_MIME_TYPES:
        raise HTTPException(
            status_code=400,
            detail=(
                f"File type '{content_type}' is not allowed. "
                f"Upload a JPG, PNG, WebP, or PDF file."
            ),
        )

    data = await file.read()

    if len(data) > MAX_FILE_SIZE_BYTES:
        raise HTTPException(
            status_code=413,
            detail=f"File too large. Maximum size is {settings.MAX_FILE_SIZE_MB}MB.",
        )

    if len(data) == 0:
        raise HTTPException(status_code=400, detail="Uploaded file is empty.")

    return data


def _build_storage_path(school_id: str, payment_id: str, ext: str) -> str:
    """
    Returns the storage path for a proof file.
    Format: {school_id}/{payment_id}.{ext}
    Example: abc-123/pay-456.jpg

    school_id prefix allows easy per-school file management.
    """
    return f"{school_id}/{payment_id}.{ext}"


async def _upload_to_supabase(path: str, data: bytes, content_type: str) -> str:
    """
    Uploads file to Supabase Storage and returns the storage path.
    Raises HTTPException on Supabase errors.
    """
    try:
        result = supabase_admin.storage.from_(BUCKET_NAME).upload(
            path=path,
            file=data,
            file_options={"content-type": content_type, "upsert": "true"},
        )
        # Supabase returns the path on success
        return path
    except Exception as e:
        raise HTTPException(
            status_code=502,
            detail=f"File upload failed. Please try again. ({str(e)[:100]})",
        )


def _get_signed_url(path: str) -> str:
    """Generates a time-limited signed URL for viewing a proof file."""
    try:
        result = supabase_admin.storage.from_(BUCKET_NAME).create_signed_url(
            path=path,
            expires_in=SIGNED_URL_EXPIRY,
        )
        return result.get("signedURL") or result.get("signedUrl") or ""
    except Exception:
        return ""


# ── POST /uploads/payment-proof/{payment_id} ─────────────────
# Called by the PUBLIC payment page (token-auth, no JWT).
# Parent uploads their bank transfer screenshot.

@router.post("/payment-proof/{payment_id}")
async def upload_proof_public(
    payment_id: str,
    payment_token: str = Query(..., description="Invoice payment token from SMS link"),
    file: UploadFile = File(..., description="Bank transfer screenshot or PDF"),
):
    """
    Parent uploads bank transfer proof via the public payment page.
    The payment_token is used to verify this payment belongs to their invoice.

    After upload:
    - proof_url is stored on the payment record
    - Bursar sees the "pending" transfer in their approval queue
    - Bursar views the proof and approves or rejects

    File size limit: 5MB
    Allowed types: JPG, PNG, WebP, PDF
    """
    # Verify the payment belongs to this invoice token
    payment = (
        supabase_admin.table("payments")
        .select("id, school_id, invoice_id, status, approval_status, invoices(payment_token)")
        .eq("id", payment_id)
        .eq("payment_method", "bank_transfer")
        .maybe_single()
        .execute()
    )
    if not payment.data:
        raise HTTPException(status_code=404, detail="Payment not found")

    pay = payment.data
    invoice_token = (pay.get("invoices") or {}).get("payment_token", "")

    if str(invoice_token) != payment_token:
        raise HTTPException(status_code=403, detail="Invalid payment token")

    if pay["approval_status"] not in ("pending_approval",):
        raise HTTPException(
            status_code=400,
            detail="This payment has already been processed. Cannot upload new proof.",
        )

    # Read and validate
    data = await _read_and_validate(file)
    ext  = _get_file_ext(file.content_type)
    path = _build_storage_path(pay["school_id"], payment_id, ext)

    # Upload
    await _upload_to_supabase(path, data, file.content_type)

    # Update payment record with the storage path
    supabase_admin.table("payments").update(
        {"proof_url": path}
    ).eq("id", payment_id).execute()

    return {
        "success":  True,
        "message":  "Proof uploaded. The bursar will review and confirm your payment.",
        "proof_path": path,
    }


# ── POST /uploads/payment-proof-staff/{payment_id} ───────────
# Called by staff on the dashboard (JWT auth).
# Bursar can upload proof on behalf of a parent if needed.

@router.post("/payment-proof-staff/{payment_id}")
async def upload_proof_staff(
    payment_id: str,
    file: UploadFile = File(...),
    user: CurrentUser = Depends(require_roles("school_admin", "bursar")),
):
    """
    School staff uploads proof on behalf of a parent.
    Used when the parent calls in to report a transfer but can't
    access the payment link (e.g. link expired, phone number changed).
    """
    db      = SchoolDB(str(user.school_id))
    payment = db.require_one("payments", payment_id, "id, school_id, approval_status")

    if payment["approval_status"] not in ("pending_approval",):
        raise HTTPException(
            status_code=400,
            detail="Cannot upload proof for a payment that has already been processed.",
        )

    data = await _read_and_validate(file)
    ext  = _get_file_ext(file.content_type)
    path = _build_storage_path(str(user.school_id), payment_id, ext)

    await _upload_to_supabase(path, data, file.content_type)

    db.update("payments", {"proof_url": path}, record_id=payment_id)

    return {
        "success":   True,
        "message":   "Proof uploaded successfully.",
        "proof_path": path,
    }


# ── GET /uploads/payment-proof/{payment_id}/view ─────────────
# Bursar clicks "View Proof" in the approval queue.
# Returns a signed URL (valid 1 hour) and redirects to it.

@router.get("/payment-proof/{payment_id}/view")
async def view_proof(
    payment_id: str,
    user: CurrentUser = Depends(require_roles("school_admin", "bursar")),
):
    """
    Generates a 1-hour signed URL for the proof file and redirects.
    Bursar clicks "View Proof" → this endpoint → redirected to signed URL → file opens.

    Security:
    - JWT required
    - school_id verified — bursar from School A cannot view School B's proofs
    - URL expires in 1 hour — even if shared, it stops working
    """
    db      = SchoolDB(str(user.school_id))
    payment = db.require_one("payments", payment_id, "id, proof_url, approval_status")

    if not payment.get("proof_url"):
        raise HTTPException(
            status_code=404,
            detail="No proof of payment has been uploaded for this transfer."
        )

    signed_url = _get_signed_url(payment["proof_url"])

    if not signed_url:
        raise HTTPException(
            status_code=502,
            detail="Could not generate a link to view the proof. Please try again."
        )

    # Redirect to the signed URL — browser opens the image/PDF directly
    return RedirectResponse(url=signed_url, status_code=302)


# ── GET /uploads/payment-proof/{payment_id}/signed-url ───────
# Returns the signed URL as JSON instead of redirecting.
# Used by the React dashboard when it needs to display in an iframe.

@router.get("/payment-proof/{payment_id}/signed-url")
async def get_signed_proof_url(
    payment_id: str,
    user: CurrentUser = Depends(require_roles("school_admin", "bursar")),
):
    """Returns the signed URL as JSON. For embedding in the dashboard UI."""
    db      = SchoolDB(str(user.school_id))
    payment = db.require_one("payments", payment_id, "id, proof_url")

    if not payment.get("proof_url"):
        raise HTTPException(status_code=404, detail="No proof uploaded")

    signed_url = _get_signed_url(payment["proof_url"])
    if not signed_url:
        raise HTTPException(status_code=502, detail="Could not generate signed URL")

    return {
        "signed_url": signed_url,
        "expires_in": SIGNED_URL_EXPIRY,
        "proof_path": payment["proof_url"],
    }
