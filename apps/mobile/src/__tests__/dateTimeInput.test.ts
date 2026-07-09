import assert from "node:assert/strict";
import { test } from "node:test";

import { formatDateTimeInput, normalizeSessionDate } from "../dateTimeInput";

test("session date input accepts mobile picker and compact typed values", () => {
  assert.equal(normalizeSessionDate("2026-06-08 18:00"), "2026-06-08T18:00:00+08:00");
  assert.equal(normalizeSessionDate("2026-06-0818:00"), "2026-06-08T18:00:00+08:00");
  assert.equal(normalizeSessionDate("2026-06-08T18:00"), "2026-06-08T18:00:00+08:00");
  assert.equal(normalizeSessionDate("2026-06-08 18:00:30"), "2026-06-08T18:00:30+08:00");
});

test("date time input formats existing ISO values for editing", () => {
  assert.equal(formatDateTimeInput("2026-06-08T18:00:30+08:00"), "2026-06-08 18:00:30");
  assert.equal(formatDateTimeInput("2026-07-01T12:00:00+00:00"), "2026-07-01 20:00:00");
});
