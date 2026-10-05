from collections.abc import Callable
from typing import Annotated

from fastapi import Depends, Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth_services import AuthFailure
from app.auth_types import Principal, UserRole
from app.config import get_settings
from app.database import get_db
from app.models import User
from app.security import decode_access_token


async def current_principal(
    request: Request, session: Annotated[AsyncSession, Depends(get_db)]
) -> Principal:
    token = request.cookies.get(get_settings().access_cookie_name)
    try:
        if not token:
            raise ValueError
        claims = decode_access_token(token)
    except ValueError as exc:
        raise AuthFailure("UNAUTHENTICATED", "Authentication required.") from exc
    user = await session.get(User, claims.sub)
    if user is None or not user.is_active:
        raise AuthFailure("UNAUTHENTICATED", "Authentication required.")
    return Principal(user.id, user.role)


def require_roles(*roles: UserRole) -> Callable[..., Principal]:
    async def dependency(
        principal: Annotated[Principal, Depends(current_principal)],
    ) -> Principal:
        if principal.role not in roles:
            raise AuthFailure("FORBIDDEN", "You do not have permission.", 403)
        return principal

    return dependency


merchant_principal = require_roles(UserRole.MERCHANT)
admin_principal = require_roles(UserRole.ADMIN)
