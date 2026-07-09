import assert from "node:assert/strict";
import { test } from "node:test";

import {
  addSessionTag,
  applySessionResourceStatuses,
  removeSession,
  sortSessionsDescending,
  updateSession,
  type SessionHistoryItem,
} from "../sessionHistory";

const sessions: SessionHistoryItem[] = [
  {
    id: "session-5",
    sequence: 5,
    occurredAt: "2026-05-29T10:00:00+08:00",
    summary: "第五次",
    tags: ["正式版"],
    recording: "已销毁",
    record: "正式版",
    scale: "SAS",
    homework: "已提交",
    other: "无",
  },
  {
    id: "session-6",
    sequence: 6,
    occurredAt: "2026-06-05T10:00:00+08:00",
    summary: "第六次",
    tags: ["焦虑", "睡眠"],
    recording: "剩余 13 天",
    record: "草稿",
    scale: "未上传",
    homework: "已布置",
    other: "1 项",
  },
];

test("consultation history is sorted by occurred time descending", () => {
  const result = sortSessionsDescending([
    ...sessions,
    { ...sessions[0], id: "session-7", sequence: 7, occurredAt: "2026-06-08T09:00:00+08:00" },
  ]);
  assert.deepEqual(result.map((item) => item.id), ["session-7", "session-6", "session-5"]);
});

test("editing a session time re-sorts the history", () => {
  const result = updateSession(sessions, "session-5", { occurredAt: "2026-06-09T14:00:00+08:00" });
  assert.deepEqual(result.map((item) => item.id), ["session-5", "session-6"]);
});

test("session tags are unique and limited to four", () => {
  let tags = ["焦虑", "睡眠"];
  tags = addSessionTag(tags, "关系");
  tags = addSessionTag(tags, "工作");
  tags = addSessionTag(tags, "风险");
  tags = addSessionTag(tags, "焦虑");
  assert.deepEqual(tags, ["焦虑", "睡眠", "关系", "工作"]);
});

test("deleting a session removes only the confirmed record", () => {
  assert.deepEqual(removeSession(sessions, "session-6").map((item) => item.id), ["session-5"]);
});

test("session cards reflect backend recordings and attachments", () => {
  const [updated] = applySessionResourceStatuses([sessions[0]], [
    { sessionId: "session-5", category: "scale" },
    { sessionId: "session-5", category: "homework" },
    { sessionId: "session-5", category: "other" },
  ], [
    { sessionId: "session-5", ttl: "剩余 10 天" },
  ]);

  assert.equal(updated.recording, "剩余 10 天");
  assert.equal(updated.scale, "已上传 1");
  assert.equal(updated.homework, "已添加 1");
  assert.equal(updated.other, "1 项");
});
