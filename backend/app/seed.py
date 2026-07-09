from base64 import b64decode
from datetime import UTC, datetime, timedelta
from io import BytesIO
import wave

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import (
    AIJob,
    Attachment,
    CalendarEvent,
    CalendarSetting,
    Profile,
    Recording,
    RecordingSummary,
    RecordingTranscript,
    Report,
    SensitiveResource,
    SessionRecord,
    StoredFile,
    SupervisionContextRef,
    SupervisionConversation,
    SupervisionMessage,
    User,
)
from app.services.auth import hash_password
from app.services.exports import render_pdf
from app.services.storage import MinioStorage, Storage


DEMO_USER_ID = "demo-user"
MOBILE_USER_ID = "mobile-user"
CHEN_PROFILE_ID = "profile-chen-yu"
SESSION_5_ID = "session-chen-5"
SESSION_6_ID = "session-chen-6"
RECORDING_6_ID = "recording-chen-6"
TRANSCRIPT_6_ID = "transcript-chen-6"
SUMMARY_6_ID = "summary-chen-6"
CASE_REPORT_ID = "report-chen-case"
SUPERVISION_CONVERSATION_ID = "supervision-demo"


def parse_datetime(value: str) -> datetime:
    return datetime.fromisoformat(value)


def demo_wav_bytes() -> bytes:
    output = BytesIO()
    with wave.open(output, "wb") as audio:
        audio.setnchannels(1)
        audio.setsampwidth(2)
        audio.setframerate(8000)
        audio.writeframes(b"\x00\x00" * 8000)
    return output.getvalue()


DEMO_PNG = b64decode(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUB"
    "AScY42YAAAAASUVORK5CYII="
)


def seed_demo_data(database: Session, storage: Storage | None = None) -> None:
    now = datetime.now(UTC)
    existing_user = database.get(User, DEMO_USER_ID)
    if existing_user is not None:
        existing_user.email = "admin@163.com"
        existing_user.password_hash = hash_password("123456")
        existing_user.role = "admin"
        existing_user.status = "active"
        existing_user.plan_code = "enterprise"
        existing_user.entitlements_json = {"recording_minutes": -1, "report_generations": -1, "storage_gb": -1}
        existing_user.usage_json = existing_user.usage_json or {"recording_seconds": 0, "report_generations": 0, "storage_bytes": 0}
        existing_user.updated_at = now
        ensure_mobile_test_user(database, now)
        database.commit()
        return

    ensure_mobile_test_user(database, now)
    next_client = now + timedelta(days=1)
    next_supervision = now + timedelta(days=2)
    database.add(User(
        id=DEMO_USER_ID,
        email="admin@163.com",
        display_name="演示咨询师",
        password_hash=hash_password("123456"),
        role="admin",
        status="active",
        plan_code="enterprise",
        entitlements_json={"recording_minutes": -1, "report_generations": -1, "storage_gb": -1},
        usage_json={"recording_seconds": 0, "report_generations": 0, "storage_bytes": 0},
        created_at=now,
        updated_at=now,
    ))
    database.add_all([
        Profile(
            id=CHEN_PROFILE_ID,
            user_id=DEMO_USER_ID,
            type="client",
            name="陈雨",
            code="A08",
            status="active",
            crisis_level="mild",
            initial_session_count=4,
            next_session_at=next_client,
            metadata_json={"frequency": "每周"},
            notes="",
            created_at=now,
            updated_at=now,
        ),
        Profile(
            id="profile-li-cheng",
            user_id=DEMO_USER_ID,
            type="supervisor",
            name="李澄",
            code="S03",
            status="active",
            crisis_level=None,
            initial_session_count=3,
            next_session_at=next_supervision,
            metadata_json={"direction": "整合取向"},
            notes="",
            created_at=now,
            updated_at=now,
        ),
        Profile(
            id="profile-zhou-nan",
            user_id=DEMO_USER_ID,
            type="supervisee",
            name="周楠",
            code="B12",
            status="paused",
            crisis_level=None,
            initial_session_count=3,
            next_session_at=None,
            metadata_json={"direction": "实习督导"},
            notes="",
            created_at=now,
            updated_at=now,
        ),
        Profile(
            id="profile-wang-lan",
            user_id=DEMO_USER_ID,
            type="supervisor",
            name="王澜",
            code="S07",
            status="active",
            crisis_level=None,
            initial_session_count=2,
            next_session_at=None,
            metadata_json={"direction": "案例概念化"},
            notes="",
            created_at=now,
            updated_at=now,
        ),
    ])
    database.flush()
    database.add_all([
        SessionRecord(
            id=SESSION_5_ID,
            user_id=DEMO_USER_ID,
            profile_id=CHEN_PROFILE_ID,
            session_type="counseling",
            sequence_no=5,
            occurred_at=parse_datetime("2026-05-29T10:00:00+08:00"),
            ended_at=parse_datetime("2026-05-29T10:50:00+08:00"),
            mode="offline",
            summary="梳理近期压力事件，并继续识别自动化想法。",
            tags=["长期保存", "正式版"],
            record_status="formal",
            created_at=now,
            updated_at=now,
        ),
        SessionRecord(
            id=SESSION_6_ID,
            user_id=DEMO_USER_ID,
            profile_id=CHEN_PROFILE_ID,
            session_type="counseling",
            sequence_no=6,
            occurred_at=parse_datetime("2026-06-05T10:00:00+08:00"),
            ended_at=parse_datetime("2026-06-05T10:52:00+08:00"),
            mode="offline",
            summary="围绕睡眠下降、工作评价焦虑和关系议题展开。",
            tags=["焦虑", "睡眠"],
            record_status="draft",
            created_at=now,
            updated_at=now,
        ),
    ])
    database.flush()

    pdf_bytes = render_pdf(
        "咨询师助手演示资料",
        {"blocks": [{"title": "说明", "content": "这是写入 MinIO 的真实演示文件。"}]},
    )
    file_rows = [
        ("file-recording-6", SESSION_6_ID, "recording", "第 6 次咨询原始录音.wav", "audio/wav", False, demo_wav_bytes()),
        ("file-scale-6", SESSION_6_ID, "scale", "SAS 焦虑自评量表.pdf", "application/pdf", True, pdf_bytes),
        ("file-homework-6", SESSION_6_ID, "homework", "睡前想法记录.png", "image/png", True, DEMO_PNG),
        ("file-other-6", SESSION_6_ID, "other", "工作事件时间线.pdf", "application/pdf", True, pdf_bytes),
        ("file-consent-chen", CHEN_PROFILE_ID, "consent", "知情同意书.pdf", "application/pdf", True, pdf_bytes),
        ("file-agreement-chen", CHEN_PROFILE_ID, "counseling_agreement", "咨询协议.pdf", "application/pdf", True, pdf_bytes),
    ]
    attachments: list[Attachment] = []
    for file_id, owner_id, category, filename, mime_type, preservable, content in file_rows:
        storage_key = f"{DEMO_USER_ID}/{file_id}/{filename}" if storage else None
        if storage_key and storage:
            storage.write_object(storage_key, content, mime_type)
        database.add(StoredFile(
            id=file_id,
            user_id=DEMO_USER_ID,
            storage_key=storage_key,
            filename=filename,
            mime_type=mime_type,
            size_bytes=len(content),
            purpose="recording" if category == "recording" else "attachment",
            upload_status="uploaded" if storage else "metadata_only",
            expires_at=now + timedelta(days=14),
            can_long_term_preserve=preservable,
            long_term_authorized_at=None,
            long_term_revoked_at=None,
            destroyed_at=None,
            created_at=now,
            uploaded_at=now if storage else None,
        ))
        if category == "recording":
            continue
        attachments.append(Attachment(
            id=f"attachment-{file_id.removeprefix('file-')}",
            user_id=DEMO_USER_ID,
            owner_type="session" if owner_id.startswith("session-") else "profile",
            owner_id=owner_id,
            category=category,
            file_id=file_id,
            replace_group_key=category if owner_id == CHEN_PROFILE_ID else None,
            is_current=True,
            analysis_status="not_applicable" if mime_type.startswith("image/") else "available",
            extracted_text=(
                "演示 PDF 已完成文本提取，可用于生成记录与报告。"
                if mime_type == "application/pdf"
                else None
            ),
            created_at=now,
            updated_at=now,
        ))
    database.flush()
    database.add_all(attachments)

    database.add(Recording(
        id=RECORDING_6_ID,
        user_id=DEMO_USER_ID,
        session_id=SESSION_6_ID,
        title="陈雨 第6次咨询录音",
        source_type="in_app_recording",
        audio_file_id="file-recording-6",
        duration_seconds=52 * 60,
        archive_status="archived",
        ai_status="completed",
        processing_error=None,
        uploaded_at=now,
        audio_expires_at=now + timedelta(days=14),
        audio_destroyed_at=None,
        created_at=now,
        updated_at=now,
    ))
    database.flush()
    transcript_segments = [
        {
            "id": "segment-demo-1",
            "start_ms": 0,
            "end_ms": 120000,
            "speaker_key": "speaker_1",
            "speaker_label": "咨询师",
            "text": "我们先回顾这一周睡眠和工作评价带来的变化。",
        },
        {
            "id": "segment-demo-2",
            "start_ms": 120000,
            "end_ms": 280000,
            "speaker_key": "speaker_2",
            "speaker_label": "来访者",
            "text": "最近容易担心别人对我的评价，晚上也更难入睡。",
        },
    ]
    database.add_all([
        RecordingTranscript(
            id=TRANSCRIPT_6_ID,
            user_id=DEMO_USER_ID,
            recording_id=RECORDING_6_ID,
            speakers_json={"speaker_1": "咨询师", "speaker_2": "来访者"},
            segments_json=transcript_segments,
            manual_edited=False,
            generated_at=now,
            expires_at=now + timedelta(days=14),
            destroyed_at=None,
            created_at=now,
            updated_at=now,
        ),
        RecordingSummary(
            id=SUMMARY_6_ID,
            user_id=DEMO_USER_ID,
            recording_id=RECORDING_6_ID,
            main_summary="本次围绕睡眠下降、工作评价焦虑和关系议题展开。",
            chapter_overview=[
                {"title": "近况回顾", "start_ms": 0, "end_ms": 120000},
                {"title": "核心议题", "start_ms": 120000, "end_ms": 280000},
            ],
            manual_edited=False,
            generated_at=now,
            expires_at=now + timedelta(days=14),
            destroyed_at=None,
            created_at=now,
            updated_at=now,
        ),
    ])
    report_content = {
        "blocks": [
            {"title": "基本资料", "content": "陈雨，当前处于持续咨询阶段。"},
            {"title": "问题概述", "content": "工作评价焦虑、睡眠下降及关系中的自我怀疑。"},
            {"title": "评估与计划", "content": "继续记录触发事件并复核风险与资源。"},
        ]
    }
    database.add(Report(
        id=CASE_REPORT_ID,
        user_id=DEMO_USER_ID,
        profile_id=CHEN_PROFILE_ID,
        session_id=None,
        recording_id=None,
        report_type="case_report",
        title="陈雨 个案报告",
        draft_content=report_content,
        formal_content=report_content,
        selected_sources=[{
            "resource_type": "profile",
            "resource_id": CHEN_PROFILE_ID,
            "label": "陈雨 基础档案",
        }],
        generation_status="completed",
        formal_saved_at=now,
        expires_at=now + timedelta(days=14),
        destroyed_at=None,
        created_at=now,
        updated_at=now,
    ))
    database.add_all([
        SensitiveResource(
            id="sensitive-audio-6",
            user_id=DEMO_USER_ID,
            resource_type="audio",
            resource_id=RECORDING_6_ID,
            display_name="陈雨 第6次咨询原始录音",
            owner_type="recording",
            owner_id=RECORDING_6_ID,
            origin_at=now,
            expires_at=now + timedelta(days=14),
            can_long_term_preserve=False,
            long_term_authorized_at=None,
            long_term_revoked_at=None,
            destroyed_at=None,
            created_at=now,
            updated_at=now,
        ),
        SensitiveResource(
            id="sensitive-transcript-6",
            user_id=DEMO_USER_ID,
            resource_type="transcript",
            resource_id=TRANSCRIPT_6_ID,
            display_name="陈雨 第6次咨询转写",
            owner_type="recording",
            owner_id=RECORDING_6_ID,
            origin_at=now,
            expires_at=now + timedelta(days=14),
            can_long_term_preserve=True,
            long_term_authorized_at=None,
            long_term_revoked_at=None,
            destroyed_at=None,
            created_at=now,
            updated_at=now,
        ),
        SensitiveResource(
            id="sensitive-summary-6",
            user_id=DEMO_USER_ID,
            resource_type="recording_summary",
            resource_id=SUMMARY_6_ID,
            display_name="陈雨 第6次咨询录音纪要",
            owner_type="recording",
            owner_id=RECORDING_6_ID,
            origin_at=now,
            expires_at=now + timedelta(days=14),
            can_long_term_preserve=True,
            long_term_authorized_at=now,
            long_term_revoked_at=None,
            destroyed_at=None,
            created_at=now,
            updated_at=now,
        ),
        SensitiveResource(
            id="sensitive-case-report",
            user_id=DEMO_USER_ID,
            resource_type="report",
            resource_id=CASE_REPORT_ID,
            display_name="陈雨 个案报告",
            owner_type="profile",
            owner_id=CHEN_PROFILE_ID,
            origin_at=now,
            expires_at=now + timedelta(days=14),
            can_long_term_preserve=True,
            long_term_authorized_at=None,
            long_term_revoked_at=None,
            destroyed_at=None,
            created_at=now,
            updated_at=now,
        ),
    ])
    database.add_all([
        CalendarSetting(
            id="calendar-settings-demo",
            user_id=DEMO_USER_ID,
            system_calendar_enabled=False,
            privacy_title_mode_enabled=True,
            created_at=now,
            updated_at=now,
        ),
        CalendarEvent(
            id="calendar-event-chen-next",
            user_id=DEMO_USER_ID,
            profile_id=CHEN_PROFILE_ID,
            session_id=None,
            title="陈雨 · 下次咨询",
            privacy_title="咨询提醒",
            category="counseling",
            source_type="profile_next_session",
            start_at=next_client,
            end_at=next_client + timedelta(minutes=50),
            status="pending",
            sync_to_system_calendar=False,
            system_calendar_event_id=None,
            created_at=now,
            updated_at=now,
        ),
        CalendarEvent(
            id="calendar-event-supervision-next",
            user_id=DEMO_USER_ID,
            profile_id="profile-li-cheng",
            session_id=None,
            title="李澄 · 下次督导",
            privacy_title="督导提醒",
            category="supervision_received",
            source_type="profile_next_session",
            start_at=next_supervision,
            end_at=next_supervision + timedelta(minutes=60),
            status="pending",
            sync_to_system_calendar=False,
            system_calendar_event_id=None,
            created_at=now,
            updated_at=now,
        ),
    ])
    database.add(SupervisionConversation(
        id=SUPERVISION_CONVERSATION_ID,
        user_id=DEMO_USER_ID,
        title="陈雨咨询复盘",
        expires_at=now + timedelta(days=14),
        destroyed_at=None,
        created_at=now,
        updated_at=now,
    ))
    database.flush()
    database.add_all([
        SupervisionContextRef(
            id="supervision-context-report",
            conversation_id=SUPERVISION_CONVERSATION_ID,
            resource_type="report",
            resource_id=CASE_REPORT_ID,
            label="陈雨 个案报告",
            created_at=now,
        ),
        SupervisionMessage(
            id="supervision-message-user",
            conversation_id=SUPERVISION_CONVERSATION_ID,
            role="user",
            content="如何区分关系反应和技术选择？",
            generation_status=None,
            citations=[],
            created_at=now,
        ),
        SupervisionMessage(
            id="supervision-message-assistant",
            conversation_id=SUPERVISION_CONVERSATION_ID,
            role="assistant",
            content="先标记咨询现场发生的事实，再分别写下咨询师的情绪反应与技术意图。",
            generation_status="completed",
            citations=[{
                "resource_type": "report",
                "resource_id": CASE_REPORT_ID,
                "label": "陈雨 个案报告",
            }],
            created_at=now,
        ),
        AIJob(
            id="job-recording-demo",
            user_id=DEMO_USER_ID,
            job_type="recording_processing",
            target_type="recording",
            target_id=RECORDING_6_ID,
            status="completed",
            progress=100,
            result_summary={"transcript_id": TRANSCRIPT_6_ID, "summary_id": SUMMARY_6_ID},
            error_code=None,
            error_message=None,
            retryable=False,
            cancel_requested_at=None,
            created_at=now,
            started_at=now,
            finished_at=now,
        ),
    ])
    database.commit()


def ensure_mobile_test_user(database: Session, now: datetime) -> None:
    user = database.get(User, MOBILE_USER_ID)
    if user is None:
        database.add(User(
            id=MOBILE_USER_ID,
            email="user@163.com",
            display_name="测试咨询师",
            password_hash=hash_password("123456"),
            role="user",
            status="active",
            plan_code="free",
            entitlements_json={},
            usage_json={},
            created_at=now,
            updated_at=now,
        ))
        return
    user.email = "user@163.com"
    user.password_hash = hash_password("123456")
    user.role = "user"
    user.status = "active"
    user.plan_code = "free"
    user.entitlements_json = user.entitlements_json or {}
    user.usage_json = user.usage_json or {}
    user.updated_at = now


if __name__ == "__main__":
    from app.db.session import SessionLocal

    with SessionLocal() as session:
        seed_demo_data(session, MinioStorage())
