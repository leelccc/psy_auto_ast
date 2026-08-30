from typing import Protocol

from app.core.config import Settings
from app.services.ai.bailian import BailianRecordingAIProvider
from app.services.ai.base import RecordingAIProvider
from app.services.ai.deterministic import DeterministicAIProvider
from app.services.system_config import AIModelConfig


class ReportAIProvider(Protocol):
    def generate_report(
        self,
        *,
        report_type: str,
        title: str,
        source_labels: list[str],
        prompt: object = None,
    ) -> dict[str, object]: ...


def create_recording_ai_provider(settings: Settings) -> RecordingAIProvider:
    if settings.recording_ai_provider == "deterministic":
        return DeterministicAIProvider()
    if settings.recording_ai_provider == "bailian":
        return BailianRecordingAIProvider(
            api_key=settings.bailian_api_key,
            asr_model=settings.bailian_asr_model,
            local_asr_model=settings.bailian_local_asr_model,
            summary_model=settings.bailian_summary_model,
            base_url=settings.bailian_base_url,
            timeout_seconds=settings.bailian_timeout_seconds,
            poll_interval_seconds=settings.bailian_poll_interval_seconds,
            max_poll_attempts=settings.bailian_max_poll_attempts,
        )
    raise ValueError(f"不支持的录音 AI Provider：{settings.recording_ai_provider}")


def create_report_ai_provider(settings: Settings) -> ReportAIProvider:
    """报告生成 Provider：配置了百炼密钥且显式开启时使用真实 LLM，否则回退确定性草稿。"""
    if (
        settings.report_ai_provider == "bailian"
        and settings.bailian_api_key.strip()
    ):
        return BailianRecordingAIProvider(
            api_key=settings.bailian_api_key,
            asr_model=settings.bailian_asr_model,
            local_asr_model=settings.bailian_local_asr_model,
            summary_model=settings.bailian_summary_model,
            base_url=settings.bailian_base_url,
            report_model=settings.bailian_report_model,
            timeout_seconds=settings.bailian_timeout_seconds,
            poll_interval_seconds=settings.bailian_poll_interval_seconds,
            max_poll_attempts=settings.bailian_max_poll_attempts,
        )
    return DeterministicAIProvider()


def create_recording_ai_provider_from_config(config: AIModelConfig) -> RecordingAIProvider:
    if config.asr_provider == "deterministic":
        return DeterministicAIProvider()
    if config.asr_provider == "bailian":
        return BailianRecordingAIProvider(
            api_key=config.asr_api_key,
            asr_model=config.asr_model,
            local_asr_model=config.local_asr_model,
            summary_model=config.summary_model,
            base_url=config.asr_base_url,
            llm_api_key=config.llm_api_key,
            llm_base_url=config.llm_base_url,
            timeout_seconds=config.timeout_seconds,
            poll_interval_seconds=config.poll_interval_seconds,
            max_poll_attempts=config.max_poll_attempts,
        )
    raise ValueError(f"不支持的语音识别供应商：{config.asr_provider}")
