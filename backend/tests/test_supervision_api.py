from fastapi.testclient import TestClient

from app.db.session import SessionLocal
from app.main import create_app
from app.models import SupervisionContextRef, SupervisionConversation, SupervisionMessage
from app.seed import CHEN_PROFILE_ID, seed_demo_data
from tests.fake_storage import FakeStorage
from tests.helpers import auth_headers, profile_access_headers


def test_supervision_rejects_blank_conversation_titles_and_messages() -> None:
    with SessionLocal() as database:
        seed_demo_data(database)
    api = TestClient(create_app(storage=FakeStorage()))

    blank_title = api.post(
        "/api/v1/supervision/conversations",
        headers=auth_headers(),
        json={"title": "   "},
    )
    assert blank_title.status_code == 422

    created = api.post(
        "/api/v1/supervision/conversations",
        headers=auth_headers(),
        json={"title": "边界测试"},
    )
    assert created.status_code == 201
    blank_message = api.post(
        f"/api/v1/supervision/conversations/{created.json()['id']}/messages",
        headers=auth_headers(),
        json={"content": "   "},
    )
    assert blank_message.status_code == 422


def test_supervision_context_messages_citations_risk_and_deletion() -> None:
    with SessionLocal() as database:
        seed_demo_data(database)
    api = TestClient(create_app(storage=FakeStorage()))

    created = api.post(
        "/api/v1/supervision/conversations",
        headers=auth_headers(),
        json={"title": "陈雨个案复盘"},
    )
    assert created.status_code == 201
    conversation_id = created.json()["id"]

    empty = api.get(
        f"/api/v1/supervision/conversations/{conversation_id}",
        headers=auth_headers(),
    )
    assert empty.json()["context_refs"] == []

    locked_context = api.post(
        f"/api/v1/supervision/conversations/{conversation_id}/context",
        headers=auth_headers(),
        json={"items": [{"resource_type": "profile", "resource_id": CHEN_PROFILE_ID}]},
    )
    assert locked_context.status_code == 403
    assert locked_context.json()["error"]["code"] == "profile_access_grant_required"

    context = api.post(
        f"/api/v1/supervision/conversations/{conversation_id}/context",
        headers=profile_access_headers(api),
        json={"items": [{"resource_type": "profile", "resource_id": CHEN_PROFILE_ID}]},
    )
    assert context.status_code == 200
    assert context.json()["items"][0]["label"] == "陈雨"

    sent = api.post(
        f"/api/v1/supervision/conversations/{conversation_id}/messages",
        headers=auth_headers(),
        json={"content": "来访者提到自杀想法，我该如何整理督导问题？"},
    )
    assert sent.status_code == 202
    assert sent.json()["risk_prompt"] is not None
    assistant_id = sent.json()["assistant_message_id"]

    detail = api.get(
        f"/api/v1/supervision/conversations/{conversation_id}",
        headers=auth_headers(),
    )
    assistant = next(item for item in detail.json()["messages"] if item["id"] == assistant_id)
    assert assistant["generation_status"] == "completed"
    assert assistant["citations"][0]["resource_id"] == CHEN_PROFILE_ID

    stopped = api.post(
        f"/api/v1/supervision/conversations/{conversation_id}/messages/{assistant_id}/stop",
        headers=auth_headers(),
    )
    assert stopped.status_code == 200
    assert stopped.json()["generation_status"] == "completed"

    deleted = api.delete(
        f"/api/v1/supervision/conversations/{conversation_id}",
        headers=auth_headers(),
    )
    assert deleted.status_code == 200
    with SessionLocal() as database:
        conversation = database.get(SupervisionConversation, conversation_id)
        assert conversation is not None
        assert conversation.destroyed_at is not None
        assert database.query(SupervisionMessage).filter_by(
            conversation_id=conversation_id
        ).count() == 0
        assert database.query(SupervisionContextRef).filter_by(
            conversation_id=conversation_id
        ).count() == 0
