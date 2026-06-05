from dataclasses import dataclass, field
from datetime import UTC, datetime, timedelta
from hashlib import sha256
from typing import Annotated, Any
from uuid import uuid4

from fastapi import Depends, FastAPI, Header, HTTPException, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field


DEMO_USER_ID = "demo-user"


def utc_now() -> datetime:
    return datetime.now(UTC)


def iso(value: datetime) -> str:
    return value.isoformat()


def hash_secret(value: str) -> str:
    return sha256(value.encode("utf-8")).hexdigest()


class ApiError(HTTPException):
    def __init__(self, status_code: int, code: str, message: str) -> None:
        super().__init__(status_code=status_code, detail={"code": code, "message": message})


@dataclass
class Profile:
    id: str
    user_id: str
    type: str
    name: str
    status: str | None = None
    crisis_level: str | None = None
    initial_session_count: int = 0
    created_at: datetime = field(default_factory=utc_now)


@dataclass
class Session:
    id: str
    user_id: str
    profile_id: str
    session_type: str
    sequence_no: int
    title: str | None = None
    created_at: datetime = field(default_factory=utc_now)


@dataclass
class Recording:
    id: str
    user_id: str
    title: str
    source_type: str
    duration_seconds: int | None = None
    audio_expires_at: datetime | None = None
    created_at: datetime = field(default_factory=utc_now)


@dataclass
class SensitiveResource:
    resource_type: str
    resource_id: str
    user_id: str
    display_name: str
    expires_at: datetime
    can_long_term_preserve: bool


@dataclass
class ProfileAccessGrant:
    user_id: str
    profile_type: str
    grant_hash: str
    expires_at: datetime
    used_at: datetime | None = None


class AppState:
    def __init__(self) -> None:
        self.profile_passwords: dict[tuple[str, str], str] = {}
        self.profile_grants: dict[str, ProfileAccessGrant] = {}
        self.profiles: dict[str, Profile] = {}
        self.sessions: dict[str, Session] = {}
        self.recordings: dict[str, Recording] = {}
        self.sensitive_resources: list[SensitiveResource] = []


class SetProfilePasswordRequest(BaseModel):
    new_password: str = Field(min_length=1)


class VerifyProfilePasswordRequest(BaseModel):
    password: str = Field(min_length=1)


class CreateProfileRequest(BaseModel):
    type: str
    name: str
    status: str | None = None
    crisis_level: str | None = None
    initial_session_count: int = 0


class CreateSessionRequest(BaseModel):
    session_type: str
    title: str | None = None


class CreateRecordingRequest(BaseModel):
    title: str
    source_type: str


class CompleteAudioRequest(BaseModel):
    filename: str
    mime_type: str
    duration_seconds: int


def error_response(_: Request, exc: ApiError) -> JSONResponse:
    return JSONResponse(
        status_code=exc.status_code,
        content={"error": {"code": exc.detail["code"], "message": exc.detail["message"], "details": {}}},
    )


def create_app() -> FastAPI:
    app = FastAPI(title="Counselor Assistant API")
    state = AppState()
    app.add_exception_handler(ApiError, error_response)

    def current_user_id(authorization: Annotated[str | None, Header()] = None) -> str:
        if authorization != "Bearer demo-token":
            raise ApiError(401, "unauthorized", "请先登录。")
        return DEMO_USER_ID

    def get_profile(profile_id: str, user_id: str) -> Profile:
        profile = state.profiles.get(profile_id)
        if profile is None or profile.user_id != user_id:
            raise ApiError(404, "profile_not_found", "档案不存在。")
        return profile

    def require_profile_access(
        profile: Profile,
        user_id: str,
        x_profile_access_grant: Annotated[str | None, Header()] = None,
    ) -> None:
        if not x_profile_access_grant:
            raise ApiError(403, "profile_access_grant_required", "进入档案详情前需要验证档案访问密码。")
        grant = state.profile_grants.get(x_profile_access_grant)
        if (
            grant is None
            or grant.user_id != user_id
            or grant.profile_type != profile.type
            or grant.used_at is not None
            or grant.expires_at <= utc_now()
        ):
            raise ApiError(403, "profile_access_grant_invalid", "档案访问凭证无效，请重新验证密码。")
        grant.used_at = utc_now()

    @app.get("/api/v1/health")
    def health() -> dict[str, str]:
        return {"status": "ok", "service": "counselor-assistant-api"}

    @app.put("/api/v1/profile-access-passwords/{profile_type}")
    def set_profile_password(
        profile_type: str,
        payload: SetProfilePasswordRequest,
        user_id: Annotated[str, Depends(current_user_id)],
    ) -> dict[str, Any]:
        state.profile_passwords[(user_id, profile_type)] = hash_secret(payload.new_password)
        return {"profile_type": profile_type, "is_set": True}

    @app.post("/api/v1/profile-access-passwords/{profile_type}/verify")
    def verify_profile_password(
        profile_type: str,
        payload: VerifyProfilePasswordRequest,
        user_id: Annotated[str, Depends(current_user_id)],
    ) -> dict[str, Any]:
        stored_hash = state.profile_passwords.get((user_id, profile_type))
        if stored_hash is None or stored_hash != hash_secret(payload.password):
            raise ApiError(403, "profile_password_invalid", "档案访问密码不正确。")
        grant = str(uuid4())
        state.profile_grants[grant] = ProfileAccessGrant(
            user_id=user_id,
            profile_type=profile_type,
            grant_hash=hash_secret(grant),
            expires_at=utc_now() + timedelta(minutes=5),
        )
        return {"verified": True, "profile_type": profile_type, "profile_access_grant": grant}

    @app.post("/api/v1/profiles", status_code=201)
    def create_profile(
        payload: CreateProfileRequest,
        user_id: Annotated[str, Depends(current_user_id)],
    ) -> dict[str, Any]:
        profile = Profile(
            id=str(uuid4()),
            user_id=user_id,
            type=payload.type,
            name=payload.name,
            status=payload.status,
            crisis_level=payload.crisis_level,
            initial_session_count=payload.initial_session_count,
        )
        state.profiles[profile.id] = profile
        return serialize_profile(profile)

    @app.get("/api/v1/profiles/{profile_id}")
    def profile_detail(
        profile_id: str,
        user_id: Annotated[str, Depends(current_user_id)],
        x_profile_access_grant: Annotated[str | None, Header()] = None,
    ) -> dict[str, Any]:
        profile = get_profile(profile_id, user_id)
        require_profile_access(profile, user_id, x_profile_access_grant)
        return serialize_profile(profile)

    @app.post("/api/v1/profiles/{profile_id}/sessions", status_code=201)
    def create_session(
        profile_id: str,
        payload: CreateSessionRequest,
        user_id: Annotated[str, Depends(current_user_id)],
    ) -> dict[str, Any]:
        profile = get_profile(profile_id, user_id)
        existing = [session.sequence_no for session in state.sessions.values() if session.profile_id == profile.id]
        sequence_no = max(existing, default=profile.initial_session_count) + 1
        session = Session(
            id=str(uuid4()),
            user_id=user_id,
            profile_id=profile.id,
            session_type=payload.session_type,
            sequence_no=sequence_no,
            title=payload.title,
        )
        state.sessions[session.id] = session
        return {
            "id": session.id,
            "profile_id": session.profile_id,
            "session_type": session.session_type,
            "sequence_no": session.sequence_no,
            "title": session.title,
        }

    @app.post("/api/v1/recordings", status_code=201)
    def create_recording(
        payload: CreateRecordingRequest,
        user_id: Annotated[str, Depends(current_user_id)],
    ) -> dict[str, Any]:
        recording = Recording(id=str(uuid4()), user_id=user_id, title=payload.title, source_type=payload.source_type)
        state.recordings[recording.id] = recording
        return {"id": recording.id, "title": recording.title, "source_type": recording.source_type}

    @app.post("/api/v1/recordings/{recording_id}/audio")
    def complete_recording_audio(
        recording_id: str,
        payload: CompleteAudioRequest,
        user_id: Annotated[str, Depends(current_user_id)],
    ) -> dict[str, Any]:
        recording = state.recordings.get(recording_id)
        if recording is None or recording.user_id != user_id:
            raise ApiError(404, "recording_not_found", "录音不存在。")
        recording.duration_seconds = payload.duration_seconds
        recording.audio_expires_at = utc_now() + timedelta(days=14)
        state.sensitive_resources.append(
            SensitiveResource(
                resource_type="audio",
                resource_id=recording.id,
                user_id=user_id,
                display_name=recording.title,
                expires_at=recording.audio_expires_at,
                can_long_term_preserve=False,
            )
        )
        return {
            "audio_expires_at": iso(recording.audio_expires_at),
            "can_long_term_preserve_audio": False,
        }

    @app.get("/api/v1/privacy/expiring-resources")
    def expiring_resources(user_id: Annotated[str, Depends(current_user_id)]) -> dict[str, Any]:
        items = [
            {
                "resource_type": resource.resource_type,
                "resource_id": resource.resource_id,
                "display_name": resource.display_name,
                "can_long_term_preserve": resource.can_long_term_preserve,
                "expires_at": iso(resource.expires_at),
            }
            for resource in state.sensitive_resources
            if resource.user_id == user_id
        ]
        return {"items": items}

    return app


def serialize_profile(profile: Profile) -> dict[str, Any]:
    return {
        "id": profile.id,
        "type": profile.type,
        "name": profile.name,
        "status": profile.status,
        "crisis_level": profile.crisis_level,
        "initial_session_count": profile.initial_session_count,
    }


app = create_app()
