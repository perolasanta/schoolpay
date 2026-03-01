import json
import sqlite3
import time
from pathlib import Path
from typing import Any, Optional

from app.core.config import settings

_DEFAULT_DB_PATH = getattr(settings, "IDEMPOTENCY_DB_PATH", "/tmp/schoolpay_idempotency.db")


def _connect(db_path: Optional[str] = None) -> sqlite3.Connection:
    path = Path(db_path or _DEFAULT_DB_PATH)
    path.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(str(path), timeout=5, isolation_level=None)
    conn.execute("PRAGMA journal_mode=WAL;")
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS idempotency_cache (
            kind TEXT NOT NULL,
            cache_key TEXT NOT NULL,
            created_at INTEGER NOT NULL,
            payload TEXT,
            PRIMARY KEY (kind, cache_key)
        )
        """
    )
    return conn


def _cleanup(conn: sqlite3.Connection, kind: str, ttl_seconds: int, now_ts: int) -> None:
    cutoff = now_ts - int(ttl_seconds)
    conn.execute(
        "DELETE FROM idempotency_cache WHERE kind = ? AND created_at < ?",
        (kind, cutoff),
    )


def get_init_replay(
    cache_key: str,
    ttl_seconds: int,
    db_path: Optional[str] = None,
) -> Optional[dict[str, Any]]:
    now_ts = int(time.time())
    conn = _connect(db_path)
    try:
        _cleanup(conn, "init", ttl_seconds, now_ts)
        row = conn.execute(
            "SELECT payload FROM idempotency_cache WHERE kind = ? AND cache_key = ?",
            ("init", cache_key),
        ).fetchone()
        if not row or not row[0]:
            return None
        return json.loads(row[0])
    finally:
        conn.close()


def remember_init_replay(
    cache_key: str,
    payload: dict[str, Any],
    db_path: Optional[str] = None,
) -> None:
    now_ts = int(time.time())
    conn = _connect(db_path)
    try:
        conn.execute(
            """
            INSERT INTO idempotency_cache (kind, cache_key, created_at, payload)
            VALUES (?, ?, ?, ?)
            ON CONFLICT(kind, cache_key) DO UPDATE SET
                created_at = excluded.created_at,
                payload = excluded.payload
            """,
            ("init", cache_key, now_ts, json.dumps(payload)),
        )
    finally:
        conn.close()


def mark_webhook_event_seen(
    event_key: str,
    ttl_seconds: int,
    db_path: Optional[str] = None,
) -> bool:
    """
    Returns True if duplicate (already seen), else False after recording.
    """
    now_ts = int(time.time())
    conn = _connect(db_path)
    try:
        _cleanup(conn, "webhook", ttl_seconds, now_ts)
        cur = conn.execute(
            """
            INSERT OR IGNORE INTO idempotency_cache (kind, cache_key, created_at, payload)
            VALUES (?, ?, ?, NULL)
            """,
            ("webhook", event_key, now_ts),
        )
        return cur.rowcount == 0
    finally:
        conn.close()
