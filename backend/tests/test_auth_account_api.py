from fastapi.testclient import TestClient
from sqlalchemy import select

from app.db.session import SessionLocal
from app.main import create_app
from app.models import ProfileAccessGrant
from app.seed import DEMO_USER_ID
from app.seed import CHEN_PROFILE_ID, seed_demo_data
from tests.fake_storage import FakeStorage


def client() -> TestClient:
    return TestClient(create_app())


def register(api: TestClient, email: str = "counselor@example.com") -> dict[str, object]:
    response = api.post(
        "/api/v1/auth/register",
        json={
            "email": email,
            "password": "Strong-pass-2026",
            "display_name": "林咨询师",
        },
    )
    assert response.status_code == 201
    return response.json()


def test_register_login_refresh_rotation_and_current_user() -> None:
    api = client()
    tokens = register(api)
    assert tokens["token_type"] == "bearer"

    duplicate = api.post(
        "/api/v1/auth/register",
        json={
            "email": "counselor@example.com",
            "password": "Strong-pass-2026",
            "display_name": "重复账号",
        },
    )
    assert duplicate.status_code == 409
    assert duplicate.json()["error"]["code"] == "email_already_registered"

    invalid_login = api.post(
        "/api/v1/auth/login",
        json={"email": "counselor@example.com", "password": "wrong-password"},
    )
    assert invalid_login.status_code == 401

    login = api.post(
        "/api/v1/auth/login",
        json={"email": "counselor@example.com", "password": "Strong-pass-2026"},
    )
    assert login.status_code == 200
    login_tokens = login.json()

    me = api.get(
        "/api/v1/me",
        headers={"Authorization": f"Bearer {login_tokens['access_token']}"},
    )
    assert me.status_code == 200
    assert me.json()["email"] == "counselor@example.com"
    assert "password_hash" not in me.json()

    refresh = api.post(
        "/api/v1/auth/refresh",
        json={"refresh_token": login_tokens["refresh_token"]},
    )
    assert refresh.status_code == 200
    assert refresh.json()["refresh_token"] != login_tokens["refresh_token"]

    reused_refresh = api.post(
        "/api/v1/auth/refresh",
        json={"refresh_token": login_tokens["refresh_token"]},
    )
    assert reused_refresh.status_code == 401
    assert reused_refresh.json()["error"]["code"] == "refresh_token_invalid"


def test_account_display_name_rejects_whitespace_only_values() -> None:
    api = client()
    invalid_registration = api.post(
        "/api/v1/auth/register",
        json={
            "email": "blank-name@example.com",
            "password": "Strong-pass-2026",
            "display_name": "   ",
        },
    )
    assert invalid_registration.status_code == 422

    tokens = register(api, "rename-me@example.com")
    invalid_update = api.patch(
        "/api/v1/me",
        headers={"Authorization": f"Bearer {tokens['access_token']}"},
        json={"display_name": "   "},
    )
    assert invalid_update.status_code == 422


def test_profile_access_password_is_persisted_and_grant_supports_page_requests() -> None:
    with SessionLocal() as database:
        seed_demo_data(database)
    api = client()
    headers = {"Authorization": "Bearer demo-token"}

    status = api.get("/api/v1/profile-access-passwords", headers=headers)
    assert status.status_code == 200
    assert status.json()["items"][0] == {"profile_type": "client", "is_set": False}
    assert status.json()["grant_minutes"] == 60
    assert status.json()["grant_options"] == [30, 60, 120]

    invalid = api.put(
        "/api/v1/profile-access-passwords/client",
        headers=headers,
        json={"new_password": "12ab56"},
    )
    assert invalid.status_code == 422

    saved = api.put(
        "/api/v1/profile-access-passwords/client",
        headers=headers,
        json={"new_password": "123456"},
    )
    assert saved.status_code == 200

    verified = api.post(
        "/api/v1/profile-access-passwords/client/verify",
        headers=headers,
        json={"password": "123456"},
    )
    assert verified.status_code == 200
    assert verified.json()["expires_in_seconds"] == 3600
    grant = verified.json()["profile_access_grant"]
    unlocked_headers = {**headers, "X-Profile-Access-Grant": grant}

    with SessionLocal() as database:
        stored_grant = database.scalar(
            select(ProfileAccessGrant).where(
                ProfileAccessGrant.user_id == DEMO_USER_ID,
                ProfileAccessGrant.profile_type == "client",
            )
        )
        assert stored_grant is not None
        assert (stored_grant.expires_at - stored_grant.created_at).total_seconds() == 3600

    detail = api.get(f"/api/v1/profiles/{CHEN_PROFILE_ID}", headers=unlocked_headers)
    sessions = api.get(
        f"/api/v1/profiles/{CHEN_PROFILE_ID}/sessions",
        headers=unlocked_headers,
    )
    detail_again = api.get(f"/api/v1/profiles/{CHEN_PROFILE_ID}", headers=unlocked_headers)

    assert detail.status_code == 200
    assert sessions.status_code == 200
    assert detail_again.status_code == 200


def test_profile_access_grant_minutes_are_user_configurable() -> None:
    with SessionLocal() as database:
        seed_demo_data(database)
    api = client()
    headers = {"Authorization": "Bearer demo-token"}

    invalid = api.patch(
        "/api/v1/profile-access-passwords/settings",
        headers=headers,
        json={"grant_minutes": 45},
    )
    assert invalid.status_code == 422
    assert invalid.json()["error"]["code"] == "profile_access_grant_minutes_invalid"

    updated = api.patch(
        "/api/v1/profile-access-passwords/settings",
        headers=headers,
        json={"grant_minutes": 120},
    )
    assert updated.status_code == 200
    assert updated.json()["grant_minutes"] == 120

    status = api.get("/api/v1/profile-access-passwords", headers=headers)
    assert status.status_code == 200
    assert status.json()["grant_minutes"] == 120

    api.put(
        "/api/v1/profile-access-passwords/client",
        headers=headers,
        json={"new_password": "123456"},
    )
    verified = api.post(
        "/api/v1/profile-access-passwords/client/verify",
        headers=headers,
        json={"password": "123456"},
    )
    assert verified.status_code == 200
    assert verified.json()["expires_in_seconds"] == 7200


def test_profile_password_reset_revokes_existing_page_grants() -> None:
    with SessionLocal() as database:
        seed_demo_data(database)
    api = client()
    headers = {"Authorization": "Bearer demo-token"}
    api.put(
        "/api/v1/profile-access-passwords/client",
        headers=headers,
        json={"new_password": "111111"},
    )
    verified = api.post(
        "/api/v1/profile-access-passwords/client/verify",
        headers=headers,
        json={"password": "111111"},
    )
    old_grant = verified.json()["profile_access_grant"]

    api.put(
        "/api/v1/profile-access-passwords/client",
        headers=headers,
        json={"new_password": "222222"},
    )
    blocked = api.get(
        f"/api/v1/profiles/{CHEN_PROFILE_ID}",
        headers={**headers, "X-Profile-Access-Grant": old_grant},
    )
    assert blocked.status_code == 403
    assert blocked.json()["error"]["code"] == "profile_access_grant_invalid"


def test_logout_and_confirmed_account_deletion_revoke_access() -> None:
    api = TestClient(create_app(storage=FakeStorage()))
    tokens = register(api, "delete-me@example.com")
    auth = {"Authorization": f"Bearer {tokens['access_token']}"}

    logout = api.post(
        "/api/v1/auth/logout",
        json={"refresh_token": tokens["refresh_token"]},
    )
    assert logout.status_code == 200
    assert api.post(
        "/api/v1/auth/refresh",
        json={"refresh_token": tokens["refresh_token"]},
    ).status_code == 401

    login = api.post(
        "/api/v1/auth/login",
        json={"email": "delete-me@example.com", "password": "Strong-pass-2026"},
    ).json()
    auth = {"Authorization": f"Bearer {login['access_token']}"}
    wrong = api.post(
        "/api/v1/account/deletion",
        headers=auth,
        json={"password": "wrong-password", "confirmation_text": "注销账号"},
    )
    assert wrong.status_code == 401

    deleted = api.post(
        "/api/v1/account/deletion",
        headers=auth,
        json={"password": "Strong-pass-2026", "confirmation_text": "注销账号"},
    )
    assert deleted.status_code == 200
    assert api.get("/api/v1/me", headers=auth).status_code == 401
