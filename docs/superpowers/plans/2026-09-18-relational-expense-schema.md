# Relational Expense Schema Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the development expense table with normalized users, categories, and expenses tables while keeping expense CRUD usable through seeded demo data.

**Architecture:** SQLAlchemy models and one rewritten base Alembic migration define identical constraints. The existing FastAPI flow remains user-scoped with a fixed demo UUID and validates category ownership before expense mutations.

**Tech Stack:** Python 3.13, PostgreSQL 17, SQLAlchemy 2 async, Alembic, FastAPI, Pydantic 2, pytest

**Spec:** `docs/superpowers/specs/2026-09-18-relational-expense-schema-design.md`

## Global Constraints

- Existing development data is disposable; rewrite the base migration and rebuild only this project's Compose volume.
- Use UUID primary keys, `NUMERIC(12,2)` money, `DATE` spending dates, and timezone-aware audit timestamps.
- Clients never supply `user_id`; routes use a fixed server-owned demo UUID.
- Database constraints must prevent cross-user category assignment.
- Do not add authentication, category CRUD, ORM relationships, or repository abstractions.

---

### Task 1: Relational Models and Base Migration

**Files:**
- Modify: `backend/app/models.py`
- Modify: `backend/migrations/versions/f5f24808cea4_create_expenses_table.py`
- Test: `backend/tests/test_expenses.py`

**Interfaces:**
- Produces: `User`, `Category`, and `Expense` SQLAlchemy models; seeded demo user UUID `00000000-0000-0000-0000-000000000001`; eleven seeded categories.
- Consumes: `app.database.Base` and the existing Alembic environment.

- [ ] **Step 1: Add a failing relational-schema test**

Add a test database helper that enables SQLite foreign keys and creates all
metadata, then assert that inserting an expense whose `(category_id, user_id)`
pair does not exist raises `sqlalchemy.exc.IntegrityError`:

```python
with pytest.raises(IntegrityError):
    asyncio.run(insert_cross_user_expense())
```

The helper must insert two users, a category for the second user, and an
expense for the first user referencing that category.

- [ ] **Step 2: Run the schema test and verify RED**

```bash
cd backend
uv run pytest tests/test_expenses.py::test_category_must_belong_to_expense_user -v
```

Expected: FAIL because `User` and `Category` do not exist.

- [ ] **Step 3: Implement the three SQLAlchemy models**

Use these database constraints in `backend/app/models.py`:

```python
class User(Base):
    __tablename__ = "users"
    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    email: Mapped[str] = mapped_column(String(320), unique=True)
    name: Mapped[str] = mapped_column(String(200))
    default_currency: Mapped[str] = mapped_column(String(3), default="EUR")
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )


class Category(Base):
    __tablename__ = "categories"
    __table_args__ = (
        UniqueConstraint("user_id", "name"),
        UniqueConstraint("id", "user_id"),
    )
    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    name: Mapped[str] = mapped_column(String(100))
    icon: Mapped[str | None] = mapped_column(String(100), nullable=True)


class Expense(Base):
    __tablename__ = "expenses"
    __table_args__ = (
        CheckConstraint("amount > 0"),
        ForeignKeyConstraint(
            ["category_id", "user_id"],
            ["categories.id", "categories.user_id"],
        ),
        Index("ix_expenses_user_spent_at", "user_id", "spent_at"),
    )
```

Define the requested expense columns, make `category_id` a UUID, add a direct
`users.id` foreign key with `ON DELETE CASCADE`, index `category_id`, and use
`server_default=func.now()` for both audit timestamps plus
`onupdate=func.now()` for `updated_at`.

- [ ] **Step 4: Rewrite the initial migration**

Create tables in dependency order (`users`, `categories`, `expenses`) with the
same types, foreign keys, checks, unique constraints, and indexes as the
models. Seed the fixed demo user and these category rows:

```python
CATEGORIES = (
    ("00000000-0000-0000-0000-000000000101", "groceries", "cart"),
    ("00000000-0000-0000-0000-000000000102", "restaurants", "utensils"),
    ("00000000-0000-0000-0000-000000000103", "transport", "car"),
    ("00000000-0000-0000-0000-000000000104", "rent", "house"),
    ("00000000-0000-0000-0000-000000000105", "utilities", "bolt"),
    ("00000000-0000-0000-0000-000000000106", "shopping", "bag"),
    ("00000000-0000-0000-0000-000000000107", "entertainment", "film"),
    ("00000000-0000-0000-0000-000000000108", "health", "heart"),
    ("00000000-0000-0000-0000-000000000109", "travel", "plane"),
    ("00000000-0000-0000-0000-000000000110", "subscriptions", "repeat"),
    ("00000000-0000-0000-0000-000000000111", "other", "circle"),
)
```

Use `op.bulk_insert` with literal UUID values. Downgrade drops expenses,
categories, then users.

- [ ] **Step 5: Run the schema test and verify GREEN**

```bash
cd backend
uv run pytest tests/test_expenses.py::test_category_must_belong_to_expense_user -v
```

Expected: PASS.

---

### Task 2: Category-ID Expense API

**Files:**
- Modify: `backend/app/schemas.py`
- Modify: `backend/app/services.py`
- Modify: `backend/app/routes.py`
- Modify: `backend/tests/test_expenses.py`

**Interfaces:**
- Consumes: `Category`, `Expense`, and demo seed UUIDs from Task 1.
- Produces: expense requests/responses using `category_id: UUID`; `category_exists(session, user_id, category_id) -> bool`.

- [ ] **Step 1: Change the lifecycle test to require category IDs**

Seed the fixed demo user and an `other` category in the test database. Change
create payloads and assertions from `category` to `category_id`, and add:

```python
foreign_category = client.post(
    "/expenses",
    json={**valid_payload, "category_id": str(other_users_category_id)},
)
assert foreign_category.status_code == 404
```

- [ ] **Step 2: Run the API tests and verify RED**

```bash
cd backend
uv run pytest tests/test_expenses.py -v
```

Expected: FAIL because the API still accepts category names.

- [ ] **Step 3: Update Pydantic contracts**

Replace `category` with `category_id: uuid.UUID` in `ExpenseCreate` and
`ExpenseResponse`. Add optional `category_id` to `ExpenseUpdate`; its validator
must reject an empty patch and explicit nulls for `amount`, `currency`,
`category_id`, and `spent_at` while allowing merchant/description to be
cleared.

- [ ] **Step 4: Add category ownership lookup**

Add to `backend/app/services.py`:

```python
async def category_exists(
    session: AsyncSession, user_id: uuid.UUID, category_id: uuid.UUID
) -> bool:
    return await session.scalar(
        select(exists().where(Category.id == category_id, Category.user_id == user_id))
    )
```

Change all service `user_id` annotations from `str` to `uuid.UUID`.

- [ ] **Step 5: Enforce category ownership in routes**

Set:

```python
DEMO_USER_ID = uuid.UUID("00000000-0000-0000-0000-000000000001")
```

Before create, and before update when `category_id` was supplied, call
`category_exists`. Raise `HTTPException(404, "Category not found")` when it is
false. Keep every expense lookup scoped by `DEMO_USER_ID`.

- [ ] **Step 6: Run API tests and verify GREEN**

```bash
cd backend
uv run pytest tests/test_expenses.py -v
```

Expected: all API and constraint tests pass.

---

### Task 3: PostgreSQL Rebuild and Verification

**Files:**
- Modify only if generated output reveals drift: model or base migration files from Tasks 1–2

**Interfaces:**
- Consumes: the rewritten base migration and Docker Compose `postgres` service.
- Produces: a PostgreSQL database at Alembic head with seeded demo data.

- [ ] **Step 1: Run static and unit checks**

```bash
cd backend
uv run ruff check .
uv run pytest -v
uv lock --check
```

Expected: all commands exit zero.

- [ ] **Step 2: Rebuild only this project's disposable PostgreSQL volume**

From the repository root:

```bash
docker-compose down -v
docker-compose up -d postgres
```

Wait until `docker-compose exec -T postgres pg_isready -U expense -d expense_ai`
reports that PostgreSQL is accepting connections.

- [ ] **Step 3: Apply and verify the base migration**

```bash
cd backend
uv run alembic upgrade head
uv run alembic check
uv run alembic current
```

Expected: upgrade succeeds, Alembic reports no new upgrade operations, and the
current revision is `f5f24808cea4`.

- [ ] **Step 4: Verify seeded rows**

```bash
docker-compose exec -T postgres psql -U expense -d expense_ai -c \
  "SELECT u.email, count(c.id) AS categories FROM users u LEFT JOIN categories c ON c.user_id = u.id GROUP BY u.email;"
```

Expected: `demo@example.com` has 11 categories.

- [ ] **Step 5: Commit**

```bash
git add backend/app/models.py backend/app/schemas.py backend/app/services.py \
  backend/app/routes.py backend/tests/test_expenses.py \
  backend/migrations/versions/f5f24808cea4_create_expenses_table.py
git commit -m "feat: normalize expense database schema"
```
