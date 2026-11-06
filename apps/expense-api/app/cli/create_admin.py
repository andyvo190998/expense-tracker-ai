import asyncio
import getpass
import os

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth_types import UserRole
from app.database import SessionLocal
from app.models import User
from app.security import password_hasher


async def provision_admin(
    session: AsyncSession, *, email: str, name: str, password: str
) -> User:
    normalized = email.strip().lower()
    if len(password) < 12:
        raise ValueError("admin password must be at least 12 characters")
    existing = await session.scalar(select(User).where(User.email == normalized))
    if existing is not None:
        if existing.role is not UserRole.ADMIN:
            raise ValueError("refusing to promote an existing merchant")
        return existing
    user = User(
        email=normalized,
        name=name.strip(),
        password_hash=password_hasher.hash(password),
        role=UserRole.ADMIN,
    )
    session.add(user)
    await session.commit()
    await session.refresh(user)
    return user


async def _run() -> int:
    email = os.getenv("ADMIN_EMAIL") or input("Admin email: ")
    name = os.getenv("ADMIN_NAME") or input("Admin name: ")
    password = os.getenv("ADMIN_PASSWORD") or getpass.getpass("Admin password: ")
    async with SessionLocal() as session:
        user = await provision_admin(session, email=email, name=name, password=password)
    print(f"Admin ready: {user.email}")
    return 0


def main() -> int:
    try:
        return asyncio.run(_run())
    except ValueError as error:
        print(f"Admin provisioning failed: {error}")
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
