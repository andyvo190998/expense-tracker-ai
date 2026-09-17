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
