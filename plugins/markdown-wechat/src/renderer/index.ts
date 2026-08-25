import MarkdownIt from "markdown-it";
import type Token from "markdown-it/lib/token.mjs";
import type { ArticleSettings } from "../contracts.ts";
import { FONT_STACKS, resolveFont, resolveFontSize, resolveTheme } from "../theme/themes.ts";

export interface RenderResult {
  html: string;
  plainText: string;
  diagnostics: string[];
  settings: ArticleSettings;
}

function escapeAttribute(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function lineAttribute(token: Token): string {
  return token.map ? ` data-line="${token.map[0]}"` : "";
}

function safeMediaSource(value: string): boolean {
  const normalized = value.trim().toLowerCase();
  return /^data:image\/(?:png|jpe?g|gif|webp|avif);base64,/.test(normalized)
    || normalized.startsWith("blob:");
}

function safeLinkTarget(value: string): boolean {
  const normalized = value.trim();
  return normalized.startsWith("#")
    || (normalized.startsWith("/") && !normalized.startsWith("//"));
}

function preprocessVideos(markdown: string): string {
  return markdown.replace(/@\[video(?::([^\]]+))?\]\(([^)]+)\)/gi, (_match, label, source) => (
    `![__HANA_VIDEO__${label ? `:${label}` : ""}](${source})`
  ));
}

function styleToken(token: Token, style: string): void {
  token.attrSet("style", style);
  if (token.map) token.attrSet("data-line", String(token.map[0]));
}

function configuredMarkdown(settings: ArticleSettings, diagnostics: string[]): MarkdownIt {
  const theme = resolveTheme(settings.theme);
  const font = FONT_STACKS[resolveFont(settings.font)];
  const size = resolveFontSize(settings.fontSize);
  const md = new MarkdownIt({ html: false, linkify: true, breaks: true, typographer: true });
  const defaultRenderToken = md.renderer.renderToken.bind(md.renderer);

  md.renderer.rules.heading_open = (tokens, index, options) => {
    const token = tokens[index]!;
    const level = Number(token.tag.slice(1));
    const sizes = [30, 25, 21, 18, 16, 15];
    styleToken(token, [
      `margin:${level <= 2 ? "1.5em" : "1.25em"} 0 0.65em`,
      `font-family:${font}`,
      `font-size:${sizes[level - 1] ?? 15}px`,
      "line-height:1.35",
      `color:${theme.ink}`,
      `font-weight:${level <= 2 ? "750" : "680"}`,
      level === 2 ? `padding-left:0.65em;border-left:4px solid ${theme.accent}` : "",
    ].filter(Boolean).join(";"));
    return defaultRenderToken(tokens, index, options);
  };
  md.renderer.rules.paragraph_open = (tokens, index, options) => {
    const token = tokens[index]!;
    styleToken(token, `margin:0.9em 0;font-family:${font};font-size:${size}px;line-height:1.85;color:${theme.ink};letter-spacing:0`);
    return defaultRenderToken(tokens, index, options);
  };
  md.renderer.rules.blockquote_open = (tokens, index, options) => {
    const token = tokens[index]!;
    styleToken(token, `margin:1.1em 0;padding:0.55em 1em;border-left:4px solid ${theme.accent};background:${theme.quoteBackground};color:${theme.muted}`);
    return defaultRenderToken(tokens, index, options);
  };
  for (const rule of ["bullet_list_open", "ordered_list_open"] as const) {
    md.renderer.rules[rule] = (tokens, index, options) => {
      const token = tokens[index]!;
      styleToken(token, `margin:0.8em 0;padding-left:1.6em;font-family:${font};font-size:${size}px;line-height:1.8;color:${theme.ink}`);
      return defaultRenderToken(tokens, index, options);
    };
  }
  md.renderer.rules.hr = (tokens, index) => `<hr${lineAttribute(tokens[index]!)} style="margin:1.7em auto;border:0;border-top:1px solid ${theme.border};width:72%;">`;
  md.renderer.rules.table_open = (tokens, index) => `<div${lineAttribute(tokens[index]!)} style="margin:1.2em 0;overflow-x:auto;"><table style="width:100%;border-collapse:collapse;font-family:${font};font-size:${Math.max(13, size - 1)}px;color:${theme.ink};">`;
  md.renderer.rules.table_close = () => "</table></div>";
  md.renderer.rules.th_open = () => `<th style="padding:0.6em 0.7em;border:1px solid ${theme.border};background:${theme.accentSoft};text-align:left;font-weight:700;">`;
  md.renderer.rules.td_open = () => `<td style="padding:0.6em 0.7em;border:1px solid ${theme.border};vertical-align:top;">`;
  md.renderer.rules.code_inline = (tokens, index) => `<code style="padding:0.12em 0.35em;border-radius:4px;background:${theme.codeBackground};color:${theme.accent};font-family:'JetBrains Mono',monospace;font-size:0.9em;">${md.utils.escapeHtml(tokens[index]!.content)}</code>`;
  md.renderer.rules.fence = (tokens, index) => {
    const token = tokens[index]!;
    const language = token.info.trim().split(/\s+/)[0] ?? "";
    return `<pre${lineAttribute(token)} style="margin:1.15em 0;padding:1em;overflow-x:auto;border:1px solid ${theme.border};border-radius:6px;background:${theme.codeBackground};color:${theme.ink};line-height:1.65;"><code data-language="${escapeAttribute(language)}" style="font-family:'JetBrains Mono','SFMono-Regular',monospace;font-size:13px;white-space:pre;">${md.utils.escapeHtml(token.content)}</code></pre>`;
  };
  md.renderer.rules.link_open = (tokens, index, options) => {
    const token = tokens[index]!;
    const href = token.attrGet("href") ?? "";
    if (!safeLinkTarget(href)) {
      diagnostics.push("external_link_disabled");
      token.tag = "span";
      token.attrs = (token.attrs ?? []).filter(([name]) => name !== "href");
      const close = tokens.slice(index + 1).find((candidate) => candidate.type === "link_close");
      if (close) close.tag = "span";
      token.attrSet("title", "External link disabled");
    }
    token.attrSet("style", `color:${theme.accent};text-decoration:none;border-bottom:1px solid ${theme.accent}`);
    if (token.tag === "a") token.attrSet("rel", "noopener noreferrer");
    return defaultRenderToken(tokens, index, options);
  };
  md.renderer.rules.image = (tokens, index) => {
    const token = tokens[index]!;
    const source = token.attrGet("src") ?? "";
    const title = token.attrGet("title");
    const alt = token.content || token.attrGet("alt") || "media";
    if (alt.startsWith("__HANA_VIDEO__")) {
      const label = alt.split(":").slice(1).join(":") || source || "Local video";
      diagnostics.push("video_placeholder");
      return `<section style="margin:1.2em 0;padding:1.1em;border:1px dashed ${theme.border};background:${theme.accentSoft};text-align:center;color:${theme.muted};"><strong style="display:block;color:${theme.ink};">Video placeholder</strong><span style="font-size:0.85em;word-break:break-all;">${escapeAttribute(label)}</span><small style="display:block;margin-top:0.45em;">Replace this placeholder in the WeChat editor.</small></section>`;
    }
    if (!safeMediaSource(source)) {
      diagnostics.push("media_placeholder");
      return `<figure style="margin:1.2em 0;padding:1em;border:1px dashed ${theme.border};background:${theme.accentSoft};text-align:center;color:${theme.muted};"><figcaption>Image unavailable: ${escapeAttribute(alt)}</figcaption></figure>`;
    }
    return `<figure style="margin:1.2em 0;text-align:center;"><img src="${escapeAttribute(source)}" alt="${escapeAttribute(alt)}"${title ? ` title="${escapeAttribute(title)}"` : ""} style="display:block;max-width:100%;height:auto;margin:0 auto;border-radius:4px;"><figcaption style="margin-top:0.45em;color:${theme.muted};font-size:0.82em;">${escapeAttribute(alt)}</figcaption></figure>`;
  };
  return md;
}

export function renderMarkdown(markdown: string, input: Partial<ArticleSettings> = {}): RenderResult {
  if (typeof markdown !== "string") throw new TypeError("Markdown must be a string");
  const settings: ArticleSettings = {
    theme: resolveTheme(input.theme).id,
    font: resolveFont(input.font),
    fontSize: resolveFontSize(input.fontSize),
  };
  const diagnostics: string[] = [];
  const md = configuredMarkdown(settings, diagnostics);
  const body = md.render(preprocessVideos(markdown));
  const theme = resolveTheme(settings.theme);
  const html = `<article data-markdown-wechat="1" style="box-sizing:border-box;max-width:720px;margin:0 auto;padding:4px 2px;font-family:${FONT_STACKS[settings.font]};font-size:${settings.fontSize}px;line-height:1.85;color:${theme.ink};word-break:break-word;">${body}</article>`;
  return { html, plainText: markdownToPlainText(markdown), diagnostics: [...new Set(diagnostics)], settings };
}

export function stripPreviewMeta(html: string): string {
  return html
    .replace(/\sdata-line="[^"]*"/g, "")
    .replace(/\sdata-preview-[a-z-]+="[^"]*"/g, "");
}

export function markdownToPlainText(markdown: string): string {
  return markdown
    .replace(/```[^\n]*\n([\s\S]*?)```/g, "$1")
    .replace(/!\[([^\]]*)\]\([^)]+\)/g, "$1")
    .replace(/@\[video(?::([^\]]+))?\]\([^)]+\)/gi, "$1")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/^\s{0,3}#{1,6}\s+/gm, "")
    .replace(/^\s*>\s?/gm, "")
    .replace(/^\s*[-+*]\s+/gm, "")
    .replace(/^\s*\d+[.)]\s+/gm, "")
    .replace(/[*_~`]/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function createWechatDocument(markdown: string, settings: Partial<ArticleSettings> = {}, title = "Markdown WeChat Article"): string {
  const rendered = renderMarkdown(markdown, settings);
  return `<!doctype html>\n<html lang="zh-CN">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width,initial-scale=1">\n<title>${escapeAttribute(title)}</title>\n</head>\n<body>\n${stripPreviewMeta(rendered.html)}\n</body>\n</html>\n`;
}
