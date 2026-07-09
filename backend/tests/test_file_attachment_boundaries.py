from datetime import UTC, datetime, timedelta
from hashlib import sha256

from fastapi.testclient import TestClient

from app.db.session import SessionLocal
from app.main import create_app
from app.models import StoredFile
from tests.fake_storage import FakeStorage
from tests.helpers import auth_headers


def test_file_checksum_is_verified_and_orphan_cleanup_is_idempotent() -> None:
    storage = FakeStorage()
    api = TestClient(create_app(storage=storage))
    body = b"verified-pdf"
    created = api.post(
        "/api/v1/files",
        headers=auth_headers(),
        json={
            "filename": "verified.pdf",
            "mime_type": "application/pdf",
            "size_bytes": len(body),
            "checksum_sha256": sha256(body).hexdigest(),
            "purpose": "attachment",
        },
    )
    storage.objects[storage.last_upload_key] = body
    completed = api.post(
        f"/api/v1/files/{created.json()['file_id']}/complete",
        headers=auth_headers(),
    )
    assert completed.status_code == 200

    wrong = api.post(
        "/api/v1/files",
        headers=auth_headers(),
        json={
            "filename": "wrong.pdf",
            "mime_type": "application/pdf",
            "size_bytes": len(body),
            "checksum_sha256": "0" * 64,
            "purpose": "attachment",
        },
    )
    storage.objects[storage.last_upload_key] = body
    mismatch = api.post(
        f"/api/v1/files/{wrong.json()['file_id']}/complete",
        headers=auth_headers(),
    )
    assert mismatch.status_code == 409
    assert mismatch.json()["error"]["code"] == "upload_checksum_mismatch"

    with SessionLocal() as database:
        orphan = database.get(StoredFile, wrong.json()["file_id"])
        orphan.expires_at = datetime.now(UTC) - timedelta(minutes=1)
        database.commit()
    cleaned = api.post(
        "/api/v1/files/maintenance/cleanup-orphans",
        headers=auth_headers(),
    )
    cleaned_again = api.post(
        "/api/v1/files/maintenance/cleanup-orphans",
        headers=auth_headers(),
    )
    assert cleaned.json()["destroyed_count"] == 1
    assert cleaned_again.json()["destroyed_count"] == 0


def test_storage_delete_failure_preserves_file_metadata() -> None:
    class DeleteFailingStorage(FakeStorage):
        def delete_object(self, storage_key: str) -> None:
            raise RuntimeError("storage unavailable")

    storage = DeleteFailingStorage()
    api = TestClient(create_app(storage=storage))
    body = b"file"
    created = api.post(
        "/api/v1/files",
        headers=auth_headers(),
        json={
            "filename": "keep.pdf",
            "mime_type": "application/pdf",
            "size_bytes": len(body),
            "purpose": "attachment",
        },
    )
    storage.objects[storage.last_upload_key] = body
    file_id = created.json()["file_id"]
    assert api.post(f"/api/v1/files/{file_id}/complete", headers=auth_headers()).status_code == 200

    failed = api.delete(f"/api/v1/files/{file_id}", headers=auth_headers())
    assert failed.status_code == 503
    assert failed.json()["error"]["code"] == "storage_delete_failed"
    assert api.get(
        f"/api/v1/files/{file_id}/download-url",
        headers=auth_headers(),
    ).status_code == 200
