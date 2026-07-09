from datetime import UTC, datetime
from uuid import uuid4

from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app.models import (
    SensitiveResource,
    SupervisionContextRef,
    SupervisionConversation,
    SupervisionMessage,
)


def utc_now() -> datetime:
    return datetime.now(UTC)


def register_sensitive_resource(
    database: Session,
    *,
    user_id: str,
    resource_type: str,
    resource_id: str,
    display_name: str,
    expires_at: datetime,
    can_long_term_preserve: bool,
    owner_type: str | None = None,
    owner_id: str | None = None,
) -> SensitiveResource:
    resource = database.scalar(
        select(SensitiveResource).where(
            SensitiveResource.resource_type == resource_type,
            SensitiveResource.resource_id == resource_id,
        )
    )
    now = utc_now()
    if resource is None:
        resource = SensitiveResource(
            id=str(uuid4()),
            user_id=user_id,
            resource_type=resource_type,
            resource_id=resource_id,
            display_name=display_name,
            owner_type=owner_type,
            owner_id=owner_id,
            origin_at=now,
            expires_at=expires_at,
            can_long_term_preserve=can_long_term_preserve,
            long_term_authorized_at=None,
            long_term_revoked_at=None,
            destroyed_at=None,
            created_at=now,
            updated_at=now,
        )
        database.add(resource)
    else:
        resource.display_name = display_name
        resource.expires_at = expires_at
        resource.owner_type = owner_type
        resource.owner_id = owner_id
        resource.updated_at = now
    database.flush()
    return resource


def serialize_sensitive_resource(resource: SensitiveResource) -> dict[str, object]:
    return {
        "id": resource.id,
        "resource_type": resource.resource_type,
        "resource_id": resource.resource_id,
        "display_name": resource.display_name,
        "owner_type": resource.owner_type,
        "owner_id": resource.owner_id,
        "origin_at": resource.origin_at.isoformat(),
        "expires_at": resource.expires_at.isoformat(),
        "can_long_term_preserve": resource.can_long_term_preserve,
        "long_term_authorized_at": (
            resource.long_term_authorized_at.isoformat()
            if resource.long_term_authorized_at
            else None
        ),
        "long_term_revoked_at": (
            resource.long_term_revoked_at.isoformat()
            if resource.long_term_revoked_at
            else None
        ),
        "destroyed_at": resource.destroyed_at.isoformat() if resource.destroyed_at else None,
    }


def destroy_supervision_conversation(
    database: Session,
    conversation: SupervisionConversation,
    *,
    destroyed_at: datetime | None = None,
) -> None:
    now = destroyed_at or utc_now()
    database.execute(
        delete(SupervisionMessage).where(
            SupervisionMessage.conversation_id == conversation.id
        )
    )
    database.execute(
        delete(SupervisionContextRef).where(
            SupervisionContextRef.conversation_id == conversation.id
        )
    )
    conversation.destroyed_at = now
    conversation.updated_at = now
