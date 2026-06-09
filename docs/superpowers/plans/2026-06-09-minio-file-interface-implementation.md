# MinIO File Interface Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reserve a typed frontend file-service boundary for future MinIO-backed upload and original-file download without connecting a backend in this pass.

**Architecture:** Add a focused `fileService.ts` contract that models upload creation, completion, download URLs, replacement, and deletion. Session materials and preview files carry stable backend file metadata, while the current unconfigured service returns an explicit unavailable result instead of generating a substitute file.

**Tech Stack:** TypeScript, React Native/Expo, Node test runner, existing Expo Web prototype.

---

### Task 1: Define the frontend file-service contract

**Files:**
- Create: `apps/mobile/src/fileService.ts`
- Create: `apps/mobile/src/__tests__/fileService.test.ts`

- [x] **Step 1: Write the failing contract tests**

```ts
import assert from "node:assert/strict";
import { test } from "node:test";

import {
  createUnconfiguredFileService,
  getOriginalFileDownloadState,
  type StoredFileReference,
} from "../fileService";

test("stored files with a backend id are eligible for original download", () => {
  const file: StoredFileReference = {
    fileId: "file-1",
    filename: "SAS.pdf",
    mimeType: "application/pdf",
    sizeBytes: 2048,
    uploadStatus: "uploaded",
    sourceKind: "minio",
  };

  assert.deepEqual(getOriginalFileDownloadState(file), {
    available: true,
    label: "下载原文件",
  });
});

test("prototype files without a backend id explain that storage is pending", () => {
  assert.deepEqual(getOriginalFileDownloadState(null), {
    available: false,
    label: "等待文件服务接入",
  });
});

test("unconfigured service does not invent upload or download urls", async () => {
  const service = createUnconfiguredFileService();
  const result = await service.getDownloadUrl("file-1");

  assert.deepEqual(result, {
    ok: false,
    code: "file_service_unavailable",
    message: "文件服务将在后端 MinIO 接入后启用。",
  });
});
```

- [x] **Step 2: Run the focused test and verify RED**

Run: `cd apps/mobile && npm test -- src/__tests__/fileService.test.ts`

Expected: FAIL because `../fileService` does not exist.

- [x] **Step 3: Implement the minimal typed service**

Create `fileService.ts` with:

```ts
export type UploadStatus = "pending" | "uploading" | "uploaded" | "failed" | "destroyed";
export type FileSourceKind = "minio" | "prototype";

export type StoredFileReference = {
  fileId: string | null;
  filename: string;
  mimeType: string;
  sizeBytes: number | null;
  uploadStatus: UploadStatus;
  sourceKind: FileSourceKind;
};

export type FileServiceUnavailable = {
  ok: false;
  code: "file_service_unavailable";
  message: string;
};

export type FileService = {
  createUpload(input: {
    filename: string;
    mimeType: string;
    sizeBytes: number;
  }): Promise<FileServiceUnavailable>;
  completeUpload(fileId: string): Promise<FileServiceUnavailable>;
  getDownloadUrl(fileId: string): Promise<FileServiceUnavailable>;
  replaceFile(fileId: string, replacementFileId: string): Promise<FileServiceUnavailable>;
  deleteFile(fileId: string): Promise<FileServiceUnavailable>;
};

const unavailable = (): FileServiceUnavailable => ({
  ok: false,
  code: "file_service_unavailable",
  message: "文件服务将在后端 MinIO 接入后启用。",
});

export function createUnconfiguredFileService(): FileService {
  return {
    createUpload: async () => unavailable(),
    completeUpload: async () => unavailable(),
    getDownloadUrl: async () => unavailable(),
    replaceFile: async () => unavailable(),
    deleteFile: async () => unavailable(),
  };
}

export function getOriginalFileDownloadState(file: StoredFileReference | null) {
  return file?.fileId && file.uploadStatus === "uploaded"
    ? { available: true, label: "下载原文件" }
    : { available: false, label: "等待文件服务接入" };
}
```

- [x] **Step 4: Run the focused test and verify GREEN**

Run: `cd apps/mobile && npm test -- src/__tests__/fileService.test.ts`

Expected: all `fileService` tests pass.

### Task 2: Carry backend file references through session materials

**Files:**
- Modify: `apps/mobile/src/sessionMaterials.ts`
- Modify: `apps/mobile/src/__tests__/sessionMaterials.test.ts`

- [x] **Step 1: Write failing material-reference tests**

Add assertions that `addSessionMaterial` creates a prototype `file` reference with `fileId: null`, inferred MIME type, and pending status; add a test that `updateSessionMaterial` accepts a replacement `StoredFileReference`.

- [x] **Step 2: Run the focused test and verify RED**

Run: `cd apps/mobile && npm test -- src/__tests__/sessionMaterials.test.ts`

Expected: FAIL because `SessionMaterial` has no `file` field.

- [x] **Step 3: Implement the material file reference**

Import `StoredFileReference`, add `file: StoredFileReference` to `SessionMaterial`, infer MIME types from the existing Chinese file-type labels, and allow `updateSessionMaterial` to receive an optional replacement file reference.

- [x] **Step 4: Update seeded materials**

Modify `apps/mobile/App.tsx` initial material rows to include prototype file references. Existing seeded rows use `fileId: null`, `sourceKind: "prototype"`, and `uploadStatus: "pending"` so the UI truthfully states that original bytes are not connected.

- [x] **Step 5: Run material tests and typecheck**

Run:

```bash
cd apps/mobile
npm test -- src/__tests__/sessionMaterials.test.ts
npm run typecheck
```

Expected: focused tests and typecheck pass.

### Task 3: Replace fake attachment downloads with the file-service state

**Files:**
- Modify: `apps/mobile/App.tsx`
- Modify: `apps/mobile/src/__tests__/fileService.test.ts`

- [x] **Step 1: Extend tests for download feedback**

Add a test that the unconfigured service message remains explicit and that a destroyed file is not downloadable even when it has a `fileId`.

- [x] **Step 2: Run the focused test and verify RED**

Run: `cd apps/mobile && npm test -- src/__tests__/fileService.test.ts`

Expected: FAIL until destroyed-file handling is implemented.

- [x] **Step 3: Wire preview data**

Extend `PreviewFile` with `file: StoredFileReference | null`. Pass the session material file reference into previews. Legal/ethical seeded files receive prototype references without backend IDs.

- [x] **Step 4: Wire the unconfigured service**

Create one unconfigured file-service instance. In `FilePreviewScreen`, replace metadata-generated PDF download with:

```ts
const downloadState = getOriginalFileDownloadState(file.file);

<GhostButton
  icon={Download}
  label={downloadState.label}
  onPress={async () => {
    if (!file.file?.fileId) {
      onNotice("暂不能下载原文件", "文件服务将在后端 MinIO 接入后启用。");
      return;
    }
    const result = await fileService.getDownloadUrl(file.file.fileId);
    if (!result.ok) onNotice("暂不能下载原文件", result.message);
  }}
/>
```

Keep generated report and recording-note PDF downloads on `buildDownloadArtifact`.

- [x] **Step 5: Make upload and replacement copy truthful**

Change prototype upload confirmations to state that the interface is reserved and the file will be persisted after backend MinIO integration. Do not mark a newly typed filename as a successfully uploaded original file.

- [x] **Step 6: Run focused tests and typecheck**

Run:

```bash
cd apps/mobile
npm test -- src/__tests__/fileService.test.ts src/__tests__/sessionMaterials.test.ts src/__tests__/downloadFlow.test.ts
npm run typecheck
```

Expected: focused tests pass; generated-document download tests remain green.

### Task 4: Full verification and handoff update

**Files:**
- Modify: `task_plan.md`
- Modify: `progress.md`

- [x] **Step 1: Run all frontend tests**

Run: `cd apps/mobile && npm test`

Expected: all tests pass.

- [x] **Step 2: Export Expo Web**

Run: `cd apps/mobile && npx expo export --platform web --output-dir dist-web`

Expected: production export succeeds.

- [x] **Step 3: Update project records**

Mark the frontend portion of Phase 30 complete while explicitly leaving backend MinIO implementation pending. Record that uploaded-file previews no longer generate fake PDF copies.

- [x] **Step 4: Inspect the final diff**

Run:

```bash
git diff --check
git status --short
```

Expected: no whitespace errors and only intended files changed.

- [x] **Step 5: Commit**

```bash
git add apps/mobile/src/fileService.ts \
  apps/mobile/src/__tests__/fileService.test.ts \
  apps/mobile/src/sessionMaterials.ts \
  apps/mobile/src/__tests__/sessionMaterials.test.ts \
  apps/mobile/App.tsx \
  task_plan.md progress.md \
  docs/superpowers/plans/2026-06-09-minio-file-interface-implementation.md
git commit -m "feat: reserve minio file interfaces"
```
