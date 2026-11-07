"""add expense notification outbox

Revision ID: 0df5c1ebf0ba
Revises: c8d4e6f7a1b2
Create Date: 2026-11-07 13:24:58.239447

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '0df5c1ebf0ba'
down_revision: Union[str, Sequence[str], None] = 'c8d4e6f7a1b2'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None



def upgrade() -> None:
    op.add_column(
        "users",
        sa.Column(
            "notification_emails",
            sa.JSON(),
            nullable=False,
            server_default=sa.text("'[]'"),
        ),
    )

    op.create_table(
        "expense_outbox",
        sa.Column(
            "event_id",
            sa.Uuid(),
            nullable=False,
            primary_key=True,
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
        ),
        sa.Column(
            "payload",
            sa.JSON(),
            nullable=False,
        ),
    )

    op.create_index(
        "ix_expense_outbox_created_at",
        "expense_outbox",
        ["created_at"],
    )

def downgrade() -> None:
    op.drop_index(
        "ix_expense_outbox_created_at",
        table_name="expense_outbox",
    )
    op.drop_table("expense_outbox")
    op.drop_column("users", "notification_emails")