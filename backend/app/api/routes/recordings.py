from datetime import datetime, timedelta
from typing import Annotated, Any
from uuid import uuid4

from fastapi import APIRouter, Depends, Header, Query
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.api.dependencies import current_user_id
from app.api.errors import ApiError
from app.db.session import get_db
from app.models import (
    AIJob,
    Profile,
    Recording,
    RecordingDurationEntry,
    RecordingSummary,
    RecordingTranscript,
    SensitiveResource,
    SessionRecord,
    StoredFile,
)
from app.services.ai import BailianAIError, RecordingAIProvider
from app.services.ai.factory import create_recording_ai_provider_from_config
from app.services.files import destroy_file, get_owned_file
from app.services.jobs import complete_job, create_job, fail_job
from app.services.lifecycle import register_sensitive_resource
from app.services.profile_codes import resolve_profile_code
from app.services.security import (
    profile_type_for_recording,
    profile_type_for_summary,
    profile_type_for_transcript,
    require_profile_access_for_type,
)
from app.services.session_ordering import next_session_sequence, resequence_profile_sessions
from app.services.storage import Storage
from app.services.system_config import get_ai_model_config
from app.services.auth import utc_now


class CreateRecordingRequest(BaseModel):
    title: str = Field(min_length=1, max_length=160)
    source_type: str


class BindAudioRequest(BaseModel):
    file_id: str
    duration_seconds: int | None = Field(default=None, gt=0, le=24 * 60 * 60)


class ProcessRecordingRequest(BaseModel):
    mode: str = "generic"
    session_id: str | None = None


class CreateProfileInline(BaseModel):
    name: str = Field(min_length=1, max_length=80)
    code: str | None = Field(default=None, max_length=12)
    status: str | None = "active"
    initial_session_count: int = Field(default=0, ge=0)


class CreateSessionInline(BaseModel):
    started_at: datetime | None = None
    mode: str | None = None
    summary: str = ""


class ArchiveRecordingRequest(BaseModel):
    profile_type: str
    profile_id: str | None = None
    create_profile: CreateProfileInline | None = None
    session_id: str | None = None
    create_session: CreateSessionInline | None = None


class UpdateSpeakerRequest(BaseModel):
    speaker_key: str = Field(min_length=1, max_length=40)
    speaker_label: str = Field(min_length=1, max_length=80)


def upsert_duration_entry(
    database: Session,
    recording: Recording,
    *,
    profile_type: str | None = None,
) -> None:
    if recording.duration_seconds is None:
        return
    entry = database.scalar(
        select(RecordingDurationEntry).where(
            RecordingDurationEntry.recording_id == recording.id,
            RecordingDurationEntry.user_id == recording.user_id,
        )
    )
    now = utc_now()
    if profile_type is None and recording.session_id:
        profile_type = database.scalar(
            select(Profile.type)
            .join(SessionRecord, SessionRecord.profile_id == Profile.id)
            .where(SessionRecord.id == recording.session_id)
        )
    if entry is None:
        database.add(RecordingDurationEntry(
            id=str(uuid4()),
            user_id=recording.user_id,
            recording_id=recording.id,
            source_type=recording.source_type,
            profile_type=profile_type,
            duration_seconds=recording.duration_seconds,
            recorded_at=recording.uploaded_at or recording.created_at,
            created_at=now,
            updated_at=now,
        ))
        return
    entry.source_type = recording.source_type
    entry.profile_type = profile_type or entry.profile_type
    entry.duration_seconds = recording.duration_seconds
    entry.recorded_at = recording.uploaded_at or recording.created_at
    entry.updated_at = now


class UpdateSegmentRequest(BaseModel):
    text: str = Field(min_length=1)


class UpdateSummaryRequest(BaseModel):
    main_summary: str = Field(min_length=1)
    chapter_overview: list[dict[str, Any]] = Field(default_factory=list)


class RegenerateSummaryRequest(BaseModel):
    confirm_overwrite: bool = False


def get_recording(database: Session, recording_id: str, user_id: str) -> Recording:
    recording = database.scalar(
        select(Recording).where(Recording.id == recording_id, Recording.user_id == user_id)
    )
    if recording is None:
        raise ApiError(404, "recording_not_found", "录音不存在。")
    return recording


def serialize_recording(database: Session, recording: Recording) -> dict[str, object]:
    profile = None
    session = None
    if recording.session_id:
        session = database.scalar(
            select(SessionRecord).where(SessionRecord.id == recording.session_id)
        )
        if session:
            profile = database.scalar(select(Profile).where(Profile.id == session.profile_id))
    return {
        "id": recording.id,
        "title": recording.title,
        "source_type": recording.source_type,
        "duration_seconds": recording.duration_seconds,
        "archive_status": recording.archive_status,
        "ai_status": recording.ai_status,
        "processing_error": recording.processing_error,
        "audio_file_id": recording.audio_file_id,
        "audio_expires_at": (
            recording.audio_expires_at.isoformat() if recording.audio_expires_at else None
        ),
        "audio_destroyed_at": (
            recording.audio_destroyed_at.isoformat() if recording.audio_destroyed_at else None
        ),
        "session": (
            {"id": session.id, "sequence_no": session.sequence_no, "session_type": session.session_type}
            if session
            else None
        ),
        "profile": (
            {"id": profile.id, "name": profile.name, "type": profile.type}
            if profile
            else None
        ),
        "created_at": recording.created_at.isoformat(),
        "updated_at": recording.updated_at.isoformat(),
    }


def process_recording(
    database: Session,
    recording: Recording,
    *,
    user_id: str,
    allow_overwrite: bool,
    storage: Storage,
    provider: RecordingAIProvider,
    audio_input_mode: str,
) -> AIJob:
    if (
        recording.audio_file_id is None
        or recording.audio_destroyed_at is not None
        or (recording.audio_expires_at and recording.audio_expires_at <= utc_now())
    ):
        raise ApiError(400, "recording_audio_destroyed", "原始录音已销毁或过期，无法生成。")
    existing = database.scalar(
        select(AIJob).where(
            AIJob.user_id == user_id,
            AIJob.target_type == "recording",
            AIJob.target_id == recording.id,
            AIJob.job_type == "recording_processing",
            AIJob.status.in_(("running", "completed")),
        ).order_by(AIJob.created_at.desc())
    )
    if existing is not None and not allow_overwrite:
        raise ApiError(409, "job_already_running", "该录音已有处理任务或已处理完成。")

    job = create_job(
        database,
        user_id=user_id,
        job_type="recording_processing",
        target_type="recording",
        target_id=recording.id,
    )
    recording.ai_status = "processing"
    recording.processing_error = None
    stored_file = get_owned_file(database, recording.audio_file_id, user_id)
    if not stored_file.storage_key:
        raise ApiError(409, "recording_file_unavailable", "录音文件字节不可用。")
    audio_bytes = None
    audio_url = None
    if audio_input_mode == "minio_url":
        audio_url = storage.create_download_url(stored_file.storage_key)
    else:
        audio_bytes = storage.read_object(stored_file.storage_key)
    try:
        result = provider.process_recording(
            title=recording.title,
            duration_seconds=recording.duration_seconds or 60,
            audio_bytes=audio_bytes,
            audio_url=audio_url,
            mime_type=stored_file.mime_type,
        )
    except ValueError as error:
        recording.ai_status = "failed"
        recording.processing_error = str(error)
        fail_job(
            database,
            job,
            code="recording_ai_input_invalid",
            message=str(error),
            retryable=False,
        )
        database.commit()
        raise ApiError(422, "recording_ai_input_invalid", str(error)) from error
    except BailianAIError as error:
        recording.ai_status = "failed"
        recording.processing_error = str(error)
        fail_job(
            database,
            job,
            code="recording_ai_service_failed",
            message=str(error),
            retryable=True,
        )
        database.commit()
        raise ApiError(502, "recording_ai_service_failed", str(error)) from error
    now = utc_now()
    expires_at = now + timedelta(days=14)
    transcript = database.scalar(
        select(RecordingTranscript).where(
            RecordingTranscript.recording_id == recording.id
        )
    )
    segments = [
        {
            "id": str(uuid4()),
            **segment,
            "speaker_label": result.speakers[str(segment["speaker_key"])],
        }
        for segment in result.segments
    ]
    if transcript is None:
        transcript = RecordingTranscript(
            id=str(uuid4()),
            user_id=user_id,
            recording_id=recording.id,
            speakers_json=result.speakers,
            segments_json=segments,
            manual_edited=False,
            generated_at=now,
            expires_at=expires_at,
            destroyed_at=None,
            created_at=now,
            updated_at=now,
        )
        database.add(transcript)
    else:
        transcript.speakers_json = result.speakers
        transcript.segments_json = segments
        transcript.manual_edited = False
        transcript.generated_at = now
        transcript.expires_at = expires_at
        transcript.destroyed_at = None
        transcript.updated_at = now
    summary = database.scalar(
        select(RecordingSummary).where(RecordingSummary.recording_id == recording.id)
    )
    if summary is None:
        summary = RecordingSummary(
            id=str(uuid4()),
            user_id=user_id,
            recording_id=recording.id,
            main_summary=result.summary,
            chapter_overview=result.chapters,
            manual_edited=False,
            generated_at=now,
            expires_at=expires_at,
            destroyed_at=None,
            created_at=now,
            updated_at=now,
        )
        database.add(summary)
    else:
        summary.main_summary = result.summary
        summary.chapter_overview = result.chapters
        summary.manual_edited = False
        summary.generated_at = now
        summary.expires_at = expires_at
        summary.destroyed_at = None
        summary.updated_at = now
    database.flush()
    register_sensitive_resource(
        database,
        user_id=user_id,
        resource_type="transcript",
        resource_id=transcript.id,
        display_name=f"{recording.title} 转写",
        expires_at=expires_at,
        can_long_term_preserve=True,
        owner_type="recording",
        owner_id=recording.id,
    )
    register_sensitive_resource(
        database,
        user_id=user_id,
        resource_type="recording_summary",
        resource_id=summary.id,
        display_name=f"{recording.title} 纪要",
        expires_at=expires_at,
        can_long_term_preserve=True,
        owner_type="recording",
        owner_id=recording.id,
    )
    recording.ai_status = "completed"
    recording.processing_error = None
    recording.updated_at = now
    complete_job(
        database,
        job,
        {"transcript_id": transcript.id, "summary_id": summary.id},
    )
    database.commit()
    return job


def regenerate_recording_summary(
    database: Session,
    recording: Recording,
    *,
    user_id: str,
    provider: RecordingAIProvider,
) -> AIJob:
    transcript = database.scalar(
        select(RecordingTranscript).where(
            RecordingTranscript.recording_id == recording.id,
            RecordingTranscript.user_id == user_id,
            RecordingTranscript.destroyed_at.is_(None),
        )
    )
    if transcript is None:
        raise ApiError(404, "transcript_not_found", "转写尚未生成或已销毁。")
    transcript_text = "\n".join(
        f"{segment.get('speaker_label', segment.get('speaker_key', '发言人'))}："
        f"{str(segment.get('text', '')).strip()}"
        for segment in transcript.segments_json
        if str(segment.get("text", "")).strip()
    )
    job = create_job(
        database,
        user_id=user_id,
        job_type="recording_summary_regeneration",
        target_type="recording",
        target_id=recording.id,
    )
    try:
        result = provider.summarize_transcript(
            title=recording.title,
            duration_seconds=recording.duration_seconds or 60,
            transcript=transcript_text,
        )
    except ValueError as error:
        fail_job(
            database,
            job,
            code="recording_summary_input_invalid",
            message=str(error),
            retryable=False,
        )
        database.commit()
        raise ApiError(422, "recording_summary_input_invalid", str(error)) from error
    except BailianAIError as error:
        fail_job(
            database,
            job,
            code="recording_ai_service_failed",
            message=str(error),
            retryable=True,
        )
        database.commit()
        raise ApiError(502, "recording_ai_service_failed", str(error)) from error

    now = utc_now()
    summary = database.scalar(
        select(RecordingSummary).where(RecordingSummary.recording_id == recording.id)
    )
    if summary is None:
        summary = RecordingSummary(
            id=str(uuid4()),
            user_id=user_id,
            recording_id=recording.id,
            main_summary=result.summary,
            chapter_overview=result.chapters,
            manual_edited=False,
            generated_at=now,
            expires_at=transcript.expires_at,
            destroyed_at=None,
            created_at=now,
            updated_at=now,
        )
        database.add(summary)
    else:
        summary.main_summary = result.summary
        summary.chapter_overview = result.chapters
        summary.manual_edited = False
        summary.generated_at = now
        summary.expires_at = transcript.expires_at
        summary.destroyed_at = None
        summary.updated_at = now
    database.flush()
    register_sensitive_resource(
        database,
        user_id=user_id,
        resource_type="recording_summary",
        resource_id=summary.id,
        display_name=f"{recording.title} 纪要",
        expires_at=summary.expires_at,
        can_long_term_preserve=True,
        owner_type="recording",
        owner_id=recording.id,
    )
    complete_job(database, job, {"summary_id": summary.id})
    database.commit()
    return job


def create_recordings_router(
    storage: Storage,
    recording_ai_provider: RecordingAIProvider | None,
    recording_audio_input_mode: str | None,
) -> APIRouter:
    router = APIRouter(prefix="/api/v1", tags=["recordings"])

    def require_recording_access(
        database: Session,
        *,
        recording_id: str,
        user_id: str,
        raw_grant: str | None,
    ) -> None:
        require_profile_access_for_type(
            database,
            user_id=user_id,
            profile_type=profile_type_for_recording(
                database,
                user_id=user_id,
                recording_id=recording_id,
            ),
            raw_grant=raw_grant,
        )

    def ai_runtime(database: Session) -> tuple[RecordingAIProvider, str]:
        if recording_ai_provider is not None:
            return recording_ai_provider, recording_audio_input_mode or "base64"
        config = get_ai_model_config(database)
        if config.audio_input_mode not in {"base64", "minio_url"}:
            raise ApiError(422, "audio_input_mode_invalid", "不支持的音频输入模式。")
        try:
            return create_recording_ai_provider_from_config(config), config.audio_input_mode
        except ValueError as error:
            raise ApiError(422, "ai_provider_invalid", str(error)) from error

    @router.get("/recordings")
    def list_recordings(
        user_id: Annotated[str, Depends(current_user_id)],
        database: Annotated[Session, Depends(get_db)],
        archive_status: str | None = None,
        ai_status: str | None = None,
        keyword: str | None = None,
        page: Annotated[int, Query(ge=1)] = 1,
        page_size: Annotated[int, Query(ge=1, le=100)] = 20,
    ) -> dict[str, object]:
        query = select(Recording).where(Recording.user_id == user_id)
        if archive_status:
            query = query.where(Recording.archive_status == archive_status)
        if ai_status:
            query = query.where(Recording.ai_status == ai_status)
        if keyword:
            query = query.where(Recording.title.ilike(f"%{keyword.strip()}%"))
        total = database.scalar(select(func.count()).select_from(query.subquery())) or 0
        items = database.scalars(
            query.order_by(Recording.created_at.desc(), Recording.id.desc())
            .offset((page - 1) * page_size)
            .limit(page_size)
        ).all()
        return {
            "items": [serialize_recording(database, item) for item in items],
            "page": page,
            "page_size": page_size,
            "total": total,
        }

    @router.get("/recordings/{recording_id}/status")
    def get_recording_status(
        recording_id: str,
        user_id: Annotated[str, Depends(current_user_id)],
        database: Annotated[Session, Depends(get_db)],
    ) -> dict[str, object]:
        """归档完成页轮询用的轻量状态。

        只返回状态字段，不返回转写正文与纪要内容，
        避免前端几秒一次轮询时拉取整张转写表。
        """
        recording = get_recording(database, recording_id, user_id)
        transcript = database.scalar(
            select(RecordingTranscript).where(
                RecordingTranscript.recording_id == recording.id,
                RecordingTranscript.destroyed_at.is_(None),
            )
        )
        summary = database.scalar(
            select(RecordingSummary).where(
                RecordingSummary.recording_id == recording.id,
                RecordingSummary.destroyed_at.is_(None),
            )
        )
        return {
            "recording_id": recording.id,
            "archive_status": recording.archive_status,
            "ai_status": recording.ai_status,
            "processing_error": recording.processing_error,
            "audio_ready": bool(recording.audio_file_id) and recording.audio_destroyed_at is None,
            "transcript_ready": transcript is not None,
            "summary_ready": summary is not None,
            "updated_at": recording.updated_at.isoformat(),
        }

    @router.post("/recordings", status_code=201)
    def create_recording(
        payload: CreateRecordingRequest,
        user_id: Annotated[str, Depends(current_user_id)],
        database: Annotated[Session, Depends(get_db)],
    ) -> dict[str, object]:
        if payload.source_type not in {"in_app_recording", "uploaded_audio"}:
            raise ApiError(422, "recording_source_type_invalid", "不支持的录音来源。")
        now = utc_now()
        recording = Recording(
            id=str(uuid4()),
            user_id=user_id,
            session_id=None,
            title=payload.title.strip(),
            source_type=payload.source_type,
            audio_file_id=None,
            duration_seconds=None,
            archive_status="unarchived",
            ai_status="pending",
            processing_error=None,
            uploaded_at=None,
            audio_expires_at=None,
            audio_destroyed_at=None,
            created_at=now,
            updated_at=now,
        )
        database.add(recording)
        database.commit()
        return serialize_recording(database, recording)

    @router.post("/recordings/{recording_id}/audio")
    def bind_audio(
        recording_id: str,
        payload: BindAudioRequest,
        user_id: Annotated[str, Depends(current_user_id)],
        database: Annotated[Session, Depends(get_db)],
    ) -> dict[str, object]:
        recording = get_recording(database, recording_id, user_id)
        stored_file = get_owned_file(database, payload.file_id, user_id)
        if stored_file.upload_status != "uploaded" or stored_file.destroyed_at is not None:
            raise ApiError(409, "file_not_uploaded", "音频文件尚未上传完成。")
        if stored_file.purpose != "recording" or not stored_file.mime_type.startswith("audio/"):
            raise ApiError(422, "recording_file_invalid", "录音只能绑定已上传的音频文件。")
        if recording.audio_file_id and recording.audio_file_id != stored_file.id:
            raise ApiError(409, "recording_audio_already_bound", "该录音已绑定音频文件。")
        now = utc_now()
        expires_at = now + timedelta(days=14)
        recording.audio_file_id = stored_file.id
        recording.duration_seconds = payload.duration_seconds
        recording.uploaded_at = now
        recording.audio_expires_at = expires_at
        recording.updated_at = now
        upsert_duration_entry(database, recording)
        stored_file.expires_at = expires_at
        stored_file.can_long_term_preserve = False
        register_sensitive_resource(
            database,
            user_id=user_id,
            resource_type="audio",
            resource_id=recording.id,
            display_name=recording.title,
            expires_at=expires_at,
            can_long_term_preserve=False,
            owner_type="recording",
            owner_id=recording.id,
        )
        database.commit()
        return {
            "audio_expires_at": expires_at.isoformat(),
            "can_long_term_preserve_audio": False,
        }

    @router.get("/recording-duration-statistics")
    def recording_duration_statistics(
        user_id: Annotated[str, Depends(current_user_id)],
        database: Annotated[Session, Depends(get_db)],
    ) -> dict[str, object]:
        rows = database.execute(
            select(
                RecordingDurationEntry.profile_type,
                func.count(RecordingDurationEntry.id),
                func.coalesce(func.sum(RecordingDurationEntry.duration_seconds), 0),
            )
            .where(RecordingDurationEntry.user_id == user_id)
            .group_by(RecordingDurationEntry.profile_type)
        ).all()
        items = [
            {"profile_type": profile_type, "count": count, "duration_seconds": int(seconds or 0)}
            for profile_type, count, seconds in rows
        ]
        return {
            "total_seconds": sum(item["duration_seconds"] for item in items),
            "items": items,
        }

    @router.post("/recordings/{recording_id}/processing", status_code=202)
    def start_processing(
        recording_id: str,
        payload: ProcessRecordingRequest,
        user_id: Annotated[str, Depends(current_user_id)],
        database: Annotated[Session, Depends(get_db)],
    ) -> dict[str, object]:
        if payload.mode not in {"generic", "archived_context"}:
            raise ApiError(422, "processing_mode_invalid", "不支持的处理模式。")
        recording = get_recording(database, recording_id, user_id)
        provider, audio_input_mode = ai_runtime(database)
        job = process_recording(
            database,
            recording,
            user_id=user_id,
            allow_overwrite=False,
            storage=storage,
            provider=provider,
            audio_input_mode=audio_input_mode,
        )
        return {"job_id": job.id, "status": job.status}

    @router.post("/recordings/{recording_id}/processing/retry", status_code=202)
    def retry_processing(
        recording_id: str,
        user_id: Annotated[str, Depends(current_user_id)],
        database: Annotated[Session, Depends(get_db)],
    ) -> dict[str, object]:
        recording = get_recording(database, recording_id, user_id)
        provider, audio_input_mode = ai_runtime(database)
        job = process_recording(
            database,
            recording,
            user_id=user_id,
            allow_overwrite=True,
            storage=storage,
            provider=provider,
            audio_input_mode=audio_input_mode,
        )
        return {"job_id": job.id, "status": job.status}

    @router.post("/recordings/{recording_id}/archive")
    def archive_recording(
        recording_id: str,
        payload: ArchiveRecordingRequest,
        user_id: Annotated[str, Depends(current_user_id)],
        database: Annotated[Session, Depends(get_db)],
    ) -> dict[str, object]:
        recording = get_recording(database, recording_id, user_id)
        if recording.session_id:
            session = database.scalar(
                select(SessionRecord).where(SessionRecord.id == recording.session_id)
            )
            profile = database.scalar(select(Profile).where(Profile.id == session.profile_id))
            return {
                "recording_id": recording.id,
                "profile_id": profile.id,
                "session_id": session.id,
                "sequence_no": session.sequence_no,
                "recommended_speaker_roles": recommended_roles(profile.type),
            }
        if bool(payload.profile_id) == bool(payload.create_profile):
            raise ApiError(
                422,
                "archive_profile_choice_invalid",
                "请选择已有档案或提供新档案信息。",
            )
        if payload.create_profile:
            now = utc_now()
            profile = Profile(
                id=str(uuid4()),
                user_id=user_id,
                type=payload.profile_type,
                name=payload.create_profile.name.strip(),
                code=resolve_profile_code(
                    database,
                    user_id=user_id,
                    profile_type=payload.profile_type,
                    requested_code=payload.create_profile.code,
                    now=now,
                ),
                status=payload.create_profile.status,
                crisis_level=None,
                initial_session_count=payload.create_profile.initial_session_count,
                next_session_at=None,
                metadata_json={},
                notes="",
                created_at=now,
                updated_at=now,
            )
            database.add(profile)
            database.flush()
        else:
            profile = database.scalar(
                select(Profile)
                .where(Profile.id == payload.profile_id, Profile.user_id == user_id)
                .with_for_update()
            )
            if profile is None:
                raise ApiError(404, "profile_not_found", "档案不存在。")
        if profile.type != payload.profile_type:
            raise ApiError(422, "archive_profile_type_mismatch", "归档类型与档案身份不匹配。")

        if payload.session_id:
            session = database.scalar(
                select(SessionRecord).where(
                    SessionRecord.id == payload.session_id,
                    SessionRecord.user_id == user_id,
                    SessionRecord.profile_id == profile.id,
                )
            )
            if session is None:
                raise ApiError(404, "session_not_found", "记录不存在。")
        else:
            now = utc_now()
            inline = payload.create_session or CreateSessionInline()
            started_at = inline.started_at or now
            session = SessionRecord(
                id=str(uuid4()),
                user_id=user_id,
                profile_id=profile.id,
                session_type=session_type_for_profile(profile.type),
                sequence_no=next_session_sequence(database, profile=profile, user_id=user_id),
                occurred_at=started_at,
                ended_at=None,
                mode=inline.mode,
                summary=inline.summary,
                tags=[],
                record_status="pending",
                created_at=now,
                updated_at=now,
            )
            database.add(session)
            database.flush()
            resequence_profile_sessions(database, profile=profile, user_id=user_id)
        recording.session_id = session.id
        recording.archive_status = "archived"
        recording.updated_at = utc_now()
        upsert_duration_entry(database, recording, profile_type=profile.type)
        try:
            database.commit()
            database.refresh(session)
        except IntegrityError as exc:
            database.rollback()
            raise ApiError(409, "session_recording_already_exists", "该次记录已有录音。") from exc
        return {
            "recording_id": recording.id,
            "profile_id": profile.id,
            "session_id": session.id,
            "sequence_no": session.sequence_no,
            "recommended_speaker_roles": recommended_roles(profile.type),
        }

    @router.get("/recordings/{recording_id}/transcript")
    def get_transcript(
        recording_id: str,
        user_id: Annotated[str, Depends(current_user_id)],
        database: Annotated[Session, Depends(get_db)],
        x_profile_access_grant: Annotated[str | None, Header()] = None,
    ) -> dict[str, object]:
        get_recording(database, recording_id, user_id)
        require_recording_access(
            database,
            recording_id=recording_id,
            user_id=user_id,
            raw_grant=x_profile_access_grant,
        )
        transcript = database.scalar(
            select(RecordingTranscript).where(
                RecordingTranscript.recording_id == recording_id,
                RecordingTranscript.user_id == user_id,
                RecordingTranscript.destroyed_at.is_(None),
            )
        )
        if transcript is None:
            raise ApiError(404, "transcript_not_found", "转写尚未生成或已销毁。")
        return serialize_transcript(database, transcript)

    @router.patch("/recordings/{recording_id}/speakers")
    def update_speaker(
        recording_id: str,
        payload: UpdateSpeakerRequest,
        user_id: Annotated[str, Depends(current_user_id)],
        database: Annotated[Session, Depends(get_db)],
        x_profile_access_grant: Annotated[str | None, Header()] = None,
    ) -> dict[str, object]:
        get_recording(database, recording_id, user_id)
        require_recording_access(
            database,
            recording_id=recording_id,
            user_id=user_id,
            raw_grant=x_profile_access_grant,
        )
        transcript = database.scalar(
            select(RecordingTranscript).where(
                RecordingTranscript.recording_id == recording_id,
                RecordingTranscript.user_id == user_id,
                RecordingTranscript.destroyed_at.is_(None),
            )
        )
        if transcript is None:
            raise ApiError(404, "transcript_not_found", "转写尚未生成或已销毁。")
        if payload.speaker_key not in transcript.speakers_json:
            raise ApiError(404, "speaker_not_found", "发言人不存在。")
        speakers = dict(transcript.speakers_json)
        speakers[payload.speaker_key] = payload.speaker_label.strip()
        transcript.speakers_json = speakers
        transcript.segments_json = [
            {
                **segment,
                "speaker_label": (
                    payload.speaker_label.strip()
                    if segment["speaker_key"] == payload.speaker_key
                    else segment["speaker_label"]
                ),
            }
            for segment in transcript.segments_json
        ]
        transcript.manual_edited = True
        transcript.updated_at = utc_now()
        database.commit()
        return serialize_transcript(database, transcript)

    @router.patch("/transcript-segments/{segment_id}")
    def update_segment(
        segment_id: str,
        payload: UpdateSegmentRequest,
        user_id: Annotated[str, Depends(current_user_id)],
        database: Annotated[Session, Depends(get_db)],
        x_profile_access_grant: Annotated[str | None, Header()] = None,
    ) -> dict[str, object]:
        transcripts = database.scalars(
            select(RecordingTranscript).where(
                RecordingTranscript.user_id == user_id,
                RecordingTranscript.destroyed_at.is_(None),
            )
        ).all()
        for transcript in transcripts:
            for index, segment in enumerate(transcript.segments_json):
                if segment["id"] == segment_id:
                    require_profile_access_for_type(
                        database,
                        user_id=user_id,
                        profile_type=profile_type_for_transcript(
                            database,
                            user_id=user_id,
                            transcript=transcript,
                        ),
                        raw_grant=x_profile_access_grant,
                    )
                    segments = list(transcript.segments_json)
                    updated = {**segment, "text": payload.text.strip()}
                    segments[index] = updated
                    transcript.segments_json = segments
                    transcript.manual_edited = True
                    transcript.updated_at = utc_now()
                    database.commit()
                    return updated
        raise ApiError(404, "transcript_segment_not_found", "转写分段不存在。")

    @router.get("/recordings/{recording_id}/summary")
    def get_summary(
        recording_id: str,
        user_id: Annotated[str, Depends(current_user_id)],
        database: Annotated[Session, Depends(get_db)],
        x_profile_access_grant: Annotated[str | None, Header()] = None,
    ) -> dict[str, object]:
        get_recording(database, recording_id, user_id)
        require_recording_access(
            database,
            recording_id=recording_id,
            user_id=user_id,
            raw_grant=x_profile_access_grant,
        )
        summary = database.scalar(
            select(RecordingSummary).where(
                RecordingSummary.recording_id == recording_id,
                RecordingSummary.user_id == user_id,
                RecordingSummary.destroyed_at.is_(None),
            )
        )
        if summary is None:
            raise ApiError(404, "recording_summary_not_found", "录音纪要尚未生成或已销毁。")
        return serialize_summary(database, summary)

    @router.patch("/recordings/{recording_id}/summary")
    def update_summary(
        recording_id: str,
        payload: UpdateSummaryRequest,
        user_id: Annotated[str, Depends(current_user_id)],
        database: Annotated[Session, Depends(get_db)],
        x_profile_access_grant: Annotated[str | None, Header()] = None,
    ) -> dict[str, object]:
        get_recording(database, recording_id, user_id)
        require_recording_access(
            database,
            recording_id=recording_id,
            user_id=user_id,
            raw_grant=x_profile_access_grant,
        )
        summary = database.scalar(
            select(RecordingSummary).where(
                RecordingSummary.recording_id == recording_id,
                RecordingSummary.user_id == user_id,
                RecordingSummary.destroyed_at.is_(None),
            )
        )
        if summary is None:
            raise ApiError(404, "recording_summary_not_found", "录音纪要尚未生成或已销毁。")
        summary.main_summary = payload.main_summary.strip()
        summary.chapter_overview = payload.chapter_overview
        summary.manual_edited = True
        summary.updated_at = utc_now()
        database.commit()
        return serialize_summary(database, summary)

    @router.post("/recordings/{recording_id}/summary/regenerate", status_code=202)
    def regenerate_summary(
        recording_id: str,
        payload: RegenerateSummaryRequest,
        user_id: Annotated[str, Depends(current_user_id)],
        database: Annotated[Session, Depends(get_db)],
        x_profile_access_grant: Annotated[str | None, Header()] = None,
    ) -> dict[str, object]:
        recording = get_recording(database, recording_id, user_id)
        require_recording_access(
            database,
            recording_id=recording_id,
            user_id=user_id,
            raw_grant=x_profile_access_grant,
        )
        summary = database.scalar(
            select(RecordingSummary).where(RecordingSummary.recording_id == recording.id)
        )
        transcript = database.scalar(
            select(RecordingTranscript).where(RecordingTranscript.recording_id == recording.id)
        )
        if summary and summary.manual_edited and not payload.confirm_overwrite:
            raise ApiError(
                409,
                "manual_edits_overwrite_confirmation_required",
                "当前纪要包含人工修改，重新生成前需要确认覆盖。",
            )
        provider, _ = ai_runtime(database)
        job = regenerate_recording_summary(
            database,
            recording,
            user_id=user_id,
            provider=provider,
        )
        return {"job_id": job.id, "status": job.status}

    @router.delete("/recordings/{recording_id}")
    def delete_recording_audio(
        recording_id: str,
        user_id: Annotated[str, Depends(current_user_id)],
        database: Annotated[Session, Depends(get_db)],
        x_profile_access_grant: Annotated[str | None, Header()] = None,
    ) -> dict[str, bool]:
        recording = get_recording(database, recording_id, user_id)
        require_recording_access(
            database,
            recording_id=recording_id,
            user_id=user_id,
            raw_grant=x_profile_access_grant,
        )
        if recording.audio_file_id:
            stored_file = get_owned_file(database, recording.audio_file_id, user_id)
            if stored_file.destroyed_at is None:
                destroy_file(database, storage, stored_file)
        recording.audio_destroyed_at = utc_now()
        recording.audio_file_id = None
        resource = database.scalar(
            select(SensitiveResource).where(
                SensitiveResource.resource_type == "audio",
                SensitiveResource.resource_id == recording.id,
            )
        )
        if resource:
            resource.destroyed_at = utc_now()
            resource.updated_at = utc_now()
        database.commit()
        return {"deleted": True}

    @router.delete("/recording-transcripts/{transcript_id}")
    def delete_transcript(
        transcript_id: str,
        user_id: Annotated[str, Depends(current_user_id)],
        database: Annotated[Session, Depends(get_db)],
        x_profile_access_grant: Annotated[str | None, Header()] = None,
    ) -> dict[str, bool]:
        transcript = database.scalar(
            select(RecordingTranscript).where(
                RecordingTranscript.id == transcript_id,
                RecordingTranscript.user_id == user_id,
            )
        )
        if transcript is None:
            raise ApiError(404, "transcript_not_found", "转写不存在。")
        require_profile_access_for_type(
            database,
            user_id=user_id,
            profile_type=profile_type_for_transcript(
                database,
                user_id=user_id,
                transcript=transcript,
            ),
            raw_grant=x_profile_access_grant,
        )
        transcript.segments_json = []
        transcript.speakers_json = {}
        transcript.destroyed_at = utc_now()
        database.commit()
        return {"deleted": True}

    @router.delete("/recording-summaries/{summary_id}")
    def delete_summary(
        summary_id: str,
        user_id: Annotated[str, Depends(current_user_id)],
        database: Annotated[Session, Depends(get_db)],
        x_profile_access_grant: Annotated[str | None, Header()] = None,
    ) -> dict[str, bool]:
        summary = database.scalar(
            select(RecordingSummary).where(
                RecordingSummary.id == summary_id,
                RecordingSummary.user_id == user_id,
            )
        )
        if summary is None:
            raise ApiError(404, "recording_summary_not_found", "录音纪要不存在。")
        require_profile_access_for_type(
            database,
            user_id=user_id,
            profile_type=profile_type_for_summary(
                database,
                user_id=user_id,
                summary=summary,
            ),
            raw_grant=x_profile_access_grant,
        )
        summary.main_summary = ""
        summary.chapter_overview = []
        summary.destroyed_at = utc_now()
        database.commit()
        return {"deleted": True}

    return router


def session_type_for_profile(profile_type: str) -> str:
    mapping = {
        "client": "counseling",
        "supervisor": "supervision_received",
        "supervisee": "supervision_given",
    }
    try:
        return mapping[profile_type]
    except KeyError as exc:
        raise ApiError(422, "profile_type_invalid", "不支持的档案类型。") from exc


def recommended_roles(profile_type: str) -> list[str]:
    return {
        "client": ["咨询师", "来访者"],
        "supervisor": ["咨询师", "督导师"],
        "supervisee": ["咨询师", "受督者"],
    }[profile_type]


def serialize_transcript(
    database: Session,
    transcript: RecordingTranscript,
) -> dict[str, object]:
    resource = database.scalar(
        select(SensitiveResource).where(
            SensitiveResource.resource_type == "transcript",
            SensitiveResource.resource_id == transcript.id,
        )
    )
    return {
        "transcript_id": transcript.id,
        "recording_id": transcript.recording_id,
        "expires_at": transcript.expires_at.isoformat(),
        "long_term_authorized_at": (
            resource.long_term_authorized_at.isoformat()
            if resource and resource.long_term_authorized_at
            else None
        ),
        "manual_edited": transcript.manual_edited,
        "speakers": transcript.speakers_json,
        "segments": sorted(transcript.segments_json, key=lambda item: item["start_ms"]),
    }


def serialize_summary(database: Session, summary: RecordingSummary) -> dict[str, object]:
    resource = database.scalar(
        select(SensitiveResource).where(
            SensitiveResource.resource_type == "recording_summary",
            SensitiveResource.resource_id == summary.id,
        )
    )
    return {
        "summary_id": summary.id,
        "recording_id": summary.recording_id,
        "main_summary": summary.main_summary,
        "chapter_overview": summary.chapter_overview,
        "manual_edited": summary.manual_edited,
        "expires_at": summary.expires_at.isoformat(),
        "long_term_authorized_at": (
            resource.long_term_authorized_at.isoformat()
            if resource and resource.long_term_authorized_at
            else None
        ),
    }
