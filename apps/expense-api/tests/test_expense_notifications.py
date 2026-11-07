import asyncio
from datetime import UTC, date, datetime
from decimal import Decimal

import pytest
from sqlalchemy import func, select, text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import async_sessionmaker
from test_expenses import sqlite_engine

from app import services
from app.database import Base
from app.models import Category, Expense, ExpenseOutbox, User
from app.schemas import ExpenseCreate


def test_notification_snapshot_is_exact_scoped_and_immutable(tmp_path, monkeypatch):
    class Clock(datetime):
        @classmethod
        def now(cls, tz=None):
            # December in Berlin, still November in UTC.
            return datetime(2026, 11, 30, 23, 30, tzinfo=UTC)

    monkeypatch.setattr(services, "datetime", Clock)
    engine = sqlite_engine(tmp_path / "notifications.db")
    sessions = async_sessionmaker(engine, expire_on_commit=False)

    async def run():
        try:
            async with engine.begin() as connection:
                await connection.run_sync(Base.metadata.create_all)
            async with sessions() as session:
                user = User(
                    email="owner@example.com",
                    name="Owner",
                    notification_emails=["owner@example.com"],
                    monthly_expense_target=Decimal("100.00"),
                )
                foreign = User(email="foreign@example.com", name="Foreign")
                session.add_all([user, foreign])
                await session.flush()
                category = Category(user_id=user.id, name="<groceries>")
                other = Category(user_id=foreign.id, name="other")
                session.add_all([category, other])
                await session.flush()
                session.add_all(
                    [
                        Expense(
                            user_id=user.id,
                            category_id=category.id,
                            amount=Decimal("10.10"),
                            currency="EUR",
                            spent_at=date(2026, 12, 1),
                        ),
                        Expense(
                            user_id=user.id,
                            category_id=category.id,
                            amount=Decimal(200),
                            currency="USD",
                            spent_at=date(2026, 12, 1),
                        ),
                        Expense(
                            user_id=user.id,
                            category_id=category.id,
                            amount=Decimal(300),
                            currency="EUR",
                            spent_at=date(2026, 11, 1),
                        ),
                        Expense(
                            user_id=foreign.id,
                            category_id=other.id,
                            amount=Decimal(400),
                            currency="EUR",
                            spent_at=date(2026, 12, 1),
                        ),
                    ]
                )
                await session.commit()
                data = ExpenseCreate(
                    amount="30.20",
                    description="Weekly shopping",
                    currency="EUR",
                    category_id=category.id,
                    spent_at=date(2026, 12, 1),
                )
                expense = await services.create_expense(session, user.id, data)
                row = await session.scalar(select(ExpenseOutbox))
                assert row.payload["expense_id"] == str(expense.id)
                assert row.payload["recipients"] == ["owner@example.com"]
                summary = row.payload["email_summary"]
                assert summary == {
                    "expense_category": "<groceries>",
                    "expense_description": "Weekly shopping",
                    "expense_amount": "30.20",
                    "expense_currency": "EUR",
                    "month": "2026-12",
                    "currency": "EUR",
                    "budget": "100.00",
                    "spent": "40.30",
                    "remaining": "59.70",
                    "over_budget": "0.00",
                    "categories": [
                        {
                            "category": "<groceries>",
                            "amount": "40.30",
                            "percentage": "100.0",
                        }
                    ],
                }
                await services.create_expense(
                    session,
                    user.id,
                    data.model_copy(update={"amount": Decimal("70.00")}),
                )
                rows = list(await session.scalars(select(ExpenseOutbox)))
                assert len(rows) == 2
                assert rows[0].payload["email_summary"] == summary
                assert rows[1].payload["email_summary"]["remaining"] == "0.00"
                assert rows[1].payload["email_summary"]["over_budget"] == "10.30"
                user.notification_emails = []
                await session.commit()
                await services.create_expense(session, user.id, data)
                assert len(list(await session.scalars(select(ExpenseOutbox)))) == 2
        finally:
            await engine.dispose()

    asyncio.run(run())


def test_outbox_failure_rolls_back_expense(tmp_path):
    engine = sqlite_engine(tmp_path / "rollback.db")
    sessions = async_sessionmaker(engine, expire_on_commit=False)

    async def run():
        try:
            async with engine.begin() as connection:
                await connection.run_sync(Base.metadata.create_all)
                await connection.execute(
                    text(
                        "CREATE TRIGGER reject_outbox BEFORE INSERT ON expense_outbox "
                        "BEGIN SELECT RAISE(ABORT, 'outbox failed'); END"
                    )
                )
            async with sessions() as session:
                user = User(
                    email="rollback@example.com",
                    name="Owner",
                    notification_emails=["rollback@example.com"],
                )
                session.add(user)
                await session.flush()
                category = Category(user_id=user.id, name="groceries")
                session.add(category)
                await session.commit()
                data = ExpenseCreate(
                    amount="30.20", category_id=category.id, spent_at=date(2026, 12, 1)
                )
                with pytest.raises(IntegrityError):
                    await services.create_expense(session, user.id, data)
                assert (
                    await session.scalar(select(func.count()).select_from(Expense)) == 0
                )
                assert (
                    await session.scalar(
                        select(func.count()).select_from(ExpenseOutbox)
                    )
                    == 0
                )
        finally:
            await engine.dispose()

    asyncio.run(run())


def test_concurrent_notification_snapshots_on_postgres(monkeypatch):
    import os
    import uuid

    from sqlalchemy.ext.asyncio import create_async_engine

    url = os.getenv("TEST_POSTGRES_URL")
    if not url:
        pytest.skip("Set TEST_POSTGRES_URL to test PostgreSQL row locking")

    schema = f"notification_test_{uuid.uuid4().hex}"
    engine = create_async_engine(
        url,
        execution_options={"schema_translate_map": {None: schema}},
    )
    sessions = async_sessionmaker(engine, expire_on_commit=False)

    class Clock(datetime):
        @classmethod
        def now(cls, tz=None):
            return datetime(2026, 12, 1, 12, tzinfo=UTC)

    monkeypatch.setattr(services, "datetime", Clock)

    async def run():
        try:
            async with engine.begin() as connection:
                await connection.execute(text(f'CREATE SCHEMA "{schema}"'))
                await connection.run_sync(Base.metadata.create_all)
            async with sessions() as session:
                user = User(
                    email="concurrent@example.com",
                    name="Owner",
                    notification_emails=["concurrent@example.com"],
                )
                session.add(user)
                await session.flush()
                category = Category(user_id=user.id, name="groceries")
                session.add(category)
                await session.commit()
                user_id, category_id = user.id, category.id

            async def create():
                async with sessions() as session:
                    await services.create_expense(
                        session,
                        user_id,
                        ExpenseCreate(
                            amount="30.20",
                            category_id=category_id,
                            spent_at=date(2026, 12, 1),
                        ),
                    )

            await asyncio.gather(create(), create())
            async with sessions() as session:
                rows = list(await session.scalars(select(ExpenseOutbox)))
                assert sorted(
                    row.payload["email_summary"]["spent"] for row in rows
                ) == [
                    "30.20",
                    "60.40",
                ]
        finally:
            async with engine.begin() as connection:
                await connection.execute(
                    text(f'DROP SCHEMA IF EXISTS "{schema}" CASCADE')
                )
            await engine.dispose()

    asyncio.run(run())
