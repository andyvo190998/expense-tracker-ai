import asyncio

import pytest
from sqlalchemy.ext.asyncio import async_sessionmaker
from test_expenses import sqlite_engine

from app.auth_types import UserRole
from app.cli.create_admin import provision_admin
from app.database import Base
from app.models import User


def test_provision_admin_is_idempotent_and_hashes_password(tmp_path):
    engine = sqlite_engine(tmp_path / "admin-cli.db")
    sessions = async_sessionmaker(engine, expire_on_commit=False)

    async def run():
        async with engine.begin() as connection:
            await connection.run_sync(Base.metadata.create_all)
        async with sessions() as session:
            created = await provision_admin(
                session,
                email=" ADMIN@Example.com ",
                name="Administrator",
                password="correct horse battery staple",
            )
            again = await provision_admin(
                session,
                email="admin@example.com",
                name="Administrator",
                password="correct horse battery staple",
            )
            assert created.id == again.id
            assert again.role is UserRole.ADMIN
            assert again.email == "admin@example.com"
            assert again.password_hash.startswith("$argon2id$")
        await engine.dispose()

    asyncio.run(run())


def test_provision_admin_refuses_to_promote_merchant(tmp_path):
    engine = sqlite_engine(tmp_path / "admin-refuse.db")
    sessions = async_sessionmaker(engine, expire_on_commit=False)

    async def run():
        async with engine.begin() as connection:
            await connection.run_sync(Base.metadata.create_all)
        async with sessions() as session:
            session.add(User(email="user@example.com", name="User"))
            await session.commit()
            with pytest.raises(ValueError, match="existing merchant"):
                await provision_admin(
                    session,
                    email="user@example.com",
                    name="User",
                    password="correct horse battery staple",
                )
        await engine.dispose()

    asyncio.run(run())
