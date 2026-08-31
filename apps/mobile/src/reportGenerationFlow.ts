export type ReportGenerationLoadTarget = {
  sessionId: string;
  mode: "create" | "regenerate";
};

export function keepReportGenerationLoadError<
  T extends ReportGenerationLoadTarget & { loading?: boolean; loadError?: string },
>(current: T | null, request: ReportGenerationLoadTarget, message: string): T | null {
  if (!current || current.sessionId !== request.sessionId || current.mode !== request.mode) {
    return current;
  }
  return { ...current, loading: false, loadError: message };
}

export function retryReportGenerationLoad<
  T extends { sources: unknown[]; loading?: boolean; loadError?: string },
>(current: T | null): T | null {
  return current
    ? { ...current, sources: [], loading: true, loadError: undefined }
    : current;
}
