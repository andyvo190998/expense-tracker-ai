import uuid
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta

from pwdlib.exceptions import UnknownHashError
from sqlalchemy import select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth_schemas import RegisterRequest
from app.auth_types import UserRole
from app.config import get_settings
from app.models import Category, RefreshToken, User
from app.security import hash_refresh_token, new_refresh_token, password_hasher

CATEGORY_NAMES = (
    "groceries",
    "restaurants",
    "transport",
    "rent",
    "utilities",
    "shopping",
    "entertainment",
    "health",
    "travel",
    "subscriptions",
    "other",
)


class AuthFailure(Exception):
    def __init__(self, code: str, message: str, status_code: int = 401):
        self.code = code
        self.message = message
        self.status_code = status_code
        super().__init__(message)


@dataclass(frozen=True)
class SessionTokens:
    user: User
    refresh_token: str


def _utc(value: datetime) -> datetime:
    return value.replace(tzinfo=UTC) if value.tzinfo is None else value.astimezone(UTC)


def _new_refresh(user: User, family_id: uuid.UUID | None = None) -> tuple[RefreshToken, str]:
    settings = get_settings()
    raw = new_refresh_token()
    record = RefreshToken(
        user_id=user.id,
        family_id=family_id or uuid.uuid4(),
        token_hash=hash_refresh_token(raw),
        expires_at=datetime.now(UTC) + timedelta(days=settings.refresh_token_days),
    )
    return record, raw


async def register_user(session: AsyncSession, data: RegisterRequest) -> SessionTokens:
    if not get_settings().public_registration:
        raise AuthFailure("REGISTRATION_DISABLED", "Registration is disabled.", 403)
    user = User(
        email=str(data.email).lower(),
        name=data.name,
        password_hash=password_hasher.hash(data.password),
        role=UserRole.MERCHANT,
    )
    session.add(user)
    try:
        await session.flush()
        session.add_all([Category(user_id=user.id, name=name) for name in CATEGORY_NAMES])
        record, raw = _new_refresh(user)
        session.add(record)
        await session.commit()
        await session.refresh(user)
        return SessionTokens(user, raw)
    except IntegrityError as exc:
        await session.rollback()
        raise AuthFailure("EMAIL_EXISTS", "An account with this email already exists.", 409) from exc
    except Exception:
        await session.rollback()
        raise


async def authenticate_user(session: AsyncSession, email: str, password: str) -> SessionTokens:
    user = await session.scalar(select(User).where(User.email == email.strip().lower()))
    valid = False
    if user is not None:
        try:
            valid = password_hasher.verify(password, user.password_hash)
        except UnknownHashError:
            valid = False
    if user is None or not valid:
        raise AuthFailure("INVALID_CREDENTIALS", "Invalid email or password.")
    if not user.is_active:
        raise AuthFailure("ACCOUNT_INACTIVE", "This account is inactive.")
    record, raw = _new_refresh(user)
    session.add(record)
    await session.commit()
    return SessionTokens(user, raw)


async def rotate_refresh_token(session: AsyncSession, raw: str) -> SessionTokens:
    now = datetime.now(UTC)
    record = await session.scalar(
        select(RefreshToken)
        .where(RefreshToken.token_hash == hash_refresh_token(raw))
        .with_for_update()
    )
    if record is None or _utc(record.expires_at) <= now:
        raise AuthFailure("INVALID_REFRESH", "Refresh session is invalid.")
    if record.revoked_at is not None:
        if record.replaced_by_id is not None:
            await session.execute(
                update(RefreshToken)
                .where(RefreshToken.family_id == record.family_id, RefreshToken.revoked_at.is_(None))
                .values(revoked_at=now)
            )
            await session.commit()
        raise AuthFailure("REFRESH_REPLAY", "Refresh session is invalid.")
    user = await session.get(User, record.user_id)
    if user is None or not user.is_active:
        record.revoked_at = now
        await session.commit()
        raise AuthFailure("ACCOUNT_INACTIVE", "This account is inactive.")
    successor, successor_raw = _new_refresh(user, record.family_id)
    session.add(successor)
    await session.flush()
    record.revoked_at = now
    record.replaced_by_id = successor.id
    await session.commit()
    return SessionTokens(user, successor_raw)


async def revoke_refresh_token(session: AsyncSession, raw: str | None) -> None:
    if raw:
        record = await session.scalar(
            select(RefreshToken).where(RefreshToken.token_hash == hash_refresh_token(raw))
        )
        if record is not None and record.revoked_at is None:
            record.revoked_at = datetime.now(UTC)
            await session.commit()
