from collections.abc import Iterator
from contextlib import contextmanager
from contextvars import ContextVar

from app.auth_types import Principal, UserRole


class MissingAgentPrincipal(RuntimeError):
    pass


_principal: ContextVar[Principal | None] = ContextVar("agent_principal", default=None)


@contextmanager
def bind_agent_principal(principal: Principal) -> Iterator[None]:
    token = _principal.set(principal)
    try:
        yield
    finally:
        _principal.reset(token)


def get_agent_principal() -> Principal:
    principal = _principal.get()
    if principal is None:
        raise MissingAgentPrincipal("Agent principal is not bound")
    if principal.role is not UserRole.MERCHANT:
        raise MissingAgentPrincipal("Agent principal is not a merchant")
    return principal
