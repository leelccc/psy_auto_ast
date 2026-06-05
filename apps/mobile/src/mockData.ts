export type TabKey = "home" | "recordings" | "profiles" | "supervision" | "privacy" | "account";

export const metrics = [
  { label: "咨询小时", value: "7.5h", tint: "clay" },
  { label: "受督小时", value: "2h", tint: "sage" },
  { label: "督导小时", value: "1.5h", tint: "mist" },
];

export const reminders = [
  { time: "10:00", title: "陈雨 · 第6次咨询", kind: "咨询", privacy: "手机日历已同步" },
  { time: "15:30", title: "李督导 · 第3次受督", kind: "受督", privacy: "隐私标题模式" },
];

export const recordings = [
  {
    title: "陈雨 第6次咨询录音",
    duration: "52:18",
    status: "生成中",
    archive: "已归档",
    ttl: "剩余 13 天",
  },
  {
    title: "未归档录音 06-05",
    duration: "41:06",
    status: "可查看",
    archive: "待归档",
    ttl: "剩余 12 天",
  },
  {
    title: "王澜 督导反馈",
    duration: "36:22",
    status: "可查看",
    archive: "已归档",
    ttl: "长期保存",
  },
];

export const profiles = [
  { name: "陈雨", type: "来访者", count: "第6次", status: "进行中", risk: "轻度", next: "6月8日 10:00" },
  { name: "李澄", type: "督导师", count: "第3次", status: "线上", risk: "无", next: "6月9日 15:30" },
  { name: "周宁", type: "受督者", count: "第12次", status: "线下", risk: "无", next: "6月12日 14:00" },
];

export const privacyResources = [
  { title: "陈雨 第6次咨询转写", type: "转写文本", expires: "13 天后销毁", preservable: true },
  { title: "未归档录音 06-05", type: "原始录音", expires: "12 天后销毁", preservable: false },
  { title: "智能督导会话：陈雨复盘", type: "督导会话", expires: "9 天后销毁", preservable: true },
];

export function formatBadge(status: string): "warm" | "green" | "blue" {
  if (status.includes("归档") || status.includes("长期")) return "green";
  if (status.includes("生成")) return "blue";
  return "warm";
}
