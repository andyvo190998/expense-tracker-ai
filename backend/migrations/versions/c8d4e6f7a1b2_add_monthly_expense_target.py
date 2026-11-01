"""add per-user monthly expense target

Revision ID: c8d4e6f7a1b2
Revises: a3b7c91d2e4f
Create Date: 2026-11-01
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "c8d4e6f7a1b2"
down_revision: str | Sequence[str] | None = "a3b7c91d2e4f"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "users",
        sa.Column(
            "monthly_expense_target",
            sa.Numeric(12, 2),
            server_default="500.00",
            nullable=False,
        ),
    )
    op.create_check_constraint(
        "ck_users_monthly_expense_target_positive",
        "users",
        "monthly_expense_target > 0",
    )


def downgrade() -> None:
    op.drop_constraint(
        "ck_users_monthly_expense_target_positive", "users", type_="check"
    )
    op.drop_column("users", "monthly_expense_target")
