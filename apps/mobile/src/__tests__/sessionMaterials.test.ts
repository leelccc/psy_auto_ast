import assert from "node:assert/strict";
import { test } from "node:test";

import { addSessionMaterial, getMaterialUpdateMessage, materialCategoryCopy } from "../sessionMaterials";

test("session materials expose focused destinations for every session card entry", () => {
  assert.equal(materialCategoryCopy.recording.title, "录音资料");
  assert.equal(materialCategoryCopy.scale.uploadLabel, "上传量表");
  assert.equal(materialCategoryCopy.homework.title, "咨询作业");
  assert.equal(materialCategoryCopy.other.uploadLabel, "添加资料");
});

test("adding a session attachment creates visible state and marks audio non-preservable", () => {
  const scale = addSessionMaterial([], { category: "scale", title: "SAS 复测", fileType: "PDF" });
  const recording = addSessionMaterial(scale, { category: "recording", title: "补充录音.m4a", fileType: "音频" });

  assert.equal(recording[0].title, "补充录音.m4a");
  assert.equal(recording[0].preservable, false);
  assert.equal(recording[1].preservable, true);
  assert.match(getMaterialUpdateMessage("scale"), /重新生成草稿/);
});

test("blank material names do not create placeholder rows", () => {
  const current = addSessionMaterial([], { category: "other", title: "   ", fileType: "PDF" });
  assert.deepEqual(current, []);
});
