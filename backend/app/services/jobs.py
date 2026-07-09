from datetime import UTC, datetime
from uuid import uuid4

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.errors import ApiError
from app.models import AIJob


def utc_now() -> datetime:
    return datetime.now(UTC)


def create_job(
    database: Session,
    *,
    user_id: str,
    job_type: str,
    target_type: str,
    target_id: str,
) -> AIJob:
    now = utc_now()
    job = AIJob(
        id=str(uuid4()),
        user_id=user_id,
        job_type=job_type,
        target_type=target_type,
        target_id=target_id,
        status="running",
        progress=10,
        result_summary={},
        error_code=None,
        error_message=None,
        retryable=False,
        cancel_requested_at=None,
        created_at=now,
        started_at=now,
        finished_at=None,
    )
    database.add(job)
    database.flush()
    return job


def complete_job(database: Session, job: AIJob, result_summary: dict | None = None) -> AIJob:
    job.status = "completed"
    job.progress = 100
    job.result_summary = result_summary or {}
    job.finished_at = utc_now()
    database.flush()
    return job


def fail_job(
    database: Session,
    job: AIJob,
    *,
    code: str,
    message: str,
    retryable: bool,
) -> AIJob:
    job.status = "failed"
    job.error_code = code
    job.error_message = message
    job.retryable = retryable
    job.finished_at = utc_now()
    database.flush()
    return job


def get_owned_job(database: Session, job_id: str, user_id: str) -> AIJob:
    job = database.scalar(
        select(AIJob).where(AIJob.id == job_id, AIJob.user_id == user_id)
    )
    if job is None:
        raise ApiError(404, "job_not_found", "任务不存在。")
    return job


def serialize_job(job: AIJob) -> dict[str, object]:
    return {
        "id": job.id,
        "job_type": job.job_type,
        "target_type": job.target_type,
        "target_id": job.target_id,
        "status": job.status,
        "progress": job.progress,
        "result_summary": job.result_summary,
        "error": (
            {"code": job.error_code, "message": job.error_message, "retryable": job.retryable}
            if job.error_code
            else None
        ),
        "created_at": job.created_at.isoformat(),
        "started_at": job.started_at.isoformat() if job.started_at else None,
        "finished_at": job.finished_at.isoformat() if job.finished_at else None,
    }
