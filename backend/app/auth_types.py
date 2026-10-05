from dataclasses import dataclass
from datetime import datetime
from enum import Enum
from typing import Literal
from uuid import UUID


class UserRole(str, Enum):
    ADMIN = "admin"
    MERCHANT = "merchant"


@dataclass(frozen=True)
class AccessClaims:
    sub: UUID
    role: UserRole
    jti: UUID
    issued_at: datetime
    expires_at: datetime
    token_type: Literal["access"]


@dataclass(frozen=True)
class Principal:
    user_id: UUID
    role: UserRole
