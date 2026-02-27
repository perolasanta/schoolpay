# app/schemas/payments.py

from pydantic import BaseModel, Field
from typing import Optional
from uuid import UUID
from datetime import date, datetime
from decimal import Decimal
from enum import Enum


class PaymentMethod(str, Enum):
    paystack      = "paystack"
    bank_transfer = "bank_transfer"
    cash          = "cash"
    pos           = "pos"
    waiver        = "waiver"


class PaymentStatus(str, Enum):
    pending  = "pending"
    success  = "success"
    failed   = "failed"
    reversed = "reversed"


class ApprovalStatus(str, Enum):
    pending_approval = "pending_approval"
    approved         = "approved"
    rejected         = "rejected"


# ── Paystack online payment ───────────────────────────────────
class InitializePaymentRequest(BaseModel):
    """Parent opens link → frontend calls this to get Paystack URL."""
    invoice_id: UUID
    payment_token: UUID         # from the SMS link
    email: str                  # parent email for Paystack receipt


class InitializePaymentResponse(BaseModel):
    authorization_url: str      # redirect parent here
    access_code: str
    reference: str              # store this, needed for verification


# ── Cash payment ─────────────────────────────────────────────
class CashPaymentRequest(BaseModel):
    invoice_id: UUID
    amount: Decimal = Field(gt=0)
    narration: Optional[str] = None
    payment_date: Optional[datetime] = None
    branch: Optional[str] = None
    collection_point: Optional[str] = None
    late_fee_amount: Decimal = Field(default=Decimal("0"))


# ── Bank transfer ────────────────────────────────────────────
class BankTransferRequest(BaseModel):
    invoice_id: UUID
    amount: Decimal = Field(gt=0)
    reference: str = Field(min_length=3)    # bank transaction ref
    narration: Optional[str] = None
    payment_date: Optional[datetime] = None
    branch: Optional[str] = None
    late_fee_amount: Decimal = Field(default=Decimal("0"))
    # proof_url set separately after file upload


class ApproveTransferRequest(BaseModel):
    payment_id: UUID
    action: ApprovalStatus      # approved | rejected
    notes: Optional[str] = None


# ── Void payment ─────────────────────────────────────────────
class VoidPaymentRequest(BaseModel):
    payment_id: UUID
    reason: str = Field(min_length=5, max_length=500)


# ── Response ─────────────────────────────────────────────────
class PaymentResponse(BaseModel):
    id: UUID
    school_id: UUID
    invoice_id: UUID
    student_id: UUID
    student_name: Optional[str] = None
    amount: Decimal
    payment_method: str
    reference: Optional[str]
    receipt_number: Optional[str]
    status: str
    approval_status: Optional[str]
    is_voided: bool
    void_reason: Optional[str]
    narration: Optional[str]
    branch: Optional[str]
    late_fee_amount: Decimal
    currency: str
    recorded_by_name: Optional[str] = None
    payment_date: datetime
    created_at: datetime


class PendingTransferItem(BaseModel):
    """For the bursar's pending approvals list."""
    id: UUID
    student_name: str
    admission_number: str
    class_name: Optional[str]
    amount: Decimal
    reference: str
    proof_url: Optional[str]
    payment_date: datetime
    narration: Optional[str]


# ── Paystack webhook ─────────────────────────────────────────
class PaystackWebhookEvent(BaseModel):
    """
    Shape of data Paystack sends to our webhook endpoint.
    We only care about charge.success events.
    """
    event: str
    data: dict
