export interface DownloadArtifact {
  filename: string;
  mime: "text/markdown;charset=utf-8" | "text/html;charset=utf-8";
  content: string;
}

export interface DownloadResult { ok: boolean; filename: string; error?: string }

export function safeDocumentName(value: unknown): string {
  const normalized = String(value ?? "article")
    .normalize("NFKC")
    .replace(/[<>:"/\\|?*\u0000-\u001F]/g, "-")
    .replace(/\s+/g, " ")
    .replace(/[. ]+$/g, "")
    .trim()
    .slice(0, 80);
  return normalized || "article";
}

export function createDownloadArtifact(
  kind: "markdown" | "html",
  title: unknown,
  content: string,
): DownloadArtifact {
  const base = safeDocumentName(title);
  return kind === "markdown"
    ? { filename: `${base}.md`, mime: "text/markdown;charset=utf-8", content }
    : { filename: `${base}.html`, mime: "text/html;charset=utf-8", content };
}

export function downloadArtifact(
  artifact: DownloadArtifact,
  injected: { document?: Document; URL?: typeof URL; Blob?: typeof Blob } = {},
): DownloadResult {
  const documentRef = injected.document ?? globalThis.document;
  const URLRef = injected.URL ?? globalThis.URL;
  const BlobRef = injected.Blob ?? globalThis.Blob;
  let objectUrl: string | null = null;
  let anchor: HTMLAnchorElement | null = null;
  try {
    if (!documentRef || !URLRef?.createObjectURL || !BlobRef) throw new Error("Browser download is unavailable");
    const blob = new BlobRef([artifact.content], { type: artifact.mime });
    objectUrl = URLRef.createObjectURL(blob);
    anchor = documentRef.createElement("a");
    anchor.href = objectUrl;
    anchor.download = artifact.filename;
    anchor.rel = "noopener";
    anchor.style.display = "none";
    documentRef.body.appendChild(anchor);
    anchor.click();
    return { ok: true, filename: artifact.filename };
  } catch (error) {
    return { ok: false, filename: artifact.filename, error: error instanceof Error ? error.message : String(error) };
  } finally {
    anchor?.remove();
    if (objectUrl) URLRef.revokeObjectURL(objectUrl);
  }
}
