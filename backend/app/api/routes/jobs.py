from typing import Annotated

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.api.dependencies import current_user_id
from app.db.session import get_db
from app.services.auth import utc_now
from app.services.jobs import get_owned_job, serialize_job


router = APIRouter(prefix="/api/v1/ai-jobs", tags=["ai-jobs"])


@router.get("/{job_id}")
def get_job(
    job_id: str,
    user_id: Annotated[str, Depends(current_user_id)],
    database: Annotated[Session, Depends(get_db)],
) -> dict[str, object]:
    return serialize_job(get_owned_job(database, job_id, user_id))


@router.get("/{job_id}/events")
def get_job_events(
    job_id: str,
    user_id: Annotated[str, Depends(current_user_id)],
    database: Annotated[Session, Depends(get_db)],
) -> dict[str, object]:
    job = get_owned_job(database, job_id, user_id)
    return {
        "items": [
            {"event": "progress", "status": job.status, "progress": job.progress},
            {"event": "done" if job.status == "completed" else job.status, "status": job.status},
        ]
    }


@router.post("/{job_id}/cancel")
def cancel_job(
    job_id: str,
    user_id: Annotated[str, Depends(current_user_id)],
    database: Annotated[Session, Depends(get_db)],
) -> dict[str, object]:
    job = get_owned_job(database, job_id, user_id)
    if job.status in {"queued", "running"}:
        job.status = "cancelled"
        job.cancel_requested_at = utc_now()
        job.finished_at = utc_now()
        database.commit()
    return serialize_job(job)
