# app/utils/sms.py
#
# FastAPI does NOT send SMS directly.
# It posts to n8n, which handles the Termii API call.
# This keeps messaging logic out of the backend.

import httpx
import logging
from app.core.config import settings

logger = logging.getLogger(__name__)


async def notify_payment_to_n8n(
    payment_id: str,
    school_id: str,
    student_id: str,
    amount: float,
    receipt_number: str,
    payment_method: str,
):
    """
    Fires a webhook to n8n after a successful payment.
    n8n then fetches the student's phone number and sends SMS + WhatsApp.

    If n8n is unreachable (e.g. starting up), we log and continue.
    SMS failure must NEVER block a payment confirmation.
    """
    webhook_url = (
        f"{settings.N8N_WEBHOOK_BASE_URL}/"
        f"{settings.N8N_PAYMENT_SUCCESS_WEBHOOK}"
    )
    payload = {
        "payment_id": payment_id,
        "school_id": school_id,
        "student_id": student_id,
        "amount": amount,
        "receipt_number": receipt_number,
        "payment_method": payment_method,
    }
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            response = await client.post(webhook_url, json=payload)
            if response.status_code not in (200, 201):
                logger.warning(
                    f"n8n webhook returned {response.status_code} "
                    f"for payment {payment_id}"
                )
    except Exception as e:
        # Never raise — SMS is best-effort, payment is authoritative
        logger.error(f"Failed to notify n8n for payment {payment_id}: {e}")


async def notify_sms_blast_to_n8n(school_id: str, term_id: str, message_template: str):
    """Trigger n8n bulk debtor SMS blast workflow."""
    webhook_url = (
        f"{settings.N8N_WEBHOOK_BASE_URL}/"
        f"{settings.N8N_FEE_REMINDER_WEBHOOK}"
    )
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            await client.post(webhook_url, json={
                "school_id": school_id,
                "term_id": term_id,
                "message_template": message_template,
            })
    except Exception as e:
        logger.error(f"Failed to trigger SMS blast for school {school_id}: {e}")
