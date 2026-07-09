import httpx
from fastapi.testclient import TestClient

from app.main import create_app


def auth_headers() -> dict[str, str]:
    return {"Authorization": "Bearer demo-token"}


def test_presigned_minio_upload_and_download_preserve_exact_bytes() -> None:
    api = TestClient(create_app())
    body = b"%PDF-1.7\npsy-auto-ast-minio-integration\n%%EOF\n"

    create_response = api.post(
        "/api/v1/files",
        headers=auth_headers(),
        json={
            "filename": "integration.pdf",
            "mime_type": "application/pdf",
            "size_bytes": len(body),
            "purpose": "attachment",
        },
    )
    assert create_response.status_code == 201
    created = create_response.json()

    upload_response = httpx.put(
        created["upload_url"],
        content=body,
        headers=created["upload_headers"],
        timeout=10,
    )
    assert upload_response.status_code == 200

    complete_response = api.post(
        f"/api/v1/files/{created['file_id']}/complete",
        headers=auth_headers(),
    )
    assert complete_response.status_code == 200

    download_url_response = api.get(
        f"/api/v1/files/{created['file_id']}/download-url",
        headers=auth_headers(),
    )
    assert download_url_response.status_code == 200

    download_response = httpx.get(
        download_url_response.json()["download_url"],
        timeout=10,
    )
    assert download_response.status_code == 200
    assert download_response.content == body

    delete_response = api.delete(
        f"/api/v1/files/{created['file_id']}",
        headers=auth_headers(),
    )
    assert delete_response.status_code == 200
