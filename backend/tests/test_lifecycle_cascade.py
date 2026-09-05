from datetime import datetime

from fastapi.testclient import TestClient
from sqlalchemy import select

from app.db.session import SessionLocal
from app.main import create_app
from app.models import (
    AIJob,
    CalendarEvent,
    Recording,
    RecordingSegment,
    RecordingSummary,
    RecordingTranscript,
    Report,
    SensitiveResource,
    StoredFile,
)
from app.seed import CHEN_PROFILE_ID, seed_demo_data
from tests.fake_storage import FakeStorage
from tests.helpers import auth_headers, profile_access_headers


def upload_file(
    api: TestClient,
    storage: FakeStorage,
    *,
    filename: str,
    mime_type: str,
    purpose: str,
    body: bytes,
) -> str:
    created = api.post(
        "/api/v1/files",
        headers=auth_headers(),
        json={
            "filename": filename,
            "mime_type": mime_type,
            "size_bytes": len(body),
            "purpose": purpose,
        },
    )
    assert created.status_code == 201
    storage.objects[storage.last_upload_key] = body
    file_id = created.json()["file_id"]
    assert api.post(
        f"/api/v1/files/{file_id}/complete",
        headers=auth_headers(),
    ).status_code == 200
    return file_id


def test_session_delete_cascades_generated_resources_and_storage_objects() -> None:
    with SessionLocal() as database:
        seed_demo_data(database)
    storage = FakeStorage()
    api = TestClient(create_app(storage=storage))
    unlocked_headers = profile_access_headers(api)

    audio_file_id = upload_file(
        api,
        storage,
        filename="session.m4a",
        mime_type="audio/mp4",
        purpose="recording",
        body=b"audio-bytes",
    )
    recording = api.post(
        "/api/v1/recordings",
        headers=auth_headers(),
        json={"title": "待删除咨询录音", "source_type": "uploaded_audio"},
    ).json()
    assert api.post(
        f"/api/v1/recordings/{recording['id']}/segments",
        headers=auth_headers(),
        json={"file_id": audio_file_id, "duration_seconds": 120},
    ).status_code == 201
    archived = api.post(
        f"/api/v1/recordings/{recording['id']}/archive",
        headers=auth_headers(),
        json={
            "profile_type": "client",
            "profile_id": CHEN_PROFILE_ID,
            "create_session": {"summary": "用于删除级联测试"},
        },
    )
    assert archived.status_code == 200
    session_id = archived.json()["session_id"]
    assert api.post(
        f"/api/v1/recordings/{recording['id']}/processing",
        headers=auth_headers(),
        json={"mode": "generic"},
    ).status_code == 202

    generated = api.post(
        "/api/v1/reports/generate",
        headers=unlocked_headers,
        json={
            "report_type": "counseling_note",
            "profile_id": CHEN_PROFILE_ID,
            "session_id": session_id,
            "selected_sources": [
                {"resource_type": "session", "resource_id": session_id}
            ],
        },
    )
    assert generated.status_code == 202
    report_id = generated.json()["draft_report_id"]
    exported = api.post(
        f"/api/v1/reports/{report_id}/export",
        headers=unlocked_headers,
        json={"format": "pdf", "version": "draft"},
    )
    assert exported.status_code == 202
    export_file_id = exported.json()["export_file_id"]

    with SessionLocal() as database:
        audio_key = database.get(StoredFile, audio_file_id).storage_key
        export_key = database.get(StoredFile, export_file_id).storage_key

    deleted = api.request(
        "DELETE",
        f"/api/v1/sessions/{session_id}",
        headers=unlocked_headers,
        json={"confirmation_text": "删除记录"},
    )
    assert deleted.status_code == 200
    assert deleted.json()["deleted_counts"]["recordings"] == 1
    assert deleted.json()["deleted_counts"]["reports"] == 1

    assert audio_key in storage.deleted_keys
    assert export_key in storage.deleted_keys
    with SessionLocal() as database:
        assert database.get(Recording, recording["id"]) is None
        assert database.scalar(
            select(RecordingSegment).where(RecordingSegment.recording_id == recording["id"])
        ) is None
        assert database.get(Report, report_id) is None
        assert database.scalar(
            select(RecordingTranscript).where(
                RecordingTranscript.recording_id == recording["id"]
            )
        ) is None
        assert database.scalar(
            select(RecordingSummary).where(
                RecordingSummary.recording_id == recording["id"]
            )
        ) is None
        assert database.scalar(
            select(AIJob).where(
                AIJob.target_id.in_((recording["id"], report_id))
            )
        ) is None
        assert database.scalar(
            select(SensitiveResource).where(
                SensitiveResource.owner_id.in_((recording["id"], session_id))
            )
        ) is None


def test_profile_next_session_time_maintains_one_automatic_calendar_event() -> None:
    with SessionLocal() as database:
        seed_demo_data(database)
    api = TestClient(create_app(storage=FakeStorage()))
    unlocked_headers = profile_access_headers(api)

    created = api.post(
        "/api/v1/profiles",
        headers=auth_headers(),
        json={
            "type": "client",
            "name": "日历联动测试",
            "next_session_at": "2026-06-20T10:00:00+08:00",
        },
    )
    assert created.status_code == 201
    profile_id = created.json()["id"]

    events = api.get(
        "/api/v1/calendar/events",
        headers=auth_headers(),
    ).json()["items"]
    automatic = [
        item for item in events
        if item["profile_id"] == profile_id
        and item["source_type"] == "profile_next_session"
    ]
    assert len(automatic) == 1
    event_id = automatic[0]["id"]
    assert datetime.fromisoformat(automatic[0]["start_at"]) == datetime.fromisoformat(
        "2026-06-20T10:00:00+08:00"
    )

    updated = api.patch(
        f"/api/v1/profiles/{profile_id}",
        headers=unlocked_headers,
        json={
            "name": "日历联动测试（已更新）",
            "next_session_at": "2026-06-21T14:30:00+08:00",
        },
    )
    assert updated.status_code == 200
    with SessionLocal() as database:
        event = database.get(CalendarEvent, event_id)
        assert event is not None
        assert event.start_at == datetime.fromisoformat("2026-06-21T14:30:00+08:00")
        assert "已更新" in event.title

    cleared = api.patch(
        f"/api/v1/profiles/{profile_id}",
        headers=unlocked_headers,
        json={"next_session_at": None},
    )
    assert cleared.status_code == 200
    with SessionLocal() as database:
        assert database.get(CalendarEvent, event_id) is None
