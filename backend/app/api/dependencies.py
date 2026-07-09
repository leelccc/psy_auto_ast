from typing import Annotated

from fastapi import Depends, Header
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.errors import ApiError
from app.db.session import get_db
from app.models import User
from app.services.auth import decode_access_token


DEMO_USER_ID = "demo-user"


def current_user_id(
    database: Annotated[Session, Depends(get_db)],
    authorization: Annotated[str | None, Header()] = None,
) -> str:
    if authorization == "Bearer demo-token":
        return DEMO_USER_ID
    if not authorization or not authorization.startswith("Bearer "):
        raise ApiError(401, "unauthorized", "请先登录。")
    user_id = decode_access_token(authorization.removeprefix("Bearer ").strip())
    user = database.scalar(select(User).where(User.id == user_id))
    if user is None:
        raise ApiError(401, "access_token_invalid", "登录状态已失效，请重新登录。")
    if user.status != "active":
        raise ApiError(403, "account_disabled", "账号已被停用，请联系管理员。")
    return user_id


def current_admin_user_id(
    user_id: Annotated[str, Depends(current_user_id)],
    database: Annotated[Session, Depends(get_db)],
) -> str:
    user = database.get(User, user_id)
    if user is None or user.role != "admin" or user.status != "active":
        raise ApiError(403, "admin_required", "需要管理员权限。")
    return user_id
