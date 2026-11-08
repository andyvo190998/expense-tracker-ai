from typing import Annotated, Literal
from uuid import UUID

from pydantic import AwareDatetime, BaseModel, ConfigDict, EmailStr, Field

EXPENSE_CREATED_TOPIC = "expense.created.v1"
Money = Annotated[str, Field(pattern=r"^(0|[1-9]\d*)\.\d{2}$")]


class CategoryEmailSummary(BaseModel):
    model_config = ConfigDict(extra="forbid")

    category: str
    amount: Money
    percentage: str = Field(pattern=r"^(100\.0|\d{1,2}\.\d)$")


class ExpenseEmailSummary(BaseModel):
    model_config = ConfigDict(extra="forbid")

    expense_category: str | None = None
    expense_description: str | None = None
    expense_amount: Money
    expense_currency: str = Field(min_length=3, max_length=3)
    month: str = Field(pattern=r"^\d{4}-(0[1-9]|1[0-2])$")
    currency: Literal["EUR"] = "EUR"
    budget: Money
    spent: Money
    remaining: Money
    over_budget: Money
    categories: list[CategoryEmailSummary]


class ExpenseCreatedEvent(BaseModel):
    model_config = ConfigDict(extra="forbid")

    type: Literal["expense.created.v1"] = EXPENSE_CREATED_TOPIC
    event_id: UUID
    expense_id: UUID
    occurred_at: AwareDatetime
    recipients: list[EmailStr] = Field(min_length=1, max_length=5)
    email_summary: ExpenseEmailSummary | None = None
