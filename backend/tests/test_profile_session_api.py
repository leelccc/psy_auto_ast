from datetime import UTC, datetime
from concurrent.futures import ThreadPoolExecutor

from fastapi.testclient import TestClient
from sqlalchemy import delete

from app.main import create_app
from app.seed import CHEN_PROFILE_ID, seed_demo_data
from app.db.session import SessionLocal
from app.models import Profile
from tests.helpers import auth_headers, profile_access_headers


def client() -> TestClient:
    with SessionLocal() as database:
        seed_demo_data(database)
    return TestClient(create_app())


def test_profiles_and_sessions_are_read_from_postgres() -> None:
    api = client()
    unlocked_headers = profile_access_headers(api)

    profiles_response = api.get("/api/v1/profiles?type=client", headers=auth_headers())
    assert profiles_response.status_code == 200
    profile = next(
        item for item in profiles_response.json()["items"]
        if item["id"] == CHEN_PROFILE_ID
    )
    assert profile["name"] == "陈雨"

    sessions_response = api.get(
        f"/api/v1/profiles/{CHEN_PROFILE_ID}/sessions",
        headers=unlocked_headers,
    )
    assert sessions_response.status_code == 200
    session_sequences = [item["sequence_no"] for item in sessions_response.json()["items"]]
    assert session_sequences[-2:] == [6, 5]
    assert profile["latest_sequence"] == max(session_sequences)


def test_session_mutations_are_persisted_and_backend_assigns_sequence() -> None:
    api = client()
    unlocked_headers = profile_access_headers(api)

    create_response = api.post(
        f"/api/v1/profiles/{CHEN_PROFILE_ID}/sessions",
        headers=unlocked_headers,
        json={
            "session_type": "counseling",
            "title": "新咨询",
            "occurred_at": "2026-06-09T18:00:00+08:00",
            "summary": "新增咨询摘要",
        },
    )
    assert create_response.status_code == 201
    session = create_response.json()
    sessions_after_create = api.get(
        f"/api/v1/profiles/{CHEN_PROFILE_ID}/sessions",
        headers=unlocked_headers,
    ).json()["items"]
    chronological = sorted(sessions_after_create, key=lambda item: item["occurred_at"])
    start_sequence = chronological[0]["sequence_no"]
    assert [item["sequence_no"] for item in chronological] == list(
        range(start_sequence, start_sequence + len(chronological))
    )

    update_response = api.patch(
        f"/api/v1/sessions/{session['id']}",
        headers=unlocked_headers,
        json={
            "summary": "更新后的摘要",
            "tags": ["跟进"],
            "occurred_at": "2026-07-01T18:00:00+08:00",
        },
    )
    assert update_response.status_code == 200
    assert update_response.json()["summary"] == "更新后的摘要"
    sessions_after_update = api.get(
        f"/api/v1/profiles/{CHEN_PROFILE_ID}/sessions",
        headers=unlocked_headers,
    ).json()["items"]
    latest = max(sessions_after_update, key=lambda item: item["sequence_no"])
    assert latest["id"] == session["id"]

    delete_response = api.request(
        "DELETE",
        f"/api/v1/sessions/{session['id']}",
        headers=unlocked_headers,
        json={"confirmation_text": "删除记录"},
    )
    assert delete_response.status_code == 200
    assert delete_response.json()["deleted"] is True


def test_profile_queries_are_isolated_to_the_authenticated_user() -> None:
    other_profile_id = "profile-other-user-isolation"
    now = datetime.now(UTC)
    with SessionLocal() as database:
        database.execute(delete(Profile).where(Profile.id == other_profile_id))
        database.add(Profile(
            id=other_profile_id,
            user_id="other-user",
            type="client",
            name="不应可见",
            code=None,
            status="active",
            crisis_level=None,
            initial_session_count=0,
            next_session_at=None,
            metadata_json={},
            created_at=now,
            updated_at=now,
        ))
        database.commit()

    try:
        api = client()
        list_response = api.get("/api/v1/profiles", headers=auth_headers())
        assert list_response.status_code == 200
        assert other_profile_id not in {item["id"] for item in list_response.json()["items"]}

        sessions_response = api.get(
            f"/api/v1/profiles/{other_profile_id}/sessions",
            headers=auth_headers(),
        )
        assert sessions_response.status_code == 404
    finally:
        with SessionLocal() as database:
            database.execute(delete(Profile).where(Profile.id == other_profile_id))
            database.commit()


def test_concurrent_session_creation_allocates_distinct_sequences() -> None:
    api = client()
    unlocked_headers = profile_access_headers(api)

    def create_one(index: int):
        return api.post(
            f"/api/v1/profiles/{CHEN_PROFILE_ID}/sessions",
            headers=unlocked_headers,
            json={
                "session_type": "counseling",
                "occurred_at": f"2026-06-{10 + index:02d}T10:00:00+08:00",
                "summary": f"并发记录 {index}",
            },
        )

    with ThreadPoolExecutor(max_workers=2) as executor:
        responses = list(executor.map(create_one, (0, 1)))

    assert [response.status_code for response in responses] == [201, 201]
    sessions = api.get(
        f"/api/v1/profiles/{CHEN_PROFILE_ID}/sessions",
        headers=unlocked_headers,
    ).json()["items"]
    created = [item for item in sessions if item["summary"].startswith("并发记录")]
    chronological = sorted(sessions, key=lambda item: item["occurred_at"])
    start_sequence = chronological[0]["sequence_no"]
    assert [item["sequence_no"] for item in chronological] == list(
        range(start_sequence, start_sequence + len(chronological))
    )
    assert len(created) == 2
