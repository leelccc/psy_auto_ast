import type { ArchiveKind } from "./archiveFlow";

export type ProfileFilter = "all" | ArchiveKind;
export type ProfileTypeLabel = "来访者" | "督导师" | "受督者";

export type ProfileListItem = {
  id: string;
  displayCode?: string;
  name: string;
  type: ProfileTypeLabel;
  count: string;
  countDetail?: string;
  sessionCount?: number;
  initialSessionCount?: number;
  latestSequence?: number;
  status: string;
  risk: string;
  crisisLevel?: string;
  gender?: string;
  firstVisitComplaint?: string;
  supervisionMode?: string;
  next: string;
  nextSessionAt?: string | null;
  frequency?: string;
  notes?: string;
};

const kindLabels: Record<ArchiveKind, ProfileTypeLabel> = {
  client: "来访者",
  supervisor: "督导师",
  supervisee: "受督者",
};

const profileCodePrefixes: Record<ArchiveKind, string> = {
  client: "C",
  supervisor: "S",
  supervisee: "E",
};

const generatedProfileCodePattern = /^([CSE]\d{2})-(\d{3})$/;

export const profileCodeMaxLength = 12;

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
      (profile.displayCode?.toLocaleLowerCase().includes(normalized) ?? false) ||
      profile.status.toLocaleLowerCase().includes(normalized);
    return matchesIdentity && matchesQuery;
  });
}

export function normalizeProfileCodeInput(value: string): string {
  return value
    .toUpperCase()
    .replace(/[^A-Z0-9_-]/g, "")
    .replace(/^[^A-Z0-9]+/, "")
    .slice(0, profileCodeMaxLength);
}

export function displayProfileCode(profile: Pick<ProfileListItem, "displayCode">): string {
  return profile.displayCode?.trim() || "未编号";
}

export function suggestedProfileCode(
  profiles: ProfileListItem[],
  kind: ArchiveKind,
  now = new Date(),
): string {
  const series = `${profileCodePrefixes[kind]}${`${now.getFullYear() % 100}`.padStart(2, "0")}`;
  const typeLabel = kindLabels[kind];
  const usedNumbers = new Set(
    profiles
      .filter((profile) => profile.type === typeLabel)
      .map((profile) => profile.displayCode?.toUpperCase() ?? "")
      .map((code) => generatedProfileCodePattern.exec(code))
      .filter((match): match is RegExpExecArray => Boolean(match) && match?.[1] === series)
      .map((match) => Number(match[2])),
  );
  for (let number = 1; number < 1000; number += 1) {
    if (!usedNumbers.has(number)) return `${series}-${`${number}`.padStart(3, "0")}`;
  }
  return "";
}

export function buildNewProfile({
  kind,
  name,
  next,
  frequency,
}: {
  kind: ArchiveKind;
  name: string;
  next: string;
  frequency?: string;
}): ProfileListItem {
  const trimmedName = name.trim();
  const profile: ProfileListItem = {
    id: `${kind}-${trimmedName}`,
    name: trimmedName,
    type: kindLabels[kind],
    count: "尚无记录",
    status: "新建",
    risk: "未评估",
    next: next.trim() || "未设置",
  };
  if (frequency?.trim()) profile.frequency = frequency.trim();
  return profile;
}
