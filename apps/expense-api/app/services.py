import uuid
from calendar import monthrange
from datetime import UTC, date, datetime
from decimal import ROUND_HALF_UP, Decimal
from zoneinfo import ZoneInfo

from sqlalchemy import exists, func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.expense_events import ExpenseCreatedEvent, ExpenseEmailSummary
from app.models import Category, Expense, ExpenseOutbox, RefreshToken, User
from app.schemas import ExpenseCreate, ExpenseUpdate


async def create_expense(
    session: AsyncSession, user_id: uuid.UUID, data: ExpenseCreate
) -> Expense:
    expense = Expense(user_id=user_id, **data.model_dump())

    try:
        # Serialize creates for this account so each summary includes earlier creates.
        user = await session.scalar(
            select(User).where(User.id == user_id).with_for_update()
        )
        session.add(expense)
        await session.flush()
        await session.refresh(expense)

        if user is not None and user.is_active and user.notification_emails:
            occurred_at = datetime.now(UTC)
            summary = await expense_email_summary(session, user, expense, occurred_at)
            event = ExpenseCreatedEvent(
                event_id=uuid.uuid4(),
                expense_id=expense.id,
                occurred_at=occurred_at,
                recipients=user.notification_emails,
                email_summary=summary,
            )
            session.add(
                ExpenseOutbox(
                    event_id=event.event_id,
                    created_at=event.occurred_at,
                    payload=event.model_dump(mode="json"),
                )
            )
        await session.commit()
    except Exception:
        await session.rollback()
        raise
    return expense


async def expense_email_summary(
    session: AsyncSession, user: User, expense: Expense, occurred_at: datetime
) -> ExpenseEmailSummary:
    today = occurred_at.astimezone(ZoneInfo("Europe/Berlin")).date()
    start = today.replace(day=1)
    end = today.replace(day=monthrange(today.year, today.month)[1])
    rows = await get_spending_by_category(session, user.id, start, end)
    spent = sum((amount for _, amount in rows), Decimal("0.00"))
    budget = user.monthly_expense_target
    category = await session.scalar(
        select(Category.name).where(
            Category.id == expense.category_id,
            Category.user_id == user.id,
        )
    )
    return ExpenseEmailSummary(
        expense_category=category,
        expense_description=expense.description,
        expense_amount=format(expense.amount, ".2f"),
        expense_currency=expense.currency,
        month=today.strftime("%Y-%m"),
        budget=format(budget, ".2f"),
        spent=format(spent, ".2f"),
        remaining=format(max(budget - spent, Decimal("0.00")), ".2f"),
        over_budget=format(max(spent - budget, Decimal("0.00")), ".2f"),
        categories=[
            {
                "category": name,
                "amount": format(amount, ".2f"),
                "percentage": format(
                    (amount * 100 / spent).quantize(
                        Decimal("0.1"), rounding=ROUND_HALF_UP
                    ),
                    ".1f",
                ),
            }
            for name, amount in rows
        ],
    )


async def list_expenses(
    session: AsyncSession,
    user_id: uuid.UUID,
    start_date: date | None = None,
    end_date: date | None = None,
) -> list[Expense]:
    statement = select(Expense).where(Expense.user_id == user_id)
    if start_date is not None:
        statement = statement.where(Expense.spent_at >= start_date)
    if end_date is not None:
        statement = statement.where(Expense.spent_at <= end_date)
    result = await session.scalars(
        statement.order_by(Expense.spent_at.desc(), Expense.created_at.desc())
    )
    return list(result)


async def get_expense(
    session: AsyncSession, user_id: uuid.UUID, expense_id: uuid.UUID
) -> Expense | None:
    return await session.scalar(
        select(Expense).where(
            Expense.id == expense_id,
            Expense.user_id == user_id,
        )
    )


async def find_expenses(
    session: AsyncSession,
    user_id: uuid.UUID,
    *,
    merchant: str | None = None,
    category: str | None = None,
    start_date: date | None = None,
    end_date: date | None = None,
    limit: int = 10,
) -> list[tuple[Expense, str]]:
    statement = (
        select(Expense, Category.name)
        .join(
            Category,
            (Expense.category_id == Category.id)
            & (Expense.user_id == Category.user_id),
        )
        .where(Expense.user_id == user_id)
    )
    if merchant is not None:
        statement = statement.where(
            func.lower(Expense.merchant).contains(merchant.lower(), autoescape=True)
        )
    if category is not None:
        statement = statement.where(func.lower(Category.name) == category.lower())
    if start_date is not None:
        statement = statement.where(Expense.spent_at >= start_date)
    if end_date is not None:
        statement = statement.where(Expense.spent_at <= end_date)
    rows = await session.execute(
        statement.order_by(
            Expense.spent_at.desc(), Expense.created_at.desc(), Expense.id.desc()
        ).limit(limit)
    )
    return list(rows.tuples())


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


async def category_exists(
    session: AsyncSession, user_id: uuid.UUID, category_id: uuid.UUID
) -> bool:
    return bool(
        await session.scalar(
            select(
                exists().where(
                    Category.id == category_id,
                    Category.user_id == user_id,
                )
            )
        )
    )


async def find_category_by_name(
    session: AsyncSession, user_id: uuid.UUID, name: str
) -> Category | None:
    return await session.scalar(
        select(Category).where(Category.user_id == user_id, Category.name == name)
    )


async def get_total_expenses(
    session: AsyncSession, user_id: uuid.UUID, start_date: date, end_date: date
) -> Decimal:
    return await session.scalar(
        select(func.coalesce(func.sum(Expense.amount), 0)).where(
            Expense.user_id == user_id,
            Expense.currency == "EUR",
            Expense.spent_at >= start_date,
            Expense.spent_at <= end_date,
        )
    )


async def get_spending_by_category(
    session: AsyncSession, user_id: uuid.UUID, start_date: date, end_date: date
) -> list[tuple[str, Decimal]]:
    total = func.sum(Expense.amount)
    rows = await session.execute(
        select(Category.name, total)
        .join(Expense, Expense.category_id == Category.id)
        .where(
            Expense.user_id == user_id,
            Category.user_id == user_id,
            Expense.currency == "EUR",
            Expense.spent_at >= start_date,
            Expense.spent_at <= end_date,
        )
        .group_by(Category.name)
        .order_by(total.desc())
    )
    return list(rows.tuples())


async def list_users(
    session: AsyncSession, *, offset: int, limit: int
) -> tuple[list[User], int]:
    users = list(
        await session.scalars(
            select(User).order_by(User.created_at, User.id).offset(offset).limit(limit)
        )
    )
    total = await session.scalar(select(func.count(User.id)))
    return users, total or 0


async def set_user_active(
    session: AsyncSession, user: User, *, is_active: bool
) -> User:
    user.is_active = is_active
    if not is_active:
        await session.execute(
            update(RefreshToken)
            .where(RefreshToken.user_id == user.id, RefreshToken.revoked_at.is_(None))
            .values(revoked_at=datetime.now(UTC))
        )
    await session.commit()
    await session.refresh(user)
    return user
