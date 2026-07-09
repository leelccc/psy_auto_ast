from datetime import timedelta
from uuid import uuid4

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import CalendarEvent, Profile
from app.services.auth import utc_now


PROFILE_EVENT_DETAILS = {
    "client": ("counseling", "咨询", "咨询提醒"),
    "supervisor": ("supervision_received", "督导", "督导提醒"),
    "supervisee": ("supervision_given", "受督", "受督提醒"),
}


def sync_profile_next_session_event(database: Session, profile: Profile) -> None:
    event = database.scalar(
        select(CalendarEvent).where(
            CalendarEvent.user_id == profile.user_id,
            CalendarEvent.profile_id == profile.id,
            CalendarEvent.source_type == "profile_next_session",
        )
    )
    if profile.next_session_at is None:
        if event is not None:
            database.delete(event)
        return

    category, label, privacy_title = PROFILE_EVENT_DETAILS[profile.type]
    now = utc_now()
    if event is None:
        event = CalendarEvent(
            id=str(uuid4()),
            user_id=profile.user_id,
            profile_id=profile.id,
            session_id=None,
            title=f"{profile.name} · 下次{label}",
            privacy_title=privacy_title,
            category=category,
            source_type="profile_next_session",
            start_at=profile.next_session_at,
            end_at=profile.next_session_at + timedelta(minutes=50),
            status="pending",
            sync_to_system_calendar=False,
            system_calendar_event_id=None,
            created_at=now,
            updated_at=now,
        )
        database.add(event)
        return

    event.title = f"{profile.name} · 下次{label}"
    event.privacy_title = privacy_title
    event.category = category
    event.start_at = profile.next_session_at
    event.end_at = profile.next_session_at + timedelta(minutes=50)
    event.status = "pending"
    event.updated_at = now
