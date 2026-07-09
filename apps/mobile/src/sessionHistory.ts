export type SessionHistoryItem = {
  id: string;
  sequence: number;
  occurredAt: string;
  summary: string;
  tags: string[];
  recording: string;
  record: string;
  scale: string;
  homework: string;
  other: string;
};

type SessionResourceMaterial = {
  sessionId: string;
  category: "recording" | "scale" | "homework" | "other";
};

type SessionResourceRecording = {
  sessionId?: string;
  ttl: string;
};

export function sortSessionsDescending(sessions: SessionHistoryItem[]): SessionHistoryItem[] {
  return [...sessions].sort((left, right) => {
    const timeDifference = Date.parse(right.occurredAt) - Date.parse(left.occurredAt);
    if (timeDifference !== 0) return timeDifference;
    return right.sequence - left.sequence;
  });
}

export function updateSession(
  sessions: SessionHistoryItem[],
  id: string,
  patch: Partial<Omit<SessionHistoryItem, "id">>,
): SessionHistoryItem[] {
  return sortSessionsDescending(sessions.map((session) => session.id === id ? { ...session, ...patch } : session));
}

export function removeSession(sessions: SessionHistoryItem[], id: string): SessionHistoryItem[] {
  return sessions.filter((session) => session.id !== id);
}

export function applySessionResourceStatuses(
  sessions: SessionHistoryItem[],
  materials: SessionResourceMaterial[],
  recordings: SessionResourceRecording[] = [],
): SessionHistoryItem[] {
  return sessions.map((session) => {
    const counts = materials
      .filter((material) => material.sessionId === session.id)
      .reduce<Record<SessionResourceMaterial["category"], number>>(
        (total, material) => ({
          ...total,
          [material.category]: total[material.category] + 1,
        }),
        { recording: 0, scale: 0, homework: 0, other: 0 },
      );
    const recording = recordings.find((item) => item.sessionId === session.id);
    return {
      ...session,
      recording: recording?.ttl ?? (counts.recording > 0 ? "已添加" : session.recording),
      scale: counts.scale > 0 ? `已上传 ${counts.scale}` : session.scale,
      homework: counts.homework > 0 ? `已添加 ${counts.homework}` : session.homework,
      other: counts.other > 0 ? `${counts.other} 项` : session.other,
    };
  });
}

export function addSessionTag(tags: string[], rawTag: string): string[] {
  const tag = rawTag.trim();
  if (!tag || tags.includes(tag) || tags.length >= 4) return tags;
  return [...tags, tag];
}

export function formatSessionTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  const hours = `${date.getHours()}`.padStart(2, "0");
  const minutes = `${date.getMinutes()}`.padStart(2, "0");
  return `${date.getFullYear()}年${month}月${day}日 ${hours}:${minutes}`;
}
