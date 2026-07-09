import type { StoredFileReference } from "../fileService";
import { ApiClient } from "./apiClient";

export type BackendFile = {
  file_id: string;
  filename: string;
  mime_type: string;
  size_bytes: number;
  upload_status: StoredFileReference["uploadStatus"];
  can_long_term_preserve: boolean;
  expires_at: string | null;
};

export function mapBackendFile(file: BackendFile): StoredFileReference {
  return {
    fileId: file.file_id,
    filename: file.filename,
    mimeType: file.mime_type,
    sizeBytes: file.size_bytes,
    uploadStatus: file.upload_status,
    sourceKind: "minio",
  };
}

export function createBackendFileService(client: ApiClient) {
  return {
    createUpload(input: {
      filename: string;
      mimeType: string;
      sizeBytes: number;
      purpose?: "attachment" | "recording" | "export";
      checksumSha256?: string;
    }) {
      return client.post<{
        file_id: string;
        upload_url: string;
        upload_headers: Record<string, string>;
      }>("/files", {
        filename: input.filename,
        mime_type: input.mimeType,
        size_bytes: input.sizeBytes,
        purpose: input.purpose ?? "attachment",
        checksum_sha256: input.checksumSha256,
      });
    },
    async completeUpload(fileId: string): Promise<StoredFileReference> {
      return mapBackendFile(await client.post<BackendFile>(`/files/${fileId}/complete`));
    },
    getDownloadUrl(fileId: string) {
      return client.get<{ download_url: string; expires_in_seconds: number }>(`/files/${fileId}/download-url`);
    },
    delete(fileId: string): Promise<{ deleted: true }> {
      return client.delete(`/files/${fileId}`);
    },
  };
}
