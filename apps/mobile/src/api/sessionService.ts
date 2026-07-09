import type { SessionHistoryItem } from "../sessionHistory";
import { ApiClient } from "./apiClient";

type BackendSession = {
  id: string;
  profile_id: string;
  session_type: string;
  sequence_no: number;
  occurred_at: string;
  summary: string;
  tags: string[];
  record_status: string;
};

export function mapBackendSession(session: BackendSession): SessionHistoryItem {
  return {
    id: session.id,
    sequence: session.sequence_no,
    occurredAt: session.occurred_at,
    summary: session.summary,
    tags: session.tags,
    recording: "未添加",
    record: session.record_status === "formal" ? "正式版" : session.record_status === "draft" ? "草稿" : "待生成",
    scale: "未上传",
    homework: "未添加",
    other: "无",
  };
}

export function createSessionService(client: ApiClient) {
  return {
    async list(profileId: string): Promise<SessionHistoryItem[]> {
      const response = await client.get<{ items: BackendSession[] }>(`/profiles/${profileId}/sessions`);
      return response.items.map(mapBackendSession);
    },
    async create(profileId: string, input: {
      sessionType: string;
      occurredAt: string;
      summary: string;
    }): Promise<SessionHistoryItem> {
      const session = await client.post<BackendSession>(`/profiles/${profileId}/sessions`, {
        session_type: input.sessionType,
        occurred_at: input.occurredAt,
        summary: input.summary,
      });
      return mapBackendSession(session);
    },
    async update(sessionId: string, input: {
      occurredAt?: string;
      summary?: string;
      tags?: string[];
    }): Promise<SessionHistoryItem> {
      const session = await client.patch<BackendSession>(`/sessions/${sessionId}`, {
        occurred_at: input.occurredAt,
        summary: input.summary,
        tags: input.tags,
      });
      return mapBackendSession(session);
    },
    delete(sessionId: string): Promise<{ deleted: true }> {
      return client.delete(`/sessions/${sessionId}`, { confirmation_text: "删除记录" });
    },
  };
}
