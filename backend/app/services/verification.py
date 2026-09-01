"""邮箱验证码的签发与校验。"""
import hmac
import secrets
from datetime import timedelta
from hashlib import sha256
from uuid import uuid4

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.errors import ApiError
from app.core.config import Settings, get_settings
from app.models import EmailVerificationCode
from app.services.auth import utc_now
from app.services.email_service import (
    is_email_configured,
    send_verification_email,
)

VALID_PURPOSES = {"register", "reset_password"}


def _hash_code(code: str) -> str:
    return sha256(code.encode("utf-8")).hexdigest()


def issue_verification_code(
    database: Session,
    email: str,
    purpose: str,
    settings: Settings | None = None,
) -> dict[str, object]:
    settings = settings or get_settings()
    if purpose not in VALID_PURPOSES:
        raise ApiError(422, "verification_purpose_invalid", "不支持的验证码用途。")

    now = utc_now()
    cooldown_before = now - timedelta(seconds=settings.verification_code_retry_seconds)
    recent = database.scalar(
        select(EmailVerificationCode.id).where(
            EmailVerificationCode.email == email,
            EmailVerificationCode.purpose == purpose,
            EmailVerificationCode.consumed_at.is_(None),
            EmailVerificationCode.created_at >= cooldown_before,
        )
    )
    if recent is not None:
        raise ApiError(
            429,
            "verification_code_sent_recently",
            f"验证码已发送，请 {settings.verification_code_retry_seconds} 秒后再试。",
        )

    # 作废同一邮箱+用途的旧验证码，保证只有最新一条有效
    for stale in database.scalars(
        select(EmailVerificationCode).where(
            EmailVerificationCode.email == email,
            EmailVerificationCode.purpose == purpose,
            EmailVerificationCode.consumed_at.is_(None),
        )
    ).all():
        stale.consumed_at = now

    code = "".join(str(secrets.randbelow(10)) for _ in range(settings.verification_code_length))
    database.add(EmailVerificationCode(
        id=str(uuid4()),
        email=email,
        purpose=purpose,
        code_hash=_hash_code(code),
        expires_at=now + timedelta(minutes=settings.verification_code_minutes),
        consumed_at=None,
        attempts=0,
        created_at=now,
    ))
    database.commit()

    if is_email_configured(settings):
        send_verification_email(email, code, purpose, settings)
        return {
            "sent": True,
            "expire_seconds": settings.verification_code_minutes * 60,
            "retry_seconds": settings.verification_code_retry_seconds,
        }

    # 未配置 SMTP：生产环境不允许明文回传，开发环境回传 dev_code 便于联调
    if settings.environment == "production":
        raise ApiError(503, "email_not_configured", "邮件服务未配置，请联系管理员。")
    return {
        "sent": False,
        "dev_code": code,
        "expire_seconds": settings.verification_code_minutes * 60,
        "retry_seconds": settings.verification_code_retry_seconds,
    }


def consume_verification_code(
    database: Session,
    email: str,
    purpose: str,
    code: str,
    settings: Settings | None = None,
) -> None:
    settings = settings or get_settings()
    now = utc_now()
    stored = database.scalar(
        select(EmailVerificationCode)
        .where(
            EmailVerificationCode.email == email,
            EmailVerificationCode.purpose == purpose,
            EmailVerificationCode.consumed_at.is_(None),
            EmailVerificationCode.expires_at > now,
        )
        .order_by(EmailVerificationCode.created_at.desc())
    )
    if stored is None:
        raise ApiError(400, "verification_code_invalid", "验证码无效或已过期，请重新获取。")

    stored.attempts += 1
    if stored.attempts > settings.verification_code_max_attempts:
        stored.consumed_at = now
        database.commit()
        raise ApiError(400, "verification_code_invalid", "尝试次数过多，请重新获取验证码。")

    if not hmac.compare_digest(_hash_code(code.strip()), stored.code_hash):
        database.commit()
        raise ApiError(400, "verification_code_invalid", "验证码不正确。")

    stored.consumed_at = now
    database.commit()
