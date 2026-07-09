from dataclasses import dataclass
from typing import Any

from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from app.core.config import Settings, get_settings
from app.models import SystemConfig
from app.services.auth import utc_now


AI_MODEL_CONFIG_KEY = "ai_model"


@dataclass(frozen=True)
class AIModelConfig:
    asr_provider: str
    asr_base_url: str
    asr_api_key: str
    audio_input_mode: str
    asr_model: str
    local_asr_model: str
    llm_provider: str
    llm_base_url: str
    llm_api_key: str
    summary_model: str
    report_model: str
    supervision_model: str
    timeout_seconds: float
    poll_interval_seconds: float
    max_poll_attempts: int


def default_ai_model_config(settings: Settings | None = None) -> AIModelConfig:
    settings = settings or get_settings()
    return AIModelConfig(
        asr_provider=settings.recording_ai_provider,
        asr_base_url=settings.bailian_base_url,
        asr_api_key=settings.bailian_api_key,
        audio_input_mode=settings.recording_audio_input_mode,
        asr_model=settings.bailian_asr_model,
        local_asr_model=settings.bailian_local_asr_model,
        llm_provider=settings.recording_ai_provider,
        llm_base_url=f"{settings.bailian_base_url.rstrip('/')}/compatible-mode/v1",
        llm_api_key=settings.bailian_api_key,
        summary_model=settings.bailian_summary_model,
        report_model="qwen-plus",
        supervision_model="qwen-plus",
        timeout_seconds=settings.bailian_timeout_seconds,
        poll_interval_seconds=settings.bailian_poll_interval_seconds,
        max_poll_attempts=settings.bailian_max_poll_attempts,
    )


def get_ai_model_config(database: Session, settings: Settings | None = None) -> AIModelConfig:
    base = default_ai_model_config(settings)
    try:
        stored = database.get(SystemConfig, AI_MODEL_CONFIG_KEY)
    except SQLAlchemyError:
        return base
    if stored is None:
        return base
    value = stored.value_json or {}
    asr = value.get("asr") if isinstance(value.get("asr"), dict) else {}
    llm = value.get("llm") if isinstance(value.get("llm"), dict) else {}
    models = value.get("models") if isinstance(value.get("models"), dict) else {}
    legacy_provider = str(value.get("provider") or base.asr_provider)
    legacy_base_url = str(value.get("base_url") or base.asr_base_url).rstrip("/")
    legacy_api_key = str(value.get("api_key") or base.asr_api_key)
    return AIModelConfig(
        asr_provider=str(asr.get("provider") or legacy_provider),
        asr_base_url=str(asr.get("base_url") or legacy_base_url),
        asr_api_key=str(asr.get("api_key") or legacy_api_key),
        audio_input_mode=str(value.get("audio_input_mode") or base.audio_input_mode),
        asr_model=str(asr.get("model") or models.get("asr") or base.asr_model),
        local_asr_model=str(asr.get("local_model") or models.get("local_asr") or base.local_asr_model),
        llm_provider=str(llm.get("provider") or legacy_provider),
        llm_base_url=str(llm.get("base_url") or _legacy_llm_base_url(legacy_base_url, legacy_provider)),
        llm_api_key=str(llm.get("api_key") or legacy_api_key),
        summary_model=str(llm.get("summary_model") or models.get("summary") or base.summary_model),
        report_model=str(llm.get("report_model") or models.get("report") or base.report_model),
        supervision_model=str(llm.get("supervision_model") or models.get("supervision") or base.supervision_model),
        timeout_seconds=float(value.get("timeout_seconds") or base.timeout_seconds),
        poll_interval_seconds=float(value.get("poll_interval_seconds") or base.poll_interval_seconds),
        max_poll_attempts=int(value.get("max_poll_attempts") or base.max_poll_attempts),
    )


def _legacy_llm_base_url(base_url: str, provider: str) -> str:
    if provider == "bailian" and not base_url.endswith("/compatible-mode/v1"):
        return f"{base_url.rstrip('/')}/compatible-mode/v1"
    return base_url


def upsert_ai_model_config(database: Session, value: dict[str, Any]) -> SystemConfig:
    now = utc_now()
    stored = database.get(SystemConfig, AI_MODEL_CONFIG_KEY)
    if stored is None:
        stored = SystemConfig(
            key=AI_MODEL_CONFIG_KEY,
            value_json=value,
            created_at=now,
            updated_at=now,
        )
        database.add(stored)
    else:
        stored.value_json = value
        stored.updated_at = now
    database.commit()
    return stored
