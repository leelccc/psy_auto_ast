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
