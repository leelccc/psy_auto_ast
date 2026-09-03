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
        # 内部 client：走 docker 网络 minio:9000（HTTP），用于 bucket 管理/读写
        self.internal_client = Minio(
            self.settings.minio_internal_endpoint,
            access_key=self.settings.minio_root_user,
            secret_key=self.settings.minio_root_password,
            secure=False,
        )
        # 外部 client：用于生成给 App/Web 使用的 presigned URL，地址和协议按 .env 配置
        self.public_client = Minio(
            self.settings.minio_endpoint,
            access_key=self.settings.minio_root_user,
            secret_key=self.settings.minio_root_password,
            secure=self.settings.minio_secure,
        )

    def health_check(self) -> None:
        if not self.internal_client.bucket_exists(self.settings.minio_bucket):
            raise RuntimeError("MinIO bucket does not exist")

    def create_upload_url(self, storage_key: str, mime_type: str) -> tuple[str, dict[str, str]]:
        url = self.public_client.presigned_put_object(
            self.settings.minio_bucket,
            storage_key,
            expires=timedelta(minutes=15),
        )
        return url, {"Content-Type": mime_type}

    def stat_object(self, storage_key: str) -> ObjectStat:
        return self.internal_client.stat_object(self.settings.minio_bucket, storage_key)

    def create_download_url(self, storage_key: str) -> str:
        return self.public_client.presigned_get_object(
            self.settings.minio_bucket,
            storage_key,
            expires=timedelta(minutes=60),
        )

    def delete_object(self, storage_key: str) -> None:
        self.internal_client.remove_object(self.settings.minio_bucket, storage_key)

    def read_object(self, storage_key: str) -> bytes:
        response = self.internal_client.get_object(self.settings.minio_bucket, storage_key)
        try:
            return response.read()
        finally:
            response.close()
            response.release_conn()

    def write_object(self, storage_key: str, data: bytes, mime_type: str) -> None:
        self.internal_client.put_object(
            self.settings.minio_bucket,
            storage_key,
            BytesIO(data),
            len(data),
            content_type=mime_type,
        )
