from datetime import timedelta
from typing import Annotated

from fastapi import APIRouter, Depends, Header, Query
from pydantic import BaseModel
from sqlalchemy import and_, func, or_, select
from sqlalchemy.orm import Session

from app.api.dependencies import current_user_id
from app.api.errors import ApiError
from app.db.session import get_db
from app.models import (
    Attachment,
    Profile,
    Recording,
    RecordingSummary,
    RecordingTranscript,
    Report,
    SensitiveResource,
    SessionRecord,
    StoredFile,
    SupervisionConversation,
)
from app.services.auth import utc_now
from app.services.files import destroy_file, get_owned_file
from app.services.lifecycle import destroy_supervision_conversation, serialize_sensitive_resource
from app.services.security import require_profile_access_for_type
from app.services.storage import Storage

# 档案隐私页的分类。原始录音、转写、纪要来自录音链路，
# 咨询记录与个案报告来自报告，量表/作业/其他来自会话附件。
PRIVACY_CATEGORIES = (
    "recording",
    "transcript",
    "summary",
    "scale",
    "homework",
    "other",
    "session_record",
    "case_report",
)

ATTACHMENT_CATEGORY_MAP = {
    "scale": "scale",
    "homework": "homework",
    "other": "other",
}


def resource_category(
    resource_type: str,
    resource_id: str,
    report_types: dict[str, str],
) -> str | None:
    """把 sensitive_resources 的记录映射到档案隐私页的分类。"""
    if resource_type == "audio":
        return "recording"
    if resource_type == "transcript":
        return "transcript"
    if resource_type == "recording_summary":
        return "summary"
    if resource_type == "report":
        return "case_report" if report_types.get(resource_id) == "case_report" else "session_record"
    return None


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

    @router.get("/profile-resources")
    def profile_resources(
        profile_id: Annotated[str, Query()],
        user_id: Annotated[str, Depends(current_user_id)],
        database: Annotated[Session, Depends(get_db)],
        category: Annotated[str | None, Query()] = None,
        x_profile_access_grant: Annotated[str | None, Header()] = None,
    ) -> dict[str, object]:
        """档案内隐私管理：按分类列出该档案的敏感资料与授权状态。

        sensitive_resources 没有直接记录 profile_id，需要按 owner 三段解析归属：
        profile 直连 / session → profile / recording → session → profile。
        """
        if category is not None and category not in PRIVACY_CATEGORIES:
            raise ApiError(422, "privacy_category_invalid", "不支持的隐私分类。")
        profile = database.scalar(
            select(Profile).where(Profile.id == profile_id, Profile.user_id == user_id)
        )
        if profile is None:
            raise ApiError(404, "profile_not_found", "档案不存在。")
        require_profile_access_for_type(
            database,
            user_id=user_id,
            profile_type=profile.type,
            raw_grant=x_profile_access_grant,
        )
        session_rows = database.execute(
            select(SessionRecord.id, SessionRecord.sequence_no).where(
                SessionRecord.profile_id == profile.id,
                SessionRecord.user_id == user_id,
            )
        )
        session_labels = {row.id: f"第{row.sequence_no}次" for row in session_rows}
        session_ids = list(session_labels)
        recording_session: dict[str, str] = {}
        if session_ids:
            recording_rows = database.execute(
                select(Recording.id, Recording.session_id).where(
                    Recording.user_id == user_id,
                    Recording.session_id.in_(session_ids),
                )
            )
            recording_session = {row.id: row.session_id for row in recording_rows}
        report_rows = database.execute(
            select(Report.id, Report.report_type).where(
                Report.user_id == user_id,
                Report.profile_id == profile.id,
            )
        )
        report_types = {row.id: row.report_type for row in report_rows}

        def source_label(owner_type: str | None, owner_id: str | None) -> str:
            if owner_type == "profile":
                return "档案基本信息"
            if owner_type == "session":
                return session_labels.get(owner_id or "", "咨询记录资料")
            if owner_type == "recording":
                session_id = recording_session.get(owner_id or "")
                return session_labels.get(session_id or "", "录音资料")
            return "其他资料"

        owner_clauses = [
            and_(SensitiveResource.owner_type == "profile", SensitiveResource.owner_id == profile.id)
        ]
        if session_ids:
            owner_clauses.append(
                and_(SensitiveResource.owner_type == "session", SensitiveResource.owner_id.in_(session_ids))
            )
        if recording_session:
            owner_clauses.append(
                and_(
                    SensitiveResource.owner_type == "recording",
                    SensitiveResource.owner_id.in_(list(recording_session)),
                )
            )
        resources = database.scalars(
            select(SensitiveResource)
            .where(
                SensitiveResource.user_id == user_id,
                SensitiveResource.destroyed_at.is_(None),
                or_(*owner_clauses),
            )
            .order_by(SensitiveResource.expires_at.asc())
        ).all()

        now = utc_now()
        soon = now + timedelta(days=14)
        items: list[dict[str, object]] = []
        for resource in resources:
            mapped = resource_category(resource.resource_type, resource.resource_id, report_types)
            if mapped is None:
                continue
            authorized = resource.long_term_authorized_at is not None
            expires_at = resource.expires_at
            items.append({
                "id": resource.id,
                "kind": "resource",
                "category": mapped,
                "title": resource.display_name,
                "source": source_label(resource.owner_type, resource.owner_id),
                "resourceType": resource.resource_type,
                "resourceId": resource.resource_id,
                "originAt": resource.origin_at.isoformat(),
                "expiresAt": expires_at.isoformat(),
                "authorized": authorized,
                "authorizedAt": (
                    resource.long_term_authorized_at.isoformat()
                    if resource.long_term_authorized_at
                    else None
                ),
                "preservable": bool(resource.can_long_term_preserve),
                "expiringSoon": (not authorized) and expires_at <= soon,
            })

        # 量表/作业/其他属于会话附件，当前不进入 14 天销毁与长期保存授权体系。
        # 这里一并列出，方便在同一个档案下按分类查看全部资料，但不提供授权操作。
        attachment_clauses = [
            and_(Attachment.owner_type == "profile", Attachment.owner_id == profile.id)
        ]
        if session_ids:
            attachment_clauses.append(
                and_(Attachment.owner_type == "session", Attachment.owner_id.in_(session_ids))
            )
        attachments = database.scalars(
            select(Attachment)
            .where(
                Attachment.user_id == user_id,
                Attachment.is_current.is_(True),
                or_(*attachment_clauses),
            )
            .order_by(Attachment.created_at.desc())
        ).all()
        file_names: dict[str, str] = {}
        file_ids = [item.file_id for item in attachments]
        if file_ids:
            file_rows = database.execute(
                select(StoredFile.id, StoredFile.filename).where(StoredFile.id.in_(file_ids))
            )
            file_names = {row.id: row.filename for row in file_rows}
        for attachment in attachments:
            mapped = ATTACHMENT_CATEGORY_MAP.get(attachment.category)
            if mapped is None:
                continue
            items.append({
                "id": attachment.id,
                "kind": "attachment",
                "category": mapped,
                "title": file_names.get(attachment.file_id, attachment.file_id),
                "source": source_label(attachment.owner_type, attachment.owner_id),
                "resourceType": "attachment",
                "resourceId": attachment.id,
                "originAt": attachment.created_at.isoformat(),
                "expiresAt": None,
                "authorized": False,
                "authorizedAt": None,
                "preservable": False,
                "expiringSoon": False,
            })

        visible = items if category is None else [item for item in items if item["category"] == category]
        return {
            "profile": {"id": profile.id, "name": profile.name, "type": profile.type},
            "items": visible,
            "summary": {
                "total": len(visible),
                "authorized": sum(1 for item in visible if item["authorized"]),
                "expiringSoon": sum(1 for item in visible if item["expiringSoon"]),
            },
        }

    @router.get("/expiring-by-profile")
    def expiring_by_profile(
        user_id: Annotated[str, Depends(current_user_id)],
        database: Annotated[Session, Depends(get_db)],
        days: Annotated[int, Query(ge=1, le=365)] = 14,
    ) -> dict[str, object]:
        """【我的】页隐私提醒：按档案聚合即将到期的敏感资料数量。"""
        deadline = utc_now() + timedelta(days=days)
        resources = database.scalars(
            select(SensitiveResource).where(
                SensitiveResource.user_id == user_id,
                SensitiveResource.destroyed_at.is_(None),
                SensitiveResource.long_term_authorized_at.is_(None),
                SensitiveResource.expires_at <= deadline,
            )
        ).all()
        session_ids = [item.owner_id for item in resources if item.owner_type == "session"]
        recording_ids = [item.owner_id for item in resources if item.owner_type == "recording"]
        session_profile: dict[str, tuple[str, str]] = {}
        if session_ids:
            rows = database.execute(
                select(SessionRecord.id, SessionRecord.profile_id, SessionRecord.sequence_no).where(
                    SessionRecord.id.in_(session_ids)
                )
            )
            session_profile = {row.id: (row.profile_id, f"第{row.sequence_no}次") for row in rows}
        recording_profile: dict[str, str | None] = {}
        if recording_ids:
            rec_rows = database.execute(
                select(Recording.id, Recording.session_id).where(Recording.id.in_(recording_ids))
            )
            rec_to_session = {row.id: row.session_id for row in rec_rows}
            missing = [sid for sid in rec_to_session.values() if sid and sid not in session_profile]
            if missing:
                extra = database.execute(
                    select(SessionRecord.id, SessionRecord.profile_id, SessionRecord.sequence_no).where(
                        SessionRecord.id.in_(missing)
                    )
                )
                session_profile.update(
                    {row.id: (row.profile_id, f"第{row.sequence_no}次") for row in extra}
                )
            recording_profile = {
                rid: (session_profile[sid][0] if sid and sid in session_profile else None)
                for rid, sid in rec_to_session.items()
            }
        grouped: dict[str, dict[str, object]] = {}
        for resource in resources:
            if resource.owner_type == "profile":
                profile_key = resource.owner_id
            elif resource.owner_type == "session":
                entry = session_profile.get(resource.owner_id)
                profile_key = entry[0] if entry else None
            elif resource.owner_type == "recording":
                profile_key = recording_profile.get(resource.owner_id)
            else:
                profile_key = None
            if not profile_key:
                continue
            bucket = grouped.setdefault(profile_key, {"count": 0, "nearest": None})
            bucket["count"] = int(bucket["count"]) + 1
            nearest = bucket["nearest"]
            if nearest is None or resource.expires_at < nearest:
                bucket["nearest"] = resource.expires_at
        items: list[dict[str, object]] = []
        if grouped:
            profiles = database.scalars(
                select(Profile).where(Profile.user_id == user_id, Profile.id.in_(list(grouped)))
            ).all()
            for item in profiles:
                bucket = grouped[item.id]
                nearest = bucket["nearest"]
                items.append({
                    "profile": {"id": item.id, "name": item.name, "type": item.type},
                    "expiringCount": bucket["count"],
                    "nearestExpiresAt": nearest.isoformat() if nearest is not None else None,
                })
        items.sort(key=lambda entry: int(entry["expiringCount"]), reverse=True)
        return {"items": items, "days": days}

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
