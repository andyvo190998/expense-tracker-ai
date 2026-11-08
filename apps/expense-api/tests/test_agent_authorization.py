import asyncio
import uuid

import pytest
from fastapi.testclient import TestClient

from app.agent_context import (
    MissingAgentPrincipal,
    bind_agent_principal,
    get_agent_principal,
)
from app.auth_types import Principal, UserRole
from main import app


def test_agent_context_requires_bound_principal():
    with pytest.raises(MissingAgentPrincipal):
        get_agent_principal()


def test_agent_context_is_isolated_between_concurrent_tasks():
    first = Principal(uuid.uuid4(), UserRole.MERCHANT)
    second = Principal(uuid.uuid4(), UserRole.MERCHANT)

    async def read_as(principal):
        with bind_agent_principal(principal):
            await asyncio.sleep(0)
            return get_agent_principal()

    async def run():
        return await asyncio.gather(read_as(first), read_as(second))

    assert asyncio.run(run()) == [first, second]


def test_agent_endpoint_requires_authentication():
    with TestClient(app) as client:
        response = client.post("/agents/expense", json={})
    assert response.status_code == 401
    assert response.json()["code"] == "UNAUTHENTICATED"
