export type MaterialCategory = "recording" | "scale" | "homework" | "other";

export type SessionMaterial = {
  id: string;
  sessionId: string;
  category: MaterialCategory;
  title: string;
  meta: string;
  preservable: boolean;
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
    meta: `${input.fileType} · 刚刚添加 · 待决定长期保存`,
    preservable: input.category !== "recording",
  };
  return [material, ...materials];
}

export function updateSessionMaterial(
  materials: SessionMaterial[],
  id: string,
  patch: { title: string; fileType: string },
): SessionMaterial[] {
  const title = patch.title.trim();
  if (!title) return materials;
  return materials.map((material) => material.id === id
    ? { ...material, title, meta: `${patch.fileType} · 刚刚更新 · 待决定长期保存` }
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
    return "录音上传后需先归档；转写与纪要完成后才能参与本次记录生成。";
  }
  return "本次材料已更新。已有记录草稿不会自动覆盖，可重新生成草稿并确认覆盖。";
}
