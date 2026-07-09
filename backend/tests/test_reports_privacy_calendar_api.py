from datetime import UTC, datetime

from fastapi.testclient import TestClient

from app.db.session import SessionLocal
from app.main import create_app
from app.models import (
    RecordingSummary,
    RecordingTranscript,
    Report,
    SensitiveResource,
    SupervisionContextRef,
    SupervisionConversation,
    SupervisionMessage,
)
from app.seed import CASE_REPORT_ID, CHEN_PROFILE_ID, SESSION_6_ID, seed_demo_data
from tests.fake_storage import FakeStorage
from tests.helpers import auth_headers, profile_access_headers


def seed_generated_sources() -> None:
    now = datetime.now(UTC)
    with SessionLocal() as database:
        seed_demo_data(database)
        transcript = RecordingTranscript(
            id="transcript-report-source",
            user_id="demo-user",
            recording_id="recording-report-source",
            speakers_json={},
            segments_json=[],
            manual_edited=False,
            generated_at=now,
            expires_at=now.replace(year=now.year + 1),
            destroyed_at=None,
            created_at=now,
            updated_at=now,
        )
        # Recording FK is intentionally supplied by the API test setup below.


def test_report_generation_formal_copy_and_real_exports() -> None:
    with SessionLocal() as database:
        seed_demo_data(database)
    storage = FakeStorage()
    api = TestClient(create_app(storage=storage))
    unlocked_headers = profile_access_headers(api)

    sources = api.get(
        f"/api/v1/reports/generation-sources?report_type=counseling_note&session_id={SESSION_6_ID}",
        headers=unlocked_headers,
    )
    assert sources.status_code == 200
    assert any(item["resource_type"] == "session" for item in sources.json()["items"])
    attachment_sources = [
        item for item in sources.json()["items"]
        if item["resource_type"] == "attachment"
    ]
    assert {item["label"] for item in attachment_sources} >= {
        "scale：SAS 焦虑自评量表.pdf",
        "homework：睡前想法记录.png",
        "other：工作事件时间线.pdf",
    }
    assert all(item["analysis_status"] == "available" for item in attachment_sources)
    assert all(item["default_selected"] is True for item in attachment_sources)

    generated = api.post(
        "/api/v1/reports/generate",
        headers=unlocked_headers,
        json={
            "report_type": "counseling_note",
            "profile_id": CHEN_PROFILE_ID,
            "session_id": SESSION_6_ID,
            "selected_sources": [
                {"resource_type": "session", "resource_id": SESSION_6_ID},
                {"resource_type": "attachment", "resource_id": "attachment-scale-6"},
                {"resource_type": "attachment", "resource_id": "attachment-homework-6"},
                {"resource_type": "attachment", "resource_id": "attachment-other-6"},
            ],
        },
    )
    assert generated.status_code == 202
    report_id = generated.json()["draft_report_id"]
    generated_detail = api.get(f"/api/v1/reports/{report_id}", headers=unlocked_headers)
    assert generated_detail.status_code == 200
    assert generated_detail.json()["draft_content"]["prompt_version"] == "report-prompts-v1"
    assert [block["title"] for block in generated_detail.json()["draft_content"]["blocks"]] == [
        "基本信息",
        "本次主题",
        "咨询过程",
        "评估与风险",
        "后续计划",
    ]
    assert "第6次记录摘要" in generated_detail.json()["draft_content"]["prompt_user"]
    assert "SAS 焦虑自评量表.pdf" in generated_detail.json()["draft_content"]["prompt_user"]
    assert "睡前想法记录.png" in generated_detail.json()["draft_content"]["prompt_user"]
    assert "暂无解析文本" in generated_detail.json()["draft_content"]["prompt_user"]

    updated = api.patch(
        f"/api/v1/reports/{report_id}",
        headers=unlocked_headers,
        json={
            "title": "陈雨 第6次咨询记录",
            "content_json": {"blocks": [{"title": "本次重点", "content": "睡眠与评价焦虑"}]},
        },
    )
    formal = api.post(
        f"/api/v1/reports/{report_id}/save-formal",
        headers=unlocked_headers,
        json={"confirm_replace": True},
    )
    assert updated.status_code == 200
    assert formal.status_code == 200
    formal_snapshot = formal.json()["formal_content"]

    assert api.patch(
        f"/api/v1/reports/{report_id}",
        headers=unlocked_headers,
        json={"content_json": {"blocks": [{"title": "草稿", "content": "后续编辑"}]}},
    ).status_code == 200
    detail = api.get(f"/api/v1/reports/{report_id}", headers=unlocked_headers)
    assert detail.json()["formal_content"] == formal_snapshot

    for format_name, signature in (("pdf", b"%PDF"), ("docx", b"PK")):
        exported = api.post(
            f"/api/v1/reports/{report_id}/export",
            headers=unlocked_headers,
            json={"format": format_name, "version": "formal"},
        )
        assert exported.status_code == 202
        file_id = exported.json()["export_file_id"]
        download = api.get(
            f"/api/v1/files/{file_id}/download-url",
            headers=auth_headers(),
        )
        assert download.status_code == 200
        object_key = download.json()["download_url"].removeprefix("https://storage.test/download/")
        assert storage.objects[object_key].startswith(signature)

    listed = api.get(
        f"/api/v1/reports?session_id={SESSION_6_ID}&report_type=counseling_note",
        headers=unlocked_headers,
    )
    assert listed.status_code == 200
    assert listed.json()["total"] == 1
    assert listed.json()["items"][0]["id"] == report_id


def test_case_report_generation_sources_exclude_existing_case_report() -> None:
    with SessionLocal() as database:
        seed_demo_data(database)
    api = TestClient(create_app(storage=FakeStorage()))
    unlocked_headers = profile_access_headers(api)

    sources = api.get(
        f"/api/v1/reports/generation-sources?report_type=case_report&profile_id={CHEN_PROFILE_ID}",
        headers=unlocked_headers,
    )

    assert sources.status_code == 200
    items = sources.json()["items"]
    assert not any(
        item["resource_type"] == "report" and item["label"] == "陈雨 个案报告"
        for item in items
    )


def test_privacy_authorize_revoke_and_audio_rejection() -> None:
    now = datetime.now(UTC)
    with SessionLocal() as database:
        database.add_all([
            SensitiveResource(
                id="sensitive-transcript",
                user_id="demo-user",
                resource_type="transcript",
                resource_id="transcript-1",
                display_name="第6次咨询转写",
                owner_type="session",
                owner_id=SESSION_6_ID,
                origin_at=now,
                expires_at=now.replace(year=now.year + 1),
                can_long_term_preserve=True,
                long_term_authorized_at=None,
                long_term_revoked_at=None,
                destroyed_at=None,
                created_at=now,
                updated_at=now,
            ),
            SensitiveResource(
                id="sensitive-audio",
                user_id="demo-user",
                resource_type="audio",
                resource_id="audio-1",
                display_name="原始录音",
                owner_type="session",
                owner_id=SESSION_6_ID,
                origin_at=now,
                expires_at=now.replace(year=now.year + 1),
                can_long_term_preserve=False,
                long_term_authorized_at=None,
                long_term_revoked_at=None,
                destroyed_at=None,
                created_at=now,
                updated_at=now,
            ),
        ])
        database.commit()
    api = TestClient(create_app(storage=FakeStorage()))

    authorized = api.post(
        "/api/v1/privacy/resources/sensitive-transcript/authorize-long-term",
        headers=auth_headers(),
        json={"confirm_understanding": True},
    )
    assert authorized.status_code == 200
    assert api.get(
        "/api/v1/privacy/long-term-resources",
        headers=auth_headers(),
    ).json()["total"] == 1

    rejected = api.post(
        "/api/v1/privacy/resources/sensitive-audio/authorize-long-term",
        headers=auth_headers(),
        json={"confirm_understanding": True},
    )
    assert rejected.status_code == 400
    assert rejected.json()["error"]["code"] == "long_term_not_allowed"

    revoked = api.post(
        "/api/v1/privacy/resources/sensitive-transcript/revoke-long-term",
        headers=auth_headers(),
    )
    assert revoked.status_code == 200
    assert revoked.json()["long_term_authorized_at"] is None


def test_privacy_deletion_destroys_report_content() -> None:
    with SessionLocal() as database:
        seed_demo_data(database)
    api = TestClient(create_app(storage=FakeStorage()))

    deleted = api.request(
        "DELETE",
        "/api/v1/privacy/resources/sensitive-case-report",
        headers=auth_headers(),
        json={"confirmation_text": "删除资料"},
    )

    assert deleted.status_code == 200
    with SessionLocal() as database:
        report = database.get(Report, CASE_REPORT_ID)
        assert report is not None
        assert report.destroyed_at is not None
        assert report.draft_content == {}
        assert report.formal_content is None
        assert report.selected_sources == []


def test_privacy_deletion_destroys_supervision_messages_and_context() -> None:
    with SessionLocal() as database:
        seed_demo_data(database)
    api = TestClient(create_app(storage=FakeStorage()))
    unlocked_headers = profile_access_headers(api)

    created = api.post(
        "/api/v1/supervision/conversations",
        headers=auth_headers(),
        json={"title": "需要彻底销毁的督导会话"},
    )
    assert created.status_code == 201
    conversation_id = created.json()["id"]
    assert api.post(
        f"/api/v1/supervision/conversations/{conversation_id}/context",
        headers=unlocked_headers,
        json={"items": [{"resource_type": "profile", "resource_id": CHEN_PROFILE_ID}]},
    ).status_code == 200
    assert api.post(
        f"/api/v1/supervision/conversations/{conversation_id}/messages",
        headers=auth_headers(),
        json={"content": "请帮我梳理这个案例。"},
    ).status_code == 202

    resources = api.get(
        "/api/v1/privacy/expiring-resources?days=365",
        headers=auth_headers(),
    )
    resource_id = next(
        item["id"]
        for item in resources.json()["items"]
        if item["resource_type"] == "supervision_conversation"
        and item["resource_id"] == conversation_id
    )
    deleted = api.request(
        "DELETE",
        f"/api/v1/privacy/resources/{resource_id}",
        headers=auth_headers(),
        json={"confirmation_text": "删除资料"},
    )

    assert deleted.status_code == 200
    with SessionLocal() as database:
        conversation = database.get(SupervisionConversation, conversation_id)
        assert conversation is not None
        assert conversation.destroyed_at is not None
        assert database.query(SupervisionMessage).filter_by(
            conversation_id=conversation_id
        ).count() == 0
        assert database.query(SupervisionContextRef).filter_by(
            conversation_id=conversation_id
        ).count() == 0


def test_calendar_crud_filters_and_settings() -> None:
    api = TestClient(create_app(storage=FakeStorage()))

    settings = api.get("/api/v1/calendar/settings", headers=auth_headers())
    assert settings.status_code == 200
    assert settings.json()["privacy_title_mode_enabled"] is True

    event = api.post(
        "/api/v1/calendar/events",
        headers=auth_headers(),
        json={
            "title": "陈雨 · 第7次咨询",
            "privacy_title": "咨询提醒",
            "category": "counseling",
            "start_at": "2026-06-10T10:00:00+08:00",
            "end_at": "2026-06-10T10:50:00+08:00",
            "sync_to_system_calendar": True,
        },
    )
    assert event.status_code == 201
    event_id = event.json()["id"]

    listed = api.get(
        "/api/v1/calendar/events?from=2026-06-10T00:00:00%2B08:00&to=2026-06-11T00:00:00%2B08:00",
        headers=auth_headers(),
    )
    assert listed.status_code == 200
    assert listed.json()["items"][0]["display_title"] == "咨询提醒"

    completed = api.patch(
        f"/api/v1/calendar/events/{event_id}",
        headers=auth_headers(),
        json={"status": "completed", "system_calendar_event_id": "ios-event-1"},
    )
    assert completed.status_code == 200
    assert completed.json()["status"] == "completed"
