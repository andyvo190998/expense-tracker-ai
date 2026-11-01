import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app import services
from app.auth_dependencies import admin_principal
from app.auth_routes import require_csrf
from app.auth_schemas import AdminUserListResponse, AdminUserResponse, UserStatusUpdate
from app.auth_types import Principal
from app.database import get_db
from app.models import User

router = APIRouter(prefix="/admin", tags=["admin"])
Session = Annotated[AsyncSession, Depends(get_db)]
Admin = Annotated[Principal, Depends(admin_principal)]
Csrf = Annotated[None, Depends(require_csrf)]


@router.get("/users", response_model=AdminUserListResponse)
async def users(
    session: Session,
    _: Admin,
    offset: Annotated[int, Query(ge=0)] = 0,
    limit: Annotated[int, Query(ge=1, le=100)] = 25,
) -> AdminUserListResponse:
    rows, total = await services.list_users(session, offset=offset, limit=limit)
    return AdminUserListResponse(items=rows, total=total)


@router.patch("/users/{user_id}/status", response_model=AdminUserResponse)
async def status(
    user_id: uuid.UUID,
    data: UserStatusUpdate,
    session: Session,
    principal: Admin,
    __: Csrf,
) -> User:
    if user_id == principal.user_id and not data.is_active:
        raise HTTPException(status_code=409, detail="Administrators cannot deactivate themselves")
    user = await session.get(User, user_id)
    if user is None:
        raise HTTPException(status_code=404, detail="User not found")
    return await services.set_user_active(session, user, is_active=data.is_active)
