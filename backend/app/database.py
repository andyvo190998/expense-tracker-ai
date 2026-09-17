from sqlalchemy.ext.asyncio import (
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)
from sqlalchemy.orm import DeclarativeBase

DATABASE_URL = (
    "postgresql+asyncpg://expense:expense@localhost:5433/expense_ai"
)

engine = create_async_engine(
    DATABASE_URL,
    echo=True,
)

SessionLocal = async_sessionmaker(
    engine,
    expire_on_commit=False,
    class_=AsyncSession,
)


class Base(DeclarativeBase):
    pass


async def get_db():
    async with SessionLocal() as session:
        yield session
