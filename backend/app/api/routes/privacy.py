from datetime import timedelta
from typing import Annotated

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.api.dependencies import current_user_id
from app.api.errors import ApiError
from app.db.session import get_db
from app.models import (
    Recording,
    RecordingSummary,
    RecordingTranscript,
    Report,
    SensitiveResource,
    SupervisionConversation,
)
from app.services.auth import utc_now
from app.services.files import destroy_file, get_owned_file
from app.services.lifecycle import destroy_supervision_conversation, serialize_sensitive_resource
from app.services.storage import Storage


class AuthorizeRequest(BaseModel):
    confirm_understanding: bool


class DeleteSensitiveRequest(BaseModel):
    confirmation_text: str


def get_resource(database: Session, resource_id: str, user_id: str) -> SensitiveResource:
    resource = database.scalar(
        select(SensitiveResource).where(
            SensitiveResource.id == resource_id,
            SensitiveResource.user_id == user_id,
            SensitiveResource.destroyed_at.is_(None),
        )
    )
    if resource is None:
        raise ApiError(404, "sensitive_resource_not_found", "敏感资料不存在。")
    return resource


def destroy_sensitive_content(
    database: Session,
    storage: Storage,
    resource: SensitiveResource,
) -> None:
    now = utc_now()
    if resource.resource_type == "audio":
        recording = database.scalar(
            select(Recording).where(
                Recording.id == resource.resource_id,
                Recording.user_id == resource.user_id,
            )
        )
        if recording and recording.audio_file_id:
            stored_file = get_owned_file(database, recording.audio_file_id, resource.user_id)
            if stored_file.destroyed_at is None:
                destroy_file(database, storage, stored_file)
            recording.audio_file_id = None
            recording.audio_destroyed_at = now
    elif resource.resource_type == "transcript":
        transcript = database.scalar(
            select(RecordingTranscript).where(
                RecordingTranscript.id == resource.resource_id,
                RecordingTranscript.user_id == resource.user_id,
            )
        )
        if transcript:
            transcript.segments_json = []
            transcript.speakers_json = {}
            transcript.destroyed_at = now
    elif resource.resource_type == "recording_summary":
        summary = database.scalar(
            select(RecordingSummary).where(
                RecordingSummary.id == resource.resource_id,
                RecordingSummary.user_id == resource.user_id,
            )
        )
        if summary:
            summary.main_summary = ""
            summary.chapter_overview = []
            summary.destroyed_at = now
    elif resource.resource_type == "report":
        report = database.scalar(
            select(Report).where(
                Report.id == resource.resource_id,
                Report.user_id == resource.user_id,
            )
        )
        if report:
            report.draft_content = {}
            report.formal_content = None
            report.selected_sources = []
            report.destroyed_at = now
            report.updated_at = now
    elif resource.resource_type == "supervision_conversation":
        conversation = database.scalar(
            select(SupervisionConversation).where(
                SupervisionConversation.id == resource.resource_id,
                SupervisionConversation.user_id == resource.user_id,
            )
        )
        if conversation:
            destroy_supervision_conversation(database, conversation, destroyed_at=now)
    resource.destroyed_at = now
    resource.updated_at = now


def create_privacy_router(storage: Storage) -> APIRouter:
    router = APIRouter(prefix="/api/v1/privacy", tags=["privacy"])

    @router.get("/expiring-resources")
    def expiring_resources(
        user_id: Annotated[str, Depends(current_user_id)],
        database: Annotated[Session, Depends(get_db)],
        days: Annotated[int, Query(ge=1, le=365)] = 14,
        page: Annotated[int, Query(ge=1)] = 1,
        page_size: Annotated[int, Query(ge=1, le=100)] = 20,
    ) -> dict[str, object]:
        query = select(SensitiveResource).where(
            SensitiveResource.user_id == user_id,
            SensitiveResource.destroyed_at.is_(None),
            SensitiveResource.long_term_authorized_at.is_(None),
            SensitiveResource.expires_at <= utc_now() + timedelta(days=days),
        )
        total = database.scalar(select(func.count()).select_from(query.subquery())) or 0
        items = database.scalars(
            query.order_by(SensitiveResource.expires_at.asc(), SensitiveResource.id.asc())
            .offset((page - 1) * page_size)
            .limit(page_size)
        ).all()
        return {
            "items": [serialize_sensitive_resource(item) for item in items],
            "page": page,
            "page_size": page_size,
            "total": total,
        }

    @router.get("/long-term-resources")
    def long_term_resources(
        user_id: Annotated[str, Depends(current_user_id)],
        database: Annotated[Session, Depends(get_db)],
        page: Annotated[int, Query(ge=1)] = 1,
        page_size: Annotated[int, Query(ge=1, le=100)] = 20,
    ) -> dict[str, object]:
        query = select(SensitiveResource).where(
            SensitiveResource.user_id == user_id,
            SensitiveResource.destroyed_at.is_(None),
            SensitiveResource.long_term_authorized_at.is_not(None),
        )
        total = database.scalar(select(func.count()).select_from(query.subquery())) or 0
        items = database.scalars(
            query.order_by(
                SensitiveResource.long_term_authorized_at.desc(),
                SensitiveResource.id.desc(),
            )
            .offset((page - 1) * page_size)
            .limit(page_size)
        ).all()
        return {
            "items": [serialize_sensitive_resource(item) for item in items],
            "page": page,
            "page_size": page_size,
            "total": total,
        }

    @router.post("/resources/{resource_id}/authorize-long-term")
    def authorize_long_term(
        resource_id: str,
        payload: AuthorizeRequest,
        user_id: Annotated[str, Depends(current_user_id)],
        database: Annotated[Session, Depends(get_db)],
    ) -> dict[str, object]:
        resource = get_resource(database, resource_id, user_id)
        if not payload.confirm_understanding:
            raise ApiError(409, "long_term_confirmation_required", "请先确认已了解长期保存风险。")
        if not resource.can_long_term_preserve:
            raise ApiError(400, "long_term_not_allowed", "原始录音不支持长期云端保存。")
        resource.long_term_authorized_at = resource.long_term_authorized_at or utc_now()
        resource.long_term_revoked_at = None
        resource.updated_at = utc_now()
        database.commit()
        return serialize_sensitive_resource(resource)

    @router.post("/resources/{resource_id}/revoke-long-term")
    def revoke_long_term(
        resource_id: str,
        user_id: Annotated[str, Depends(current_user_id)],
        database: Annotated[Session, Depends(get_db)],
    ) -> dict[str, object]:
        resource = get_resource(database, resource_id, user_id)
        resource.long_term_authorized_at = None
        resource.long_term_revoked_at = utc_now()
        resource.updated_at = utc_now()
        if resource.expires_at <= utc_now():
            destroy_sensitive_content(database, storage, resource)
        database.commit()
        return serialize_sensitive_resource(resource)

    @router.delete("/resources/{resource_id}")
    def delete_sensitive_resource(
        resource_id: str,
        payload: DeleteSensitiveRequest,
        user_id: Annotated[str, Depends(current_user_id)],
        database: Annotated[Session, Depends(get_db)],
    ) -> dict[str, bool]:
        if payload.confirmation_text != "删除资料":
            raise ApiError(409, "sensitive_delete_confirmation_required", "请输入“删除资料”确认。")
        resource = get_resource(database, resource_id, user_id)
        destroy_sensitive_content(database, storage, resource)
        database.commit()
        return {"deleted": True}

    @router.post("/cleanup")
    def cleanup_expired(
        user_id: Annotated[str, Depends(current_user_id)],
        database: Annotated[Session, Depends(get_db)],
    ) -> dict[str, int]:
        resources = database.scalars(
            select(SensitiveResource).where(
                SensitiveResource.user_id == user_id,
                SensitiveResource.destroyed_at.is_(None),
                SensitiveResource.long_term_authorized_at.is_(None),
                SensitiveResource.expires_at <= utc_now(),
            )
        ).all()
        for resource in resources:
            destroy_sensitive_content(database, storage, resource)
        database.commit()
        return {"destroyed_count": len(resources)}

    return router
