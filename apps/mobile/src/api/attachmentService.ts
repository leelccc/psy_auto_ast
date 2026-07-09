import type { MaterialCategory, SessionMaterial } from "../sessionMaterials";
import { ApiClient } from "./apiClient";
import { mapBackendFile, type BackendFile } from "./fileService";

type BackendAttachment = {
  id: string;
  owner_type: "profile" | "session";
  owner_id: string;
  category: string;
  replace_group_key: string | null;
  is_current: boolean;
  analysis_status: string;
  file: BackendFile;
};

export type ProfileAttachment = {
  id: string;
  profileId: string;
  category: string;
  title: string;
  meta: string;
  file: ReturnType<typeof mapBackendFile>;
};

function fileType(mimeType: string): string {
  if (mimeType === "application/pdf") return "PDF";
  if (mimeType.startsWith("image/")) return "图片";
  if (mimeType.startsWith("audio/")) return "音频";
  return "文件";
}

export function mapBackendAttachment(attachment: BackendAttachment): SessionMaterial {
  return {
    id: attachment.id,
    sessionId: attachment.owner_id,
    category: attachment.category as MaterialCategory,
    title: attachment.file.filename.replace(/\.[^.]+$/, ""),
    meta: `${fileType(attachment.file.mime_type)} · ${attachment.file.upload_status === "uploaded" ? "已上传" : "仅元数据"} · ${attachment.analysis_status}`,
    preservable: attachment.file.can_long_term_preserve,
    file: mapBackendFile(attachment.file),
  };
}

export function mapBackendProfileAttachment(attachment: BackendAttachment): ProfileAttachment {
  return {
    id: attachment.id,
    profileId: attachment.owner_id,
    category: attachment.category,
    title: attachment.file.filename.replace(/\.[^.]+$/, ""),
    meta: `${fileType(attachment.file.mime_type)} · ${attachment.file.upload_status === "uploaded" ? "已上传" : "仅元数据"}`,
    file: mapBackendFile(attachment.file),
  };
}

export function createAttachmentService(client: ApiClient) {
  return {
    async listProfile(profileId: string): Promise<ProfileAttachment[]> {
      const response = await client.get<{ items: BackendAttachment[] }>(
        `/attachments?owner_type=profile&owner_id=${encodeURIComponent(profileId)}`,
      );
      return response.items.map(mapBackendProfileAttachment);
    },
    async createProfile(input: {
      profileId: string;
      category: string;
      fileId: string;
    }): Promise<ProfileAttachment> {
      const attachment = await client.post<BackendAttachment>("/attachments", {
        owner_type: "profile",
        owner_id: input.profileId,
        category: input.category,
        file_id: input.fileId,
      });
      return mapBackendProfileAttachment(attachment);
    },
    async listSession(sessionId: string, category?: MaterialCategory): Promise<SessionMaterial[]> {
      const suffix = category ? `&category=${encodeURIComponent(category)}` : "";
      const response = await client.get<{ items: BackendAttachment[] }>(
        `/attachments?owner_type=session&owner_id=${encodeURIComponent(sessionId)}${suffix}`,
      );
      return response.items.map(mapBackendAttachment);
    },
    async create(input: {
      sessionId: string;
      category: MaterialCategory;
      fileId: string;
      replaceGroupKey?: string;
    }): Promise<SessionMaterial> {
      const attachment = await client.post<BackendAttachment>("/attachments", {
        owner_type: "session",
        owner_id: input.sessionId,
        category: input.category,
        file_id: input.fileId,
        replace_group_key: input.replaceGroupKey,
      });
      return mapBackendAttachment(attachment);
    },
    async replace(attachmentId: string, fileId: string): Promise<SessionMaterial> {
      const attachment = await client.post<BackendAttachment>(`/attachments/${attachmentId}/replace`, {
        file_id: fileId,
        confirm_replace: true,
      });
      return mapBackendAttachment(attachment);
    },
    async replaceProfile(attachmentId: string, fileId: string): Promise<ProfileAttachment> {
      const attachment = await client.post<BackendAttachment>(`/attachments/${attachmentId}/replace`, {
        file_id: fileId,
        confirm_replace: true,
      });
      return mapBackendProfileAttachment(attachment);
    },
    delete(attachmentId: string): Promise<{ deleted: true }> {
      return client.delete(`/attachments/${attachmentId}`);
    },
  };
}
