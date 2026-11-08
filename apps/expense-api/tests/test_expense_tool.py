import asyncio
import uuid
from datetime import date
from decimal import Decimal

import pytest
from pydantic import ValidationError
from sqlalchemy import event, select, text
from sqlalchemy.ext.asyncio import async_sessionmaker
from test_expenses import DEMO_USER_ID, sqlite_engine

from app.agent_context import bind_agent_principal
from app.auth_types import Principal, UserRole
from app.database import Base
from app.models import Category, Expense, User


@pytest.fixture(autouse=True)
def authenticated_tool_principal():
    with bind_agent_principal(Principal(DEMO_USER_ID, UserRole.MERCHANT)):
        yield


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


def test_get_total_expenses_uses_database_sum(tmp_path, monkeypatch):
    from tools import expenses

    engine = sqlite_engine(tmp_path / "total.db")
    sessions = async_sessionmaker(engine, expire_on_commit=False)
    monkeypatch.setattr(expenses, "SessionLocal", sessions)
    statements = []

    @event.listens_for(engine.sync_engine, "before_cursor_execute")
    def record_statement(_connection, _cursor, statement, _parameters, _context, _many):
        statements.append(statement)

    async def run():
        try:
            async with engine.begin() as connection:
                await connection.run_sync(Base.metadata.create_all)
            async with sessions() as session:
                session.add(
                    User(id=DEMO_USER_ID, email="demo@example.com", name="Demo")
                )
                await session.flush()
                category = Category(user_id=DEMO_USER_ID, name="groceries")
                session.add(category)
                await session.flush()
                session.add_all(
                    [
                        Expense(
                            user_id=DEMO_USER_ID,
                            amount=Decimal(amount),
                            currency=currency,
                            category_id=category.id,
                            spent_at=spent_at,
                        )
                        for amount, currency, spent_at in [
                            ("10.10", "EUR", date(2026, 9, 1)),
                            ("20.20", "EUR", date(2026, 9, 30)),
                            ("99.00", "EUR", date(2026, 10, 1)),
                            ("50.00", "USD", date(2026, 9, 15)),
                        ]
                    ]
                )
                await session.commit()

            statements.clear()
            result = await expenses.get_total_expenses.ainvoke(
                {"start_date": "2026-09-01", "end_date": "2026-09-30"}
            )
            assert result == {
                "status": "success",
                "total": "30.30",
                "currency": "EUR",
                "start_date": "2026-09-01",
                "end_date": "2026-09-30",
            }
            selects = [
                statement
                for statement in statements
                if statement.lstrip().upper().startswith("SELECT")
            ]
            assert len(selects) == 1
            assert "sum(" in selects[0].lower()

            empty = await expenses.get_total_expenses.ainvoke(
                {"start_date": "2025-01-01", "end_date": "2025-01-31"}
            )
            assert empty["total"] == "0.00"
            with pytest.raises(ValidationError):
                await expenses.get_total_expenses.ainvoke(
                    {"start_date": "2026-10-01", "end_date": "2026-09-01"}
                )
        finally:
            await engine.dispose()

    asyncio.run(run())


def test_get_spending_by_category_uses_grouped_database_sum(tmp_path, monkeypatch):
    from tools import expenses

    engine = sqlite_engine(tmp_path / "categories.db")
    sessions = async_sessionmaker(engine, expire_on_commit=False)
    monkeypatch.setattr(expenses, "SessionLocal", sessions)
    statements = []

    @event.listens_for(engine.sync_engine, "before_cursor_execute")
    def record_statement(_connection, _cursor, statement, _parameters, _context, _many):
        statements.append(statement)

    async def run():
        try:
            async with engine.begin() as connection:
                await connection.run_sync(Base.metadata.create_all)
            async with sessions() as session:
                session.add(
                    User(id=DEMO_USER_ID, email="demo@example.com", name="Demo")
                )
                await session.flush()
                groceries = Category(user_id=DEMO_USER_ID, name="groceries")
                restaurants = Category(user_id=DEMO_USER_ID, name="restaurants")
                session.add_all([groceries, restaurants])
                await session.flush()
                session.add_all(
                    [
                        Expense(
                            user_id=DEMO_USER_ID,
                            amount=Decimal(amount),
                            currency=currency,
                            category_id=category.id,
                            spent_at=spent_at,
                        )
                        for category, amount, currency, spent_at in [
                            (groceries, "10.10", "EUR", date(2026, 9, 1)),
                            (groceries, "20.20", "EUR", date(2026, 9, 30)),
                            (restaurants, "40.00", "EUR", date(2026, 9, 15)),
                            (restaurants, "99.00", "EUR", date(2026, 10, 1)),
                            (groceries, "50.00", "USD", date(2026, 9, 15)),
                        ]
                    ]
                )
                await session.commit()

            statements.clear()
            result = await expenses.get_spending_by_category.ainvoke(
                {"start_date": "2026-09-01", "end_date": "2026-09-30"}
            )
            assert result == {
                "status": "success",
                "currency": "EUR",
                "start_date": "2026-09-01",
                "end_date": "2026-09-30",
                "items": [
                    {"category": "restaurants", "amount": "40.00"},
                    {"category": "groceries", "amount": "30.30"},
                ],
            }
            selects = [
                statement
                for statement in statements
                if statement.lstrip().upper().startswith("SELECT")
            ]
            assert len(selects) == 1
            assert "sum(" in selects[0].lower()
            assert "group by" in selects[0].lower()
            assert "order by" in selects[0].lower()
        finally:
            await engine.dispose()

    asyncio.run(run())


def test_find_then_update_expense_uses_exact_user_scoped_id(tmp_path, monkeypatch):
    from tools import expenses

    engine = sqlite_engine(tmp_path / "update-tool.db")
    sessions = async_sessionmaker(engine, expire_on_commit=False)
    monkeypatch.setattr(expenses, "SessionLocal", sessions)

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
                groceries = Category(user_id=DEMO_USER_ID, name="groceries")
                restaurants = Category(user_id=DEMO_USER_ID, name="restaurants")
                foreign_category = Category(user_id=foreign_id, name="groceries")
                session.add_all([groceries, restaurants, foreign_category])
                await session.flush()
                older = Expense(
                    user_id=DEMO_USER_ID,
                    merchant="Aldi",
                    amount=Decimal("30.00"),
                    currency="EUR",
                    category_id=groceries.id,
                    spent_at=date(2026, 9, 18),
                )
                newer = Expense(
                    user_id=DEMO_USER_ID,
                    merchant="Aldi Mitte",
                    amount=Decimal("12.00"),
                    currency="EUR",
                    category_id=groceries.id,
                    spent_at=date(2026, 9, 20),
                )
                foreign = Expense(
                    user_id=foreign_id,
                    merchant="Aldi",
                    amount=Decimal("99.00"),
                    currency="EUR",
                    category_id=foreign_category.id,
                    spent_at=date(2026, 9, 21),
                )
                session.add_all([older, newer, foreign])
                await session.commit()
                older_id, newer_id, foreign_expense_id = older.id, newer.id, foreign.id

            found = await expenses.find_expenses.ainvoke(
                {"merchant": "aldi", "limit": 10}
            )
            assert found["status"] == "success"
            assert [item["id"] for item in found["expenses"]] == [
                str(newer_id),
                str(older_id),
            ]
            assert found["expenses"][0]["category"] == "groceries"

            updated = await expenses.update_expense.ainvoke(
                {
                    "expense_id": str(older_id),
                    "amount": "35.25",
                    "category": "restaurants",
                }
            )
            assert updated["status"] == "updated"
            assert updated["expense"]["id"] == str(older_id)
            assert updated["expense"]["amount"] == "35.25"
            assert updated["expense"]["category"] == "restaurants"

            missing = await expenses.update_expense.ainvoke(
                {"expense_id": str(uuid.uuid4()), "amount": "1.00"}
            )
            assert missing["code"] == "EXPENSE_NOT_FOUND"
            foreign_result = await expenses.update_expense.ainvoke(
                {"expense_id": str(foreign_expense_id), "amount": "1.00"}
            )
            assert foreign_result["code"] == "EXPENSE_NOT_FOUND"
            bad_category = await expenses.update_expense.ainvoke(
                {"expense_id": str(older_id), "category": "missing"}
            )
            assert bad_category["code"] == "CATEGORY_NOT_FOUND"

            with pytest.raises(ValidationError):
                await expenses.update_expense.ainvoke(
                    {"expense_id": str(older_id), "amount": 20.0}
                )
            with pytest.raises(ValidationError):
                await expenses.update_expense.ainvoke(
                    {"expense_id": str(older_id)}
                )
        finally:
            await engine.dispose()

    asyncio.run(run())


def test_delete_expense_returns_deleted_snapshot_and_is_user_scoped(
    tmp_path, monkeypatch
):
    from tools import expenses

    engine = sqlite_engine(tmp_path / "delete-tool.db")
    sessions = async_sessionmaker(engine, expire_on_commit=False)
    monkeypatch.setattr(expenses, "SessionLocal", sessions)

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
                category = Category(user_id=DEMO_USER_ID, name="groceries")
                foreign_category = Category(user_id=foreign_id, name="groceries")
                session.add_all([category, foreign_category])
                await session.flush()
                target = Expense(
                    user_id=DEMO_USER_ID,
                    merchant="Lidl",
                    amount=Decimal("18.40"),
                    currency="EUR",
                    category_id=category.id,
                    spent_at=date(2026, 9, 19),
                )
                foreign = Expense(
                    user_id=foreign_id,
                    merchant="Lidl",
                    amount=Decimal("80.00"),
                    currency="EUR",
                    category_id=foreign_category.id,
                    spent_at=date(2026, 9, 19),
                )
                session.add_all([target, foreign])
                await session.commit()
                target_id, foreign_expense_id = target.id, foreign.id

            result = await expenses.delete_expense.ainvoke(
                {"expense_id": str(target_id)}
            )
            assert result == {
                "status": "deleted",
                "expense": {
                    "id": str(target_id),
                    "merchant": "Lidl",
                    "description": None,
                    "amount": "18.40",
                    "currency": "EUR",
                    "category_id": str(category.id),
                    "category": "groceries",
                    "spent_at": "2026-09-19",
                },
            }
            async with sessions() as session:
                assert await session.get(Expense, target_id) is None
                assert await session.get(Expense, foreign_expense_id) is not None

            second = await expenses.delete_expense.ainvoke(
                {"expense_id": str(target_id)}
            )
            assert second["code"] == "EXPENSE_NOT_FOUND"
            foreign_result = await expenses.delete_expense.ainvoke(
                {"expense_id": str(foreign_expense_id)}
            )
            assert foreign_result["code"] == "EXPENSE_NOT_FOUND"
        finally:
            await engine.dispose()

    asyncio.run(run())
