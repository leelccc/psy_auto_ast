import assert from "node:assert/strict";
import { test } from "node:test";

import { buildArchiveResult, filterArchiveCandidates } from "../archiveFlow";

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
