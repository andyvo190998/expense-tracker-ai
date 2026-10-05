import hashlib
import hmac
import secrets
from datetime import UTC, datetime, timedelta
from uuid import UUID, uuid4

import jwt
from pwdlib import PasswordHash

from app.auth_types import AccessClaims, UserRole
from app.config import get_settings

password_hasher = PasswordHash.recommended()


def create_access_token(
    user_id: UUID, role: UserRole, *, now: datetime | None = None
) -> str:
    settings = get_settings()
    issued_at = (now or datetime.now(UTC)).astimezone(UTC)
    expires_at = issued_at + timedelta(minutes=settings.access_token_minutes)
    payload = {
        "sub": str(user_id),
        "role": role.value,
        "iat": issued_at,
        "nbf": issued_at,
        "exp": expires_at,
        "jti": str(uuid4()),
        "iss": settings.jwt_issuer,
        "aud": settings.jwt_audience,
        "type": "access",
    }
    return jwt.encode(payload, settings.jwt_secret, algorithm=settings.jwt_algorithm)


def decode_access_token(token: str, *, now: datetime | None = None) -> AccessClaims:
    settings = get_settings()
    current = (now or datetime.now(UTC)).astimezone(UTC)
    try:
        payload = jwt.decode(
            token,
            settings.jwt_secret,
            algorithms=[settings.jwt_algorithm],
            issuer=settings.jwt_issuer,
            audience=settings.jwt_audience,
            options={
                "require": ["sub", "role", "iat", "nbf", "exp", "jti", "iss", "aud", "type"],
                "verify_exp": False,
                "verify_iat": False,
                "verify_nbf": False,
            },
        )
        if payload["type"] != "access":
            raise ValueError("wrong token type")
        issued_at = datetime.fromtimestamp(payload["iat"], UTC)
        not_before = datetime.fromtimestamp(payload["nbf"], UTC)
        expires_at = datetime.fromtimestamp(payload["exp"], UTC)
        if current < not_before or current >= expires_at or issued_at > current:
            raise ValueError("token is outside its validity window")
        return AccessClaims(
            sub=UUID(payload["sub"]),
            role=UserRole(payload["role"]),
            jti=UUID(payload["jti"]),
            issued_at=issued_at,
            expires_at=expires_at,
            token_type="access",
        )
    except (jwt.PyJWTError, KeyError, TypeError, ValueError) as exc:
        raise ValueError("Invalid access token") from exc


def new_refresh_token() -> str:
    return secrets.token_urlsafe(48)


def hash_refresh_token(token: str) -> str:
    settings = get_settings()
    return hmac.new(
        settings.refresh_token_pepper.encode(), token.encode(), hashlib.sha256
    ).hexdigest()


def new_csrf_token() -> str:
    return secrets.token_urlsafe(32)


def constant_time_equal(left: str, right: str) -> bool:
    return hmac.compare_digest(left, right)
