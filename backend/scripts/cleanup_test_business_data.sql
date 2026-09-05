-- 上线前清除测试阶段业务数据。
-- 明确保留：users、refresh_tokens、external_accounts、profile_access_passwords、
-- profile_access_grants、email_verification_codes、phone_verification_codes、
-- calendar_settings、system_configs、alembic_version。
-- 执行前必须完成数据库与 MinIO 备份；MinIO 对象需在本脚本执行前按 files 表清理。

BEGIN;

TRUNCATE TABLE
    supervision_context_refs,
    supervision_messages,
    supervision_conversations,
    calendar_events,
    sensitive_resources,
    ai_jobs,
    reports,
    recording_summaries,
    recording_transcripts,
    recording_duration_entries,
    recording_segments,
    recordings,
    attachments,
    sessions,
    profiles,
    files
RESTART IDENTITY CASCADE;

COMMIT;
