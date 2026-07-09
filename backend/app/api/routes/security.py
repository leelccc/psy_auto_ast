from typing import Annotated

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.dependencies import current_user_id
from app.api.errors import ApiError
from app.core.config import get_settings
from app.db.session import get_db
from app.models import ProfileAccessPassword, User
from app.services.security import (
    PROFILE_TYPES,
    set_profile_password,
    verify_profile_password_and_issue_grant,
)


router = APIRouter(prefix="/api/v1/profile-access-passwords", tags=["profile-access"])
PROFILE_ACCESS_GRANT_OPTIONS = (30, 60, 120)


class SetProfilePasswordRequest(BaseModel):
    new_password: str = Field(min_length=6, max_length=6, pattern=r"^\d{6}$")


class VerifyProfilePasswordRequest(BaseModel):
    password: str = Field(min_length=6, max_length=6, pattern=r"^\d{6}$")


class UpdateProfileAccessSettingsRequest(BaseModel):
    grant_minutes: int


def current_grant_minutes(database: Session, user_id: str) -> int:
    user = database.get(User, user_id)
    configured_minutes = user.profile_access_grant_minutes if user else None
    return configured_minutes or get_settings().profile_access_grant_minutes


@router.get("")
def get_profile_password_status(
    user_id: Annotated[str, Depends(current_user_id)],
    database: Annotated[Session, Depends(get_db)],
) -> dict[str, object]:
    configured = set(database.scalars(
        select(ProfileAccessPassword.profile_type).where(
            ProfileAccessPassword.user_id == user_id
        )
    ).all())
    return {
        "items": [
            {"profile_type": profile_type, "is_set": profile_type in configured}
            for profile_type in PROFILE_TYPES
        ],
        "grant_minutes": current_grant_minutes(database, user_id),
        "grant_options": list(PROFILE_ACCESS_GRANT_OPTIONS),
    }


@router.patch("/settings")
def update_profile_access_settings(
    payload: UpdateProfileAccessSettingsRequest,
    user_id: Annotated[str, Depends(current_user_id)],
    database: Annotated[Session, Depends(get_db)],
) -> dict[str, object]:
    if payload.grant_minutes not in PROFILE_ACCESS_GRANT_OPTIONS:
        raise ApiError(422, "profile_access_grant_minutes_invalid", "请选择支持的免密有效期。")
    user = database.get(User, user_id)
    if user is None:
        raise ApiError(404, "user_not_found", "账号不存在。")
    user.profile_access_grant_minutes = payload.grant_minutes
    database.commit()
    return {
        "grant_minutes": payload.grant_minutes,
        "grant_options": list(PROFILE_ACCESS_GRANT_OPTIONS),
    }


@router.put("/{profile_type}")
def save_profile_password(
    profile_type: str,
    payload: SetProfilePasswordRequest,
    user_id: Annotated[str, Depends(current_user_id)],
    database: Annotated[Session, Depends(get_db)],
) -> dict[str, object]:
    set_profile_password(
        database,
        user_id=user_id,
        profile_type=profile_type,
        password=payload.new_password,
    )
    return {"profile_type": profile_type, "is_set": True}


@router.post("/{profile_type}/verify")
def verify_profile_password(
    profile_type: str,
    payload: VerifyProfilePasswordRequest,
    user_id: Annotated[str, Depends(current_user_id)],
    database: Annotated[Session, Depends(get_db)],
) -> dict[str, object]:
    grant_minutes = current_grant_minutes(database, user_id)
    grant = verify_profile_password_and_issue_grant(
        database,
        user_id=user_id,
        profile_type=profile_type,
        password=payload.password,
        grant_minutes=grant_minutes,
    )
    return {
        "verified": True,
        "profile_type": profile_type,
        "profile_access_grant": grant,
        "expires_in_seconds": grant_minutes * 60,
    }
