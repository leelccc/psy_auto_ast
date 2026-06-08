# Backend Specification Findings

## Source Documents

- `docs/prd/2026-06-05-counselor-assistant-app-prd.md`
- `docs/prd/decision-log.md`
- `docs/prd/session-memory.md`
- `docs/plans/2026-06-04-counselor-assistant-app-design.md`

## Key Product Constraints

- MVP is for individual users only, not institutions or teams.
- Three profile types are first-class: client, supervisor, supervisee.
- Recording does not require real-time transcription. Audio is recorded or uploaded first, then AI processing runs asynchronously.
- Original audio is stored in the cloud for 14 days only and cannot be authorized for long-term cloud storage.
- Transcripts, recording notes, reports, attachments, and AI supervision conversations default to 14-day retention and can be authorized for long-term storage by explicit user action.
- Archive flow must use an intermediate page: select profile type, select or create profile, review the automatically assigned fixed session sequence, then confirm. This supersedes the early PRD wording that made sequence selection a user action.
- Every entry into a profile detail page requires the corresponding profile access password. No short-term bypass.
- Report templates are system built-in for MVP. No user custom templates or Word template upload/parse in MVP.
- Intelligent supervision chat reads no profile data by default; the user must manually add materials as context.
- Deletion of profiles, sensitive resources, and accounts is immediate and irreversible. No recycle bin.

## Technical Direction

- Mobile app: React Native + Expo + TypeScript.
- Backend: Python FastAPI + PostgreSQL.
- Async tasks: Celery or RQ.
- Object storage: S3-compatible or local MinIO.
- AI integration should go through provider adapters. No frontend API keys.
- SSE is suitable for AI job progress. WebSocket or SSE can stream intelligent supervision chat.

## Backend Entity Findings

- `users` owns all private data. Every query must be scoped by `user_id`.
- `profile_access_passwords` should store one password hash per user and profile type.
- `profiles` can use a shared table with `type` and JSON metadata for MVP, plus stable `initial_session_count`.
- `sessions` store fixed `sequence_no` values so deleting a session does not renumber history.
- `recordings` can exist without a session while pending archive.
- `recording_transcripts`, `transcript_segments`, and `recording_summaries` need separate lifecycle fields because text and summary have 14-day retention independent from original audio.
- `files` should hold object-storage metadata and lifecycle fields; `attachments` should describe ownership and category.
- Covering attachments use replacement semantics. Lists such as scale, homework, and other keep multiple items.
- `reports` should distinguish report type from report state. Recording notes have no draft/formal split; other reports have one draft and one formal per scope/type.
- `sensitive_resources` should be a central lifecycle index that drives privacy pages and retention jobs.
- `ai_jobs` should be generic enough for transcription, summary, report generation, PDF extraction, exports, and supervision chat.
- `supervision_conversations`, `supervision_messages`, and `supervision_context_refs` need explicit context references so the AI never reads archive data implicitly.
- `calendar_events` and `calendar_settings` must support system-calendar sync and privacy-title mode.

## Backend Rule Findings

- Retry transcription only when original audio is not destroyed, still within retention, and AI service is available.
- Regenerating a recording note overwrites transcript segments, speaker recognition, summary, and chapter overview, but failed regeneration keeps old content.
- Long-term authorization must never apply to original audio.
- Revoking long-term authorization destroys a resource immediately if the original 14-day period has already passed.
- Deleting a profile cascades to sessions, recordings, transcripts, summaries, reports, attachments, supervision references, privacy lifecycle rows, and App calendar links.
- Audit records may be retained only with minimized non-sensitive metadata.
- PDF text can participate in AI analysis if extraction succeeds. Images are stored and viewed only in MVP.
- Intelligent supervision citations can retain non-sensitive labels after source deletion, but not sensitive source body text.

## Mobile Flow Audit Findings

- The product needs three separate consistency layers: user journey, interaction outcome, and data propagation. A visually plausible screen is still wrong if it displays stale or hardcoded data.
- Toast feedback is appropriate only for lightweight completion. It cannot replace required forms, state pages, lists, confirmations, or version changes.
- Recording list navigation must be status-aware: pending archive goes to archive confirmation, processing goes to processing status, and completed archived recordings go to recording note detail.
- Archive confirmation must receive the selected recording title and duration from the source list item. It must not use its own hardcoded recording metadata.
- Profile creation from the profile library and inline creation during archive are different flows. Library creation produces an empty profile with `尚无记录`; archive creation immediately produces the first fixed session.
- Profile library identity filters and search must combine rather than act as decorative controls.
- Profile detail terminology and covering legal files depend on identity: consultation/client, received supervision/supervisor, and provided supervision/supervisee.
- Actions such as `全部`, `更多`, or filter labels should not look clickable until the destination or state change exists.
- Session material actions need their own stateful destinations. Adding scale, homework, or other material should visibly update the session inputs and flag an existing draft for regeneration rather than silently changing a future AI result.
- Recording-note regeneration is an overwrite operation. Manual chapter/transcript edits require confirmation, generation failure must preserve current content, and formal session records must remain untouched.
- Intelligent supervision needs a strict context boundary in the UI as well as the data model: no selected material means no archive access, while selected materials produce explicit citations and can be removed or stopped during generation.
- P2 support surfaces are part of navigation integrity: home statistics and schedule labels need real destinations, information rows need readable articles, and security rows need visible settings state instead of explanatory notices.
