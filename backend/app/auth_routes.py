from typing import Annotated

from fastapi import APIRouter, Depends, Header, Request, Response
from fastapi.responses import JSONResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth_schemas import AuthUserResponse, LoginRequest, RegisterRequest
from app.auth_services import (
    AuthFailure,
    SessionTokens,
    authenticate_user,
    register_user,
    revoke_refresh_token,
    rotate_refresh_token,
)
from app.config import get_settings
from app.database import get_db
from app.models import User
from app.security import (
    constant_time_equal,
    create_access_token,
    decode_access_token,
    new_csrf_token,
)

router = APIRouter(prefix="/auth", tags=["auth"])
Session = Annotated[AsyncSession, Depends(get_db)]


def error_response(error: AuthFailure) -> JSONResponse:
    return JSONResponse(
        status_code=error.status_code,
        content={"code": error.code, "message": error.message},
    )


def require_csrf(
    request: Request,
    csrf_header: Annotated[str | None, Header(alias="X-CSRF-Token")] = None,
) -> None:
    csrf_cookie = request.cookies.get(get_settings().csrf_cookie_name)
    if not csrf_cookie or not csrf_header or not constant_time_equal(csrf_cookie, csrf_header):
        raise AuthFailure("CSRF_FAILED", "CSRF validation failed.", 403)


def set_session_cookies(response: Response, tokens: SessionTokens) -> None:
    settings = get_settings()
    response.set_cookie(
        settings.access_cookie_name,
        create_access_token(tokens.user.id, tokens.user.role),
        httponly=True,
        secure=settings.cookie_secure,
        samesite=settings.cookie_samesite,
        max_age=settings.access_token_minutes * 60,
    )
    response.set_cookie(
        settings.refresh_cookie_name,
        tokens.refresh_token,
        httponly=True,
        secure=settings.cookie_secure,
        samesite=settings.cookie_samesite,
        max_age=settings.refresh_token_days * 86400,
        path="/",
    )


def clear_session_cookies(response: Response) -> None:
    settings = get_settings()
    response.delete_cookie(settings.access_cookie_name)
    response.delete_cookie(settings.refresh_cookie_name, path="/")


@router.get("/csrf", status_code=204)
async def csrf(response: Response) -> None:
    settings = get_settings()
    response.set_cookie(
        settings.csrf_cookie_name,
        new_csrf_token(),
        httponly=False,
        secure=settings.cookie_secure,
        samesite=settings.cookie_samesite,
    )


@router.post("/register", response_model=AuthUserResponse, status_code=201)
async def register(data: RegisterRequest, response: Response, session: Session, _: Annotated[None, Depends(require_csrf)]):
    try:
        tokens = await register_user(session, data)
    except AuthFailure as error:
        return error_response(error)
    set_session_cookies(response, tokens)
    return tokens.user


@router.post("/login", response_model=AuthUserResponse)
async def login(data: LoginRequest, response: Response, session: Session, _: Annotated[None, Depends(require_csrf)]):
    try:
        tokens = await authenticate_user(session, str(data.email), data.password)
    except AuthFailure as error:
        return error_response(error)
    set_session_cookies(response, tokens)
    return tokens.user


@router.post("/refresh", response_model=AuthUserResponse)
async def refresh(request: Request, response: Response, session: Session, _: Annotated[None, Depends(require_csrf)]):
    settings = get_settings()
    raw = request.cookies.get(settings.refresh_cookie_name)
    try:
        if not raw:
            raise AuthFailure("INVALID_REFRESH", "Refresh session is invalid.")
        tokens = await rotate_refresh_token(session, raw)
    except AuthFailure as error:
        failed = error_response(error)
        clear_session_cookies(failed)
        return failed
    set_session_cookies(response, tokens)
    return tokens.user


@router.post("/logout", status_code=204)
async def logout(request: Request, session: Session, _: Annotated[None, Depends(require_csrf)]):
    response = Response(status_code=204)
    await revoke_refresh_token(session, request.cookies.get(get_settings().refresh_cookie_name))
    clear_session_cookies(response)
    return response


@router.get("/me", response_model=AuthUserResponse)
async def me(request: Request, session: Session):
    token = request.cookies.get(get_settings().access_cookie_name)
    try:
        if not token:
            raise ValueError
        claims = decode_access_token(token)
        user = await session.get(User, claims.sub)
        if user is None or not user.is_active:
            raise ValueError
        return user
    except ValueError:
        return error_response(AuthFailure("UNAUTHENTICATED", "Authentication required."))
