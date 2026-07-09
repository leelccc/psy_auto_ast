from typing import Annotated
from uuid import uuid4

from fastapi import APIRouter, Depends, Header
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.dependencies import current_user_id
from app.api.errors import ApiError
from app.api.routes.files import serialize_file
from app.db.session import get_db
from app.models import Attachment, Profile, SessionRecord, StoredFile
from app.schemas.attachments import CreateAttachmentRequest, ReplaceAttachmentRequest
from app.services.files import (
    destroy_file,
    get_owned_attachment,
    get_owned_file,
    utc_now,
    validate_owner,
)
from app.services.security import (
    profile_type_for_attachment,
    profile_type_for_profile,
    profile_type_for_session,
    require_profile_access_for_type,
)
from app.services.storage import Storage


PROFILE_ATTACHMENT_CATEGORIES = {
    "client": {"consent", "counseling_agreement"},
    "supervisor": {"supervision_agreement", "supervision_evaluation"},
    "supervisee": {"supervision_agreement", "supervisee_assessment"},
}
SESSION_ATTACHMENT_CATEGORIES = {
    "client": {"scale", "homework", "other"},
    "supervisor": {"other"},
    "supervisee": {"other"},
}


def serialize_attachment(database: Session, attachment: Attachment) -> dict[str, object]:
    stored_file = database.scalar(select(StoredFile).where(StoredFile.id == attachment.file_id))
    if stored_file.destroyed_at is not None:
        lifecycle_status = "destroyed"
    elif stored_file.long_term_authorized_at is not None:
        lifecycle_status = "long_term"
    elif stored_file.expires_at and stored_file.expires_at <= utc_now():
        lifecycle_status = "expired"
    else:
        lifecycle_status = "temporary"
    return {
        "id": attachment.id,
        "owner_type": attachment.owner_type,
        "owner_id": attachment.owner_id,
        "category": attachment.category,
        "replace_group_key": attachment.replace_group_key,
        "is_current": attachment.is_current,
        "analysis_status": attachment.analysis_status,
        "lifecycle_status": lifecycle_status,
        "extracted_text_available": bool(attachment.extracted_text),
        "file": serialize_file(stored_file),
    }


def require_uploaded_file(database: Session, file_id: str, user_id: str) -> StoredFile:
    stored_file = get_owned_file(database, file_id, user_id)
    if stored_file.upload_status != "uploaded" or stored_file.destroyed_at is not None:
        raise ApiError(409, "file_not_uploaded", "文件尚未上传完成。")
    return stored_file


def validate_attachment_category(
    database: Session,
    *,
    owner_type: str,
    owner_id: str,
    category: str,
    user_id: str,
) -> str | None:
    if owner_type == "profile":
        profile = database.scalar(
            select(Profile).where(Profile.id == owner_id, Profile.user_id == user_id)
        )
        allowed = PROFILE_ATTACHMENT_CATEGORIES.get(profile.type if profile else "", set())
        replace_group_key = category
    else:
        session = database.scalar(
            select(SessionRecord).where(
                SessionRecord.id == owner_id,
                SessionRecord.user_id == user_id,
            )
        )
        profile = database.scalar(
            select(Profile).where(
                Profile.id == session.profile_id,
                Profile.user_id == user_id,
            )
        ) if session else None
        allowed = SESSION_ATTACHMENT_CATEGORIES.get(profile.type if profile else "", set())
        replace_group_key = None
    if category not in allowed:
        raise ApiError(
            422,
            "attachment_category_owner_mismatch",
            "该附件类别不适用于当前档案或记录。",
        )
    return replace_group_key


def create_attachments_router(storage: Storage) -> APIRouter:
    router = APIRouter(prefix="/api/v1/attachments", tags=["attachments"])

    @router.get("")
    def list_attachments(
        owner_type: str,
        owner_id: str,
        user_id: Annotated[str, Depends(current_user_id)],
        database: Annotated[Session, Depends(get_db)],
        category: str | None = None,
        x_profile_access_grant: Annotated[str | None, Header()] = None,
    ) -> dict[str, object]:
        validate_owner(
            database,
            owner_type=owner_type,
            owner_id=owner_id,
            user_id=user_id,
        )
        profile_type = (
            profile_type_for_profile(
                database,
                user_id=user_id,
                profile_id=owner_id,
            )
            if owner_type == "profile"
            else profile_type_for_session(
                database,
                user_id=user_id,
                session_id=owner_id,
            )
        )
        require_profile_access_for_type(
            database,
            user_id=user_id,
            profile_type=profile_type,
            raw_grant=x_profile_access_grant,
        )
        query = select(Attachment).where(
            Attachment.user_id == user_id,
            Attachment.owner_type == owner_type,
            Attachment.owner_id == owner_id,
            Attachment.is_current.is_(True),
        )
        if category:
            query = query.where(Attachment.category == category)
        items = database.scalars(query.order_by(Attachment.created_at.desc())).all()
        return {"items": [serialize_attachment(database, item) for item in items]}

    @router.post("", status_code=201)
    def create_attachment(
        payload: CreateAttachmentRequest,
        user_id: Annotated[str, Depends(current_user_id)],
        database: Annotated[Session, Depends(get_db)],
        x_profile_access_grant: Annotated[str | None, Header()] = None,
    ) -> dict[str, object]:
        validate_owner(
            database,
            owner_type=payload.owner_type,
            owner_id=payload.owner_id,
            user_id=user_id,
        )
        profile_type = (
            profile_type_for_profile(
                database,
                user_id=user_id,
                profile_id=payload.owner_id,
            )
            if payload.owner_type == "profile"
            else profile_type_for_session(
                database,
                user_id=user_id,
                session_id=payload.owner_id,
            )
        )
        require_profile_access_for_type(
            database,
            user_id=user_id,
            profile_type=profile_type,
            raw_grant=x_profile_access_grant,
        )
        stored_file = require_uploaded_file(database, payload.file_id, user_id)
        replace_group_key = validate_attachment_category(
            database,
            owner_type=payload.owner_type,
            owner_id=payload.owner_id,
            category=payload.category,
            user_id=user_id,
        )
        if payload.replace_group_key is not None and payload.replace_group_key != replace_group_key:
            raise ApiError(422, "attachment_replace_group_invalid", "附件覆盖分组由后端确定。")
        if replace_group_key:
            existing = database.scalar(
                select(Attachment).where(
                    Attachment.user_id == user_id,
                    Attachment.owner_type == payload.owner_type,
                    Attachment.owner_id == payload.owner_id,
                    Attachment.replace_group_key == replace_group_key,
                    Attachment.is_current.is_(True),
                )
            )
            if existing is not None:
                raise ApiError(409, "attachment_replace_required", "该位置已有附件，请使用替换操作。")
        now = utc_now()
        attachment = Attachment(
            id=str(uuid4()),
            user_id=user_id,
            owner_type=payload.owner_type,
            owner_id=payload.owner_id,
            category=payload.category,
            file_id=stored_file.id,
            replace_group_key=replace_group_key,
            is_current=True,
            analysis_status="not_applicable"
            if stored_file.mime_type.startswith(("image/", "audio/"))
            else "pending",
            created_at=now,
            updated_at=now,
        )
        database.add(attachment)
        database.commit()
        return serialize_attachment(database, attachment)

    @router.post("/{attachment_id}/replace")
    def replace_attachment(
        attachment_id: str,
        payload: ReplaceAttachmentRequest,
        user_id: Annotated[str, Depends(current_user_id)],
        database: Annotated[Session, Depends(get_db)],
        x_profile_access_grant: Annotated[str | None, Header()] = None,
    ) -> dict[str, object]:
        attachment = get_owned_attachment(database, attachment_id, user_id)
        require_profile_access_for_type(
            database,
            user_id=user_id,
            profile_type=profile_type_for_attachment(
                database,
                user_id=user_id,
                attachment=attachment,
            ),
            raw_grant=x_profile_access_grant,
        )
        if not attachment.replace_group_key:
            raise ApiError(409, "attachment_not_replaceable", "该附件不属于覆盖型附件。")
        if not payload.confirm_replace:
            raise ApiError(409, "attachment_replace_confirmation_required", "替换附件前需要确认。")
        replacement = require_uploaded_file(database, payload.file_id, user_id)
        previous = get_owned_file(database, attachment.file_id, user_id)
        attachment.file_id = replacement.id
        attachment.analysis_status = (
            "not_applicable"
            if replacement.mime_type.startswith(("image/", "audio/"))
            else "pending"
        )
        attachment.updated_at = utc_now()
        destroy_file(database, storage, previous)
        database.commit()
        return serialize_attachment(database, attachment)

    @router.delete("/{attachment_id}")
    def delete_attachment(
        attachment_id: str,
        user_id: Annotated[str, Depends(current_user_id)],
        database: Annotated[Session, Depends(get_db)],
        x_profile_access_grant: Annotated[str | None, Header()] = None,
    ) -> dict[str, bool]:
        attachment = get_owned_attachment(database, attachment_id, user_id)
        require_profile_access_for_type(
            database,
            user_id=user_id,
            profile_type=profile_type_for_attachment(
                database,
                user_id=user_id,
                attachment=attachment,
            ),
            raw_grant=x_profile_access_grant,
        )
        stored_file = get_owned_file(database, attachment.file_id, user_id)
        database.delete(attachment)
        destroy_file(database, storage, stored_file)
        database.commit()
        return {"deleted": True}

    return router
