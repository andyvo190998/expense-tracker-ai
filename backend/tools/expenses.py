from datetime import date
from decimal import Decimal

from langchain_core.tools import tool
from pydantic import BaseModel, ConfigDict, Field, field_validator
from sqlalchemy.exc import SQLAlchemyError

from app import services
from app.context import DEMO_USER_ID
from app.database import SessionLocal
from app.schemas import ExpenseCreate, ExpenseResponse


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


@tool(args_schema=AddExpenseInput)
async def add_expense(
    merchant: str,
    amount: Decimal,
    category: str,
    spent_at: date,
    description: str | None = None,
    currency: str = "EUR",
) -> dict[str, object]:
    """Save one expense for the current demo user.

    Send amount as a decimal string such as "30.00", spent_at as YYYY-MM-DD,
    and category as an existing category name such as "groceries".
    Only status=created confirms persistence. Do not automatically retry a
    failed write: its outcome may be uncertain.
    """
    try:
        async with SessionLocal() as session:
            matched = await services.find_category_by_name(
                session, DEMO_USER_ID, category
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
            expense = await services.create_expense(session, DEMO_USER_ID, data)
            return {
                "status": "created",
                "expense": ExpenseResponse.model_validate(expense).model_dump(
                    mode="json"
                )
                | {"category": matched.name},
            }
    except SQLAlchemyError:
        return {
            "status": "error",
            "code": "EXPENSE_WRITE_FAILED",
            "message": "Could not confirm the write. Check saved expenses before retrying.",
        }
