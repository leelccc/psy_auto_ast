import re
from typing import Annotated, Literal
from uuid import uuid4

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field, StringConstraints
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.dependencies import current_user_id
from app.api.errors import ApiError
from app.db.session import get_db
from app.models import RefreshToken, User
from app.services.auth import (
    hash_password,
    issue_token_pair,
    rotate_refresh_token,
    utc_now,
    verify_password,
)
from app.services.phone_verification import (
    consume_verification_code as consume_phone_code,
)
from app.services.phone_verification import (
    issue_verification_code as issue_phone_code,
)
from app.services.verification import consume_verification_code, issue_verification_code


router = APIRouter(prefix="/api/v1", tags=["auth"])
EMAIL_PATTERN = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
# 中国大陆手机号：1 开头，第二位 3-9，共 11 位。
PHONE_PATTERN = re.compile(r"^1[3-9]\d{9}$")
DisplayName = Annotated[
    str,
    StringConstraints(strip_whitespace=True, min_length=1, max_length=80),
]


def _normalize_email(email: str) -> str:
    email = email.strip().lower()
    if not EMAIL_PATTERN.match(email):
        raise ApiError(422, "email_invalid", "邮箱格式不正确。")
    return email


class SendCodeRequest(BaseModel):
    email: str = Field(max_length=254)
    purpose: Literal["register", "reset_password"]


class RegisterRequest(BaseModel):
    email: str = Field(max_length=254)
    password: str = Field(min_length=6, max_length=128)
    display_name: DisplayName
    code: str = Field(min_length=4, max_length=8)


class ResetPasswordRequest(BaseModel):
    email: str = Field(max_length=254)
    code: str = Field(min_length=4, max_length=8)
    new_password: str = Field(min_length=6, max_length=128)


class LoginRequest(BaseModel):
    email: str = Field(max_length=254)
    password: str = Field(max_length=128)


class SendPhoneCodeRequest(BaseModel):
    phone: str = Field(max_length=32)
    purpose: Literal["register", "login", "reset_password"]


class PhoneRegisterRequest(BaseModel):
    phone: str = Field(max_length=32)
    password: str = Field(min_length=6, max_length=128)
    display_name: DisplayName
    code: str = Field(min_length=4, max_length=8)


class PhoneLoginRequest(BaseModel):
    phone: str = Field(max_length=32)
    password: str = Field(max_length=128)


class PhoneCodeLoginRequest(BaseModel):
    phone: str = Field(max_length=32)
    code: str = Field(min_length=4, max_length=8)


class PhoneResetPasswordRequest(BaseModel):
    phone: str = Field(max_length=32)
    code: str = Field(min_length=4, max_length=8)
    new_password: str = Field(min_length=6, max_length=128)


class RefreshRequest(BaseModel):
    refresh_token: str = Field(min_length=20)


class UpdateMeRequest(BaseModel):
    display_name: DisplayName


def serialize_user(user: User) -> dict[str, object]:
    return {
        "id": user.id,
        "email": user.email,
        "phone": user.phone,
        "display_name": user.display_name,
        "role": user.role,
        "status": user.status,
        "plan_code": user.plan_code,
        "created_at": user.created_at.isoformat(),
        "updated_at": user.updated_at.isoformat(),
    }


def _normalize_phone(raw: str) -> str:
    phone = re.sub(r"\D", "", raw.strip())
    # 容忍用户输入 +86 / 0086 / 86 前缀
    if phone.startswith("86") and len(phone) == 13:
        phone = phone[2:]
    if not PHONE_PATTERN.match(phone):
        raise ApiError(422, "phone_invalid", "手机号格式不正确。")
    return phone


def _mask_phone(phone: str) -> str:
    return f"{phone[:3]}****{phone[7:]}" if len(phone) == 11 else phone


@router.post("/auth/verification-code")
def send_verification_code(
    payload: SendCodeRequest,
    database: Annotated[Session, Depends(get_db)],
) -> dict[str, object]:
    email = _normalize_email(payload.email)
    if payload.purpose == "register":
        if database.scalar(select(User.id).where(User.email == email)) is not None:
            raise ApiError(409, "email_already_registered", "该邮箱已注册，请直接登录。")
    else:  # reset_password
        if database.scalar(select(User.id).where(User.email == email)) is None:
            raise ApiError(404, "email_not_registered", "该邮箱尚未注册。")
    return issue_verification_code(database, email, payload.purpose)


@router.post("/auth/register", status_code=201)
def register(
    payload: RegisterRequest,
    database: Annotated[Session, Depends(get_db)],
) -> dict[str, object]:
    email = _normalize_email(payload.email)
    if database.scalar(select(User.id).where(User.email == email)) is not None:
        raise ApiError(409, "email_already_registered", "该邮箱已注册。")
    consume_verification_code(database, email, "register", payload.code)
    now = utc_now()
    user = User(
        id=str(uuid4()),
        email=email,
        display_name=payload.display_name.strip(),
        password_hash=hash_password(payload.password),
        role="user",
        status="active",
        plan_code="free",
        entitlements_json={},
        usage_json={},
        created_at=now,
        updated_at=now,
    )
    database.add(user)
    database.flush()
    return issue_token_pair(database, user.id)


@router.post("/auth/reset-password")
def reset_password(
    payload: ResetPasswordRequest,
    database: Annotated[Session, Depends(get_db)],
) -> dict[str, object]:
    email = _normalize_email(payload.email)
    user = database.scalar(select(User).where(User.email == email))
    if user is None:
        raise ApiError(404, "email_not_registered", "该邮箱尚未注册。")
    consume_verification_code(database, email, "reset_password", payload.code)
    user.password_hash = hash_password(payload.new_password)
    user.updated_at = utc_now()
    database.commit()
    # 重置成功后直接登录，返回令牌对
    return issue_token_pair(database, user.id)


@router.post("/auth/login")
def login(
    payload: LoginRequest,
    database: Annotated[Session, Depends(get_db)],
) -> dict[str, object]:
    user = database.scalar(
        select(User).where(User.email == payload.email.strip().lower())
    )
    if user is None or not verify_password(payload.password, user.password_hash):
        raise ApiError(401, "credentials_invalid", "邮箱或密码不正确。")
    if user.status != "active":
        raise ApiError(403, "account_disabled", "账号已被停用，请联系管理员。")
    return issue_token_pair(database, user.id)


# ---------------------------------------------------------------------------
# 手机号登录 / 注册 / 重置密码（与邮箱体系并行的独立通道）
# ---------------------------------------------------------------------------


@router.post("/auth/phone/verification-code")
def send_phone_verification_code(
    payload: SendPhoneCodeRequest,
    database: Annotated[Session, Depends(get_db)],
) -> dict[str, object]:
    phone = _normalize_phone(payload.phone)
    if payload.purpose == "register":
        if database.scalar(select(User.id).where(User.phone == phone)) is not None:
            raise ApiError(409, "phone_already_registered", "该手机号已注册，请直接登录。")
    elif payload.purpose == "reset_password":
        if database.scalar(select(User.id).where(User.phone == phone)) is None:
            raise ApiError(404, "phone_not_registered", "该手机号尚未注册。")
    # purpose == "login" 不校验是否存在：验证码登录允许首次使用自动注册
    return issue_phone_code(database, phone, payload.purpose)


@router.post("/auth/phone/register", status_code=201)
def register_phone(
    payload: PhoneRegisterRequest,
    database: Annotated[Session, Depends(get_db)],
) -> dict[str, object]:
    phone = _normalize_phone(payload.phone)
    if database.scalar(select(User.id).where(User.phone == phone)) is not None:
        raise ApiError(409, "phone_already_registered", "该手机号已注册。")
    consume_phone_code(database, phone, "register", payload.code)
    now = utc_now()
    user = User(
        id=str(uuid4()),
        phone=phone,
        display_name=payload.display_name.strip(),
        password_hash=hash_password(payload.password),
        role="user",
        status="active",
        plan_code="free",
        entitlements_json={},
        usage_json={},
        created_at=now,
        updated_at=now,
    )
    database.add(user)
    database.flush()
    return issue_token_pair(database, user.id)


@router.post("/auth/phone/login")
def login_phone(
    payload: PhoneLoginRequest,
    database: Annotated[Session, Depends(get_db)],
) -> dict[str, object]:
    phone = _normalize_phone(payload.phone)
    user = database.scalar(select(User).where(User.phone == phone))
    if user is None or not verify_password(payload.password, user.password_hash):
        raise ApiError(401, "credentials_invalid", "手机号或密码不正确。")
    if user.status != "active":
        raise ApiError(403, "account_disabled", "账号已被停用，请联系管理员。")
    return issue_token_pair(database, user.id)


@router.post("/auth/phone/login-code")
def login_phone_code(
    payload: PhoneCodeLoginRequest,
    database: Annotated[Session, Depends(get_db)],
) -> dict[str, object]:
    phone = _normalize_phone(payload.phone)
    consume_phone_code(database, phone, "login", payload.code)
    user = database.scalar(select(User).where(User.phone == phone))
    if user is not None:
        if user.status != "active":
            raise ApiError(403, "account_disabled", "账号已被停用，请联系管理员。")
        return issue_token_pair(database, user.id)
    # 首次使用验证码登录：自动注册账号（无密码，后续可在账号页设置）
    now = utc_now()
    user = User(
        id=str(uuid4()),
        phone=phone,
        display_name=_mask_phone(phone),
        password_hash=None,
        role="user",
        status="active",
        plan_code="free",
        entitlements_json={},
        usage_json={},
        created_at=now,
        updated_at=now,
    )
    database.add(user)
    database.flush()
    return issue_token_pair(database, user.id)


@router.post("/auth/phone/reset-password")
def reset_password_phone(
    payload: PhoneResetPasswordRequest,
    database: Annotated[Session, Depends(get_db)],
) -> dict[str, object]:
    phone = _normalize_phone(payload.phone)
    user = database.scalar(select(User).where(User.phone == phone))
    if user is None:
        raise ApiError(404, "phone_not_registered", "该手机号尚未注册。")
    consume_phone_code(database, phone, "reset_password", payload.code)
    user.password_hash = hash_password(payload.new_password)
    user.updated_at = utc_now()
    database.commit()
    # 重置成功后直接登录，返回令牌对
    return issue_token_pair(database, user.id)


@router.post("/auth/refresh")
def refresh(
    payload: RefreshRequest,
    database: Annotated[Session, Depends(get_db)],
) -> dict[str, object]:
    return rotate_refresh_token(database, payload.refresh_token)


@router.post("/auth/logout")
def logout(
    payload: RefreshRequest,
    database: Annotated[Session, Depends(get_db)],
) -> dict[str, bool]:
    from app.services.auth import hash_token

    token = database.scalar(
        select(RefreshToken).where(
            RefreshToken.token_hash == hash_token(payload.refresh_token),
            RefreshToken.revoked_at.is_(None),
        )
    )
    if token is not None:
        token.revoked_at = utc_now()
        database.commit()
    return {"logged_out": True}


@router.get("/me")
def get_me(
    user_id: Annotated[str, Depends(current_user_id)],
    database: Annotated[Session, Depends(get_db)],
) -> dict[str, object]:
    user = database.scalar(select(User).where(User.id == user_id))
    if user is None:
        raise ApiError(404, "user_not_found", "用户不存在。")
    return serialize_user(user)


@router.patch("/me")
def update_me(
    payload: UpdateMeRequest,
    user_id: Annotated[str, Depends(current_user_id)],
    database: Annotated[Session, Depends(get_db)],
) -> dict[str, object]:
    user = database.scalar(select(User).where(User.id == user_id))
    if user is None:
        raise ApiError(404, "user_not_found", "用户不存在。")
    user.display_name = payload.display_name.strip()
    user.updated_at = utc_now()
    database.commit()
    return serialize_user(user)
