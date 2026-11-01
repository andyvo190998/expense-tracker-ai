from fastapi.testclient import TestClient

from main import app


def test_expenses_require_authentication():
    with TestClient(app) as client:
        response = client.get("/expenses")
    assert response.status_code == 401
    assert response.json()["code"] == "UNAUTHENTICATED"


def test_expense_mutation_requires_csrf(auth_client):
    client, _ = auth_client
    from test_auth import register

    assert register(client).status_code == 201
    response = client.delete("/expenses/00000000-0000-0000-0000-000000000000")
    assert response.status_code == 403
    assert response.json()["code"] == "CSRF_FAILED"
