from dataclasses import dataclass

from fastapi.testclient import TestClient

from app.main import create_app
from app.seed import seed_demo_data
from app.db.session import SessionLocal
from tests.helpers import profile_access_headers


def auth_headers() -> dict[str, str]:
    return {"Authorization": "Bearer demo-token"}


@dataclass
class FakeObjectStat:
    size: int


class FakeStorage:
    def __init__(self) -> None:
        self.objects: dict[str, bytes] = {}
        self.deleted_keys: list[str] = []
        self.last_upload_key: str | None = None

    def create_upload_url(self, storage_key: str, mime_type: str) -> tuple[str, dict[str, str]]:
        self.last_upload_key = storage_key
        return f"https://storage.test/upload/{storage_key}", {"Content-Type": mime_type}

    def stat_object(self, storage_key: str) -> FakeObjectStat:
        return FakeObjectStat(size=len(self.objects[storage_key]))

    def create_download_url(self, storage_key: str) -> str:
        return f"https://storage.test/download/{storage_key}"

    def delete_object(self, storage_key: str) -> None:
        self.objects.pop(storage_key, None)
        self.deleted_keys.append(storage_key)


def create_uploaded_file(
    api: TestClient,
    storage: FakeStorage,
    *,
    filename: str,
    body: bytes,
) -> dict[str, object]:
    create_response = api.post(
        "/api/v1/files",
        headers=auth_headers(),
        json={
            "filename": filename,
            "mime_type": "application/pdf",
            "size_bytes": len(body),
            "purpose": "attachment",
        },
    )
    assert create_response.status_code == 201
    created = create_response.json()
    assert "storage_key" not in created
    assert storage.last_upload_key is not None
    storage.objects[storage.last_upload_key] = body

    complete_response = api.post(
        f"/api/v1/files/{created['file_id']}/complete",
        headers=auth_headers(),
    )
    assert complete_response.status_code == 200
    return complete_response.json()


def test_file_and_attachment_lifecycle_uses_private_storage_adapter() -> None:
    with SessionLocal() as database:
        seed_demo_data(database)
    storage = FakeStorage()
    api = TestClient(create_app(storage=storage))
    profile_response = api.post(
        "/api/v1/profiles",
        headers=auth_headers(),
        json={"type": "client", "name": "附件测试档案"},
    )
    assert profile_response.status_code == 201
    profile_id = profile_response.json()["id"]
    unlocked_headers = profile_access_headers(api)

    first_file = create_uploaded_file(api, storage, filename="知情同意书.pdf", body=b"first-pdf")
    assert first_file["upload_status"] == "uploaded"

    attachment_response = api.post(
        "/api/v1/attachments",
        headers=unlocked_headers,
        json={
            "owner_type": "profile",
            "owner_id": profile_id,
            "category": "consent",
            "file_id": first_file["file_id"],
        },
    )
    assert attachment_response.status_code == 201
    attachment = attachment_response.json()
    assert attachment["file"]["filename"] == "知情同意书.pdf"

    list_response = api.get(
        f"/api/v1/attachments?owner_type=profile&owner_id={profile_id}&category=consent",
        headers=unlocked_headers,
    )
    assert list_response.status_code == 200
    assert any(item["id"] == attachment["id"] for item in list_response.json()["items"])

    download_response = api.get(
        f"/api/v1/files/{first_file['file_id']}/download-url",
        headers=unlocked_headers,
    )
    assert download_response.status_code == 200
    assert download_response.json()["download_url"].startswith("https://storage.test/download/")

    replacement = create_uploaded_file(api, storage, filename="新版知情同意书.pdf", body=b"replacement-pdf")
    replace_response = api.post(
        f"/api/v1/attachments/{attachment['id']}/replace",
        headers=unlocked_headers,
        json={"file_id": replacement["file_id"], "confirm_replace": True},
    )
    assert replace_response.status_code == 200
    assert replace_response.json()["file"]["filename"] == "新版知情同意书.pdf"
    assert storage.deleted_keys

    delete_response = api.delete(
        f"/api/v1/attachments/{attachment['id']}",
        headers=unlocked_headers,
    )
    assert delete_response.status_code == 200
    assert delete_response.json() == {"deleted": True}
