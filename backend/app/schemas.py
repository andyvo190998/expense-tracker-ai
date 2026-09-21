import uuid
from datetime import date
from decimal import Decimal

from pydantic import BaseModel, ConfigDict, Field, model_validator


class ExpenseCreate(BaseModel):
    merchant: str | None = None
    description: str | None = None

    amount: Decimal = Field(gt=0, decimal_places=2)
    currency: str = Field(default="EUR", min_length=3, max_length=3)
    category_id: uuid.UUID
    spent_at: date


class ExpenseUpdate(BaseModel):
    merchant: str | None = None
    description: str | None = None
    amount: Decimal | None = Field(default=None, gt=0, decimal_places=2)
    currency: str | None = Field(default=None, min_length=3, max_length=3)
    category_id: uuid.UUID | None = None
    spent_at: date | None = None

    @model_validator(mode="after")
    def require_change(self):
        if not self.model_fields_set:
            raise ValueError("at least one field is required")
        for field in self.model_fields_set & {
            "amount",
            "currency",
            "category_id",
            "spent_at",
        }:
            if getattr(self, field) is None:
                raise ValueError(f"{field} cannot be null")
        return self


class ExpenseResponse(ExpenseCreate):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID


class CategoryExpenseItem(BaseModel):
    category: str
    amount: Decimal


class CategoryExpenseResponse(BaseModel):
    currency: str
    start_date: date
    end_date: date
    items: list[CategoryExpenseItem]
