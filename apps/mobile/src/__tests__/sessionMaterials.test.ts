import assert from "node:assert/strict";
import { test } from "node:test";

import {
  addSessionMaterial,
  getMaterialUpdateMessage,
  materialCategoryCopy,
  removeMaterialsForSession,
  removeSessionMaterial,
  updateSessionMaterial,
} from "../sessionMaterials";
import type { StoredFileReference } from "../fileService";

test("session materials expose focused destinations for every session card entry", () => {
  assert.equal(materialCategoryCopy.recording.title, "录音资料");
  assert.equal(materialCategoryCopy.scale.uploadLabel, "上传量表");
  assert.equal(materialCategoryCopy.homework.title, "咨询作业");
  assert.equal(materialCategoryCopy.other.uploadLabel, "添加资料");
});

test("adding a session attachment creates visible state and marks audio non-preservable", () => {
  const scale = addSessionMaterial([], { sessionId: "session-6", category: "scale", title: "SAS 复测", fileType: "PDF" });
  const recording = addSessionMaterial(scale, { sessionId: "session-6", category: "recording", title: "补充录音.m4a", fileType: "音频" });

  assert.equal(recording[0].title, "补充录音.m4a");
  assert.equal(recording[0].preservable, false);
  assert.deepEqual(recording[0].file, {
    fileId: null,
    filename: "补充录音.m4a",
    mimeType: "audio/mp4",
    sizeBytes: null,
    uploadStatus: "pending",
    sourceKind: "prototype",
  });
  assert.equal(recording[1].file.mimeType, "application/pdf");
  assert.equal(recording[1].preservable, true);
  assert.match(getMaterialUpdateMessage("scale"), /重新生成草稿/);
});

test("blank material names do not create placeholder rows", () => {
  const current = addSessionMaterial([], { sessionId: "session-6", category: "other", title: "   ", fileType: "PDF" });
  assert.deepEqual(current, []);
});

test("uploaded files can be renamed, replaced, and removed inside their session", () => {
  const initial = addSessionMaterial([], { sessionId: "session-6", category: "other", title: "事件时间线", fileType: "PDF" });
  const replacement: StoredFileReference = {
    fileId: "file-replacement",
    filename: "工作事件时间线.jpg",
    mimeType: "image/jpeg",
    sizeBytes: 4096,
    uploadStatus: "uploaded",
    sourceKind: "minio",
  };
  const updated = updateSessionMaterial(initial, initial[0].id, {
    title: "工作事件时间线",
    fileType: "图片",
    file: replacement,
  });

  assert.equal(updated[0].title, "工作事件时间线");
  assert.match(updated[0].meta, /图片/);
  assert.equal(updated[0].sessionId, "session-6");
  assert.deepEqual(updated[0].file, replacement);
  assert.deepEqual(removeSessionMaterial(updated, initial[0].id), []);
});

test("deleting a consultation removes all files owned by that consultation", () => {
  const first = addSessionMaterial([], { sessionId: "session-6", category: "scale", title: "SAS", fileType: "PDF" });
  const second = addSessionMaterial(first, { sessionId: "session-5", category: "other", title: "时间线", fileType: "PDF" });
  assert.deepEqual(removeMaterialsForSession(second, "session-6").map((item) => item.sessionId), ["session-5"]);
});
