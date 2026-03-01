from app.utils.idempotency import (
    get_init_replay,
    mark_webhook_event_seen,
    remember_init_replay,
)


def test_init_replay_roundtrip(tmp_path):
    db_file = tmp_path / "idempotency.sqlite3"
    key = "invoice:token:parent@example.com"
    payload = {
        "authorization_url": "https://checkout.example/abc",
        "access_code": "ACC_123",
        "reference": "REF_123",
    }

    assert get_init_replay(key, ttl_seconds=600, db_path=str(db_file)) is None
    remember_init_replay(key, payload=payload, db_path=str(db_file))
    assert get_init_replay(key, ttl_seconds=600, db_path=str(db_file)) == payload


def test_webhook_event_seen_is_idempotent(tmp_path):
    db_file = tmp_path / "idempotency.sqlite3"
    event_key = "evt_987654"

    assert mark_webhook_event_seen(event_key, ttl_seconds=600, db_path=str(db_file)) is False
    assert mark_webhook_event_seen(event_key, ttl_seconds=600, db_path=str(db_file)) is True
