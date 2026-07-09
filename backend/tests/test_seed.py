from sqlalchemy import func, select

from app.db.session import SessionLocal
from app.models import Attachment, Profile, SessionRecord, StoredFile, User
from app.seed import CHEN_PROFILE_ID, DEMO_USER_ID, SESSION_5_ID, SESSION_6_ID, seed_demo_data


SEEDED_PROFILE_IDS = {
    CHEN_PROFILE_ID,
    "profile-li-cheng",
    "profile-zhou-nan",
    "profile-wang-lan",
}
SEEDED_FILE_IDS = {
    "file-recording-6",
    "file-scale-6",
    "file-homework-6",
    "file-other-6",
    "file-consent-chen",
    "file-agreement-chen",
}


def test_seed_is_idempotent_and_creates_demo_graph() -> None:
    with SessionLocal() as database:
        seed_demo_data(database)
        seed_demo_data(database)

        assert database.scalar(
            select(func.count()).select_from(User).where(User.id == DEMO_USER_ID)
        ) == 1
        assert database.scalar(
            select(func.count()).select_from(Profile).where(Profile.id.in_(SEEDED_PROFILE_IDS))
        ) == 4
        assert database.scalar(
            select(func.count())
            .select_from(SessionRecord)
            .where(SessionRecord.id.in_({SESSION_5_ID, SESSION_6_ID}))
        ) == 2
        assert database.scalar(
            select(func.count()).select_from(StoredFile).where(StoredFile.id.in_(SEEDED_FILE_IDS))
        ) == 6
        assert database.scalar(
            select(func.count()).select_from(Attachment).where(Attachment.file_id.in_(SEEDED_FILE_IDS))
        ) == 5


def test_seeded_sessions_keep_sequence_and_sort_by_occurrence_time() -> None:
    with SessionLocal() as database:
        seed_demo_data(database)
        profile = database.scalar(select(Profile).where(Profile.name == "陈雨"))
        sessions = database.scalars(
            select(SessionRecord)
            .where(SessionRecord.profile_id == profile.id)
            .order_by(SessionRecord.occurred_at.desc())
        ).all()

        assert [session.sequence_no for session in sessions] == [6, 5]
        assert sessions[0].summary.startswith("围绕睡眠下降")
