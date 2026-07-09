from typing import Annotated

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.api.dependencies import current_admin_user_id
from app.api.errors import ApiError
from app.db.session import get_db
from app.services.system_config import (
    AIModelConfig,
    get_ai_model_config,
    upsert_ai_model_config,
)


router = APIRouter(prefix="/api/v1/admin/config", tags=["admin-config"])
PROVIDERS = {"deterministic", "bailian"}
LLM_PROVIDERS = {"deterministic", "bailian", "openai_compatible"}
AUDIO_INPUT_MODES = {"base64", "minio_url"}


class ASRConfigRequest(BaseModel):
    provider: str
    base_url: str = Field(min_length=1, max_length=255)
    api_key: str | None = Field(default=None, max_length=512)
    audio_input_mode: str
    model: str = Field(min_length=1, max_length=120)
    local_model: str = Field(min_length=1, max_length=120)


class LLMConfigRequest(BaseModel):
    provider: str
    base_url: str = Field(min_length=1, max_length=255)
    api_key: str | None = Field(default=None, max_length=512)
    summary_model: str = Field(min_length=1, max_length=120)
    report_model: str = Field(min_length=1, max_length=120)
    supervision_model: str = Field(min_length=1, max_length=120)


class AIModelsRequest(BaseModel):
    asr: str = Field(min_length=1, max_length=120)
    local_asr: str = Field(min_length=1, max_length=120)
    summary: str = Field(min_length=1, max_length=120)
    report: str = Field(min_length=1, max_length=120)
    supervision: str = Field(min_length=1, max_length=120)


class UpdateAIModelConfigRequest(BaseModel):
    asr: ASRConfigRequest | None = None
    llm: LLMConfigRequest | None = None
    provider: str | None = None
    base_url: str | None = Field(default=None, min_length=1, max_length=255)
    api_key: str | None = Field(default=None, max_length=512)
    audio_input_mode: str | None = None
    models: AIModelsRequest | None = None
    timeout_seconds: float = Field(gt=0, le=600)
    poll_interval_seconds: float = Field(gt=0, le=30)
    max_poll_attempts: int = Field(gt=0, le=1000)


def masked_key(value: str) -> str | None:
    return f"***{value[-4:]}" if value else None


def serialize_ai_config(config: AIModelConfig) -> dict[str, object]:
    return {
        "asr": {
            "provider": config.asr_provider,
            "provider_options": sorted(PROVIDERS),
            "base_url": config.asr_base_url,
            "api_key_set": bool(config.asr_api_key),
            "api_key_preview": masked_key(config.asr_api_key),
            "audio_input_mode": config.audio_input_mode,
            "audio_input_mode_options": sorted(AUDIO_INPUT_MODES),
            "model": config.asr_model,
            "local_model": config.local_asr_model,
        },
        "llm": {
            "provider": config.llm_provider,
            "provider_options": sorted(LLM_PROVIDERS),
            "base_url": config.llm_base_url,
            "api_key_set": bool(config.llm_api_key),
            "api_key_preview": masked_key(config.llm_api_key),
            "summary_model": config.summary_model,
            "report_model": config.report_model,
            "supervision_model": config.supervision_model,
        },
        "provider": config.asr_provider,
        "provider_options": sorted(PROVIDERS),
        "base_url": config.asr_base_url,
        "api_key_set": bool(config.asr_api_key),
        "api_key_preview": masked_key(config.asr_api_key),
        "audio_input_mode": config.audio_input_mode,
        "audio_input_mode_options": sorted(AUDIO_INPUT_MODES),
        "models": {
            "asr": config.asr_model,
            "local_asr": config.local_asr_model,
            "summary": config.summary_model,
            "report": config.report_model,
            "supervision": config.supervision_model,
        },
        "timeout_seconds": config.timeout_seconds,
        "poll_interval_seconds": config.poll_interval_seconds,
        "max_poll_attempts": config.max_poll_attempts,
    }


@router.get("/ai-model")
def get_ai_model_configuration(
    user_id: Annotated[str, Depends(current_admin_user_id)],
    database: Annotated[Session, Depends(get_db)],
) -> dict[str, object]:
    _ = user_id
    return serialize_ai_config(get_ai_model_config(database))


@router.put("/ai-model")
def update_ai_model_configuration(
    payload: UpdateAIModelConfigRequest,
    user_id: Annotated[str, Depends(current_admin_user_id)],
    database: Annotated[Session, Depends(get_db)],
) -> dict[str, object]:
    _ = user_id
    current = get_ai_model_config(database)
    asr = payload.asr or ASRConfigRequest(
        provider=payload.provider or current.asr_provider,
        base_url=payload.base_url or current.asr_base_url,
        api_key=payload.api_key,
        audio_input_mode=payload.audio_input_mode or current.audio_input_mode,
        model=payload.models.asr if payload.models else current.asr_model,
        local_model=payload.models.local_asr if payload.models else current.local_asr_model,
    )
    llm = payload.llm or LLMConfigRequest(
        provider=payload.provider or current.llm_provider,
        base_url=_legacy_llm_base_url(payload.base_url or current.llm_base_url, payload.provider or current.llm_provider),
        api_key=payload.api_key,
        summary_model=payload.models.summary if payload.models else current.summary_model,
        report_model=payload.models.report if payload.models else current.report_model,
        supervision_model=payload.models.supervision if payload.models else current.supervision_model,
    )
    if asr.provider not in PROVIDERS:
        raise ApiError(422, "ai_provider_invalid", "不支持的语音识别供应商。")
    if llm.provider not in LLM_PROVIDERS:
        raise ApiError(422, "llm_provider_invalid", "不支持的大语言模型供应商。")
    if asr.audio_input_mode not in AUDIO_INPUT_MODES:
        raise ApiError(422, "audio_input_mode_invalid", "不支持的音频输入模式。")
    asr_api_key = current.asr_api_key if asr.api_key is None else asr.api_key.strip()
    llm_api_key = current.llm_api_key if llm.api_key is None else llm.api_key.strip()
    upsert_ai_model_config(database, {
        "asr": {
            "provider": asr.provider,
            "base_url": asr.base_url.rstrip("/"),
            "api_key": asr_api_key,
            "model": asr.model,
            "local_model": asr.local_model,
        },
        "llm": {
            "provider": llm.provider,
            "base_url": llm.base_url.rstrip("/"),
            "api_key": llm_api_key,
            "summary_model": llm.summary_model,
            "report_model": llm.report_model,
            "supervision_model": llm.supervision_model,
        },
        "audio_input_mode": asr.audio_input_mode,
        "timeout_seconds": payload.timeout_seconds,
        "poll_interval_seconds": payload.poll_interval_seconds,
        "max_poll_attempts": payload.max_poll_attempts,
    })
    return serialize_ai_config(get_ai_model_config(database))


def _legacy_llm_base_url(base_url: str, provider: str) -> str:
    if provider == "bailian" and not base_url.rstrip("/").endswith("/compatible-mode/v1"):
        return f"{base_url.rstrip('/')}/compatible-mode/v1"
    return base_url
