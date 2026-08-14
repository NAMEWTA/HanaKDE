import { Hono } from "hono";

export default function register(app: Hono) {
  app.get("/page", (c) => c.html(`<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Hana Todo</title></head>
<body><main id="root"></main><script type="module" src="/api/plugins/todolist/assets/page.js"></script></body></html>`));
}
