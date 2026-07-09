from datetime import UTC, datetime, timedelta
from hashlib import sha256
from secrets import token_urlsafe
from uuid import uuid4

import jwt
from jwt import InvalidTokenError
from pwdlib import PasswordHash
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.errors import ApiError
from app.core.config import Settings, get_settings
from app.models import RefreshToken, User


password_hasher = PasswordHash.recommended()


def utc_now() -> datetime:
    return datetime.now(UTC)


def hash_password(password: str) -> str:
    return password_hasher.hash(password)


def verify_password(password: str, password_hash: str | None) -> bool:
    return bool(password_hash and password_hasher.verify(password, password_hash))


def hash_token(token: str) -> str:
    return sha256(token.encode("utf-8")).hexdigest()


def create_access_token(user_id: str, settings: Settings | None = None) -> str:
    settings = settings or get_settings()
    now = utc_now()
    return jwt.encode(
        {
            "sub": user_id,
            "typ": "access",
            "iat": now,
            "exp": now + timedelta(minutes=settings.access_token_minutes),
        },
        settings.jwt_secret_key,
        algorithm="HS256",
    )


def decode_access_token(token: str, settings: Settings | None = None) -> str:
    settings = settings or get_settings()
    try:
        payload = jwt.decode(token, settings.jwt_secret_key, algorithms=["HS256"])
    except InvalidTokenError as exc:
        raise ApiError(401, "access_token_invalid", "登录状态已失效，请重新登录。") from exc
    if payload.get("typ") != "access" or not payload.get("sub"):
        raise ApiError(401, "access_token_invalid", "登录状态已失效，请重新登录。")
    return str(payload["sub"])


def issue_token_pair(
    database: Session,
    user_id: str,
    settings: Settings | None = None,
) -> dict[str, object]:
    settings = settings or get_settings()
    refresh_token = token_urlsafe(48)
    now = utc_now()
    database.add(RefreshToken(
        id=str(uuid4()),
        user_id=user_id,
        token_hash=hash_token(refresh_token),
        expires_at=now + timedelta(days=settings.refresh_token_days),
        revoked_at=None,
        created_at=now,
    ))
    database.commit()
    return {
        "access_token": create_access_token(user_id, settings),
        "refresh_token": refresh_token,
        "token_type": "bearer",
        "expires_in": settings.access_token_minutes * 60,
    }


def rotate_refresh_token(database: Session, raw_token: str) -> dict[str, object]:
    stored = database.scalar(
        select(RefreshToken).where(RefreshToken.token_hash == hash_token(raw_token))
    )
    if stored is None or stored.revoked_at is not None or stored.expires_at <= utc_now():
        raise ApiError(401, "refresh_token_invalid", "刷新令牌无效，请重新登录。")
    user = database.scalar(select(User).where(User.id == stored.user_id))
    if user is None:
        raise ApiError(401, "refresh_token_invalid", "刷新令牌无效，请重新登录。")
    stored.revoked_at = utc_now()
    database.flush()
    return issue_token_pair(database, stored.user_id)
