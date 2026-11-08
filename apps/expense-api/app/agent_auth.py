from starlette.responses import JSONResponse
from starlette.types import ASGIApp, Receive, Scope, Send

from app.agent_context import bind_agent_principal
from app.auth_types import Principal, UserRole
from app.config import get_settings
from app.database import SessionLocal
from app.models import User
from app.security import decode_access_token


class AgentAuthMiddleware:
    def __init__(self, app: ASGIApp, path: str = "/agents/expense"):
        self.app = app
        self.path = path

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http" or not scope["path"].startswith(self.path):
            await self.app(scope, receive, send)
            return
        headers = {key.lower(): value for key, value in scope.get("headers", [])}
        cookies = _parse_cookies(headers.get(b"cookie", b"").decode())
        token = cookies.get(get_settings().access_cookie_name)
        try:
            if not token:
                raise ValueError
            claims = decode_access_token(token)
        except ValueError:
            await _error(401, "UNAUTHENTICATED", "Authentication required.", scope, receive, send)
            return
        async with SessionLocal() as session:
            user = await session.get(User, claims.sub)
            if user is None or not user.is_active:
                await _error(401, "UNAUTHENTICATED", "Authentication required.", scope, receive, send)
                return
            if user.role is not UserRole.MERCHANT:
                await _error(403, "FORBIDDEN", "You do not have permission.", scope, receive, send)
                return
            with bind_agent_principal(Principal(user.id, user.role)):
                await self.app(scope, receive, send)


def _parse_cookies(header: str) -> dict[str, str]:
    result: dict[str, str] = {}
    for item in header.split(";"):
        if "=" in item:
            key, value = item.strip().split("=", 1)
            result[key] = value
    return result


async def _error(
    status: int,
    code: str,
    message: str,
    scope: Scope,
    receive: Receive,
    send: Send,
) -> None:
    response = JSONResponse(status_code=status, content={"code": code, "message": message})
    await response(scope, receive, send)
