# Progress Log

## 2026-08-31 Android 生成记录页面重新排查

- User confirmed that Android still does not reach the report-generation draft page; invalidated the previous WorkBuddy “touch issue fixed” conclusion.
- Traced the current path from `SessionCard` through `openSessionRecord` into `reportGeneration`.
- Found that the generation-source loading effect clears `pendingReportGeneration` and immediately navigates back on any API error, leaving only a transient toast. On Android this is indistinguishable from a failed button press.
- Started Phase 37 to keep navigation visible and expose load failure/retry as a page-level state.
- Updated the generation state with `loadError`; report/source load failures now keep `reportGeneration` mounted and expose retry/return actions.
- Removed the session card's misleading 2.5-second local opening state; page state now owns all loading feedback.
- Added `reportGenerationFlow.ts` and two regression tests covering retained load errors, retry, and stale-request protection.
- Fixed an unrelated calendar-sensitive profile test that had become stale after its fixed July date passed.
- Verification passed: TypeScript typecheck, `96/96` frontend tests, Expo Web production export, and Android `assembleRelease`.
- Built local APK `apps/mobile/android/app/build/outputs/apk/release/app-release.apk` (67 MB), MD5 `ace70880c6fc8c2d052fca0e69421b4d`; verified bundle tag `0831-1`, package `com.psyautoast.counselor`, and `usesCleartextTraffic=true`.
- Completed Phase 37. APK remains local and was not uploaded or deployed.
- User clarified that automatically entering the editor for an existing report is correct. The actual Android defect is the stale「生成咨询记录」button label/status before that correct navigation.
- Reverted the incorrect `0831-2` existing-report navigation change.
- Added report-list reconciliation during profile loading so real draft/formal reports correct stale session `record_status` values; added a regression test for stale pending → draft/formal correction.
- Frontend verification remains `97/97` tests with TypeScript passing; Android `0831-3` rebuild is pending.

## 2026-08-31 Codex / WorkBuddy Context Reconciliation

- Started reconciling `.workbuddy` history with the existing Codex planning records at the user's request.
- Restored the existing project state: Phase 35 remains active, with durable PostgreSQL/MinIO persistence, real backend APIs, iOS and Android simulator verification, and ongoing browser/mobile edge-case auditing.
- Added Phase 36 to track the context reconciliation without replacing the active product-audit phase.
- Read all dated `.workbuddy` memories from 2026-06-26 through 2026-08-30 plus durable `MEMORY.md`.
- Reconciled the major post-Phase-35 work: production deployment, Web hosting, APK distribution, WeChat OAuth groundwork, cross-platform date picker, mobile race-condition guards, privacy grouping, report-generation redesign, recording polling, and Android-specific interaction debugging.
- Established the current continuation point as local build `0830-6` at commit `f845820`.
- Confirmed Git divergence: local `main` is three commits ahead of `origin/main` (`29c97e0`, `22e82f0`, `f845820`). No product files were modified during this reconciliation.
- Adopted WorkBuddy's operating requirements for README-first change logging, Android release acceptance, Web-only default deployment, explicit APK authorization, mobile page-level async states, and secret hygiene.
- Updated `docs/prd/session-memory.md` with the concise 2026-08-31 continuation point and separated the verified Java requirements for local emulator builds (JBR 21) and release APK builds (Corretto 17).
- Completed Phase 36. The next active product work remains Phase 35's Android-first workflow and edge-state audit.

## 2026-06-05

- Confirmed Git repository exists.
- Committed existing project planning materials in `9902878 docs: add counselor assistant planning materials`.
- Started backend specification pass after user requested continued work with records and progress tracking.
- Created file-based planning records: `task_plan.md`, `findings.md`, and `progress.md`.
- Marked Phase 1 complete and started extracting backend requirements.
- Read PRD, decision log, and updated technical design for backend-relevant entities, lifecycle rules, AI tasks, deletion, calendar, and privacy requirements.
- Updated `findings.md` with backend entity and rule findings.
- Marked Phase 2 complete and started database schema drafting.
- Created `docs/backend/database-schema.md` with table specs for auth, profiles, sessions, recordings, transcripts, summaries, files, attachments, reports, exports, supervision chat, AI jobs, lifecycle records, calendar, content, and audit logs.
- Marked Phase 3 complete and started backend API specification.
- Created `docs/backend/api-spec.md` covering auth, profile access passwords, profiles, sessions, recordings, transcript editing, attachments, reports, intelligent supervision, privacy, calendar, AI jobs, and content APIs.
- Marked Phase 4 complete and started implementation notes.
- Created `docs/backend/implementation-notes.md` with backend structure, lifecycle service, deletion flow, retry rules, AI worker flow, provider adapter, file/PDF extraction, export, calendar sync, security, and test focus.
- Marked Phase 5 complete and started consistency validation.
- Added one-time `profile_access_grants` design so profile detail access is enforced server-side without becoming a short-term password bypass.
- Ran keyword scans for stale MVP decisions and placeholder terms. Remaining hits are explicit negative rules such as no recycle bin and no short-term bypass.
- Marked Phase 6 complete and started documentation commit phase.
- Committed backend documentation with message `docs: add backend schema and API specs`.
- Marked Phase 7 complete.
- User chose: build a minimal backend core first, then move to mobile frontend because frontend presentation matters most.
- Started Phase 8: minimal FastAPI backend core with TDD.
- Added backend dependency list in `backend/requirements.txt` and installed dependencies into local `venv`.
- Wrote failing backend tests in `backend/tests/test_core_api.py` for health, one-time profile access grants, session sequence numbers, and recording audio lifecycle.
- Confirmed RED state: tests failed because `app.main` did not exist.
- Implemented minimal in-memory FastAPI core in `backend/app/main.py`.
- Ran backend tests: `PYTHONPATH=backend venv/bin/python -m pytest backend/tests/test_core_api.py -q`, result `4 passed`.
- Committed minimal backend core with message `feat: add minimal backend core`.
- Started Phase 10: Expo/React Native mobile frontend scaffold.
- Added Expo/React Native mobile app scaffold under `apps/mobile`.
- Added mobile theme tokens, mock data, and data helper tests.
- Built `App.tsx` with a polished mobile prototype: home workbench, recording state, archive confirmation, profile library, intelligent supervision, content, account, and privacy resource views.
- Ran frontend tests: `npm test`, result `2 passed`.
- Ran frontend typecheck: `npm run typecheck`, result passed.
- Started Expo Web on `http://localhost:8082` and exported web build with `npx expo export --platform web --output-dir dist-web`, result passed.
- Committed mobile prototype with message `feat: add mobile prototype`.
- Marked Phase 12 complete.
- Continued mobile frontend polish for the key detail workflows requested by the user.
- Read `progress.md`, `task_plan.md`, and `docs/prd/session-memory.md` before editing.
- Added navigable mobile prototype flows for profile detail, recording summary detail, report editing, and data/privacy long-term-save authorization.
- Updated bottom navigation labels from generic content wording to task-specific `档案` and `纪要`.
- Added profile detail UI covering sensitive resource status, non-preservable original recording rules, reports, attachments, and timeline.
- Added recording summary detail UI covering summary, chapter overview, transcript turns, export, regeneration, and report editing entry.
- Added report editor UI covering draft/formal-version rules, editable report sections, save action, and privacy authorization entry.
- Added data/privacy authorization popup UI with explicit unchecked consent items, original recording non-preservation copy, risk/revocation explanation, and disabled confirmation until manual selection.
- Added mock data for attachments, profile timeline, recording chapters, transcript turns, and report sections.
- Ran frontend tests: `npm test`, result `2 passed`.
- Ran frontend typecheck: `npm run typecheck`, result passed.
- Started Expo Web on `http://localhost:8083` because `8082` was already occupied, and visually checked home, profile detail, report editor, authorization popup, and recording summary detail in the in-app browser.
- Increased mobile scroll bottom padding so deep-page content clears the floating bottom tab bar.
- Exported web build with `npx expo export --platform web --output-dir dist-web`, result passed.

- Started a full mobile behavior audit after the user requested整理 user journeys, interaction logic, and data movement before further page polishing.
- Created `docs/plans/2026-06-07-mobile-flow-interaction-data-audit.md` with decision precedence, core journeys, interaction rules, entity/data flow, a page-by-page audit table, and P0/P1/P2 implementation order.
- Identified and documented the early-PRD conflict around archive record numbering; the latest rule keeps sequence assignment automatic and read-only.
- Implemented real profile-library identity filtering and combined name/code/status search.
- Replaced the profile creation field preview with identity-specific inputs, required-name validation, creation state, and direct navigation into the new profile.
- Added an explicit empty profile state. A profile created from the library now shows `尚无记录` instead of inventing a first session.
- Made profile detail history labels, covering legal documents, and record nouns identity-aware for clients, supervisors, and supervisees.
- Removed unsupported clickable actions such as home statistics `全部` and information `更多`; retained `近 7 天` as static scope text.
- Split recording-list navigation by data state: pending archive, processing, and completed detail now open different destinations.
- Added a dedicated recording-processing page rather than showing completed recording-note content while AI work is still running.
- Propagated the selected recording title and duration into archive confirmation, fixing the stale hardcoded `52:18` shown for the `41:06` pending recording.
- Preserved archive return context so archive opened from recording history returns to recording history, while archive opened after active recording returns to the recorder.
- Added profile-library and recording-flow behavior tests; frontend test count is now `11 passed`.
- Fixed recording detail context propagation so selecting `王澜 督导反馈` shows Wang Lan's title, duration, supervision summary, speaker roles, transcript snippets, and `生成督导反馈` instead of Chen Yu consultation content.
- Made record editing identity-aware: client profiles edit consultation records, supervisor profiles edit supervision feedback, and supervisee profiles edit supervision records.
- Turned record sections into editable draft fields. Saving creates a read-only formal version, and further changes require copying back to draft.
- Split `我的 > 数据与隐私` into a real privacy center instead of opening the authorization sheet directly.
- Added long-term authorization state propagation: selected resources are merged into an `已长期保存资料` list, while original audio remains non-authorizable.
- Added case report material selection and case report editing flows. The material selector defaults to usable full-profile materials and excludes destroyed audio.
- Added case report draft/formal editing, export action, and long-term-save authorization entry. The case report is clearly full-profile, not a single-session record.
- Hid bottom navigation during focused flows such as recording, archive, profile creation, record editing, case-report generation/editing, and authorization to avoid accidental navigation and content overlap.
- Replaced the recording cancel placeholder with an in-page two-step destructive confirmation; the second confirmation discards the unsaved recording and returns home.
- Verified in the browser: profile filtering/search, new empty profile creation, recording-state routing, selected recording metadata in archive, supervision recording detail, supervision feedback formal-save/auth return, privacy center authorized list, and case-report material/edit/authorize flow.
- Verified in the browser that recording cancellation enters a visible warning state and only discards the recording after the second confirmation.
- Ran frontend tests: `npm test`, result `15 passed`.
- Ran frontend typecheck: `npm run typecheck`, result passed.
- Exported web build with `npx expo export --platform web --output-dir dist-web`, result passed.

- Marked Phase 14 complete.
- User paused after reviewing the mobile detail workflow polish; next continuation should resume from mobile frontend refinement and any requested follow-up screens or interaction polish.
- Resumed mobile frontend refinement after the user asked to continue.
- Added true selectable state to the long-term-save authorization UI, including selected item highlighting, live authorization count, and disabled confirmation until the user manually selects at least one item.
- Hid the bottom tab bar while the long-term-save authorization decision flow is open so the page behaves more like a focused modal.
- Added transcript proofreading cues to the recording summary detail page: pending confirmation count, speaker identity chips, and copy clarifying speaker/text edits affect summaries and report drafts.
- Added report editor status stats for editable section count, built-in template use, and unsaved draft state.
- Ran frontend tests: `npm test`, result `2 passed`.
- Ran frontend typecheck: `npm run typecheck`, result passed.
- Started Expo Web on `http://localhost:8083` and verified via browser DOM checks that authorization toggles from `需手动勾选` to `确认授权 1 项` after item selection.
- Verified via browser DOM checks that the recording summary detail shows `转写校对`, `3 处待确认`, and speaker chips.
- Browser screenshot capture timed out during this pass, but DOM-level interaction checks succeeded.
- Exported web build with `npx expo export --platform web --output-dir dist-web`, result passed.
- Marked Phase 16 complete.
- User pointed out several mobile IA issues: bottom navigation must remain `首页 / 档案 / 资讯 / 我的`, the home reminder card should not include intelligent supervision, active recording should not mix in recording history, profile library needs a create flow, and profile detail should follow the provided per-session card reference.
- Read the provided reference file `/Users/apple/WeChatProjects/psy_ast/页面/来访者:督导:受督档案详情页.html`.
- Restored bottom navigation label from `纪要` to `资讯` and changed the information tab back to lightweight professional content.
- Removed the intelligent supervision button from the home reminder card; intelligent supervision remains only as a lower quick action.
- Split active recording from recording history by removing recording records from `RecordingScreen` and adding a dedicated recording records page.
- Added a profile creation entry in the profile library with identity choices for `新增来访者`, `新增督导师`, and `新增受督者`; each identity shows a different field set.
- Rebuilt profile detail around a profile header, legal/ethical files, and per-session cards.
- Added fixed per-session action entries `录音 / 记录 / 量表 / 作业 / 其他`, with recording retention, draft/formal report state, and long-term authorization rules integrated into each card.
- Verified via browser DOM checks that home navigation, active recording, recording records, profile creation, and profile detail session cards match the corrected IA.
- Ran frontend tests: `npm test`, result `2 passed`.
- Ran frontend typecheck: `npm run typecheck`, result passed.
- Exported web build with `npx expo export --platform web --output-dir dist-web`, result passed.
- Marked Phase 17 complete.
- User clarified the report hierarchy: each consultation/session has one consultation record, generated from that session's recording plus scale, homework, and other materials when present; the case report is generated later from all consultation records and related profile materials.
- Updated mobile wording so the recording summary entry says `生成咨询记录` rather than `编辑报告`, and the editor route title says `咨询记录编辑`.
- Updated internal naming from report editor/sections to record editor/sections for single-session record editing.
- Kept `生成个案报告` as a full-profile action instead of routing it into the single-session consultation record editor.
- Updated `docs/prd/session-memory.md` and `task_plan.md` with the single-session record vs full-profile case report distinction.
- User clarified that every button must form a functional closed loop and no visible button should be meaningless.
- Added a shared mobile action feedback notice so lightweight prototype actions still explain the resulting state and next step.
- Wired previously empty controls to navigation, state changes, focused decision flows, or specific feedback: reminder cards, recording cancel/pause, archive steps, archive confirmation, profile segment filters, profile creation, legal files, per-session action buttons, case report generation, transcript editing actions, record editor draft/formal/save actions, authorization actions, intelligent supervision, information articles, account settings, and data/privacy rows.
- Converted several visually actionable rows/cards from static views into pressable controls where appropriate.
- Audited `App.tsx` for empty `onPress={() => undefined}` handlers; none remain.
- Verified via browser DOM checks that representative buttons show feedback: home reminder, recording cancel, session scale entry, and case report generation.
- User clarified that after saving a recording, archive must require choosing which person's profile the recording belongs to; if the person does not exist, the user must be able to create the person during archive.
- Rebuilt the archive confirmation page into a choose-or-create flow: select archive type (`来访者/督导师/受督者`), search/select an existing profile, or add a new person inline before confirming archive.
- Changed archive confirmation so it prompts for a selected profile first and only confirms archive after an existing or newly created person is selected.
- Verified via browser DOM checks that archive shows type selection, target profile selection, `没有这个人，新增人员`, disabled/pending confirmation copy, existing profile selection, and inline new-person selection.
- Continued the recording archive flow from selection into a real completion state.
- Added tested archive helpers for profile search and automatic next-record numbering across consultation, supervision, and supervisee identities.
- Replaced the archive search placeholder with a working name/profile-code input and replaced inline creation placeholders with real name and identity-specific note fields.
- Added an archive completion page showing the selected person, profile identity, session number, recording retention state, transcript/summary processing state, and next actions.
- Connected archive completion to the selected person's profile detail. Newly created profiles now show their own name, identity, first-session card, and processing state instead of falling back to the hardcoded sample profile.
- Moved transient action feedback to the top and added automatic dismissal so it cannot cover the archive confirmation button.
- Added context-aware back navigation for archive, recording details, profile details, consultation record editing, and long-term-save authorization.
- Verified the complete browser flow for an existing profile (`陈雨` becomes `第 7 次咨询`) and a newly created profile (`林清` becomes `第 1 次咨询`), including archive completion, profile detail, consultation record editing, and return navigation.
- Ran frontend tests: `npm test`, result `5 passed`.
- Ran frontend typecheck: `npm run typecheck`, result passed.
- User flagged the archive confirmation page's `记录次数` card as logically wrong.
- Reworked the archive confirmation display so only `选择归档类型` and `选择归属档案` are user decision steps; the derived record number is now a non-clickable confirmation summary.
- Added `describeArchiveTarget` tests to keep the derived record number presentation separate from user steps.
- Verified via browser DOM checks that the unselected state says `选择归属档案后自动生成` and selecting `陈雨` shows `本次将归为 / 第 7 次咨询 / 归入陈雨的来访者档案`.
- Ran frontend tests: `npm test`, result `6 passed`.
- Ran frontend typecheck: `npm run typecheck`, result passed.
- Exported web build with `npx expo export --platform web --output-dir dist-web`, result passed.

## 2026-06-08

- Resumed the mobile audit backlog and completed all remaining P1/P2 items.
- Added tested session-material helpers and real focused pages for recording, scale, homework, and other session resources.
- Added upload/add flows that write visible material rows, distinguish original audio from preservable resources, and mark the session record draft as needing regeneration.
- Added chapter editing and full-transcript proofreading pages; saved changes return to the recording note and become the source for later record generation.
- Added tested regeneration safeguards: manual edits require explicit overwrite confirmation, failed regeneration preserves current content, and formal session records are not overwritten.
- Replaced the intelligent-supervision placeholders with explicit context selection, no-context behavior, visible citations, a generating state, stop action, and conversation list.
- Added real P2 destinations for weekly statistics, full schedule, article detail, and security settings.
- Added schedule date switching, privacy-title mode, and a direct start-recording action.
- Added security state for three profile-access passwords, system-calendar/login toggles, and two-step irreversible cloud-data deletion.
- Added a real uploaded-recording row in the recording list and an overwrite-confirmed ethics-file upload flow in profile detail.
- Browser-verified material upload and count propagation, chapter/transcript edits, regeneration overwrite confirmation, supervision citations and stop behavior, articles, statistics, schedule, and security settings at a 390x844 mobile viewport.
- Browser console showed no runtime errors; only known React Native Web deprecation warnings for shadow and pointer-events props.
- Frontend tests pass: `23 passed`.
- Frontend typecheck passes.
- Expo web export passes.
- Made consultation history a stateful list instead of hardcoded cards.
- Added consultation creation with occurrence time and summary, then sorted all records by occurrence time descending while keeping sequence numbers fixed.
- Added in-card editing for time, summary, and up to four unique tags.
- Added two-step consultation deletion and removal of all session-owned materials.
- Changed generated-record actions to `查看/编辑咨询记录` for drafts and `查看咨询记录` for formal versions.
- Added a shared file preview page for session attachments and legal/ethical files, with rename, replacement, and confirmed deletion.
- Scoped recording, scale, homework, and other files by `sessionId` so each consultation opens only its own materials.
- Added consultation-history and file-lifecycle tests; frontend test count is now `29`.
- Added real browser downloads for consultation records, supervision feedback/records, case reports, and recording-note exports.
- Added direct download actions to every PDF preview and browser-side PDF rendering so Chinese exports open as valid paginated documents.
- Added tested filename sanitization, MIME selection, and export-content assembly; frontend test count is now `32`.

## 2026-06-09 Handoff

- Completed the generated-document download loop and committed it as `a11673c feat: add document downloads`.
- Consultation records, supervision records/feedback, case reports, and recording notes can generate and download valid paginated PDF files in the Web prototype.
- PDF preview pages expose `下载 PDF / 重新下载 PDF`; generated-record editors show download feedback for the current draft or formal version.
- Added `jspdf` as the browser PDF renderer and centralized filename sanitization, MIME selection, PDF generation, and download triggering in `apps/mobile/src/downloadFlow.ts`.
- Browser-verified the legal-file PDF preview download state and the consultation-record PDF download action at `http://127.0.0.1:8083/`.
- Verification at handoff: frontend typecheck passed, `32` frontend tests passed, Expo Web production export passed, and the Git worktree was clean after commit.
- Important prototype boundary: uploaded-file rows currently contain metadata rather than persisted source file URLs/blobs. A PDF preview download therefore generates a local PDF copy from current visible data; downloading the exact originally uploaded file requires the later upload/storage integration.

### Next Session

- Connect uploaded materials and legal/ethical files to real file objects or backend storage URLs so preview and download use the original file bytes.
- Add native Expo download/share handling for iOS and Android; the current implementation is browser-based.
- Continue the mobile page-by-page interaction and data-flow audit, prioritizing any remaining cards or actions that only simulate persistence.
- Re-run regression flows after storage integration: consultation creation/edit/delete and time sorting, session material preview/replace/delete, record generation/versioning, case-report generation, privacy authorization, and recording archive.

## 2026-06-09 MinIO Frontend Boundary

- Confirmed that uploaded files will be stored privately in MinIO and downloaded as original bytes through backend-authorized short-lived URLs.
- Added and committed the MinIO integration design in `8917ca6 docs: design minio file integration`.
- Added a typed frontend file-service contract for upload creation, upload completion, original-file download URL retrieval, replacement, and deletion.
- Added `StoredFileReference` metadata with `fileId`, filename, MIME type, size, upload status, and source kind.
- Updated session materials and legal/ethical file previews to carry file references while keeping current prototype rows explicitly unconnected to backend storage.
- Removed metadata-generated PDF copies from uploaded-file preview downloads. The preview now requests an original-file URL by `fileId`, or clearly reports that the MinIO backend is not connected.
- Kept generated recording-note, consultation/supervision record, and case-report PDF exports on the existing generated-document path.
- Browser-verified the legal-file preview at a 390x844 viewport: it shows `等待文件服务接入`, returns explicit MinIO-pending feedback when pressed, and logs no runtime errors.
- Frontend verification passed: `36` tests, TypeScript typecheck, and Expo Web production export.
- Backend MinIO implementation remains pending and should implement the contract in `apps/mobile/src/fileService.ts`.

## 2026-06-09 PostgreSQL + MinIO Integration Progress

### Completed

- Added Docker Compose services for PostgreSQL 16, private MinIO, and automatic private-bucket initialization.
- Started and health-checked PostgreSQL on host port `55432` and MinIO on `59000`/`59001`.
- Added FastAPI environment settings, SQLAlchemy session management, Alembic configuration, core models, initial migration, and idempotent demo seed data.
- Moved profile, consultation-session, file metadata, and attachment relationships into PostgreSQL.
- Implemented database-backed profile list/create/detail and session list/create/update/delete APIs.
- Kept session sequence assignment in the backend and added authenticated user-isolation checks.
- Implemented a replaceable storage adapter plus the real MinIO adapter.
- Implemented presigned upload creation, upload-completion size validation, short-lived original-file download URLs, deletion, and attachment list/create/replace/delete APIs.
- Verified real MinIO byte integrity: uploaded a known PDF byte sequence through a presigned PUT URL and downloaded the exact same bytes through a presigned GET URL.
- Added backend CORS support for Expo Web on `localhost:8081`.
- Added typed frontend API clients for profiles, sessions, files, and attachments. Frontend types do not expose MinIO credentials or object storage keys.
- Connected the profile list, profile creation, profile session loading, session create/update/delete, attachment loading/deletion, and original-file download URL flow to FastAPI.
- Added loading, error, and retry states to the profile list.
- Verification passed: `14` backend tests, `41` frontend tests, and TypeScript typecheck.

### In Progress

- Historical note: the items below were completed by the later 2026-06-13 MVP integration pass.
- Browser end-to-end verification is running with FastAPI at `http://127.0.0.1:8000` and Expo Web at `http://localhost:8081`.
- Frontend file upload UI still needs native/browser file selection and direct PUT upload before it can create or replace attachments from the page.
- Profile legal/ethical file upload and replacement still use temporary UI-only state and must be switched to the attachment API.

### Next

- Finish browser verification for profile list, session mutations, attachment list, and exact original-file download.
- Connect real file selection, direct MinIO upload, completion, attachment creation, and replacement.
- Remove remaining migrated business seed data and temporary file metadata behavior from `App.tsx`.
- Run Expo Web production export, update the handoff, and commit the integration.

## 2026-06-13 MVP Functional Refinement

- Restored PostgreSQL and private MinIO; both services are healthy and remain the only background services kept running for browser development.
- Completed the latest backend regression before the final health-check enhancement: `41 passed`, including authentication, profile grants, concurrent session numbering, real MinIO byte integrity, lifecycle cascades, full user journey, reports, privacy, calendar, and supervision.
- Completed mobile TypeScript validation and `56` frontend behavior tests.
- Added real component health checks for API, PostgreSQL, and MinIO, with a structured `503` response when object storage is unavailable.
- Fixed privacy destruction so deleting a report clears draft/formal content and selected sources, and deleting a supervision conversation removes messages and context references instead of only hiding an index row.
- Made direct supervision-conversation deletion use the same destructive cleanup path.
- Required a matching short-lived profile grant before profile, session, or report data can be added to AI supervision context.
- Added an in-page mobile password setup/verification flow before adding protected profile material to supervision context; the temporary grant is cleared immediately after the operation.
- iOS simulator build completed successfully with Xcode: `BUILD SUCCEEDED`; generated app bundle is `apps/mobile/ios/build/DerivedData/Build/Products/Debug-iphonesimulator/app.app`.
- Android compilation reached dependency processing but stopped because Gradle could not complete a TLS handshake while downloading `intellij-core-31.11.0.jar` from Google Maven. The same URL is reachable with system `curl`, so this is an environment/download issue rather than an application compile error.
- Per user direction, stopped Xcode, Gradle, compiler, and dependency-download processes to reduce machine load. Android packaging is deferred.
- Current priority is browser-based functional refinement and complete workflow verification. PostgreSQL and MinIO stay running; FastAPI and Expo Web should be started only while actively testing.

### Browser Closed-Loop Pass

- Connected account profile editing to `PATCH /api/v1/me`; the email remains read-only and the display name is persisted by the backend.
- Added explicit permanent deletion controls for both expiring and long-term sensitive resources. The UI requires a second confirmation and calls the backend destruction endpoint instead of removing a frontend row locally.
- Added supervision conversation creation, selection, and confirmed deletion. Deleting the active conversation selects the next backend conversation; deleting the final conversation leaves an explicit empty state.
- Removed the frontend behavior that silently created a default supervision conversation whenever the backend list was empty.
- Added backend whitespace validation for account display names, supervision conversation titles, and supervision message bodies so blank durable records cannot be stored.
- Browser-verified the account update across a full page reload, created/deleted a disposable supervision conversation, and created a second disposable conversation that was permanently destroyed through the privacy center.
- Browser request logs showed successful `PATCH /me`, supervision create/delete, privacy delete, and refreshed list requests. No runtime errors were logged; only known React Native Web deprecation warnings remain.
- Fresh verification: `61` frontend tests passed, `44` backend tests passed, TypeScript typecheck passed, Python compileall passed, Web production export passed, and `git diff --check` passed.
- Stopped the Expo Web and FastAPI hot-reload processes after verification to reduce CPU usage. PostgreSQL and MinIO remain available at low idle load for the next browser development pass.

## 2026-06-15 Bailian Recording Transcription

- Added a recording AI provider contract and injected it into the existing recording-processing API; tests continue to use the deterministic provider while local development can use Bailian.
- Added Bailian Base64 mode for private local MinIO: the backend reads the original audio bytes, calls `qwen3-asr-flash`, then sends only the recognized text to `qwen-plus` for a structured main summary and chapter overview.
- Added Bailian URL mode for production: the backend generates a short-lived private MinIO download URL, submits it to asynchronous `fun-asr`, polls the task, downloads the transcription result, and preserves sentence timestamps and speaker IDs.
- Added explicit Base64 limits for the synchronous local model: 10MB and 5 minutes. URL mode is reserved for longer production recordings.
- Persisted provider failures into both `ai_jobs` and `recordings`, with a retryable `recording_ai_service_failed` response instead of leaving recordings stuck in processing.
- Stored the supplied API key only in ignored `backend/.env`; `.env.example` contains placeholders and documents the Base64/MinIO URL switch.
- Real model verification used a locally synthesized Chinese M4A and returned the expected Chinese transcript, a concise recording note, and three chapter sections.
- Full end-to-end verification uploaded that M4A through the API to real MinIO, bound it to a PostgreSQL recording, processed it through Bailian, and read the stored transcript, summary, chapters, and completed AI job back through the API.
- Real `fun-asr` URL verification also succeeded against Alibaba Cloud's public sample audio, including asynchronous submission, polling, result download, timestamps, and `qwen-plus` summary generation.
- Fresh regression: `50` backend tests passed, `61` frontend tests passed, TypeScript typecheck passed, Python compileall passed, and `git diff --check` passed.

## 2026-06-15 Recording AI Workflow Completion

- Split summary regeneration from speech recognition. `POST /recordings/{id}/summary/regenerate` now uses the current persisted transcript and calls only the summary model, preserving speaker labels, segment text, and manual transcript edits.
- Added a dedicated `recording_summary_regeneration` AI job with persisted success/failure state. Summary-model input and service failures return explicit API errors without deleting the previous transcript.
- Connected the mobile processing page to real recording and AI job state. Archived recordings in pending, processing, or failed states now open the processing page instead of incorrectly attempting to load missing detail data.
- Added processing-page states for pending, running, failed, and completed jobs, plus refresh, retry, and open-result actions.
- Retry availability now follows backend audio lifecycle state. Missing, expired, or destroyed original audio is shown as unavailable and cannot trigger a pointless ASR retry.
- Archive persistence and AI processing are handled separately so an AI provider failure no longer makes a successfully archived recording appear unarchived.
- Browser-verified at a 390x844 viewport: real backend recording list, profile access gate for completed archived recordings, failed-processing recovery UI, and the unavailable-audio boundary state.
- Re-ran real Bailian summary regeneration against the dedicated end-to-end test recording: the job completed, a non-empty summary and three chapters were stored, and the transcript hash was unchanged.
- Fresh regression: `52` backend tests passed, `64` frontend tests passed, TypeScript typecheck passed, Python compileall passed, and `git diff --check` passed.
- FastAPI and Expo Web were stopped after verification. PostgreSQL and MinIO remain healthy for browser development.

## 2026-06-15 Browser Recording Compatibility Fix

- Fixed Expo Web recording startup by replacing direct construction of `AudioModule.AudioRecorder` with Expo's lifecycle-managed `useAudioRecorder`.
- Preserved the same recorder driver contract for iOS and Android while using `AudioRecorderWeb` through the official hook on Web.
- Correctly marks browser recordings as `audio/webm`; native recordings remain `audio/mp4`.
- Captures recording duration before Web `MediaRecorder.stop()` resets its status.
- Removed the unsupported Expo FileSystem dependency from browser recording saves. Web `blob:` audio is now converted directly to a `File` and uploaded to MinIO through the existing presigned PUT flow.
- Frontend regression now passes `66` tests plus TypeScript typecheck.

## 2026-06-15 Original Recording Playback

- Added original-recording playback immediately after a recording is saved, on the archive confirmation page.
- Added playback to the unlocked recording-summary detail page so users can compare audio with transcript and summary content.
- Playback requests a five-minute MinIO download URL from the authenticated backend; object keys and durable URLs are never stored in frontend state.
- Web uses the browser's native audio controls for reliable play, pause, seeking, volume, and autoplay-policy compliance.
- iOS and Android use Expo Audio with a shared controller for play, pause, and replay-from-start behavior.
- Playback is unavailable after the original recording is missing, expired, or destroyed. Archived audio is only loaded after the existing profile access grant is present.
- Browser verification uploaded a disposable three-second WAV to real MinIO and confirmed the native audio element reached `readyState=4` with the correct duration and presigned URL. The test recording and object were then destroyed.
- Frontend regression now passes `68` tests plus TypeScript typecheck and `git diff --check`.

## 2026-06-15 Change Documentation Requirement

### 改动目标

- 将“后续改动必须记录改动点和实现方法”固化为项目协作规则，确保跨会话继续开发时能够准确恢复上下文。

### 改动点与实现方法

- 新增 `docs/development/change-log-guidelines.md`，定义统一记录字段、记录位置、记录时机和 Markdown 模板。
- 更新 `docs/prd/session-memory.md`，加入长期协作约定和当前 MVP 完成状态。
- 更新 `task_plan.md`，把变更记录规范加入工作文件、长期决策和恢复清单。
- 后续每个开发批次必须同步记录目标、前后端责任、接口/字段影响、边界处理、测试证据和已知限制。

### 当前完成情况

- 录音上传、归档、百炼转写、纪要生成、失败重试、人工转写保留、浏览器录音兼容和原始录音播放均已实现。
- 最近一次验证：前端 `68` 项测试通过，TypeScript 类型检查通过，真实 MinIO 音频可被浏览器原生播放器完整加载。
- PostgreSQL 和 MinIO 当前健康运行；FastAPI 和 Expo Web 临时开发进程当前未监听 `8000/8081`。

## 2026-06-19 Browser Interaction Audit Fixes

### 改动目标

- 对 MVP 做一轮真实浏览器交互审计，优先修复使用上不符合逻辑的页面状态、导航聚焦、档案资源状态和记录编辑上下文问题。

### 改动点与实现方法

- 前端：
  - 修复录音权限失败后仍显示“正在录音 / 暂停中”且可保存的错误状态。新增 `failed` 录音状态，失败时显示“未开始”、禁用保存，并提供重试入口。
  - 将录音页标题从“正在录音”改为中性“录音”，避免准备中、失败、暂停状态被错误命名。
  - 归档完成、档案详情、隐私中心加入聚焦流程，隐藏底部导航，降低误触离开关键/敏感流程的风险。
  - 档案列表和归档选择统一使用 `nextSessionLabel`，过期下次安排显示为“已过期 ...”，不再写成“下次 ...”。
  - 档案搜索补充 `displayCode` 匹配，`A08` 这类展示编号现在能被搜索到。
  - 档案详情头部不再对“陈雨”硬编码状态/下次时间，改用选中档案的真实展示字段。
  - 新增 `applySessionResourceStatuses`，将后端 session、session 附件和已归档录音合并成卡片状态，使“录音 / 量表 / 作业 / 其他”反映真实后端资料。
  - 上传/替换/删除 session 资料后刷新档案资料状态；上传 session 录音并归档处理后刷新录音列表和档案卡片。
  - 档案敏感子资源授权失效时，自动回到档案访问验证页，而不是只停留在材料页显示错误提示。
  - 记录编辑页新增当前 session 级 `activeRecordLabel`。从第 6 次记录进入时标题和 PDF 文件名显示第 6 次，不再错误使用档案最新第 7 次。
- 后端 / 数据库 / MinIO：
  - 本批次未改后端、数据库结构或 MinIO 存储契约。

### 接口与数据影响

- 未新增或修改后端接口。
- 前端 `ProfileListItem.displayCode` 参与搜索。
- 前端 session 卡片状态现在由 session 基础数据、附件列表和录音列表共同派生。
- 访问 grant 失效的前端处理更严格：清除本地 grant 并要求重新验证。

### 边界处理

- 麦克风权限拒绝：录音不再进入可保存状态；用户可重试或返回。
- 过期日程：过去的下次安排标记为“已过期”。
- 热更新或授权过期导致 grant 丢失：敏感资料加载回到档案验证页。
- 归档完成、档案详情、隐私中心等关键流程隐藏底栏，避免误触。

### 测试验证

- 自动化测试：
  - 前端 `npm test`：`72 passed`。
  - 前端 `npm run typecheck`：通过。
  - 后端 `pytest -q`：`52 passed`。
  - `python -m compileall app`：通过。
  - `git diff --check`：通过。
  - `npx expo export --platform web --output-dir dist`：通过。
- 浏览器验证：
  - 首页入口、录音权限失败态、录音记录、归档到已有档案、归档完成页、档案访问验证、档案详情资源卡、档案编号搜索、咨询记录编辑、智能督导资料权限、隐私中心、安全设置、日程和资讯详情均在 `390x844` 移动视口验证。

### 已知限制 / 后续

- 本轮未继续 Android APK 验证，仍沿用此前“Google Maven TLS 下载失败，Android 打包暂缓”的状态。
- 当前开发数据库中有历史审计产生的测试档案和录音资源，列表数量不代表干净种子库状态。
- FastAPI、Expo Web、PostgreSQL 和 MinIO 在本轮测试后仍保持运行，便于继续下一轮浏览器审计。

## 2026-06-19 Browser Interaction Audit Fixes, Round 2

### 改动目标

- 继续用真实浏览器审计档案、报告和文件预览闭环，修复个案报告资料选择、草稿覆盖确认、Web 下载和法律文件删除提示中的不合理交互。

### 改动点与实现方法

- 前端：
  - 个案报告资料选择页现在在已有草稿时先停留在当前页提示风险，按钮切换为“确认覆盖并重新生成草稿”，第二次点击才携带 `confirmOverwriteDraft` 覆盖草稿。
  - 用户调整勾选资料时会撤回覆盖确认态，避免资料变化后仍沿用旧确认。
  - Web 原始文件下载改为先获取短期 MinIO URL、拉取 Blob、再用 Blob URL 触发浏览器下载；失败时只打开新标签，不再导航当前 SPA。
  - 文件下载成功提示按 Web / 原生端区分文案，不再在 Web 端提示“应用目录/系统分享面板”。
  - 文件预览删除确认文案按文件来源区分：法律及伦理文件提示从当前档案移除，session 材料提示从本次咨询材料移除。
- 后端：
  - 个案报告生成资料源排除既有 `case_report` 报告，避免报告把旧报告作为输入资料自我引用。
  - 个案报告生成、重新生成继续复用后端已有 `confirm_overwrite_draft` 保护。

### 接口与数据影响

- 未新增后端接口。
- `/reports/generation-sources` 和报告生成源校验在 `report_type=case_report` 时排除既有个案报告资源。
- 前端 `downloadAndShareFile` 增加可注入下载依赖，便于测试 Web Blob 下载行为；现有调用保持兼容。

### 边界处理

- 已有个案报告草稿：首次生成只提示确认，不覆盖；确认后覆盖草稿但不影响正式版。
- 个案报告资料源：不再出现“陈雨 个案报告”这类自引用来源。
- Web 跨域预签名下载：浏览器忽略 `<a download>` 时不会把应用页面导航到 MinIO 空白响应。
- 法律文件删除：确认提示不再误写为“本次咨询材料”。

### 测试验证

- 自动化测试：
  - 后端 `pytest -q`：`53 passed`。
  - 前端 `npm test`：`73 passed`。
  - 前端 `npm run typecheck`：通过。
  - 后端 `python -m compileall app`：通过。
  - 前端 `npx expo export --platform web --output-dir dist`：通过。
  - `git diff --check`：通过。
- 浏览器验证：
  - 在 `390x844` 移动视口验证登录、档案库、陈雨档案解锁、个案报告资料选择、已有草稿覆盖确认、覆盖后进入个案报告编辑器。
  - 验证法律文件预览下载后仍停留在 `http://localhost:8081/` 应用页，并显示 Web 下载提示。
  - 验证法律文件删除第一段确认提示为“当前档案的法律及伦理文件”，未执行二次确认删除。

### 已知限制 / 后续

- 本轮未执行破坏性隐私中心删除和账号注销，只验证非破坏性确认态。
- 当前开发数据库仍包含审计过程产生的测试记录和已覆盖的个案报告草稿。

## 2026-07-03 Android Local Verification And Mobile Fixes

### 改动目标

- 完成用户要求的移动端优先测试准备，打通本机 Android 模拟器、后端、Metro 和原生 App 启动链路。
- 修复前期审计中确认的录音统计口径和账号注销交互问题，并把启动/停止命令写入 README。

### 改动点

- 前端：
  - 首页和累计统计页改为读取后端录音时长统计接口，不再只按当前录音列表计算。
  - 上传音频时尽量通过本地音频 metadata 读取时长；读不到时仍允许上传并提示“暂未读取到时长”。
  - 账号注销入口改为“入口行 -> 展开确认表单”，保留密码和确认词双重确认，不再进入账号安全页就直接暴露永久删除表单。
  - README 新增 Android SDK PATH、后端、模拟器、`npm run android`、停止 App/Metro/模拟器的命令。
- 后端：
  - 新增 `recording_duration_entries` 独立统计表，绑定音频时写入，归档后更新到对应档案身份。
  - 新增 `/api/v1/recording-duration-statistics`，按用户返回总秒数和按档案类型分组的录音时长。
  - 账号删除级联清理录音时长统计。
- 数据库 / MinIO：
  - Alembic 新增录音时长统计表并从既有 recordings 回填已知时长。
  - 原始录音仍按生命周期销毁；统计表只保存时长、来源和归档类型，不依赖音频文件长期存在。
- 本机环境：
  - 补齐 Android command-line tools、Android Emulator、Android 35 Google APIs ARM64 系统镜像、NDK `27.1.12297006`。
  - 创建并启动 Android AVD `psy_api35`。
  - 配置 `~/.zshrc` 中的 `ANDROID_HOME` 和 Android SDK PATH。

### 实现方法

- 录音统计以最小持久化流水实现：按 `recording_id` 唯一 upsert，避免原始录音销毁后丢失总时长。
- Android SDK 的 `sdkmanager` 拉 manifest 多次卡住后，改用官方直链下载系统镜像和 NDK zip，解压到 SDK 标准目录。
- Android 构建使用 Android Studio 自带 JBR Java 21，避开本机 Java 25 与 Gradle/React Native 插件不兼容的问题。

### 接口与数据影响

- 新增后端响应：
  - `GET /api/v1/recording-duration-statistics`
  - 返回 `total_seconds` 和 `items[{ profile_type, count, duration_seconds }]`。
- 新增数据库表：
  - `recording_duration_entries`
  - 记录 `user_id`、`recording_id`、`source_type`、`profile_type`、`duration_seconds`、`recorded_at`。
- 移动端新增 `RecordingDurationStatistics` 类型和 `recordingService.durationStatistics()`。

### 边界处理

- 上传音频时长读取失败：上传流程不中断，后端不写统计，前端提示稍后仍可处理。
- 未归档录音：统计页单独显示“未归档录音”，不混入咨询/受督/督导分类。
- 原始音频销毁：统计表保留时长，不依赖 MinIO 对象。
- 注销账号：默认只显示折叠入口；展开后才显示不可恢复说明、密码、确认词、取消和确认按钮。
- Android 环境：`JAVA_HOME` 必须指向 Android Studio JBR；当前默认系统 Java 25 不适合构建该项目。

### 测试验证

- 自动化测试：
  - `cd apps/mobile && npm run typecheck`：通过。
  - `cd apps/mobile && npm test`：`94 passed`。
  - `cd backend && ../venv/bin/pytest tests/test_recording_ai_api.py tests/test_auth_account_api.py -q`：`13 passed`。
  - `cd backend && ../venv/bin/pytest tests/test_lifecycle_cascade.py tests/test_core_api.py -q`：`8 passed`。
- 浏览器验证：
  - 在 `390x844` 移动视口验证首页累计统计、统计详情页、账号安全注销入口折叠/展开状态和中文资源类型展示。
- Android 真实服务验证：
  - `psy_api35` 模拟器启动完成，`adb devices` 显示 `emulator-5554 device`。
  - `npm run android` 成功构建、安装并打开 `com.psyautoast.counselor`。
  - App 进程存在，包名安装成功。
  - 模拟器可连通宿主机后端 `10.0.2.2:8000`，后端返回 HTTP 响应。

### 已知限制 / 后续

- 上传音频时长读取依赖系统可解析 metadata；不可解析格式会上传成功但不计入时长，后续可按需要加服务端音频 metadata 识别。
- Android Studio / SDK Manager 的远端 manifest 拉取不稳定；本机已通过官方直链补齐当前所需镜像和 NDK。
- 当前后端、Android 模拟器、Metro 和 Android App 在测试后保持运行，方便继续人工测试。

## 2026-08-31 Issue 0831-5 Profile And Report Source Fixes

### 改动目标

- 修复单次记录草稿页“将依据以下资料”混入其他历程记录、个案报告和全档案资料的问题。
- 将三类档案的基本信息编辑改为弹窗，并补齐可编辑字段。
- 将新增档案页的三类身份入口改成 tab/分段切换。
- 明确“咨询/受督/督导次数”是可编辑基本信息里的约定次数，不参与真实历程数量和记录编号。

### 改动点与实现方法

- 后端：
  - `/reports/generation-sources` 和 `/reports/generate` 在 `report_type != case_report` 时调用 session-scoped source 清单，不再加入 profile-level report/profile sources。
  - 个案报告继续使用 profile-scoped sources，并保留排除既有 `case_report` 的规则。
  - `next_session_sequence()` 和 `resequence_profile_sessions()` 不再以 `initial_session_count` 作为编号起点，真实历程序号只按 sessions 自身顺延。
  - `PATCH /profiles/{id}` 的 `metadata` 改为与现有 metadata 局部合并，避免只改频率时覆盖性别、首访主诉或督导形式。
- 前端：
  - `profileService.mapBackendProfile()` 映射 `gender`、`first_visit_complaint`、`supervision_mode` 和 raw `crisis_level`，并把次数文案改为“约定 N 次”。
  - 档案详情「编辑基本信息」由内联展开改为 RN `<Modal>` 弹窗；三类档案都可编辑姓名、编号、状态、性别、频率、约定次数和备注。
  - 来访者编辑弹窗增加首访时主诉与危机评估；督导师/受督者编辑弹窗保留督导形式。
  - 新增档案页三类入口从纵向身份卡片改为分段 tab；新增督导师/受督者也可填写性别和档案状态。
  - `BUILD_TAG` 升至 `0831-5`，供后续打包安装时核对版本。

### 接口与数据影响

- 未新增数据库表或迁移。
- `profiles.initial_session_count` 字段暂保留原后端字段名，但产品语义改为“约定次数/基本信息次数”。
- 更新 profile metadata 时改为 merge 行为；客户端可只提交本次要修改的 metadata 字段。
- 单次记录生成的可选资料清单和生成校验口径同步收窄，避免前端过滤与后端校验不一致。

### 边界处理

- 已有个案报告仍不会作为个案报告资料源再次自引用。
- 已有 session 附件、转写、录音纪要仍可参与当前 session 记录生成。
- 编辑基本信息弹窗保存中不可点遮罩关闭，防止提交中断造成状态不明。
- 约定次数为 0 或正整数；实际历程为空时仍显示“尚无记录”。

### 测试验证

- `cd apps/mobile && npm run typecheck`：通过。
- `cd apps/mobile && node --import tsx --test src/__tests__/*.test.ts`：`98 passed`。
- `cd backend && ../venv/bin/python -m compileall app`：通过。
- `git diff --check`：通过。
- `cd backend && ../venv/bin/pytest tests/test_reports_privacy_calendar_api.py tests/test_core_api.py tests/test_api_contracts.py -q`：未执行成功，原因是当前 Docker daemon 未运行，无法启动 `127.0.0.1:55432` 测试 PostgreSQL。

### 已知限制 / 后续

- 本轮未构建/上传 Android APK；按当前规则，除非用户明确要求 APK 或部署，不默认打包。
- 后端 pytest 需在 Docker Desktop 启动后补跑。

## 2026-08-31 Issue 0831-5 Server Deployment

### 部署目标

- 按用户要求将 `0831-5` 部署到生产样服务器 `47.96.89.215`。
- 部署范围按当前记忆规则执行为 Web + 后端；未构建或上传 APK。

### 部署过程

- 本机 Web 构建：
  - `EXPO_PUBLIC_API_BASE_URL=http://47.96.89.215/api/v1 npx expo export --platform web --output-dir dist`
  - 产物主 bundle：`AppEntry-6f5d2eb92ed7cd4b1bfbaa890b9f7bdf.js`
- 本机打包：
  - `/tmp/psy0831_5_backend_patch.tar.gz`：包含 `backend/app/api/routes/reports.py`、`backend/app/main.py`、`backend/app/services/session_ordering.py`。
  - `/tmp/psy0831_5_web_dist.tar.gz`：包含 Web dist。
- 服务器部署：
  - 上传两个 tar 到 `/tmp/`。
  - 部署前备份到 `/opt/psy_auto_ast/backups/deploy_0831_5_20260831_235832/`。
  - 解压后端补丁到 `/opt/psy_auto_ast/backend`。
  - 用 `find web -mindepth 1 -delete` 清空并保留 `/opt/psy_auto_ast/web` 目录，再解压新 Web dist。
  - 执行 `docker compose -f compose.prod.yaml up -d --build backend` 重建并启动后端。
  - 执行 `docker exec psy-auto-ast-web-1 nginx -s reload`。

### 线上验证

- 服务器内直连 `http://127.0.0.1:8000/api/v1/health`：`api/database/object_storage` 全 ok。
- 服务器内 nginx 反代 `http://127.0.0.1/api/v1/health`：ok。
- 公网 `http://47.96.89.215/`：HTTP 200，`Last-Modified: Mon, 31 Aug 2026 15:57:09 GMT`。
- 公网 `http://47.96.89.215/api/v1/health`：ok。
- 公网 Web bundle 包含 `0831-5` 与 `47.96.89.215/api/v1`。
- Docker compose 状态：backend/postgres/minio healthy，web running。

### 已知限制 / 后续

- Android APK 未重新构建或上传；手机端仍需要用户明确要求后再走 Gradle release + `/opt/psy_auto_ast/apk/` 覆盖流程。
- 本地后端 pytest 仍受 Docker Desktop 未启动限制，未补跑。

## 2026-09-01 Issue 0831-5 Local Android APK Build

- 按用户明确要求执行本地 Android release 打包。
- 构建命令环境：
  - `JAVA_HOME=/Users/apple/Library/Java/JavaVirtualMachines/corretto-17.0.15/Contents/Home`
  - `ANDROID_HOME=/Users/apple/Library/Android/sdk`
  - `EXPO_PUBLIC_API_BASE_URL=http://47.96.89.215/api/v1`
  - `./gradlew assembleRelease`
- 构建成功：`BUILD SUCCESSFUL in 1m 11s`。
- 产物：`apps/mobile/android/app/build/outputs/apk/release/app-release.apk`。
- 文件信息：`70,723,550 bytes`，MD5 `1359477fafac1f1d4d0b12d1205c5845`，本地时间 `2026-09-01 00:03:26`。
- 包内校验：
  - JS bundle 包含 `0831-5`。
  - JS bundle 包含 `http://47.96.89.215/api/v1`。
  - Manifest 包名 `com.psyautoast.counselor`，`versionName=0.1.0`。
  - Manifest 保留 `usesCleartextTraffic=true`，适配当前 HTTP API 地址。
- 本次仅本地打包，未上传或覆盖服务器 `/apk/` 下载页。
# 2026-09-01 Codex / WorkBuddy Resynchronization

- Fetched `origin/main`; local and remote commits are aligned (`0/0`) and five existing mobile modifications were preserved.
- Read the WorkBuddy durable memory and 2026-09-01 timeline, then reconciled the newer HTTPS, email-authentication, and iOS simulator status with the Codex plan.
- Identified the current workspace diff as the unfinished iOS-readiness batch and started Phase 41 validation without changing production services.
