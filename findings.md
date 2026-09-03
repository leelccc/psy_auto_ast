# Backend Specification Findings

## 2026-09-03 Frontend UI Audit — Initial Evidence

- Reference direction: Material 3 for mobile control sizing and state clarity, Apple HIG for restrained hierarchy, Atlassian for separating short tooltips from inline action-required messages, and Vercel's current interface guidelines for long-content, flex shrink, labels, focus, and form semantics.
- Tooltips should only explain a compact interactive element or low-frequency field rule. Safety, retention, destructive consequences, current errors, and information required to make a decision must remain visible inline; hiding these behind an icon would reduce informed consent.
- Production captures at 320×760, 390×844, and 768×1024 show that the app already constrains tablet/desktop content to a centered mobile shell. The layout does not stretch uncontrollably at 768px.
- At 320px, the three profile-type tabs and several choice groups fit but are close to the density limit. The form remains usable without horizontal overflow, yet explanatory copy substantially increases scroll length and competes with field labels.
- The profile-create screen contains at least three distinct explanatory patterns in one flow: an always-visible profile-code rule, placeholder examples inside inputs, and a full privacy card after the form. The code rule is a good candidate for an info trigger; the privacy/retention rule must stay visible but can be reduced to a compact disclosure row.
- Current frontend input audit found many fields without explicit `maxLength`, including display name during registration, email/password, profile names, custom frequency, complaint, notes, session summary, chapter/transcript content, report content, supervision message, session summary, and tags. Backend validation is uneven: profile names and some auth/supervision fields are constrained, while session summary/tags and metadata-backed profile fields need stronger contracts.
- Long-text fuzzing at 320px did not create horizontal page overflow, but single-line custom-frequency input hides most of a long value and provides no counter or limit. The profile name accepts text beyond the backend's 80-character limit, so failure would occur only after submission.
- The account screen is comparatively clean: grouped settings rows, compact secondary labels, and restrained section actions. Its profile name/email row still needs explicit shrink/truncation rules for long account identities.
- The privacy screen demonstrates over-cardification: hero explanation, two empty-state cards, and a final risk card all use similarly strong bordered surfaces. With no data, nearly the entire screen is explanatory containers. Keep the 14-day policy visible, but render empty collections as lighter rows and collapse the final risk explanation behind a compact disclosure/info affordance unless a destructive action is active.
- Visual hierarchy is inconsistent across explanatory content: green hero poster, beige privacy panel, neutral notice card, warning text, rule text, form hint, and ordinary list metadata all communicate overlapping concepts without a stable semantic system.
- The first implementation batch introduces a tap/focus-friendly inline disclosure instead of a hover-only tooltip. Profile code help is collapsed; retention keeps its 14-day summary visible and expands only the detail.
- Shared horizontal text containers now use `minWidth: 0` and shrinkable titles/metas. Browser verification reported `scrollWidth === clientWidth` at both 390px and 768px; the 320px capture also rendered without horizontal clipping.
- Frontend and backend now agree on high-frequency auth/profile/session boundaries. Password copy and validation consistently use the existing 6–128 character contract.
- Full backend API pytest remains environment-blocked because the local PostgreSQL test port `55432` is unavailable; direct Pydantic boundary checks passed.

## 2026-09-03 WorkBuddy Resynchronization

- WorkBuddy completed the production HTTPS migration: DNS now resolves publicly, certificate renewal dry-run succeeds, MinIO presigned URLs use the 443 bucket-path proxy, and the recording-upload 503 caused by a double-slash proxy path is fixed.
- Production Nginx and Compose configs are now tracked under `server/`; changes to the bind-mounted Nginx config require recreating the Web container, not only reloading Nginx.
- APK `0901-7`, Web, API, and MinIO file URLs have been verified to use HTTPS. The remaining source-level compatibility exceptions are the iOS IP ATS allowlist and Android `usesCleartextTraffic=true` in generated native output.
- Expo SDK 54 officially supports persistent Android cleartext configuration through `expo-build-properties`; direct edits to the ignored generated Manifest would be lost on a later Prebuild.

## 2026-09-01 WorkBuddy Resynchronization

- `origin/main` and local `main` are commit-aligned; the workspace contains five intentional, uncommitted iOS-readiness changes under `apps/mobile`.
- WorkBuddy progressed beyond the previous Codex handoff: `maxpeking.top` HTTPS and email verification are deployed, Web build `0901-3` is live, and an iPhone 17 simulator build completed.
- The active local patch migrates from React Native's deprecated `SafeAreaView` to `react-native-safe-area-context`, adds the iOS non-exempt-encryption declaration, removes the PNG alpha channel, and updates package metadata.
- The remaining iOS functional blocker is production MinIO using `http://47.96.89.215:9000`; iOS ATS will reject those presigned file URLs. This is separate from the current UI/readiness patch and requires a validated HTTPS endpoint migration.

## 2026-08-31 WorkBuddy Reconciliation

### Correction: Android Report Generation Was Not Fixed

- The user's 2026-08-31 Android retest supersedes WorkBuddy's `0830-6` conclusion: tapping `生成咨询记录` still does not visibly reach the generation page.
- The current navigation code sets `pendingReportGeneration` and `quickView` synchronously, but the page-loading effect catches any `reports` or `generation-sources` failure by clearing pending state and returning to the prior view.
- Because React Native may not paint the intermediate loading state before a fast rejection, Android can look exactly as if the press did nothing. The previous touch-delivery diagnosis did not account for this state rollback.
- The robust rule is that navigation must survive data-load failure: keep the destination mounted, display the error in-page, and let the user retry or explicitly return.

### Current Delivery State

- The project has moved beyond local MVP verification into a deployed production-like environment on `47.96.89.215` with PostgreSQL, MinIO, FastAPI/Gunicorn, Nginx-hosted Expo Web, and an Android APK download page.
- The reconciled WorkBuddy baseline was `BUILD_TAG = "0830-6"`; the Android query-string root cause was later fixed and committed as `0831-4`.
- WorkBuddy's claim that the Android consultation-record action was fully explained by touch delivery was incomplete. Touch safeguards remain useful, but the confirmed code-level failure path was an immediate state rollback after report/source API errors.
- The local `main` branch is ahead of `origin/main`; the Android diagnostic commits plus `0831-4` root-cause fix are local unless the user requests push/deploy.
- The current source tag for issue `0831-5` is newer than the latest built APK; it should not be assumed deployed unless the user explicitly requests APK packaging/upload.

### Product and Architecture Additions

- Production deployment and operational recovery are documented in `README.md` and `docs/production-deployment.md`.
- Web WeChat OAuth is implemented; native WeChat login still requires SDK/prebuild work and real credentials.
- A single cross-platform `DateTimePickerField` drives the app: iOS bottom sheet, Android native picker, and Web `react-datepicker` through platform-specific files.
- Profile-scoped privacy APIs and UI now group expiring/authorizable resources by profile. Session attachments intentionally remain outside the 14-day sensitive-resource lifecycle to avoid accidental cleanup.
- Recording processing starts asynchronously after archive and is polled through a lightweight status endpoint.
- Report generation now uses a full-page loading/empty/selection flow, real provider selection, skeleton report blocks, and source validation that tolerates stale selections.
- Frontend domain logic remains concentrated in the very large `apps/mobile/App.tsx`; changes must account for broad shared-state and navigation effects.

### Operating Requirements Adopted from WorkBuddy

- Every completed change batch must update the README change log before commit and push. Never commit `.env`, credentials, build output, or `.workbuddy`.
- Default release behavior is Web-only. Do not build or upload an APK unless the user explicitly requests APK/build/upload or the full deployment bundle.
- Mobile acceptance requires an Android release build and user/device verification; Web behavior and TypeScript success alone are insufficient for Android-sensitive interactions.
- Prefer full-page `quickView` flows for consequential async actions. Navigate immediately, show an in-page loading/empty/error state, and avoid waiting for requests before giving visible feedback.
- For Android overlays that are genuinely needed, use React Native `Modal`; do not use `absoluteFillObject + zIndex` as a global overlay.
- For Android buttons apparently doing nothing, first determine whether touch reached the handler. Check `keyboardShouldPersistTaps`, competing layers, and component choice before changing navigation or modal rendering.
- Preserve the production safety backlog: replace default account passwords, add domain/TLS, restrict security groups and MinIO exposure, remove sensitive backups, and use a release signing key before store distribution.
- Production secrets appearing in historical `.workbuddy` notes are sensitive operational data. Do not repeat, commit, or expose them in future output; recommend rotation where exposure may have occurred.

## 2026-08-31 Issue 0831-5 Findings

- The `0831-4` baseline is commit `d55f2dd` (`BUILD_TAG = "0831-4"`); the local branch is four commits ahead of `origin/main` before issue `0831-5` edits.
- Single-session record generation was reusing the full-profile source builder with both `session_id` and `profile_id`. Because `list_sources()` added all profile-level reports whenever `profile_id` was present, the generation page could list other session records and case reports under “将依据以下资料”.
- The correct scope is report-type dependent: counseling/supervision notes are session-scoped and should use only the current session summary, transcript, recording summary, and current-session attachments; case reports remain profile-scoped and may use profile basics plus historical reports/materials.
- The profile “咨询/受督/督导次数” field is basic profile information about the agreed/configured count. It is editable and must not control the actual consultation/supervision history sequence. Actual history count and next sequence come only from real `sessions`.
- Profile metadata currently stores role-specific fields such as `gender`, `first_visit_complaint`, `frequency`, and `supervision_mode`. Updating only one metadata field must merge with existing metadata instead of replacing the whole object.
- Profile detail “编辑基本信息” should be a modal for all three profile types, not an inline page expansion. Client profiles need editable gender, first-visit complaint, crisis assessment, case status, frequency, agreed count, and notes; supervisor/supervisee profiles need the shared fields plus supervision mode.
- The profile creation screen already switched between the three identities, but the vertical card layout made the identities look like separate list rows. A segmented/tab control better matches the requested interaction.

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
- Consultation sequence and consultation chronology are separate concepts: sequence numbers remain stable, while the visual history is re-sorted by editable occurrence time.
- The session card is a condensed editable index, not the formal record itself. Editing summary text or tags should not mutate the formal consultation record.
- Session files require ownership by `sessionId`; otherwise selecting the same category on different consultation cards can incorrectly expose another consultation's materials.
- Deleting a consultation must cascade to its session-owned material rows, while file deletion should leave an explicit deleted state where a covering legal file is expected.
- Download behavior should be centralized so generated documents and previewed PDFs use consistent filenames, valid browser-rendered PDF files, and local delivery instead of page-specific export notices.
