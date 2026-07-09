from datetime import timedelta
from typing import Annotated, Any
from uuid import uuid4

from fastapi import APIRouter, Depends, Header, Query
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.api.dependencies import current_user_id
from app.api.errors import ApiError
from app.db.session import get_db
from app.models import (
    Attachment,
    Profile,
    Recording,
    RecordingSummary,
    RecordingTranscript,
    Report,
    SessionRecord,
    StoredFile,
)
from app.services.ai import DeterministicAIProvider
from app.services.ai.report_prompts import ReportPromptSource, build_report_prompt
from app.services.auth import utc_now
from app.services.exports import render_docx, render_pdf
from app.services.jobs import complete_job, create_job
from app.services.lifecycle import register_sensitive_resource
from app.services.security import (
    profile_type_for_profile,
    profile_type_for_report,
    profile_type_for_session,
    require_profile_access_for_type,
)
from app.services.storage import Storage


REPORT_TYPES = {
    "counseling_note",
    "supervision_feedback",
    "supervision_note",
    "case_report",
}


class SourceRef(BaseModel):
    resource_type: str
    resource_id: str


class GenerateReportRequest(BaseModel):
    report_type: str
    profile_id: str | None = None
    session_id: str | None = None
    recording_id: str | None = None
    selected_sources: list[SourceRef] = Field(default_factory=list)
    confirm_overwrite_draft: bool = False


class UpdateReportRequest(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=160)
    content_json: dict[str, Any] | None = None


class SaveFormalRequest(BaseModel):
    confirm_replace: bool = False


class RegenerateReportRequest(BaseModel):
    selected_sources: list[SourceRef] = Field(default_factory=list)
    confirm_overwrite_draft: bool = False


class ExportReportRequest(BaseModel):
    format: str
    version: str = "draft"


def get_report(database: Session, report_id: str, user_id: str) -> Report:
    report = database.scalar(
        select(Report).where(
            Report.id == report_id,
            Report.user_id == user_id,
            Report.destroyed_at.is_(None),
        )
    )
    if report is None:
        raise ApiError(404, "report_not_found", "报告不存在。")
    return report


def serialize_report(report: Report) -> dict[str, object]:
    return {
        "id": report.id,
        "report_type": report.report_type,
        "profile_id": report.profile_id,
        "session_id": report.session_id,
        "recording_id": report.recording_id,
        "title": report.title,
        "draft_content": report.draft_content,
        "formal_content": report.formal_content,
        "selected_sources": report.selected_sources,
        "generation_status": report.generation_status,
        "formal_saved_at": (
            report.formal_saved_at.isoformat() if report.formal_saved_at else None
        ),
        "expires_at": report.expires_at.isoformat(),
        "created_at": report.created_at.isoformat(),
        "updated_at": report.updated_at.isoformat(),
    }


def list_sources(
    database: Session,
    *,
    user_id: str,
    profile_id: str | None,
    session_id: str | None,
    exclude_report_types: set[str] | None = None,
    exclude_report_id: str | None = None,
) -> list[dict[str, object]]:
    items: list[dict[str, object]] = []
    if session_id:
        session = database.scalar(
            select(SessionRecord).where(
                SessionRecord.id == session_id,
                SessionRecord.user_id == user_id,
            )
        )
        if session is None:
            raise ApiError(404, "session_not_found", "记录不存在。")
        items.append({
            "resource_type": "session",
            "resource_id": session.id,
            "label": f"第{session.sequence_no}次记录摘要",
            "analysis_status": "available",
            "default_selected": True,
        })
        recording = database.scalar(
            select(Recording).where(
                Recording.session_id == session.id,
                Recording.user_id == user_id,
            )
        )
        if recording:
            transcript = database.scalar(
                select(RecordingTranscript).where(
                    RecordingTranscript.recording_id == recording.id,
                    RecordingTranscript.destroyed_at.is_(None),
                )
            )
            summary = database.scalar(
                select(RecordingSummary).where(
                    RecordingSummary.recording_id == recording.id,
                    RecordingSummary.destroyed_at.is_(None),
                )
            )
            if transcript:
                items.append({
                    "resource_type": "transcript",
                    "resource_id": transcript.id,
                    "label": f"第{session.sequence_no}次转写",
                    "analysis_status": "available",
                    "default_selected": True,
                })
            if summary:
                items.append({
                    "resource_type": "recording_summary",
                    "resource_id": summary.id,
                    "label": f"第{session.sequence_no}次录音纪要",
                    "analysis_status": "available",
                    "default_selected": True,
                })
        attachments = database.scalars(
            select(Attachment).where(
                Attachment.user_id == user_id,
                Attachment.owner_type == "session",
                Attachment.owner_id == session.id,
                Attachment.is_current.is_(True),
            )
        ).all()
        for attachment in attachments:
            stored_file = database.scalar(
                select(StoredFile).where(StoredFile.id == attachment.file_id)
            )
            status = "available" if (
                stored_file is not None
                and stored_file.upload_status in {"uploaded", "metadata_only"}
                and stored_file.destroyed_at is None
            ) else "destroyed"
            items.append({
                "resource_type": "attachment",
                "resource_id": attachment.id,
                "label": f"{attachment.category}：{stored_file.filename if stored_file else attachment.file_id}",
                "analysis_status": status,
                "default_selected": status == "available",
            })
    if profile_id:
        profile = database.scalar(
            select(Profile).where(Profile.id == profile_id, Profile.user_id == user_id)
        )
        if profile is None:
            raise ApiError(404, "profile_not_found", "档案不存在。")
        items.append({
            "resource_type": "profile",
            "resource_id": profile.id,
            "label": f"{profile.name} 基础档案",
            "analysis_status": "available",
            "default_selected": True,
        })
        reports = database.scalars(
            select(Report).where(
                Report.profile_id == profile.id,
                Report.user_id == user_id,
                Report.destroyed_at.is_(None),
            )
        ).all()
        blocked_report_types = exclude_report_types or set()
        items.extend({
            "resource_type": "report",
            "resource_id": report.id,
            "label": report.title,
            "analysis_status": "available",
            "default_selected": True,
        } for report in reports if (
            report.id != exclude_report_id
            and report.report_type not in blocked_report_types
        ))
    unique: dict[tuple[str, str], dict[str, object]] = {}
    for item in items:
        unique[(str(item["resource_type"]), str(item["resource_id"]))] = item
    return list(unique.values())


def validate_selected_sources(
    available: list[dict[str, object]],
    selected: list[SourceRef],
) -> list[dict[str, str]]:
    available_map = {
        (str(item["resource_type"]), str(item["resource_id"])): item
        for item in available
        if item["analysis_status"] == "available"
    }
    result: list[dict[str, str]] = []
    for source in selected:
        item = available_map.get((source.resource_type, source.resource_id))
        if item is None:
            raise ApiError(422, "report_source_unavailable", "所选资料不存在或不可用于生成。")
        result.append({
            "resource_type": source.resource_type,
            "resource_id": source.resource_id,
            "label": str(item["label"]),
        })
    return result


def compact_json_content(value: Any) -> str:
    if value is None:
        return ""
    if isinstance(value, str):
        return value
    if isinstance(value, list):
        return "\n".join(compact_json_content(item) for item in value)
    if isinstance(value, dict):
        if "blocks" in value and isinstance(value["blocks"], list):
            return "\n".join(
                f"{block.get('title', '')}：{block.get('content', '')}"
                for block in value["blocks"]
                if isinstance(block, dict)
            )
        return "\n".join(f"{key}：{compact_json_content(item)}" for key, item in value.items())
    return str(value)


def source_content(
    database: Session,
    *,
    user_id: str,
    source: dict[str, str],
) -> str:
    resource_type = source["resource_type"]
    resource_id = source["resource_id"]
    if resource_type == "profile":
        profile = database.scalar(
            select(Profile).where(Profile.id == resource_id, Profile.user_id == user_id)
        )
        if profile is None:
            return "基础档案不可用。"
        return "\n".join([
            f"姓名/称呼：{profile.name}",
            f"编号：{profile.code or '未编号'}",
            f"身份类型：{profile.type}",
            f"状态：{profile.status or '未设置'}",
            f"危机评估：{profile.crisis_level or '未设置'}",
            f"既往次数：{profile.initial_session_count}",
            f"下次安排：{profile.next_session_at.isoformat() if profile.next_session_at else '未设置'}",
            f"扩展字段：{compact_json_content(profile.metadata_json)}",
            f"备注：{profile.notes or '无'}",
        ])
    if resource_type == "session":
        session = database.scalar(
            select(SessionRecord).where(SessionRecord.id == resource_id, SessionRecord.user_id == user_id)
        )
        if session is None:
            return "记录摘要不可用。"
        return "\n".join([
            f"第{session.sequence_no}次记录",
            f"类型：{session.session_type}",
            f"时间：{session.occurred_at.isoformat()}",
            f"形式：{session.mode or '未设置'}",
            f"标签：{'、'.join(session.tags) if session.tags else '无'}",
            f"摘要：{session.summary or '无'}",
        ])
    if resource_type == "transcript":
        transcript = database.scalar(
            select(RecordingTranscript).where(
                RecordingTranscript.id == resource_id,
                RecordingTranscript.user_id == user_id,
                RecordingTranscript.destroyed_at.is_(None),
            )
        )
        if transcript is None:
            return "转写不可用。"
        speakers = transcript.speakers_json or {}
        return "\n".join(
            f"{speakers.get(segment.get('speaker_key'), segment.get('speaker_key', '发言人'))}：{segment.get('text', '')}"
            for segment in sorted(transcript.segments_json, key=lambda item: item.get("start_ms", 0))
            if isinstance(segment, dict)
        )
    if resource_type == "recording_summary":
        summary = database.scalar(
            select(RecordingSummary).where(
                RecordingSummary.id == resource_id,
                RecordingSummary.user_id == user_id,
                RecordingSummary.destroyed_at.is_(None),
            )
        )
        if summary is None:
            return "录音纪要不可用。"
        chapters = "\n".join(
            f"{item.get('title', '章节')}：{item.get('summary', '')}"
            for item in summary.chapter_overview
            if isinstance(item, dict)
        )
        return f"总述：{summary.main_summary}\n章节：\n{chapters}"
    if resource_type == "attachment":
        attachment = database.scalar(
            select(Attachment).where(
                Attachment.id == resource_id,
                Attachment.user_id == user_id,
                Attachment.is_current.is_(True),
            )
        )
        if attachment is None:
            return "附件解析文本不可用。"
        stored_file = database.scalar(select(StoredFile).where(StoredFile.id == attachment.file_id))
        file_summary = "\n".join([
            f"附件类别：{attachment.category}",
            f"文件名：{stored_file.filename if stored_file else attachment.file_id}",
            f"解析状态：{attachment.analysis_status}",
        ])
        if attachment.extracted_text:
            return f"{file_summary}\n解析文本：\n{attachment.extracted_text}"
        return f"{file_summary}\n该附件已上传到本次记录，但暂无解析文本；生成时只能把它作为已上传资料线索，不得编造文件内容。"
    if resource_type == "report":
        report = database.scalar(
            select(Report).where(
                Report.id == resource_id,
                Report.user_id == user_id,
                Report.destroyed_at.is_(None),
            )
        )
        if report is None:
            return "历史报告不可用。"
        return compact_json_content(report.formal_content or report.draft_content)
    return "资料类型暂不支持。"


def prompt_sources(
    database: Session,
    *,
    user_id: str,
    selected: list[dict[str, str]],
) -> list[ReportPromptSource]:
    return [
        ReportPromptSource(
            resource_type=source["resource_type"],
            resource_id=source["resource_id"],
            label=source["label"],
            content=source_content(database, user_id=user_id, source=source),
        )
        for source in selected
    ]


def create_reports_router(storage: Storage) -> APIRouter:
    router = APIRouter(prefix="/api/v1/reports", tags=["reports"])

    def require_report_access(
        database: Session,
        *,
        report: Report,
        user_id: str,
        raw_grant: str | None,
    ) -> None:
        require_profile_access_for_type(
            database,
            user_id=user_id,
            profile_type=profile_type_for_report(
                database,
                user_id=user_id,
                report=report,
            ),
            raw_grant=raw_grant,
        )

    def require_scope_access(
        database: Session,
        *,
        profile_id: str | None,
        session_id: str | None,
        user_id: str,
        raw_grant: str | None,
    ) -> None:
        profile_type = (
            profile_type_for_profile(
                database,
                user_id=user_id,
                profile_id=profile_id,
            )
            if profile_id
            else profile_type_for_session(
                database,
                user_id=user_id,
                session_id=session_id,
            )
            if session_id
            else None
        )
        require_profile_access_for_type(
            database,
            user_id=user_id,
            profile_type=profile_type,
            raw_grant=raw_grant,
        )

    @router.get("")
    def list_reports(
        user_id: Annotated[str, Depends(current_user_id)],
        database: Annotated[Session, Depends(get_db)],
        profile_id: str | None = None,
        session_id: str | None = None,
        report_type: str | None = None,
        page: Annotated[int, Query(ge=1)] = 1,
        page_size: Annotated[int, Query(ge=1, le=100)] = 20,
        x_profile_access_grant: Annotated[str | None, Header()] = None,
    ) -> dict[str, object]:
        require_scope_access(
            database,
            profile_id=profile_id,
            session_id=session_id,
            user_id=user_id,
            raw_grant=x_profile_access_grant,
        )
        query = select(Report).where(
            Report.user_id == user_id,
            Report.destroyed_at.is_(None),
        )
        if profile_id:
            query = query.where(Report.profile_id == profile_id)
        if session_id:
            query = query.where(Report.session_id == session_id)
        if report_type:
            query = query.where(Report.report_type == report_type)
        total = database.scalar(select(func.count()).select_from(query.subquery())) or 0
        items = database.scalars(
            query.order_by(Report.updated_at.desc(), Report.id.asc())
            .offset((page - 1) * page_size)
            .limit(page_size)
        ).all()
        return {
            "items": [serialize_report(report) for report in items],
            "page": page,
            "page_size": page_size,
            "total": total,
        }

    @router.get("/generation-sources")
    def generation_sources(
        report_type: str,
        user_id: Annotated[str, Depends(current_user_id)],
        database: Annotated[Session, Depends(get_db)],
        profile_id: str | None = None,
        session_id: str | None = None,
        x_profile_access_grant: Annotated[str | None, Header()] = None,
    ) -> dict[str, object]:
        if report_type not in REPORT_TYPES:
            raise ApiError(422, "report_type_invalid", "不支持的报告类型。")
        require_scope_access(
            database,
            profile_id=profile_id,
            session_id=session_id,
            user_id=user_id,
            raw_grant=x_profile_access_grant,
        )
        return {
            "items": list_sources(
                database,
                user_id=user_id,
                profile_id=profile_id,
                session_id=session_id,
                exclude_report_types={"case_report"} if report_type == "case_report" else None,
            )
        }

    @router.post("/generate", status_code=202)
    def generate_report(
        payload: GenerateReportRequest,
        user_id: Annotated[str, Depends(current_user_id)],
        database: Annotated[Session, Depends(get_db)],
        x_profile_access_grant: Annotated[str | None, Header()] = None,
    ) -> dict[str, object]:
        if payload.report_type not in REPORT_TYPES:
            raise ApiError(422, "report_type_invalid", "不支持的报告类型。")
        if payload.report_type == "case_report" and not payload.profile_id:
            raise ApiError(422, "report_profile_required", "个案报告必须关联档案。")
        if payload.report_type != "case_report" and not payload.session_id:
            raise ApiError(422, "report_session_required", "单次记录报告必须关联记录。")
        require_scope_access(
            database,
            profile_id=payload.profile_id,
            session_id=payload.session_id,
            user_id=user_id,
            raw_grant=x_profile_access_grant,
        )
        available = list_sources(
            database,
            user_id=user_id,
            profile_id=payload.profile_id,
            session_id=payload.session_id,
            exclude_report_types={"case_report"} if payload.report_type == "case_report" else None,
        )
        selected = validate_selected_sources(available, payload.selected_sources)
        if not selected:
            raise ApiError(422, "report_sources_required", "请至少选择一项可用资料。")
        existing = database.scalar(
            select(Report).where(
                Report.user_id == user_id,
                Report.report_type == payload.report_type,
                Report.profile_id == payload.profile_id,
                Report.session_id == payload.session_id,
                Report.destroyed_at.is_(None),
            )
        )
        if existing and not payload.confirm_overwrite_draft:
            raise ApiError(409, "report_draft_exists", "已有报告草稿，覆盖前需要确认。")
        profile = (
            database.scalar(select(Profile).where(Profile.id == payload.profile_id))
            if payload.profile_id
            else None
        )
        session = (
            database.scalar(select(SessionRecord).where(SessionRecord.id == payload.session_id))
            if payload.session_id
            else None
        )
        title = report_title(payload.report_type, profile, session)
        prompt = build_report_prompt(
            report_type=payload.report_type,
            title=title,
            sources=prompt_sources(database, user_id=user_id, selected=selected),
        )
        provider = DeterministicAIProvider()
        content = provider.generate_report(
            report_type=payload.report_type,
            title=title,
            source_labels=[item["label"] for item in selected],
            prompt=prompt,
        )
        now = utc_now()
        report = existing or Report(
            id=str(uuid4()),
            user_id=user_id,
            profile_id=payload.profile_id,
            session_id=payload.session_id,
            recording_id=payload.recording_id,
            report_type=payload.report_type,
            title=title,
            draft_content={},
            formal_content=None,
            selected_sources=[],
            generation_status="completed",
            formal_saved_at=None,
            expires_at=now + timedelta(days=14),
            destroyed_at=None,
            created_at=now,
            updated_at=now,
        )
        if existing is None:
            database.add(report)
        report.title = title
        report.draft_content = content
        report.selected_sources = selected
        report.generation_status = "completed"
        report.updated_at = now
        database.flush()
        job = create_job(
            database,
            user_id=user_id,
            job_type="report_generation",
            target_type="report",
            target_id=report.id,
        )
        complete_job(database, job, {"report_id": report.id})
        register_sensitive_resource(
            database,
            user_id=user_id,
            resource_type="report",
            resource_id=report.id,
            display_name=report.title,
            expires_at=report.expires_at,
            can_long_term_preserve=True,
            owner_type="profile" if report.profile_id else "session",
            owner_id=report.profile_id or report.session_id,
        )
        database.commit()
        return {"job_id": job.id, "draft_report_id": report.id}

    @router.get("/{report_id}")
    def report_detail(
        report_id: str,
        user_id: Annotated[str, Depends(current_user_id)],
        database: Annotated[Session, Depends(get_db)],
        x_profile_access_grant: Annotated[str | None, Header()] = None,
    ) -> dict[str, object]:
        report = get_report(database, report_id, user_id)
        require_report_access(
            database,
            report=report,
            user_id=user_id,
            raw_grant=x_profile_access_grant,
        )
        return serialize_report(report)

    @router.patch("/{report_id}")
    def update_report(
        report_id: str,
        payload: UpdateReportRequest,
        user_id: Annotated[str, Depends(current_user_id)],
        database: Annotated[Session, Depends(get_db)],
        x_profile_access_grant: Annotated[str | None, Header()] = None,
    ) -> dict[str, object]:
        report = get_report(database, report_id, user_id)
        require_report_access(
            database,
            report=report,
            user_id=user_id,
            raw_grant=x_profile_access_grant,
        )
        if payload.title is not None:
            report.title = payload.title.strip()
        if payload.content_json is not None:
            report.draft_content = payload.content_json
        report.updated_at = utc_now()
        database.commit()
        return serialize_report(report)

    @router.post("/{report_id}/save-formal")
    def save_formal(
        report_id: str,
        payload: SaveFormalRequest,
        user_id: Annotated[str, Depends(current_user_id)],
        database: Annotated[Session, Depends(get_db)],
        x_profile_access_grant: Annotated[str | None, Header()] = None,
    ) -> dict[str, object]:
        report = get_report(database, report_id, user_id)
        require_report_access(
            database,
            report=report,
            user_id=user_id,
            raw_grant=x_profile_access_grant,
        )
        if report.formal_content is not None and not payload.confirm_replace:
            raise ApiError(409, "formal_replace_confirmation_required", "替换正式版前需要确认。")
        report.formal_content = report.draft_content
        report.formal_saved_at = utc_now()
        report.updated_at = utc_now()
        database.commit()
        return serialize_report(report)

    @router.post("/{report_id}/copy-formal-to-draft")
    def copy_formal_to_draft(
        report_id: str,
        user_id: Annotated[str, Depends(current_user_id)],
        database: Annotated[Session, Depends(get_db)],
        x_profile_access_grant: Annotated[str | None, Header()] = None,
    ) -> dict[str, object]:
        report = get_report(database, report_id, user_id)
        require_report_access(
            database,
            report=report,
            user_id=user_id,
            raw_grant=x_profile_access_grant,
        )
        if report.formal_content is None:
            raise ApiError(409, "formal_report_missing", "当前没有正式版可复制。")
        report.draft_content = report.formal_content
        report.updated_at = utc_now()
        database.commit()
        return serialize_report(report)

    @router.post("/{report_id}/regenerate", status_code=202)
    def regenerate_report(
        report_id: str,
        payload: RegenerateReportRequest,
        user_id: Annotated[str, Depends(current_user_id)],
        database: Annotated[Session, Depends(get_db)],
        x_profile_access_grant: Annotated[str | None, Header()] = None,
    ) -> dict[str, object]:
        report = get_report(database, report_id, user_id)
        require_report_access(
            database,
            report=report,
            user_id=user_id,
            raw_grant=x_profile_access_grant,
        )
        if not payload.confirm_overwrite_draft:
            raise ApiError(409, "report_overwrite_confirmation_required", "重新生成草稿前需要确认。")
        available = list_sources(
            database,
            user_id=user_id,
            profile_id=report.profile_id,
            session_id=report.session_id,
            exclude_report_types={"case_report"} if report.report_type == "case_report" else None,
            exclude_report_id=report.id,
        )
        selected = validate_selected_sources(available, payload.selected_sources)
        if not selected:
            raise ApiError(422, "report_sources_required", "请至少选择一项可用资料。")
        prompt = build_report_prompt(
            report_type=report.report_type,
            title=report.title,
            sources=prompt_sources(database, user_id=user_id, selected=selected),
        )
        report.draft_content = DeterministicAIProvider().generate_report(
            report_type=report.report_type,
            title=report.title,
            source_labels=[item["label"] for item in selected],
            prompt=prompt,
        )
        report.selected_sources = selected
        report.updated_at = utc_now()
        job = create_job(
            database,
            user_id=user_id,
            job_type="report_regeneration",
            target_type="report",
            target_id=report.id,
        )
        complete_job(database, job, {"report_id": report.id})
        database.commit()
        return {"job_id": job.id, "draft_report_id": report.id}

    @router.post("/{report_id}/export", status_code=202)
    def export_report(
        report_id: str,
        payload: ExportReportRequest,
        user_id: Annotated[str, Depends(current_user_id)],
        database: Annotated[Session, Depends(get_db)],
        x_profile_access_grant: Annotated[str | None, Header()] = None,
    ) -> dict[str, object]:
        report = get_report(database, report_id, user_id)
        require_report_access(
            database,
            report=report,
            user_id=user_id,
            raw_grant=x_profile_access_grant,
        )
        if payload.format not in {"pdf", "docx"}:
            raise ApiError(422, "export_format_invalid", "只支持 PDF 或 DOCX。")
        if payload.version not in {"draft", "formal"}:
            raise ApiError(422, "report_version_invalid", "不支持的报告版本。")
        content = report.formal_content if payload.version == "formal" else report.draft_content
        if content is None:
            raise ApiError(409, "formal_report_missing", "当前没有正式版可导出。")
        data = (
            render_pdf(report.title, content)
            if payload.format == "pdf"
            else render_docx(report.title, content)
        )
        mime_type = (
            "application/pdf"
            if payload.format == "pdf"
            else "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        )
        file_id = str(uuid4())
        filename = f"{report.title}.{payload.format}"
        storage_key = f"{user_id}/{file_id}/{filename}"
        storage.write_object(storage_key, data, mime_type)
        now = utc_now()
        stored_file = StoredFile(
            id=file_id,
            user_id=user_id,
            storage_key=storage_key,
            filename=filename,
            mime_type=mime_type,
            size_bytes=len(data),
            checksum_sha256=None,
            purpose="export",
            upload_status="uploaded",
            expires_at=now + timedelta(days=14),
            can_long_term_preserve=True,
            long_term_authorized_at=None,
            long_term_revoked_at=None,
            destroyed_at=None,
            created_at=now,
            uploaded_at=now,
        )
        database.add(stored_file)
        job = create_job(
            database,
            user_id=user_id,
            job_type="export",
            target_type="report",
            target_id=report.id,
        )
        complete_job(database, job, {"file_id": stored_file.id, "format": payload.format})
        database.commit()
        return {"job_id": job.id, "export_file_id": stored_file.id}

    return router


def report_title(
    report_type: str,
    profile: Profile | None,
    session: SessionRecord | None,
) -> str:
    name = profile.name if profile else "未命名"
    sequence = f"第{session.sequence_no}次" if session else ""
    suffix = {
        "counseling_note": "咨询记录",
        "supervision_feedback": "督导反馈",
        "supervision_note": "督导记录",
        "case_report": "个案报告",
    }[report_type]
    return " ".join(part for part in (name, sequence, suffix) if part)
