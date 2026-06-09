import type { StoredFileReference } from "./fileService";

export type MaterialCategory = "recording" | "scale" | "homework" | "other";

export type SessionMaterial = {
  id: string;
  sessionId: string;
  category: MaterialCategory;
  title: string;
  meta: string;
  preservable: boolean;
  file: StoredFileReference;
};

const materialMimeTypes: Record<string, string> = {
  PDF: "application/pdf",
  图片: "image/jpeg",
  音频: "audio/mp4",
  文字备注: "text/plain",
};

export const materialCategoryCopy: Record<MaterialCategory, { title: string; uploadLabel: string; empty: string }> = {
  recording: {
    title: "录音资料",
    uploadLabel: "上传录音",
    empty: "本次尚无录音，可上传音频后进入归档与转写流程。",
  },
  scale: {
    title: "量表资料",
    uploadLabel: "上传量表",
    empty: "本次尚未上传量表，支持 PDF 或图片。",
  },
  homework: {
    title: "咨询作业",
    uploadLabel: "添加作业",
    empty: "本次尚未添加作业，可上传 PDF、图片或添加文字备注。",
  },
  other: {
    title: "其他资料",
    uploadLabel: "添加资料",
    empty: "本次尚无其他资料，可添加 PDF、图片或文字备注。",
  },
};

export function addSessionMaterial(
  materials: SessionMaterial[],
  input: { sessionId: string; category: MaterialCategory; title: string; fileType: string },
): SessionMaterial[] {
  const title = input.title.trim();
  if (!title) return materials;

  const material: SessionMaterial = {
    id: `${input.sessionId}-${input.category}-${materials.length + 1}`,
    sessionId: input.sessionId,
    category: input.category,
    title,
    meta: `${input.fileType} · 待后端上传 · 待决定长期保存`,
    preservable: input.category !== "recording",
    file: {
      fileId: null,
      filename: title,
      mimeType: materialMimeTypes[input.fileType] ?? "application/octet-stream",
      sizeBytes: null,
      uploadStatus: "pending",
      sourceKind: "prototype",
    },
  };
  return [material, ...materials];
}

export function updateSessionMaterial(
  materials: SessionMaterial[],
  id: string,
  patch: { title: string; fileType: string; file?: StoredFileReference },
): SessionMaterial[] {
  const title = patch.title.trim();
  if (!title) return materials;
  return materials.map((material) => material.id === id
    ? {
        ...material,
        title,
        meta: `${patch.fileType} · 待后端替换 · 待决定长期保存`,
        file: patch.file ?? {
          ...material.file,
          filename: title,
          mimeType: materialMimeTypes[patch.fileType] ?? "application/octet-stream",
        },
      }
    : material);
}

export function removeSessionMaterial(materials: SessionMaterial[], id: string): SessionMaterial[] {
  return materials.filter((material) => material.id !== id);
}

export function removeMaterialsForSession(materials: SessionMaterial[], sessionId: string): SessionMaterial[] {
  return materials.filter((material) => material.sessionId !== sessionId);
}

export function getMaterialUpdateMessage(category: MaterialCategory) {
  if (category === "recording") {
    return "录音上传接口已预留；接入 MinIO 后需先完成上传与归档，再进入转写和纪要。";
  }
  return "文件上传接口已预留。接入 MinIO 后材料会参与记录生成；已有内容可确认后重新生成草稿。";
}
