from datetime import UTC, datetime, timedelta
from uuid import UUID

import jwt
import pytest
from pydantic import ValidationError

from app.auth_types import UserRole
from app.config import Settings, get_settings
from app.security import (
    create_access_token,
    decode_access_token,
    hash_refresh_token,
    new_refresh_token,
    password_hasher,
)

USER_ID = UUID("00000000-0000-0000-0000-000000000001")
NOW = datetime(2026, 10, 5, 12, tzinfo=UTC)


@pytest.fixture(autouse=True)
def security_environment(monkeypatch):
    monkeypatch.setenv("APP_ENV", "test")
    monkeypatch.setenv("JWT_SECRET", "test-signing-secret-that-is-at-least-32-bytes")
    monkeypatch.setenv("REFRESH_TOKEN_PEPPER", "test-refresh-pepper-that-is-at-least-32-bytes")
    monkeypatch.setenv("JWT_ISSUER", "expense-tracker-test")
    monkeypatch.setenv("JWT_AUDIENCE", "expense-tracker-web-test")
    get_settings.cache_clear()
    yield
    get_settings.cache_clear()


def test_passwords_are_argon2id_hashed_and_verified():
    encoded = password_hasher.hash("correct horse battery staple")
    assert encoded.startswith("$argon2id$")
    assert password_hasher.verify("correct horse battery staple", encoded)
    assert not password_hasher.verify("wrong", encoded)


def test_access_token_round_trips_required_claims():
    token = create_access_token(USER_ID, UserRole.MERCHANT, now=NOW)
    claims = decode_access_token(token, now=NOW)

    assert claims.sub == USER_ID
    assert claims.role is UserRole.MERCHANT
    assert claims.token_type == "access"
    assert claims.issued_at == NOW
    assert claims.expires_at == NOW + timedelta(minutes=15)


@pytest.mark.parametrize(
    ("claim", "value"),
    [("iss", "wrong"), ("aud", "wrong"), ("type", "refresh")],
)
def test_access_token_rejects_wrong_security_claim(claim, value):
    settings = get_settings()
    payload = {
        "sub": str(USER_ID),
        "role": "merchant",
        "iat": NOW,
        "nbf": NOW,
        "exp": NOW + timedelta(minutes=15),
        "jti": "00000000-0000-0000-0000-000000000099",
        "iss": settings.jwt_issuer,
        "aud": settings.jwt_audience,
        "type": "access",
    }
    payload[claim] = value
    token = jwt.encode(payload, settings.jwt_secret, algorithm=settings.jwt_algorithm)

    with pytest.raises(ValueError, match="Invalid access token"):
        decode_access_token(token, now=NOW)


def test_access_token_rejects_expired_token():
    token = create_access_token(USER_ID, UserRole.MERCHANT, now=NOW)
    with pytest.raises(ValueError, match="Invalid access token"):
        decode_access_token(token, now=NOW + timedelta(minutes=16))


def test_refresh_hash_is_deterministic_without_storing_raw_token():
    raw = new_refresh_token()
    digest = hash_refresh_token(raw)

    assert digest == hash_refresh_token(raw)
    assert raw not in digest
    assert len(digest) == 64


@pytest.mark.parametrize("secret", ["change-me", "too-short"])
def test_production_rejects_unsafe_signing_secret(monkeypatch, secret):
    monkeypatch.setenv("APP_ENV", "production")
    monkeypatch.setenv("JWT_SECRET", secret)
    with pytest.raises(ValidationError):
        Settings()
