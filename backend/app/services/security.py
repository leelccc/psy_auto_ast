import re
from datetime import timedelta
from secrets import token_urlsafe
from uuid import uuid4

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.errors import ApiError
from app.models import (
    Attachment,
    Profile,
    ProfileAccessGrant,
    ProfileAccessPassword,
    Recording,
    RecordingSummary,
    RecordingTranscript,
    Report,
    SessionRecord,
)
from app.services.auth import hash_password, hash_token, utc_now, verify_password


PROFILE_TYPES = ("client", "supervisor", "supervisee")
PROFILE_ACCESS_PIN_PATTERN = re.compile(r"^\d{6}$")


def validate_profile_access_pin(password: str) -> None:
    if not PROFILE_ACCESS_PIN_PATTERN.fullmatch(password):
        raise ApiError(422, "profile_access_pin_invalid", "档案访问密码必须是 6 位数字。")


def set_profile_password(
    database: Session,
    *,
    user_id: str,
    profile_type: str,
    password: str,
) -> ProfileAccessPassword:
    if profile_type not in PROFILE_TYPES:
        raise ApiError(422, "profile_type_invalid", "不支持的档案类型。")
    validate_profile_access_pin(password)
    stored = database.scalar(
        select(ProfileAccessPassword).where(
            ProfileAccessPassword.user_id == user_id,
            ProfileAccessPassword.profile_type == profile_type,
        )
    )
    now = utc_now()
    if stored is None:
        stored = ProfileAccessPassword(
            id=str(uuid4()),
            user_id=user_id,
            profile_type=profile_type,
            password_hash=hash_password(password),
            created_at=now,
            updated_at=now,
        )
        database.add(stored)
    else:
        stored.password_hash = hash_password(password)
        stored.updated_at = now
    active_grants = database.scalars(
        select(ProfileAccessGrant).where(
            ProfileAccessGrant.user_id == user_id,
            ProfileAccessGrant.profile_type == profile_type,
            ProfileAccessGrant.revoked_at.is_(None),
        )
    ).all()
    for grant in active_grants:
        grant.revoked_at = now
    database.commit()
    return stored


def verify_profile_password_and_issue_grant(
    database: Session,
    *,
    user_id: str,
    profile_type: str,
    password: str,
    grant_minutes: int = 60,
) -> str:
    validate_profile_access_pin(password)
    stored = database.scalar(
        select(ProfileAccessPassword).where(
            ProfileAccessPassword.user_id == user_id,
            ProfileAccessPassword.profile_type == profile_type,
        )
    )
    if stored is None:
        raise ApiError(409, "profile_password_not_set", "请先设置该类型档案的访问密码。")
    if not verify_password(password, stored.password_hash):
        raise ApiError(403, "profile_password_invalid", "档案访问密码不正确。")
    raw_grant = token_urlsafe(32)
    now = utc_now()
    database.add(ProfileAccessGrant(
        id=str(uuid4()),
        user_id=user_id,
        profile_type=profile_type,
        token_hash=hash_token(raw_grant),
        expires_at=now + timedelta(minutes=grant_minutes),
        revoked_at=None,
        created_at=now,
    ))
    database.commit()
    return raw_grant


def require_profile_access_grant(
    database: Session,
    *,
    user_id: str,
    profile_type: str,
    raw_grant: str | None,
) -> None:
    if not raw_grant:
        raise ApiError(403, "profile_access_grant_required", "进入档案详情前需要验证档案访问密码。")
    stored = database.scalar(
        select(ProfileAccessGrant).where(
            ProfileAccessGrant.token_hash == hash_token(raw_grant),
            ProfileAccessGrant.user_id == user_id,
            ProfileAccessGrant.profile_type == profile_type,
        )
    )
    if stored is None or stored.revoked_at is not None or stored.expires_at <= utc_now():
        raise ApiError(403, "profile_access_grant_invalid", "档案访问凭证无效，请重新验证密码。")


def profile_type_for_profile(
    database: Session,
    *,
    user_id: str,
    profile_id: str,
) -> str | None:
    return database.scalar(
        select(Profile.type).where(
            Profile.id == profile_id,
            Profile.user_id == user_id,
        )
    )


def profile_type_for_session(
    database: Session,
    *,
    user_id: str,
    session_id: str,
) -> str | None:
    return database.scalar(
        select(Profile.type)
        .join(SessionRecord, SessionRecord.profile_id == Profile.id)
        .where(
            SessionRecord.id == session_id,
            SessionRecord.user_id == user_id,
            Profile.user_id == user_id,
        )
    )


def profile_type_for_recording(
    database: Session,
    *,
    user_id: str,
    recording_id: str,
) -> str | None:
    return database.scalar(
        select(Profile.type)
        .join(SessionRecord, SessionRecord.profile_id == Profile.id)
        .join(Recording, Recording.session_id == SessionRecord.id)
        .where(
            Recording.id == recording_id,
            Recording.user_id == user_id,
            SessionRecord.user_id == user_id,
            Profile.user_id == user_id,
        )
    )


def profile_type_for_report(
    database: Session,
    *,
    user_id: str,
    report: Report,
) -> str | None:
    if report.profile_id:
        return profile_type_for_profile(
            database,
            user_id=user_id,
            profile_id=report.profile_id,
        )
    if report.session_id:
        return profile_type_for_session(
            database,
            user_id=user_id,
            session_id=report.session_id,
        )
    return None


def profile_type_for_attachment(
    database: Session,
    *,
    user_id: str,
    attachment: Attachment,
) -> str | None:
    if attachment.owner_type == "profile":
        return profile_type_for_profile(
            database,
            user_id=user_id,
            profile_id=attachment.owner_id,
        )
    if attachment.owner_type == "session":
        return profile_type_for_session(
            database,
            user_id=user_id,
            session_id=attachment.owner_id,
        )
    return None


def profile_type_for_file(
    database: Session,
    *,
    user_id: str,
    file_id: str,
) -> str | None:
    attachment = database.scalar(
        select(Attachment).where(
            Attachment.file_id == file_id,
            Attachment.user_id == user_id,
            Attachment.is_current.is_(True),
        )
    )
    if attachment is not None:
        return profile_type_for_attachment(
            database,
            user_id=user_id,
            attachment=attachment,
        )
    recording_id = database.scalar(
        select(Recording.id).where(
            Recording.audio_file_id == file_id,
            Recording.user_id == user_id,
        )
    )
    if recording_id:
        return profile_type_for_recording(
            database,
            user_id=user_id,
            recording_id=recording_id,
        )
    return None


def profile_type_for_transcript(
    database: Session,
    *,
    user_id: str,
    transcript: RecordingTranscript,
) -> str | None:
    return profile_type_for_recording(
        database,
        user_id=user_id,
        recording_id=transcript.recording_id,
    )


def profile_type_for_summary(
    database: Session,
    *,
    user_id: str,
    summary: RecordingSummary,
) -> str | None:
    return profile_type_for_recording(
        database,
        user_id=user_id,
        recording_id=summary.recording_id,
    )


def require_profile_access_for_type(
    database: Session,
    *,
    user_id: str,
    profile_type: str | None,
    raw_grant: str | None,
) -> None:
    if profile_type is None:
        return
    require_profile_access_grant(
        database,
        user_id=user_id,
        profile_type=profile_type,
        raw_grant=raw_grant,
    )
