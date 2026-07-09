from datetime import timedelta
from typing import Annotated

from fastapi import APIRouter, Depends, Header
from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app.api.dependencies import current_user_id
from app.api.errors import ApiError
from app.db.session import get_db
from app.models import Attachment, StoredFile
from app.schemas.files import CreateFileRequest
from app.services.files import complete_file, create_file, destroy_file, get_owned_file
from app.services.security import profile_type_for_file, require_profile_access_for_type
from app.services.storage import Storage


ALLOWED_MIME_TYPES = {
    "attachment": {
        "application/pdf",
        "image/jpeg",
        "image/png",
        "image/webp",
        "image/heic",
    },
    "recording": {
        "audio/mpeg",
        "audio/mp4",
        "audio/x-m4a",
        "audio/wav",
        "audio/webm",
    },
    "export": {
        "application/pdf",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    },
}
MAX_FILE_SIZE_BYTES = {
    "attachment": 20 * 1024 * 1024,
    "recording": 500 * 1024 * 1024,
    "export": 50 * 1024 * 1024,
}


def serialize_file(stored_file: object) -> dict[str, object]:
    return {
        "file_id": stored_file.id,
        "filename": stored_file.filename,
        "mime_type": stored_file.mime_type,
        "size_bytes": stored_file.size_bytes,
        "purpose": stored_file.purpose,
        "upload_status": stored_file.upload_status,
        "can_long_term_preserve": stored_file.can_long_term_preserve,
        "expires_at": stored_file.expires_at.isoformat() if stored_file.expires_at else None,
        "uploaded_at": stored_file.uploaded_at.isoformat() if stored_file.uploaded_at else None,
    }


def create_files_router(storage: Storage) -> APIRouter:
    router = APIRouter(prefix="/api/v1/files", tags=["files"])

    @router.post("", status_code=201)
    def create_file_upload(
        payload: CreateFileRequest,
        user_id: Annotated[str, Depends(current_user_id)],
        database: Annotated[Session, Depends(get_db)],
    ) -> dict[str, object]:
        allowed_mime_types = ALLOWED_MIME_TYPES.get(payload.purpose)
        if allowed_mime_types is None:
            raise ApiError(422, "file_purpose_invalid", "不支持的文件用途。")
        if payload.mime_type not in allowed_mime_types:
            raise ApiError(422, "file_mime_type_not_allowed", "该文件类型暂不支持上传。")
        if payload.size_bytes > MAX_FILE_SIZE_BYTES[payload.purpose]:
            raise ApiError(422, "file_too_large", "文件大小超过当前用途的限制。")
        stored_file, upload_url, upload_headers = create_file(
            database,
            storage,
            user_id=user_id,
            filename=payload.filename,
            mime_type=payload.mime_type,
            size_bytes=payload.size_bytes,
            purpose=payload.purpose,
            checksum_sha256=payload.checksum_sha256,
        )
        return {
            "file_id": stored_file.id,
            "upload_url": upload_url,
            "upload_headers": upload_headers,
        }

    @router.post("/{file_id}/complete")
    def complete_file_upload(
        file_id: str,
        user_id: Annotated[str, Depends(current_user_id)],
        database: Annotated[Session, Depends(get_db)],
    ) -> dict[str, object]:
        return serialize_file(complete_file(database, storage, file_id=file_id, user_id=user_id))

    @router.get("/{file_id}/download-url")
    def get_file_download_url(
        file_id: str,
        user_id: Annotated[str, Depends(current_user_id)],
        database: Annotated[Session, Depends(get_db)],
        x_profile_access_grant: Annotated[str | None, Header()] = None,
    ) -> dict[str, object]:
        stored_file = get_owned_file(database, file_id, user_id)
        require_profile_access_for_type(
            database,
            user_id=user_id,
            profile_type=profile_type_for_file(
                database,
                user_id=user_id,
                file_id=file_id,
            ),
            raw_grant=x_profile_access_grant,
        )
        if stored_file.upload_status != "uploaded" or not stored_file.storage_key:
            raise ApiError(409, "file_not_uploaded", "文件尚未上传完成。")
        return {
            "download_url": storage.create_download_url(stored_file.storage_key),
            "expires_in_seconds": int(timedelta(minutes=5).total_seconds()),
        }

    @router.delete("/{file_id}")
    def delete_file(
        file_id: str,
        user_id: Annotated[str, Depends(current_user_id)],
        database: Annotated[Session, Depends(get_db)],
        x_profile_access_grant: Annotated[str | None, Header()] = None,
    ) -> dict[str, bool]:
        stored_file = get_owned_file(database, file_id, user_id)
        require_profile_access_for_type(
            database,
            user_id=user_id,
            profile_type=profile_type_for_file(
                database,
                user_id=user_id,
                file_id=file_id,
            ),
            raw_grant=x_profile_access_grant,
        )
        database.execute(
            delete(Attachment).where(
                Attachment.file_id == stored_file.id,
                Attachment.user_id == user_id,
            )
        )
        destroy_file(database, storage, stored_file)
        database.commit()
        return {"deleted": True}

    @router.post("/maintenance/cleanup-orphans")
    def cleanup_orphan_uploads(
        user_id: Annotated[str, Depends(current_user_id)],
        database: Annotated[Session, Depends(get_db)],
    ) -> dict[str, int]:
        from app.services.files import utc_now

        orphaned = database.scalars(
            select(StoredFile).where(
                StoredFile.user_id == user_id,
                StoredFile.upload_status == "pending",
                StoredFile.expires_at <= utc_now(),
            )
        ).all()
        for stored_file in orphaned:
            destroy_file(database, storage, stored_file)
        database.commit()
        return {"destroyed_count": len(orphaned)}

    return router
