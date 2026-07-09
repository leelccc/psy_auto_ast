import assert from "node:assert/strict";
import { test } from "node:test";

import {
  createConversationAndSelect,
  deleteConversationAndSelect,
  normalizeDisplayName,
} from "../mvpUiFlows";


test("display name is trimmed and rejects empty or oversized values", () => {
  assert.equal(normalizeDisplayName("  林咨询师  "), "林咨询师");
  assert.throws(() => normalizeDisplayName("   "), /请输入展示名称/);
  assert.throws(() => normalizeDisplayName("咨".repeat(81)), /不能超过 80 个字符/);
});

test("creating a supervision conversation selects it and keeps newest first", async () => {
  const existing = [{ id: "old", title: "旧会话" }];
  const result = await createConversationAndSelect(
    async (title) => ({ id: "new", title }),
    "  新督导会话  ",
    existing,
  );

  assert.equal(result.active.id, "new");
  assert.deepEqual(result.items.map((item) => item.id), ["new", "old"]);
  assert.equal(result.active.title, "新督导会话");
});

test("deleting the active supervision conversation selects the next item", async () => {
  const deleted: string[] = [];
  const items = [
    { id: "active", title: "当前会话" },
    { id: "next", title: "下一会话" },
  ];
  const result = await deleteConversationAndSelect(
    async (id) => {
      deleted.push(id);
    },
    items,
    "active",
    "active",
  );

  assert.deepEqual(deleted, ["active"]);
  assert.equal(result.active?.id, "next");
  assert.deepEqual(result.items.map((item) => item.id), ["next"]);
});

test("deleting the final supervision conversation leaves an explicit empty state", async () => {
  const result = await deleteConversationAndSelect(
    async () => undefined,
    [{ id: "only", title: "唯一会话" }],
    "only",
    "only",
  );

  assert.equal(result.active, null);
  assert.deepEqual(result.items, []);
});
