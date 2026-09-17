import asyncio

from fastapi.testclient import TestClient
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app.database import Base, get_db
from main import app


def test_expense_crud_lifecycle(tmp_path):
    engine = create_async_engine(f"sqlite+aiosqlite:///{tmp_path / 'test.db'}")
    sessions = async_sessionmaker(engine, expire_on_commit=False)

    async def prepare_database():
        async with engine.begin() as connection:
            await connection.run_sync(Base.metadata.create_all)

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
                    "amount": "30.00",
                    "currency": "EUR",
                    "category": "groceries",
                    "spent_at": "2026-09-17",
                },
            )
            assert created.status_code == 201
            expense = created.json()
            assert expense["merchant"] == "Aldi"
            assert expense["amount"] == "30.00"

            listed = client.get("/expenses")
            assert listed.status_code == 200
            assert [item["id"] for item in listed.json()] == [expense["id"]]

            fetched = client.get(f"/expenses/{expense['id']}")
            assert fetched.status_code == 200

            updated = client.patch(
                f"/expenses/{expense['id']}", json={"amount": "35.00"}
            )
            assert updated.status_code == 200
            assert updated.json()["amount"] == "35.00"

            deleted = client.delete(f"/expenses/{expense['id']}")
            assert deleted.status_code == 204
            assert client.get(f"/expenses/{expense['id']}").status_code == 404
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
                "category": "",
                "spent_at": "2026-09-17",
            },
        )
        assert invalid_create.status_code == 422

        empty_patch = client.patch(
            "/expenses/00000000-0000-0000-0000-000000000000", json={}
        )
        assert empty_patch.status_code == 422
