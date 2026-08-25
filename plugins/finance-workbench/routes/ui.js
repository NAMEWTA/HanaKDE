
export default function registerPluginUiRoutes(app, ctx) {
  app.get("/page", (c) => c.html(renderShell(c, ctx, "page")));
  app.get("/widget", (c) => c.html(renderShell(c, ctx, "widget")));
}

export function renderShell(c, ctx, surface) {
  const hanaCss = safeCssUrl(c.req.query("hana-css"));
  const theme = c.req.query("hana-theme") || "inherit";
  const locale = /^[a-z]{2}(?:-[A-Z]{2})?$/.test(c.req.query("locale") || "") ? c.req.query("locale") : "zh-CN";
  const assetBase = `/api/plugins/${encodeURIComponent(ctx.pluginId)}/assets`;
  const title = "Finance Workbench";

  return `<!doctype html>
<html lang="${escapeAttr(locale)}" data-hana-theme="${escapeAttr(theme)}">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="color-scheme" content="light dark">
  <title>${escapeHtml(title)}</title>
  ${hanaCss ? `<link rel="stylesheet" href="${escapeAttr(hanaCss)}">` : ""}
  <link rel="stylesheet" href="${assetBase}/panel.css">
</head>
<body data-hana-theme="${escapeAttr(theme)}" data-surface="${surface}">
  <main id="root" data-surface="${surface}" aria-live="polite"></main>
  <noscript>Finance Workbench requires JavaScript.</noscript>
  <script type="module" src="${assetBase}/panel.js"></script>
</body>
</html>`;
}

function safeCssUrl(value) {
  if (!value) return "";
  try {
    const decoded = decodeURIComponent(value);
    return decoded.startsWith("/") && !decoded.startsWith("//") && !/[\r\n"'<>]/.test(decoded) ? decoded : "";
  } catch {
    return "";
  }
}

function escapeAttr(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;");
}

function escapeHtml(value) {
  return escapeAttr(value).replace(/>/g, "&gt;");
}
