import uuid
from datetime import date
from decimal import Decimal

from langchain_core.tools import tool
from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator
from sqlalchemy.exc import SQLAlchemyError

from app import services
from app.agent_context import get_agent_principal
from app.database import SessionLocal
from app.models import Category, Expense
from app.schemas import ExpenseCreate, ExpenseResponse, ExpenseUpdate


class AddExpenseInput(BaseModel):
    model_config = ConfigDict(extra="forbid")

    merchant: str = Field(min_length=1, max_length=200)
    amount: Decimal = Field(gt=0, max_digits=12, decimal_places=2)
    category: str = Field(min_length=1, max_length=100)
    spent_at: date
    description: str | None = Field(default=None, max_length=500)
    currency: str = Field(default="EUR", pattern=r"^[A-Z]{3}$")

    @field_validator("amount", mode="before", json_schema_input_type=str)
    @classmethod
    def require_decimal_string(cls, value: object) -> str:
        if not isinstance(value, str):
            # Pydantic wraps ValueError as validation feedback; TypeError escapes it.
            raise ValueError('amount must be a decimal string, e.g. "30.00"')  # noqa: TRY004
        return value


class GetTotalExpensesInput(BaseModel):
    model_config = ConfigDict(extra="forbid")

    start_date: date
    end_date: date

    @model_validator(mode="after")
    def validate_range(self):
        if self.end_date < self.start_date:
            raise ValueError("end_date must be on or after start_date")
        return self


class FindExpensesInput(BaseModel):
    model_config = ConfigDict(extra="forbid")

    merchant: str | None = Field(default=None, min_length=1, max_length=200)
    category: str | None = Field(default=None, min_length=1, max_length=100)
    start_date: date | None = None
    end_date: date | None = None
    limit: int = Field(default=10, ge=1, le=20)

    @model_validator(mode="after")
    def validate_range(self):
        if (
            self.start_date is not None
            and self.end_date is not None
            and self.end_date < self.start_date
        ):
            raise ValueError("end_date must be on or after start_date")
        return self


class UpdateExpenseInput(BaseModel):
    model_config = ConfigDict(extra="forbid")

    expense_id: uuid.UUID
    merchant: str | None = Field(default=None, min_length=1, max_length=200)
    amount: Decimal | None = Field(
        default=None, gt=0, max_digits=12, decimal_places=2
    )
    category: str | None = Field(default=None, min_length=1, max_length=100)
    spent_at: date | None = None
    description: str | None = Field(default=None, max_length=500)
    currency: str | None = Field(default=None, pattern=r"^[A-Z]{3}$")

    @field_validator("amount", mode="before", json_schema_input_type=str | None)
    @classmethod
    def require_decimal_string(cls, value: object) -> object:
        if value is not None and not isinstance(value, str):
            raise ValueError('amount must be a decimal string, e.g. "30.00"')
        return value

    @model_validator(mode="after")
    def require_change(self):
        if not any(
            getattr(self, field) is not None
            for field in (
                "merchant",
                "amount",
                "category",
                "spent_at",
                "description",
                "currency",
            )
        ):
            raise ValueError("at least one changed field is required")
        return self


class DeleteExpenseInput(BaseModel):
    model_config = ConfigDict(extra="forbid")

    expense_id: uuid.UUID


def _expense_result(expense: Expense, category: str) -> dict[str, object]:
    return ExpenseResponse.model_validate(expense).model_dump(mode="json") | {
        "category": category
    }


@tool(args_schema=AddExpenseInput)
async def add_expense(
    merchant: str,
    amount: Decimal,
    category: str,
    spent_at: date,
    description: str | None = None,
    currency: str = "EUR",
) -> dict[str, object]:
    """Save one expense for the authenticated merchant.

    Send amount as a decimal string such as "30.00", spent_at as YYYY-MM-DD,
    and category as an existing category name such as "groceries".
    Only status=created confirms persistence. Do not automatically retry a
    failed write: its outcome may be uncertain.
    """
    try:
        user_id = get_agent_principal().user_id
        async with SessionLocal() as session:
            matched = await services.find_category_by_name(
                session, user_id, category
            )
            if matched is None:
                return {
                    "status": "error",
                    "code": "CATEGORY_NOT_FOUND",
                    "message": "No matching category exists for this user.",
                }
            data = ExpenseCreate(
                merchant=merchant,
                amount=amount,
                category_id=matched.id,
                spent_at=spent_at,
                description=description,
                currency=currency,
            )
            expense = await services.create_expense(session, user_id, data)
            return {
                "status": "created",
                "expense": _expense_result(expense, matched.name),
            }
    except SQLAlchemyError:
        return {
            "status": "error",
            "code": "EXPENSE_WRITE_FAILED",
            "message": "Could not confirm the write. Check saved expenses before retrying.",
        }


@tool(args_schema=FindExpensesInput)
async def find_expenses(
    merchant: str | None = None,
    category: str | None = None,
    start_date: date | None = None,
    end_date: date | None = None,
    limit: int = 10,
) -> dict[str, object]:
    """Find recent expenses for resolving a natural-language reference.

    Results are newest first and include stable IDs. If multiple results could
    be the intended mutation target, ask the user instead of guessing.
    """
    try:
        user_id = get_agent_principal().user_id
        async with SessionLocal() as session:
            rows = await services.find_expenses(
                session,
                user_id,
                merchant=merchant,
                category=category,
                start_date=start_date,
                end_date=end_date,
                limit=limit,
            )
            return {
                "status": "success",
                "expenses": [
                    _expense_result(expense, category_name)
                    for expense, category_name in rows
                ],
            }
    except SQLAlchemyError:
        return {
            "status": "error",
            "code": "EXPENSE_QUERY_FAILED",
            "message": "Could not retrieve matching expenses.",
        }


@tool(args_schema=UpdateExpenseInput)
async def update_expense(
    expense_id: uuid.UUID,
    merchant: str | None = None,
    amount: Decimal | None = None,
    category: str | None = None,
    spent_at: date | None = None,
    description: str | None = None,
    currency: str | None = None,
) -> dict[str, object]:
    """Patch one already-resolved expense by its exact stable ID.

    Call find_expenses first. Never choose an ID when multiple results could
    match the user's request; ask the user to identify or confirm the target.
    """
    try:
        user_id = get_agent_principal().user_id
        async with SessionLocal() as session:
            expense = await services.get_expense(session, user_id, expense_id)
            if expense is None:
                return {
                    "status": "error",
                    "code": "EXPENSE_NOT_FOUND",
                    "message": "No matching expense exists for this user.",
                }

            category_name: str
            changes: dict[str, object] = {}
            for field, value in {
                "merchant": merchant,
                "amount": amount,
                "spent_at": spent_at,
                "description": description,
                "currency": currency,
            }.items():
                if value is not None:
                    changes[field] = value

            if category is not None:
                matched = await services.find_category_by_name(
                    session, user_id, category
                )
                if matched is None:
                    return {
                        "status": "error",
                        "code": "CATEGORY_NOT_FOUND",
                        "message": "No matching category exists for this user.",
                    }
                changes["category_id"] = matched.id
                category_name = matched.name
            else:
                matched = await session.get(Category, expense.category_id)
                # The category is user-scoped by the expense's composite foreign key.
                category_name = matched.name if matched is not None else "unknown"

            updated = await services.update_expense(
                session, expense, ExpenseUpdate(**changes)
            )
            return {
                "status": "updated",
                "expense": _expense_result(updated, category_name),
            }
    except SQLAlchemyError:
        return {
            "status": "error",
            "code": "EXPENSE_WRITE_FAILED",
            "message": "Could not confirm the update. Check saved expenses before retrying.",
        }


@tool(args_schema=DeleteExpenseInput)
async def delete_expense(expense_id: uuid.UUID) -> dict[str, object]:
    """Delete one exact expense after the user explicitly confirms it.

    Call find_expenses first, show the exact record, and wait for confirmation.
    Never call this tool in the same turn as the initial deletion request.
    """
    try:
        user_id = get_agent_principal().user_id
        async with SessionLocal() as session:
            expense = await services.get_expense(session, user_id, expense_id)
            if expense is None:
                return {
                    "status": "error",
                    "code": "EXPENSE_NOT_FOUND",
                    "message": "No matching expense exists for this user.",
                }
            category = await session.get(Category, expense.category_id)
            snapshot = _expense_result(
                expense, category.name if category is not None else "unknown"
            )
            await services.delete_expense(session, expense)
            return {"status": "deleted", "expense": snapshot}
    except SQLAlchemyError:
        return {
            "status": "error",
            "code": "EXPENSE_WRITE_FAILED",
            "message": "Could not confirm the deletion. Check saved expenses before retrying.",
        }


@tool(args_schema=GetTotalExpensesInput)
async def get_total_expenses(start_date: date, end_date: date) -> dict[str, object]:
    """Return the exact EUR expense total for an inclusive YYYY-MM-DD range."""
    try:
        user_id = get_agent_principal().user_id
        async with SessionLocal() as session:
            total = await services.get_total_expenses(
                session, user_id, start_date, end_date
            )
            return {
                "status": "success",
                "total": f"{total:.2f}",
                "currency": "EUR",
                "start_date": start_date.isoformat(),
                "end_date": end_date.isoformat(),
            }
    except SQLAlchemyError:
        return {
            "status": "error",
            "code": "EXPENSE_QUERY_FAILED",
            "message": "Could not retrieve the expense total.",
        }


@tool(args_schema=GetTotalExpensesInput)
async def get_spending_by_category(
    start_date: date, end_date: date
) -> dict[str, object]:
    """Return exact EUR spending grouped by category for an inclusive date range."""
    try:
        user_id = get_agent_principal().user_id
        async with SessionLocal() as session:
            rows = await services.get_spending_by_category(
                session, user_id, start_date, end_date
            )
            return {
                "status": "success",
                "currency": "EUR",
                "start_date": start_date.isoformat(),
                "end_date": end_date.isoformat(),
                "items": [
                    {"category": category, "amount": f"{amount:.2f}"}
                    for category, amount in rows
                ],
            }
    except SQLAlchemyError:
        return {
            "status": "error",
            "code": "EXPENSE_QUERY_FAILED",
            "message": "Could not retrieve spending by category.",
        }
