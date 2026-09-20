import uuid
from datetime import date
from decimal import Decimal

from sqlalchemy import exists, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Category, Expense
from app.schemas import ExpenseCreate, ExpenseUpdate


async def create_expense(
    session: AsyncSession, user_id: uuid.UUID, data: ExpenseCreate
) -> Expense:
    expense = Expense(user_id=user_id, **data.model_dump())
    session.add(expense)
    await session.commit()
    await session.refresh(expense)
    return expense


async def list_expenses(session: AsyncSession, user_id: uuid.UUID) -> list[Expense]:
    result = await session.scalars(
        select(Expense)
        .where(Expense.user_id == user_id)
        .order_by(Expense.spent_at.desc(), Expense.created_at.desc())
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
