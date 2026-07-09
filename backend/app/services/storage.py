from datetime import timedelta
from io import BytesIO
from typing import Protocol

from minio import Minio

from app.core.config import Settings, get_settings


class ObjectStat(Protocol):
    size: int


class Storage(Protocol):
    def health_check(self) -> None: ...

    def create_upload_url(self, storage_key: str, mime_type: str) -> tuple[str, dict[str, str]]: ...

    def stat_object(self, storage_key: str) -> ObjectStat: ...

    def create_download_url(self, storage_key: str) -> str: ...

    def delete_object(self, storage_key: str) -> None: ...

    def read_object(self, storage_key: str) -> bytes: ...

    def write_object(self, storage_key: str, data: bytes, mime_type: str) -> None: ...


class MinioStorage:
    def __init__(self, settings: Settings | None = None) -> None:
        self.settings = settings or get_settings()
        self.client = Minio(
            self.settings.minio_endpoint,
            access_key=self.settings.minio_root_user,
            secret_key=self.settings.minio_root_password,
            secure=self.settings.minio_secure,
        )

    def health_check(self) -> None:
        if not self.client.bucket_exists(self.settings.minio_bucket):
            raise RuntimeError("MinIO bucket does not exist")

    def create_upload_url(self, storage_key: str, mime_type: str) -> tuple[str, dict[str, str]]:
        url = self.client.presigned_put_object(
            self.settings.minio_bucket,
            storage_key,
            expires=timedelta(minutes=15),
        )
        return url, {"Content-Type": mime_type}

    def stat_object(self, storage_key: str) -> ObjectStat:
        return self.client.stat_object(self.settings.minio_bucket, storage_key)

    def create_download_url(self, storage_key: str) -> str:
        return self.client.presigned_get_object(
            self.settings.minio_bucket,
            storage_key,
            expires=timedelta(minutes=5),
        )

    def delete_object(self, storage_key: str) -> None:
        self.client.remove_object(self.settings.minio_bucket, storage_key)

    def read_object(self, storage_key: str) -> bytes:
        response = self.client.get_object(self.settings.minio_bucket, storage_key)
        try:
            return response.read()
        finally:
            response.close()
            response.release_conn()

    def write_object(self, storage_key: str, data: bytes, mime_type: str) -> None:
        self.client.put_object(
            self.settings.minio_bucket,
            storage_key,
            BytesIO(data),
            len(data),
            content_type=mime_type,
        )
