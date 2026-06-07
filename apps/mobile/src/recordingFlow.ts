export type RecordingDestination = "archive" | "processing" | "detail";
export type ArchiveRecording = { title: string; duration: string };

export function getRecordingDestination({
  status,
  archive,
}: {
  status: string;
  archive: string;
}): RecordingDestination {
  if (archive === "待归档") return "archive";
  if (status === "生成中" || status === "上传中") return "processing";
  return "detail";
}

export function toArchiveRecording<T extends { title: string; duration: string }>(recording: T): ArchiveRecording {
  return {
    title: recording.title,
    duration: recording.duration,
  };
}

export function describeRecordingContext(title: string): {
  actionLabel: string;
  roles: [string, string];
  summary: string;
} {
  if (title.includes("督导反馈") || title.includes("受督")) {
    return {
      actionLabel: "生成督导反馈",
      roles: ["咨询师", "督导师"],
      summary: "本次围绕案例概念化、咨询边界和后续干预方向展开，督导师提供了具体反馈。",
    };
  }
  if (title.includes("督导记录")) {
    return {
      actionLabel: "生成督导记录",
      roles: ["督导师", "受督者"],
      summary: "本次围绕受督者的咨询工作、能力发展和后续练习方向展开。",
    };
  }
  return {
    actionLabel: "生成咨询记录",
    roles: ["来访者", "咨询师"],
    summary: "本次来访者主要围绕睡眠下降、工作评价焦虑和关系议题展开。咨询师进行了事实、推测与情绪反应的区分。",
  };
}
