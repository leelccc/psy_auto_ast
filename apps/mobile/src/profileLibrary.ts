import type { ArchiveKind } from "./archiveFlow";

export type ProfileFilter = "all" | ArchiveKind;
export type ProfileTypeLabel = "来访者" | "督导师" | "受督者";

export type ProfileListItem = {
  id: string;
  name: string;
  type: ProfileTypeLabel;
  count: string;
  status: string;
  risk: string;
  next: string;
};

const kindLabels: Record<ArchiveKind, ProfileTypeLabel> = {
  client: "来访者",
  supervisor: "督导师",
  supervisee: "受督者",
};

export function profileKindToLabel(kind: ArchiveKind): ProfileTypeLabel {
  return kindLabels[kind];
}

export function filterProfiles(
  profiles: ProfileListItem[],
  filter: ProfileFilter,
  query: string,
): ProfileListItem[] {
  const normalized = query.trim().toLocaleLowerCase();

  return profiles.filter((profile) => {
    const matchesIdentity = filter === "all" || profile.type === kindLabels[filter];
    const matchesQuery =
      !normalized ||
      profile.name.toLocaleLowerCase().includes(normalized) ||
      profile.id.toLocaleLowerCase().includes(normalized) ||
      profile.status.toLocaleLowerCase().includes(normalized);
    return matchesIdentity && matchesQuery;
  });
}

export function buildNewProfile({
  kind,
  name,
  next,
}: {
  kind: ArchiveKind;
  name: string;
  next: string;
}): ProfileListItem {
  const trimmedName = name.trim();
  return {
    id: `${kind}-${trimmedName}`,
    name: trimmedName,
    type: kindLabels[kind],
    count: "尚无记录",
    status: "新建",
    risk: "未评估",
    next: next.trim() || "未设置",
  };
}
