import asyncio
import uuid
from decimal import Decimal

import pytest
from pydantic import ValidationError
from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import async_sessionmaker
from test_expenses import DEMO_USER_ID, sqlite_engine

from app.database import Base
from app.models import Category, Expense, User


def test_add_expense_persistence_and_failures(tmp_path, monkeypatch):
    from tools import expenses

    engine = sqlite_engine(tmp_path / "tool.db")
    sessions = async_sessionmaker(engine, expire_on_commit=False)
    monkeypatch.setattr(expenses, "SessionLocal", sessions)
    payload = {
        "merchant": "Aldi",
        "amount": "30.10",
        "category": "groceries",
        "spent_at": "2026-09-18",
    }

    async def run():
        try:
            async with engine.begin() as connection:
                await connection.run_sync(Base.metadata.create_all)
            async with sessions() as session:
                foreign_id = uuid.uuid4()
                session.add_all(
                    [
                        User(id=DEMO_USER_ID, email="demo@example.com", name="Demo"),
                        User(id=foreign_id, email="other@example.com", name="Other"),
                    ]
                )
                await session.flush()
                session.add_all(
                    [
                        Category(user_id=DEMO_USER_ID, name="groceries"),
                        Category(user_id=foreign_id, name="foreign"),
                    ]
                )
                await session.commit()

            result = await expenses.add_expense.ainvoke(payload)
            assert result["status"] == "created"
            assert result["expense"]["amount"] == "30.10"
            assert result["expense"]["currency"] == "EUR"
            assert result["expense"]["category"] == "groceries"
            async with sessions() as session:
                rows = list(await session.scalars(select(Expense)))
                assert len(rows) == 1
                assert str(rows[0].id) == result["expense"]["id"]
                assert rows[0].user_id == DEMO_USER_ID
                assert rows[0].amount == Decimal("30.10")
                assert rows[0].spent_at.isoformat() == "2026-09-18"
                assert rows[0].merchant == "Aldi"

            for category in ["missing", "foreign"]:
                result = await expenses.add_expense.ainvoke(
                    payload | {"category": category}
                )
                assert result["code"] == "CATEGORY_NOT_FOUND"
            for invalid in [
                {"amount": "0"},
                {"amount": "-1"},
                {"amount": "1.001"},
                {"amount": "10000000000"},
                {"amount": 30.1},
                {"spent_at": "yesterday"},
                {"currency": "EURO"},
                {"merchant": "x" * 201},
                {"user_id": str(foreign_id)},
            ]:
                with pytest.raises(ValidationError):
                    await expenses.add_expense.ainvoke(payload | invalid)

            async with engine.begin() as connection:
                await connection.execute(
                    text(
                        "CREATE TRIGGER reject_expense BEFORE INSERT ON expenses "
                        "BEGIN SELECT RAISE(ABORT, 'write failed'); END"
                    )
                )
            result = await expenses.add_expense.ainvoke(payload)
            assert result["status"] == "error"
            assert result["code"] == "EXPENSE_WRITE_FAILED"
            async with sessions() as session:
                assert len(list(await session.scalars(select(Expense)))) == 1
        finally:
            await engine.dispose()

    asyncio.run(run())
