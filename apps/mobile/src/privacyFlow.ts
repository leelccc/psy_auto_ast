export type PrivacyResource = {
  title: string;
  type: string;
  expires: string;
  preservable: boolean;
};

export function getAuthorizableResources<T extends PrivacyResource>(resources: T[]): T[] {
  return resources.filter((resource) => resource.preservable);
}

export function mergeAuthorizedResources(current: string[], selected: string[]): string[] {
  return Array.from(new Set([...current, ...selected]));
}

export function privacyResourceTypeLabel(type: string): string {
  return {
    audio: "原始录音",
    transcript: "转写文本",
    recording_summary: "录音纪要",
    report: "报告",
    video: "视频",
    profile: "基础档案",
    session: "咨询记录",
    attachment: "附件",
    supervision_conversation: "督导会话",
  }[type] ?? type;
}
