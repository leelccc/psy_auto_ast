export type ArchiveKind = "client" | "supervisor" | "supervisee";

export type ArchiveCandidate = {
  id: string;
  name: string;
  code: string;
  completedCount: number;
};

const kindMeta: Record<ArchiveKind, { kindLabel: string; recordNoun: string }> = {
  client: { kindLabel: "来访者", recordNoun: "咨询" },
  supervisor: { kindLabel: "督导师", recordNoun: "受督" },
  supervisee: { kindLabel: "受督者", recordNoun: "督导" },
};

export function filterArchiveCandidates<T extends ArchiveCandidate>(candidates: T[], query: string): T[] {
  const normalized = query.trim().toLocaleLowerCase();
  if (!normalized) return candidates;

  return candidates.filter((candidate) => {
    return candidate.name.toLocaleLowerCase().includes(normalized) || candidate.code.toLocaleLowerCase().includes(normalized);
  });
}

export function buildArchiveResult({
  kind,
  profileName,
  completedCount,
}: {
  kind: ArchiveKind;
  profileName: string;
  completedCount: number;
}) {
  const meta = kindMeta[kind];
  return {
    profileName,
    kindLabel: meta.kindLabel,
    recordLabel: `第 ${completedCount + 1} 次${meta.recordNoun}`,
  };
}
