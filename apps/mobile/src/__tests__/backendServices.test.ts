import assert from "node:assert/strict";
import { test } from "node:test";

import { mapBackendAttachment, mapBackendProfileAttachment } from "../api/attachmentService";
import type { ApiClient } from "../api/apiClient";
import { createProfileService, formatNextSession, mapBackendProfile } from "../api/profileService";
import { mapBackendSession } from "../api/sessionService";


test("backend profile response maps to the existing profile card model", () => {
  assert.deepEqual(mapBackendProfile({
    id: "profile-chen-yu",
    type: "client",
    name: "陈雨",
    code: "A08",
    status: "active",
    crisis_level: "mild",
    initial_session_count: 4,
    session_count: 2,
    latest_sequence: 6,
    next_session_at: null,
    metadata: {
      gender: "female",
      first_visit_complaint: "睡眠受影响",
    },
  }), {
    id: "profile-chen-yu",
    displayCode: "A08",
    name: "陈雨",
    type: "来访者",
    count: "第6次",
    countDetail: "系统内 2 条 · 约定 4 次",
    sessionCount: 2,
    initialSessionCount: 4,
    latestSequence: 6,
    status: "进行中",
    risk: "轻度",
    crisisLevel: "mild",
    gender: "female",
    firstVisitComplaint: "睡眠受影响",
    next: "未设置",
  });
});

test("backend profile mapping explains existing sequence gaps", () => {
  assert.deepEqual(mapBackendProfile({
    id: "profile-wang-lan",
    type: "supervisor",
    name: "王澜",
    code: "S07",
    status: "active",
    crisis_level: null,
    initial_session_count: 2,
    session_count: 2,
    latest_sequence: 4,
    next_session_at: null,
  }), {
    id: "profile-wang-lan",
    displayCode: "S07",
    name: "王澜",
    type: "督导师",
    count: "第4次",
    countDetail: "系统内 2 条 · 约定 2 次",
    sessionCount: 2,
    initialSessionCount: 2,
    latestSequence: 4,
    status: "进行中",
    risk: "未评估",
    next: "未设置",
  });
});

test("backend profile mapping does not expose internal ids as display codes", () => {
  const profile = mapBackendProfile({
    id: "ce0654b5-08aa-418e-9f0e-7fdf01d8faa9",
    type: "client",
    name: "匿名来访者",
    code: null,
    status: "active",
    crisis_level: null,
    initial_session_count: 0,
    latest_sequence: 0,
    next_session_at: null,
  });

  assert.equal(profile.displayCode, undefined);
});

test("backend profile mapping keeps configured frequency", () => {
  const profile = mapBackendProfile({
    id: "profile-frequency",
    type: "client",
    name: "老弟",
    code: "C26-001",
    status: "active",
    crisis_level: null,
    initial_session_count: 0,
    latest_sequence: 0,
    next_session_at: null,
    metadata: { frequency: "双周" },
  });

  assert.equal(profile.frequency, "双周");
  assert.equal(profile.next, "未设置");
});

test("profile creation sends role-specific fields to the backend", async () => {
  let requestBody: unknown = null;
  const service = createProfileService({
    post: async (_path: string, body: unknown) => {
      requestBody = body;
      return {
        id: "profile-new",
        type: "client",
        name: "林清",
        code: "C26-001",
        status: "active",
        crisis_level: "mild",
        initial_session_count: 3,
        latest_sequence: 3,
        next_session_at: null,
      };
    },
  } as unknown as ApiClient);

  await service.create({
    type: "client",
    name: "林清",
    code: "C26-001",
    status: "active",
    crisisLevel: "mild",
    initialSessionCount: 3,
    metadata: { gender: "female", first_visit_complaint: "睡眠受影响" },
    notes: "先电话联系",
  });

  assert.deepEqual(requestBody, {
    type: "client",
    name: "林清",
    code: "C26-001",
    status: "active",
    crisis_level: "mild",
    initial_session_count: 3,
    next_session_at: undefined,
    metadata: { gender: "female", first_visit_complaint: "睡眠受影响" },
    notes: "先电话联系",
  });
});

test("profile update sends next session time to backend", async () => {
  let requestBody: unknown = null;
  const service = createProfileService({
    patch: async (_path: string, body: unknown) => {
      requestBody = body;
      return {
        id: "profile-new",
        type: "client",
        name: "林清",
        code: "C26-001",
        status: "active",
        crisis_level: "mild",
        initial_session_count: 3,
        latest_sequence: 3,
        next_session_at: "2026-07-14T09:30:10+08:00",
        metadata: { frequency: "每周" },
      };
    },
  } as unknown as ApiClient);

  const updated = await service.update("profile-new", {
    nextSessionAt: "2026-07-14T09:30:10+08:00",
  });

  assert.equal(updated.nextSessionAt, "2026-07-14T09:30:10+08:00");
  assert.deepEqual(requestBody, { next_session_at: "2026-07-14T09:30:10+08:00" });
});

test("profile update sends editable basic profile fields to backend", async () => {
  let requestBody: unknown = null;
  const service = createProfileService({
    patch: async (_path: string, body: unknown) => {
      requestBody = body;
      return {
        id: "profile-new",
        type: "client",
        name: "林清",
        code: "C26-001",
        status: "paused",
        crisis_level: "moderate",
        initial_session_count: 8,
        session_count: 1,
        latest_sequence: 1,
        next_session_at: null,
        metadata: { frequency: "双周", gender: "female", first_visit_complaint: "适应困难" },
      };
    },
  } as unknown as ApiClient);

  const updated = await service.update("profile-new", {
    status: "paused",
    crisisLevel: "moderate",
    initialSessionCount: 8,
    metadata: { gender: "female", first_visit_complaint: "适应困难" },
    frequency: "双周",
  });

  assert.equal(updated.crisisLevel, "moderate");
  assert.equal(updated.firstVisitComplaint, "适应困难");
  assert.deepEqual(requestBody, {
    status: "paused",
    crisis_level: "moderate",
    initial_session_count: 8,
    metadata: { gender: "female", first_visit_complaint: "适应困难", frequency: "双周" },
  });
});


test("backend session response maps without frontend sequence generation", () => {
  const session = mapBackendSession({
    id: "session-chen-7",
    profile_id: "profile-chen-yu",
    session_type: "counseling",
    sequence_no: 7,
    occurred_at: "2026-06-09T18:00:00+08:00",
    summary: "后端记录",
    tags: ["跟进"],
    record_status: "draft",
  });
  assert.equal(session.sequence, 7);
  assert.equal(session.record, "草稿");
});

test("next session formatter marks past dates as overdue", () => {
  assert.equal(
    formatNextSession("2026-06-10T23:08:00+08:00", new Date("2026-06-19T12:00:00+08:00")),
    "已过期 6月10日 23:08",
  );
  assert.equal(
    formatNextSession("2026-06-20T09:30:00+08:00", new Date("2026-06-19T12:00:00+08:00")),
    "6月20日 09:30",
  );
});

test("attachment response exposes file id but never a storage key", () => {
  const material = mapBackendAttachment({
    id: "attachment-1",
    owner_type: "session",
    owner_id: "session-chen-6",
    category: "scale",
    replace_group_key: null,
    is_current: true,
    analysis_status: "pending",
    file: {
      file_id: "file-1",
      filename: "SAS.pdf",
      mime_type: "application/pdf",
      size_bytes: 2048,
      upload_status: "uploaded",
      can_long_term_preserve: true,
      expires_at: null,
    },
  });

  assert.equal(material.file.fileId, "file-1");
  assert.equal("storageKey" in material.file, false);
});

test("profile attachment maps its backend category and uploaded file", () => {
  const attachment = mapBackendProfileAttachment({
    id: "attachment-consent",
    owner_type: "profile",
    owner_id: "profile-1",
    category: "consent",
    replace_group_key: "consent",
    is_current: true,
    analysis_status: "pending",
    file: {
      file_id: "file-consent",
      filename: "知情同意书.pdf",
      mime_type: "application/pdf",
      size_bytes: 2048,
      upload_status: "uploaded",
      can_long_term_preserve: true,
      expires_at: null,
    },
  });

  assert.equal(attachment.category, "consent");
  assert.equal(attachment.file.fileId, "file-consent");
});
