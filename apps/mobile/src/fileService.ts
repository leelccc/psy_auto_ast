export type UploadStatus = "pending" | "uploading" | "uploaded" | "failed" | "destroyed";
export type FileSourceKind = "minio" | "prototype";

export type StoredFileReference = {
  fileId: string | null;
  filename: string;
  mimeType: string;
  sizeBytes: number | null;
  uploadStatus: UploadStatus;
  sourceKind: FileSourceKind;
};

export type FileServiceUnavailable = {
  ok: false;
  code: "file_service_unavailable";
  message: string;
};

export type FileServiceResult<T> =
  | { ok: true; data: T }
  | FileServiceUnavailable;

export type FileService = {
  createUpload(input: {
    filename: string;
    mimeType: string;
    sizeBytes: number;
  }): Promise<FileServiceResult<{
    fileId: string;
    uploadUrl: string;
    uploadHeaders: Record<string, string>;
  }>>;
  completeUpload(fileId: string): Promise<FileServiceResult<StoredFileReference>>;
  getDownloadUrl(fileId: string): Promise<FileServiceResult<{
    downloadUrl: string;
    expiresAt: string;
  }>>;
  replaceFile(fileId: string, replacementFileId: string): Promise<FileServiceResult<StoredFileReference>>;
  deleteFile(fileId: string): Promise<FileServiceResult<{ deleted: true }>>;
};

const unavailable = (): FileServiceUnavailable => ({
  ok: false,
  code: "file_service_unavailable",
  message: "文件服务将在后端 MinIO 接入后启用。",
});

export function createUnconfiguredFileService(): FileService {
  return {
    createUpload: async () => unavailable(),
    completeUpload: async () => unavailable(),
    getDownloadUrl: async () => unavailable(),
    replaceFile: async () => unavailable(),
    deleteFile: async () => unavailable(),
  };
}

export function getOriginalFileDownloadState(file: StoredFileReference | null): {
  available: boolean;
  label: string;
} {
  if (file?.uploadStatus === "destroyed") {
    return { available: false, label: "文件已销毁" };
  }
  return file?.fileId && file.uploadStatus === "uploaded"
    ? { available: true, label: "下载原文件" }
    : { available: false, label: "等待文件服务接入" };
}
