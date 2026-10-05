import asyncio
import uuid
from datetime import UTC, datetime, timedelta

from sqlalchemy import event, func, select
from sqlalchemy.ext.asyncio import async_sessionmaker
from test_expenses import sqlite_engine

from app.auth_types import UserRole
from app.database import Base
from app.models import RefreshToken, User


def test_auth_schema_is_registered():
    users = Base.metadata.tables["users"]
    refresh_tokens = Base.metadata.tables["refresh_tokens"]

    assert {"password_hash", "role", "is_active", "updated_at"} <= set(users.c.keys())
    assert refresh_tokens.c.token_hash.unique
    assert refresh_tokens.c.user_id.foreign_keys
    assert refresh_tokens.c.family_id.index


def test_refresh_successor_and_user_cascade(tmp_path):
    engine = sqlite_engine(tmp_path / "auth-models.db")
    sessions = async_sessionmaker(engine, expire_on_commit=False)

    @event.listens_for(engine.sync_engine, "connect")
    def enable_recursive_triggers(connection, _):
        connection.execute("PRAGMA recursive_triggers=ON")

    async def run():
        async with engine.begin() as connection:
            await connection.run_sync(Base.metadata.create_all)
        async with sessions() as session:
            user = User(
                id=uuid.uuid4(),
                email="auth@example.com",
                name="Auth User",
                password_hash="$argon2id$test",
                role=UserRole.MERCHANT,
            )
            family_id = uuid.uuid4()
            first = RefreshToken(
                id=uuid.uuid4(),
                user_id=user.id,
                family_id=family_id,
                token_hash="a" * 64,
                expires_at=datetime.now(UTC) + timedelta(days=1),
            )
            second = RefreshToken(
                id=uuid.uuid4(),
                user_id=user.id,
                family_id=family_id,
                token_hash="b" * 64,
                expires_at=datetime.now(UTC) + timedelta(days=1),
            )
            session.add(user)
            await session.flush()
            session.add_all([first, second])
            await session.flush()
            first.replaced_by_id = second.id
            await session.commit()
            await session.delete(user)
            await session.commit()
            count = await session.scalar(select(func.count(RefreshToken.id)))
            assert count == 0
        await engine.dispose()

    asyncio.run(run())
