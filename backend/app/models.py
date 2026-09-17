import uuid
from datetime import UTC, date, datetime
from decimal import Decimal

from sqlalchemy import (
    Date,
    DateTime,
    Numeric,
    String,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class Expense(Base):
    __tablename__ = "expenses"

    id: Mapped[uuid.UUID] = mapped_column(
        primary_key=True,
        default=uuid.uuid4,
    )

    user_id: Mapped[str] = mapped_column(
        String(100),
        index=True,
    )

    merchant: Mapped[str | None] = mapped_column(
        String(200),
        nullable=True,
    )

    description: Mapped[str | None] = mapped_column(
        String(500),
        nullable=True,
    )

    amount: Mapped[Decimal] = mapped_column(
        Numeric(12, 2),
        nullable=False,
    )

    currency: Mapped[str] = mapped_column(
        String(3),
        default="EUR",
    )

    category: Mapped[str] = mapped_column(
        String(100),
        index=True,
    )

    spent_at: Mapped[date] = mapped_column(
        Date,
        index=True,
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(UTC),
    )
