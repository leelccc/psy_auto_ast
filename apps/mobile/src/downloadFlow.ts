export type DownloadSection = {
  title: string;
  content: string;
};

export type DownloadArtifact = {
  filename: string;
  mimeType: string;
  content: string;
  title: string;
  sections?: DownloadSection[];
};

const fileTypes: Record<string, { extension: string; mimeType: string }> = {
  PDF: { extension: "pdf", mimeType: "application/pdf" },
  Word: { extension: "doc", mimeType: "application/msword" },
  图片: { extension: "jpg", mimeType: "image/jpeg" },
  音频: { extension: "m4a", mimeType: "audio/mp4" },
  文字备注: { extension: "txt", mimeType: "text/plain;charset=utf-8" },
};

export function sanitizeDownloadName(value: string): string {
  return value.trim().replace(/[\\/:*?"<>|\s]+/g, "_").replace(/^_+|_+$/g, "");
}

export function buildDownloadArtifact(input: {
  title: string;
  fileType: string;
  sections: DownloadSection[];
}): DownloadArtifact {
  const type = fileTypes[input.fileType] ?? fileTypes.PDF;
  const body = input.sections.length > 0
    ? input.sections.map((section) => `${section.title}\n${section.content}`).join("\n\n")
    : `${input.title}\n\n此文件来自咨询师助手的本地下载副本。`;
  const content = input.fileType === "PDF"
    ? `%PDF-1.4\n% Counselor Assistant Export\n${input.title}\n\n${body}\n%%EOF`
    : body;

  return {
    filename: `${sanitizeDownloadName(input.title)}.${type.extension}`,
    mimeType: type.mimeType,
    content,
    title: input.title,
    sections: input.sections,
  };
}

function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

function wrapCanvasLines(context: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  return text.split("\n").flatMap((paragraph) => {
    if (!paragraph) return [""];
    const lines: string[] = [];
    let line = "";
    for (const character of paragraph) {
      const candidate = `${line}${character}`;
      if (line && context.measureText(candidate).width > maxWidth) {
        lines.push(line);
        line = character;
      } else {
        line = candidate;
      }
    }
    if (line) lines.push(line);
    return lines;
  });
}

async function buildPdfBlob(artifact: DownloadArtifact): Promise<Blob> {
  const { jsPDF } = await import("jspdf");
  const width = 1240;
  const height = 1754;
  const margin = 96;
  const lineHeight = 48;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Canvas is unavailable");

  context.font = "30px sans-serif";
  const lines = wrapCanvasLines(context, artifact.content.replace(/^%PDF-1\.4.*?\n/s, "").replace(/\n%%EOF$/, ""), width - margin * 2);
  const pages: string[][] = [];
  const linesPerPage = Math.floor((height - margin * 2) / lineHeight);
  for (let index = 0; index < lines.length; index += linesPerPage) {
    pages.push(lines.slice(index, index + linesPerPage));
  }

  const pdf = new jsPDF({ unit: "px", format: [width, height], compress: true });
  pages.forEach((pageLines, pageIndex) => {
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, width, height);
    context.fillStyle = "#302b28";
    context.font = pageIndex === 0 ? "bold 34px sans-serif" : "30px sans-serif";
    context.fillText(pageIndex === 0 ? artifact.title : `${artifact.title}（续）`, margin, margin);
    context.font = "30px sans-serif";
    pageLines.forEach((line, lineIndex) => {
      context.fillText(line, margin, margin + 70 + lineIndex * lineHeight);
    });
    if (pageIndex > 0) pdf.addPage([width, height], "portrait");
    pdf.addImage(canvas.toDataURL("image/jpeg", 0.9), "JPEG", 0, 0, width, height, undefined, "FAST");
  });
  return pdf.output("blob");
}

export async function triggerDownload(artifact: DownloadArtifact): Promise<boolean> {
  if (typeof document === "undefined" || typeof URL === "undefined" || typeof Blob === "undefined") return false;
  if (artifact.mimeType === "application/pdf") {
    downloadBlob(await buildPdfBlob(artifact), artifact.filename);
    return true;
  }
  const blob = new Blob([artifact.content], { type: artifact.mimeType });
  downloadBlob(blob, artifact.filename);
  return true;
}

export function scheduleDownload(artifact: DownloadArtifact): void {
  setTimeout(async () => {
    try {
      await triggerDownload(artifact);
    } catch {
      // Some embedded browsers intentionally block downloads; the UI remains usable.
    }
  }, 0);
}

/**
 * 录音纪要 PDF 下载（跨平台）。
 * - Web：沿用已有 jspdf + canvas 流程。
 * - 原生：用 jspdf 文本 API 生成真实 PDF 并保存到本机“下载”目录（弹出系统分享）；
 *   若 jspdf 在原生端不可用，则兜底保存为带格式的 .txt，保证下载真正发生。
 */
export async function downloadSummaryPdf(artifact: DownloadArtifact): Promise<string> {
  if (typeof document !== "undefined" && typeof Blob !== "undefined") {
    await triggerDownload(artifact);
    return artifact.filename;
  }

  const baseName = artifact.filename.replace(/\.pdf$/i, "");
  const sections = artifact.sections ?? [];
  let payload: Uint8Array | string = sections.length > 0
    ? sections.map((section) => `${section.title}\n${"-".repeat(section.title.length)}\n${section.content}`).join("\n\n")
    : artifact.content;
  let mimeType = "text/plain;charset=utf-8";
  let extension = "txt";

  try {
    const { jsPDF } = await import("jspdf");
    const pdf = new jsPDF({ unit: "pt", format: "a4" });
    const margin = 48;
    const maxWidth = pdf.internal.pageSize.getWidth() - margin * 2;
    const pageHeight = pdf.internal.pageSize.getHeight();
    let y = margin;
    pdf.setFontSize(15);
    pdf.text(artifact.title, margin, y);
    y += 24;
    pdf.setFontSize(11);
    for (const section of sections) {
      if (y > pageHeight - margin) {
        pdf.addPage();
        y = margin;
      }
      pdf.text(section.title, margin, y);
      y += 16;
      const lines = pdf.splitTextToSize(section.content, maxWidth) as unknown as string[];
      for (const line of lines) {
        if (y > pageHeight - margin) {
          pdf.addPage();
          y = margin;
        }
        pdf.text(line, margin, y);
        y += 14;
      }
      y += 8;
    }
    payload = new Uint8Array(pdf.output("arraybuffer") as ArrayBuffer);
    mimeType = "application/pdf";
    extension = "pdf";
  } catch {
    // 原生端 jspdf 不可用时，保持文本兜底
  }

  const [{ Directory, File, Paths }, sharing] = await Promise.all([
    import("expo-file-system"),
    import("expo-sharing"),
  ]);
  const downloads = new Directory(Paths.document, "downloads");
  downloads.create({ idempotent: true, intermediates: true });
  const destination = new File(downloads, `${baseName}.${extension}`);
  destination.write(payload);
  if (await sharing.isAvailableAsync()) {
    await sharing.shareAsync(destination.uri, {
      mimeType,
      dialogTitle: `分享 ${artifact.title}`,
    });
  }
  return destination.uri;
}
