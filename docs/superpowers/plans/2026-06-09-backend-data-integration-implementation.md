# Backend Data Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move profile, session, attachment, and file demo data behind FastAPI with PostgreSQL and MinIO, then make the mobile prototype read and mutate that backend data.

**Architecture:** Docker Compose runs isolated PostgreSQL and MinIO services. FastAPI uses SQLAlchemy repositories and a MinIO storage adapter; the mobile app uses typed HTTP services and keeps only transient UI state.

**Tech Stack:** Docker Compose, PostgreSQL 16, MinIO, FastAPI, SQLAlchemy 2, Alembic, psycopg, Expo/React Native, TypeScript.

---

### Task 1: Local infrastructure

**Files:**
- Create: `.env.example`
- Create: `compose.yaml`
- Modify: `.gitignore`

- [x] Add PostgreSQL, MinIO, and MinIO bucket initialization services with health checks and named volumes.
- [x] Verify `docker compose config`.
- [x] Start services with `docker compose up -d` and verify healthy containers.

### Task 2: Backend configuration and database foundation

**Files:**
- Modify: `backend/requirements.txt`
- Create: `backend/app/core/config.py`
- Create: `backend/app/db/base.py`
- Create: `backend/app/db/session.py`
- Create: `backend/alembic.ini`
- Create: `backend/alembic/env.py`
- Create: `backend/alembic/versions/0001_profiles_sessions_files.py`
- Test: `backend/tests/test_database.py`

- [x] Write failing tests for environment configuration and database connectivity.
- [x] Install SQLAlchemy, Alembic, psycopg, pydantic-settings, and MinIO SDK.
- [x] Implement settings, engine/session factory, declarative base, and migration configuration.
- [x] Run migrations against Compose PostgreSQL.
- [x] Verify database tests pass.

### Task 3: Models, repositories, and seed data

**Files:**
- Create: `backend/app/models/user.py`
- Create: `backend/app/models/profile.py`
- Create: `backend/app/models/session.py`
- Create: `backend/app/models/file.py`
- Create: `backend/app/models/attachment.py`
- Create: `backend/app/models/__init__.py`
- Create: `backend/app/repositories/profiles.py`
- Create: `backend/app/repositories/sessions.py`
- Create: `backend/app/repositories/attachments.py`
- Create: `backend/app/seed.py`
- Test: `backend/tests/test_seed.py`

- [x] Write failing tests for idempotent seed data, session ordering, and fixed sequence numbers.
- [ ] Implement SQLAlchemy models and repositories.
- [x] Seed the demo user, profiles, sessions, file metadata, and attachment relationships.
- [x] Run the seed twice and verify no duplicates.

### Task 4: Profile and session APIs

**Files:**
- Create: `backend/app/api/dependencies.py`
- Create: `backend/app/api/routes/profiles.py`
- Create: `backend/app/api/routes/sessions.py`
- Create: `backend/app/schemas/profiles.py`
- Create: `backend/app/schemas/sessions.py`
- Modify: `backend/app/main.py`
- Test: `backend/tests/test_profile_session_api.py`

- [x] Write failing API tests for list/create/detail profiles and list/create/update/delete sessions.
- [x] Implement authenticated database-backed routes.
- [x] Keep sequence-number assignment on the backend.
- [x] Verify user isolation, time sorting, and deletion behavior.

### Task 5: MinIO file and attachment APIs

**Files:**
- Create: `backend/app/services/storage.py`
- Create: `backend/app/services/files.py`
- Create: `backend/app/api/routes/files.py`
- Create: `backend/app/api/routes/attachments.py`
- Create: `backend/app/schemas/files.py`
- Create: `backend/app/schemas/attachments.py`
- Test: `backend/tests/test_file_attachment_api.py`

- [x] Write failing tests using an injected fake storage adapter.
- [x] Implement presigned upload creation, completion validation, and download URL generation.
- [x] Implement attachment list/create/replace/delete with ownership checks.
- [x] Run a real MinIO integration test that uploads and downloads exact bytes.

### Task 6: Frontend API layer

**Files:**
- Create: `apps/mobile/src/api/apiClient.ts`
- Create: `apps/mobile/src/api/profileService.ts`
- Create: `apps/mobile/src/api/sessionService.ts`
- Create: `apps/mobile/src/api/fileService.ts`
- Create: `apps/mobile/src/api/attachmentService.ts`
- Test: `apps/mobile/src/__tests__/apiClient.test.ts`
- Test: `apps/mobile/src/__tests__/backendServices.test.ts`

- [ ] Write failing response-mapping and error-mapping tests.
- [ ] Implement the authenticated API client with configurable base URL.
- [ ] Implement typed domain services matching FastAPI responses.
- [ ] Keep MinIO credentials and storage keys out of frontend types.

### Task 7: Replace first frontend business mocks

**Files:**
- Modify: `apps/mobile/App.tsx`
- Modify: `apps/mobile/src/profileLibrary.ts`
- Modify: `apps/mobile/src/sessionHistory.ts`
- Modify: `apps/mobile/src/sessionMaterials.ts`

- [ ] Load profile library data from the backend.
- [ ] Load selected profile sessions and attachments by resource ID.
- [ ] Route create/update/delete actions through services and re-fetch server data.
- [ ] Connect file upload and original-file download to the backend contract.
- [ ] Preserve loading, empty, error, confirmation, and retry states.
- [ ] Remove the migrated profile/session/material business seed data from `App.tsx`.

### Task 8: End-to-end verification

**Files:**
- Modify: `progress.md`
- Modify: `task_plan.md`

- [ ] Run backend unit and integration tests.
- [ ] Run frontend tests and typecheck.
- [ ] Start FastAPI and Expo Web with Compose services.
- [ ] Browser-test profile list, profile detail, session mutation, attachment listing, and exact-byte file download.
- [ ] Export Expo Web.
- [ ] Update handoff records and commit the completed integration.
