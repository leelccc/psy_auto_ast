from collections.abc import Iterable

from sqlalchemy import delete, or_, select
from sqlalchemy.orm import Session

from app.models import (
    AIJob,
    Attachment,
    CalendarEvent,
    Profile,
    Recording,
    RecordingSummary,
    RecordingTranscript,
    Report,
    SensitiveResource,
    SessionRecord,
    StoredFile,
)
from app.services.files import destroy_file
from app.services.storage import Storage


def _destroy_files(
    database: Session,
    storage: Storage,
    *,
    user_id: str,
    file_ids: Iterable[str | None],
) -> int:
    unique_ids = {file_id for file_id in file_ids if file_id}
    if not unique_ids:
        return 0
    files = database.scalars(
        select(StoredFile).where(
            StoredFile.user_id == user_id,
            StoredFile.id.in_(unique_ids),
        )
    ).all()
    for stored_file in files:
        if stored_file.destroyed_at is None:
            destroy_file(database, storage, stored_file)
    return len(files)


def _export_file_ids(jobs: Iterable[AIJob]) -> list[str]:
    return [
        str(job.result_summary["file_id"])
        for job in jobs
        if job.job_type == "export" and job.result_summary.get("file_id")
    ]


def cleanup_session_resources(
    database: Session,
    storage: Storage,
    *,
    session: SessionRecord,
) -> dict[str, int]:
    recordings = database.scalars(
        select(Recording).where(
            Recording.user_id == session.user_id,
            Recording.session_id == session.id,
        )
    ).all()
    recording_ids = [recording.id for recording in recordings]
    transcripts = (
        database.scalars(
            select(RecordingTranscript).where(
                RecordingTranscript.recording_id.in_(recording_ids)
            )
        ).all()
        if recording_ids
        else []
    )
    summaries = (
        database.scalars(
            select(RecordingSummary).where(
                RecordingSummary.recording_id.in_(recording_ids)
            )
        ).all()
        if recording_ids
        else []
    )
    reports = database.scalars(
        select(Report).where(
            Report.user_id == session.user_id,
            Report.session_id == session.id,
        )
    ).all()
    report_ids = [report.id for report in reports]
    target_ids = [*recording_ids, *report_ids]
    jobs = (
        database.scalars(
            select(AIJob).where(
                AIJob.user_id == session.user_id,
                AIJob.target_id.in_(target_ids),
            )
        ).all()
        if target_ids
        else []
    )
    attachments = database.scalars(
        select(Attachment).where(
            Attachment.user_id == session.user_id,
            Attachment.owner_type == "session",
            Attachment.owner_id == session.id,
        )
    ).all()
    destroyed_files = _destroy_files(
        database,
        storage,
        user_id=session.user_id,
        file_ids=[
            *(attachment.file_id for attachment in attachments),
            *(recording.audio_file_id for recording in recordings),
            *_export_file_ids(jobs),
        ],
    )

    resource_ids = [
        *recording_ids,
        *(transcript.id for transcript in transcripts),
        *(summary.id for summary in summaries),
        *report_ids,
    ]
    sensitive_filters = [
        (SensitiveResource.owner_type == "session")
        & (SensitiveResource.owner_id == session.id)
    ]
    if recording_ids:
        sensitive_filters.append(
            (SensitiveResource.owner_type == "recording")
            & (SensitiveResource.owner_id.in_(recording_ids))
        )
    if resource_ids:
        sensitive_filters.append(SensitiveResource.resource_id.in_(resource_ids))
    database.execute(
        delete(SensitiveResource).where(
            SensitiveResource.user_id == session.user_id,
            or_(*sensitive_filters),
        )
    )
    if target_ids:
        database.execute(
            delete(AIJob).where(
                AIJob.user_id == session.user_id,
                AIJob.target_id.in_(target_ids),
            )
        )
    database.execute(
        delete(CalendarEvent).where(
            CalendarEvent.user_id == session.user_id,
            CalendarEvent.session_id == session.id,
        )
    )
    database.execute(
        delete(Attachment).where(
            Attachment.user_id == session.user_id,
            Attachment.owner_type == "session",
            Attachment.owner_id == session.id,
        )
    )
    database.execute(
        delete(Report).where(
            Report.user_id == session.user_id,
            Report.session_id == session.id,
        )
    )
    database.execute(
        delete(Recording).where(
            Recording.user_id == session.user_id,
            Recording.session_id == session.id,
        )
    )
    database.delete(session)
    return {
        "sessions": 1,
        "attachments": len(attachments),
        "recordings": len(recordings),
        "reports": len(reports),
        "files": destroyed_files,
    }


def cleanup_profile_resources(
    database: Session,
    storage: Storage,
    *,
    profile: Profile,
) -> dict[str, int]:
    totals = {
        "profiles": 1,
        "sessions": 0,
        "attachments": 0,
        "recordings": 0,
        "reports": 0,
        "files": 0,
    }
    sessions = database.scalars(
        select(SessionRecord).where(
            SessionRecord.user_id == profile.user_id,
            SessionRecord.profile_id == profile.id,
        )
    ).all()
    for session in sessions:
        counts = cleanup_session_resources(database, storage, session=session)
        for key in ("sessions", "attachments", "recordings", "reports", "files"):
            totals[key] += counts[key]

    attachments = database.scalars(
        select(Attachment).where(
            Attachment.user_id == profile.user_id,
            Attachment.owner_type == "profile",
            Attachment.owner_id == profile.id,
        )
    ).all()
    reports = database.scalars(
        select(Report).where(
            Report.user_id == profile.user_id,
            Report.profile_id == profile.id,
        )
    ).all()
    report_ids = [report.id for report in reports]
    jobs = (
        database.scalars(
            select(AIJob).where(
                AIJob.user_id == profile.user_id,
                AIJob.target_id.in_(report_ids),
            )
        ).all()
        if report_ids
        else []
    )
    totals["files"] += _destroy_files(
        database,
        storage,
        user_id=profile.user_id,
        file_ids=[
            *(attachment.file_id for attachment in attachments),
            *_export_file_ids(jobs),
        ],
    )
    totals["attachments"] += len(attachments)
    totals["reports"] += len(reports)

    database.execute(
        delete(SensitiveResource).where(
            SensitiveResource.user_id == profile.user_id,
            or_(
                (SensitiveResource.owner_type == "profile")
                & (SensitiveResource.owner_id == profile.id),
                SensitiveResource.resource_id.in_(report_ids or [""]),
            ),
        )
    )
    if report_ids:
        database.execute(
            delete(AIJob).where(
                AIJob.user_id == profile.user_id,
                AIJob.target_id.in_(report_ids),
            )
        )
    database.execute(
        delete(Attachment).where(
            Attachment.user_id == profile.user_id,
            Attachment.owner_type == "profile",
            Attachment.owner_id == profile.id,
        )
    )
    database.execute(
        delete(Report).where(
            Report.user_id == profile.user_id,
            Report.profile_id == profile.id,
        )
    )
    database.delete(profile)
    return totals
