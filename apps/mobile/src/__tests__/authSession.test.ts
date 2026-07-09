import assert from "node:assert/strict";
import test from "node:test";

import { createAuthSessionStore } from "../authSession";

test("auth session store saves, loads and clears token pairs", async () => {
  const values = new Map<string, string>();
  const store = createAuthSessionStore({
    get: async (key) => values.get(key) ?? null,
    set: async (key, value) => {
      values.set(key, value);
    },
    remove: async (key) => {
      values.delete(key);
    },
  });

  await store.save({
    access_token: "access",
    refresh_token: "refresh",
    token_type: "bearer",
    expires_in: 1800,
  });

  assert.deepEqual(await store.load(), {
    accessToken: "access",
    refreshToken: "refresh",
  });

  await store.clear();
  assert.equal(await store.load(), null);
});

test("auth session store discards malformed persisted data", async () => {
  let stored: string | null = "{broken";
  const store = createAuthSessionStore({
    get: async () => stored,
    set: async (_key, value) => {
      stored = value;
    },
    remove: async () => {
      stored = null;
    },
  });

  assert.equal(await store.load(), null);
  assert.equal(stored, null);
});
