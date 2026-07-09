import assert from "node:assert/strict";
import { test } from "node:test";

import { getAuthorizableResources, mergeAuthorizedResources, privacyResourceTypeLabel } from "../privacyFlow";

const resources = [
  { title: "咨询转写", type: "转写文本", expires: "13 天后销毁", preservable: true },
  { title: "原始录音", type: "原始录音", expires: "12 天后销毁", preservable: false },
  { title: "录音纪要", type: "录音纪要", expires: "13 天后销毁", preservable: true },
];

test("original audio is never included in authorizable resources", () => {
  assert.deepEqual(getAuthorizableResources(resources).map((item) => item.title), ["咨询转写", "录音纪要"]);
});

test("authorized resources merge without duplicates", () => {
  assert.deepEqual(mergeAuthorizedResources(["咨询转写"], ["咨询转写", "录音纪要"]), ["咨询转写", "录音纪要"]);
});

test("privacy resource types are shown in Chinese", () => {
  assert.equal(privacyResourceTypeLabel("audio"), "原始录音");
  assert.equal(privacyResourceTypeLabel("transcript"), "转写文本");
  assert.equal(privacyResourceTypeLabel("recording_summary"), "录音纪要");
  assert.equal(privacyResourceTypeLabel("report"), "报告");
  assert.equal(privacyResourceTypeLabel("video"), "视频");
});
