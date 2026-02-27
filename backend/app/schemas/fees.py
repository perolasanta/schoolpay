# app/schemas/fees.py

from pydantic import BaseModel, Field
from typing import Optional, List
from uuid import UUID
from datetime import date, datetime
from decimal import Decimal
from enum import Enum


class FeeCategory(str, Enum):
    tuition     = "tuition"
    development = "development"
    feeding     = "feeding"
    transport   = "transport"
    uniform     = "uniform"
    books       = "books"
    exam        = "exam"
    pta         = "pta"
    sport       = "sport"
    other       = "other"


class InvoiceStatus(str, Enum):
    unpaid    = "unpaid"
    partial   = "partial"
    paid      = "paid"
    waived    = "waived"
    cancelled = "cancelled"


# ── Fee Line Items ───────────────────────────────────────────
class FeeLineItemCreate(BaseModel):
    name: str = Field(min_length=2, examples=["Tuition Fee", "Development Levy"])
    category: FeeCategory = FeeCategory.tuition
    amount: Decimal = Field(gt=0, decimal_places=2)
    is_mandatory: bool = True
    is_one_time: bool = False
    sort_order: int = 0


class FeeLineItemResponse(BaseModel):
    id: UUID
    name: str
    category: str
    amount: Decimal
    is_mandatory: bool
    is_one_time: bool
    sort_order: int


# ── Fee Structures ───────────────────────────────────────────
class FeeStructureCreate(BaseModel):
    class_id: UUID
    term_id: UUID
    name: str = Field(min_length=3, examples=["JSS 1 First Term Fees"])
    due_date: date
    line_items: List[FeeLineItemCreate] = Field(min_length=1)


class FeeStructureUpdate(BaseModel):
    name: Optional[str] = None
    due_date: Optional[date] = None
    is_active: Optional[bool] = None


class FeeStructureResponse(BaseModel):
    id: UUID
    school_id: UUID
    class_id: UUID
    term_id: UUID
    class_name: Optional[str] = None
    term_name: Optional[str] = None
    name: str
    due_date: date
    is_active: bool
    line_items: List[FeeLineItemResponse] = []
    total_mandatory: Optional[Decimal] = None   # sum of mandatory items
    total_optional: Optional[Decimal] = None
    created_at: datetime


# ── Invoice Generation ───────────────────────────────────────
class GenerateInvoicesRequest(BaseModel):
    """
    Admin clicks "Generate Term Bills".
    This triggers invoice creation for all enrolled students.
    """
    term_id: UUID
    include_optional_fees: bool = False   # whether to include optional line items
    apply_arrears: bool = True            # carry over unpaid from previous term


class GenerateInvoicesResponse(BaseModel):
    """What the admin sees after clicking Generate Bills."""
    term_id: UUID
    term_name: str
    generated_count: int
    skipped_count: int          # already had invoices
    total_expected: Decimal     # total amount across all new invoices
    message: str


# ── Invoices ─────────────────────────────────────────────────
class InvoiceResponse(BaseModel):
    id: UUID
    school_id: UUID
    student_id: UUID
    term_id: UUID
    student_name: Optional[str] = None
    student_admission: Optional[str] = None
    class_name: Optional[str] = None
    term_name: Optional[str] = None
    session_name: Optional[str] = None
    subtotal: Decimal
    discount_amount: Decimal
    arrears_amount: Decimal
    late_fee_amount: Decimal
    total_amount: Decimal
    amount_paid: Decimal
    balance: Decimal            # computed: total - paid
    status: str
    due_date: Optional[date]
    currency: str
    payment_token: UUID         # for parent SMS link
    line_items: Optional[List[FeeLineItemResponse]] = None
    generated_at: datetime
    updated_at: datetime


class InvoiceListItem(BaseModel):
    """Lighter version for list/table views."""
    id: UUID
    student_name: str
    admission_number: str
    class_name: Optional[str]
    total_amount: Decimal
    amount_paid: Decimal
    balance: Decimal
    status: str
    due_date: Optional[date]
    guardian_phone: str


# ── Public payment page (no auth) ────────────────────────────
class PublicInvoiceResponse(BaseModel):
    """
    What parents see when they open the payment link.
    Never includes internal IDs or sensitive school data.
    """
    invoice_id: UUID
    school_name: str
    student_name: str
    class_name: Optional[str]
    term_name: str
    session_name: str
    total_amount: Decimal
    amount_paid: Decimal
    balance: Decimal
    status: str
    due_date: Optional[date]
    currency: str
    line_items: List[FeeLineItemResponse]
    # Paystack public key so frontend can initialize payment
    paystack_public_key: str
