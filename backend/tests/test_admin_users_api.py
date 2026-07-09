from fastapi.testclient import TestClient

from app.db.session import SessionLocal
from app.main import create_app
from app.seed import DEMO_USER_ID, seed_demo_data
from tests.fake_storage import FakeStorage
from tests.helpers import auth_headers


def seeded_client() -> TestClient:
    with SessionLocal() as database:
        seed_demo_data(database)
    return TestClient(create_app(storage=FakeStorage()))


def test_admin_can_manage_user_plan_permissions_and_usage() -> None:
    api = seeded_client()
    created = api.post(
        "/api/v1/auth/register",
        json={
            "email": "paid@example.com",
            "password": "Strong-pass-2026",
            "display_name": "付费用户",
        },
    )
    assert created.status_code == 201
    user_id = api.get("/api/v1/me", headers={"Authorization": f"Bearer {created.json()['access_token']}"}).json()["id"]

    updated = api.patch(
        f"/api/v1/admin/users/{user_id}",
        headers=auth_headers(),
        json={
            "plan_code": "pro",
            "entitlements": {"recording_minutes": 600, "report_generations": 200},
            "usage": {"recording_seconds": 120, "report_generations": 3},
            "billing_customer_id": "cus_123",
            "billing_subscription_id": "sub_123",
            "billing_status": "active",
        },
    )

    assert updated.status_code == 200
    assert updated.json()["plan_code"] == "pro"
    assert updated.json()["entitlements"]["recording_minutes"] == 600
    assert updated.json()["usage"]["report_generations"] == 3
    assert updated.json()["billing"]["subscription_id"] == "sub_123"


def test_non_admin_cannot_access_user_management() -> None:
    api = seeded_client()
    created = api.post(
        "/api/v1/auth/register",
        json={
            "email": "user@example.com",
            "password": "Strong-pass-2026",
            "display_name": "普通用户",
        },
    )

    blocked = api.get(
        "/api/v1/admin/users",
        headers={"Authorization": f"Bearer {created.json()['access_token']}"},
    )

    assert blocked.status_code == 403
    assert blocked.json()["error"]["code"] == "admin_required"


def test_admin_cannot_disable_itself() -> None:
    api = seeded_client()

    response = api.patch(
        f"/api/v1/admin/users/{DEMO_USER_ID}",
        headers=auth_headers(),
        json={"status": "suspended"},
    )

    assert response.status_code == 409
    assert response.json()["error"]["code"] == "cannot_suspend_self"
