import re
from datetime import UTC, datetime

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.api.errors import ApiError
from app.models import Profile


PROFILE_CODE_MAX_LENGTH = 12
PROFILE_CODE_PATTERN = re.compile(r"^[A-Z0-9][A-Z0-9_-]*$")
AUTO_PROFILE_CODE_PATTERN = re.compile(r"^([CSE]\d{2})-(\d{3})$")
PROFILE_CODE_PREFIXES = {
    "client": "C",
    "supervisor": "S",
    "supervisee": "E",
}


def normalize_profile_code(raw_code: str | None) -> str | None:
    code = (raw_code or "").strip().upper()
    if not code:
        return None
    if len(code) > PROFILE_CODE_MAX_LENGTH:
        raise ApiError(422, "profile_code_too_long", "档案编号最多 12 位。")
    if not PROFILE_CODE_PATTERN.fullmatch(code):
        raise ApiError(422, "profile_code_invalid", "档案编号必须以英文字母或数字开头，只能包含英文字母、数字、短横线或下划线。")
    return code


def ensure_profile_code_available(
    database: Session,
    *,
    user_id: str,
    code: str,
    exclude_profile_id: str | None = None,
) -> None:
    query = select(Profile.id).where(
        Profile.user_id == user_id,
        func.lower(Profile.code) == code.lower(),
    )
    if exclude_profile_id:
        query = query.where(Profile.id != exclude_profile_id)
    if database.scalar(query) is not None:
        raise ApiError(409, "profile_code_exists", "档案编号已被使用，请换一个编号。")


def generate_profile_code(
    database: Session,
    *,
    user_id: str,
    profile_type: str,
    now: datetime | None = None,
) -> str:
    prefix = PROFILE_CODE_PREFIXES.get(profile_type)
    if prefix is None:
        raise ApiError(422, "profile_type_invalid", "档案身份类型不支持。")

    year = (now or datetime.now(UTC)).strftime("%y")
    series = f"{prefix}{year}"
    existing_codes = database.scalars(
        select(Profile.code).where(
            Profile.user_id == user_id,
            Profile.type == profile_type,
            Profile.code.ilike(f"{series}-%"),
        )
    ).all()
    used_numbers = {
        int(match.group(2))
        for code in existing_codes
        if code
        for match in [AUTO_PROFILE_CODE_PATTERN.fullmatch(code.upper())]
        if match and match.group(1) == series
    }
    for number in range(1, 1000):
        if number not in used_numbers:
            return f"{series}-{number:03d}"
    raise ApiError(409, "profile_code_series_full", "今年该类型档案编号已用完，请手动填写编号。")


def resolve_profile_code(
    database: Session,
    *,
    user_id: str,
    profile_type: str,
    requested_code: str | None,
    now: datetime | None = None,
) -> str:
    code = normalize_profile_code(requested_code)
    if code is None:
        code = generate_profile_code(database, user_id=user_id, profile_type=profile_type, now=now)
    ensure_profile_code_available(database, user_id=user_id, code=code)
    return code


def assign_missing_profile_codes(
    database: Session,
    *,
    user_id: str,
    profiles: list[Profile],
    now: datetime | None = None,
) -> bool:
    changed = False
    for profile in profiles:
        if profile.code:
            continue
        profile.code = generate_profile_code(
            database,
            user_id=user_id,
            profile_type=profile.type,
            now=now,
        )
        changed = True
    return changed
