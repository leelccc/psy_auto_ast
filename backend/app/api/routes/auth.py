import re
from typing import Annotated
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


router = APIRouter(prefix="/api/v1", tags=["auth"])
EMAIL_PATTERN = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
DisplayName = Annotated[
    str,
    StringConstraints(strip_whitespace=True, min_length=1, max_length=80),
]


class RegisterRequest(BaseModel):
    email: str
    password: str = Field(min_length=6, max_length=128)
    display_name: DisplayName


class LoginRequest(BaseModel):
    email: str
    password: str


class RefreshRequest(BaseModel):
    refresh_token: str = Field(min_length=20)


class UpdateMeRequest(BaseModel):
    display_name: DisplayName


def serialize_user(user: User) -> dict[str, object]:
    return {
        "id": user.id,
        "email": user.email,
        "display_name": user.display_name,
        "role": user.role,
        "status": user.status,
        "plan_code": user.plan_code,
        "created_at": user.created_at.isoformat(),
        "updated_at": user.updated_at.isoformat(),
    }


@router.post("/auth/register", status_code=201)
def register(
    payload: RegisterRequest,
    database: Annotated[Session, Depends(get_db)],
) -> dict[str, object]:
    email = payload.email.strip().lower()
    if not EMAIL_PATTERN.match(email):
        raise ApiError(422, "email_invalid", "邮箱格式不正确。")
    if database.scalar(select(User.id).where(User.email == email)) is not None:
        raise ApiError(409, "email_already_registered", "该邮箱已注册。")
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
