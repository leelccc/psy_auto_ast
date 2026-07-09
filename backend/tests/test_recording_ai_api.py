from fastapi.testclient import TestClient

from app.db.session import SessionLocal
from app.main import create_app
from app.seed import CHEN_PROFILE_ID, seed_demo_data
from app.services.ai import BailianAIError, RecordingAIResult, RecordingSummaryResult
from tests.fake_storage import FakeStorage
from tests.helpers import auth_headers


class CapturingRecordingProvider:
    def __init__(self) -> None:
        self.calls: list[dict[str, object]] = []
        self.summary_calls: list[dict[str, object]] = []

    def process_recording(self, **kwargs: object) -> RecordingAIResult:
        self.calls.append(kwargs)
        return RecordingAIResult(
            speakers={"speaker_1": "咨询师"},
            segments=[{
                "start_ms": 0,
                "end_ms": 60000,
                "speaker_key": "speaker_1",
                "text": "真实模型转写内容。",
            }],
            summary="根据真实转写生成的录音纪要。",
            chapters=[{
                "title": "主要内容",
                "summary": "真实纪要章节。",
                "start_ms": 0,
                "end_ms": 60000,
            }],
        )

    def summarize_transcript(self, **kwargs: object) -> RecordingSummaryResult:
        self.summary_calls.append(kwargs)
        return RecordingSummaryResult(
            summary="根据人工修订转写重新生成的纪要。",
            chapters=[{
                "title": "修订内容",
                "summary": "仅重新生成纪要。",
                "start_ms": 0,
                "end_ms": 60000,
            }],
        )


class FailingRecordingProvider:
    def process_recording(self, **_: object) -> RecordingAIResult:
        raise BailianAIError("模型服务暂时不可用。")

    def summarize_transcript(self, **_: object) -> RecordingSummaryResult:
        raise BailianAIError("模型服务暂时不可用。")


def create_bound_recording(
    api: TestClient,
    storage: FakeStorage,
    *,
    audio: bytes = b"recording-bytes",
) -> str:
    recording_id = api.post(
        "/api/v1/recordings",
        headers=auth_headers(),
        json={"title": "模型识别录音", "source_type": "uploaded_audio"},
    ).json()["id"]
    created = api.post(
        "/api/v1/files",
        headers=auth_headers(),
        json={
            "filename": "model-test.m4a",
            "mime_type": "audio/mp4",
            "size_bytes": len(audio),
            "purpose": "recording",
        },
    ).json()
    storage.objects[storage.last_upload_key] = audio
    api.post(f"/api/v1/files/{created['file_id']}/complete", headers=auth_headers())
    api.post(
        f"/api/v1/recordings/{recording_id}/audio",
        headers=auth_headers(),
        json={"file_id": created["file_id"], "duration_seconds": 60},
    )
    return recording_id


def test_recording_processing_reads_minio_bytes_for_bailian_base64_mode() -> None:
    with SessionLocal() as database:
        seed_demo_data(database)
    storage = FakeStorage()
    provider = CapturingRecordingProvider()
    api = TestClient(create_app(
        storage=storage,
        recording_ai_provider=provider,
        recording_audio_input_mode="base64",
    ))
    recording_id = create_bound_recording(api, storage)

    processed = api.post(
        f"/api/v1/recordings/{recording_id}/processing",
        headers=auth_headers(),
        json={"mode": "generic"},
    )

    assert processed.status_code == 202
    assert provider.calls[0]["audio_bytes"] == b"recording-bytes"
    assert provider.calls[0]["audio_url"] is None
    transcript = api.get(
        f"/api/v1/recordings/{recording_id}/transcript",
        headers=auth_headers(),
    ).json()
    summary = api.get(
        f"/api/v1/recordings/{recording_id}/summary",
        headers=auth_headers(),
    ).json()
    assert transcript["segments"][0]["text"] == "真实模型转写内容。"
    assert summary["main_summary"] == "根据真实转写生成的录音纪要。"


def test_recording_processing_uses_presigned_minio_url_when_configured() -> None:
    storage = FakeStorage()
    provider = CapturingRecordingProvider()
    api = TestClient(create_app(
        storage=storage,
        recording_ai_provider=provider,
        recording_audio_input_mode="minio_url",
    ))
    recording_id = create_bound_recording(api, storage)

    processed = api.post(
        f"/api/v1/recordings/{recording_id}/processing",
        headers=auth_headers(),
        json={"mode": "generic"},
    )

    assert processed.status_code == 202
    assert provider.calls[0]["audio_bytes"] is None
    assert str(provider.calls[0]["audio_url"]).startswith(
        "https://storage.test/download/"
    )


def test_recording_processing_persists_retryable_model_failure() -> None:
    storage = FakeStorage()
    api = TestClient(create_app(
        storage=storage,
        recording_ai_provider=FailingRecordingProvider(),
        recording_audio_input_mode="base64",
    ))
    recording_id = create_bound_recording(api, storage)

    processed = api.post(
        f"/api/v1/recordings/{recording_id}/processing",
        headers=auth_headers(),
        json={"mode": "generic"},
    )

    assert processed.status_code == 502
    assert processed.json()["error"]["code"] == "recording_ai_service_failed"
    recording = next(
        item for item in api.get(
            "/api/v1/recordings",
            headers=auth_headers(),
        ).json()["items"]
        if item["id"] == recording_id
    )
    assert recording["ai_status"] == "failed"
    assert recording["processing_error"] == "模型服务暂时不可用。"


def test_summary_regeneration_uses_current_transcript_without_retranscribing() -> None:
    storage = FakeStorage()
    provider = CapturingRecordingProvider()
    api = TestClient(create_app(
        storage=storage,
        recording_ai_provider=provider,
        recording_audio_input_mode="base64",
    ))
    recording_id = create_bound_recording(api, storage)
    api.post(
        f"/api/v1/recordings/{recording_id}/processing",
        headers=auth_headers(),
        json={"mode": "generic"},
    )
    transcript = api.get(
        f"/api/v1/recordings/{recording_id}/transcript",
        headers=auth_headers(),
    ).json()
    segment_id = transcript["segments"][0]["id"]
    api.patch(
        f"/api/v1/transcript-segments/{segment_id}",
        headers=auth_headers(),
        json={"text": "这是人工修订后需要保留的转写。"},
    )

    regenerated = api.post(
        f"/api/v1/recordings/{recording_id}/summary/regenerate",
        headers=auth_headers(),
        json={"confirm_overwrite": True},
    )

    assert regenerated.status_code == 202
    assert len(provider.calls) == 1
    assert "这是人工修订后需要保留的转写。" in str(
        provider.summary_calls[0]["transcript"]
    )
    current_transcript = api.get(
        f"/api/v1/recordings/{recording_id}/transcript",
        headers=auth_headers(),
    ).json()
    current_summary = api.get(
        f"/api/v1/recordings/{recording_id}/summary",
        headers=auth_headers(),
    ).json()
    assert current_transcript["segments"][0]["text"] == "这是人工修订后需要保留的转写。"
    assert current_transcript["manual_edited"] is True
    assert current_summary["main_summary"] == "根据人工修订转写重新生成的纪要。"
    assert current_summary["manual_edited"] is False


def test_recording_upload_process_edit_archive_and_retry_boundaries() -> None:
    with SessionLocal() as database:
        seed_demo_data(database)
    storage = FakeStorage()
    api = TestClient(create_app(storage=storage))

    recording = api.post(
        "/api/v1/recordings",
        headers=auth_headers(),
        json={"title": "陈雨第七次咨询", "source_type": "in_app_recording"},
    )
    assert recording.status_code == 201
    recording_id = recording.json()["id"]

    audio = b"fake-m4a-audio"
    created_file = api.post(
        "/api/v1/files",
        headers=auth_headers(),
        json={
            "filename": "session.m4a",
            "mime_type": "audio/mp4",
            "size_bytes": len(audio),
            "purpose": "recording",
        },
    )
    storage.objects[storage.last_upload_key] = audio
    file_id = created_file.json()["file_id"]
    assert api.post(f"/api/v1/files/{file_id}/complete", headers=auth_headers()).status_code == 200

    bound = api.post(
        f"/api/v1/recordings/{recording_id}/audio",
        headers=auth_headers(),
        json={"file_id": file_id, "duration_seconds": 3050},
    )
    assert bound.status_code == 200
    assert bound.json()["can_long_term_preserve_audio"] is False
    stats = api.get(
        "/api/v1/recording-duration-statistics",
        headers=auth_headers(),
    )
    assert stats.status_code == 200
    assert stats.json()["total_seconds"] == 3050
    assert stats.json()["items"] == [{
        "profile_type": None,
        "count": 1,
        "duration_seconds": 3050,
    }]

    processing = api.post(
        f"/api/v1/recordings/{recording_id}/processing",
        headers=auth_headers(),
        json={"mode": "generic"},
    )
    assert processing.status_code == 202
    job = api.get(f"/api/v1/ai-jobs/{processing.json()['job_id']}", headers=auth_headers())
    assert job.json()["status"] == "completed"
    assert job.json()["progress"] == 100

    transcript = api.get(
        f"/api/v1/recordings/{recording_id}/transcript",
        headers=auth_headers(),
    )
    assert transcript.status_code == 200
    assert len(transcript.json()["segments"]) >= 3
    segment_id = transcript.json()["segments"][0]["id"]

    speaker = api.patch(
        f"/api/v1/recordings/{recording_id}/speakers",
        headers=auth_headers(),
        json={"speaker_key": "speaker_2", "speaker_label": "陈雨"},
    )
    corrected = api.patch(
        f"/api/v1/transcript-segments/{segment_id}",
        headers=auth_headers(),
        json={"text": "修订后的开场内容。"},
    )
    assert speaker.status_code == 200
    assert corrected.status_code == 200
    assert corrected.json()["text"] == "修订后的开场内容。"

    summary = api.get(
        f"/api/v1/recordings/{recording_id}/summary",
        headers=auth_headers(),
    )
    assert summary.status_code == 200
    assert summary.json()["main_summary"]

    archived = api.post(
        f"/api/v1/recordings/{recording_id}/archive",
        headers=auth_headers(),
        json={
            "profile_type": "client",
            "profile_id": CHEN_PROFILE_ID,
            "create_session": {
                "started_at": "2026-06-09T10:00:00+08:00",
                "mode": "offline",
            },
        },
    )
    assert archived.status_code == 200
    assert archived.json()["sequence_no"] == 7
    assert archived.json()["recommended_speaker_roles"] == ["咨询师", "来访者"]
    archived_stats = api.get(
        "/api/v1/recording-duration-statistics",
        headers=auth_headers(),
    ).json()
    assert archived_stats["total_seconds"] == 3050
    assert archived_stats["items"] == [{
        "profile_type": "client",
        "count": 1,
        "duration_seconds": 3050,
    }]

    repeated = api.post(
        f"/api/v1/recordings/{recording_id}/archive",
        headers=auth_headers(),
        json={"profile_type": "client", "profile_id": CHEN_PROFILE_ID},
    )
    assert repeated.status_code == 200
    assert repeated.json()["session_id"] == archived.json()["session_id"]

    duplicate_processing = api.post(
        f"/api/v1/recordings/{recording_id}/processing",
        headers=auth_headers(),
        json={"mode": "archived_context"},
    )
    assert duplicate_processing.status_code == 409


def test_recording_requires_uploaded_audio_and_rejects_cross_user_file() -> None:
    storage = FakeStorage()
    api = TestClient(create_app(storage=storage))
    recording_id = api.post(
        "/api/v1/recordings",
        headers=auth_headers(),
        json={"title": "边界录音", "source_type": "uploaded_audio"},
    ).json()["id"]
    pending_file = api.post(
        "/api/v1/files",
        headers=auth_headers(),
        json={
            "filename": "pending.m4a",
            "mime_type": "audio/mp4",
            "size_bytes": 10,
            "purpose": "recording",
        },
    ).json()["file_id"]

    response = api.post(
        f"/api/v1/recordings/{recording_id}/audio",
        headers=auth_headers(),
        json={"file_id": pending_file, "duration_seconds": 60},
    )
    assert response.status_code == 409
    assert response.json()["error"]["code"] == "file_not_uploaded"


def test_uploaded_audio_can_bind_before_duration_is_known() -> None:
    storage = FakeStorage()
    api = TestClient(create_app(storage=storage))
    recording_id = api.post(
        "/api/v1/recordings",
        headers=auth_headers(),
        json={"title": "待识别时长录音", "source_type": "uploaded_audio"},
    ).json()["id"]
    audio = b"audio"
    created = api.post(
        "/api/v1/files",
        headers=auth_headers(),
        json={
            "filename": "unknown-duration.m4a",
            "mime_type": "audio/mp4",
            "size_bytes": len(audio),
            "purpose": "recording",
        },
    ).json()
    storage.objects[storage.last_upload_key] = audio
    api.post(f"/api/v1/files/{created['file_id']}/complete", headers=auth_headers())

    response = api.post(
        f"/api/v1/recordings/{recording_id}/audio",
        headers=auth_headers(),
        json={"file_id": created["file_id"], "duration_seconds": None},
    )

    assert response.status_code == 200
