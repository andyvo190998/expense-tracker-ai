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


def test_register_normalizes_email_forces_merchant_and_sets_http_only_cookies(
    auth_client,
):
    client, _ = auth_client
    response = register(client, "  USER@Example.COM ")

    assert response.status_code == 201
    assert response.json()["email"] == "user@example.com"
    assert response.json()["role"] == "merchant"
    assert response.json()["monthly_expense_target"] == "500.00"
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
        json={
            "email": "custom@example.com",
            "name": "Custom",
            "password": VALID_PASSWORD,
        },
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


def test_merchant_updates_own_name_and_monthly_expense_target(auth_client):
    client, sessions = auth_client
    assert register(client).status_code == 201
    user_id = response_user_id(client)

    response = client.patch(
        "/auth/me",
        headers=csrf(client),
        json={"name": "Updated User", "monthly_expense_target": "1250.50"},
    )

    assert response.status_code == 200
    assert response.json() == {
        "id": str(user_id),
        "email": "user@example.com",
        "name": "Updated User",
        "role": "merchant",
        "is_active": True,
        "monthly_expense_target": "1250.50",
        "notification_emails": [],
    }

    async def load_user():
        async with sessions() as session:
            return await session.get(User, user_id)

    stored = asyncio.run(load_user())
    assert stored.name == "Updated User"
    assert str(stored.monthly_expense_target) == "1250.50"


@pytest.mark.parametrize(
    "payload",
    [
        {"name": "   ", "monthly_expense_target": "500.00"},
        {"name": "User", "monthly_expense_target": "0.00"},
        {"name": "User", "monthly_expense_target": "500.001"},
    ],
)
def test_profile_update_rejects_invalid_name_or_monthly_target(auth_client, payload):
    client, _ = auth_client
    assert register(client).status_code == 201

    response = client.patch("/auth/me", headers=csrf(client), json=payload)

    assert response.status_code == 422


def test_profile_update_requires_csrf(auth_client):
    client, _ = auth_client
    assert register(client).status_code == 201

    response = client.patch(
        "/auth/me",
        json={"name": "Updated", "monthly_expense_target": "600.00"},
    )

    assert response.status_code == 403
    assert response.json()["code"] == "CSRF_FAILED"


def response_user_id(client):
    from uuid import UUID

    return UUID(client.get("/auth/me").json()["id"])


def test_profile_notification_recipients_save_preserve_and_clear(auth_client):
    client, sessions = auth_client
    assert register(client).status_code == 201
    user_id = response_user_id(client)
    assert client.get("/auth/me").json()["notification_emails"] == []
    profile = {"name": "User", "monthly_expense_target": "500.00"}
    response = client.patch(
        "/auth/me",
        headers=csrf(client),
        json={
            **profile,
            "notification_emails": [
                "Owner@EXAMPLE.COM",
                "owner@example.com",
                "second@example.com",
            ],
        },
    )
    assert response.status_code == 200
    expected = ["Owner@example.com", "second@example.com"]
    assert response.json()["notification_emails"] == expected
    assert client.get("/auth/me").json()["notification_emails"] == expected

    async def saved():
        async with sessions() as session:
            return (await session.get(User, user_id)).notification_emails

    assert asyncio.run(saved()) == expected
    assert (
        client.patch("/auth/me", headers=csrf(client), json=profile).json()[
            "notification_emails"
        ]
        == expected
    )
    assert (
        client.patch(
            "/auth/me",
            headers=csrf(client),
            json={
                **profile,
                "notification_emails": [],
            },
        ).json()["notification_emails"]
        == []
    )
    assert asyncio.run(saved()) == []


@pytest.mark.parametrize("emails", [None, ["bad"], [""], ["a@example.com"] * 6])
def test_profile_rejects_invalid_notification_recipients(auth_client, emails):
    client, _ = auth_client
    assert register(client).status_code == 201
    response = client.patch(
        "/auth/me",
        headers=csrf(client),
        json={
            "name": "User",
            "monthly_expense_target": "500.00",
            "notification_emails": emails,
        },
    )
    assert response.status_code == 422


def test_profile_recipients_are_account_scoped(auth_client):
    client, sessions = auth_client
    assert register(client, "first@example.com").status_code == 201
    first_id = response_user_id(client)
    assert register(client, "second@example.com").status_code == 201
    response = client.patch(
        "/auth/me",
        headers=csrf(client),
        json={
            "name": "Second",
            "monthly_expense_target": "500.00",
            "notification_emails": ["notify@example.com"],
        },
    )
    assert response.status_code == 200

    async def first_recipients():
        async with sessions() as session:
            return (await session.get(User, first_id)).notification_emails

    assert asyncio.run(first_recipients()) == []
