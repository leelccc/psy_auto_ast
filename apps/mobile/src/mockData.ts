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

export const attachmentRows = [
  { title: "知情同意书", meta: "PDF · 已覆盖为第 2 版" },
  { title: "SAS 量表", meta: "图片 · 仅保存和展示" },
  { title: "咨询作业", meta: "PDF · 可参与 AI 分析" },
];

export const profileTimeline = [
  { time: "今天 18:20", title: "录音已归档", meta: "第 6 次咨询" },
  { time: "今天 18:34", title: "咨询记录草稿生成", meta: "待编辑确认" },
  { time: "6月3日 21:10", title: "上传知情同意书", meta: "覆盖型附件" },
];

export const summaryChapters = [
  { time: "00:08", title: "睡眠与工作压力回顾", current: true },
  { time: "13:26", title: "区分事实、推测与情绪反应" },
  { time: "31:44", title: "下周观察任务与结束总结" },
];

export const transcriptTurns = [
  { time: "08:12", speaker: "来访者", text: "最近入睡时间变晚，主要担心工作评价，也会反复回想白天的对话。" },
  { time: "09:03", speaker: "咨询师", text: "我们先把已经发生的事实、你对它的推测，以及身体和情绪反应分开看。" },
  { time: "10:18", speaker: "来访者", text: "这样分开以后，好像能看到我把很多不确定都当成了已经发生的结果。" },
];

export const reportSections = [
  { title: "主诉与本次主题", content: "来访者本周睡眠质量下降，主要与工作评价焦虑及关系中的自我怀疑有关。本次围绕压力触发点、自动化想法和身体反应展开。" },
  { title: "咨询过程摘要", content: "咨询师引导来访者区分事实、推测与情绪反应，并协助其识别在评价场景中的灾难化推断。来访者能初步命名焦虑出现前的身体信号。" },
  { title: "后续计划", content: "下周继续记录睡前 30 分钟的想法链条，优先观察触发事件、身体反应和可验证事实。必要时在督导中讨论风险评估边界。" },
];

export function formatBadge(status: string): "warm" | "green" | "blue" {
  if (status.includes("归档") || status.includes("长期")) return "green";
  if (status.includes("生成")) return "blue";
  return "warm";
}
