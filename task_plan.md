# Counselor Assistant Backend Specification Plan

## Goal

Turn the approved PRD and updated product/technical design into backend-ready database schema and API specification documents, while keeping a durable progress trail in the repository.

## Current Phase

Complete.

## Phases

- [x] Phase 0: Preserve current planning materials in Git.
- [x] Phase 1: Initialize file-based progress records.
- [x] Phase 2: Extract backend requirements and decisions from PRD/design docs.
- [x] Phase 3: Draft database schema specification.
- [x] Phase 4: Draft backend API specification.
- [x] Phase 5: Add lifecycle, AI job, retention, and security implementation notes.
- [x] Phase 6: Validate consistency against PRD and technical design.
- [x] Phase 7: Commit documentation changes.

## Working Files

- `task_plan.md`: phase plan and decision log for this backend-spec pass.
- `findings.md`: extracted facts, requirements, and implementation discoveries.
- `progress.md`: chronological work log.
- `docs/backend/database-schema.md`: planned database schema specification.
- `docs/backend/api-spec.md`: planned backend API specification.
- `docs/backend/implementation-notes.md`: planned backend notes for jobs, retention, security, exports, and integrations.

## Decisions

- The project already has a Git repository; all substantial documentation changes should be committed.
- Keep specs implementation-oriented, but avoid pretending code exists before the backend scaffold is created.
- Treat `docs/prd/2026-06-05-counselor-assistant-app-prd.md` and `docs/prd/decision-log.md` as the source of product truth.

## Errors Encountered

| Error | Attempt | Resolution |
|---|---|---|
