import asyncio
from uuid import UUID

from fastapi.testclient import TestClient
from test_auth import VALID_PASSWORD, csrf, register

from app.auth_types import UserRole
from app.models import RefreshToken, User


def test_merchant_cannot_list_admin_users(auth_client):
    client, _ = auth_client
    assert register(client).status_code == 201
    response = client.get("/admin/users")
    assert response.status_code == 403


def make_admin(client, sessions):
    assert register(client, "admin@example.com").status_code == 201
    admin_id = UUID(client.get("/auth/me").json()["id"])

    async def promote():
        async with sessions() as session:
            user = await session.get(User, admin_id)
            user.role = UserRole.ADMIN
            await session.commit()

    asyncio.run(promote())
    assert client.post("/auth/logout", headers=csrf(client)).status_code == 204
    response = client.post(
        "/auth/login",
        headers=csrf(client),
        json={"email": "admin@example.com", "password": VALID_PASSWORD},
    )
    assert response.status_code == 200
    return admin_id


def test_admin_lists_identity_metadata_only(auth_client):
    client, sessions = auth_client
    make_admin(client, sessions)
    response = client.get("/admin/users")

    assert response.status_code == 200
    assert response.json()["total"] == 1
    assert set(response.json()["items"][0]) == {
        "id",
        "email",
        "name",
        "role",
        "is_active",
        "created_at",
        "updated_at",
    }


def test_admin_deactivation_blocks_access_and_revokes_refresh(auth_client):
    client, sessions = auth_client
    merchant = TestClient(client.app)
    assert register(merchant, "merchant@example.com").status_code == 201
    merchant_id = UUID(merchant.get("/auth/me").json()["id"])
    merchant_refresh = merchant.cookies["refresh_token"]
    make_admin(client, sessions)

    response = client.patch(
        f"/admin/users/{merchant_id}/status",
        headers=csrf(client),
        json={"is_active": False},
    )
    assert response.status_code == 200
    assert response.json()["is_active"] is False
    assert merchant.get("/auth/me").status_code == 401
    assert merchant.post("/auth/refresh", headers=csrf(merchant)).status_code == 401

    async def token_is_revoked():
        from sqlalchemy import select

        from app.security import hash_refresh_token

        async with sessions() as session:
            token = await session.scalar(
                select(RefreshToken).where(
                    RefreshToken.token_hash == hash_refresh_token(merchant_refresh)
                )
            )
            return token.revoked_at is not None

    assert asyncio.run(token_is_revoked())


def test_admin_cannot_deactivate_self(auth_client):
    client, sessions = auth_client
    admin_id = make_admin(client, sessions)

    response = client.patch(
        f"/admin/users/{admin_id}/status",
        headers=csrf(client),
        json={"is_active": False},
    )

    assert response.status_code == 409
