import assert from "node:assert/strict";
import { test } from "node:test";

import { decideRecordingRegeneration, updateAtIndex } from "../recordingEditorFlow";

test("regeneration requires explicit confirmation when manual edits exist", () => {
  assert.equal(decideRecordingRegeneration(true, false).status, "confirm");
  assert.match(decideRecordingRegeneration(true, false).message, /覆盖这些修改/);
  assert.equal(decideRecordingRegeneration(true, true).status, "regenerating");
});

test("regeneration without manual edits can start directly", () => {
  assert.equal(decideRecordingRegeneration(false, false).status, "regenerating");
});

test("editor updates only the selected chapter or transcript turn", () => {
  assert.deepEqual(updateAtIndex(["a", "b", "c"], 1, "updated"), ["a", "updated", "c"]);
});
