import type { HonoAppLike } from "../src/interfaces/http.ts";

type PageContext = Parameters<Parameters<HonoAppLike["get"]>[1]>[0];

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]!);
}

function safeCssUrl(value: string | undefined): string | undefined {
  if (!value) return undefined;
  try {
    const decoded = decodeURIComponent(value);
    if (decoded.startsWith("/") && !decoded.startsWith("//") && !/[\r\n"'<>]/.test(decoded)) return decoded;
    return undefined;
  } catch {
    return undefined;
  }
}

function locale(value: string | undefined): string {
  return ["zh-CN", "zh-TW", "ja", "ko", "en"].includes(value ?? "") ? value! : "zh-CN";
}

export function renderPage(c: PageContext): string {
  const lang = locale(c.req.query("locale") ?? c.req.query("lang"));
  const theme = escapeHtml(c.req.query("hana-theme") ?? "inherit");
  const hostCss = safeCssUrl(c.req.query("hana-css"));
  const cssLinks = [
    hostCss ? `<link rel="stylesheet" href="${escapeHtml(hostCss)}">` : "",
    `<link rel="stylesheet" href="/api/plugins/todolist/assets/page.css">`,
  ].filter(Boolean).join("\n    ");
  return `<!doctype html>
<html lang="${escapeHtml(lang)}" data-hana-theme="${theme}">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
  <meta name="color-scheme" content="light dark">
  <title>Hana Todo</title>
  ${cssLinks}
</head>
<body>
  <main id="root" aria-live="polite"></main>
  <noscript>Hana Todo requires JavaScript.</noscript>
  <script type="module" src="/api/plugins/todolist/assets/page.js"></script>
</body>
</html>`;
}

export default function register(app: HonoAppLike): void {
  app.get("/page", (c) => c.html(renderPage(c)));
}
