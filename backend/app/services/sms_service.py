"""短信发送服务（阿里云短信 Dysmsapi）。用于发送手机验证码等事务短信。

与 email_service 保持一致的设计：本模块只负责「把验证码发到短信通道」。
是否回退 dev_code（未配置短信时）由 phone_verification 决定，保持与生产 fail-fast 一致。
"""
from app.api.errors import ApiError
from app.core.config import Settings, get_settings


def is_sms_configured(settings: Settings | None = None) -> bool:
    settings = settings or get_settings()
    return bool(
        settings.sms_access_key_id
        and settings.sms_access_key_secret
        and settings.sms_sign_name
    )


def _template_for(purpose: str, settings: Settings) -> str:
    template = {
        "register": settings.sms_template_register,
        "login": settings.sms_template_login,
        "reset_password": settings.sms_template_reset_password,
    }.get(purpose, "")
    if not template:
        raise ApiError(
            503,
            "sms_template_not_configured",
            "短信模板未配置，请联系管理员。",
        )
    return template


def send_verification_sms(
    phone: str,
    code: str,
    purpose: str,
    settings: Settings | None = None,
) -> None:
    settings = settings or get_settings()
    if not is_sms_configured(settings):
        raise ApiError(503, "sms_not_configured", "短信服务暂不可用，待短信资质开通后启用。")

    template_code = _template_for(purpose, settings)
    purpose_text = {
        "register": "注册咨询师助手账号",
        "login": "登录咨询师助手",
        "reset_password": "重置登录密码",
    }.get(purpose, "验证手机")

    try:
        from alibabacloud_dysmsapi20170525.client import Client as DysmsapiClient
        from alibabacloud_dysmsapi20170525 import models as dysmsapi_models
        from alibabacloud_tea_openapi import models as open_api_models
        from alibabacloud_tea_util import models as util_models

        client_config = open_api_models.Config(
            access_key_id=settings.sms_access_key_id,
            access_key_secret=settings.sms_access_key_secret,
        )
        client_config.endpoint = settings.sms_endpoint
        client = DysmsapiClient(client_config)
        request = dysmsapi_models.SendSmsRequest(
            phone_numbers=phone,
            sign_name=settings.sms_sign_name,
            template_code=template_code,
            template_param=f'{{"code":"{code}"}}',
        )
        runtime = util_models.RuntimeOptions()
        response = client.send_sms_with_options(request, runtime)
        body = response.body
        if body is None or body.code != "OK":
            raise ApiError(
                502,
                "sms_send_failed",
                f"短信发送失败（{body.code if body else 'no response'}），请稍后重试。",
            )
    except ApiError:
        raise
    except Exception as exc:
        raise ApiError(502, "sms_send_failed", "短信发送失败，请稍后重试。") from exc
