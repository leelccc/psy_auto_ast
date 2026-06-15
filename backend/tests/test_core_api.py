from fastapi.testclient import TestClient
from sqlalchemy import delete

from app.main import create_app
from app.db.session import SessionLocal
from app.models import Profile, SessionRecord
from tests.fake_storage import FakeStorage
from tests.helpers import auth_headers, profile_access_headers


def client() -> TestClient:
    return TestClient(create_app())


def cleanup_profile(profile_id: str) -> None:
    with SessionLocal() as database:
        database.execute(delete(SessionRecord).where(SessionRecord.profile_id == profile_id))
        database.execute(delete(Profile).where(Profile.id == profile_id))
        database.commit()


def test_health_check_returns_service_status() -> None:
    response = client().get("/api/v1/health")

    assert response.status_code == 200
    assert response.json() == {
        "status": "ok",
        "service": "counselor-assistant-api",
        "components": {
            "api": "ok",
            "database": "ok",
            "object_storage": "ok",
        },
    }


def test_health_check_returns_503_when_object_storage_is_unavailable() -> None:
    class UnavailableStorage(FakeStorage):
        def health_check(self) -> None:
            raise RuntimeError("storage unavailable")

    response = TestClient(
        create_app(storage=UnavailableStorage()),
        raise_server_exceptions=False,
    ).get("/api/v1/health")

    assert response.status_code == 503
    assert response.json()["error"]["code"] == "object_storage_unavailable"


def test_development_web_client_can_complete_cors_preflight() -> None:
    response = client().options(
        "/api/v1/profiles",
        headers={
            "Origin": "http://localhost:8081",
            "Access-Control-Request-Method": "GET",
            "Access-Control-Request-Headers": "authorization",
        },
    )

    assert response.status_code == 200
    assert response.headers["access-control-allow-origin"] == "http://localhost:8081"


def test_profile_detail_requires_reusable_short_lived_profile_access_grant() -> None:
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
    assert reused_response.status_code == 200
    cleanup_profile(profile_id)


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
    unlocked_headers = profile_access_headers(api)

    first_session = api.post(
        f"/api/v1/profiles/{profile_id}/sessions",
        headers=unlocked_headers,
        json={"session_type": "counseling", "title": "本周咨询"},
    )
    second_session = api.post(
        f"/api/v1/profiles/{profile_id}/sessions",
        headers=unlocked_headers,
        json={"session_type": "counseling", "title": "下周咨询"},
    )

    assert first_session.status_code == 201
    assert first_session.json()["sequence_no"] == 6
    assert second_session.status_code == 201
    assert second_session.json()["sequence_no"] == 7
    cleanup_profile(profile_id)


def test_recording_audio_creates_expiring_non_preservable_sensitive_resource() -> None:
    storage = FakeStorage()
    api = TestClient(create_app(storage=storage))

    recording_response = api.post(
        "/api/v1/recordings",
        headers=auth_headers(),
        json={"title": "第6次咨询录音", "source_type": "in_app_recording"},
    )
    assert recording_response.status_code == 201
    recording_id = recording_response.json()["id"]

    body = b"recording-audio"
    created_file = api.post(
        "/api/v1/files",
        headers=auth_headers(),
        json={
            "filename": "session.m4a",
            "mime_type": "audio/mp4",
            "size_bytes": len(body),
            "purpose": "recording",
        },
    )
    storage.objects[storage.last_upload_key] = body
    file_id = created_file.json()["file_id"]
    assert api.post(f"/api/v1/files/{file_id}/complete", headers=auth_headers()).status_code == 200

    audio_response = api.post(
        f"/api/v1/recordings/{recording_id}/audio",
        headers=auth_headers(),
        json={"file_id": file_id, "duration_seconds": 3180},
    )

    assert audio_response.status_code == 200
    audio_payload = audio_response.json()
    assert audio_payload["can_long_term_preserve_audio"] is False
    assert audio_payload["audio_expires_at"] is not None

    expiring_response = api.get("/api/v1/privacy/expiring-resources", headers=auth_headers())
    assert expiring_response.status_code == 200
    resources = expiring_response.json()["items"]
    assert len(resources) == 1
    assert resources[0]["resource_type"] == "audio"
    assert resources[0]["resource_id"] == recording_id
    assert resources[0]["display_name"] == "第6次咨询录音"
    assert resources[0]["can_long_term_preserve"] is False
    assert resources[0]["expires_at"] == audio_payload["audio_expires_at"]
