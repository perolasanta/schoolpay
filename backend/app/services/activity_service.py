# app/services/activity_service.py
# Writes to activity_logs. Called after every significant action.

from typing import Optional, Any
from datetime import datetime, timezone
import logging
from app.core.database import supabase_admin

logger = logging.getLogger(__name__)


async def log_activity(
    action: str,
    school_id: Optional[str] = None,
    user_id: Optional[str] = None,
    entity_type: Optional[str] = None,
    entity_id: Optional[Any] = None,
    metadata: Optional[dict] = None,
    ip_address: Optional[str] = None,
):
    """
    Append-only audit log. Never raises — logging must never
    block or break the main operation.

    Action format: 'entity.verb'
    Examples:
        'payment.recorded', 'invoice.generated',
        'student.created', 'transfer.approved', 'payment.voided'
    """
    try:
        supabase_admin.table("activity_logs").insert({
            "school_id": str(school_id) if school_id else None,
            "user_id": str(user_id) if user_id else None,
            "action": action,
            "entity_type": entity_type,
            "entity_id": str(entity_id) if entity_id else None,
            "metadata": metadata or {},
            "ip_address": ip_address,
            "created_at": datetime.now(timezone.utc).isoformat(),
        }).execute()
    except Exception as e:
        # Log to system log but don't raise — audit logging
        # must NEVER cause a user-facing error
        logger.error(f"Failed to write activity log [{action}]: {e}")
