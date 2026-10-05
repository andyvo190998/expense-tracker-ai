"""add authentication and per-user ACL persistence

Revision ID: a3b7c91d2e4f
Revises: f5f24808cea4
Create Date: 2026-10-05
"""

import secrets
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from pwdlib import PasswordHash

revision: str = "a3b7c91d2e4f"
down_revision: str | Sequence[str] | None = "f5f24808cea4"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("users", sa.Column("password_hash", sa.String(512), nullable=True))
    op.add_column("users", sa.Column("role", sa.String(20), nullable=True))
    op.add_column(
        "users",
        sa.Column("is_active", sa.Boolean(), server_default=sa.true(), nullable=False),
    )
    op.add_column(
        "users",
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
    )

    connection = op.get_bind()
    password_hash = PasswordHash.recommended()
    users = sa.table(
        "users",
        sa.column("id", sa.Uuid()),
        sa.column("password_hash", sa.String()),
        sa.column("role", sa.String()),
    )
    for user_id in connection.execute(sa.select(users.c.id)).scalars():
        locked_hash = password_hash.hash(secrets.token_urlsafe(48))
        connection.execute(
            users.update()
            .where(users.c.id == user_id)
            .values(password_hash=locked_hash, role="merchant")
        )

    with op.batch_alter_table("users") as batch:
        batch.alter_column("password_hash", existing_type=sa.String(512), nullable=False)
        batch.alter_column("role", existing_type=sa.String(20), nullable=False)
        batch.create_check_constraint(
            "ck_users_role", "role IN ('admin', 'merchant')"
        )

    op.create_table(
        "refresh_tokens",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("family_id", sa.Uuid(), nullable=False),
        sa.Column("token_hash", sa.String(64), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column("revoked_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("replaced_by_id", sa.Uuid(), nullable=True),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(
            ["replaced_by_id"], ["refresh_tokens.id"], ondelete="SET NULL"
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("token_hash"),
    )
    op.create_index("ix_refresh_tokens_user_id", "refresh_tokens", ["user_id"])
    op.create_index("ix_refresh_tokens_family_id", "refresh_tokens", ["family_id"])
    op.create_index("ix_refresh_tokens_expires_at", "refresh_tokens", ["expires_at"])


def downgrade() -> None:
    op.drop_table("refresh_tokens")
    with op.batch_alter_table("users") as batch:
        batch.drop_constraint("ck_users_role", type_="check")
        batch.drop_column("updated_at")
        batch.drop_column("is_active")
        batch.drop_column("role")
        batch.drop_column("password_hash")
