from typing import Annotated, Any

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel, Field
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from app.api.dependencies import current_admin_user_id
from app.api.errors import ApiError
from app.db.session import get_db
from app.models import User
from app.services.auth import utc_now


router = APIRouter(prefix="/api/v1/admin/users", tags=["admin-users"])
USER_ROLES = {"user", "admin"}
USER_STATUSES = {"active", "suspended"}
PLAN_CODES = {"free", "trial", "pro", "team", "enterprise"}


class UpdateAdminUserRequest(BaseModel):
    role: str | None = None
    status: str | None = None
    plan_code: str | None = None
    entitlements: dict[str, Any] | None = Field(default=None)
    usage: dict[str, Any] | None = Field(default=None)
    billing_customer_id: str | None = Field(default=None, max_length=120)
    billing_subscription_id: str | None = Field(default=None, max_length=120)
    billing_status: str | None = Field(default=None, max_length=32)


def serialize_admin_user(user: User) -> dict[str, object]:
    return {
        "id": user.id,
        "email": user.email,
        "display_name": user.display_name,
        "role": user.role,
        "role_options": sorted(USER_ROLES),
        "status": user.status,
        "status_options": sorted(USER_STATUSES),
        "plan_code": user.plan_code,
        "plan_options": sorted(PLAN_CODES),
        "entitlements": user.entitlements_json or {},
        "usage": user.usage_json or {},
        "billing": {
            "customer_id": user.billing_customer_id,
            "subscription_id": user.billing_subscription_id,
            "status": user.billing_status,
        },
        "created_at": user.created_at.isoformat(),
        "updated_at": user.updated_at.isoformat(),
    }


def get_user(database: Session, user_id: str) -> User:
    user = database.get(User, user_id)
    if user is None:
        raise ApiError(404, "user_not_found", "用户不存在。")
    return user


@router.get("")
def list_admin_users(
    admin_user_id: Annotated[str, Depends(current_admin_user_id)],
    database: Annotated[Session, Depends(get_db)],
    keyword: str | None = None,
    status: str | None = None,
    plan_code: str | None = None,
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int, Query(ge=1, le=100)] = 20,
) -> dict[str, object]:
    _ = admin_user_id
    query = select(User)
    if keyword:
        like = f"%{keyword.strip().lower()}%"
        query = query.where(or_(func.lower(User.email).like(like), func.lower(User.display_name).like(like)))
    if status:
        if status not in USER_STATUSES:
            raise ApiError(422, "user_status_invalid", "不支持的用户状态。")
        query = query.where(User.status == status)
    if plan_code:
        if plan_code not in PLAN_CODES:
            raise ApiError(422, "plan_code_invalid", "不支持的套餐。")
        query = query.where(User.plan_code == plan_code)
    total = database.scalar(select(func.count()).select_from(query.subquery())) or 0
    users = database.scalars(
        query.order_by(User.created_at.desc(), User.id.asc())
        .offset((page - 1) * page_size)
        .limit(page_size)
    ).all()
    return {"items": [serialize_admin_user(user) for user in users], "page": page, "page_size": page_size, "total": total}


@router.get("/{user_id}")
def get_admin_user(
    user_id: str,
    admin_user_id: Annotated[str, Depends(current_admin_user_id)],
    database: Annotated[Session, Depends(get_db)],
) -> dict[str, object]:
    _ = admin_user_id
    return serialize_admin_user(get_user(database, user_id))


@router.patch("/{user_id}")
def update_admin_user(
    user_id: str,
    payload: UpdateAdminUserRequest,
    admin_user_id: Annotated[str, Depends(current_admin_user_id)],
    database: Annotated[Session, Depends(get_db)],
) -> dict[str, object]:
    user = get_user(database, user_id)
    if payload.role is not None:
        if payload.role not in USER_ROLES:
            raise ApiError(422, "user_role_invalid", "不支持的用户角色。")
        if user.id == admin_user_id and payload.role != "admin":
            raise ApiError(409, "cannot_remove_own_admin_role", "不能移除自己的管理员权限。")
        user.role = payload.role
    if payload.status is not None:
        if payload.status not in USER_STATUSES:
            raise ApiError(422, "user_status_invalid", "不支持的用户状态。")
        if user.id == admin_user_id and payload.status != "active":
            raise ApiError(409, "cannot_suspend_self", "不能停用当前管理员账号。")
        user.status = payload.status
    if payload.plan_code is not None:
        if payload.plan_code not in PLAN_CODES:
            raise ApiError(422, "plan_code_invalid", "不支持的套餐。")
        user.plan_code = payload.plan_code
    if payload.entitlements is not None:
        user.entitlements_json = payload.entitlements
    if payload.usage is not None:
        user.usage_json = payload.usage
    if "billing_customer_id" in payload.model_fields_set:
        user.billing_customer_id = payload.billing_customer_id
    if "billing_subscription_id" in payload.model_fields_set:
        user.billing_subscription_id = payload.billing_subscription_id
    if "billing_status" in payload.model_fields_set:
        user.billing_status = payload.billing_status
    user.updated_at = utc_now()
    database.commit()
    return serialize_admin_user(user)
