# Counselor Assistant MVP Build Plan

## Goal

Build a minimal backend core first, then a polished mobile frontend prototype that matches the approved warm, soft, professional counselor-assistant direction.

## Current Phase

Complete. Latest follow-up polish pass also complete.

## Phases

- [x] Phase 0: Preserve current planning materials in Git.
- [x] Phase 1: Initialize file-based progress records.
- [x] Phase 2: Extract backend requirements and decisions from PRD/design docs.
- [x] Phase 3: Draft database schema specification.
- [x] Phase 4: Draft backend API specification.
- [x] Phase 5: Add lifecycle, AI job, retention, and security implementation notes.
- [x] Phase 6: Validate consistency against PRD and technical design.
- [x] Phase 7: Commit documentation changes.
- [x] Phase 8: Scaffold minimal FastAPI backend core with TDD.
- [x] Phase 9: Verify backend endpoints and commit.
- [x] Phase 10: Scaffold mobile frontend app.
- [x] Phase 11: Build high-fidelity mobile screens for home, recordings, profiles, archive, supervision, privacy, and account.
- [x] Phase 12: Verify frontend build/rendering and commit.
- [x] Phase 13: Polish mobile detail workflows for profile detail, recording summary detail, report editing, and data/privacy authorization.
- [x] Phase 14: Verify polished mobile frontend with tests, typecheck, Expo Web, and web export.
- [x] Phase 15: Add mobile interaction polish for selectable long-term-save authorization, transcript proofreading cues, and report draft status.
- [x] Phase 16: Verify interaction polish with typecheck, tests, Expo Web DOM checks, and web export.
- [x] Phase 17: Correct mobile information architecture: restore information tab, split recording flows, add profile creation, and rebuild profile detail around per-session cards.

## Working Files

- `task_plan.md`: phase plan and decision log for this backend-spec pass.
- `findings.md`: extracted facts, requirements, and implementation discoveries.
- `progress.md`: chronological work log.
- `docs/backend/database-schema.md`: planned database schema specification.
- `docs/backend/api-spec.md`: planned backend API specification.
- `docs/backend/implementation-notes.md`: planned backend notes for jobs, retention, security, exports, and integrations.
- `backend/`: minimal FastAPI backend core.
- `apps/mobile/`: planned mobile frontend.

## Decisions

- The project already has a Git repository; all substantial documentation changes should be committed.
- Keep specs implementation-oriented, but avoid pretending code exists before the backend scaffold is created.
- Treat `docs/prd/2026-06-05-counselor-assistant-app-prd.md` and `docs/prd/decision-log.md` as the source of product truth.
- User prefers mobile frontend presentation quality, so backend should stay minimal and unblock UI/API shape rather than becoming a full production implementation now.
- Backend MVP uses in-memory repositories for speed, with API contracts aligned to the schema/API docs so it can later migrate to SQLAlchemy/PostgreSQL.
- Mobile frontend detail polish should keep the warm, soft, professional workbench style, but prioritize task clarity over decorative density.
- Data/privacy authorization UI must show active user choice: no default checked long-term save items, and original recordings remain non-preservable.
- Long-term-save authorization should behave as an explicit decision flow: hidden bottom navigation, selectable items, disabled confirmation until selection, and visible selection count.
- Primary bottom navigation is fixed as `首页 / 档案 / 资讯 / 我的`; `资讯` remains a lightweight but necessary tab even if early content is simple.
- The active recording page must not include historical recording records; recording records are a separate page.
- Profile detail is organized by per-session cards. Each session card uses the fixed entry labels `录音 / 记录 / 量表 / 作业 / 其他` for all three profile identities.
- Single-session output is a consultation/supervision record generated from that session's recording, transcript/summary, scale, homework, and other materials. Case reports are full-profile outputs generated from all session records and related materials.
- Every visible button or pressable row in the mobile prototype must close a loop: navigate, change state, open a focused decision flow, or show a specific action result. Avoid no-op placeholder buttons.

## Errors Encountered

| Error | Attempt | Resolution |
|---|---|---|
