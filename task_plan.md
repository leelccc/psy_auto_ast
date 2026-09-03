# Counselor Assistant MVP Build Plan

## Goal

Deliver a usable counselor-assistant MVP with a real Expo mobile client, FastAPI contracts, PostgreSQL persistence, private MinIO files, tests, and native build verification.

## Current Phase

The MVP is deployed and the active work is mobile-first production refinement. Durable state is backend-owned, file bytes use MinIO, and the mobile app uses typed real APIs and native adapters. Android and iOS simulator builds have passed, the production Web/API stack is live over HTTPS, and email verification is the current authentication path. WorkBuddy was synchronized through 2026-09-01. The current source build tag is `0901-4`; the iOS safe-area, icon, export-metadata, and simulator-readiness batch is complete. Production MinIO still uses a cleartext IP endpoint and must be migrated before iOS file flows can be accepted.

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
- [x] Phase 18: Complete recording archive flow with working search/create, automatic session numbering, completion state, selected-profile detail, and contextual back navigation.
- [x] Phase 19: Document user journeys, interaction state rules, and data movement across the mobile product.
- [x] Phase 20: Audit every mobile screen, card, button, label, state, and navigation outcome.
- [x] Phase 21: Implement the highest-priority audit fixes with tests: profile library, recording routing/context, record editing/versioning, privacy center/authorization state, and case-report generation.
- [x] Phase 22: Verify full workflows in the browser, export the app, and commit the audit pass.
- [x] Phase 23: Complete P1 session-material lists/uploads and recording-note editing/regeneration safeguards.
- [x] Phase 24: Complete P1 intelligent-supervision context, citation, stop, and conversation flows.
- [x] Phase 25: Complete P2 article detail, security settings, statistics detail, and full schedule pages.
- [x] Phase 26: Verify P1/P2 workflows, update records, export, and commit.
- [x] Phase 27: Make consultation history stateful with create, time sorting, editable summaries/tags, and confirmed deletion.
- [x] Phase 28: Add session-scoped file preview, replacement, rename, and deletion flows.
- [x] Phase 29: Add local downloads for generated records, reports, recording notes, and previewable files.
- [x] Phase 30a: Reserve typed frontend file references and MinIO file-service interfaces without connecting a backend.
- [x] Phase 30b: Implement backend MinIO storage and use original uploaded bytes for preview and download.
- [x] Phase 31: Add native Expo file download/share behavior for iOS and Android.
- [x] Phase 32: Complete the page-level closed-loop audit against real persistence and remove durable simulated actions.
- [x] Phase 33: Regression-test the complete mobile workflows and update handoff records.
- [x] Phase 34: Complete final local Android APK verification. iOS simulator build is verified; Android emulator build/install is verified on AVD `psy_api35`.
- [ ] Phase 35: Continue browser-based page, interface, permission, lifecycle, and edge-case audits until every MVP workflow is complete and usable.
- [x] Phase 36: Reconcile `.workbuddy` history with Codex planning records, capture the latest completed scope and operating requirements, and define the exact continuation point.
- [x] Phase 37: Re-diagnose and fix the Android consultation-record generation navigation failure based on observable state transitions rather than the previous WorkBuddy conclusion.
- [x] Phase 38: Fix issue `0831-5`: session-record draft sources, profile basic-info editing, profile creation tabs, and initial-count semantics.
- [x] Phase 39: Deploy issue `0831-5` backend and Web changes to the production-like server.
- [x] Phase 40: Build and verify a local Android release APK for `0831-5`.
- [x] Phase 41: Reconcile the 2026-09-01 WorkBuddy work and complete the in-progress iOS readiness batch.
- [x] Phase 42: Design and validate the production MinIO HTTPS migration before changing production file URLs.
- [x] Phase 43: Redesign the profile basic-information edit entry as a compact, accessible mobile control.
- [x] Phase 44: Deploy Web build `0901-6` with the HTTPS API endpoint and verify the production artifact.
- [x] Phase 45: Reconcile WorkBuddy through 2026-09-03 and remove obsolete client cleartext-network exceptions after the HTTPS migration.

### Phase 45 Progress

- [x] Fetch `origin/main`, confirm a clean 0/0 baseline, and read WorkBuddy's 2026-09-02/03 records plus durable memory.
- [x] Confirm DNS, certificate renewal, Web/API/MinIO HTTPS, APK `0901-7`, Console protection, upload-path repair, and tracked production configs are complete.
- [x] Remove the obsolete iOS ATS exception for the production IP.
- [x] Add Expo SDK 54's `expo-build-properties` plugin and persist Android `usesCleartextTraffic: false` across Prebuild.
- [x] Validate Expo config generation, native manifests, TypeScript, frontend tests, and Web export.
- [x] Update durable records, commit, and push the completed client HTTPS-hardening batch.

### Phase 44 Progress

- [x] Confirm local `main` is clean and aligned with `origin/main`; deployment scope is Web only.
- [x] Export the Web artifact with `EXPO_PUBLIC_API_BASE_URL=https://maxpeking.top/api/v1` and verify its embedded build/API markers.
- [x] Replace the server Web artifact without deleting the bind-mount directory, reload Nginx, and verify the public site and API health.
- [x] Record deployment evidence, commit, and push the deployment record.

### Phase 43 Progress

- [x] Review the existing profile header hierarchy and identify the oversized shared action style as the source of excess visual weight.
- [x] Confirm with the user that the edit entry belongs beside the profile name.
- [x] Implement a custom warm-clay edit pill with a circular pencil medallion, pressed feedback, 48px effective touch target, and accessibility metadata.
- [x] Remove the former full-width edit action while preserving the existing edit modal and save flow.
- [x] Pass TypeScript, all 98 frontend tests, and `git diff --check`; document the production CORS limitation encountered during local browser visual verification.

### Phase 41 Progress

- [x] Fetch `origin/main` and confirm local `main` is 0 ahead / 0 behind while preserving five uncommitted mobile changes.
- [x] Read WorkBuddy durable memory and the 2026-09-01 timeline; identify HTTPS, email verification, and iOS simulator work completed after the prior Codex handoff.
- [x] Confirm the five local changes are the active iOS batch: safe-area migration, encryption export metadata, icon alpha removal, and dependency lock updates.
- [x] Validate TypeScript, all 98 frontend tests, HTTPS Web export, and iOS simulator compilation for the active changes.
- [x] Visually verify the iPhone 17 login screen respects the top and bottom safe areas without clipping.
- [x] Confirm the icon has no alpha channel and the workspace passes `git diff --check`.
- [x] Update README/project records and synchronize the completed batch to `origin/main`.

### Phase 42 Progress

- [x] Inspect the existing Nginx, MinIO, DNS, certificate-renewal, and presigned-URL configuration.
- [x] Define and execute the final 443 bucket-path proxy with separate internal/public MinIO clients and a documented rollback path.
- [x] Verify DNS, certificate renewal, presigned upload/download, Web/API health, APK HTTPS markers, and production config tracking through WorkBuddy's 2026-09-02/03 work.

### Phase 35 Progress

- [x] Close the account profile editing loop with backend persistence and reload verification.
- [x] Add confirmed backend destruction from the privacy center for expiring and long-term resources.
- [x] Complete supervision conversation create/select/delete behavior, including the final-conversation empty state.
- [x] Reject whitespace-only account and supervision text at the backend boundary.
- [x] Replace deterministic recording transcription/summary generation with configurable Bailian Base64 and MinIO URL providers.
- [x] Verify real local-audio Base64 transcription and real asynchronous `fun-asr` URL transcription.
- [x] Complete recording processing status, retry, audio-lifecycle boundaries, and transcript-preserving summary regeneration.
- [x] Complete a browser interaction audit pass for recording permission failure, archive completion focus, profile search/time labels, profile material status, record-editor session context, grant-expiry recovery, privacy center focus, schedule, security, and information pages.
- [x] Complete a second browser audit pass for case-report source filtering, draft overwrite confirmation, Web original-file downloads, and legal-file preview warnings.
- [x] Complete Android SDK/AVD setup and install the native Android app on `psy_api35`.
- [x] Deploy FastAPI, PostgreSQL, MinIO, Nginx Web, and an APK download surface to the production-like server.
- [x] Add Web WeChat OAuth foundations, production JWT validation, configurable CORS, and backend containerization.
- [x] Add profile-scoped privacy/resource APIs, async recording processing status polling, and full-page report generation states.
- [x] Run the `0830-4` through `0830-6` Android touch-delivery investigation; the later user retest invalidated it as a complete fix.
- [x] Prevent report/source API failures from silently clearing the generation page and returning to the profile; verified in local Android release build `0831-1`.
- [x] Correct the diagnosis: existing reports should open the editor; the Android defect is stale button/status presentation.
- [x] Reconcile session button state against the real report list when loading a profile and restore the correct existing-report editor navigation.
- [x] Rebuild and verify Android release `0831-4`.
- [ ] Continue the mobile audit across recording, archive, profile materials, generated reports, calendar, and security edge states.
- [ ] Push the local Android diagnostic/fix commits and issue `0831-5` work when the user wants the completed batch synchronized.
- [x] Build a fresh local `0831-5` Android release APK after explicit user request; do not upload APK by default.
- [ ] If requested, upload/distribute the fresh `0831-5` APK and obtain Android-device acceptance.

### Phase 36 Progress

- [x] Read the existing Codex planning records and restore the current Phase 35 context.
- [x] Read the complete `.workbuddy` memory timeline and durable memory.
- [x] Reconcile differences against code and Git state.
- [x] Update `task_plan.md`, `findings.md`, and `progress.md` with the synchronized handoff.
- [x] Synchronize the concise handoff in `docs/prd/session-memory.md` and verify the final diff.

### Phase 37 Progress

- [x] Reject the prior “fixed” conclusion based on the user's Android retest.
- [x] Trace the session-card press handler, `openSessionRecord`, `quickView`, pending generation state, and generation-source loading effect.
- [x] Identify an immediate silent return path: any report/source API failure clears pending state and navigates back, making Android appear not to have navigated.
- [x] Keep the generation page mounted on load failure, add page-level error/retry behavior, and remove misleading transient button state.
- [x] Run frontend tests, typecheck, Web export, and an Android release build.

### Phase 38 Progress

- [x] Start issue `0831-5` from user feedback.
- [x] Confirm the current baseline is `0831-4` at commit `d55f2dd`, with four local commits ahead of `origin/main`.
- [x] Identify source-scope root cause: single-session note generation passes both `session_id` and `profile_id`, and the shared backend source builder currently adds full profile-level reports whenever `profile_id` is present.
- [x] Implement the session-note source narrowing and profile UI/data fixes.
- [x] Run targeted validation and update durable records.

### Phase 39 Progress

- [x] User explicitly requested server deployment for `0831-5`.
- [x] Confirm deployment scope from memory: deploy backend and Web by default; do not build/upload APK unless explicitly requested.
- [x] Build Web export with `EXPO_PUBLIC_API_BASE_URL=http://47.96.89.215/api/v1`.
- [x] Sync backend patch and Web artifact to `/opt/psy_auto_ast` on `47.96.89.215`.
- [x] Rebuild backend container, reload Web nginx, and verify health.

### Phase 40 Progress

- [x] User explicitly requested local APK packaging.
- [x] Run `./gradlew assembleRelease` with Corretto JDK 17 and `EXPO_PUBLIC_API_BASE_URL=http://47.96.89.215/api/v1`.
- [x] Build output: `apps/mobile/android/app/build/outputs/apk/release/app-release.apk`, `70,723,550 bytes`, MD5 `1359477fafac1f1d4d0b12d1205c5845`.
- [x] Verify APK bundle contains `0831-5` and `http://47.96.89.215/api/v1`; verify manifest package `com.psyautoast.counselor`, `versionName=0.1.0`, and `usesCleartextTraffic=true`.
- [x] Leave server `/apk/` untouched because the user requested packaging, not upload/distribution.

## Working Files

- `task_plan.md`: phase plan and decision log for this backend-spec pass.
- `findings.md`: extracted facts, requirements, and implementation discoveries.
- `progress.md`: chronological work log.
- `docs/backend/database-schema.md`: planned database schema specification.
- `docs/backend/api-spec.md`: planned backend API specification.
- `docs/backend/implementation-notes.md`: planned backend notes for jobs, retention, security, exports, and integrations.
- `docs/development/change-log-guidelines.md`: mandatory format for recording change points, implementation methods, validation, and known limitations.
- `backend/`: minimal FastAPI backend core.
- `apps/mobile/`: planned mobile frontend.

## Decisions

- The project already has a Git repository; all substantial documentation changes should be committed.
- Keep specs implementation-oriented, but avoid pretending code exists before the backend scaffold is created.
- Treat `docs/prd/2026-06-05-counselor-assistant-app-prd.md` and `docs/prd/decision-log.md` as the source of product truth.
- The frontend owns device and presentation behavior; the backend owns durable data, permissions, lifecycle rules, generated content, and storage orchestration.
- Backend MVP uses SQLAlchemy/PostgreSQL for durable business state and private MinIO for original and generated file bytes.
- Mobile frontend detail polish should keep the warm, soft, professional workbench style, but prioritize task clarity over decorative density.
- Data/privacy authorization UI must show active user choice: no default checked long-term save items, and original recordings remain non-preservable.
- Long-term-save authorization should behave as an explicit decision flow: hidden bottom navigation, selectable items, disabled confirmation until selection, and visible selection count.
- Primary bottom navigation is fixed as `首页 / 档案 / 资讯 / 我的`; `资讯` remains a lightweight but necessary tab even if early content is simple.
- The active recording page must not include historical recording records; recording records are a separate page.
- Profile detail is organized by per-session cards. Each session card uses the fixed entry labels `录音 / 记录 / 量表 / 作业 / 其他` for all three profile identities.
- Single-session output is a consultation/supervision record generated from that session's recording, transcript/summary, scale, homework, and other materials. Case reports are full-profile outputs generated from all session records and related materials.
- Every visible button or pressable row in the mobile prototype must close a loop: navigate, change state, open a focused decision flow, or show a specific action result. Avoid no-op placeholder buttons.
- Saving a recording leads to an archive decision flow. The user must choose which profile the recording belongs to; if the person does not exist, the flow must allow creating a new person before confirming archive.
- Archive completion must persist the selected profile context into the next screen and display the exact session number created by the archive action.
- Transient feedback must not block primary actions. Feedback clears on route changes, auto-dismisses, and stays away from bottom action buttons.
- Back navigation should return to the initiating workflow context rather than sending every detail page to the generic overview.
- Archive confirmation should only mark user decisions as steps. Automatically derived record numbers belong in a read-only confirmation summary, not in a clickable step card.
- Profile-library creation and archive-inline creation are different flows: library creation creates an empty profile with no records; archive creation creates the first record.
- Recording detail pages must be driven by the selected recording. Titles, durations, role labels, summaries, and record-generation labels cannot remain hardcoded.
- Data/privacy has two layers: a management center and a per-resource authorization sheet. Confirmed authorization must update the long-term-save list.
- Case reports are full-profile outputs. They require material selection before draft generation and must exclude destroyed/unavailable resources.
- Consultation history is always sorted by occurrence time descending. Sequence numbers stay fixed even when a record is backfilled or its time changes.
- Consultation cards are editable summaries: occurrence time, summary text, and up to four unique tags can change without rewriting the underlying formal record.
- Deleting a consultation requires confirmation and removes its owned recording/scale/homework/other material rows. Files open in a preview before replacement or deletion.
- Generated consultation/supervision records, case reports, and recording notes must support local PDF download. Previewable PDF and attachment files must retain a direct download action.
- Uploaded source files download as original MinIO bytes through short-lived backend-authorized URLs.
- Web uses browser downloads; iOS and Android use Expo FileSystem and the native share/open sheet.
- Local Android testing uses AVD `psy_api35`; Android emulator talks to the host backend through `http://10.0.2.2:8000/api/v1`.
- Android native builds should use Android Studio JBR Java 21 via `JAVA_HOME="/Applications/Android Studio.app/Contents/jbr/Contents/Home"`. The system Java 25 is not suitable for this Gradle/React Native build.
- Local private MinIO recording processing uses backend-read Base64 with `qwen3-asr-flash`; production switches to short-lived public-reachable MinIO URLs with asynchronous `fun-asr`.
- Recording summaries are generated from recognized text by `qwen-plus`; the frontend never receives or stores Bailian credentials.
- Summary regeneration uses the current PostgreSQL transcript and does not read MinIO audio or invoke ASR again.
- Every completed feature or bugfix must update the project records with change points, implementation method, interface/data impact, boundary handling, test evidence, and known limitations.

## Resume Checklist

1. Read `progress.md`, `task_plan.md`, `findings.md`, `docs/prd/session-memory.md`, and `.workbuddy/memory/MEMORY.md`.
2. Check `git status` and compare local `main` with `origin/main`; the reconciled baseline has three local commits through `f845820` that are not yet on origin.
3. Continue Android-first testing from build `0830-6`, especially report generation/editing, recording archive/status, privacy authorization, files, calendar, and security edge states.
4. Confirm PostgreSQL and MinIO health before local browser testing; start FastAPI and Expo only for the active test session.
5. Use disposable records for destructive privacy/lifecycle tests. Do not re-seed production after clearing business data.
6. For async mobile actions, navigate immediately and render page-level loading/empty/error states. Do not hide failure or empty-state outcomes in toast-only branches.
7. Re-run backend tests, frontend tests, typecheck, Web export, and Android release build as appropriate to the changed surface. Android-sensitive UI is not accepted from Web-only verification.
8. Default deployment is Web-only. Build/upload APK only when explicitly requested; verify `BUILD_TAG`, bundled API URL, manifest cleartext setting (while HTTP remains), signing, and APK cache headers.
9. Before commit, update the README change log and project records. Do not commit secrets, `.env`, `.workbuddy`, or generated build output; then push only when requested or when completing the established batch workflow.

## Errors Encountered

| Error | Attempt | Resolution |
|---|---|---|
| TypeScript could not resolve `RefreshCw` | 1 | Use the already imported Lucide icon name `RefreshCcw`. |
| `tsx --test` could not create its IPC pipe under the managed sandbox (`EPERM`) | 1 | Re-run the established test command with escalated execution rather than treating it as a test failure. |
| Existing profile mapping test expected a July appointment not to be overdue | 1 | Removed the unrelated fixed date from the frequency-mapping test so it tests frequency without becoming calendar-sensitive. |
| Backend pytest could not connect to `127.0.0.1:55432` | 1 | Docker daemon is not running, so Compose PostgreSQL cannot start in this session; verified backend syntax with `compileall` and left pytest for when Docker Desktop is available. |
| Web export command was rejected because it included `rm -rf` for an old `/tmp` artifact directory | 1 | Use a new `mktemp -d` output directory and avoid destructive cleanup. |
