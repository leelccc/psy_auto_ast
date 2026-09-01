from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models import Profile, SessionRecord


def next_session_sequence(database: Session, *, profile: Profile, user_id: str) -> int:
    latest_sequence = database.scalar(
        select(func.max(SessionRecord.sequence_no)).where(
            SessionRecord.profile_id == profile.id,
            SessionRecord.user_id == user_id,
        )
    )
    return (latest_sequence or 0) + 1


def resequence_profile_sessions(
    database: Session,
    *,
    profile: Profile,
    user_id: str,
) -> bool:
    sessions = database.scalars(
        select(SessionRecord)
        .where(
            SessionRecord.profile_id == profile.id,
            SessionRecord.user_id == user_id,
        )
        .order_by(
            SessionRecord.occurred_at.asc(),
            SessionRecord.created_at.asc(),
            SessionRecord.id.asc(),
        )
    ).all()
    start = 1
    expected = [start + index for index in range(len(sessions))]
    if [session.sequence_no for session in sessions] == expected:
        return False
    temporary_start = max(
        [session.sequence_no for session in sessions] + [0],
    ) + len(sessions) + 1000
    for index, session in enumerate(sessions):
        session.sequence_no = temporary_start + index
    database.flush()
    for index, session in enumerate(sessions):
        session.sequence_no = start + index
    return True
