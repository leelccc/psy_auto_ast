export type RecordingDestination = "archive" | "processing" | "detail";
export type ArchiveRecording = { title: string; duration: string };

export function getRecordingDestination({
  status,
  archive,
}: {
  status: string;
  archive: string;
}): RecordingDestination {
  if (["生成中", "上传中", "待处理", "处理失败"].includes(status)) return "processing";
  if (archive === "待归档") return "archive";
  return "detail";
}

type RecordingJobState = {
  status: "queued" | "running" | "completed" | "failed" | "cancelled";
};

export async function waitForRecordingJob<T extends RecordingJobState>(
  getJob: (jobId: string) => Promise<T>,
  jobId: string,
  options: {
    delay?: () => Promise<void>;
    maxAttempts?: number;
  } = {},
): Promise<T> {
  const delay = options.delay ?? (() => new Promise((resolve) => setTimeout(resolve, 1000)));
  const maxAttempts = options.maxAttempts ?? 120;
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const job = await getJob(jobId);
    if (["completed", "failed", "cancelled"].includes(job.status)) return job;
    if (attempt < maxAttempts - 1) await delay();
  }
  throw new Error("录音处理等待超时，请稍后刷新。");
}

export function recordingAudioCanProcess(ttl: string): boolean {
  return ttl.startsWith("剩余 ");
}

export function findRecordingForSession<T extends { sessionId?: string | null }>(
  recordings: T[],
  sessionId: string,
): T | null {
  return recordings.find((recording) => recording.sessionId === sessionId) ?? null;
}

export function recordingDetailRequiresProfileUnlock({
  destination,
  profileName,
  kindLabel,
}: {
  destination: RecordingDestination;
  profileName: string | null;
  kindLabel: string | null;
}): boolean {
  return destination === "detail" && Boolean(profileName && kindLabel);
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
