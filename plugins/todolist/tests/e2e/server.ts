import fs from "node:fs";
import http from "node:http";
import path from "node:path";

const root = path.resolve(new URL("../..", import.meta.url).pathname);
const pageAsset = path.join(root, "assets/page.js");
const pageStyles = path.join(root, "assets/page.css");
type Todo = { id: string; title: string; status: "pending" | "completed"; version: number; deletedAt: string | null; attentionDate: string | null };
const todos: Todo[] = [];

function send(response: http.ServerResponse, status: number, body: unknown, type = "application/json") {
  response.writeHead(status, { "content-type": `${type}; charset=utf-8`, "access-control-allow-origin": "*" });
  response.end(type === "application/json" ? JSON.stringify(body) : String(body));
}

function readBody(request: http.IncomingMessage): Promise<any> {
  return new Promise((resolve) => { let value = ""; request.on("data", (chunk) => { value += chunk; }); request.on("end", () => { try { resolve(JSON.parse(value || "{}")); } catch { resolve({}); } }); });
}

const server = http.createServer(async (request, response) => {
  const url = new URL(request.url || "/", "http://127.0.0.1:41739");
  if (url.pathname === "/health") return send(response, 200, { ok: true });
  if (url.pathname === "/api/plugins/todolist/assets/page.js") return send(response, 200, fs.readFileSync(pageAsset, "utf8"), "application/javascript");
  if (url.pathname === "/api/plugins/todolist/assets/page.css") return send(response, 200, fs.readFileSync(pageStyles, "utf8"), "text/css");
  if (url.pathname === "/api/plugins/todolist/page") {
    todos.length = 0;
    return send(response, 200, `<!doctype html><html lang="${url.searchParams.get("hana-locale") || "zh-CN"}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Hana Todo</title><link rel="stylesheet" href="/api/plugins/todolist/assets/page.css"></head><body><main id="root"></main><script type="module" src="/api/plugins/todolist/assets/page.js"></script></body></html>`, "text/html");
  }
  if (url.pathname === "/api/plugins/todolist/api/todos" && request.method === "GET") return send(response, 200, { items: todos.filter((todo) => url.searchParams.get("includeTrash") === "true" ? !!todo.deletedAt : !todo.deletedAt), nextCursor: null, storeVersion: 1 });
  if (url.pathname === "/api/plugins/todolist/api/todos" && request.method === "POST") {
    const body = await readBody(request); const todo: Todo = { id: `e2e-${todos.length + 1}`, title: String(body.title || ""), status: "pending", version: 1, deletedAt: null, attentionDate: null }; todos.push(todo); return send(response, 201, { todo, storeVersion: 1 });
  }
  const match = url.pathname.match(/^\/api\/plugins\/todolist\/api\/todos\/([^/]+)(?:\/(complete|reopen|restore))?$/);
  if (match) {
    const todo = todos.find((candidate) => candidate.id === match[1]);
    if (!todo) return send(response, 404, { code: "not_found", detail: "Todo was not found" });
    if (request.method === "PATCH") { const body = await readBody(request); if (body.title) todo.title = String(body.title); }
    if (match[2] === "complete") todo.status = "completed";
    if (match[2] === "reopen" || match[2] === "restore") { todo.status = "pending"; todo.deletedAt = null; }
    if (request.method === "DELETE") todo.deletedAt = new Date().toISOString();
    todo.version += 1;
    return send(response, 200, { todo, storeVersion: 1 });
  }
  if (url.pathname === "/api/plugins/todolist/api/automation/runs" && request.method === "GET") return send(response, 200, { runs: [] });
  if (url.pathname === "/api/plugins/todolist/api/review" && request.method === "GET") return send(response, 200, { inbox: [], overdue: [], upcoming: [], undated: [], recentlyCompleted: [], automation: [] });
  if (url.pathname === "/api/plugins/todolist/api/exchange/export" && request.method === "GET") return send(response, 200, { filename: "hana-todolist-v1.json", content: JSON.stringify({ kind: "hana-todolist", schemaVersion: 1, todos, projects: [] }) });
  return send(response, 404, { code: "not_found", detail: "Route was not found" });
});

server.listen(41739, "127.0.0.1");
