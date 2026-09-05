import assert from "node:assert/strict";
import { test } from "node:test";

import { ApiClient } from "../api/apiClient";
import { createAuthService } from "../api/authService";
import { createCalendarService } from "../api/calendarService";
import { createJobService } from "../api/jobService";
import { createPrivacyService } from "../api/privacyService";
import { createRecordingService } from "../api/recordingService";
import { createReportService } from "../api/reportService";
import { createSupervisionService } from "../api/supervisionService";


function clientWithRoutes(
  routes: Record<string, unknown>,
  requests: Array<{ method: string; path: string; body: unknown }> = [],
) {
  return new ApiClient("http://api.test/api/v1", async (input, init) => {
    const path = String(input).replace("http://api.test/api/v1", "");
    requests.push({
      method: init?.method ?? "GET",
      path,
      body: init?.body ? JSON.parse(String(init.body)) : null,
    });
    const payload = routes[`${init?.method ?? "GET"} ${path}`];
    return new Response(JSON.stringify(payload ?? {}), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  });
}


test("recording service keeps backend ids and archive status", async () => {
  const client = clientWithRoutes({
    "GET /recordings": {
      items: [{
        id: "recording-1",
        title: "6月9日咨询",
        source_type: "uploaded_audio",
        duration_seconds: 125,
        archive_status: "unarchived",
        ai_status: "pending",
        processing_error: null,
        audio_file_id: "file-1",
        audio_expires_at: "2026-06-23T10:00:00Z",
        audio_destroyed_at: null,
        session: null,
        profile: null,
        created_at: "2026-06-09T10:00:00Z",
        updated_at: "2026-06-09T10:00:00Z",
      }],
      total: 1,
      page: 1,
      page_size: 20,
    },
  });

  const result = await createRecordingService(client).list();

  assert.equal(result.items[0].id, "recording-1");
  assert.equal(result.items[0].durationSeconds, 125);
  assert.equal(result.items[0].archiveStatus, "unarchived");
});


test("recording service maps duration statistics", async () => {
  const client = clientWithRoutes({
    "GET /recording-duration-statistics": {
      total_seconds: 3720,
      items: [
        { profile_type: "client", count: 2, duration_seconds: 3600 },
        { profile_type: null, count: 1, duration_seconds: 120 },
      ],
    },
  });

  const result = await createRecordingService(client).durationStatistics();

  assert.equal(result.totalSeconds, 3720);
  assert.deepEqual(result.items, [
    { profileType: "client", count: 2, durationSeconds: 3600 },
    { profileType: null, count: 1, durationSeconds: 120 },
  ]);
});


test("recording service maps and reorders recording segments", async () => {
  const requests: Array<{ method: string; path: string; body: unknown }> = [];
  const backendRecording = {
    id: "recording-1",
    title: "多片段咨询",
    source_type: "uploaded_audio",
    duration_seconds: 180,
    archive_status: "archived",
    ai_status: "pending",
    processing_error: null,
    audio_file_id: null,
    audio_expires_at: "2026-06-23T10:00:00Z",
    audio_destroyed_at: null,
    segments: [{
      id: "segment-1",
      file_id: "file-1",
      segment_index: 1,
      filename: "第一段.m4a",
      duration_seconds: 180,
      size_bytes: 1024,
      status: "uploaded",
      processing_error: null,
      expires_at: "2026-06-23T10:00:00Z",
      destroyed_at: null,
    }],
    session: null,
    profile: null,
    created_at: "2026-06-09T10:00:00Z",
    updated_at: "2026-06-09T10:00:00Z",
  };
  const client = clientWithRoutes({
    "PUT /recordings/recording-1/segments/reorder": backendRecording,
  }, requests);

  const result = await createRecordingService(client).reorderSegments("recording-1", ["segment-1"]);

  assert.equal(result.segments[0].filename, "第一段.m4a");
  assert.equal(result.segments[0].expiresAt, "2026-06-23T10:00:00Z");
  assert.deepEqual(requests[0], {
    method: "PUT",
    path: "/recordings/recording-1/segments/reorder",
    body: { segment_ids: ["segment-1"] },
  });
});


test("account profile updates are sent to the authenticated backend user", async () => {
  const requests: Array<{ method: string; path: string; body: unknown }> = [];
  const client = clientWithRoutes({
    "PATCH /me": {
      id: "user-1",
      email: "demo@example.com",
      display_name: "林咨询师",
      created_at: "2026-06-09T10:00:00Z",
      updated_at: "2026-06-13T10:00:00Z",
    },
  }, requests);

  const user = await createAuthService(client).updateMe("林咨询师");

  assert.equal(user.display_name, "林咨询师");
  assert.deepEqual(requests[0], {
    method: "PATCH",
    path: "/me",
    body: { display_name: "林咨询师" },
  });
});

test("phone auth service uses the dedicated phone endpoints and payloads", async () => {
  const requests: Array<{ method: string; path: string; body: unknown }> = [];
  const tokens = {
    access_token: "access-phone",
    refresh_token: "refresh-phone",
    token_type: "bearer",
    expires_in: 900,
  };
  const client = clientWithRoutes({
    "POST /auth/phone/verification-code": { sent: true, expire_seconds: 600, retry_seconds: 60 },
    "POST /auth/phone/login-code": tokens,
  }, requests);
  const service = createAuthService(client);

  await service.sendPhoneCode("13800138000", "login");
  await service.loginPhoneWithCode("13800138000", "123456");

  assert.deepEqual(requests.slice(0, 2), [
    {
      method: "POST",
      path: "/auth/phone/verification-code",
      body: { phone: "13800138000", purpose: "login" },
    },
    {
      method: "POST",
      path: "/auth/phone/login-code",
      body: { phone: "13800138000", code: "123456" },
    },
  ]);
});


test("report, privacy and job services preserve command payloads", async () => {
  const requests: Array<{ method: string; path: string; body: unknown }> = [];
  const client = clientWithRoutes({
    "POST /reports/generate": { job_id: "job-report", draft_report_id: "report-1" },
    "POST /privacy/resources/resource-1/authorize-long-term": {
      id: "resource-1",
      resource_type: "report",
      resource_id: "report-1",
      display_name: "个案报告",
      owner_type: "profile",
      owner_id: "profile-1",
      origin_at: "2026-06-09T10:00:00Z",
      expires_at: "2026-06-23T10:00:00Z",
      can_long_term_preserve: true,
      long_term_authorized_at: "2026-06-09T10:01:00Z",
      long_term_revoked_at: null,
      destroyed_at: null,
    },
    "GET /ai-jobs/job-report": {
      id: "job-report",
      job_type: "report_generation",
      target_type: "report",
      target_id: "report-1",
      status: "completed",
      progress: 100,
      result_summary: {},
      error: null,
      created_at: "2026-06-09T10:00:00Z",
      started_at: "2026-06-09T10:00:00Z",
      finished_at: "2026-06-09T10:00:01Z",
    },
    "DELETE /privacy/resources/resource-1": { deleted: true },
  }, requests);

  const generated = await createReportService(client).generate({
    reportType: "case_report",
    profileId: "profile-1",
    selectedSources: [{ resourceType: "profile", resourceId: "profile-1" }],
  });
  const authorized = await createPrivacyService(client).authorize("resource-1");
  const deleted = await createPrivacyService(client).delete("resource-1");
  const job = await createJobService(client).get("job-report");

  assert.equal(generated.reportId, "report-1");
  assert.equal(authorized.longTermAuthorizedAt, "2026-06-09T10:01:00Z");
  assert.equal(job.status, "completed");
  assert.equal(deleted.deleted, true);
  assert.deepEqual(requests[0].body, {
    report_type: "case_report",
    profile_id: "profile-1",
    selected_sources: [{ resource_type: "profile", resource_id: "profile-1" }],
    confirm_overwrite_draft: false,
  });
  assert.deepEqual(
    requests.find((request) => request.method === "DELETE")?.body,
    { confirmation_text: "删除资料" },
  );
});


test("calendar and supervision services expose mobile sync fields and citations", async () => {
  const requests: Array<{ method: string; path: string; body: unknown }> = [];
  const client = clientWithRoutes({
    "GET /calendar/events": {
      items: [{
        id: "event-1",
        title: "陈雨 · 下次咨询",
        privacy_title: "咨询提醒",
        display_title: "咨询提醒",
        category: "counseling",
        source_type: "profile_next_session",
        start_at: "2026-06-20T02:00:00Z",
        end_at: "2026-06-20T02:50:00Z",
        profile_id: "profile-1",
        session_id: null,
        status: "pending",
        sync_to_system_calendar: true,
        system_calendar_event_id: "ios-1",
        created_at: "2026-06-09T10:00:00Z",
        updated_at: "2026-06-09T10:00:00Z",
      }],
    },
    "POST /supervision/conversations": {
      id: "conversation-1",
      title: "新督导会话",
      expires_at: "2026-06-23T10:00:00Z",
      created_at: "2026-06-09T10:00:00Z",
      updated_at: "2026-06-09T10:00:00Z",
    },
    "POST /supervision/conversations/conversation-1/messages": {
      user_message_id: "message-user",
      assistant_message_id: "message-ai",
      job_id: "job-supervision",
      risk_prompt: null,
    },
    "GET /supervision/conversations/conversation-1": {
      id: "conversation-1",
      title: "新督导会话",
      expires_at: "2026-06-23T10:00:00Z",
      context_refs: [],
      messages: [{
        id: "message-ai",
        role: "assistant",
        content: "建议先明确本次督导问题。",
        generation_status: "completed",
        citations: [{ resource_type: "report", resource_id: "report-1", label: "个案报告" }],
        created_at: "2026-06-09T10:00:01Z",
      }],
      created_at: "2026-06-09T10:00:00Z",
      updated_at: "2026-06-09T10:00:01Z",
    },
    "DELETE /supervision/conversations/conversation-1": { deleted: true },
  }, requests);

  const event = (await createCalendarService(client).listEvents()).items[0];
  const supervision = createSupervisionService(client);
  const conversation = await supervision.createConversation("新督导会话");
  const reply = await supervision.sendMessage(conversation.id, "如何准备督导？");
  const deleted = await supervision.deleteConversation(conversation.id);

  assert.equal(event.sourceType, "profile_next_session");
  assert.equal(event.systemCalendarEventId, "ios-1");
  assert.equal(reply.assistantMessage.citations[0].label, "个案报告");
  assert.equal(deleted.deleted, true);
  assert.deepEqual(
    requests.find((request) => request.path.endsWith("/messages"))?.body,
    { content: "如何准备督导？" },
  );
  assert.equal(
    requests.find((request) => request.method === "DELETE")?.path,
    "/supervision/conversations/conversation-1",
  );
});
