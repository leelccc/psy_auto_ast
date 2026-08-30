from functools import lru_cache
from typing import Literal

from pydantic_settings import BaseSettings, SettingsConfigDict

# 开发环境默认 JWT 密钥；生产环境必须通过 JWT_SECRET_KEY 覆盖，否则启动会失败。
DEV_JWT_SECRET = "psy-auto-ast-local-development-secret-change-me"


class Settings(BaseSettings):
    database_url: str = "postgresql+psycopg://psy_auto_ast:psy_auto_ast_dev@127.0.0.1:55432/psy_auto_ast"
    minio_endpoint: str = "127.0.0.1:59000"
    minio_root_user: str = "psy_auto_ast"
    minio_root_password: str = "psy_auto_ast_minio_dev"
    minio_bucket: str = "psy-auto-ast"
    minio_secure: bool = False
    jwt_secret_key: str = DEV_JWT_SECRET
    environment: Literal["development", "production"] = "development"
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
    # 报告生成（咨询记录/督导/个案报告）使用的 AI Provider；未配置百炼密钥时回退 deterministic。
    report_ai_provider: Literal["deterministic", "bailian"] = "deterministic"
    bailian_report_model: str = "qwen-plus"
    # 微信开放平台登录。Web 扫码与原生 SDK 用不同的应用（AppID/Secret 各自独立）。
    wechat_web_app_id: str = ""
    wechat_web_app_secret: str = ""
    # 微信回调到后端的地址，需在开放平台「授权回调域」登记。例：http://localhost:8000/api/v1/auth/wechat/web/callback
    wechat_web_redirect_uri: str = ""
    # 后端处理完跳回前端的地址（Web 端）。例：http://localhost:19000
    wechat_frontend_redirect_uri: str = ""
    wechat_mobile_app_id: str = ""
    wechat_mobile_app_secret: str = ""
    # 逗号分隔的来源白名单；原生 App 不走 CORS，仅 Web 端受影响
    cors_allow_origins: str = (
        "http://localhost:8081,"
        "http://127.0.0.1:8081,"
        "http://localhost:19000,"
        "http://127.0.0.1:19000,"
        "http://localhost:19006,"
        "http://127.0.0.1:19006"
    )

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )


@lru_cache
def get_settings() -> Settings:
    return Settings()
