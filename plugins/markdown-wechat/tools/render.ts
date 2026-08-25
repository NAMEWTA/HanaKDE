import fs from "node:fs";
import path from "node:path";
import { createMediaDetails } from "@hana/plugin-runtime";
import type { ArticleSettings, PluginContextLike } from "../src/contracts.ts";
import { createWechatDocument, renderMarkdown } from "../src/renderer/index.ts";
import { decodeResourceText } from "../routes/resource-io.ts";

export const name = "render";
export const description = [
  "Render Markdown as safe WeChat article HTML.",
  "Provide exactly one of markdown or resourceRef.",
  "The tool is pure output: it never changes the workspace or the Page draft.",
  "With a session context it also returns an HTML SessionFile; without a session it returns inline HTML only.",
].join(" ");

export const parameters = {
  type: "object",
  properties: {
    markdown: { type: "string", description: "Markdown source to render." },
    resourceRef: { type: "object", description: "A Hana ResourceRef containing Markdown text." },
    title: { type: "string", description: "Optional article title used for the HTML filename." },
    theme: { type: "string", enum: ["editorial", "jade", "signal"] },
    font: { type: "string", enum: ["sans", "serif", "mono"] },
    fontSize: { type: "number", minimum: 13, maximum: 22 },
  },
  additionalProperties: false,
};

export const sessionPermission = {
  kind: "plugin_output",
  describeSideEffect: () => ({
    kind: "session_file_output",
    summary: "Render Markdown into plugin-private HTML and register it as SessionFile media when a session is available.",
    ruleId: "markdown-wechat-render-output",
  }),
};

function failure(code: string, message: string): Record<string, unknown> {
  return {
    content: [{ type: "text", text: `Markdown WeChat render failed: ${message}` }],
    details: { error: { code, message } },
  };
}

function safeFilename(value: unknown): string {
  const normalized = String(value ?? "article")
    .normalize("NFKC")
    .replace(/[^\p{L}\p{N}._-]+/gu, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 72);
  return `${normalized || "article"}.html`;
}

function sessionAvailable(ctx: PluginContextLike): boolean {
  return Boolean(
    (ctx.sessionId || ctx.sessionPath || ctx.sessionRef)
    && typeof ctx.stageFile === "function",
  );
}

export async function execute(input: Record<string, unknown> = {}, ctx: PluginContextLike): Promise<Record<string, unknown>> {
  const hasMarkdown = typeof input.markdown === "string";
  const hasResource = Boolean(input.resourceRef && typeof input.resourceRef === "object" && !Array.isArray(input.resourceRef));
  if (hasMarkdown === hasResource) {
    return failure("invalid_input", "Provide exactly one of markdown or resourceRef");
  }

  let markdown: string;
  try {
    if (hasMarkdown) {
      markdown = input.markdown as string;
    } else {
      const result = await ctx.resources.read(input.resourceRef as Record<string, unknown>);
      markdown = decodeResourceText(result);
    }
  } catch (error) {
    return failure("resource_denied", error instanceof Error ? error.message : String(error));
  }
  if (!markdown.trim()) return failure("invalid_input", "Markdown is empty");

  const settings: Partial<ArticleSettings> = {
    theme: input.theme as ArticleSettings["theme"],
    font: input.font as ArticleSettings["font"],
    fontSize: input.fontSize as number,
  };
  let rendered;
  let documentHtml: string;
  try {
    rendered = renderMarkdown(markdown, settings);
    documentHtml = createWechatDocument(markdown, settings, typeof input.title === "string" ? input.title : "Markdown WeChat Article");
  } catch (error) {
    return failure("render_failed", error instanceof Error ? error.message : String(error));
  }

  const baseDetails: Record<string, unknown> = {
    markdownWechat: {
      kind: "render",
      html: documentHtml,
      diagnostics: rendered.diagnostics,
      sessionFile: sessionAvailable(ctx) ? "pending" : "unavailable_without_session",
    },
  };

  if (!sessionAvailable(ctx)) {
    return {
      content: [{ type: "text", text: `Rendered Markdown WeChat HTML (no session file).\n\n${documentHtml}` }],
      details: baseDetails,
    };
  }

  const outputDir = path.join(ctx.dataDir, "generated");
  const filename = safeFilename(input.title);
  const outputPath = path.join(outputDir, `${Date.now()}-${filename}`);
  try {
    fs.mkdirSync(outputDir, { recursive: true });
    fs.writeFileSync(outputPath, documentHtml, { encoding: "utf8", mode: 0o600 });
    const staged = ctx.stageFile!({
      ...(ctx.sessionId ? { sessionId: ctx.sessionId } : {}),
      ...(ctx.sessionPath ? { sessionPath: ctx.sessionPath } : {}),
      ...(ctx.sessionRef ? { sessionRef: ctx.sessionRef } : {}),
      filePath: outputPath,
      label: filename,
    });
    const mediaItem = staged.mediaItem && typeof staged.mediaItem === "object"
      ? staged.mediaItem as never
      : staged as never;
    return {
      content: [{ type: "text", text: `Rendered Markdown WeChat HTML and created SessionFile ${filename}.\n\n${documentHtml}` }],
      details: {
        ...baseDetails,
        markdownWechat: { ...(baseDetails.markdownWechat as object), sessionFile: "created", filename },
        ...createMediaDetails([mediaItem]),
      },
    };
  } catch (error) {
    try { fs.unlinkSync(outputPath); } catch {}
    return failure("stage_failed", error instanceof Error ? error.message : String(error));
  }
}
