import type { ArchiveKind } from "../archiveFlow";
import type { ProfileListItem } from "../profileLibrary";
import { profileKindToLabel } from "../profileLibrary";
import { ApiClient } from "./apiClient";

type BackendProfile = {
  id: string;
  type: ArchiveKind;
  name: string;
  code: string | null;
  status: string | null;
  crisis_level: string | null;
  initial_session_count: number;
  session_count?: number;
  latest_sequence?: number;
  next_session_at: string | null;
  metadata?: Record<string, unknown>;
  notes?: string;
};

const statusLabels: Record<string, string> = {
  active: "进行中",
  paused: "暂停",
  closed: "已结束",
};

const riskLabels: Record<string, string> = {
  none: "无",
  mild: "轻度",
  moderate: "中度",
  high: "高",
};

export function formatNextSession(value: string | null, now = new Date()): string {
  if (!value) return "未设置";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  const formatted = `${date.getMonth() + 1}月${date.getDate()}日 ${`${date.getHours()}`.padStart(2, "0")}:${`${date.getMinutes()}`.padStart(2, "0")}`;
  return date.getTime() < now.getTime() ? `已过期 ${formatted}` : formatted;
}

function formatFrequency(metadata: Record<string, unknown> | undefined): string | undefined {
  const frequency = metadata?.frequency;
  return typeof frequency === "string" && frequency.trim() ? frequency.trim() : undefined;
}

function metadataString(metadata: Record<string, unknown> | undefined, key: string): string | undefined {
  const value = metadata?.[key];
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

export function mapBackendProfile(profile: BackendProfile): ProfileListItem {
  const sequence = profile.latest_sequence ?? 0;
  const sessionCount = profile.session_count ?? sequence;
  const countDetail = profile.initial_session_count > 0
    ? `系统内 ${sessionCount} 条 · 约定 ${profile.initial_session_count} 次`
    : sessionCount > 0
      ? `系统内 ${sessionCount} 条`
      : undefined;
  const mapped: ProfileListItem = {
    id: profile.id,
    displayCode: profile.code ?? undefined,
    name: profile.name,
    type: profileKindToLabel(profile.type),
    count: sequence > 0 ? `第${sequence}次` : "尚无记录",
    countDetail,
    sessionCount,
    initialSessionCount: profile.initial_session_count,
    latestSequence: sequence,
    status: profile.status ? statusLabels[profile.status] ?? profile.status : "新建",
    risk: profile.crisis_level ? riskLabels[profile.crisis_level] ?? profile.crisis_level : "未评估",
    next: formatNextSession(profile.next_session_at),
  };
  if (profile.crisis_level) mapped.crisisLevel = profile.crisis_level;
  if (profile.next_session_at) mapped.nextSessionAt = profile.next_session_at;
  if (profile.notes) mapped.notes = profile.notes;
  const frequency = formatFrequency(profile.metadata);
  if (frequency) mapped.frequency = frequency;
  const gender = metadataString(profile.metadata, "gender");
  if (gender) mapped.gender = gender;
  const firstVisitComplaint = metadataString(profile.metadata, "first_visit_complaint");
  if (firstVisitComplaint) mapped.firstVisitComplaint = firstVisitComplaint;
  const supervisionMode = metadataString(profile.metadata, "supervision_mode");
  if (supervisionMode) mapped.supervisionMode = supervisionMode;
  return mapped;
}

export function createProfileService(client: ApiClient) {
  return {
    async list(): Promise<ProfileListItem[]> {
      const response = await client.get<{ items: BackendProfile[] }>("/profiles");
      return response.items.map(mapBackendProfile);
    },
    async create(input: {
      type: ArchiveKind;
      name: string;
      code?: string;
      status?: string;
      crisisLevel?: string;
      initialSessionCount?: number;
      nextSessionAt?: string;
      metadata?: Record<string, unknown>;
      notes?: string;
    }): Promise<ProfileListItem> {
      const profile = await client.post<BackendProfile>("/profiles", {
        type: input.type,
        name: input.name,
        code: input.code,
        status: input.status,
        crisis_level: input.crisisLevel,
        initial_session_count: input.initialSessionCount ?? 0,
        next_session_at: input.nextSessionAt,
        metadata: input.metadata ?? {},
        notes: input.notes ?? "",
      });
      return mapBackendProfile(profile);
    },
    async update(profileId: string, input: {
      nextSessionAt?: string | null;
      frequency?: string;
      crisisLevel?: string | null;
      name?: string;
      code?: string | null;
      status?: string;
      initialSessionCount?: number;
      metadata?: Record<string, unknown>;
      notes?: string;
    }): Promise<ProfileListItem> {
      const body: Record<string, unknown> = {};
      if (input.nextSessionAt !== undefined) body.next_session_at = input.nextSessionAt;
      if (input.frequency !== undefined || input.metadata !== undefined) {
        body.metadata = { ...(input.metadata ?? {}) };
        if (input.frequency !== undefined) {
          (body.metadata as Record<string, unknown>).frequency = input.frequency;
        }
      }
      if (input.name !== undefined) body.name = input.name;
      if (input.code !== undefined) body.code = input.code;
      if (input.status !== undefined) body.status = input.status;
      if (input.crisisLevel !== undefined) body.crisis_level = input.crisisLevel;
      if (input.initialSessionCount !== undefined) {
        body.initial_session_count = input.initialSessionCount;
      }
      if (input.notes !== undefined) body.notes = input.notes;
      const profile = await client.patch<BackendProfile>(`/profiles/${profileId}`, body);
      return mapBackendProfile(profile);
    },
  };
}
