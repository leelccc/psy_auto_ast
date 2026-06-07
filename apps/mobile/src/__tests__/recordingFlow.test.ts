import assert from "node:assert/strict";
import { test } from "node:test";

import { describeRecordingContext, getRecordingDestination, toArchiveRecording } from "../recordingFlow";

test("recording destination follows archive and processing state", () => {
  assert.equal(getRecordingDestination({ status: "可查看", archive: "待归档" }), "archive");
  assert.equal(getRecordingDestination({ status: "生成中", archive: "已归档" }), "processing");
  assert.equal(getRecordingDestination({ status: "可查看", archive: "已归档" }), "detail");
});

test("archive flow keeps the selected recording title and duration", () => {
  assert.deepEqual(
    toArchiveRecording({
      title: "未归档录音 06-05",
      duration: "41:06",
      status: "可查看",
      archive: "待归档",
    }),
    {
      title: "未归档录音 06-05",
      duration: "41:06",
    },
  );
});

test("recording detail context follows the selected recording type", () => {
  assert.deepEqual(describeRecordingContext("王澜 督导反馈"), {
    actionLabel: "生成督导反馈",
    roles: ["咨询师", "督导师"],
    summary: "本次围绕案例概念化、咨询边界和后续干预方向展开，督导师提供了具体反馈。",
  });
  assert.equal(describeRecordingContext("陈雨 第6次咨询录音").actionLabel, "生成咨询记录");
});
