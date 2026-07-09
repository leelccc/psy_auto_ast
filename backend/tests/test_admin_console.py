from fastapi.testclient import TestClient

from app.main import create_app
from tests.fake_storage import FakeStorage


def test_admin_console_contains_user_and_model_management_frontend() -> None:
    api = TestClient(create_app(storage=FakeStorage()))

    response = api.get("/admin")

    assert response.status_code == 200
    assert "后台管理" in response.text
    assert "用户管理" in response.text
    assert "大模型配置" in response.text
    assert "/api/v1/admin/users" in response.text
    assert "/api/v1/admin/config/ai-model" in response.text
    assert "saveSelectedUser" in response.text
    assert "saveAiConfig" in response.text
    assert 'id="token" type="hidden"' in response.text
    assert "Access Token" not in response.text
