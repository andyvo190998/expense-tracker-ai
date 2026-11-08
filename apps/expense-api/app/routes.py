import uuid
from datetime import date
from decimal import Decimal
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy.ext.asyncio import AsyncSession

from app import services
from app.auth_dependencies import merchant_principal
from app.auth_routes import require_csrf
from app.auth_types import Principal
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
Merchant = Annotated[Principal, Depends(merchant_principal)]
Csrf = Annotated[None, Depends(require_csrf)]


async def require_category(
    category_id: uuid.UUID, session: AsyncSession, user_id: uuid.UUID
) -> None:
    if not await services.category_exists(session, user_id, category_id):
        raise HTTPException(status_code=404, detail="Category not found")


async def require_expense(
    expense_id: uuid.UUID, session: AsyncSession, user_id: uuid.UUID
) -> Expense:
    expense = await services.get_expense(session, user_id, expense_id)
    if expense is None:
        raise HTTPException(status_code=404, detail="Expense not found")
    return expense


@router.post("", response_model=ExpenseResponse, status_code=status.HTTP_201_CREATED)
async def create(
    data: ExpenseCreate, session: Session, principal: Merchant, _: Csrf
) -> Expense:
    await require_category(data.category_id, session, principal.user_id)
    return await services.create_expense(session, principal.user_id, data)


@router.get("", response_model=list[ExpenseResponse])
async def list_all(
    session: Session,
    principal: Merchant,
    start_date: date | None = None,
    end_date: date | None = None,
) -> list[Expense]:
    if start_date is not None and end_date is not None and end_date < start_date:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="end_date must be on or after start_date",
        )
    return await services.list_expenses(
        session, principal.user_id, start_date=start_date, end_date=end_date
    )


@router.get("/by-category", response_model=CategoryExpenseResponse)
async def list_by_category(
    session: Session, principal: Merchant, start_date: date, end_date: date
) -> CategoryExpenseResponse:
    if end_date < start_date:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="end_date must be on or after start_date",
        )
    rows = await services.get_spending_by_category(
        session, principal.user_id, start_date, end_date
    )
    return CategoryExpenseResponse(
        currency="EUR",
        total=sum((amount for _, amount in rows), start=Decimal(0)),
        start_date=start_date,
        end_date=end_date,
        items=[{"category": category, "amount": amount} for category, amount in rows],
    )


@router.get("/{expense_id}", response_model=ExpenseResponse)
async def get_one(
    expense_id: uuid.UUID, session: Session, principal: Merchant
) -> Expense:
    return await require_expense(expense_id, session, principal.user_id)


@router.patch("/{expense_id}", response_model=ExpenseResponse)
async def update(
    expense_id: uuid.UUID,
    data: ExpenseUpdate,
    session: Session,
    principal: Merchant,
    _: Csrf,
) -> Expense:
    expense = await require_expense(expense_id, session, principal.user_id)
    if "category_id" in data.model_fields_set and data.category_id is not None:
        await require_category(data.category_id, session, principal.user_id)
    return await services.update_expense(session, expense, data)


@router.delete("/{expense_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete(
    expense_id: uuid.UUID, session: Session, principal: Merchant, _: Csrf
) -> Response:
    expense = await require_expense(expense_id, session, principal.user_id)
    await services.delete_expense(session, expense)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
