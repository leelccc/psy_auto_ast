from fastapi.testclient import TestClient

from app.db.session import SessionLocal
from app.main import create_app
from app.seed import seed_demo_data
from tests.fake_storage import FakeStorage


def test_complete_mvp_user_journey() -> None:
    with SessionLocal() as database:
        seed_demo_data(database)
    storage = FakeStorage()
    api = TestClient(create_app(storage=storage))

    login = api.post(
        "/api/v1/auth/login",
        json={"email": "demo@example.com", "password": "Demo1234!"},
    )
    assert login.status_code == 200
    auth = {"Authorization": f"Bearer {login.json()['access_token']}"}

    profile = api.post(
        "/api/v1/profiles",
        headers=auth,
        json={
            "type": "client",
            "name": "完整旅程来访者",
            "code": "E2E01",
            "status": "active",
            "next_session_at": "2026-06-20T10:00:00+08:00",
        },
    )
    assert profile.status_code == 201
    profile_id = profile.json()["id"]

    assert api.put(
        "/api/v1/profile-access-passwords/client",
        headers=auth,
        json={"new_password": "123456"},
    ).status_code == 200
    verified = api.post(
        "/api/v1/profile-access-passwords/client/verify",
        headers=auth,
        json={"password": "123456"},
    )
    assert verified.status_code == 200
    unlocked = {
        **auth,
        "X-Profile-Access-Grant": verified.json()["profile_access_grant"],
    }

    session = api.post(
        f"/api/v1/profiles/{profile_id}/sessions",
        headers=unlocked,
        json={
            "session_type": "counseling",
            "occurred_at": "2026-06-20T10:00:00+08:00",
            "ended_at": "2026-06-20T10:50:00+08:00",
            "mode": "online",
            "summary": "完整旅程测试记录",
        },
    )
    assert session.status_code == 201
    session_id = session.json()["id"]

    pdf = b"%PDF-1.7\ncomplete-journey\n%%EOF\n"
    created_file = api.post(
        "/api/v1/files",
        headers=auth,
        json={
            "filename": "journey.pdf",
            "mime_type": "application/pdf",
            "size_bytes": len(pdf),
            "purpose": "attachment",
        },
    )
    storage.objects[storage.last_upload_key] = pdf
    file_id = created_file.json()["file_id"]
    assert api.post(
        f"/api/v1/files/{file_id}/complete",
        headers=auth,
    ).status_code == 200
    attachment = api.post(
        "/api/v1/attachments",
        headers=unlocked,
        json={
            "owner_type": "session",
            "owner_id": session_id,
            "category": "scale",
            "file_id": file_id,
        },
    )
    assert attachment.status_code == 201

    audio = b"journey-audio"
    audio_file = api.post(
        "/api/v1/files",
        headers=auth,
        json={
            "filename": "journey.m4a",
            "mime_type": "audio/mp4",
            "size_bytes": len(audio),
            "purpose": "recording",
        },
    )
    storage.objects[storage.last_upload_key] = audio
    audio_file_id = audio_file.json()["file_id"]
    assert api.post(
        f"/api/v1/files/{audio_file_id}/complete",
        headers=auth,
    ).status_code == 200
    recording = api.post(
        "/api/v1/recordings",
        headers=auth,
        json={"title": "完整旅程录音", "source_type": "uploaded_audio"},
    ).json()
    assert api.post(
        f"/api/v1/recordings/{recording['id']}/audio",
        headers=auth,
        json={"file_id": audio_file_id, "duration_seconds": 180},
    ).status_code == 200
    assert api.post(
        f"/api/v1/recordings/{recording['id']}/archive",
        headers=unlocked,
        json={
            "profile_type": "client",
            "profile_id": profile_id,
            "session_id": session_id,
        },
    ).status_code == 200
    processed = api.post(
        f"/api/v1/recordings/{recording['id']}/processing",
        headers=unlocked,
        json={"mode": "archived_context"},
    )
    assert processed.status_code == 202
    assert api.get(
        f"/api/v1/recordings/{recording['id']}/transcript",
        headers=unlocked,
    ).status_code == 200

    generated = api.post(
        "/api/v1/reports/generate",
        headers=unlocked,
        json={
            "report_type": "counseling_note",
            "profile_id": profile_id,
            "session_id": session_id,
            "selected_sources": [
                {"resource_type": "session", "resource_id": session_id}
            ],
        },
    )
    assert generated.status_code == 202
    report_id = generated.json()["draft_report_id"]
    assert api.post(
        f"/api/v1/reports/{report_id}/save-formal",
        headers=unlocked,
        json={"confirm_replace": False},
    ).status_code == 200
    exported = api.post(
        f"/api/v1/reports/{report_id}/export",
        headers=unlocked,
        json={"format": "pdf", "version": "formal"},
    )
    assert exported.status_code == 202
    assert storage.objects[
        next(key for key in storage.objects if exported.json()["export_file_id"] in key)
    ].startswith(b"%PDF")

    expiring = api.get(
        "/api/v1/privacy/expiring-resources?days=30",
        headers=auth,
    )
    report_resource = next(
        item for item in expiring.json()["items"]
        if item["resource_type"] == "report" and item["resource_id"] == report_id
    )
    assert api.post(
        f"/api/v1/privacy/resources/{report_resource['id']}/authorize-long-term",
        headers=auth,
        json={"confirm_understanding": True},
    ).status_code == 200

    calendar = api.get("/api/v1/calendar/events", headers=auth)
    assert any(
        item["profile_id"] == profile_id
        and item["source_type"] == "profile_next_session"
        for item in calendar.json()["items"]
    )

    conversation = api.post(
        "/api/v1/supervision/conversations",
        headers=auth,
        json={"title": "完整旅程督导"},
    ).json()
    assert api.post(
        f"/api/v1/supervision/conversations/{conversation['id']}/context",
        headers=unlocked,
        json={"items": [{"resource_type": "session", "resource_id": session_id}]},
    ).status_code == 200
    reply = api.post(
        f"/api/v1/supervision/conversations/{conversation['id']}/messages",
        headers=auth,
        json={"content": "这次工作下一步如何推进？"},
    )
    assert reply.status_code == 202
    detail = api.get(
        f"/api/v1/supervision/conversations/{conversation['id']}",
        headers=auth,
    )
    assert detail.json()["messages"][-1]["citations"][0]["resource_id"] == session_id

    deleted = api.request(
        "DELETE",
        f"/api/v1/sessions/{session_id}",
        headers=unlocked,
        json={"confirmation_text": "删除记录"},
    )
    assert deleted.status_code == 200
    assert deleted.json()["deleted_counts"]["recordings"] == 1
    assert deleted.json()["deleted_counts"]["reports"] == 1
