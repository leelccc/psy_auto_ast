import assert from "node:assert/strict";
import { test } from "node:test";

import { buildArchiveResult, describeArchiveTarget, filterArchiveCandidates } from "../archiveFlow";

const candidates = [
  { id: "chen-yu", name: "陈雨", code: "A08", completedCount: 6 },
  { id: "zhou-nan", name: "周楠", code: "B12", completedCount: 3 },
];

test("filterArchiveCandidates matches name or profile code", () => {
  assert.deepEqual(filterArchiveCandidates(candidates, "陈雨"), [candidates[0]]);
  assert.deepEqual(filterArchiveCandidates(candidates, "b12"), [candidates[1]]);
});

test("buildArchiveResult creates the next consultation number for an existing profile", () => {
  assert.deepEqual(
    buildArchiveResult({ kind: "client", profileName: "陈雨", completedCount: 6 }),
    {
      profileName: "陈雨",
      kindLabel: "来访者",
      recordLabel: "第 7 次咨询",
    },
  );
});

test("buildArchiveResult starts a newly created supervisee at the first record", () => {
  assert.deepEqual(
    buildArchiveResult({ kind: "supervisee", profileName: "王安", completedCount: 0 }),
    {
      profileName: "王安",
      kindLabel: "受督者",
      recordLabel: "第 1 次督导",
    },
  );
});

test("describeArchiveTarget presents the derived record number as confirmation, not a user step", () => {
  assert.deepEqual(
    describeArchiveTarget({
      profileName: "陈雨",
      kindLabel: "来访者",
      recordLabel: "第 7 次咨询",
    }),
    {
      title: "本次将归为",
      value: "第 7 次咨询",
      detail: "归入陈雨的来访者档案",
    },
  );
  assert.deepEqual(describeArchiveTarget(null), {
    title: "本次归档记录",
    value: "选择归属档案后自动生成",
    detail: "系统会根据该档案已有记录自动顺延",
  });
});
