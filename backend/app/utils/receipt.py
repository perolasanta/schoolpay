# app/utils/receipt.py
# Generates human-readable receipt numbers: RCP/2025/000042

from datetime import datetime
from app.core.database import supabase_admin


def generate_receipt_number() -> str:
    """
    Calls the Postgres sequence to get the next receipt number.
    Thread-safe — Postgres sequences are atomic.
    Format: RCP/2025/000042
    """
    try:
        result = supabase_admin.rpc("generate_receipt_number").execute()
        return result.data
    except Exception:
        # Fallback: timestamp-based (not as clean but never fails)
        now = datetime.now()
        return f"RCP/{now.year}/{now.strftime('%m%d%H%M%S')}"
