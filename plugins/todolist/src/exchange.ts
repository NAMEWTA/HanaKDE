import { createHash } from "node:crypto";
import { TodoError } from "./errors.ts";
import { TodoApplication } from "./service.ts";
import type { StoreState, Todo } from "./types.ts";

export const EXCHANGE_VERSION = 1;
type Preview = { id: string; digest: string; sourceDigest: string; targetStoreVersion: number; commandId: string; todos: Todo[]; projects: StoreState["projects"]; createdAt: string; committed: boolean };

function digest(value: unknown) { return createHash("sha256").update(JSON.stringify(value)).digest("hex"); }
function rejectSensitive(value: unknown, depth = 0): void {
  if (depth > 8) throw new TodoError("invalid_schema", "Exchange document is too deep");
  if (!value || typeof value !== "object") return;
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    if (/__proto__|constructor|prototype|secret|token|transcript|messages|absolutePath|workspacePath/i.test(key)) throw new TodoError("invalid_schema", "Exchange document contains a forbidden field");
    rejectSensitive(item, depth + 1);
  }
}

function parseDocument(input: unknown) {
  if (typeof input === "string" && input.trimStart().startsWith("SQLite format 3")) throw new TodoError("unsupported_format", "SQLite exchange is not supported");
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new TodoError("invalid_schema", "Exchange document must be JSON object");
  rejectSensitive(input);
  const doc = input as any;
  if (doc.schemaVersion !== EXCHANGE_VERSION || doc.kind !== "hana-todolist") throw new TodoError("unsupported_format", "Exchange version is not supported");
  if (!Array.isArray(doc.todos) || !Array.isArray(doc.projects)) throw new TodoError("invalid_schema", "Exchange entities are invalid");
  return { schemaVersion: EXCHANGE_VERSION, kind: "hana-todolist", todos: doc.todos as Todo[], projects: doc.projects as StoreState["projects"] };
}

export class TodoExchange {
  private previews = new Map<string, Preview>();
  private readonly app: TodoApplication;
  private readonly clock: () => string;

  constructor(app: TodoApplication, clock = () => new Date().toISOString()) {
    this.app = app;
    this.clock = clock;
  }

  preview(input: unknown, commandId: string) {
    if (!commandId || commandId.length > 128) throw new TodoError("validation", "commandId is required");
    const document = parseDocument(input);
    const snapshot = this.app.store.snapshot();
    const sourceDigest = digest(document);
    const id = digest(`${sourceDigest}:${snapshot.storeVersion}:${commandId}`).slice(0, 32);
    const conflicts = document.todos.filter((todo) => snapshot.todos.some((current) => current.id === todo.id));
    const preview: Preview = { id, digest: digest({ sourceDigest, targetStoreVersion: snapshot.storeVersion, commandId }), sourceDigest, targetStoreVersion: snapshot.storeVersion, commandId, todos: document.todos, projects: document.projects, createdAt: this.clock(), committed: false };
    this.previews.set(id, preview);
    return { previewId: id, sourceDigest, targetStoreVersion: snapshot.storeVersion, counts: { todos: document.todos.length, projects: document.projects.length }, conflicts: conflicts.map((todo) => ({ id: todo.id, kind: "duplicate" })), canCommit: true };
  }

  commit(previewId: string) {
    const preview = this.previews.get(previewId);
    if (!preview) throw new TodoError("preview_stale", "Preview was not found");
    if (preview.committed) throw new TodoError("already_committed", "Preview was already committed");
    const snapshot = this.app.store.snapshot();
    if (snapshot.storeVersion !== preview.targetStoreVersion) throw new TodoError("preview_stale", "Store changed after preview");
    const result = this.app.store.transact((draft) => {
      const projectIds = new Set(draft.projects.map((project) => project.id));
      for (const project of preview.projects) if (!projectIds.has(project.id)) draft.projects.push(structuredClone(project));
      const todoIds = new Set(draft.todos.map((todo) => todo.id));
      for (const todo of preview.todos) if (!todoIds.has(todo.id)) draft.todos.push(structuredClone(todo));
      draft.exchangeAudit.push({ id: preview.id, action: "import_commit", at: this.clock(), commandId: preview.commandId, sourceDigest: preview.sourceDigest, detail: `${preview.todos.length} todos` });
      return { imported: preview.todos.filter((todo) => !todoIds.has(todo.id)).map((todo) => todo.id), storeVersion: draft.storeVersion + 1 };
    });
    preview.committed = true;
    return result;
  }

  export(includeTrash = false) {
    const snapshot = this.app.store.snapshot();
    const todos = snapshot.todos.filter((todo) => includeTrash || !todo.deletedAt).map((todo) => ({ ...todo, notes: todo.notes.slice(0, 10000) }));
    const document = { kind: "hana-todolist", schemaVersion: EXCHANGE_VERSION, exportedAt: this.clock(), todos, projects: snapshot.projects.filter((project) => includeTrash || !project.deletedAt) };
    return { filename: `hana-todolist-v${EXCHANGE_VERSION}.json`, mime: "application/json", content: JSON.stringify(document, null, 2), digest: digest(document) };
  }

  markdownReview() {
    const review = this.app.review();
    return ["# Hana Todo Review", "", `- Inbox: ${review.inbox.length}`, `- Overdue: ${review.overdue.length}`, `- Upcoming: ${review.upcoming.length}`, `- Undated: ${review.undated.length}`, `- Recently completed: ${review.recentlyCompleted.length}`, `- Automation attention: ${review.automation.length}`, ""].join("\n");
  }
}
