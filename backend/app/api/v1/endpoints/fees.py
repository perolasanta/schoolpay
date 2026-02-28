# app/api/v1/endpoints/fees.py
#
# Fee structures and invoices → school admin operations → SchoolDB.
# The public payment page (/pay/{token}) uses supabase_admin
# because no user JWT exists — the payment token IS the credential.

from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException, Query

from app.core.security import CurrentUser, get_active_user, require_roles
from app.core.database import SchoolDB
from app.core.config import settings
from app.schemas.fees import (
    FeeStructureCreate, FeeStructureResponse,
    GenerateInvoicesRequest, GenerateInvoicesResponse,
    InvoiceResponse, InvoiceListItem, PublicInvoiceResponse,
)
from app.schemas.common import APIResponse, PaginatedResponse, PaginationParams
from app.services.invoice_service import (
    generate_term_invoices, get_invoice_by_token, list_invoices,
)

router = APIRouter(tags=["Fees & Invoices"])


# ═══════════════════════════════════════════════════════════
# FEE STRUCTURES
# ═══════════════════════════════════════════════════════════

@router.post("/fee-structures", response_model=APIResponse[FeeStructureResponse], status_code=201)
async def create_fee_structure(
    body: FeeStructureCreate,
    user: CurrentUser = Depends(require_roles("school_admin")),
):
    db = SchoolDB(str(user.school_id))

    # Both class and term must belong to this school (require_one raises 404 otherwise)
    cls  = db.require_one("classes", str(body.class_id), "id, name")
    term = db.require_one("terms",   str(body.term_id),  "id, name")

    # Prevent duplicate fee structure for same class + term
    existing = (
        db.select("fee_structures", "id")
        .eq("class_id", str(body.class_id))
        .eq("term_id",  str(body.term_id))
        .maybe_single()
        .execute()
    )
    if existing.data:
        raise HTTPException(
            status_code=409,
            detail=(
                f"A fee structure for '{cls['name']}' in '{term['name']}' already exists. "
                "Edit the existing one instead."
            ),
        )

    fs = db.insert("fee_structures", {
        "class_id": str(body.class_id),
        "term_id":  str(body.term_id),
        "name":     body.name,
        "due_date": body.due_date.isoformat(),
    })

    line_items = db.insert_many("fee_line_items", [
        {
            "fee_structure_id": fs["id"],
            "name":         li.name,
            "category":     li.category,
            "amount":       float(li.amount),
            "is_mandatory": li.is_mandatory,
            "is_one_time":  li.is_one_time,
            "sort_order":   li.sort_order,
        }
        for li in body.line_items
    ])

    fs["line_items"]      = line_items
    fs["class_name"]      = cls["name"]
    fs["term_name"]       = term["name"]
    fs["total_mandatory"] = sum(float(li.amount) for li in body.line_items if li.is_mandatory)
    fs["total_optional"]  = sum(float(li.amount) for li in body.line_items if not li.is_mandatory)

    return APIResponse(
        data=fs,
        message=f"Fee structure created. Mandatory total: ₦{fs['total_mandatory']:,.2f}",
    )


@router.get("/fee-structures", response_model=APIResponse[List[FeeStructureResponse]])
async def list_fee_structures(
    user: CurrentUser = Depends(get_active_user),
    term_id: Optional[str] = Query(default=None),
    class_id: Optional[str] = Query(default=None),
):
    db = SchoolDB(str(user.school_id))
    query = (
        db.select("fee_structures", "*, fee_line_items(*), classes(name), terms(name)")
        .eq("is_active", True)
        .order("created_at", desc=True)
    )
    if term_id:
        query = query.eq("term_id", term_id)
    if class_id:
        query = query.eq("class_id", class_id)

    result = query.execute()
    structures = []
    for fs in (result.data or []):
        fs["class_name"]      = (fs.get("classes") or {}).get("name")
        fs["term_name"]       = (fs.get("terms") or {}).get("name")
        items                 = fs.get("fee_line_items") or []
        fs["total_mandatory"] = sum(li["amount"] for li in items if li["is_mandatory"])
        fs["total_optional"]  = sum(li["amount"] for li in items if not li["is_mandatory"])
        structures.append(fs)
    return APIResponse(data=structures)


@router.get("/fee-structures/{structure_id}", response_model=APIResponse[FeeStructureResponse])
async def get_fee_structure(
    structure_id: str,
    user: CurrentUser = Depends(get_active_user),
):
    db = SchoolDB(str(user.school_id))
    result = (
        db.select("fee_structures", "*, fee_line_items(*), classes(name), terms(name)")
        .eq("id", structure_id)
        .maybe_single()
        .execute()
    )
    if not result.data:
        raise HTTPException(status_code=404, detail="Fee structure not found")
    fs = result.data
    fs["class_name"] = (fs.get("classes") or {}).get("name")
    fs["term_name"]  = (fs.get("terms")   or {}).get("name")
    return APIResponse(data=fs)


# ═══════════════════════════════════════════════════════════
# INVOICE GENERATION
# ═══════════════════════════════════════════════════════════

@router.post("/invoices/generate", response_model=APIResponse[GenerateInvoicesResponse])
async def generate_invoices(
    body: GenerateInvoicesRequest,
    user: CurrentUser = Depends(require_roles("school_admin")),
):
    """
    The "Generate Term Bills" button.
    Only school_admin can trigger this — never bursar or staff.
    """
    result = await generate_term_invoices(
        school_id=str(user.school_id),
        data=body,
        generated_by=str(user.user_id),
    )
    return APIResponse(data=result, message=result.message)


@router.get("/invoices/summary")
async def invoice_summary(user: CurrentUser = Depends(get_active_user)):
    """
    Dashboard KPI card data.
    Returns total invoiced, total collected, total outstanding, collection rate.
    Uses the v_student_fee_status view for speed.
    """
    db = SchoolDB(str(user.school_id))

    # Get active term; if none exists, fall back to latest created term.
    active_term = (
        db.select("terms", "id, name")
        .eq("is_active", True)
        .maybe_single()
        .execute()
    )
    term_data = active_term.data or {}
    term_id = term_data.get("id")

    if not term_id:
        latest_term = (
            db.select("terms", "id, name")
            .order("created_at", desc=True)
            .limit(1)
            .execute()
        )
        latest_rows = latest_term.data or []
        if latest_rows:
            term_data = latest_rows[0]
            term_id = term_data.get("id")

    if not term_id:
        return APIResponse(data={
            "total_invoiced": 0,
            "total_collected": 0,
            "total_outstanding": 0,
            "collection_rate": 0,
            "paid_count": 0,
            "partial_count": 0,
            "unpaid_count": 0,
            "total_count": 0,
            "active_term": None,
        })

    result = (
        db.select("invoices", "total_amount, amount_paid, status")
        .eq("term_id", term_id)
        .execute()
    )
    invoices = result.data or []

    total_invoiced   = sum(float(i["total_amount"]) for i in invoices)
    total_collected  = sum(float(i["amount_paid"])  for i in invoices)
    total_outstanding = total_invoiced - total_collected
    collection_rate  = round((total_collected / total_invoiced * 100), 1) if total_invoiced > 0 else 0

    paid_count    = sum(1 for i in invoices if i["status"] == "paid")
    partial_count = sum(1 for i in invoices if i["status"] == "partial")
    unpaid_count  = sum(1 for i in invoices if i["status"] == "unpaid")

    return APIResponse(data={
        "total_invoiced":    total_invoiced,
        "total_collected":   total_collected,
        "total_outstanding": total_outstanding,
        "collection_rate":   collection_rate,
        "paid_count":        paid_count,
        "partial_count":     partial_count,
        "unpaid_count":      unpaid_count,
        "total_count":       len(invoices),
        "active_term":       term_data.get("name"),
        "term_name":         term_data.get("name"),
    })


@router.get("/invoices", response_model=PaginatedResponse[InvoiceListItem])
async def list_invoices_endpoint(
    user: CurrentUser = Depends(get_active_user),
    term_id: Optional[str] = Query(default=None),
    status: Optional[str] = Query(default=None),
    class_id: Optional[str] = Query(default=None),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=50, ge=1, le=200),
    search: Optional[str] = Query(default=None),
):
    # Default to active term if none specified.
    # If there is no active term yet, fall back to latest created term.
    if not term_id:
        db = SchoolDB(str(user.school_id))
        active = (
            db.select("terms", "id")
            .eq("is_active", True)
            .maybe_single()
            .execute()
        )
        if active.data:
            term_id = active.data["id"]
        else:
            latest = (
                db.select("terms", "id")
                .order("created_at", desc=True)
                .limit(1)
                .execute()
            )
            latest_rows = latest.data or []
            if not latest_rows:
                raise HTTPException(status_code=400, detail="No term found. Please create a term first.")
            term_id = latest_rows[0]["id"]

    params = PaginationParams(page=page, page_size=page_size, search=search)
    items, total = await list_invoices(
        school_id=str(user.school_id),
        term_id=term_id,
        params=params,
        status_filter=status,
        class_id=class_id,
    )
    total_pages = (total + page_size - 1) // page_size if total else 0
    return PaginatedResponse(data=items, total=total, page=page,
                             page_size=page_size, total_pages=total_pages)


@router.get("/invoices/{invoice_id}", response_model=APIResponse[InvoiceResponse])
async def get_invoice(
    invoice_id: str,
    user: CurrentUser = Depends(get_active_user),
):
    db = SchoolDB(str(user.school_id))
    result = (
        db.select(
            "invoices",
            "*, invoice_line_items(*), "
            "students(first_name, last_name, admission_number), "
            "terms(name, academic_sessions(name))",
        )
        .eq("id", invoice_id)
        .maybe_single()
        .execute()
    )
    if not result.data:
        raise HTTPException(status_code=404, detail="Invoice not found")

    inv     = result.data
    student = inv.get("students") or {}
    term    = inv.get("terms") or {}
    session = (term.get("academic_sessions") or {})

    from decimal import Decimal
    inv["student_name"]    = f"{student.get('first_name', '')} {student.get('last_name', '')}".strip()
    inv["student_admission"] = student.get("admission_number")
    inv["term_name"]       = term.get("name")
    inv["session_name"]    = session.get("name")
    inv["balance"]         = float(
        Decimal(str(inv["total_amount"])) - Decimal(str(inv["amount_paid"]))
    )
    return APIResponse(data=inv)


# ═══════════════════════════════════════════════════════════
# PUBLIC PAYMENT PAGE — no auth, token is the credential
# ═══════════════════════════════════════════════════════════

@router.get("/pay/{payment_token}", response_model=APIResponse[PublicInvoiceResponse])
async def get_public_invoice(payment_token: str):
    """
    No JWT required. The payment_token in the URL is the access credential.
    Returns only what the parent needs to see: invoice summary + Paystack key.
    Never returns school_id, student_id, or other internal fields.
    """
    result = await get_invoice_by_token(payment_token)
    result["paystack_public_key"] = settings.PAYSTACK_PUBLIC_KEY
    return APIResponse(data=result)
