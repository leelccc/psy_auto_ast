from fastapi.testclient import TestClient


def auth_headers() -> dict[str, str]:
    return {"Authorization": "Bearer demo-token"}


def profile_access_headers(
    api: TestClient,
    profile_type: str = "client",
    password: str = "123456",
) -> dict[str, str]:
    saved = api.put(
        f"/api/v1/profile-access-passwords/{profile_type}",
        headers=auth_headers(),
        json={"new_password": password},
    )
    assert saved.status_code == 200
    verified = api.post(
        f"/api/v1/profile-access-passwords/{profile_type}/verify",
        headers=auth_headers(),
        json={"password": password},
    )
    assert verified.status_code == 200
    return {
        **auth_headers(),
        "X-Profile-Access-Grant": verified.json()["profile_access_grant"],
    }
