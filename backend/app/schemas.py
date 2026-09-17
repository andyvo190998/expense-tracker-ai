from datetime import date
from decimal import Decimal

from pydantic import BaseModel, Field


class ExpenseCreate(BaseModel):
    merchant: str | None = None
    description: str | None = None

    amount: Decimal = Field(gt=0)

    currency: str = "EUR"
    category: str
    spent_at: date


class ExpenseResponse(ExpenseCreate):
    id: str

    model_config = {
        "from_attributes": True
    }