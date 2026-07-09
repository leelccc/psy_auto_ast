# Complete Counselor Assistant MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver a usable iOS/Android counselor-assistant MVP with complete FastAPI contracts, PostgreSQL persistence, private MinIO files, tested lifecycle rules, real frontend data flow, and verifiable native builds.

**Architecture:** FastAPI is split into domain routers/services/repositories. PostgreSQL stores all durable business state and MinIO stores original bytes. Long-running AI/export/deletion operations use persisted jobs and provider adapters; development and tests use deterministic providers, while production uses configured provider URLs and secrets. Expo React Native consumes typed services and keeps only transient UI state.

**Tech Stack:** Python 3.13, FastAPI, SQLAlchemy 2, Alembic, PostgreSQL 16, MinIO, pytest, Expo 54, React Native 0.81, TypeScript, Expo Document Picker/FileSystem/Sharing, EAS Build.

---

### Task 1: Freeze API contracts and isolate tests

**Files:**
- Create: `docs/superpowers/specs/2026-06-09-full-api-contract-audit.md`
- Create: `backend/tests/conftest.py`
- Modify: `backend/alembic.ini`
- Test: `backend/tests/test_database.py`

- [x] Document every MVP flow, endpoint, field, status machine, validation rule, and deferred discussion.
- [x] Create `psy_auto_ast_test` automatically before pytest.
- [x] Run Alembic against the isolated test database.
- [x] Truncate business tables before each test.
- [x] Verify the development database is never used by pytest.

### Task 2: Complete profile/session contracts

**Files:**
- Create: `backend/app/api/routes/profiles.py`
- Create: `backend/app/api/routes/sessions.py`
- Create: `backend/app/schemas/profiles.py`
- Create: `backend/app/schemas/sessions.py`
- Create: `backend/app/repositories/profiles.py`
- Create: `backend/app/repositories/sessions.py`
- Modify: `backend/app/models/profile.py`
- Modify: `backend/app/models/session.py`
- Modify: `backend/app/main.py`
- Test: `backend/tests/test_api_contracts.py`

- [x] Add profile notes, metadata, timestamps, pagination, keyword/status/type filtering, session counts, and stable ordering.
- [x] Add profile update and confirmed hard deletion with deletion counts.
- [x] Add session start/end/mode fields and profile-type/session-type validation.
- [x] Add confirmed session deletion that destroys owned attachment bytes.
- [ ] Move routes, schemas, and repository queries out of `main.py`.
- [ ] Add concurrent sequence allocation test and locking/retry behavior.
- [ ] Require a profile access grant for profile detail and all child-resource routes.

### Task 3: Complete file/attachment lifecycle

**Files:**
- Modify: `backend/app/models/file.py`
- Modify: `backend/app/models/attachment.py`
- Modify: `backend/app/services/files.py`
- Modify: `backend/app/api/routes/files.py`
- Modify: `backend/app/api/routes/attachments.py`
- Test: `backend/tests/test_file_attachment_boundaries.py`

- [x] Add file purpose, uploaded time, MIME allowlists, non-empty size, and purpose-specific limits.
- [x] Validate legal owner/category combinations and derive replacement groups server-side.
- [ ] Add checksum validation, orphan upload expiry, and object-store failure rollback tests.
- [ ] Add lifecycle status, authorization timestamps, extracted text fields, and PDF extraction job state.
- [ ] Make record/profile deletion transactional with reliable storage cleanup semantics.
- [ ] Seed real small MinIO objects so demo downloads return original bytes.

### Task 4: Authentication, account, and profile access security

**Files:**
- Create: `backend/app/models/auth.py`
- Create: `backend/app/api/routes/auth.py`
- Create: `backend/app/api/routes/account.py`
- Create: `backend/app/services/auth.py`
- Create: `backend/app/services/security.py`
- Test: `backend/tests/test_auth_account_api.py`

- [ ] Implement email/password registration and login with password hashing.
- [ ] Implement access/refresh tokens, refresh rotation, logout, and current-user update.
- [ ] Persist three profile-access password hashes and expose setting status.
- [ ] Replace one-use-per-request grants with short-lived page-session grants scoped to user/profile type and discarded by the client on exit.
- [ ] Implement confirmed account deletion and token revocation.
- [ ] Test invalid credentials, duplicate email, token expiry, grant scope, reset behavior, and cross-user access.

### Task 5: Recordings and archive workflow

**Files:**
- Create: `backend/app/models/recording.py`
- Create: `backend/app/models/transcript.py`
- Create: `backend/app/models/summary.py`
- Create: `backend/app/api/routes/recordings.py`
- Create: `backend/app/services/recordings.py`
- Test: `backend/tests/test_recording_archive_api.py`

- [ ] Implement recording list/create, audio-file binding, status fields, duration, and 14-day audio expiry.
- [ ] Enforce one recording per session and audio non-preservability.
- [ ] Implement archive to existing/new profile and existing/new session in one transaction.
- [ ] Return the backend-assigned fixed sequence and recommended speaker roles.
- [ ] Implement recording/transcript/summary deletion boundaries.
- [ ] Test all archive combinations, retries, destroyed audio, cross-user resources, and duplicate archive calls.

### Task 6: AI provider and persisted jobs

**Files:**
- Create: `backend/app/models/job.py`
- Create: `backend/app/services/ai/providers/base.py`
- Create: `backend/app/services/ai/providers/deterministic.py`
- Create: `backend/app/services/ai/providers/openai_compatible.py`
- Create: `backend/app/services/jobs.py`
- Create: `backend/app/api/routes/jobs.py`
- Test: `backend/tests/test_ai_jobs.py`

- [ ] Persist queued/running/completed/failed/cancelled jobs and progress.
- [ ] Implement provider abstraction with configured URL/key kept only on the backend.
- [ ] Add deterministic development provider that produces usable transcript, summary, report, and supervision responses without external secrets.
- [ ] Implement recording processing, retry, cancellation, and failure preservation.
- [ ] Test duplicate running jobs, cancellation, retryability, provider errors, and no-secret API responses.

### Task 7: Transcript and recording summary editing

**Files:**
- Create: `backend/app/api/routes/transcripts.py`
- Create: `backend/app/api/routes/summaries.py`
- Create: `backend/app/services/transcripts.py`
- Test: `backend/tests/test_transcript_summary_api.py`

- [ ] Implement transcript retrieval with ordered timestamp segments.
- [ ] Implement bulk speaker-label update and segment text correction.
- [ ] Implement summary/chapter retrieval and editing.
- [ ] Implement overwrite-confirmed regeneration that preserves old content on failure.
- [ ] Test ordering, edit propagation, invalid timestamps, deleted audio, manual edits, and regeneration failures.

### Task 8: Session records, case reports, and exports

**Files:**
- Create: `backend/app/models/report.py`
- Create: `backend/app/api/routes/reports.py`
- Create: `backend/app/services/reports.py`
- Create: `backend/app/services/exports.py`
- Test: `backend/tests/test_reports_api.py`

- [ ] Implement generation-source lists with availability and unavailable reasons.
- [ ] Generate counseling notes, supervision feedback, supervision records, and case reports using only selected/eligible sources.
- [ ] Persist one draft and one formal version per report scope/type.
- [ ] Implement edit, save formal, copy formal to draft, and overwrite-confirmed regeneration.
- [ ] Generate PDF and DOCX export files in MinIO and return file IDs/download URLs.
- [ ] Test formal immutability, destroyed sources, selection boundaries, regeneration, and export bytes.

### Task 9: Privacy lifecycle and retention

**Files:**
- Create: `backend/app/models/privacy.py`
- Create: `backend/app/api/routes/privacy.py`
- Create: `backend/app/services/retention.py`
- Test: `backend/tests/test_privacy_retention_api.py`

- [ ] Register every sensitive resource with origin time, expiry, preservability, authorization, revocation, and destruction timestamps.
- [ ] Implement expiring and long-term lists with pagination.
- [ ] Implement explicit authorize, revoke, and confirmed delete.
- [ ] Prevent original audio authorization.
- [ ] Destroy immediately on revocation after original expiry.
- [ ] Implement idempotent retention cleanup command and test exact object deletion.

### Task 10: Calendar and mobile-system-calendar contract

**Files:**
- Create: `backend/app/models/calendar.py`
- Create: `backend/app/api/routes/calendar.py`
- Create: `backend/app/services/calendar.py`
- Test: `backend/tests/test_calendar_api.py`

- [ ] Implement event list/create/update/complete/delete and date range filtering.
- [ ] Auto-create/update the next profile event when `next_session_at` changes.
- [ ] Persist global calendar and privacy-title settings.
- [ ] Persist per-event system-calendar IDs and sync preferences.
- [ ] Test privacy titles, linked/unlinked events, profile deletion, time changes, and completed events.

### Task 11: Intelligent supervision

**Files:**
- Create: `backend/app/models/supervision.py`
- Create: `backend/app/api/routes/supervision.py`
- Create: `backend/app/services/supervision.py`
- Test: `backend/tests/test_supervision_api.py`

- [ ] Implement conversation CRUD and 14-day expiry.
- [ ] Implement explicit add/remove context references with ownership and availability checks.
- [ ] Implement message send, event streaming/polling, stop generation, partial-content preservation, and citations.
- [ ] Add rule-based crisis warnings without modifying profile risk levels.
- [ ] Test no-context behavior, deleted context, citations, stop, cross-user isolation, and retention.

### Task 12: Frontend service and state migration

**Files:**
- Modify: `apps/mobile/src/api/apiClient.ts`
- Create/Modify: `apps/mobile/src/api/*.ts`
- Refactor: `apps/mobile/App.tsx`
- Test: `apps/mobile/src/__tests__/*Service.test.ts`

- [ ] Add typed auth, recording, transcript, report, privacy, calendar, job, and supervision services.
- [ ] Support token refresh, non-JSON/network errors, cancellation, and request deduplication.
- [ ] Move durable page state out of `App.tsx` and load it by resource ID.
- [ ] Re-fetch after commands and preserve loading/empty/error/retry/submitting states.
- [ ] Remove remaining durable business mocks and unsupported “文字备注” attachment behavior.
- [ ] Add component/state tests for every primary flow and destructive confirmation.

### Task 13: Native file, audio, download, sharing, and calendar capabilities

**Files:**
- Modify: `apps/mobile/package.json`
- Modify: `apps/mobile/app.json`
- Create: `apps/mobile/src/native/filePicker.ts`
- Create: `apps/mobile/src/native/fileTransfer.ts`
- Create: `apps/mobile/src/native/calendarSync.ts`
- Create: `apps/mobile/src/native/audioRecording.ts`
- Test: `apps/mobile/src/__tests__/nativeAdapters.test.ts`

- [ ] Add Expo Document Picker, FileSystem, Sharing, AV/Audio, and Calendar packages compatible with Expo 54.
- [ ] Implement browser and native file selection, presigned PUT upload, progress, completion, retry, and cleanup.
- [ ] Implement original-file download to app storage and native share/open.
- [ ] Implement app recording to local file and upload after save.
- [ ] Implement explicit system-calendar permission and privacy-title synchronization.
- [ ] Configure iOS usage descriptions and Android permissions.

### Task 14: Rich deterministic demo data and end-to-end verification

**Files:**
- Modify: `backend/app/seed.py`
- Create: `backend/tests/test_full_user_journey.py`
- Modify: `progress.md`
- Modify: `task_plan.md`

- [ ] Seed multiple profiles of all types, empty/active/paused/closed states, varied session histories, recordings, reports, lifecycle states, calendar events, and supervision conversations.
- [ ] Upload real demo PDF/image/audio bytes to MinIO and bind them to seeded metadata.
- [ ] Test complete journeys: register/login, unlock, create/edit profile, record/archive/process, materials, report, privacy, calendar, supervision, delete.
- [ ] Test failure journeys: DB/MinIO/AI unavailable, expired token/grant, invalid MIME/size, retry, conflict, and cross-user isolation.
- [ ] Verify API OpenAPI schema and generated frontend types remain consistent.

### Task 15: iOS/Android build and release verification

**Files:**
- Create: `apps/mobile/eas.json`
- Modify: `apps/mobile/app.json`
- Modify: `README.md`

- [ ] Add stable iOS bundle identifier and Android package name.
- [ ] Add development, preview, and production EAS profiles.
- [ ] Run Expo doctor, typecheck, tests, and production web export.
- [ ] Generate native projects with Expo prebuild and compile Android locally when the SDK is available.
- [ ] Validate iOS project generation and run simulator build when Xcode is available.
- [ ] Run EAS build readiness checks; record any signing credentials that require user-owned Apple/Google accounts.
- [ ] Browser-test the full desktop web fallback and device-test iOS/Android primary journeys.
- [ ] Update handoff records and commit verified milestones.
