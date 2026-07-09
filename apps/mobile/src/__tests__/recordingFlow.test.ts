import assert from "node:assert/strict";
import { test } from "node:test";

import {
  describeRecordingContext,
  findRecordingForSession,
  getRecordingDestination,
  recordingDetailRequiresProfileUnlock,
  recordingAudioCanProcess,
  toArchiveRecording,
  waitForRecordingJob,
} from "../recordingFlow";

test("recording destination follows archive and processing state", () => {
  assert.equal(getRecordingDestination({ status: "可查看", archive: "待归档" }), "archive");
  assert.equal(getRecordingDestination({ status: "生成中", archive: "已归档" }), "processing");
  assert.equal(getRecordingDestination({ status: "待处理", archive: "已归档" }), "processing");
  assert.equal(getRecordingDestination({ status: "处理失败", archive: "已归档" }), "processing");
  assert.equal(getRecordingDestination({ status: "可查看", archive: "已归档" }), "detail");
});

test("recording job polling stops when processing completes", async () => {
  const statuses = ["running", "running", "completed"] as const;
  let index = 0;
  const result = await waitForRecordingJob(
    async () => ({ status: statuses[index++] }),
    "job-1",
    { delay: async () => undefined, maxAttempts: 5 },
  );

  assert.equal(result.status, "completed");
  assert.equal(index, 3);
});

test("recording job polling returns failed jobs without extra requests", async () => {
  let calls = 0;
  const result = await waitForRecordingJob(
    async () => {
      calls += 1;
      return { status: "failed" as const };
    },
    "job-2",
    { delay: async () => undefined, maxAttempts: 5 },
  );

  assert.equal(result.status, "failed");
  assert.equal(calls, 1);
});

test("recording processing requires an available original audio file", () => {
  assert.equal(recordingAudioCanProcess("剩余 13 天"), true);
  assert.equal(recordingAudioCanProcess("未上传原始录音"), false);
  assert.equal(recordingAudioCanProcess("原始录音已销毁"), false);
  assert.equal(recordingAudioCanProcess("等待销毁"), false);
});

test("recording tile resolves to the session recording before attachments", () => {
  const recordings = [
    { id: "recording-4", sessionId: "session-4", status: "可查看", archive: "已归档" },
    { id: "recording-5", sessionId: "session-5", status: "可查看", archive: "已归档" },
  ];

  assert.equal(findRecordingForSession(recordings, "session-5")?.id, "recording-5");
  assert.equal(findRecordingForSession(recordings, "missing"), null);
});

test("archived recording content requires the matching profile page unlock", () => {
  assert.equal(recordingDetailRequiresProfileUnlock({
    destination: "detail",
    profileName: "陈雨",
    kindLabel: "来访者",
  }), true);
  assert.equal(recordingDetailRequiresProfileUnlock({
    destination: "archive",
    profileName: null,
    kindLabel: null,
  }), false);
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
