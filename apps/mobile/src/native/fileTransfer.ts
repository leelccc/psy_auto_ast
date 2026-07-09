import type { PickedLocalFile } from "./filePicker";


type Fetcher = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>;

export type UploadDependencies = {
  readBody: (file: PickedLocalFile) => Promise<Blob>;
  fetch: Fetcher;
};

export type DownloadDependencies = {
  fetch?: Fetcher;
  document?: Document;
  createObjectUrl?: (blob: Blob) => string;
  revokeObjectUrl?: (url: string) => void;
  openWindow?: (url: string, target: string, features: string) => unknown;
};

async function defaultReadBody(file: PickedLocalFile): Promise<Blob> {
  if (file.webFile) return file.webFile;
  const { File: ExpoFile } = await import("expo-file-system");
  return new ExpoFile(file.uri);
}

async function defaultFetch(
  input: string | URL | Request,
  init?: RequestInit,
): Promise<Response> {
  const { fetch: expoFetch } = await import("expo/fetch");
  const expoInit = init
    ? { ...init, body: init.body ?? undefined }
    : undefined;
  return expoFetch(
    String(input),
    expoInit as Parameters<typeof expoFetch>[1],
  );
}

export async function uploadLocalFile(
  file: PickedLocalFile,
  uploadUrl: string,
  uploadHeaders: Record<string, string>,
  dependencies: UploadDependencies = {
    readBody: defaultReadBody,
    fetch: defaultFetch,
  },
  onProgress?: (progress: number) => void,
): Promise<void> {
  onProgress?.(0);
  const body = await dependencies.readBody(file);
  const response = await dependencies.fetch(uploadUrl, {
    method: "PUT",
    headers: uploadHeaders,
    body,
  });
  if (!response.ok) {
    throw new Error(`文件上传失败（HTTP ${response.status}）。`);
  }
  onProgress?.(1);
}

function safeFilename(filename: string): string {
  return filename.replace(/[\\/:*?"<>|]+/g, "-").trim() || "download";
}

export async function downloadAndShareFile(
  downloadUrl: string,
  filename: string,
  mimeType: string,
  dependencies: DownloadDependencies = {},
): Promise<string> {
  const webDocument = dependencies.document ?? (typeof document !== "undefined" ? document : undefined);
  if (webDocument) {
    try {
      const fetcher = dependencies.fetch ?? fetch;
      const response = await fetcher(downloadUrl);
      if (!response.ok) throw new Error(`文件下载失败（HTTP ${response.status}）。`);
      const downloaded = await response.blob();
      const blob = mimeType && downloaded.type !== mimeType
        ? new Blob([downloaded], { type: mimeType })
        : downloaded;
      const createObjectUrl = dependencies.createObjectUrl ?? URL.createObjectURL.bind(URL);
      const revokeObjectUrl = dependencies.revokeObjectUrl ?? URL.revokeObjectURL.bind(URL);
      const objectUrl = createObjectUrl(blob);
      const anchor = webDocument.createElement("a");
      anchor.href = objectUrl;
      anchor.download = safeFilename(filename);
      anchor.rel = "noopener";
      anchor.style.display = "none";
      webDocument.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      setTimeout(() => revokeObjectUrl(objectUrl), 0);
      return objectUrl;
    } catch (error) {
      const openWindow = dependencies.openWindow
        ?? (typeof window !== "undefined" ? window.open.bind(window) : undefined);
      if (!openWindow) throw error;
      openWindow(downloadUrl, "_blank", "noopener,noreferrer");
      return downloadUrl;
    }
  }

  const [{ Directory, File, Paths }, sharing] = await Promise.all([
    import("expo-file-system"),
    import("expo-sharing"),
  ]);
  const downloads = new Directory(Paths.document, "downloads");
  downloads.create({ idempotent: true, intermediates: true });
  const destination = new File(downloads, safeFilename(filename));
  const downloaded = await File.downloadFileAsync(
    downloadUrl,
    destination,
    { idempotent: true },
  );
  if (await sharing.isAvailableAsync()) {
    await sharing.shareAsync(downloaded.uri, {
      mimeType,
      dialogTitle: `分享 ${filename}`,
    });
  }
  return downloaded.uri;
}
