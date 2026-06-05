import assert from "node:assert/strict";
import { test } from "node:test";

import { formatBadge } from "../mockData";

test("formatBadge maps archive and long-term states to green", () => {
  assert.equal(formatBadge("已归档"), "green");
  assert.equal(formatBadge("长期保存"), "green");
});

test("formatBadge maps generating state to blue and default state to warm", () => {
  assert.equal(formatBadge("生成中"), "blue");
  assert.equal(formatBadge("可查看"), "warm");
});
