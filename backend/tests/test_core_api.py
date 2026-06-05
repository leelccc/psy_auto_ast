from fastapi.testclient import TestClient

from app.main import create_app


def client() -> TestClient:
    return TestClient(create_app())


def auth_headers() -> dict[str, str]:
    return {"Authorization": "Bearer demo-token"}


def test_health_check_returns_service_status() -> None:
    response = client().get("/api/v1/health")

    assert response.status_code == 200
    assert response.json() == {"status": "ok", "service": "counselor-assistant-api"}


def test_profile_detail_requires_one_time_profile_access_grant() -> None:
    api = client()

    password_response = api.put(
        "/api/v1/profile-access-passwords/client",
        headers=auth_headers(),
        json={"new_password": "client-pass"},
    )
    assert password_response.status_code == 200

    profile_response = api.post(
        "/api/v1/profiles",
        headers=auth_headers(),
        json={
            "type": "client",
            "name": "陈雨",
            "status": "active",
            "crisis_level": "mild",
            "initial_session_count": 5,
        },
    )
    assert profile_response.status_code == 201
    profile_id = profile_response.json()["id"]

    blocked_response = api.get(f"/api/v1/profiles/{profile_id}", headers=auth_headers())
    assert blocked_response.status_code == 403
    assert blocked_response.json()["error"]["code"] == "profile_access_grant_required"

    verify_response = api.post(
        "/api/v1/profile-access-passwords/client/verify",
        headers=auth_headers(),
        json={"password": "client-pass"},
    )
    assert verify_response.status_code == 200
    grant = verify_response.json()["profile_access_grant"]

    allowed_response = api.get(
        f"/api/v1/profiles/{profile_id}",
        headers={**auth_headers(), "X-Profile-Access-Grant": grant},
    )
    assert allowed_response.status_code == 200
    assert allowed_response.json()["name"] == "陈雨"

    reused_response = api.get(
        f"/api/v1/profiles/{profile_id}",
        headers={**auth_headers(), "X-Profile-Access-Grant": grant},
    )
    assert reused_response.status_code == 403
    assert reused_response.json()["error"]["code"] == "profile_access_grant_invalid"


def test_creating_session_uses_initial_count_and_keeps_sequence_stable() -> None:
    api = client()
    profile_response = api.post(
        "/api/v1/profiles",
        headers=auth_headers(),
        json={
            "type": "client",
            "name": "陈雨",
            "initial_session_count": 5,
        },
    )
    profile_id = profile_response.json()["id"]

    first_session = api.post(
        f"/api/v1/profiles/{profile_id}/sessions",
        headers=auth_headers(),
        json={"session_type": "counseling", "title": "本周咨询"},
    )
    second_session = api.post(
        f"/api/v1/profiles/{profile_id}/sessions",
        headers=auth_headers(),
        json={"session_type": "counseling", "title": "下周咨询"},
    )

    assert first_session.status_code == 201
    assert first_session.json()["sequence_no"] == 6
    assert second_session.status_code == 201
    assert second_session.json()["sequence_no"] == 7


def test_recording_audio_creates_expiring_non_preservable_sensitive_resource() -> None:
    api = client()

    recording_response = api.post(
        "/api/v1/recordings",
        headers=auth_headers(),
        json={"title": "第6次咨询录音", "source_type": "in_app_recording"},
    )
    assert recording_response.status_code == 201
    recording_id = recording_response.json()["id"]

    audio_response = api.post(
        f"/api/v1/recordings/{recording_id}/audio",
        headers=auth_headers(),
        json={"filename": "session.m4a", "mime_type": "audio/mp4", "duration_seconds": 3180},
    )

    assert audio_response.status_code == 200
    audio_payload = audio_response.json()
    assert audio_payload["can_long_term_preserve_audio"] is False
    assert audio_payload["audio_expires_at"] is not None

    expiring_response = api.get("/api/v1/privacy/expiring-resources", headers=auth_headers())
    assert expiring_response.status_code == 200
    resources = expiring_response.json()["items"]
    assert resources == [
        {
            "resource_type": "audio",
            "resource_id": recording_id,
            "display_name": "第6次咨询录音",
            "can_long_term_preserve": False,
            "expires_at": audio_payload["audio_expires_at"],
        }
    ]
