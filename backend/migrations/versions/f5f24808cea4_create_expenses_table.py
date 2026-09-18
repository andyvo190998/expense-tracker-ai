"""create relational expense schema

Revision ID: f5f24808cea4
Revises:
Create Date: 2026-09-17 15:12:07.443440
"""

import uuid
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "f5f24808cea4"
down_revision: str | Sequence[str] | None = None
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

DEMO_USER_ID = uuid.UUID("00000000-0000-0000-0000-000000000001")
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


def upgrade() -> None:
    op.create_table(
        "users",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("email", sa.String(length=320), nullable=False),
        sa.Column("name", sa.String(length=200), nullable=False),
        sa.Column(
            "default_currency",
            sa.String(length=3),
            server_default="EUR",
            nullable=False,
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.CheckConstraint(
            "length(default_currency) = 3", name="ck_users_currency"
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("email"),
    )
    op.create_table(
        "categories",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("name", sa.String(length=100), nullable=False),
        sa.Column("icon", sa.String(length=100), nullable=True),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("id", "user_id", name="uq_categories_id_user"),
        sa.UniqueConstraint("user_id", "name", name="uq_categories_user_name"),
    )
    op.create_index("ix_categories_user_id", "categories", ["user_id"])
    op.create_table(
        "expenses",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("merchant", sa.String(length=200), nullable=True),
        sa.Column("description", sa.String(length=500), nullable=True),
        sa.Column("amount", sa.Numeric(precision=12, scale=2), nullable=False),
        sa.Column(
            "currency",
            sa.String(length=3),
            server_default="EUR",
            nullable=False,
        ),
        sa.Column("category_id", sa.Uuid(), nullable=False),
        sa.Column("spent_at", sa.Date(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.CheckConstraint("amount > 0", name="ck_expenses_amount_positive"),
        sa.CheckConstraint("length(currency) = 3", name="ck_expenses_currency"),
        sa.ForeignKeyConstraint(
            ["category_id", "user_id"],
            ["categories.id", "categories.user_id"],
            name="fk_expenses_category_user",
        ),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_expenses_category_id", "expenses", ["category_id"])
    op.create_index(
        "ix_expenses_user_spent_at", "expenses", ["user_id", "spent_at"]
    )

    users = sa.table(
        "users",
        sa.column("id", sa.Uuid()),
        sa.column("email", sa.String()),
        sa.column("name", sa.String()),
        sa.column("default_currency", sa.String()),
    )
    categories = sa.table(
        "categories",
        sa.column("id", sa.Uuid()),
        sa.column("user_id", sa.Uuid()),
        sa.column("name", sa.String()),
        sa.column("icon", sa.String()),
    )
    op.bulk_insert(
        users,
        [
            {
                "id": DEMO_USER_ID,
                "email": "demo@example.com",
                "name": "Demo User",
                "default_currency": "EUR",
            }
        ],
    )
    op.bulk_insert(
        categories,
        [
            {
                "id": uuid.UUID(category_id),
                "user_id": DEMO_USER_ID,
                "name": name,
                "icon": icon,
            }
            for category_id, name, icon in CATEGORIES
        ],
    )


def downgrade() -> None:
    op.drop_table("expenses")
    op.drop_table("categories")
    op.drop_table("users")
