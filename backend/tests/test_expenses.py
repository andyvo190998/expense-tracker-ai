import asyncio
import uuid
from datetime import UTC, date, datetime
from decimal import Decimal

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import event
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app.database import Base, get_db
from app.models import Category, Expense, User
from main import app

DEMO_USER_ID = uuid.UUID("00000000-0000-0000-0000-000000000001")
OTHER_CATEGORY_ID = uuid.UUID("00000000-0000-0000-0000-000000000111")
FOREIGN_USER_ID = uuid.UUID("00000000-0000-0000-0000-000000000002")
FOREIGN_CATEGORY_ID = uuid.UUID("00000000-0000-0000-0000-000000000201")
FOREIGN_EXPENSE_ID = uuid.UUID("00000000-0000-0000-0000-000000000301")


def sqlite_engine(path):
    engine = create_async_engine(f"sqlite+aiosqlite:///{path}")

    @event.listens_for(engine.sync_engine, "connect")
    def enable_foreign_keys(connection, _):
        connection.execute("PRAGMA foreign_keys=ON")

    return engine


def test_relational_schema_is_registered():
    assert {"users", "categories", "expenses"} <= set(Base.metadata.tables)
    expenses = Base.metadata.tables["expenses"]
    assert "category_id" in expenses.columns
    assert any(
        constraint.column_keys == ["category_id", "user_id"]
        for constraint in expenses.foreign_key_constraints
    )
    assert Base.metadata.tables["users"].c.default_currency.server_default is not None
    assert expenses.c.currency.server_default is not None


def test_expense_crud_lifecycle(tmp_path):
    engine = sqlite_engine(tmp_path / "test.db")
    sessions = async_sessionmaker(engine, expire_on_commit=False)

    async def prepare_database():
        async with engine.begin() as connection:
            await connection.run_sync(Base.metadata.create_all)
        async with sessions() as session:
            session.add_all(
                [
                    User(id=DEMO_USER_ID, email="demo@example.com", name="Demo"),
                    User(
                        id=FOREIGN_USER_ID,
                        email="foreign@example.com",
                        name="Foreign",
                    ),
                ]
            )
            await session.flush()
            session.add_all(
                [
                    Category(
                        id=OTHER_CATEGORY_ID,
                        user_id=DEMO_USER_ID,
                        name="other",
                        icon="circle",
                    ),
                    Category(
                        id=FOREIGN_CATEGORY_ID,
                        user_id=FOREIGN_USER_ID,
                        name="foreign",
                    ),
                ]
            )
            await session.commit()
            session.add(
                Expense(
                    id=FOREIGN_EXPENSE_ID,
                    user_id=FOREIGN_USER_ID,
                    merchant="Foreign expense",
                    amount=Decimal("9.99"),
                    category_id=FOREIGN_CATEGORY_ID,
                    spent_at=date(2026, 9, 17),
                )
            )
            await session.commit()

    async def age_updated_at(expense_id):
        async with sessions() as session:
            expense = await session.get(Expense, expense_id)
            expense.updated_at = datetime(2000, 1, 1, tzinfo=UTC)
            await session.commit()

    async def timestamps(expense_id):
        async with sessions() as session:
            expense = await session.get(Expense, expense_id)
            return expense.created_at, expense.updated_at

    async def override_get_db():
        async with sessions() as session:
            yield session

    asyncio.run(prepare_database())
    app.dependency_overrides[get_db] = override_get_db

    try:
        with TestClient(app) as client:
            created = client.post(
                "/expenses",
                json={
                    "merchant": "Aldi",
                    "description": "Groceries",
                    "amount": "30.00",
                    "category_id": str(OTHER_CATEGORY_ID),
                    "spent_at": "2026-09-17",
                },
            )
            assert created.status_code == 201
            expense = created.json()
            assert expense["merchant"] == "Aldi"
            assert expense["amount"] == "30.00"
            assert expense["currency"] == "EUR"
            assert expense["category_id"] == str(OTHER_CATEGORY_ID)

            listed = client.get("/expenses")
            assert listed.status_code == 200
            assert [item["id"] for item in listed.json()] == [expense["id"]]
            assert client.get(f"/expenses/{FOREIGN_EXPENSE_ID}").status_code == 404

            fetched = client.get(f"/expenses/{expense['id']}")
            assert fetched.status_code == 200

            asyncio.run(age_updated_at(uuid.UUID(expense["id"])))
            updated = client.patch(
                f"/expenses/{expense['id']}",
                json={"amount": "35.00", "description": None},
            )
            assert updated.status_code == 200
            assert updated.json()["amount"] == "35.00"
            assert updated.json()["description"] is None
            created_at, updated_at = asyncio.run(timestamps(uuid.UUID(expense["id"])))
            assert created_at is not None
            assert updated_at.year > 2000

            foreign_category = client.post(
                "/expenses",
                json={
                    "amount": "10.00",
                    "category_id": str(FOREIGN_CATEGORY_ID),
                    "spent_at": "2026-09-17",
                },
            )
            assert foreign_category.status_code == 404
            assert (
                client.patch(
                    f"/expenses/{expense['id']}",
                    json={"category_id": str(FOREIGN_CATEGORY_ID)},
                ).status_code
                == 404
            )
            assert (
                client.patch(
                    f"/expenses/{FOREIGN_EXPENSE_ID}", json={"amount": "1.00"}
                ).status_code
                == 404
            )
            assert client.delete(f"/expenses/{FOREIGN_EXPENSE_ID}").status_code == 404

            deleted = client.delete(f"/expenses/{expense['id']}")
            assert deleted.status_code == 204
            assert client.get(f"/expenses/{expense['id']}").status_code == 404
    finally:
        app.dependency_overrides.clear()
        asyncio.run(engine.dispose())


def test_category_must_belong_to_expense_user(tmp_path):
    engine = sqlite_engine(tmp_path / "constraints.db")
    sessions = async_sessionmaker(engine, expire_on_commit=False)
    other_user_id = uuid.uuid4()

    async def insert_cross_user_expense():
        async with engine.begin() as connection:
            await connection.run_sync(Base.metadata.create_all)
        async with sessions() as session:
            session.add_all(
                [
                    User(id=DEMO_USER_ID, email="demo@example.com", name="Demo"),
                    User(id=other_user_id, email="other@example.com", name="Other"),
                ]
            )
            await session.flush()
            session.add(
                Category(
                    id=OTHER_CATEGORY_ID,
                    user_id=other_user_id,
                    name="other",
                )
            )
            await session.commit()
            session.add(
                Expense(
                    user_id=DEMO_USER_ID,
                    merchant="Aldi",
                    amount=Decimal("30.00"),
                    category_id=OTHER_CATEGORY_ID,
                    spent_at=date(2026, 9, 17),
                )
            )
            await session.commit()

    try:
        with pytest.raises(IntegrityError):
            asyncio.run(insert_cross_user_expense())
    finally:
        asyncio.run(engine.dispose())


def test_expenses_by_category_aggregates_only_requested_period_and_user(tmp_path):
    engine = sqlite_engine(tmp_path / "category-summary.db")
    sessions = async_sessionmaker(engine, expire_on_commit=False)
    groceries_id = uuid.uuid4()
    transport_id = uuid.uuid4()
    unused_id = uuid.uuid4()

    async def prepare_database():
        async with engine.begin() as connection:
            await connection.run_sync(Base.metadata.create_all)
        async with sessions() as session:
            session.add_all(
                [
                    User(id=DEMO_USER_ID, email="demo@example.com", name="Demo"),
                    User(
                        id=FOREIGN_USER_ID,
                        email="foreign@example.com",
                        name="Foreign",
                    ),
                ]
            )
            await session.flush()
            session.add_all(
                [
                    Category(
                        id=groceries_id,
                        user_id=DEMO_USER_ID,
                        name="groceries",
                    ),
                    Category(
                        id=transport_id,
                        user_id=DEMO_USER_ID,
                        name="transport",
                    ),
                    Category(
                        id=unused_id,
                        user_id=DEMO_USER_ID,
                        name="utilities",
                    ),
                    Category(
                        id=FOREIGN_CATEGORY_ID,
                        user_id=FOREIGN_USER_ID,
                        name="groceries",
                    ),
                ]
            )
            await session.flush()
            session.add_all(
                [
                    Expense(
                        user_id=DEMO_USER_ID,
                        amount=Decimal("30.00"),
                        category_id=groceries_id,
                        spent_at=date(2026, 9, 1),
                    ),
                    Expense(
                        user_id=DEMO_USER_ID,
                        amount=Decimal("12.50"),
                        category_id=groceries_id,
                        spent_at=date(2026, 9, 30),
                    ),
                    Expense(
                        user_id=DEMO_USER_ID,
                        amount=Decimal("20.00"),
                        category_id=transport_id,
                        spent_at=date(2026, 9, 15),
                    ),
                    Expense(
                        user_id=DEMO_USER_ID,
                        amount=Decimal("99.00"),
                        category_id=groceries_id,
                        spent_at=date(2026, 8, 31),
                    ),
                    Expense(
                        user_id=FOREIGN_USER_ID,
                        amount=Decimal("500.00"),
                        category_id=FOREIGN_CATEGORY_ID,
                        spent_at=date(2026, 9, 15),
                    ),
                ]
            )
            await session.commit()

    async def override_get_db():
        async with sessions() as session:
            yield session

    asyncio.run(prepare_database())
    app.dependency_overrides[get_db] = override_get_db

    try:
        with TestClient(app) as client:
            response = client.get(
                "/expenses/by-category",
                params={"start_date": "2026-09-01", "end_date": "2026-09-30"},
            )
            assert response.status_code == 200
            assert response.json() == {
                "currency": "EUR",
                "start_date": "2026-09-01",
                "end_date": "2026-09-30",
                "items": [
                    {"category": "groceries", "amount": "42.50"},
                    {"category": "transport", "amount": "20.00"},
                ],
            }

            invalid = client.get(
                "/expenses/by-category",
                params={"start_date": "2026-10-01", "end_date": "2026-09-30"},
            )
            assert invalid.status_code == 422
    finally:
        app.dependency_overrides.clear()
        asyncio.run(engine.dispose())


def test_expense_input_validation():
    with TestClient(app) as client:
        invalid_create = client.post(
            "/expenses",
            json={
                "amount": "0",
                "currency": "EURO",
                "category_id": str(OTHER_CATEGORY_ID),
                "spent_at": "2026-09-17",
            },
        )
        assert invalid_create.status_code == 422

        empty_patch = client.patch(
            "/expenses/00000000-0000-0000-0000-000000000000", json={}
        )
        assert empty_patch.status_code == 422


@pytest.mark.parametrize("field", ["amount", "currency", "category_id", "spent_at"])
def test_required_patch_fields_cannot_be_null(field):
    with TestClient(app) as client:
        response = client.patch(
            "/expenses/00000000-0000-0000-0000-000000000000",
            json={field: None},
        )
    assert response.status_code == 422
