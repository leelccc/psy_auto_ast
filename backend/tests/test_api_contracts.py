from dataclasses import dataclass
from datetime import UTC, datetime
from uuid import uuid4

from fastapi.testclient import TestClient

from app.db.session import SessionLocal
from app.main import create_app
from app.models import Profile
from app.seed import CHEN_PROFILE_ID, SESSION_6_ID, seed_demo_data
from tests.helpers import auth_headers, profile_access_headers


@dataclass
class FakeObjectStat:
    size: int


class FakeStorage:
    def __init__(self) -> None:
        self.objects: dict[str, bytes] = {}
        self.last_upload_key: str | None = None
        self.deleted_keys: list[str] = []

    def create_upload_url(self, storage_key: str, mime_type: str) -> tuple[str, dict[str, str]]:
        self.last_upload_key = storage_key
        return f"https://storage.test/{storage_key}", {"Content-Type": mime_type}

    def stat_object(self, storage_key: str) -> FakeObjectStat:
        return FakeObjectStat(size=len(self.objects[storage_key]))

    def create_download_url(self, storage_key: str) -> str:
        return f"https://storage.test/download/{storage_key}"

    def delete_object(self, storage_key: str) -> None:
        self.objects.pop(storage_key, None)
        self.deleted_keys.append(storage_key)


def seeded_client(storage: FakeStorage | None = None) -> TestClient:
    with SessionLocal() as database:
        seed_demo_data(database)
    return TestClient(create_app(storage=storage or FakeStorage()))


def upload_file(
    api: TestClient,
    storage: FakeStorage,
    *,
    filename: str = "资料.pdf",
    mime_type: str = "application/pdf",
    body: bytes = b"file-body",
) -> str:
    created = api.post(
        "/api/v1/files",
        headers=auth_headers(),
        json={"filename": filename, "mime_type": mime_type, "size_bytes": len(body), "purpose": "attachment"},
    )
    assert created.status_code == 201
    assert storage.last_upload_key is not None
    storage.objects[storage.last_upload_key] = body
    file_id = created.json()["file_id"]
    assert api.post(f"/api/v1/files/{file_id}/complete", headers=auth_headers()).status_code == 200
    return file_id


def test_cors_allows_static_web_preview_origin() -> None:
    api = seeded_client()

    response = api.options(
        "/api/v1/auth/login",
        headers={
            "Origin": "http://127.0.0.1:19006",
            "Access-Control-Request-Method": "POST",
            "Access-Control-Request-Headers": "content-type",
        },
    )

    assert response.status_code == 200
    assert response.headers["access-control-allow-origin"] == "http://127.0.0.1:19006"


def test_profile_list_supports_real_search_filters_and_pagination() -> None:
    api = seeded_client()

    response = api.get(
        "/api/v1/profiles?type=supervisor&keyword=澄&status=active&page=1&page_size=1",
        headers=auth_headers(),
    )

    assert response.status_code == 200
    item = response.json()["items"][0]
    assert datetime.fromisoformat(item["next_session_at"]) > datetime.fromisoformat(item["created_at"])
    assert response.json() == {
        "items": [
            {
                "id": "profile-li-cheng",
                "type": "supervisor",
                "name": "李澄",
                "code": "S03",
                "status": "active",
                "crisis_level": None,
                "initial_session_count": 3,
                "latest_sequence": 0,
                "session_count": 0,
                "next_session_at": item["next_session_at"],
                "metadata": {"direction": "整合取向"},
                "notes": "",
                "created_at": response.json()["items"][0]["created_at"],
                "updated_at": response.json()["items"][0]["updated_at"],
            }
        ],
        "page": 1,
        "page_size": 1,
        "total": 1,
    }


def test_profile_create_update_and_delete_preserve_complete_fields() -> None:
    api = seeded_client()
    created = api.post(
        "/api/v1/profiles",
        headers=auth_headers(),
        json={
            "type": "client",
            "name": "林清",
            "code": "C09",
            "status": "active",
            "crisis_level": "none",
            "initial_session_count": 2,
            "metadata": {
                "gender": "female",
                "regular_time_note": "每周三下午",
                "first_visit_complaint": "适应困难",
            },
            "notes": "电话联系前先发消息",
        },
    )
    assert created.status_code == 201
    profile_id = created.json()["id"]
    assert created.json()["metadata"]["gender"] == "female"
    assert created.json()["notes"] == "电话联系前先发消息"
    unlocked_headers = profile_access_headers(api)

    updated = api.patch(
        f"/api/v1/profiles/{profile_id}",
        headers=unlocked_headers,
        json={"status": "paused", "notes": "暂缓两周"},
    )
    assert updated.status_code == 200
    assert updated.json()["status"] == "paused"
    assert updated.json()["notes"] == "暂缓两周"
    assert updated.json()["metadata"]["gender"] == "female"

    metadata_updated = api.patch(
        f"/api/v1/profiles/{profile_id}",
        headers=unlocked_headers,
        json={"metadata": {"frequency": "双周"}},
    )
    assert metadata_updated.status_code == 200
    assert metadata_updated.json()["metadata"]["gender"] == "female"
    assert metadata_updated.json()["metadata"]["frequency"] == "双周"

    missing_confirmation = api.request(
        "DELETE",
        f"/api/v1/profiles/{profile_id}",
        headers=unlocked_headers,
        json={"confirmation_text": "不正确"},
    )
    assert missing_confirmation.status_code == 409

    deleted = api.request(
        "DELETE",
        f"/api/v1/profiles/{profile_id}",
        headers=unlocked_headers,
        json={"confirmation_text": "删除档案"},
    )
    assert deleted.status_code == 200
    assert deleted.json()["deleted"] is True
    assert deleted.json()["deleted_counts"]["profiles"] == 1


def test_profile_create_generates_short_profile_code_when_omitted() -> None:
    api = seeded_client()
    created = api.post(
        "/api/v1/profiles",
        headers=auth_headers(),
        json={
            "type": "client",
            "name": "自动编号来访者",
            "status": "active",
        },
    )

    assert created.status_code == 201
    assert created.json()["code"].startswith("C")
    assert len(created.json()["code"]) == 7


def test_profile_list_backfills_missing_short_profile_codes() -> None:
    api = seeded_client()
    profile_id = str(uuid4())
    with SessionLocal() as database:
        now = datetime.now(UTC)
        database.add(Profile(
            id=profile_id,
            user_id="demo-user",
            type="client",
            name="历史无编号来访者",
            code=None,
            status="active",
            crisis_level=None,
            initial_session_count=0,
            next_session_at=None,
            metadata_json={},
            notes="",
            created_at=now,
            updated_at=now,
        ))
        database.commit()

    response = api.get("/api/v1/profiles?keyword=历史无编号", headers=auth_headers())

    assert response.status_code == 200
    assert response.json()["items"][0]["code"].startswith("C")
    assert len(response.json()["items"][0]["code"]) == 7


def test_profile_code_must_be_short_unique_and_portable() -> None:
    api = seeded_client()
    invalid = api.post(
        "/api/v1/profiles",
        headers=auth_headers(),
        json={
            "type": "client",
            "name": "非法编号来访者",
            "code": "来访者-0001",
            "status": "active",
        },
    )
    assert invalid.status_code == 422

    duplicate = api.post(
        "/api/v1/profiles",
        headers=auth_headers(),
        json={
            "type": "client",
            "name": "重复编号来访者",
            "code": "A08",
            "status": "active",
        },
    )
    assert duplicate.status_code == 409


def test_session_type_must_match_profile_type() -> None:
    api = seeded_client()
    unlocked_headers = profile_access_headers(api)

    response = api.post(
        f"/api/v1/profiles/{CHEN_PROFILE_ID}/sessions",
        headers=unlocked_headers,
        json={
            "session_type": "supervision_given",
            "started_at": "2026-06-10T10:00:00+08:00",
            "summary": "错误类型",
        },
    )

    assert response.status_code == 422
    assert response.json()["error"]["code"] == "session_type_profile_mismatch"


def test_deleting_session_destroys_owned_attachment_bytes() -> None:
    storage = FakeStorage()
    api = seeded_client(storage)
    unlocked_headers = profile_access_headers(api)
    file_id = upload_file(api, storage)
    attachment = api.post(
        "/api/v1/attachments",
        headers=unlocked_headers,
        json={
            "owner_type": "session",
            "owner_id": SESSION_6_ID,
            "category": "other",
            "file_id": file_id,
        },
    )
    assert attachment.status_code == 201

    deleted = api.request(
        "DELETE",
        f"/api/v1/sessions/{SESSION_6_ID}",
        headers=unlocked_headers,
        json={"confirmation_text": "删除记录"},
    )

    assert deleted.status_code == 200
    assert deleted.json()["deleted_counts"]["attachments"] >= 1
    assert storage.deleted_keys
    assert api.get(f"/api/v1/files/{file_id}/download-url", headers=auth_headers()).status_code == 409


def test_attachment_categories_and_mime_types_follow_mvp_rules() -> None:
    storage = FakeStorage()
    api = seeded_client(storage)
    unlocked_headers = profile_access_headers(api)

    text_upload = api.post(
        "/api/v1/files",
        headers=auth_headers(),
        json={
            "filename": "文字备注.txt",
            "mime_type": "text/plain",
            "size_bytes": 10,
            "purpose": "attachment",
        },
    )
    assert text_upload.status_code == 422
    assert text_upload.json()["error"]["code"] == "file_mime_type_not_allowed"

    image_file_id = upload_file(
        api,
        storage,
        filename="作业.jpg",
        mime_type="image/jpeg",
        body=b"image-data",
    )
    invalid_category = api.post(
        "/api/v1/attachments",
        headers=unlocked_headers,
        json={
            "owner_type": "session",
            "owner_id": SESSION_6_ID,
            "category": "consent",
            "file_id": image_file_id,
        },
    )
    assert invalid_category.status_code == 422
    assert invalid_category.json()["error"]["code"] == "attachment_category_owner_mismatch"
