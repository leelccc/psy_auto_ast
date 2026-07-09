from fastapi.testclient import TestClient

from app.db.session import SessionLocal
from app.main import create_app
from app.seed import (
    CASE_REPORT_ID,
    RECORDING_6_ID,
    SESSION_6_ID,
    seed_demo_data,
)
from tests.fake_storage import FakeStorage
from tests.helpers import auth_headers, profile_access_headers


def test_profile_child_resources_require_matching_page_grant() -> None:
    storage = FakeStorage()
    with SessionLocal() as database:
        seed_demo_data(database, storage)
    api = TestClient(create_app(storage=storage))

    protected_requests = [
        (
            "get",
            f"/api/v1/attachments?owner_type=session&owner_id={SESSION_6_ID}",
        ),
        ("get", "/api/v1/files/file-scale-6/download-url"),
        ("get", f"/api/v1/recordings/{RECORDING_6_ID}/transcript"),
        ("get", f"/api/v1/recordings/{RECORDING_6_ID}/summary"),
        ("get", f"/api/v1/reports/{CASE_REPORT_ID}"),
    ]

    for method, path in protected_requests:
        blocked = getattr(api, method)(path, headers=auth_headers())
        assert blocked.status_code == 403
        assert blocked.json()["error"]["code"] == "profile_access_grant_required"

    wrong_type_headers = profile_access_headers(api, "supervisor")
    for method, path in protected_requests:
        blocked = getattr(api, method)(path, headers=wrong_type_headers)
        assert blocked.status_code == 403
        assert blocked.json()["error"]["code"] == "profile_access_grant_invalid"

    client_headers = profile_access_headers(api, "client")
    for method, path in protected_requests:
        allowed = getattr(api, method)(path, headers=client_headers)
        assert allowed.status_code == 200


def test_unarchived_recording_processing_does_not_require_profile_grant() -> None:
    api = TestClient(create_app(storage=FakeStorage()))

    created = api.post(
        "/api/v1/recordings",
        headers=auth_headers(),
        json={"title": "尚未归档的录音", "source_type": "uploaded_audio"},
    )

    assert created.status_code == 201
