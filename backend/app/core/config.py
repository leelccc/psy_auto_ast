from functools import lru_cache
from typing import Literal

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    database_url: str = "postgresql+psycopg://psy_auto_ast:psy_auto_ast_dev@127.0.0.1:55432/psy_auto_ast"
    minio_endpoint: str = "127.0.0.1:59000"
    minio_root_user: str = "psy_auto_ast"
    minio_root_password: str = "psy_auto_ast_minio_dev"
    minio_bucket: str = "psy-auto-ast"
    minio_secure: bool = False
    jwt_secret_key: str = "psy-auto-ast-local-development-secret-change-me"
    access_token_minutes: int = 30
    refresh_token_days: int = 30
    profile_access_grant_minutes: int = 60
    recording_ai_provider: Literal["deterministic", "bailian"] = "deterministic"
    recording_audio_input_mode: Literal["base64", "minio_url"] = "base64"
    bailian_api_key: str = ""
    bailian_asr_model: str = "fun-asr"
    bailian_local_asr_model: str = "qwen3-asr-flash"
    bailian_summary_model: str = "qwen-plus"
    bailian_base_url: str = "https://dashscope.aliyuncs.com"
    bailian_timeout_seconds: float = 120
    bailian_poll_interval_seconds: float = 1
    bailian_max_poll_attempts: int = 120

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )


@lru_cache
def get_settings() -> Settings:
    return Settings()
