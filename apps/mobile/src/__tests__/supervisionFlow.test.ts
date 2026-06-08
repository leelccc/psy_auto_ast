import assert from "node:assert/strict";
import { test } from "node:test";

import { buildSupervisionReply } from "../supervisionFlow";

test("supervision reads no profile data when no context is selected", () => {
  const reply = buildSupervisionReply("怎么准备督导", []);
  assert.deepEqual(reply.citations, []);
  assert.match(reply.text, /未读取任何档案资料/);
});

test("supervision reply carries explicit citations for selected materials", () => {
  const reply = buildSupervisionReply("如何讨论风险", [
    { id: "record-6", title: "陈雨 第6次咨询记录", type: "咨询记录" },
    { id: "scale-6", title: "SAS 复测", type: "量表" },
  ]);
  assert.deepEqual(reply.citations, ["咨询记录：陈雨 第6次咨询记录", "量表：SAS 复测"]);
});
