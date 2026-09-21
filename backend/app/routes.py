import uuid
from datetime import date
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy.ext.asyncio import AsyncSession

from app import services
from app.context import DEMO_USER_ID
from app.database import get_db
from app.models import Expense
from app.schemas import (
    CategoryExpenseResponse,
    ExpenseCreate,
    ExpenseResponse,
    ExpenseUpdate,
)

router = APIRouter(prefix="/expenses", tags=["expenses"])
Session = Annotated[AsyncSession, Depends(get_db)]


async def require_category(category_id: uuid.UUID, session: Session) -> None:
    if not await services.category_exists(session, DEMO_USER_ID, category_id):
        raise HTTPException(status_code=404, detail="Category not found")


async def require_expense(expense_id: uuid.UUID, session: Session) -> Expense:
    expense = await services.get_expense(session, DEMO_USER_ID, expense_id)
    if expense is None:
        raise HTTPException(status_code=404, detail="Expense not found")
    return expense


@router.post("", response_model=ExpenseResponse, status_code=status.HTTP_201_CREATED)
async def create(data: ExpenseCreate, session: Session) -> Expense:
    await require_category(data.category_id, session)
    return await services.create_expense(session, DEMO_USER_ID, data)


@router.get("", response_model=list[ExpenseResponse])
async def list_all(session: Session) -> list[Expense]:
    return await services.list_expenses(session, DEMO_USER_ID)


@router.get("/by-category", response_model=CategoryExpenseResponse)
async def list_by_category(
    session: Session, start_date: date, end_date: date
) -> CategoryExpenseResponse:
    if end_date < start_date:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="end_date must be on or after start_date",
        )
    rows = await services.get_spending_by_category(
        session, DEMO_USER_ID, start_date, end_date
    )
    return CategoryExpenseResponse(
        currency="EUR",
        start_date=start_date,
        end_date=end_date,
        items=[{"category": category, "amount": amount} for category, amount in rows],
    )


@router.get("/{expense_id}", response_model=ExpenseResponse)
async def get_one(expense_id: uuid.UUID, session: Session) -> Expense:
    return await require_expense(expense_id, session)


@router.patch("/{expense_id}", response_model=ExpenseResponse)
async def update(
    expense_id: uuid.UUID, data: ExpenseUpdate, session: Session
) -> Expense:
    expense = await require_expense(expense_id, session)
    if "category_id" in data.model_fields_set and data.category_id is not None:
        await require_category(data.category_id, session)
    return await services.update_expense(session, expense, data)


@router.delete("/{expense_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete(expense_id: uuid.UUID, session: Session) -> Response:
    expense = await require_expense(expense_id, session)
    await services.delete_expense(session, expense)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
