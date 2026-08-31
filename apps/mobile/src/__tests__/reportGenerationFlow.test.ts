import assert from "node:assert/strict";
import test from "node:test";

import {
  keepReportGenerationLoadError,
  retryReportGenerationLoad,
} from "../reportGenerationFlow";

test("report generation load failure stays on the destination page with a retryable error", () => {
  const pending = {
    sessionId: "session-1",
    mode: "create" as const,
    sources: [],
    loading: true,
  };

  const failed = keepReportGenerationLoadError(
    pending,
    { sessionId: "session-1", mode: "create" },
    "网络连接失败",
  );

  assert.deepEqual(failed, {
    ...pending,
    loading: false,
    loadError: "网络连接失败",
  });
  assert.deepEqual(retryReportGenerationLoad(failed), {
    ...pending,
    loading: true,
    loadError: undefined,
  });
});

test("stale generation load failure cannot overwrite the current destination", () => {
  const current = {
    sessionId: "session-2",
    mode: "create" as const,
    sources: [],
    loading: true,
  };

  assert.equal(
    keepReportGenerationLoadError(
      current,
      { sessionId: "session-1", mode: "create" },
      "旧请求失败",
    ),
    current,
  );
});
