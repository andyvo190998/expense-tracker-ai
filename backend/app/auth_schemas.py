from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator

from app.auth_types import UserRole


class RegisterRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    email: EmailStr
    name: str = Field(min_length=1, max_length=200)
    password: str = Field(min_length=12, max_length=1024)

    @field_validator("email", mode="before")
    @classmethod
    def strip_email(cls, value: object) -> object:
        return value.strip() if isinstance(value, str) else value

    @field_validator("name")
    @classmethod
    def strip_name(cls, value: str) -> str:
        if not (clean := value.strip()):
            raise ValueError("name must not be blank")
        return clean


class LoginRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    email: EmailStr
    password: str = Field(min_length=1, max_length=1024)

    @field_validator("email", mode="before")
    @classmethod
    def strip_email(cls, value: object) -> object:
        return value.strip() if isinstance(value, str) else value


class AuthUserResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    email: str
    name: str
    role: UserRole
    is_active: bool


class AdminUserResponse(AuthUserResponse):
    created_at: datetime
    updated_at: datetime


class AdminUserListResponse(BaseModel):
    items: list[AdminUserResponse]
    total: int


class UserStatusUpdate(BaseModel):
    is_active: bool
