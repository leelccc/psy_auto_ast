import assert from "node:assert/strict";
import { test } from "node:test";

import { getSelectableCaseReportMaterials } from "../caseReportFlow";

const materials = [
  { id: "record-6", title: "第 6 次咨询记录", available: true },
  { id: "record-5", title: "第 5 次咨询记录", available: true },
  { id: "audio-4", title: "第 4 次原始录音", available: false },
];

test("case report material selection excludes destroyed or unavailable data", () => {
  assert.deepEqual(getSelectableCaseReportMaterials(materials), materials.slice(0, 2));
});
