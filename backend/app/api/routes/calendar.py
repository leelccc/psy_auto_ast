from datetime import datetime
from typing import Annotated, Any
from uuid import uuid4

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.dependencies import current_user_id
from app.api.errors import ApiError
from app.db.session import get_db
from app.models import CalendarEvent, CalendarSetting, Profile, SessionRecord
from app.services.auth import utc_now


CATEGORIES = {"counseling", "supervision_given", "supervision_received", "personal"}
STATUSES = {"pending", "completed", "cancelled"}


class CreateCalendarEventRequest(BaseModel):
    title: str = Field(min_length=1, max_length=160)
    privacy_title: str | None = Field(default=None, max_length=80)
    category: str
    start_at: datetime
    end_at: datetime | None = None
    profile_id: str | None = None
    session_id: str | None = None
    sync_to_system_calendar: bool = False
    system_calendar_event_id: str | None = None


class UpdateCalendarEventRequest(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=160)
    privacy_title: str | None = Field(default=None, max_length=80)
    start_at: datetime | None = None
    end_at: datetime | None = None
    status: str | None = None
    sync_to_system_calendar: bool | None = None
    system_calendar_event_id: str | None = None


class UpdateCalendarSettingsRequest(BaseModel):
    system_calendar_enabled: bool | None = None
    privacy_title_mode_enabled: bool | None = None


def get_settings(database: Session, user_id: str) -> CalendarSetting:
    settings = database.scalar(
        select(CalendarSetting).where(CalendarSetting.user_id == user_id)
    )
    if settings is None:
        now = utc_now()
        settings = CalendarSetting(
            id=str(uuid4()),
            user_id=user_id,
            system_calendar_enabled=False,
            privacy_title_mode_enabled=True,
            created_at=now,
            updated_at=now,
        )
        database.add(settings)
        database.commit()
    return settings


def serialize_settings(settings: CalendarSetting) -> dict[str, object]:
    return {
        "system_calendar_enabled": settings.system_calendar_enabled,
        "privacy_title_mode_enabled": settings.privacy_title_mode_enabled,
        "updated_at": settings.updated_at.isoformat(),
    }


def serialize_event(event: CalendarEvent, settings: CalendarSetting) -> dict[str, object]:
    display_title = (
        event.privacy_title or "专业安排"
        if settings.privacy_title_mode_enabled
        else event.title
    )
    return {
        "id": event.id,
        "title": event.title,
        "privacy_title": event.privacy_title,
        "display_title": display_title,
        "category": event.category,
        "source_type": event.source_type,
        "start_at": event.start_at.isoformat(),
        "end_at": event.end_at.isoformat() if event.end_at else None,
        "profile_id": event.profile_id,
        "session_id": event.session_id,
        "status": event.status,
        "sync_to_system_calendar": event.sync_to_system_calendar,
        "system_calendar_event_id": event.system_calendar_event_id,
        "created_at": event.created_at.isoformat(),
        "updated_at": event.updated_at.isoformat(),
    }


router = APIRouter(prefix="/api/v1/calendar", tags=["calendar"])


@router.get("/settings")
def calendar_settings(
    user_id: Annotated[str, Depends(current_user_id)],
    database: Annotated[Session, Depends(get_db)],
) -> dict[str, object]:
    return serialize_settings(get_settings(database, user_id))


@router.patch("/settings")
def update_calendar_settings(
    payload: UpdateCalendarSettingsRequest,
    user_id: Annotated[str, Depends(current_user_id)],
    database: Annotated[Session, Depends(get_db)],
) -> dict[str, object]:
    settings = get_settings(database, user_id)
    for field_name in ("system_calendar_enabled", "privacy_title_mode_enabled"):
        value = getattr(payload, field_name)
        if value is not None:
            setattr(settings, field_name, value)
    settings.updated_at = utc_now()
    database.commit()
    return serialize_settings(settings)


@router.get("/events")
def list_calendar_events(
    user_id: Annotated[str, Depends(current_user_id)],
    database: Annotated[Session, Depends(get_db)],
    from_at: Annotated[datetime | None, Query(alias="from")] = None,
    to_at: Annotated[datetime | None, Query(alias="to")] = None,
) -> dict[str, object]:
    query = select(CalendarEvent).where(CalendarEvent.user_id == user_id)
    if from_at:
        query = query.where(CalendarEvent.start_at >= from_at)
    if to_at:
        query = query.where(CalendarEvent.start_at < to_at)
    events = database.scalars(
        query.order_by(CalendarEvent.start_at.asc(), CalendarEvent.id.asc())
    ).all()
    settings = get_settings(database, user_id)
    return {"items": [serialize_event(event, settings) for event in events]}


@router.post("/events", status_code=201)
def create_calendar_event(
    payload: CreateCalendarEventRequest,
    user_id: Annotated[str, Depends(current_user_id)],
    database: Annotated[Session, Depends(get_db)],
) -> dict[str, object]:
    if payload.category not in CATEGORIES:
        raise ApiError(422, "calendar_category_invalid", "不支持的日程类型。")
    if payload.end_at and payload.end_at < payload.start_at:
        raise ApiError(422, "calendar_time_invalid", "结束时间不能早于开始时间。")
    if payload.profile_id and database.scalar(
        select(Profile.id).where(Profile.id == payload.profile_id, Profile.user_id == user_id)
    ) is None:
        raise ApiError(404, "profile_not_found", "关联档案不存在。")
    if payload.session_id and database.scalar(
        select(SessionRecord.id).where(
            SessionRecord.id == payload.session_id,
            SessionRecord.user_id == user_id,
        )
    ) is None:
        raise ApiError(404, "session_not_found", "关联记录不存在。")
    now = utc_now()
    event = CalendarEvent(
        id=str(uuid4()),
        user_id=user_id,
        profile_id=payload.profile_id,
        session_id=payload.session_id,
        title=payload.title.strip(),
        privacy_title=payload.privacy_title,
        category=payload.category,
        source_type="manual",
        start_at=payload.start_at,
        end_at=payload.end_at,
        status="pending",
        sync_to_system_calendar=payload.sync_to_system_calendar,
        system_calendar_event_id=payload.system_calendar_event_id,
        created_at=now,
        updated_at=now,
    )
    database.add(event)
    database.commit()
    return serialize_event(event, get_settings(database, user_id))


@router.patch("/events/{event_id}")
def update_calendar_event(
    event_id: str,
    payload: UpdateCalendarEventRequest,
    user_id: Annotated[str, Depends(current_user_id)],
    database: Annotated[Session, Depends(get_db)],
) -> dict[str, object]:
    event = database.scalar(
        select(CalendarEvent).where(
            CalendarEvent.id == event_id,
            CalendarEvent.user_id == user_id,
        )
    )
    if event is None:
        raise ApiError(404, "calendar_event_not_found", "日程不存在。")
    if payload.status is not None and payload.status not in STATUSES:
        raise ApiError(422, "calendar_status_invalid", "不支持的日程状态。")
    for field_name in (
        "title",
        "privacy_title",
        "start_at",
        "end_at",
        "status",
        "sync_to_system_calendar",
        "system_calendar_event_id",
    ):
        if field_name in payload.model_fields_set:
            setattr(event, field_name, getattr(payload, field_name))
    if event.end_at and event.end_at < event.start_at:
        raise ApiError(422, "calendar_time_invalid", "结束时间不能早于开始时间。")
    event.updated_at = utc_now()
    database.commit()
    return serialize_event(event, get_settings(database, user_id))


@router.delete("/events/{event_id}")
def delete_calendar_event(
    event_id: str,
    user_id: Annotated[str, Depends(current_user_id)],
    database: Annotated[Session, Depends(get_db)],
) -> dict[str, Any]:
    event = database.scalar(
        select(CalendarEvent).where(
            CalendarEvent.id == event_id,
            CalendarEvent.user_id == user_id,
        )
    )
    if event is None:
        raise ApiError(404, "calendar_event_not_found", "日程不存在。")
    system_calendar_event_id = event.system_calendar_event_id
    database.delete(event)
    database.commit()
    return {
        "deleted": True,
        "system_calendar_event_id": system_calendar_event_id,
    }
