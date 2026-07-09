import assert from "node:assert/strict";
import { test } from "node:test";

import { ApiClient } from "../api/apiClient";
import { createProfileAccessService } from "../api/profileAccessService";

test("profile access settings expose grant duration options", async () => {
  const client = new ApiClient("http://api.test/api/v1", async (input, init) => {
    const url = String(input);
    if (url.endsWith("/profile-access-passwords") && init?.method !== "PATCH") {
      return new Response(JSON.stringify({
        items: [{ profile_type: "client", is_set: true }],
        grant_minutes: 60,
        grant_options: [30, 60, 120],
      }), { status: 200 });
    }
    if (url.endsWith("/profile-access-passwords/settings")) {
      return new Response(JSON.stringify({
        grant_minutes: 120,
        grant_options: [30, 60, 120],
      }), { status: 200 });
    }
    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  });
  const service = createProfileAccessService(client);

  const status = await service.statuses();
  assert.equal(status.grantMinutes, 60);
  assert.deepEqual(status.grantOptions, [30, 60, 120]);

  const updated = await service.updateSettings({ grantMinutes: 120 });
  assert.equal(updated.grantMinutes, 120);
});

test("profile access grant remains reusable after leaving a profile before expiry", async () => {
  const grants: string[] = [];
  const client = new ApiClient("http://api.test/api/v1", async (input, init) => {
    const url = String(input);
    grants.push(new Headers(init?.headers).get("X-Profile-Access-Grant") ?? "");
    if (url.endsWith("/profile-access-passwords/client/verify")) {
      return new Response(JSON.stringify({
        profile_access_grant: "client-grant",
        expires_in_seconds: 1800,
      }), { status: 200 });
    }
    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  });
  const service = createProfileAccessService(client);

  await service.verify("client", "123456");
  service.leaveProfile();
  await client.get("/profiles/profile-1/sessions");

  assert.deepEqual(grants, ["", "client-grant"]);
});

test("profile access grant is reusable only for the verified profile type", async () => {
  const client = new ApiClient("http://api.test/api/v1", async () => (
    new Response(JSON.stringify({
      profile_access_grant: "client-grant",
      expires_in_seconds: 1800,
    }), { status: 200 })
  ));
  const service = createProfileAccessService(client);

  assert.equal(service.hasActiveGrant("client"), false);
  await service.verify("client", "123456");

  assert.equal(service.hasActiveGrant("client"), true);
  assert.equal(service.hasActiveGrant("supervisor"), false);
});

test("expired profile access grant is cleared before reuse", async () => {
  const grants: string[] = [];
  const client = new ApiClient("http://api.test/api/v1", async (input, init) => {
    const url = String(input);
    grants.push(new Headers(init?.headers).get("X-Profile-Access-Grant") ?? "");
    if (url.endsWith("/profile-access-passwords/client/verify")) {
      return new Response(JSON.stringify({
        profile_access_grant: "expired-grant",
        expires_in_seconds: -1,
      }), { status: 200 });
    }
    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  });
  const service = createProfileAccessService(client);

  await service.verify("client", "123456");
  assert.equal(service.hasActiveGrant("client"), false);
  await client.get("/profiles/profile-1/sessions");

  assert.deepEqual(grants, ["", ""]);
});
