from fastapi.testclient import TestClient
from sqlalchemy.exc import SQLAlchemyError

from app.main import create_app
from app.core.config import Settings
from app.seed import seed_demo_data
from app.db.session import SessionLocal
from app.services.system_config import get_ai_model_config
from tests.fake_storage import FakeStorage
from tests.helpers import auth_headers


def seeded_client() -> TestClient:
    with SessionLocal() as database:
        seed_demo_data(database)
    return TestClient(create_app(storage=FakeStorage()))


def test_ai_model_config_can_be_managed_with_masked_key() -> None:
    api = seeded_client()

    default = api.get("/api/v1/admin/config/ai-model", headers=auth_headers())
    assert default.status_code == 200
    assert default.json()["provider_options"] == ["bailian", "deterministic"]
    assert default.json()["asr"]["provider_options"] == ["bailian", "deterministic"]
    assert "openai_compatible" in default.json()["llm"]["provider_options"]
    assert default.json()["models"]["summary"] == "qwen-plus"

    updated = api.put(
        "/api/v1/admin/config/ai-model",
        headers=auth_headers(),
        json={
            "provider": "bailian",
            "base_url": "https://dashscope.aliyuncs.com/",
            "api_key": "sk-test-123456",
            "audio_input_mode": "minio_url",
            "models": {
                "asr": "fun-asr",
                "local_asr": "qwen3-asr-flash",
                "summary": "qwen-plus",
                "report": "qwen-max",
                "supervision": "qwen-turbo",
            },
            "timeout_seconds": 90,
            "poll_interval_seconds": 2,
            "max_poll_attempts": 60,
        },
    )

    assert updated.status_code == 200
    assert updated.json()["base_url"] == "https://dashscope.aliyuncs.com"
    assert updated.json()["asr"]["base_url"] == "https://dashscope.aliyuncs.com"
    assert updated.json()["llm"]["base_url"] == "https://dashscope.aliyuncs.com/compatible-mode/v1"
    assert updated.json()["api_key_set"] is True
    assert updated.json()["api_key_preview"] == "***3456"
    assert updated.json()["models"]["report"] == "qwen-max"
    assert "api_key" not in updated.json()


def test_ai_model_config_rejects_unknown_provider() -> None:
    api = seeded_client()

    response = api.put(
        "/api/v1/admin/config/ai-model",
        headers=auth_headers(),
        json={
            "provider": "unknown",
            "base_url": "https://example.com",
            "audio_input_mode": "base64",
            "models": {
                "asr": "asr",
                "local_asr": "local-asr",
                "summary": "summary",
                "report": "report",
                "supervision": "supervision",
            },
            "timeout_seconds": 90,
            "poll_interval_seconds": 2,
            "max_poll_attempts": 60,
        },
    )

    assert response.status_code == 422
    assert response.json()["error"]["code"] == "ai_provider_invalid"


def test_ai_model_config_falls_back_when_config_store_is_unavailable() -> None:
    class BrokenSession:
        def get(self, *_: object) -> object:
            raise SQLAlchemyError("config store unavailable")

    config = get_ai_model_config(
        BrokenSession(),  # type: ignore[arg-type]
        Settings(recording_ai_provider="bailian", bailian_api_key="env-key"),
    )

    assert config.asr_provider == "bailian"
    assert config.llm_provider == "bailian"
    assert config.asr_api_key == "env-key"
    assert config.llm_api_key == "env-key"
