import asyncio

import pytest
from fastapi.testclient import TestClient

from app.config import get_settings
from app.models import User
from main import app

VALID_PASSWORD = "correct horse battery staple"


def csrf(client):
    response = client.get("/auth/csrf")
    assert response.status_code == 204
    return {"X-CSRF-Token": client.cookies["csrf_token"]}


def register(client, email="user@example.com"):
    return client.post(
        "/auth/register",
        headers=csrf(client),
        json={"email": email, "name": "User", "password": VALID_PASSWORD},
    )


def test_register_normalizes_email_forces_merchant_and_sets_http_only_cookies(auth_client):
    client, _ = auth_client
    response = register(client, "  USER@Example.COM ")

    assert response.status_code == 201
    assert response.json()["email"] == "user@example.com"
    assert response.json()["role"] == "merchant"
    assert "token" not in response.text.lower()
    cookies = response.headers.get_list("set-cookie")
    assert any("access_token=" in value and "HttpOnly" in value for value in cookies)
    assert any("refresh_token=" in value and "HttpOnly" in value for value in cookies)


def test_registration_requires_csrf(auth_client):
    client, _ = auth_client
    response = client.post(
        "/auth/register",
        json={"email": "user@example.com", "name": "User", "password": VALID_PASSWORD},
    )
    assert response.status_code == 403
    assert response.json()["code"] == "CSRF_FAILED"


def test_configured_csrf_cookie_name_is_enforced(auth_client, monkeypatch):
    client, _ = auth_client
    monkeypatch.setenv("CSRF_COOKIE_NAME", "custom_csrf")
    get_settings.cache_clear()
    assert client.get("/auth/csrf").status_code == 204
    token = client.cookies["custom_csrf"]
    response = client.post(
        "/auth/register",
        headers={"X-CSRF-Token": token},
        json={"email": "custom@example.com", "name": "Custom", "password": VALID_PASSWORD},
    )
    assert response.status_code == 201


@pytest.mark.parametrize(
    ("email", "password"),
    [("missing@example.com", VALID_PASSWORD), ("user@example.com", "wrong password")],
)
def test_login_uses_same_invalid_credentials_error(auth_client, email, password):
    client, _ = auth_client
    if email == "user@example.com":
        assert register(client).status_code == 201
        client.post("/auth/logout", headers=csrf(client))
    response = client.post(
        "/auth/login", headers=csrf(client), json={"email": email, "password": password}
    )
    assert response.status_code == 401
    assert response.json() == {
        "code": "INVALID_CREDENTIALS",
        "message": "Invalid email or password.",
    }


def test_refresh_rotates_and_replay_revokes_family(auth_client):
    client, _ = auth_client
    assert register(client).status_code == 201
    old_refresh = client.cookies["refresh_token"]
    response = client.post("/auth/refresh", headers=csrf(client))
    assert response.status_code == 200
    new_refresh = client.cookies["refresh_token"]
    assert new_refresh != old_refresh

    replay = TestClient(app)
    replay.cookies.set("refresh_token", old_refresh)
    assert replay.post("/auth/refresh", headers=csrf(replay)).status_code == 401
    assert client.post("/auth/refresh", headers=csrf(client)).status_code == 401


def test_logout_clears_session_and_is_idempotent(auth_client):
    client, _ = auth_client
    assert register(client).status_code == 201
    assert client.get("/auth/me").status_code == 200
    assert client.post("/auth/logout", headers=csrf(client)).status_code == 204
    assert client.get("/auth/me").status_code == 401
    assert client.post("/auth/logout", headers=csrf(client)).status_code == 204


def test_inactive_user_cannot_continue_with_unexpired_access(auth_client):
    client, sessions = auth_client
    assert register(client).status_code == 201
    user_id = response_user_id(client)

    async def deactivate():
        async with sessions() as session:
            user = await session.get(User, user_id)
            user.is_active = False
            await session.commit()

    asyncio.run(deactivate())
    assert client.get("/auth/me").status_code == 401


def response_user_id(client):
    from uuid import UUID

    return UUID(client.get("/auth/me").json()["id"])
