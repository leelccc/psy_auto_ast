import type { ArchiveKind } from "../archiveFlow";
import { ApiClient } from "./apiClient";


export type Recording = {
  id: string;
  title: string;
  sourceType: "in_app_recording" | "uploaded_audio";
  durationSeconds: number | null;
  archiveStatus: "unarchived" | "archived";
  aiStatus: string;
  processingError: string | null;
  audioFileId: string | null;
  audioExpiresAt: string | null;
  audioDestroyedAt: string | null;
  segments: RecordingSegment[];
  session: { id: string; sequenceNo: number; sessionType: string } | null;
  profile: { id: string; name: string; type: ArchiveKind } | null;
  createdAt: string;
  updatedAt: string;
};

export type RecordingSegment = {
  id: string;
  fileId: string;
  segmentIndex: number;
  filename: string;
  durationSeconds: number;
  sizeBytes: number;
  status: "uploaded" | "transcribing" | "transcribed" | "failed" | "destroyed";
  processingError: string | null;
  expiresAt: string | null;
  destroyedAt: string | null;
};

export type RecordingDurationStatistics = {
  totalSeconds: number;
  items: Array<{
    profileType: ArchiveKind | null;
    count: number;
    durationSeconds: number;
  }>;
};

type BackendRecording = {
  id: string;
  title: string;
  source_type: Recording["sourceType"];
  duration_seconds: number | null;
  archive_status: Recording["archiveStatus"];
  ai_status: string;
  processing_error: string | null;
  audio_file_id: string | null;
  audio_expires_at: string | null;
  audio_destroyed_at: string | null;
  segments?: Array<{
    id: string;
    file_id: string;
    segment_index: number;
    filename: string;
    duration_seconds: number;
    size_bytes: number;
    status: RecordingSegment["status"];
    processing_error: string | null;
    expires_at: string | null;
    destroyed_at: string | null;
  }>;
  session: { id: string; sequence_no: number; session_type: string } | null;
  profile: { id: string; name: string; type: ArchiveKind } | null;
  created_at: string;
  updated_at: string;
};

export type RecordingTranscript = {
  transcriptId: string;
  recordingId: string;
  expiresAt: string;
  longTermAuthorizedAt: string | null;
  manualEdited: boolean;
  speakers: Record<string, string>;
  segments: Array<{
    id: string;
    start_ms: number;
    end_ms: number;
    speaker_key: string;
    speaker_label: string;
    text: string;
  }>;
};

export type RecordingSummary = {
  summaryId: string;
  recordingId: string;
  mainSummary: string;
  chapterOverview: Array<Record<string, unknown>>;
  manualEdited: boolean;
  expiresAt: string;
  longTermAuthorizedAt: string | null;
};

function mapRecording(recording: BackendRecording): Recording {
  return {
    id: recording.id,
    title: recording.title,
    sourceType: recording.source_type,
    durationSeconds: recording.duration_seconds,
    archiveStatus: recording.archive_status,
    aiStatus: recording.ai_status,
    processingError: recording.processing_error,
    audioFileId: recording.audio_file_id,
    audioExpiresAt: recording.audio_expires_at,
    audioDestroyedAt: recording.audio_destroyed_at,
    segments: (recording.segments ?? []).map((segment) => ({
      id: segment.id,
      fileId: segment.file_id,
      segmentIndex: segment.segment_index,
      filename: segment.filename,
      durationSeconds: segment.duration_seconds,
      sizeBytes: segment.size_bytes,
      status: segment.status,
      processingError: segment.processing_error,
      expiresAt: segment.expires_at,
      destroyedAt: segment.destroyed_at,
    })),
    session: recording.session ? {
      id: recording.session.id,
      sequenceNo: recording.session.sequence_no,
      sessionType: recording.session.session_type,
    } : null,
    profile: recording.profile,
    createdAt: recording.created_at,
    updatedAt: recording.updated_at,
  };
}

export function createRecordingService(client: ApiClient) {
  return {
    async list(filters: {
      archiveStatus?: string;
      aiStatus?: string;
      keyword?: string;
      page?: number;
      pageSize?: number;
    } = {}): Promise<{ items: Recording[]; total: number }> {
      const params = new URLSearchParams();
      if (filters.archiveStatus) params.set("archive_status", filters.archiveStatus);
      if (filters.aiStatus) params.set("ai_status", filters.aiStatus);
      if (filters.keyword) params.set("keyword", filters.keyword);
      if (filters.page) params.set("page", String(filters.page));
      if (filters.pageSize) params.set("page_size", String(filters.pageSize));
      // 注意：不能用 params.size 判断——Hermes 原生 URLSearchParams 没有 size getter，
      // Android 上恒为 undefined，query 会被整体丢弃（列表过滤全部失效）。
      const query = params.toString() ? `?${params}` : "";
      const response = await client.get<{
        items: BackendRecording[];
        total: number;
      }>(`/recordings${query}`);
      return { items: response.items.map(mapRecording), total: response.total };
    },
    async status(recordingId: string): Promise<{
      archiveStatus: string;
      aiStatus: string;
      processingError: string | null;
      audioReady: boolean;
      transcriptReady: boolean;
      summaryReady: boolean;
    }> {
      const value = await client.get<{
        recording_id: string;
        archive_status: string;
        ai_status: string;
        processing_error: string | null;
        audio_ready: boolean;
        transcript_ready: boolean;
        summary_ready: boolean;
      }>(`/recordings/${recordingId}/status`);
      return {
        archiveStatus: value.archive_status,
        aiStatus: value.ai_status,
        processingError: value.processing_error,
        audioReady: value.audio_ready,
        transcriptReady: value.transcript_ready,
        summaryReady: value.summary_ready,
      };
    },
    async create(title: string, sourceType: Recording["sourceType"]): Promise<Recording> {
      return mapRecording(await client.post<BackendRecording>("/recordings", {
        title,
        source_type: sourceType,
      }));
    },
    bindAudio(recordingId: string, fileId: string, durationSeconds: number | null) {
      return client.post<{
        audio_expires_at: string;
        can_long_term_preserve_audio: false;
      }>(`/recordings/${recordingId}/audio`, {
        file_id: fileId,
        duration_seconds: durationSeconds,
      });
    },
    async addSegment(recordingId: string, fileId: string, durationSeconds: number): Promise<Recording> {
      return mapRecording(await client.post<BackendRecording>(`/recordings/${recordingId}/segments`, {
        file_id: fileId,
        duration_seconds: durationSeconds,
      }));
    },
    async reorderSegments(recordingId: string, segmentIds: string[]): Promise<Recording> {
      return mapRecording(await client.put<BackendRecording>(`/recordings/${recordingId}/segments/reorder`, {
        segment_ids: segmentIds,
      }));
    },
    async deleteSegment(recordingId: string, segmentId: string): Promise<Recording> {
      return mapRecording(await client.delete<BackendRecording>(
        `/recordings/${recordingId}/segments/${segmentId}`,
      ));
    },
    async durationStatistics(): Promise<RecordingDurationStatistics> {
      const response = await client.get<{
        total_seconds: number;
        items: Array<{
          profile_type: ArchiveKind | null;
          count: number;
          duration_seconds: number;
        }>;
      }>("/recording-duration-statistics");
      return {
        totalSeconds: response.total_seconds,
        items: response.items.map((item) => ({
          profileType: item.profile_type,
          count: item.count,
          durationSeconds: item.duration_seconds,
        })),
      };
    },
    process(recordingId: string, mode: "generic" | "archived_context" = "generic") {
      return client.post<{ job_id: string; status: string }>(
        `/recordings/${recordingId}/processing`,
        { mode },
      );
    },
    retry(recordingId: string) {
      return client.post<{ job_id: string; status: string }>(
        `/recordings/${recordingId}/processing/retry`,
      );
    },
    archive(recordingId: string, input: {
      profileType: ArchiveKind;
      profileId?: string;
      createProfile?: {
        name: string;
        code?: string;
        status?: string;
        initialSessionCount?: number;
      };
      sessionId?: string;
      createSession?: { startedAt?: string; mode?: string; summary?: string };
    }) {
      return client.post<{
        recording_id: string;
        profile_id: string;
        session_id: string;
        sequence_no: number;
        recommended_speaker_roles: string[];
      }>(`/recordings/${recordingId}/archive`, {
        profile_type: input.profileType,
        profile_id: input.profileId,
        create_profile: input.createProfile ? {
          name: input.createProfile.name,
          code: input.createProfile.code,
          status: input.createProfile.status,
          initial_session_count: input.createProfile.initialSessionCount ?? 0,
        } : undefined,
        session_id: input.sessionId,
        create_session: input.createSession ? {
          started_at: input.createSession.startedAt,
          mode: input.createSession.mode,
          summary: input.createSession.summary ?? "",
        } : undefined,
      });
    },
    async transcript(recordingId: string): Promise<RecordingTranscript> {
      const value = await client.get<{
        transcript_id: string;
        recording_id: string;
        expires_at: string;
        long_term_authorized_at: string | null;
        manual_edited: boolean;
        speakers: Record<string, string>;
        segments: RecordingTranscript["segments"];
      }>(`/recordings/${recordingId}/transcript`);
      return {
        transcriptId: value.transcript_id,
        recordingId: value.recording_id,
        expiresAt: value.expires_at,
        longTermAuthorizedAt: value.long_term_authorized_at,
        manualEdited: value.manual_edited,
        speakers: value.speakers,
        segments: value.segments,
      };
    },
    updateSpeaker(recordingId: string, speakerKey: string, speakerLabel: string) {
      return client.patch(`/recordings/${recordingId}/speakers`, {
        speaker_key: speakerKey,
        speaker_label: speakerLabel,
      });
    },
    updateSegment(segmentId: string, text: string) {
      return client.patch(`/transcript-segments/${segmentId}`, { text });
    },
    async summary(recordingId: string): Promise<RecordingSummary> {
      const value = await client.get<{
        summary_id: string;
        recording_id: string;
        main_summary: string;
        chapter_overview: Array<Record<string, unknown>>;
        manual_edited: boolean;
        expires_at: string;
        long_term_authorized_at: string | null;
      }>(`/recordings/${recordingId}/summary`);
      return {
        summaryId: value.summary_id,
        recordingId: value.recording_id,
        mainSummary: value.main_summary,
        chapterOverview: value.chapter_overview,
        manualEdited: value.manual_edited,
        expiresAt: value.expires_at,
        longTermAuthorizedAt: value.long_term_authorized_at,
      };
    },
    updateSummary(recordingId: string, mainSummary: string, chapterOverview: Array<Record<string, unknown>>) {
      return client.patch(`/recordings/${recordingId}/summary`, {
        main_summary: mainSummary,
        chapter_overview: chapterOverview,
      });
    },
    regenerateSummary(recordingId: string, confirmOverwrite: boolean) {
      return client.post<{ job_id: string; status: string }>(
        `/recordings/${recordingId}/summary/regenerate`,
        { confirm_overwrite: confirmOverwrite },
      );
    },
    deleteAudio(recordingId: string) {
      return client.delete<{ deleted: true }>(`/recordings/${recordingId}`);
    },
    deleteTranscript(transcriptId: string) {
      return client.delete<{ deleted: true }>(`/recording-transcripts/${transcriptId}`);
    },
    deleteSummary(summaryId: string) {
      return client.delete<{ deleted: true }>(`/recording-summaries/${summaryId}`);
    },
  };
}
