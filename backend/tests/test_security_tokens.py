import pytest
from fastapi import HTTPException

from app.core.security import (
    TokenData,
    create_access_token,
    create_refresh_token,
    verify_refresh_token,
)


def test_verify_refresh_token_accepts_refresh_tokens():
    token = create_refresh_token(
        user_id="11111111-1111-1111-1111-111111111111",
        school_id="22222222-2222-2222-2222-222222222222",
    )

    payload = verify_refresh_token(token)
    assert payload.user_id == "11111111-1111-1111-1111-111111111111"
    assert payload.school_id == "22222222-2222-2222-2222-222222222222"


def test_verify_refresh_token_rejects_access_tokens():
    access_token = create_access_token(
        TokenData(
            user_id="11111111-1111-1111-1111-111111111111",
            school_id="22222222-2222-2222-2222-222222222222",
            role="school_admin",
            email="admin@example.com",
            full_name="Admin User",
            is_platform_admin=False,
        )
    )

    with pytest.raises(HTTPException):
        verify_refresh_token(access_token)
