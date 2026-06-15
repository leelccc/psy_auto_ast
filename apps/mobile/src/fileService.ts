export type UploadStatus = "pending" | "uploading" | "uploaded" | "metadata_only" | "failed" | "destroyed";
export type FileSourceKind = "minio" | "local";

export type StoredFileReference = {
  fileId: string | null;
  filename: string;
  mimeType: string;
  sizeBytes: number | null;
  uploadStatus: UploadStatus;
  sourceKind: FileSourceKind;
};

export function getOriginalFileDownloadState(file: StoredFileReference | null): {
  available: boolean;
  label: string;
} {
  if (file?.uploadStatus === "destroyed") {
    return { available: false, label: "文件已销毁" };
  }
  return file?.fileId && file.uploadStatus === "uploaded"
    ? { available: true, label: "下载原文件" }
    : { available: false, label: "文件尚未上传" };
}
