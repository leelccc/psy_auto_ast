import { ApiClient } from "./apiClient";


export type AIJob = {
  id: string;
  jobType: string;
  targetType: string;
  targetId: string;
  status: "queued" | "running" | "completed" | "failed" | "cancelled";
  progress: number;
  resultSummary: Record<string, unknown>;
  error: { code: string; message: string; retryable: boolean } | null;
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
};

type BackendJob = {
  id: string;
  job_type: string;
  target_type: string;
  target_id: string;
  status: AIJob["status"];
  progress: number;
  result_summary: Record<string, unknown>;
  error: AIJob["error"];
  created_at: string;
  started_at: string | null;
  finished_at: string | null;
};

function mapJob(job: BackendJob): AIJob {
  return {
    id: job.id,
    jobType: job.job_type,
    targetType: job.target_type,
    targetId: job.target_id,
    status: job.status,
    progress: job.progress,
    resultSummary: job.result_summary,
    error: job.error,
    createdAt: job.created_at,
    startedAt: job.started_at,
    finishedAt: job.finished_at,
  };
}

export function createJobService(client: ApiClient) {
  return {
    async get(jobId: string): Promise<AIJob> {
      return mapJob(await client.get<BackendJob>(`/ai-jobs/${jobId}`));
    },
    async cancel(jobId: string): Promise<AIJob> {
      return mapJob(await client.post<BackendJob>(`/ai-jobs/${jobId}/cancel`));
    },
    events(jobId: string) {
      return client.get<{
        items: Array<{ event: string; status: string; progress?: number }>;
      }>(`/ai-jobs/${jobId}/events`, { deduplicate: false });
    },
  };
}
