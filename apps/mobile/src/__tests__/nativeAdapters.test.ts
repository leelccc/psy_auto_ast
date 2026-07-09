import assert from "node:assert/strict";
import { test } from "node:test";

import {
  createAudioRecordingController,
  createExpoAudioDriver,
  recordingMimeType,
  toRecordedLocalFile,
} from "../native/audioRecording";
import { systemCalendarTitle, syncCalendarEvent } from "../native/calendarSync";
import { mapDocumentPickerResult } from "../native/filePicker";
import { downloadAndShareFile, uploadLocalFile } from "../native/fileTransfer";


test("document picker maps one real local file and preserves cancellation", () => {
  assert.equal(mapDocumentPickerResult({ canceled: true, assets: null }), null);
  assert.deepEqual(mapDocumentPickerResult({
    canceled: false,
    assets: [{
      uri: "file:///cache/report.pdf",
      name: "report.pdf",
      mimeType: "application/pdf",
      size: 2048,
      lastModified: 0,
    }],
  }), {
    uri: "file:///cache/report.pdf",
    name: "report.pdf",
    mimeType: "application/pdf",
    sizeBytes: 2048,
    webFile: undefined,
  });
});


test("file upload sends the selected bytes directly to the presigned URL", async () => {
  const calls: Array<{ url: string; init: RequestInit }> = [];
  await uploadLocalFile(
    {
      uri: "file:///cache/report.pdf",
      name: "report.pdf",
      mimeType: "application/pdf",
      sizeBytes: 7,
    },
    "https://minio.test/upload",
    { "Content-Type": "application/pdf" },
    {
      readBody: async () => new Blob(["content"], { type: "application/pdf" }),
      fetch: async (url, init) => {
        calls.push({ url: String(url), init: init ?? {} });
        return new Response(null, { status: 200 });
      },
    },
  );

  assert.equal(calls[0].url, "https://minio.test/upload");
  assert.equal(calls[0].init.method, "PUT");
  assert.equal(new Headers(calls[0].init.headers).get("Content-Type"), "application/pdf");
});


test("web file download uses a blob URL instead of navigating the current app page", async () => {
  const clicks: string[] = [];
  const appended: unknown[] = [];
  const fakeDocument = {
    body: {
      appendChild: (node: unknown) => appended.push(node),
    },
    createElement: () => ({
      download: "",
      href: "",
      rel: "",
      style: { display: "" },
      click() {
        clicks.push(this.href);
      },
      remove() {},
    }),
  } as unknown as Document;

  const result = await downloadAndShareFile(
    "https://minio.test/report.pdf?signature=1",
    "case/report.pdf",
    "application/pdf",
    {
      document: fakeDocument,
      fetch: async () => new Response(new Blob(["pdf"], { type: "application/pdf" }), { status: 200 }),
      createObjectUrl: () => "blob:download-report",
      revokeObjectUrl: () => {},
      openWindow: () => {
        throw new Error("should not open a new tab when blob download succeeds");
      },
    },
  );

  assert.equal(result, "blob:download-report");
  assert.equal(appended.length, 1);
  assert.deepEqual(clicks, ["blob:download-report"]);
});


test("calendar sync uses privacy title and updates an existing system event", async () => {
  const calls: string[] = [];
  const driver = {
    ensureWritableCalendar: async () => "calendar-1",
    createEvent: async (_calendarId: string, title: string) => {
      calls.push(`create:${title}`);
      return "event-new";
    },
    updateEvent: async (eventId: string, title: string) => {
      calls.push(`update:${eventId}:${title}`);
      return eventId;
    },
    deleteEvent: async (eventId: string) => {
      calls.push(`delete:${eventId}`);
    },
  };
  const event = {
    title: "陈雨 · 第7次咨询",
    privacyTitle: "咨询提醒",
    startAt: "2026-06-20T02:00:00Z",
    endAt: "2026-06-20T02:50:00Z",
  };

  assert.equal(systemCalendarTitle(event, true), "咨询提醒");
  assert.equal(await syncCalendarEvent(driver, event, {
    privacyTitleMode: true,
    existingSystemEventId: "event-1",
  }), "event-1");
  assert.deepEqual(calls, ["update:event-1:咨询提醒"]);
});


test("audio controller reports permission, pause, resume and final local file", async () => {
  const calls: string[] = [];
  const controller = createAudioRecordingController({
    requestPermission: async () => true,
    prepare: async () => {
      calls.push("prepare");
    },
    start: () => calls.push("start"),
    pause: () => calls.push("pause"),
    stop: async () => {
      calls.push("stop");
      return {
        uri: "file:///cache/recording.m4a",
        durationMillis: 4200,
        mimeType: "audio/mp4" as const,
      };
    },
  });

  await controller.start();
  controller.pause();
  controller.resume();
  const result = await controller.stop();

  assert.deepEqual(calls, ["prepare", "start", "pause", "start", "stop"]);
  assert.deepEqual(result, {
    uri: "file:///cache/recording.m4a",
    durationSeconds: 5,
    mimeType: "audio/mp4",
  });
});


test("expo audio driver uses the lifecycle-managed recorder and web MIME type", async () => {
  const calls: string[] = [];
  let durationMillis = 3200;
  const recorder = {
    uri: "blob:http://localhost/recording",
    record: () => calls.push("record"),
    pause: () => calls.push("pause"),
    stop: async () => {
      calls.push("stop");
      durationMillis = 0;
    },
    prepareToRecordAsync: async () => {
      calls.push("prepare");
    },
    getStatus: () => ({ durationMillis }),
  };
  const driver = createExpoAudioDriver(
    recorder,
    "audio/webm",
    async () => ({
      requestRecordingPermissionsAsync: async () => ({ granted: true }),
      setAudioModeAsync: async () => {
        calls.push("mode");
      },
    }),
  );

  assert.equal(await driver.requestPermission(), true);
  await driver.prepare();
  driver.start();
  driver.pause();
  const result = await driver.stop();

  assert.deepEqual(calls, ["mode", "prepare", "record", "pause", "stop"]);
  assert.deepEqual(result, {
    uri: "blob:http://localhost/recording",
    durationMillis: 3200,
    mimeType: "audio/webm",
  });
  assert.equal(recordingMimeType("web"), "audio/webm");
  assert.equal(recordingMimeType("ios"), "audio/mp4");
});


test("web recording blob is prepared for direct MinIO upload without expo file system", async () => {
  const blob = new Blob(["webm-bytes"], { type: "audio/webm" });
  const webFile = { size: blob.size } as File;

  const result = await toRecordedLocalFile(
    {
      uri: "blob:http://localhost/recording",
      durationSeconds: 4,
      mimeType: "audio/webm",
    },
    "web",
    {
      readWebBlob: async () => blob,
      createWebFile: () => webFile,
      readNativeFile: async () => {
        throw new Error("native file system must not be used on web");
      },
    },
  );

  assert.deepEqual(result, {
    uri: "blob:http://localhost/recording",
    name: "recording.webm",
    mimeType: "audio/webm",
    sizeBytes: blob.size,
    webFile,
  });
});
