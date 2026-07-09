import assert from "node:assert/strict";
import { test } from "node:test";

import { ApiClient, ApiError } from "../api/apiClient";


test("api client attaches demo authentication and maps successful JSON", async () => {
  let authorization = "";
  const client = new ApiClient("http://api.test/api/v1", async (_input, init) => {
    authorization = new Headers(init?.headers).get("Authorization") ?? "";
    return new Response(JSON.stringify({ status: "ok" }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  });

  assert.deepEqual(await client.get("/health"), { status: "ok" });
  assert.equal(authorization, "Bearer demo-token");
});

test("api client invokes browser-like fetch without rebinding its receiver", async () => {
  let receiver: unknown = "not-called";
  function browserLikeFetch(this: unknown) {
    receiver = this;
    return Promise.resolve(new Response(JSON.stringify({ ok: true }), { status: 200 }));
  }
  const client = new ApiClient(
    "http://api.test/api/v1",
    browserLikeFetch as unknown as typeof fetch,
  );

  await client.get("/health");

  assert.equal(receiver, undefined);
});

test("api client maps backend error envelope to a typed error", async () => {
  const client = new ApiClient("http://api.test/api/v1", async () => new Response(JSON.stringify({
    error: { code: "profile_not_found", message: "档案不存在。" },
  }), {
    status: 404,
    headers: { "Content-Type": "application/json" },
  }));

  await assert.rejects(
    () => client.get("/profiles/missing"),
    (error: unknown) => error instanceof ApiError
      && error.status === 404
      && error.code === "profile_not_found"
      && error.message === "档案不存在。",
  );
});

test("api client handles non-json server failures without throwing a parser error", async () => {
  const client = new ApiClient(
    "http://api.test/api/v1",
    async () => new Response("Service Unavailable", { status: 503 }),
  );

  await assert.rejects(
    () => client.get("/profiles"),
    (error: unknown) => error instanceof ApiError
      && error.status === 503
      && error.code === "request_failed",
  );
});

test("delete requests can carry explicit destructive confirmation", async () => {
  let requestBody = "";
  const client = new ApiClient("http://api.test/api/v1", async (_input, init) => {
    requestBody = String(init?.body);
    return new Response(JSON.stringify({ deleted: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  });

  await client.delete("/sessions/session-1", { confirmation_text: "删除记录" });

  assert.equal(requestBody, JSON.stringify({ confirmation_text: "删除记录" }));
});

test("api client injects a reusable profile page grant", async () => {
  let grant = "";
  const client = new ApiClient("http://api.test/api/v1", async (_input, init) => {
    grant = new Headers(init?.headers).get("X-Profile-Access-Grant") ?? "";
    return new Response(JSON.stringify({ items: [] }), { status: 200 });
  });
  client.setProfileAccessGrant("page-grant");

  await client.get("/profiles/profile-1/sessions");

  assert.equal(grant, "page-grant");
});

test("api client rotates tokens once after a 401 response", async () => {
  const seen: string[] = [];
  const tokenChanges: Array<[string, string | null]> = [];
  const client = new ApiClient("http://api.test/api/v1", async (input, init) => {
    const url = String(input);
    seen.push(url);
    if (url.endsWith("/auth/refresh")) {
      return new Response(JSON.stringify({
        access_token: "new-access",
        refresh_token: "new-refresh",
        token_type: "bearer",
        expires_in: 1800,
      }), { status: 200 });
    }
    const authorization = new Headers(init?.headers).get("Authorization");
    return authorization === "Bearer new-access"
      ? new Response(JSON.stringify({ id: "me" }), { status: 200 })
      : new Response(JSON.stringify({ error: { code: "access_token_invalid", message: "expired" } }), { status: 401 });
  }, "old-access");
  client.setTokenChangeHandler((accessToken, refreshToken) => {
    tokenChanges.push([accessToken, refreshToken]);
  });
  client.setTokens("old-access", "old-refresh");

  assert.deepEqual(await client.get("/me"), { id: "me" });
  assert.deepEqual(tokenChanges, [
    ["old-access", "old-refresh"],
    ["new-access", "new-refresh"],
  ]);
  assert.deepEqual(seen, [
    "http://api.test/api/v1/me",
    "http://api.test/api/v1/auth/refresh",
    "http://api.test/api/v1/me",
  ]);
});
