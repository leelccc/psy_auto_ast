import assert from "node:assert/strict";
import { test } from "node:test";

import {
  calendarSettingSummary,
  caseReportDownloadNotice,
  chatBubbleAlignForRole,
  recordSectionCountLabel,
} from "../uiInteractionCopy";

test("chat bubbles follow common messaging direction", () => {
  assert.equal(chatBubbleAlignForRole("user"), "right");
  assert.equal(chatBubbleAlignForRole("assistant"), "left");
});

test("record editor section count reflects actual content", () => {
  assert.equal(recordSectionCountLabel(5), "5 段");
  assert.equal(recordSectionCountLabel(0), "0 段");
});

test("calendar settings summary reflects actual toggles", () => {
  assert.deepEqual(calendarSettingSummary({
    systemCalendarEnabled: true,
    privacyTitleModeEnabled: false,
  }), {
    calendarSync: "日历同步已开启",
    privacyTitle: "隐私标题已关闭",
  });
});

test("case report download notice uses web-specific copy", () => {
  assert.equal(
    caseReportDownloadNotice("web", false),
    "个案报告草稿已开始下载；如果被浏览器拦截，请允许此站点下载。",
  );
  assert.equal(
    caseReportDownloadNotice("ios", true),
    "个案报告正式版已保存到应用目录，并已打开系统分享面板。",
  );
});
