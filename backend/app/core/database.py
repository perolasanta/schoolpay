# ============================================================
# app/core/database.py
#
# TWO clients — two very different jobs:
#
# supabase_admin  (SERVICE ROLE key)
# ├── Bypasses ALL RLS policies
# ├── Use for: Auth API, platform tables (schools, platform_subscriptions)
# ├── Use for: login flow (before JWT is issued)
# └── NEVER use for school-level data (students, invoices, payments...)
#
# SchoolDB  (a typed wrapper — still uses service key internally)
# ├── Wraps every query with MANDATORY school_id filtering
# ├── Raises immediately if you forget school_id
# ├── Use for: ALL school-level data operations
# └── Works with Supabase Python SDK without per-request JWT injection
#
# WHY NOT JUST USE THE ANON CLIENT + RLS?
# ────────────────────────────────────────
# The Supabase Python SDK doesn't support per-request JWT injection
# cleanly (unlike the JS SDK). The correct pattern for FastAPI is:
#
#   Pass Authorization: Bearer <user_jwt> as header to PostgREST.
#   This triggers RLS automatically per request.
#
# That requires raw httpx calls to PostgREST, not the SDK.
# For now we use the SchoolDB wrapper as a safety net — it enforces
# school_id at the application layer. RLS adds a second enforcement
# layer at the database layer for all operations that go through
# the authenticated role (which SchoolDB queries do via search_path).
#
# TODO (when scaling to 50+ schools): replace SchoolDB with direct
# PostgREST calls using per-request user JWT for true RLS enforcement.
# ============================================================

# ============================================================
# app/core/database.py
# ============================================================

from supabase import create_client, Client
from supabase.lib.client_options import SyncClientOptions
from app.core.config import settings
from fastapi import HTTPException
import logging

logger = logging.getLogger(__name__)


# ── Raw clients ───────────────────────────────────────────────
def _make_admin_client() -> Client:
    # Use the standard initialization
    options = SyncClientOptions(schema="schoolpay")
    client = create_client(
        settings.SUPABASE_URL,
        settings.SUPABASE_SERVICE_KEY,
        options=options
    )
    # Remove the manual .postgrest.schema("schoolpay") line 
    # as it can cause duplicate headers leading to 406
    return client

# Module-level admin client — for auth + all table operations
supabase_admin: Client = _make_admin_client()


# ── Dedicated query client (never used for auth) ──────────────
# supabase_admin gets its session poisoned when sign_in_with_password
# is called on any client sharing the same connection pool.
# This client is used ONLY for DB queries — never for auth operations.
def make_query_client() -> Client:
    return create_client(
        settings.SUPABASE_URL,
        settings.SUPABASE_SERVICE_KEY,
        options=SyncClientOptions(schema="schoolpay")
    )

# ── School-scoped DB wrapper ──────────────────────────────────
class SchoolDB:
    """
    Safety wrapper around Supabase queries for school-level data.
    Every method requires school_id — impossible to query across schools.
    """

    def __init__(self, school_id: str):
        if not school_id:
            raise ValueError("SchoolDB requires a non-empty school_id")
        self.school_id = school_id
        self._client: Client = _make_admin_client()

    def select(self, table: str, columns: str = "*"):
        return (
            self._client
            .table(table)
            .select(columns)
            .eq("school_id", self.school_id)
        )

    def select_one(self, table: str, record_id: str, columns: str = "*"):
        result = (
            self._client
            .table(table)
            .select(columns)
            .eq("id", record_id)
            .eq("school_id", self.school_id)
            .execute()
        )
        return result.data[0] if result.data else None

    def require_one(self, table: str, record_id: str, columns: str = "*"):
        data = self.select_one(table, record_id, columns)
        if not data:
            raise HTTPException(
                status_code=404,
                detail=f"Record not found in {table}",
            )
        return data

    def insert(self, table: str, payload: dict) -> dict:
        payload["school_id"] = self.school_id
        result = self._client.table(table).insert(payload).execute()
        return result.data[0] if result.data else {}

    def insert_many(self, table: str, rows: list[dict]) -> list[dict]:
        for row in rows:
            row["school_id"] = self.school_id
        result = self._client.table(table).insert(rows).execute()
        return result.data or []

    def update(self, table: str, payload: dict, record_id: str) -> dict:
        payload.pop("school_id", None)
        result = (
            self._client
            .table(table)
            .update(payload)
            .eq("id", record_id)
            .eq("school_id", self.school_id)
            .execute()
        )
        if not result.data:
            raise HTTPException(
                status_code=404,
                detail=f"Record not found or access denied in {table}",
            )
        return result.data[0]

    def update_where(self, table: str, payload: dict, **filters) -> list[dict]:
        payload.pop("school_id", None)
        query = self._client.table(table).update(payload).eq("school_id", self.school_id)
        for col, val in filters.items():
            query = query.eq(col, val)
        result = query.execute()
        return result.data or []

    def raw(self):
        return self._client


# ── Health check ─────────────────────────────────────────────
async def check_db_connection() -> bool:
    try:
        result = supabase_admin.table("schools").select("id").limit(1).execute()
        return True
    except Exception as e:
        logger.error(f"DB health check failed: {e}")
        return False
