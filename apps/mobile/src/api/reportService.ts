import { ApiClient } from "./apiClient";


export type ReportSource = {
  resourceType: string;
  resourceId: string;
  label: string;
  analysisStatus: string;
  defaultSelected: boolean;
};

export type Report = {
  id: string;
  reportType: string;
  profileId: string | null;
  sessionId: string | null;
  recordingId: string | null;
  title: string;
  draftContent: Record<string, unknown>;
  formalContent: Record<string, unknown> | null;
  selectedSources: Array<Record<string, string>>;
  generationStatus: string;
  formalSavedAt: string | null;
  expiresAt: string;
  createdAt: string;
  updatedAt: string;
};

type BackendReport = {
  id: string;
  report_type: string;
  profile_id: string | null;
  session_id: string | null;
  recording_id: string | null;
  title: string;
  draft_content: Record<string, unknown>;
  formal_content: Record<string, unknown> | null;
  selected_sources: Array<Record<string, string>>;
  generation_status: string;
  formal_saved_at: string | null;
  expires_at: string;
  created_at: string;
  updated_at: string;
};

function mapReport(report: BackendReport): Report {
  return {
    id: report.id,
    reportType: report.report_type,
    profileId: report.profile_id,
    sessionId: report.session_id,
    recordingId: report.recording_id,
    title: report.title,
    draftContent: report.draft_content,
    formalContent: report.formal_content,
    selectedSources: report.selected_sources,
    generationStatus: report.generation_status,
    formalSavedAt: report.formal_saved_at,
    expiresAt: report.expires_at,
    createdAt: report.created_at,
    updatedAt: report.updated_at,
  };
}

export function createReportService(client: ApiClient) {
  return {
    async list(filters: {
      profileId?: string;
      sessionId?: string;
      reportType?: string;
    } = {}): Promise<Report[]> {
      const params = new URLSearchParams();
      if (filters.profileId) params.set("profile_id", filters.profileId);
      if (filters.sessionId) params.set("session_id", filters.sessionId);
      if (filters.reportType) params.set("report_type", filters.reportType);
      const response = await client.get<{ items: BackendReport[] }>(
        `/reports${params.size ? `?${params}` : ""}`,
      );
      return response.items.map(mapReport);
    },
    async generationSources(input: {
      reportType: string;
      profileId?: string;
      sessionId?: string;
    }): Promise<ReportSource[]> {
      const params = new URLSearchParams({ report_type: input.reportType });
      if (input.profileId) params.set("profile_id", input.profileId);
      if (input.sessionId) params.set("session_id", input.sessionId);
      const response = await client.get<{
        items: Array<{
          resource_type: string;
          resource_id: string;
          label: string;
          analysis_status: string;
          default_selected: boolean;
        }>;
      }>(`/reports/generation-sources?${params}`);
      return response.items.map((source) => ({
        resourceType: source.resource_type,
        resourceId: source.resource_id,
        label: source.label,
        analysisStatus: source.analysis_status,
        defaultSelected: source.default_selected,
      }));
    },
    async generate(input: {
      reportType: string;
      profileId?: string;
      sessionId?: string;
      recordingId?: string;
      selectedSources: Array<{ resourceType: string; resourceId: string }>;
      confirmOverwriteDraft?: boolean;
    }) {
      const response = await client.post<{
        job_id: string;
        draft_report_id: string;
      }>("/reports/generate", {
        report_type: input.reportType,
        profile_id: input.profileId,
        session_id: input.sessionId,
        recording_id: input.recordingId,
        selected_sources: input.selectedSources.map((source) => ({
          resource_type: source.resourceType,
          resource_id: source.resourceId,
        })),
        confirm_overwrite_draft: input.confirmOverwriteDraft ?? false,
      });
      return { jobId: response.job_id, reportId: response.draft_report_id };
    },
    async get(reportId: string): Promise<Report> {
      return mapReport(await client.get<BackendReport>(`/reports/${reportId}`));
    },
    async update(reportId: string, input: {
      title?: string;
      content?: Record<string, unknown>;
    }): Promise<Report> {
      return mapReport(await client.patch<BackendReport>(`/reports/${reportId}`, {
        title: input.title,
        content_json: input.content,
      }));
    },
    async saveFormal(reportId: string, confirmReplace = false): Promise<Report> {
      return mapReport(await client.post<BackendReport>(
        `/reports/${reportId}/save-formal`,
        { confirm_replace: confirmReplace },
      ));
    },
    async copyFormalToDraft(reportId: string): Promise<Report> {
      return mapReport(await client.post<BackendReport>(
        `/reports/${reportId}/copy-formal-to-draft`,
      ));
    },
    regenerate(reportId: string, input: {
      selectedSources: Array<{ resourceType: string; resourceId: string }>;
      confirmOverwriteDraft: boolean;
    }) {
      return client.post<{ job_id: string; draft_report_id: string }>(
        `/reports/${reportId}/regenerate`,
        {
          selected_sources: input.selectedSources.map((source) => ({
            resource_type: source.resourceType,
            resource_id: source.resourceId,
          })),
          confirm_overwrite_draft: input.confirmOverwriteDraft,
        },
      );
    },
    async export(reportId: string, format: "pdf" | "docx", version: "draft" | "formal") {
      const response = await client.post<{
        job_id: string;
        export_file_id: string;
      }>(`/reports/${reportId}/export`, { format, version });
      return { jobId: response.job_id, fileId: response.export_file_id };
    },
  };
}
