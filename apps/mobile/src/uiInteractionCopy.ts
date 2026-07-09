export type ChatBubbleRole = "user" | "assistant";
export type ChatBubbleAlign = "left" | "right";

export type CalendarSettingState = {
  systemCalendarEnabled: boolean;
  privacyTitleModeEnabled: boolean;
};

export function chatBubbleAlignForRole(role: ChatBubbleRole): ChatBubbleAlign {
  return role === "user" ? "right" : "left";
}

export function recordSectionCountLabel(count: number): string {
  return `${count} 段`;
}

export function calendarSettingSummary(settings: CalendarSettingState): {
  calendarSync: string;
  privacyTitle: string;
} {
  return {
    calendarSync: settings.systemCalendarEnabled ? "日历同步已开启" : "日历同步未开启",
    privacyTitle: settings.privacyTitleModeEnabled ? "隐私标题已开启" : "隐私标题已关闭",
  };
}

export function caseReportDownloadNotice(platform: string, formal: boolean): string {
  const version = formal ? "正式版" : "草稿";
  if (platform === "web") {
    return `个案报告${version}已开始下载；如果被浏览器拦截，请允许此站点下载。`;
  }
  return `个案报告${version}已保存到应用目录，并已打开系统分享面板。`;
}
