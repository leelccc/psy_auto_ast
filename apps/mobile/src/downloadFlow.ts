export type DownloadSection = {
  title: string;
  content: string;
};

export type DownloadArtifact = {
  filename: string;
  mimeType: string;
  content: string;
  title: string;
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
