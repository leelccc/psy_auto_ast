"""手机号登录 / 注册 / 重置密码闭环测试。

本地（development）未配置短信时，发送验证码接口会回传 dev_code，本测试据此驱动全流程。
"""
import secrets
from fastapi.testclient import TestClient
from sqlalchemy import func, select

from app.core.config import Settings
from app.db.session import SessionLocal
from app.main import create_app
from app.models import PhoneVerificationCode
from app.services.phone_verification import issue_verification_code


def client() -> TestClient:
    return TestClient(create_app())


def fresh_phone() -> str:
    # 随机手机号，避免与历史运行残留数据冲突（数据库在测试间不重置）
    return "138" + "".join(secrets.choice("0123456789") for _ in range(8))


def send_code(api: TestClient, phone: str, purpose: str) -> dict:
    resp = api.post(
        "/api/v1/auth/phone/verification-code",
        json={"phone": phone, "purpose": purpose},
    )
    assert resp.status_code == 200, resp.text
    return resp.json()


def dev_code(api: TestClient, phone: str, purpose: str) -> str:
    return send_code(api, phone, purpose)["dev_code"]


def test_phone_register_login_refresh_and_code_login() -> None:
    api = client()
    phone = fresh_phone()

    # 注册用途：未注册时先发码成功
    code = dev_code(api, phone, "register")
    reg = api.post(
        "/api/v1/auth/phone/register",
        json={
            "phone": phone,
            "password": "Strong-pass-2026",
            "display_name": "手机号咨询师",
            "code": code,
        },
    )
    assert reg.status_code == 201
    tokens = reg.json()
    assert tokens["token_type"] == "bearer"
    assert "access_token" in tokens

    # 重复注册：已存在手机号（用 login 用途取码，避免触发注册用途的已存在校验）
    login_verification_code = dev_code(api, phone, "login")
    dup = api.post(
        "/api/v1/auth/phone/register",
        json={
            "phone": phone,
            "password": "Strong-pass-2026",
            "display_name": "重复",
            "code": login_verification_code,
        },
    )
    assert dup.status_code == 409
    assert dup.json()["error"]["code"] == "phone_already_registered"

    # 密码登录
    login = api.post(
        "/api/v1/auth/phone/login",
        json={"phone": phone, "password": "Strong-pass-2026"},
    )
    assert login.status_code == 200

    # 验证码登录（已存在账号）
    code_login = api.post(
        "/api/v1/auth/phone/login-code",
        json={"phone": phone, "code": login_verification_code},
    )
    assert code_login.status_code == 200

    # me 返回 phone、email 为 null
    me = api.get(
        "/api/v1/me",
        headers={"Authorization": f"Bearer {tokens['access_token']}"},
    )
    assert me.status_code == 200
    body = me.json()
    assert body["phone"] == phone
    assert body["email"] is None
    assert "password_hash" not in body


def test_phone_code_login_auto_registers_unknown_phone() -> None:
    api = client()
    phone = fresh_phone()

    # 首次验证码登录：自动注册
    resp = api.post(
        "/api/v1/auth/phone/login-code",
        json={"phone": phone, "code": dev_code(api, phone, "login")},
    )
    assert resp.status_code == 200
    assert resp.json()["access_token"]

    # 自动注册后该手机号已存在，再次用 login 用途取码注册应冲突
    dup = api.post(
        "/api/v1/auth/phone/register",
        json={
            "phone": phone,
            "password": "Strong-pass-2026",
            "display_name": "重复",
            "code": dev_code(api, phone, "login"),
        },
    )
    assert dup.status_code == 409


def test_phone_reset_password_flow() -> None:
    api = client()
    phone = fresh_phone()

    # 先用注册建立带密码的账号
    api.post(
        "/api/v1/auth/phone/register",
        json={
            "phone": phone,
            "password": "Old-pass-2026",
            "display_name": "待重置",
            "code": dev_code(api, phone, "register"),
        },
    )

    # 重置密码：用 reset_password 用途验证码
    reset = api.post(
        "/api/v1/auth/phone/reset-password",
        json={
            "phone": phone,
            "code": dev_code(api, phone, "reset_password"),
            "new_password": "New-pass-2026",
        },
    )
    assert reset.status_code == 200

    # 旧密码不再可用，新密码可用
    old = api.post("/api/v1/auth/phone/login", json={"phone": phone, "password": "Old-pass-2026"})
    assert old.status_code == 401
    new = api.post("/api/v1/auth/phone/login", json={"phone": phone, "password": "New-pass-2026"})
    assert new.status_code == 200


def test_phone_validation_and_error_codes() -> None:
    api = client()

    # 非法手机号格式
    bad = api.post(
        "/api/v1/auth/phone/verification-code",
        json={"phone": "123", "purpose": "register"},
    )
    assert bad.status_code == 422
    assert bad.json()["error"]["code"] == "phone_invalid"

    # 注册用途：手机号已存在则冲突
    phone = fresh_phone()
    api.post(
        "/api/v1/auth/phone/register",
        json={
            "phone": phone,
            "password": "Strong-pass-2026",
            "display_name": "X",
            "code": dev_code(api, phone, "register"),
        },
    )
    conflict = api.post(
        "/api/v1/auth/phone/verification-code",
        json={"phone": phone, "purpose": "register"},
    )
    assert conflict.status_code == 409

    # 重置用途：手机号不存在则 404
    not_found = api.post(
        "/api/v1/auth/phone/verification-code",
        json={"phone": fresh_phone(), "purpose": "reset_password"},
    )
    assert not_found.status_code == 404
    assert not_found.json()["error"]["code"] == "phone_not_registered"


def test_phone_code_cooldown_and_wrong_code() -> None:
    api = client()
    phone = fresh_phone()

    # 首次发码成功（register 用途）
    first = send_code(api, phone, "register")
    assert first["retry_seconds"] > 0

    # 冷却期内再次发 register 码应 429（同用途）
    again = api.post(
        "/api/v1/auth/phone/verification-code",
        json={"phone": phone, "purpose": "register"},
    )
    assert again.status_code == 429
    assert again.json()["error"]["code"] == "verification_code_sent_recently"

    # 不同用途（login）不受 register 冷却影响，可独立发码
    login_code = api.post(
        "/api/v1/auth/phone/verification-code",
        json={"phone": phone, "purpose": "login"},
    )
    assert login_code.status_code == 200

    # 用错误验证码注册应失败
    reg = api.post(
        "/api/v1/auth/phone/register",
        json={
            "phone": phone,
            "password": "Strong-pass-2026",
            "display_name": "X",
            "code": "000000",
        },
    )
    assert reg.status_code == 400
    assert reg.json()["error"]["code"] == "verification_code_invalid"


def test_production_without_sms_credentials_does_not_create_a_cooldown_code() -> None:
    phone = fresh_phone()
    settings = Settings(environment="production", jwt_secret_key="test-secret-that-is-long-enough")
    with SessionLocal() as database:
        try:
            issue_verification_code(database, phone, "login", settings)
            raise AssertionError("production without SMS credentials must fail")
        except Exception as error:
            assert getattr(error, "detail", {}).get("code") == "sms_not_configured"
        count = database.scalar(select(func.count()).select_from(PhoneVerificationCode).where(
            PhoneVerificationCode.phone == phone,
        ))
        assert count == 0
