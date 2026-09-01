from datetime import UTC, datetime
from typing import Annotated, Any
from uuid import uuid4

from fastapi import Depends, FastAPI, Header, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from sqlalchemy import func, or_, select, text
from sqlalchemy.orm import Session as DatabaseSession

from app.api.dependencies import current_user_id
from app.api.errors import ApiError, error_response
from app.api.routes.attachments import create_attachments_router
from app.api.routes.account import create_account_router
from app.api.routes.admin_console import router as admin_console_router
from app.api.routes.admin_config import router as admin_config_router
from app.api.routes.admin_users import router as admin_users_router
from app.api.routes.auth import router as auth_router
from app.api.routes.wechat_auth import router as wechat_auth_router
from app.api.routes.calendar import router as calendar_router
from app.api.routes.files import create_files_router
from app.api.routes.jobs import router as jobs_router
from app.api.routes.privacy import create_privacy_router
from app.api.routes.recordings import create_recordings_router
from app.api.routes.reports import create_reports_router
from app.api.routes.security import router as security_router
from app.api.routes.supervision import router as supervision_router
from app.core.config import DEV_JWT_SECRET, get_settings
from app.db.session import get_db
from app.models import Profile as DatabaseProfile
from app.models import Report
from app.models import SessionRecord
from app.services.calendar import sync_profile_next_session_event
from app.services.ai import RecordingAIProvider
from app.services.profile_codes import (
    assign_missing_profile_codes,
    ensure_profile_code_available,
    normalize_profile_code,
    resolve_profile_code,
)
from app.services.resource_cleanup import cleanup_profile_resources, cleanup_session_resources
from app.services.security import require_profile_access_grant
from app.services.session_ordering import next_session_sequence, resequence_profile_sessions
from app.services.storage import MinioStorage, Storage



def utc_now() -> datetime:
    return datetime.now(UTC)


def iso(value: datetime) -> str:
    return value.isoformat()


class CreateProfileRequest(BaseModel):
    type: str
    name: str = Field(min_length=1, max_length=80)
    code: str | None = Field(default=None, max_length=12)
    status: str | None = None
    crisis_level: str | None = None
    initial_session_count: int = Field(default=0, ge=0)
    next_session_at: datetime | None = None
    metadata: dict[str, Any] = Field(default_factory=dict)
    notes: str = ""


class UpdateProfileRequest(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=80)
    code: str | None = Field(default=None, max_length=12)
    status: str | None = None
    crisis_level: str | None = None
    initial_session_count: int | None = Field(default=None, ge=0)
    next_session_at: datetime | None = None
    metadata: dict[str, Any] | None = None
    notes: str | None = None


class DeleteResourceRequest(BaseModel):
    confirmation_text: str


class CreateSessionRequest(BaseModel):
    session_type: str
    title: str | None = None
    started_at: datetime | None = None
    occurred_at: datetime | None = None
    ended_at: datetime | None = None
    mode: str | None = None
    summary: str = ""
    tags: list[str] = Field(default_factory=list)


class UpdateSessionRequest(BaseModel):
    started_at: datetime | None = None
    occurred_at: datetime | None = None
    ended_at: datetime | None = None
    mode: str | None = None
    summary: str | None = None
    tags: list[str] | None = None


def create_app(
    storage: Storage | None = None,
    recording_ai_provider: RecordingAIProvider | None = None,
    recording_audio_input_mode: str | None = None,
) -> FastAPI:
    settings = get_settings()
    if settings.environment == "production":
        if not settings.jwt_secret_key or settings.jwt_secret_key == DEV_JWT_SECRET:
            raise RuntimeError("生产环境必须通过环境变量 JWT_SECRET_KEY 设置强密钥，不能使用开发默认值或留空。")
        if len(settings.jwt_secret_key) < 32:
            raise RuntimeError("生产环境 JWT_SECRET_KEY 长度不足，至少 32 位。")
    app = FastAPI(title="Counselor Assistant API")
    app.add_middleware(
        CORSMiddleware,
        allow_origins=[
            origin.strip()
            for origin in settings.cors_allow_origins.split(",")
            if origin.strip()
        ],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    app.add_exception_handler(ApiError, error_response)
    storage = storage or MinioStorage()
    recording_audio_input_mode = (
        recording_audio_input_mode or settings.recording_audio_input_mode
    )
    if recording_audio_input_mode not in {"base64", "minio_url"}:
        raise ValueError("录音 AI 输入模式必须是 base64 或 minio_url。")
    app.include_router(auth_router)
    app.include_router(wechat_auth_router)
    app.include_router(admin_console_router)
    app.include_router(admin_config_router)
    app.include_router(admin_users_router)
    app.include_router(security_router)
    app.include_router(calendar_router)
    app.include_router(jobs_router)
    app.include_router(supervision_router)
    app.include_router(create_files_router(storage))
    app.include_router(create_attachments_router(storage))
    app.include_router(create_account_router(storage))
    app.include_router(create_recordings_router(
        storage,
        recording_ai_provider,
        recording_audio_input_mode,
    ))
    app.include_router(create_reports_router(storage))
    app.include_router(create_privacy_router(storage))

    def get_profile(profile_id: str, user_id: str, database: DatabaseSession) -> DatabaseProfile:
        profile = database.scalar(
            select(DatabaseProfile).where(
                DatabaseProfile.id == profile_id,
                DatabaseProfile.user_id == user_id,
            )
        )
        if profile is None:
            raise ApiError(404, "profile_not_found", "档案不存在。")
        return profile

    def require_profile_access(
        profile: DatabaseProfile,
        user_id: str,
        database: DatabaseSession,
        x_profile_access_grant: Annotated[str | None, Header()] = None,
    ) -> None:
        require_profile_access_grant(
            database,
            user_id=user_id,
            profile_type=profile.type,
            raw_grant=x_profile_access_grant,
        )

    @app.get("/api/v1/health")
    def health(
        database: Annotated[DatabaseSession, Depends(get_db)],
    ) -> dict[str, object]:
        try:
            database.execute(text("select 1"))
        except Exception as error:
            raise ApiError(503, "database_unavailable", "数据库服务暂不可用。") from error
        try:
            storage.health_check()
        except Exception as error:
            raise ApiError(503, "object_storage_unavailable", "文件存储服务暂不可用。") from error
        return {
            "status": "ok",
            "service": "counselor-assistant-api",
            "components": {
                "api": "ok",
                "database": "ok",
                "object_storage": "ok",
            },
        }

    @app.post("/api/v1/profiles", status_code=201)
    def create_profile(
        payload: CreateProfileRequest,
        user_id: Annotated[str, Depends(current_user_id)],
        database: Annotated[DatabaseSession, Depends(get_db)],
    ) -> dict[str, Any]:
        now = utc_now()
        profile = DatabaseProfile(
            id=str(uuid4()),
            user_id=user_id,
            type=payload.type,
            name=payload.name,
            status=payload.status,
            crisis_level=payload.crisis_level,
            initial_session_count=payload.initial_session_count,
            code=resolve_profile_code(
                database,
                user_id=user_id,
                profile_type=payload.type,
                requested_code=payload.code,
                now=now,
            ),
            next_session_at=payload.next_session_at,
            metadata_json=payload.metadata,
            notes=payload.notes,
            created_at=now,
            updated_at=now,
        )
        database.add(profile)
        sync_profile_next_session_event(database, profile)
        database.commit()
        return serialize_profile(profile, latest_sequence=0)

    @app.get("/api/v1/profiles")
    def list_profiles(
        user_id: Annotated[str, Depends(current_user_id)],
        database: Annotated[DatabaseSession, Depends(get_db)],
        type: str | None = None,
        keyword: str | None = None,
        status: str | None = None,
        page: Annotated[int, Query(ge=1)] = 1,
        page_size: Annotated[int, Query(ge=1, le=100)] = 20,
    ) -> dict[str, Any]:
        query = select(DatabaseProfile).where(DatabaseProfile.user_id == user_id)
        if type:
            query = query.where(DatabaseProfile.type == type)
        if status:
            query = query.where(DatabaseProfile.status == status)
        if keyword and keyword.strip():
            search = f"%{keyword.strip()}%"
            query = query.where(
                or_(
                    DatabaseProfile.name.ilike(search),
                    DatabaseProfile.code.ilike(search),
                )
            )
        total = database.scalar(select(func.count()).select_from(query.subquery())) or 0
        items = database.scalars(
            query
            .order_by(DatabaseProfile.created_at.desc(), DatabaseProfile.id.desc())
            .offset((page - 1) * page_size)
            .limit(page_size)
        ).all()
        if assign_missing_profile_codes(database, user_id=user_id, profiles=list(items), now=utc_now()):
            database.commit()
        return {
            "items": [
                serialize_profile(
                    profile,
                    latest_sequence=database.scalar(
                        select(func.max(SessionRecord.sequence_no)).where(
                            SessionRecord.profile_id == profile.id,
                            SessionRecord.user_id == user_id,
                        )
                    ) or 0,
                    session_count=database.scalar(
                        select(func.count())
                        .select_from(SessionRecord)
                        .where(
                            SessionRecord.profile_id == profile.id,
                            SessionRecord.user_id == user_id,
                        )
                    ) or 0,
                )
                for profile in items
            ],
            "page": page,
            "page_size": page_size,
            "total": total,
        }

    @app.get("/api/v1/profiles/{profile_id}")
    def profile_detail(
        profile_id: str,
        user_id: Annotated[str, Depends(current_user_id)],
        database: Annotated[DatabaseSession, Depends(get_db)],
        x_profile_access_grant: Annotated[str | None, Header()] = None,
    ) -> dict[str, Any]:
        profile = get_profile(profile_id, user_id, database)
        require_profile_access(profile, user_id, database, x_profile_access_grant)
        sessions_resequenced = resequence_profile_sessions(database, profile=profile, user_id=user_id)
        if assign_missing_profile_codes(database, user_id=user_id, profiles=[profile], now=utc_now()):
            sessions_resequenced = True
        if sessions_resequenced:
            database.commit()
        latest_sequence = database.scalar(
            select(func.max(SessionRecord.sequence_no)).where(
                SessionRecord.profile_id == profile.id,
                SessionRecord.user_id == user_id,
            )
        )
        return serialize_profile(
            profile,
            latest_sequence=latest_sequence or 0,
            session_count=database.scalar(
                select(func.count())
                .select_from(SessionRecord)
                .where(
                    SessionRecord.profile_id == profile.id,
                    SessionRecord.user_id == user_id,
                )
            ) or 0,
        )

    @app.patch("/api/v1/profiles/{profile_id}")
    def update_profile(
        profile_id: str,
        payload: UpdateProfileRequest,
        user_id: Annotated[str, Depends(current_user_id)],
        database: Annotated[DatabaseSession, Depends(get_db)],
        x_profile_access_grant: Annotated[str | None, Header()] = None,
    ) -> dict[str, Any]:
        profile = get_profile(profile_id, user_id, database)
        require_profile_access(profile, user_id, database, x_profile_access_grant)
        field_map = {
            "name": "name",
            "code": "code",
            "status": "status",
            "crisis_level": "crisis_level",
            "initial_session_count": "initial_session_count",
            "next_session_at": "next_session_at",
            "metadata": "metadata_json",
            "notes": "notes",
        }
        for request_field, model_field in field_map.items():
            if request_field in payload.model_fields_set:
                value = getattr(payload, request_field)
                if request_field == "code" and value is not None:
                    value = normalize_profile_code(value)
                    if value is not None:
                        ensure_profile_code_available(
                            database,
                            user_id=user_id,
                            code=value,
                            exclude_profile_id=profile.id,
                        )
                if request_field == "metadata" and value is not None:
                    value = {**(profile.metadata_json or {}), **value}
                setattr(profile, model_field, value)
        profile.updated_at = utc_now()
        sync_profile_next_session_event(database, profile)
        database.commit()
        latest_sequence = database.scalar(
            select(func.max(SessionRecord.sequence_no)).where(
                SessionRecord.profile_id == profile.id,
                SessionRecord.user_id == user_id,
            )
        )
        return serialize_profile(
            profile,
            latest_sequence=latest_sequence or 0,
            session_count=database.scalar(
                select(func.count())
                .select_from(SessionRecord)
                .where(
                    SessionRecord.profile_id == profile.id,
                    SessionRecord.user_id == user_id,
                )
            ) or 0,
        )

    @app.delete("/api/v1/profiles/{profile_id}")
    def delete_profile(
        profile_id: str,
        payload: DeleteResourceRequest,
        user_id: Annotated[str, Depends(current_user_id)],
        database: Annotated[DatabaseSession, Depends(get_db)],
        x_profile_access_grant: Annotated[str | None, Header()] = None,
    ) -> dict[str, Any]:
        if payload.confirmation_text != "删除档案":
            raise ApiError(409, "profile_delete_confirmation_required", "请输入“删除档案”确认。")
        profile = get_profile(profile_id, user_id, database)
        require_profile_access(profile, user_id, database, x_profile_access_grant)
        deleted_counts = cleanup_profile_resources(database, storage, profile=profile)
        database.commit()
        return {
            "deleted": True,
            "deleted_counts": deleted_counts,
        }

    @app.get("/api/v1/profiles/{profile_id}/sessions")
    def list_sessions(
        profile_id: str,
        user_id: Annotated[str, Depends(current_user_id)],
        database: Annotated[DatabaseSession, Depends(get_db)],
        x_profile_access_grant: Annotated[str | None, Header()] = None,
    ) -> dict[str, Any]:
        profile = get_profile(profile_id, user_id, database)
        require_profile_access(profile, user_id, database, x_profile_access_grant)
        if resequence_profile_sessions(database, profile=profile, user_id=user_id):
            database.commit()
        items = database.scalars(
            select(SessionRecord)
            .where(
                SessionRecord.profile_id == profile_id,
                SessionRecord.user_id == user_id,
            )
            .order_by(SessionRecord.occurred_at.desc())
        ).all()
        status_by_session = derive_record_statuses(database, list(items), user_id)
        return {
            "items": [
                serialize_session(session, status_by_session.get(session.id, "pending"))
                for session in items
            ]
        }

    @app.post("/api/v1/profiles/{profile_id}/sessions", status_code=201)
    def create_session(
        profile_id: str,
        payload: CreateSessionRequest,
        user_id: Annotated[str, Depends(current_user_id)],
        database: Annotated[DatabaseSession, Depends(get_db)],
        x_profile_access_grant: Annotated[str | None, Header()] = None,
    ) -> dict[str, Any]:
        profile = database.scalar(
            select(DatabaseProfile)
            .where(
                DatabaseProfile.id == profile_id,
                DatabaseProfile.user_id == user_id,
            )
            .with_for_update()
        )
        if profile is None:
            raise ApiError(404, "profile_not_found", "档案不存在。")
        require_profile_access(profile, user_id, database, x_profile_access_grant)
        expected_session_type = {
            "client": "counseling",
            "supervisor": "supervision_received",
            "supervisee": "supervision_given",
        }.get(profile.type)
        if payload.session_type != expected_session_type:
            raise ApiError(
                422,
                "session_type_profile_mismatch",
                "记录类型与档案身份不匹配。",
            )
        now = utc_now()
        started_at = payload.started_at or payload.occurred_at or now
        if payload.ended_at is not None and payload.ended_at < started_at:
            raise ApiError(422, "session_time_invalid", "结束时间不能早于开始时间。")
        session = SessionRecord(
            id=str(uuid4()),
            user_id=user_id,
            profile_id=profile.id,
            session_type=payload.session_type,
            sequence_no=next_session_sequence(database, profile=profile, user_id=user_id),
            occurred_at=started_at,
            ended_at=payload.ended_at,
            mode=payload.mode,
            summary=payload.summary or payload.title or "",
            tags=payload.tags,
            record_status="pending",
            created_at=now,
            updated_at=now,
        )
        database.add(session)
        database.flush()
        resequence_profile_sessions(database, profile=profile, user_id=user_id)
        database.commit()
        database.refresh(session)
        return serialize_session(session)

    @app.patch("/api/v1/sessions/{session_id}")
    def update_session(
        session_id: str,
        payload: UpdateSessionRequest,
        user_id: Annotated[str, Depends(current_user_id)],
        database: Annotated[DatabaseSession, Depends(get_db)],
        x_profile_access_grant: Annotated[str | None, Header()] = None,
    ) -> dict[str, Any]:
        session = database.scalar(
            select(SessionRecord).where(
                SessionRecord.id == session_id,
                SessionRecord.user_id == user_id,
            )
        )
        if session is None:
            raise ApiError(404, "session_not_found", "记录不存在。")
        profile = get_profile(session.profile_id, user_id, database)
        require_profile_access(profile, user_id, database, x_profile_access_grant)
        started_at = payload.started_at or payload.occurred_at
        if started_at is not None:
            session.occurred_at = started_at
        if "ended_at" in payload.model_fields_set:
            session.ended_at = payload.ended_at
        if session.ended_at is not None and session.ended_at < session.occurred_at:
            raise ApiError(422, "session_time_invalid", "结束时间不能早于开始时间。")
        if "mode" in payload.model_fields_set:
            session.mode = payload.mode
        if payload.summary is not None:
            session.summary = payload.summary
        if payload.tags is not None:
            session.tags = list(dict.fromkeys(payload.tags))[:4]
        session.updated_at = utc_now()
        resequence_profile_sessions(database, profile=profile, user_id=user_id)
        database.commit()
        return serialize_session(
            session,
            derive_record_statuses(database, [session], user_id).get(session.id, "pending"),
        )

    @app.delete("/api/v1/sessions/{session_id}")
    def delete_session(
        session_id: str,
        payload: DeleteResourceRequest,
        user_id: Annotated[str, Depends(current_user_id)],
        database: Annotated[DatabaseSession, Depends(get_db)],
        x_profile_access_grant: Annotated[str | None, Header()] = None,
    ) -> dict[str, Any]:
        if payload.confirmation_text != "删除记录":
            raise ApiError(409, "session_delete_confirmation_required", "请输入“删除记录”确认。")
        session = database.scalar(
            select(SessionRecord).where(
                SessionRecord.id == session_id,
                SessionRecord.user_id == user_id,
            )
        )
        if session is None:
            raise ApiError(404, "session_not_found", "记录不存在。")
        profile = get_profile(session.profile_id, user_id, database)
        require_profile_access(profile, user_id, database, x_profile_access_grant)
        deleted_counts = cleanup_session_resources(database, storage, session=session)
        database.flush()
        resequence_profile_sessions(database, profile=profile, user_id=user_id)
        database.commit()
        return {
            "deleted": True,
            "deleted_counts": deleted_counts,
        }

    return app


def serialize_profile(
    profile: Any,
    latest_sequence: int | None = None,
    session_count: int = 0,
) -> dict[str, Any]:
    return {
        "id": profile.id,
        "type": profile.type,
        "name": profile.name,
        "status": profile.status,
        "crisis_level": profile.crisis_level,
        "initial_session_count": profile.initial_session_count,
        "latest_sequence": latest_sequence if latest_sequence is not None else 0,
        "session_count": session_count,
        "code": getattr(profile, "code", None),
        "next_session_at": iso(profile.next_session_at) if getattr(profile, "next_session_at", None) else None,
        "metadata": getattr(profile, "metadata_json", {}),
        "notes": getattr(profile, "notes", ""),
        "created_at": iso(profile.created_at),
        "updated_at": iso(profile.updated_at),
    }


def derive_record_statuses(
    database: DatabaseSession,
    sessions: list[SessionRecord],
    user_id: str,
) -> dict[str, str]:
    """按真实 Report 记录派生每次咨询的记录状态。

    session.record_status 是写入时固定的静态字段，会与真实报告脱节
    （例如种子数据预置 draft、报告被删除后仍显示已生成）。
    这里统一以 Report 表为准，保证「未生成 / 草稿 / 正式版」与实际情况一致。
    """
    if not sessions:
        return {}
    session_ids = [session.id for session in sessions]
    rows = database.execute(
        select(Report.session_id, Report.formal_saved_at).where(
            Report.user_id == user_id,
            Report.session_id.in_(session_ids),
            Report.destroyed_at.is_(None),
        )
    ).all()
    status_by_session: dict[str, str] = {}
    for session_id, formal_saved_at in rows:
        if not session_id:
            continue
        # 只要有任意一份正式版，就视为已定稿；否则视为草稿
        if formal_saved_at is not None:
            status_by_session[session_id] = "formal"
        elif status_by_session.get(session_id) != "formal":
            status_by_session[session_id] = "draft"
    return status_by_session


def serialize_session(
    session: SessionRecord,
    record_status: str | None = None,
) -> dict[str, Any]:
    return {
        "id": session.id,
        "profile_id": session.profile_id,
        "session_type": session.session_type,
        "sequence_no": session.sequence_no,
        "started_at": iso(session.occurred_at),
        "occurred_at": iso(session.occurred_at),
        "ended_at": iso(session.ended_at) if session.ended_at else None,
        "mode": session.mode,
        "summary": session.summary,
        "tags": session.tags,
        "record_status": record_status or "pending",
        "created_at": iso(session.created_at),
        "updated_at": iso(session.updated_at),
    }


app = create_app()
