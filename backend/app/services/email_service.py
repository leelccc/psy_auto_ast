"""邮件发送服务（smtplib）。用于发送邮箱验证码等事务邮件。"""
import smtplib
from email.header import Header
from email.mime.text import MIMEText
from email.utils import formataddr

from app.api.errors import ApiError
from app.core.config import Settings, get_settings


def is_email_configured(settings: Settings | None = None) -> bool:
    settings = settings or get_settings()
    return bool(settings.smtp_host and settings.smtp_username and settings.smtp_password)


def send_verification_email(
    email: str,
    code: str,
    purpose: str,
    settings: Settings | None = None,
) -> None:
    settings = settings or get_settings()
    if not is_email_configured(settings):
        raise ApiError(503, "email_not_configured", "邮件服务未配置，请联系管理员。")

    purpose_text = {
        "register": "注册咨询师助手账号",
        "reset_password": "重置登录密码",
    }.get(purpose, "验证邮箱")

    subject = f"【咨询师助手】{purpose_text}验证码"
    minutes = settings.verification_code_minutes
    body = (
        f"<div style=\"font-family:'PingFang SC','Microsoft YaHei',sans-serif;max-width:480px;margin:0 auto;"
        f"padding:24px;color:#2b2b2b;line-height:1.7\">"
        f"<h2 style=\"margin:0 0 12px;font-size:18px\">咨询师助手</h2>"
        f"<p style=\"margin:0 0 16px\">你正在{ purpose_text }。验证码如下（{minutes} 分钟内有效）：</p>"
        f"<div style=\"font-size:32px;font-weight:700;letter-spacing:8px;text-align:center;"
        f"padding:16px;background:#f5efe9;border-radius:10px;margin:0 0 16px\">{code}</div>"
        f"<p style=\"margin:0;font-size:13px;color:#8a8a8a\">"
        f"如果这不是你本人的操作，请忽略本邮件。验证码请勿泄露给他人。</p>"
        f"</div>"
    )
    _send(
        settings=settings,
        to=email,
        subject=subject,
        html=body,
    )


def _send(settings: Settings, to: str, subject: str, html: str) -> None:
    from_addr = settings.smtp_from or settings.smtp_username
    message = MIMEText(html, "html", "utf-8")
    message["Subject"] = Header(subject, "utf-8")
    message["From"] = formataddr((str(Header("咨询师助手", "utf-8")), from_addr))
    message["To"] = to

    try:
        if settings.smtp_use_ssl:
            server = smtplib.SMTP_SSL(settings.smtp_host, settings.smtp_port, timeout=15)
        else:
            server = smtplib.SMTP(settings.smtp_host, settings.smtp_port, timeout=15)
            server.starttls()
        try:
            server.login(settings.smtp_username, settings.smtp_password)
            server.sendmail(from_addr, [to], message.as_string())
        finally:
            server.quit()
    except ApiError:
        raise
    except Exception as exc:
        raise ApiError(502, "email_send_failed", "验证码邮件发送失败，请稍后重试。") from exc
