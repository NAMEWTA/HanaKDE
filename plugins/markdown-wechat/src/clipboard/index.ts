import { markdownToPlainText, stripPreviewMeta } from "../renderer/index.ts";

export type CopyMethod = "clipboard-item" | "selection" | "write-text" | "none";
export interface CopyResult { ok: boolean; method: CopyMethod; error?: string }

interface ClipboardEnvironment {
  navigator?: Navigator;
  document?: Document;
  window?: Window;
  ClipboardItem?: typeof ClipboardItem;
  Blob?: typeof Blob;
}

function environment(input: ClipboardEnvironment = {}): Required<ClipboardEnvironment> {
  const targetWindow = input.window ?? globalThis.window;
  return {
    navigator: input.navigator ?? globalThis.navigator,
    document: input.document ?? globalThis.document,
    window: targetWindow,
    ClipboardItem: input.ClipboardItem ?? globalThis.ClipboardItem,
    Blob: input.Blob ?? globalThis.Blob,
  };
}

export async function copyRichText(
  html: string,
  plainText: string,
  injected: ClipboardEnvironment = {},
): Promise<CopyResult> {
  const cleanHtml = stripPreviewMeta(html);
  try {
    const env = environment(injected);
    if (typeof env.navigator.clipboard?.write === "function" && env.ClipboardItem && env.Blob) {
      await env.navigator.clipboard.write([new env.ClipboardItem({
        "text/html": new env.Blob([cleanHtml], { type: "text/html" }),
        "text/plain": new env.Blob([plainText], { type: "text/plain" }),
      })]);
      return { ok: true, method: "clipboard-item" };
    }
  } catch {
    // Fall through to the selection path while the user gesture is still active.
  }
  return copyRichSelection(cleanHtml, injected);
}

function copyRichSelection(html: string, injected: ClipboardEnvironment): CopyResult {
  let host: HTMLElement | null = null;
  let selection: Selection | null = null;
  try {
    const env = environment(injected);
    host = env.document.createElement("div");
    host.contentEditable = "true";
    host.setAttribute("aria-hidden", "true");
    host.style.cssText = "position:fixed;left:-10000px;top:0;width:1px;height:1px;overflow:hidden;";
    host.innerHTML = html;
    env.document.body.appendChild(host);
    const range = env.document.createRange();
    range.selectNodeContents(host);
    selection = env.window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
    const ok = env.document.execCommand("copy");
    return ok ? { ok: true, method: "selection" } : { ok: false, method: "none", error: "The browser rejected rich clipboard copy" };
  } catch (error) {
    return { ok: false, method: "none", error: error instanceof Error ? error.message : String(error) };
  } finally {
    selection?.removeAllRanges();
    host?.remove();
  }
}

export async function copyMarkdownText(
  markdown: string,
  hostWriteText?: (input: { text: string }) => Promise<unknown>,
): Promise<CopyResult> {
  try {
    if (hostWriteText) {
      await hostWriteText({ text: markdown });
      return { ok: true, method: "write-text" };
    }
    await navigator.clipboard.writeText(markdown);
    return { ok: true, method: "write-text" };
  } catch (error) {
    return { ok: false, method: "none", error: error instanceof Error ? error.message : String(error) };
  }
}

export function clipboardPlainText(markdown: string): string {
  return markdownToPlainText(markdown);
}
