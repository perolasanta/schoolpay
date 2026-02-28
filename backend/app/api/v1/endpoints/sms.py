# app/api/v1/endpoints/sms.py
#
# SMS endpoints for school staff.
# FastAPI does NOT call Termii directly — it posts to n8n,
# which handles the actual Termii API call and logs results.
#
# Endpoints:
#   POST /sms/blast   — bulk debtor SMS reminder (Debtors page)

from typing import Optional
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from app.core.security import CurrentUser, require_roles
from app.core.database import SchoolDB
from app.utils.sms import notify_sms_blast_to_n8n
from app.services.activity_service import log_activity
from app.schemas.common import APIResponse

router = APIRouter(prefix="/sms", tags=["SMS & Notifications"])


# ── Request schema ────────────────────────────────────────────

class SmsBlastRequest(BaseModel):
    term_id: str
    message_template: Optional[str] = None   # None → n8n uses default template


class SmsBlastResponse(BaseModel):
    queued:           int     # number of debtors the blast was queued for
    term_name:        str
    message_template: str    # the template that will be used


# ── POST /sms/blast ───────────────────────────────────────────

@router.post("/blast", response_model=APIResponse[SmsBlastResponse])
async def sms_blast(
    body: SmsBlastRequest,
    user: CurrentUser = Depends(require_roles("school_admin", "bursar")),
):
    """
    Trigger a bulk SMS + WhatsApp reminder to all debtors for a given term.

    What happens:
    1. We count how many unpaid/partial invoices exist for this term
       (so we can return a meaningful count to the UI).
    2. We post the school_id + term_id to n8n's fee-reminder webhook.
    3. n8n fetches the debtor list, personalises each message, and
       calls Termii for each parent's phone number.
    4. n8n logs each send to notification_logs.

    This is fire-and-forget: the endpoint returns immediately once
    n8n accepts the job. The UI should not wait for delivery reports.
    """
    db = SchoolDB(str(user.school_id))

    # 1. Verify term belongs to this school
    term_result = (
        db.select("terms", "id, name")
        .eq("id", body.term_id)
        .maybe_single()
        .execute()
    )
    if not (term_result.data):
        raise HTTPException(status_code=404, detail="Term not found")
    term = term_result.data

    # 2. Count debtors so UI gets a useful number back
    debtors_result = (
        db.select("invoices", "id")
        .eq("term_id", body.term_id)
        .in_("status", ["unpaid", "partial"])
        .execute()
    )
    debtor_count = len(debtors_result.data or [])

    if debtor_count == 0:
        return APIResponse(
            data=SmsBlastResponse(
                queued=0,
                term_name=term["name"],
                message_template=body.message_template or "default",
            ),
            message="No debtors found for this term. No messages sent.",
        )

    # 3. Default message template (used by n8n if none provided)
    default_template = (
        "Dear {guardian_name}, your ward {student_name} has an outstanding "
        "fee balance of {balance} for {term_name}. "
        "Pay securely: {payment_link}. "
        "Contact us: {school_phone}. - SchoolPay"
    )
    template = body.message_template or default_template

    # 4. Log the action before firing (so it's recorded even if n8n is slow)
    await log_activity(
        school_id=str(user.school_id),
        user_id=str(user.user_id),
        action="sms.blast_triggered",
        entity_type="term",
        entity_id=body.term_id,
        metadata={
            "term_name":    term["name"],
            "debtor_count": debtor_count,
            "has_custom_message": body.message_template is not None,
        },
    )

    # 5. Fire-and-forget to n8n (non-blocking)
    await notify_sms_blast_to_n8n(
        school_id=str(user.school_id),
        term_id=body.term_id,
        message_template=template,
    )

    return APIResponse(
        data=SmsBlastResponse(
            queued=debtor_count,
            term_name=term["name"],
            message_template=template,
        ),
        message=f"SMS blast queued for {debtor_count} parents. Messages will arrive within a few minutes.",
    )
