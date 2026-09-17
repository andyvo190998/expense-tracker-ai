# Expense CRUD Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver a runnable FastAPI API that creates, lists, reads, updates, and deletes expenses for one internal demo user.

**Architecture:** FastAPI routes validate HTTP input and inject an async SQLAlchemy session. A small service module performs user-scoped queries and owns mutation transaction boundaries; no repository abstraction is added.

**Tech Stack:** Python 3.13, FastAPI, Pydantic 2, SQLAlchemy 2 async, asyncpg, pytest, HTTPX, aiosqlite, Ruff

**Spec:** `docs/superpowers/specs/2026-09-17-expense-crud-design.md`

## Global Constraints

- Request bodies never accept `user_id`; all operations use the server-owned value `demo-user`.
- Persist and validate money with `Decimal`, never binary floating point.
- Every record lookup is scoped by both expense ID and user ID.
- Do not add authentication, pagination, repositories, analytics, agent tools, or Alembic migrations.

---

### Task 1: Expense CRUD API

**Files:**
- Modify: `backend/pyproject.toml`
- Modify: `backend/app/models.py`
- Modify: `backend/app/schemas.py`
- Create: `backend/app/services.py`
- Create: `backend/app/routes.py`
- Modify: `backend/main.py`
- Create: `backend/tests/test_expenses.py`

**Interfaces:**
- Consumes: `app.database.Base`, `app.database.get_db`, and `app.models.Expense`.
- Produces: FastAPI application `main.app`; router `app.routes.router`; async service functions `create_expense`, `list_expenses`, `get_expense`, `update_expense`, and `delete_expense`.

- [ ] **Step 1: Declare the runtime and test dependencies**

Add `greenlet>=3.2.4` to `[project].dependencies` and add:

```toml
[dependency-groups]
dev = [
    "aiosqlite>=0.21.0",
    "httpx>=0.28.1",
    "pytest>=8.4.2",
    "ruff>=0.12.0",
]
```

Run:

```bash
cd backend
uv sync
```

Expected: dependencies resolve and `backend/uv.lock` is updated.

- [ ] **Step 2: Write the failing API lifecycle test**

Create `backend/tests/test_expenses.py`:

```python
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
```

- [ ] **Step 3: Run the lifecycle test and verify RED**

Run:

```bash
cd backend
uv run pytest tests/test_expenses.py::test_expense_crud_lifecycle -v
```

Expected: collection fails because `main.app` does not exist.

- [ ] **Step 4: Define request and response schemas**

Replace `backend/app/schemas.py` with:

```python
import uuid
from datetime import date
from decimal import Decimal

from pydantic import BaseModel, ConfigDict, Field, model_validator


class ExpenseCreate(BaseModel):
    merchant: str | None = None
    description: str | None = None
    amount: Decimal = Field(gt=0, decimal_places=2)
    currency: str = Field(default="EUR", min_length=3, max_length=3)
    category: str = Field(min_length=1, max_length=100)
    spent_at: date


class ExpenseUpdate(BaseModel):
    merchant: str | None = None
    description: str | None = None
    amount: Decimal | None = Field(default=None, gt=0, decimal_places=2)
    currency: str | None = Field(default=None, min_length=3, max_length=3)
    category: str | None = Field(default=None, min_length=1, max_length=100)
    spent_at: date | None = None

    @model_validator(mode="after")
    def require_change(self):
        if not self.model_fields_set:
            raise ValueError("at least one field is required")
        return self


class ExpenseResponse(ExpenseCreate):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
```

- [ ] **Step 5: Make the existing model lint-clean**

In `backend/app/models.py`, remove the unused `ForeignKey` import. Do not change the model contract.

- [ ] **Step 6: Implement the SQLAlchemy service**

Create `backend/app/services.py`:

```python
import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Expense
from app.schemas import ExpenseCreate, ExpenseUpdate


async def create_expense(
    session: AsyncSession, user_id: str, data: ExpenseCreate
) -> Expense:
    expense = Expense(user_id=user_id, **data.model_dump())
    session.add(expense)
    await session.commit()
    await session.refresh(expense)
    return expense


async def list_expenses(session: AsyncSession, user_id: str) -> list[Expense]:
    result = await session.scalars(
        select(Expense)
        .where(Expense.user_id == user_id)
        .order_by(Expense.spent_at.desc(), Expense.created_at.desc())
    )
    return list(result)


async def get_expense(
    session: AsyncSession, user_id: str, expense_id: uuid.UUID
) -> Expense | None:
    return await session.scalar(
        select(Expense).where(
            Expense.id == expense_id,
            Expense.user_id == user_id,
        )
    )


async def update_expense(
    session: AsyncSession, expense: Expense, data: ExpenseUpdate
) -> Expense:
    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(expense, field, value)
    await session.commit()
    await session.refresh(expense)
    return expense


async def delete_expense(session: AsyncSession, expense: Expense) -> None:
    await session.delete(expense)
    await session.commit()
```

- [ ] **Step 7: Implement the HTTP router**

Create `backend/app/routes.py`:

```python
import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy.ext.asyncio import AsyncSession

from app import services
from app.database import get_db
from app.models import Expense
from app.schemas import ExpenseCreate, ExpenseResponse, ExpenseUpdate

router = APIRouter(prefix="/expenses", tags=["expenses"])
Session = Annotated[AsyncSession, Depends(get_db)]
DEMO_USER_ID = "demo-user"


async def require_expense(expense_id: uuid.UUID, session: Session) -> Expense:
    expense = await services.get_expense(session, DEMO_USER_ID, expense_id)
    if expense is None:
        raise HTTPException(status_code=404, detail="Expense not found")
    return expense


@router.post("", response_model=ExpenseResponse, status_code=status.HTTP_201_CREATED)
async def create(data: ExpenseCreate, session: Session) -> Expense:
    return await services.create_expense(session, DEMO_USER_ID, data)


@router.get("", response_model=list[ExpenseResponse])
async def list_all(session: Session) -> list[Expense]:
    return await services.list_expenses(session, DEMO_USER_ID)


@router.get("/{expense_id}", response_model=ExpenseResponse)
async def get_one(expense_id: uuid.UUID, session: Session) -> Expense:
    return await require_expense(expense_id, session)


@router.patch("/{expense_id}", response_model=ExpenseResponse)
async def update(
    expense_id: uuid.UUID, data: ExpenseUpdate, session: Session
) -> Expense:
    expense = await require_expense(expense_id, session)
    return await services.update_expense(session, expense, data)


@router.delete("/{expense_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete(expense_id: uuid.UUID, session: Session) -> Response:
    expense = await require_expense(expense_id, session)
    await services.delete_expense(session, expense)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
```

- [ ] **Step 8: Create the FastAPI application**

Replace `backend/main.py` with:

```python
from fastapi import FastAPI

from app.routes import router as expense_router

app = FastAPI(title="Expense Tracker API")
app.include_router(expense_router)
```

- [ ] **Step 9: Run the lifecycle test and verify GREEN**

Run:

```bash
cd backend
uv run pytest tests/test_expenses.py::test_expense_crud_lifecycle -v
```

Expected: one test passes.

- [ ] **Step 10: Add focused validation coverage**

Append to `backend/tests/test_expenses.py`:

```python
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
```

- [ ] **Step 11: Run validation coverage and the full checks**

Run:

```bash
cd backend
uv run pytest tests/test_expenses.py -v
uv run ruff check .
```

Expected: two tests pass and Ruff reports no errors.

- [ ] **Step 12: Commit the implementation**

```bash
git add backend/pyproject.toml backend/uv.lock backend/main.py \
  backend/app/models.py backend/app/schemas.py backend/app/services.py \
  backend/app/routes.py backend/tests/test_expenses.py
git commit -m "feat: add expense CRUD API"
```
