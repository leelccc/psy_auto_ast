from datetime import timedelta
from typing import Annotated
from uuid import uuid4

from fastapi import APIRouter, Depends, Header, Query
from pydantic import BaseModel, Field, StringConstraints
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.api.dependencies import current_user_id
from app.api.errors import ApiError
from app.db.session import get_db
from app.models import (
    Profile,
    Report,
    SensitiveResource,
    SessionRecord,
    SupervisionContextRef,
    SupervisionConversation,
    SupervisionMessage,
)
from app.services.ai import DeterministicAIProvider
from app.services.auth import utc_now
from app.services.jobs import complete_job, create_job
from app.services.lifecycle import destroy_supervision_conversation, register_sensitive_resource
from app.services.security import (
    profile_type_for_profile,
    profile_type_for_report,
    profile_type_for_session,
    require_profile_access_for_type,
)


ConversationTitle = Annotated[
    str,
    StringConstraints(strip_whitespace=True, min_length=1, max_length=160),
]
MessageContent = Annotated[
    str,
    StringConstraints(strip_whitespace=True, min_length=1, max_length=8000),
]


class CreateConversationRequest(BaseModel):
    title: ConversationTitle


class ContextItem(BaseModel):
    resource_type: str
    resource_id: str


class AddContextRequest(BaseModel):
    items: list[ContextItem] = Field(min_length=1, max_length=20)


class SendMessageRequest(BaseModel):
    content: MessageContent


def get_conversation(
    database: Session,
    conversation_id: str,
    user_id: str,
) -> SupervisionConversation:
    conversation = database.scalar(
        select(SupervisionConversation).where(
            SupervisionConversation.id == conversation_id,
            SupervisionConversation.user_id == user_id,
            SupervisionConversation.destroyed_at.is_(None),
        )
    )
    if conversation is None:
        raise ApiError(404, "supervision_conversation_not_found", "督导会话不存在。")
    return conversation


def serialize_conversation(
    database: Session,
    conversation: SupervisionConversation,
) -> dict[str, object]:
    contexts = database.scalars(
        select(SupervisionContextRef)
        .where(SupervisionContextRef.conversation_id == conversation.id)
        .order_by(SupervisionContextRef.created_at.asc())
    ).all()
    messages = database.scalars(
        select(SupervisionMessage)
        .where(SupervisionMessage.conversation_id == conversation.id)
        .order_by(SupervisionMessage.created_at.asc(), SupervisionMessage.id.asc())
    ).all()
    return {
        "id": conversation.id,
        "title": conversation.title,
        "expires_at": conversation.expires_at.isoformat(),
        "context_refs": [
            {
                "id": item.id,
                "resource_type": item.resource_type,
                "resource_id": item.resource_id,
                "label": item.label,
            }
            for item in contexts
        ],
        "messages": [
            {
                "id": item.id,
                "role": item.role,
                "content": item.content,
                "generation_status": item.generation_status,
                "citations": item.citations,
                "created_at": item.created_at.isoformat(),
            }
            for item in messages
        ],
        "created_at": conversation.created_at.isoformat(),
        "updated_at": conversation.updated_at.isoformat(),
    }


def resolve_context_label(
    database: Session,
    *,
    user_id: str,
    resource_type: str,
    resource_id: str,
) -> tuple[str, str | None]:
    if resource_type == "profile":
        resource = database.scalar(
            select(Profile).where(Profile.id == resource_id, Profile.user_id == user_id)
        )
        label = resource.name if resource else None
        profile_type = (
            profile_type_for_profile(
                database,
                user_id=user_id,
                profile_id=resource_id,
            )
            if resource
            else None
        )
    elif resource_type == "session":
        resource = database.scalar(
            select(SessionRecord).where(
                SessionRecord.id == resource_id,
                SessionRecord.user_id == user_id,
            )
        )
        label = f"第{resource.sequence_no}次记录" if resource else None
        profile_type = (
            profile_type_for_session(
                database,
                user_id=user_id,
                session_id=resource_id,
            )
            if resource
            else None
        )
    elif resource_type == "report":
        resource = database.scalar(
            select(Report).where(
                Report.id == resource_id,
                Report.user_id == user_id,
                Report.destroyed_at.is_(None),
            )
        )
        label = resource.title if resource else None
        profile_type = (
            profile_type_for_report(database, user_id=user_id, report=resource)
            if resource
            else None
        )
    else:
        raise ApiError(422, "supervision_context_type_invalid", "该资料类型不能作为督导上下文。")
    if label is None:
        raise ApiError(404, "supervision_context_not_found", "上下文资料不存在或已不可用。")
    return label, profile_type


router = APIRouter(prefix="/api/v1/supervision", tags=["supervision"])


@router.get("/conversations")
def list_conversations(
    user_id: Annotated[str, Depends(current_user_id)],
    database: Annotated[Session, Depends(get_db)],
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int, Query(ge=1, le=100)] = 20,
) -> dict[str, object]:
    query = select(SupervisionConversation).where(
        SupervisionConversation.user_id == user_id,
        SupervisionConversation.destroyed_at.is_(None),
    )
    total = database.scalar(select(func.count()).select_from(query.subquery())) or 0
    conversations = database.scalars(
        query.order_by(
            SupervisionConversation.updated_at.desc(),
            SupervisionConversation.id.desc(),
        )
        .offset((page - 1) * page_size)
        .limit(page_size)
    ).all()
    return {
        "items": [serialize_conversation(database, item) for item in conversations],
        "page": page,
        "page_size": page_size,
        "total": total,
    }


@router.post("/conversations", status_code=201)
def create_conversation(
    payload: CreateConversationRequest,
    user_id: Annotated[str, Depends(current_user_id)],
    database: Annotated[Session, Depends(get_db)],
) -> dict[str, object]:
    now = utc_now()
    conversation = SupervisionConversation(
        id=str(uuid4()),
        user_id=user_id,
        title=payload.title.strip(),
        expires_at=now + timedelta(days=14),
        destroyed_at=None,
        created_at=now,
        updated_at=now,
    )
    database.add(conversation)
    database.flush()
    register_sensitive_resource(
        database,
        user_id=user_id,
        resource_type="supervision_conversation",
        resource_id=conversation.id,
        display_name=conversation.title,
        expires_at=conversation.expires_at,
        can_long_term_preserve=True,
        owner_type="conversation",
        owner_id=conversation.id,
    )
    database.commit()
    return serialize_conversation(database, conversation)


@router.get("/conversations/{conversation_id}")
def conversation_detail(
    conversation_id: str,
    user_id: Annotated[str, Depends(current_user_id)],
    database: Annotated[Session, Depends(get_db)],
) -> dict[str, object]:
    return serialize_conversation(
        database,
        get_conversation(database, conversation_id, user_id),
    )


@router.post("/conversations/{conversation_id}/context")
def add_context(
    conversation_id: str,
    payload: AddContextRequest,
    user_id: Annotated[str, Depends(current_user_id)],
    database: Annotated[Session, Depends(get_db)],
    profile_access_grant: Annotated[
        str | None,
        Header(alias="X-Profile-Access-Grant"),
    ] = None,
) -> dict[str, object]:
    conversation = get_conversation(database, conversation_id, user_id)
    now = utc_now()
    for item in payload.items:
        label, profile_type = resolve_context_label(
            database,
            user_id=user_id,
            resource_type=item.resource_type,
            resource_id=item.resource_id,
        )
        require_profile_access_for_type(
            database,
            user_id=user_id,
            profile_type=profile_type,
            raw_grant=profile_access_grant,
        )
        existing = database.scalar(
            select(SupervisionContextRef).where(
                SupervisionContextRef.conversation_id == conversation.id,
                SupervisionContextRef.resource_type == item.resource_type,
                SupervisionContextRef.resource_id == item.resource_id,
            )
        )
        if existing is None:
            database.add(SupervisionContextRef(
                id=str(uuid4()),
                conversation_id=conversation.id,
                resource_type=item.resource_type,
                resource_id=item.resource_id,
                label=label,
                created_at=now,
            ))
    conversation.updated_at = now
    database.commit()
    return {
        "items": serialize_conversation(database, conversation)["context_refs"],
    }


@router.delete("/conversations/{conversation_id}/context/{context_id}")
def remove_context(
    conversation_id: str,
    context_id: str,
    user_id: Annotated[str, Depends(current_user_id)],
    database: Annotated[Session, Depends(get_db)],
) -> dict[str, bool]:
    conversation = get_conversation(database, conversation_id, user_id)
    context = database.scalar(
        select(SupervisionContextRef).where(
            SupervisionContextRef.id == context_id,
            SupervisionContextRef.conversation_id == conversation.id,
        )
    )
    if context is None:
        raise ApiError(404, "supervision_context_not_found", "上下文资料不存在。")
    database.delete(context)
    conversation.updated_at = utc_now()
    database.commit()
    return {"deleted": True}


@router.post("/conversations/{conversation_id}/messages", status_code=202)
def send_message(
    conversation_id: str,
    payload: SendMessageRequest,
    user_id: Annotated[str, Depends(current_user_id)],
    database: Annotated[Session, Depends(get_db)],
) -> dict[str, object]:
    conversation = get_conversation(database, conversation_id, user_id)
    contexts = database.scalars(
        select(SupervisionContextRef).where(
            SupervisionContextRef.conversation_id == conversation.id
        )
    ).all()
    now = utc_now()
    user_message = SupervisionMessage(
        id=str(uuid4()),
        conversation_id=conversation.id,
        role="user",
        content=payload.content.strip(),
        generation_status=None,
        citations=[],
        created_at=now,
    )
    citations = [
        {
            "label": item.label,
            "resource_type": item.resource_type,
            "resource_id": item.resource_id,
        }
        for item in contexts
    ]
    assistant_message = SupervisionMessage(
        id=str(uuid4()),
        conversation_id=conversation.id,
        role="assistant",
        content=DeterministicAIProvider().supervision_reply(
            question=payload.content.strip(),
            context_labels=[item.label for item in contexts],
        ),
        generation_status="completed",
        citations=citations,
        created_at=now + timedelta(microseconds=1),
    )
    database.add_all([user_message, assistant_message])
    job = create_job(
        database,
        user_id=user_id,
        job_type="supervision_chat",
        target_type="supervision_message",
        target_id=assistant_message.id,
    )
    complete_job(database, job, {"message_id": assistant_message.id})
    conversation.updated_at = now
    database.commit()
    risk_prompt = (
        "内容涉及自杀、自伤或危机风险，请优先完成现实风险评估，并按机构流程寻求紧急支持。"
        if any(keyword in payload.content for keyword in ("自杀", "自伤", "伤害自己", "不想活"))
        else None
    )
    return {
        "user_message_id": user_message.id,
        "assistant_message_id": assistant_message.id,
        "job_id": job.id,
        "risk_prompt": risk_prompt,
    }


@router.get("/conversations/{conversation_id}/messages/{message_id}/events")
def message_events(
    conversation_id: str,
    message_id: str,
    user_id: Annotated[str, Depends(current_user_id)],
    database: Annotated[Session, Depends(get_db)],
) -> dict[str, object]:
    conversation = get_conversation(database, conversation_id, user_id)
    message = database.scalar(
        select(SupervisionMessage).where(
            SupervisionMessage.id == message_id,
            SupervisionMessage.conversation_id == conversation.id,
        )
    )
    if message is None:
        raise ApiError(404, "supervision_message_not_found", "消息不存在。")
    return {
        "items": [
            {"event": "delta", "data": {"text": message.content}},
            *[
                {"event": "citation", "data": citation}
                for citation in message.citations
            ],
            {"event": "done", "data": {"message_id": message.id}},
        ]
    }


@router.post("/conversations/{conversation_id}/messages/{message_id}/stop")
def stop_message(
    conversation_id: str,
    message_id: str,
    user_id: Annotated[str, Depends(current_user_id)],
    database: Annotated[Session, Depends(get_db)],
) -> dict[str, object]:
    conversation = get_conversation(database, conversation_id, user_id)
    message = database.scalar(
        select(SupervisionMessage).where(
            SupervisionMessage.id == message_id,
            SupervisionMessage.conversation_id == conversation.id,
        )
    )
    if message is None:
        raise ApiError(404, "supervision_message_not_found", "消息不存在。")
    if message.generation_status in {"queued", "running"}:
        message.generation_status = "cancelled"
        database.commit()
    return {
        "id": message.id,
        "content": message.content,
        "generation_status": message.generation_status,
    }


@router.delete("/conversations/{conversation_id}")
def delete_conversation(
    conversation_id: str,
    user_id: Annotated[str, Depends(current_user_id)],
    database: Annotated[Session, Depends(get_db)],
) -> dict[str, bool]:
    conversation = get_conversation(database, conversation_id, user_id)
    now = utc_now()
    destroy_supervision_conversation(database, conversation, destroyed_at=now)
    resource = database.scalar(
        select(SensitiveResource).where(
            SensitiveResource.resource_type == "supervision_conversation",
            SensitiveResource.resource_id == conversation.id,
        )
    )
    if resource:
        resource.destroyed_at = now
        resource.updated_at = now
    database.commit()
    return {"deleted": True}
