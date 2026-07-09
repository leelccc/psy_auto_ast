from datetime import UTC, datetime, timedelta
from hashlib import sha256
from pathlib import Path
from uuid import uuid4

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.errors import ApiError
from app.models import Attachment, Profile, SessionRecord, StoredFile
from app.services.storage import Storage


def utc_now() -> datetime:
    return datetime.now(UTC)


def get_owned_file(database: Session, file_id: str, user_id: str) -> StoredFile:
    stored_file = database.scalar(
        select(StoredFile).where(StoredFile.id == file_id, StoredFile.user_id == user_id)
    )
    if stored_file is None:
        raise ApiError(404, "file_not_found", "文件不存在。")
    return stored_file


def create_file(
    database: Session,
    storage: Storage,
    *,
    user_id: str,
    filename: str,
    mime_type: str,
    size_bytes: int,
    purpose: str,
    checksum_sha256: str | None = None,
) -> tuple[StoredFile, str, dict[str, str]]:
    safe_filename = Path(filename).name.strip()
    if not safe_filename:
        raise ApiError(422, "filename_invalid", "文件名无效。")
    file_id = str(uuid4())
    storage_key = f"{user_id}/{file_id}/{safe_filename}"
    now = utc_now()
    stored_file = StoredFile(
        id=file_id,
        user_id=user_id,
        storage_key=storage_key,
        filename=safe_filename,
        mime_type=mime_type,
        size_bytes=size_bytes,
        checksum_sha256=checksum_sha256.lower() if checksum_sha256 else None,
        purpose=purpose,
        upload_status="pending",
        expires_at=now + timedelta(hours=24),
        can_long_term_preserve=not mime_type.startswith("audio/"),
        long_term_authorized_at=None,
        long_term_revoked_at=None,
        destroyed_at=None,
        created_at=now,
        uploaded_at=None,
    )
    database.add(stored_file)
    try:
        upload_url, upload_headers = storage.create_upload_url(storage_key, mime_type)
    except Exception as exc:
        database.rollback()
        raise ApiError(503, "storage_unavailable", "文件服务暂不可用，请稍后重试。") from exc
    database.commit()
    return stored_file, upload_url, upload_headers


def complete_file(database: Session, storage: Storage, *, file_id: str, user_id: str) -> StoredFile:
    stored_file = get_owned_file(database, file_id, user_id)
    if stored_file.upload_status == "uploaded":
        return stored_file
    if not stored_file.storage_key or stored_file.destroyed_at is not None:
        raise ApiError(409, "file_unavailable", "文件已不可用。")
    try:
        stat = storage.stat_object(stored_file.storage_key)
    except Exception as exc:
        raise ApiError(409, "upload_not_found", "尚未检测到已上传的文件。") from exc
    if stat.size != stored_file.size_bytes:
        raise ApiError(409, "upload_size_mismatch", "上传文件大小与登记信息不一致。")
    if stored_file.checksum_sha256:
        actual_checksum = sha256(storage.read_object(stored_file.storage_key)).hexdigest()
        if actual_checksum != stored_file.checksum_sha256:
            raise ApiError(409, "upload_checksum_mismatch", "上传文件校验失败，请重新上传。")
    stored_file.upload_status = "uploaded"
    stored_file.uploaded_at = utc_now()
    stored_file.expires_at = utc_now() + timedelta(days=14)
    database.commit()
    return stored_file


def destroy_file(database: Session, storage: Storage, stored_file: StoredFile) -> None:
    if stored_file.storage_key:
        try:
            storage.delete_object(stored_file.storage_key)
        except Exception as exc:
            raise ApiError(
                503,
                "storage_delete_failed",
                "云端文件删除失败，原数据已保留，请稍后重试。",
            ) from exc
    stored_file.storage_key = None
    stored_file.upload_status = "destroyed"
    stored_file.destroyed_at = utc_now()


def validate_owner(database: Session, *, owner_type: str, owner_id: str, user_id: str) -> None:
    if owner_type == "profile":
        exists = database.scalar(
            select(Profile.id).where(Profile.id == owner_id, Profile.user_id == user_id)
        )
    elif owner_type == "session":
        exists = database.scalar(
            select(SessionRecord.id).where(
                SessionRecord.id == owner_id,
                SessionRecord.user_id == user_id,
            )
        )
    else:
        raise ApiError(422, "attachment_owner_type_invalid", "不支持的附件归属类型。")
    if exists is None:
        raise ApiError(404, "attachment_owner_not_found", "附件所属记录不存在。")


def get_owned_attachment(database: Session, attachment_id: str, user_id: str) -> Attachment:
    attachment = database.scalar(
        select(Attachment).where(
            Attachment.id == attachment_id,
            Attachment.user_id == user_id,
        )
    )
    if attachment is None:
        raise ApiError(404, "attachment_not_found", "附件不存在。")
    return attachment
