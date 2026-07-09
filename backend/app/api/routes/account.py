from typing import Annotated

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app.api.dependencies import current_user_id
from app.api.errors import ApiError
from app.db.session import get_db
from app.models import (
    AIJob,
    Attachment,
    CalendarEvent,
    CalendarSetting,
    Profile,
    ProfileAccessGrant,
    ProfileAccessPassword,
    Recording,
    RecordingDurationEntry,
    RecordingSummary,
    RecordingTranscript,
    RefreshToken,
    Report,
    SensitiveResource,
    SessionRecord,
    StoredFile,
    SupervisionContextRef,
    SupervisionConversation,
    SupervisionMessage,
    User,
)
from app.services.auth import verify_password
from app.services.storage import Storage


class DeleteAccountRequest(BaseModel):
    password: str
    confirmation_text: str


def create_account_router(storage: Storage) -> APIRouter:
    router = APIRouter(prefix="/api/v1/account", tags=["account"])

    @router.post("/deletion")
    def delete_account(
        payload: DeleteAccountRequest,
        user_id: Annotated[str, Depends(current_user_id)],
        database: Annotated[Session, Depends(get_db)],
    ) -> dict[str, bool]:
        if payload.confirmation_text != "注销账号":
            raise ApiError(409, "account_delete_confirmation_required", "请输入“注销账号”确认。")
        user = database.scalar(select(User).where(User.id == user_id))
        if user is None or not verify_password(payload.password, user.password_hash):
            raise ApiError(401, "credentials_invalid", "当前密码不正确。")

        files = database.scalars(
            select(StoredFile).where(StoredFile.user_id == user_id)
        ).all()
        for stored_file in files:
            if stored_file.storage_key:
                try:
                    storage.delete_object(stored_file.storage_key)
                except Exception as exc:
                    raise ApiError(
                        503,
                        "storage_delete_failed",
                        "云端文件删除失败，账号尚未注销，请稍后重试。",
                    ) from exc

        conversation_ids = database.scalars(
            select(SupervisionConversation.id).where(
                SupervisionConversation.user_id == user_id
            )
        ).all()
        if conversation_ids:
            database.execute(
                delete(SupervisionMessage).where(
                    SupervisionMessage.conversation_id.in_(conversation_ids)
                )
            )
            database.execute(
                delete(SupervisionContextRef).where(
                    SupervisionContextRef.conversation_id.in_(conversation_ids)
                )
            )
        database.execute(
            delete(SupervisionConversation).where(
                SupervisionConversation.user_id == user_id
            )
        )
        database.execute(delete(CalendarEvent).where(CalendarEvent.user_id == user_id))
        database.execute(delete(CalendarSetting).where(CalendarSetting.user_id == user_id))
        database.execute(delete(SensitiveResource).where(SensitiveResource.user_id == user_id))
        database.execute(delete(AIJob).where(AIJob.user_id == user_id))
        database.execute(delete(Report).where(Report.user_id == user_id))
        database.execute(delete(RecordingDurationEntry).where(RecordingDurationEntry.user_id == user_id))
        database.execute(delete(RecordingSummary).where(RecordingSummary.user_id == user_id))
        database.execute(delete(RecordingTranscript).where(RecordingTranscript.user_id == user_id))
        database.execute(delete(Recording).where(Recording.user_id == user_id))
        database.execute(delete(Attachment).where(Attachment.user_id == user_id))
        database.execute(delete(SessionRecord).where(SessionRecord.user_id == user_id))
        database.execute(delete(Profile).where(Profile.user_id == user_id))
        database.execute(delete(StoredFile).where(StoredFile.user_id == user_id))
        database.execute(delete(ProfileAccessGrant).where(ProfileAccessGrant.user_id == user_id))
        database.execute(delete(ProfileAccessPassword).where(ProfileAccessPassword.user_id == user_id))
        database.execute(delete(RefreshToken).where(RefreshToken.user_id == user_id))
        database.delete(user)
        database.commit()
        return {"deleted": True}

    return router
