import type { PluginContextLike } from "../src/contracts.ts";
import { escapeHtmlAttribute, type HonoAppLike, type HonoContextLike } from "../src/http.ts";

function safeHostCss(value: string | undefined): string | null {
  if (!value) return null;
  try {
    const decoded = decodeURIComponent(value);
    return decoded.startsWith("/") && !decoded.startsWith("//") && !/[\r\n"'<>]/.test(decoded)
      ? decoded
      : null;
  } catch {
    return null;
  }
}

export function renderShell(c: HonoContextLike, ctx: PluginContextLike, surface: "page" | "widget"): string {
  const theme = escapeHtmlAttribute(c.req.query("hana-theme") ?? "inherit");
  const locale = escapeHtmlAttribute(c.req.query("locale") ?? c.req.query("lang") ?? "zh-CN");
  const hostCss = safeHostCss(c.req.query("hana-css"));
  const base = `/api/plugins/${encodeURIComponent(ctx.pluginId)}`;
  return `<!doctype html>
<html lang="${locale}" data-hana-theme="${theme}">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
  <meta name="color-scheme" content="light dark">
  <title>Markdown WeChat</title>
  ${hostCss ? `<link rel="stylesheet" href="${escapeHtmlAttribute(hostCss)}">` : ""}
  <link rel="stylesheet" href="${base}/assets/app.css">
</head>
<body data-surface="${surface}">
  <main id="root" aria-live="polite"></main>
  <noscript>Markdown WeChat requires JavaScript.</noscript>
  <script type="module" src="${base}/assets/app.js"></script>
</body>
</html>`;
}

export default function registerPageRoutes(app: HonoAppLike, ctx: PluginContextLike): void {
  app.get("/page", (c) => c.html(renderShell(c, ctx, "page")));
  app.get("/widget", (c) => c.html(renderShell(c, ctx, "widget")));
}
