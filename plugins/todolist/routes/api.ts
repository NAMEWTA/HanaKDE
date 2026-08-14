import { Hono } from "hono";
import { TodoError, errorBody } from "../src/errors.ts";
import { getApplication, getExchange, sessionKey } from "../src/runtime.ts";

function application(ctx: any) { return getApplication(ctx); }
function jsonError(c: any, error: unknown) { const body = errorBody(error); return c.json(body, error instanceof TodoError ? error.status : 500); }
function body(c: any) { return c.req.json().catch(() => ({})); }

export default function register(app: Hono, ctx: any) {
  const route = new Hono();
  route.get("/todos", (c) => { try { return c.json(application(ctx).query({ status: c.req.query("status") as any, includeTrash: c.req.query("includeTrash") === "true", projectId: c.req.query("projectId"), view: c.req.query("view") as any, timeZone: c.req.query("timeZone") || "UTC", search: c.req.query("search"), limit: Number(c.req.query("limit") || 50), cursor: c.req.query("cursor") })); } catch (error) { return jsonError(c, error); } });
  route.get("/todos/:id", (c) => { try { return c.json(application(ctx).get(c.req.param("id"), c.req.query("includeTrash") === "true")); } catch (error) { return jsonError(c, error); } });
  route.post("/todos", async (c) => { try { const input = await body(c); const app = application(ctx); const result = app.create(input); const background = input.mode === "reminder" ? await app.scheduleReminder(result.todo.id, result.todo.reminderAt?.kind === "exact" ? result.todo.reminderAt.instant : `${result.todo.reminderAt?.date}T09:00:00.000Z`, ctx) : input.mode === "agent_execute" ? await app.scheduleAgentRun(result.todo.id, null, ctx) : null; return c.json({ ...result, background }, 201); } catch (error) { return jsonError(c, error); } });
  route.patch("/todos/:id", async (c) => { try { const input = await body(c); const app = application(ctx); const result = app.update(c.req.param("id"), input); const background = input.mode === "reminder" ? await app.scheduleReminder(result.todo.id, result.todo.reminderAt?.kind === "exact" ? result.todo.reminderAt.instant : `${result.todo.reminderAt?.date}T09:00:00.000Z`, ctx) : input.mode === "agent_execute" ? await app.scheduleAgentRun(result.todo.id, null, ctx) : null; return c.json({ ...result, background }); } catch (error) { return jsonError(c, error); } });
  route.post("/todos/:id/complete", async (c) => { try { const input = await body(c); return c.json(application(ctx).complete(c.req.param("id"), input.expectedVersion)); } catch (error) { return jsonError(c, error); } });
  route.post("/todos/:id/reopen", async (c) => { try { const input = await body(c); return c.json(application(ctx).reopen(c.req.param("id"), input.expectedVersion)); } catch (error) { return jsonError(c, error); } });
  route.delete("/todos/:id", async (c) => { try { const input = await body(c); const app = application(ctx); const result = app.remove(c.req.param("id"), input.expectedVersion); const background = await app.cancelBackgroundForTodo(c.req.param("id"), ctx); return c.json({ ...result, background }); } catch (error) { return jsonError(c, error); } });
  route.post("/todos/:id/restore", async (c) => { try { const input = await body(c); return c.json(application(ctx).restore(c.req.param("id"), input.expectedVersion)); } catch (error) { return jsonError(c, error); } });
  route.post("/trash/purge/prepare", async (c) => { try { const input = await body(c); return c.json(application(ctx).preparePurge(input.todoIds, sessionKey(ctx))); } catch (error) { return jsonError(c, error); } });
  route.post("/trash/purge/confirm", async (c) => { try { const input = await body(c); return c.json(application(ctx).confirmPurge(input.confirmationId, sessionKey(ctx))); } catch (error) { return jsonError(c, error); } });
  route.get("/projects", (c) => { try { return c.json({ projects: application(ctx).queryProjects(c.req.query("includeTrash") === "true") }); } catch (error) { return jsonError(c, error); } });
  route.post("/projects", async (c) => { try { const input = await body(c); return c.json(application(ctx).createProject(input.name), 201); } catch (error) { return jsonError(c, error); } });
  route.patch("/projects/:id", async (c) => { try { const input = await body(c); return c.json(application(ctx).updateProject(c.req.param("id"), input.name, input.expectedVersion)); } catch (error) { return jsonError(c, error); } });
  route.delete("/projects/:id", async (c) => { try { const input = await body(c); return c.json(application(ctx).removeProject(c.req.param("id"), input.expectedVersion)); } catch (error) { return jsonError(c, error); } });
  route.post("/projects/:id/restore", async (c) => { try { const input = await body(c); return c.json(application(ctx).restoreProject(c.req.param("id"), input.expectedVersion)); } catch (error) { return jsonError(c, error); } });
  route.post("/reminders", async (c) => { try { const input = await body(c); return c.json(await application(ctx).scheduleReminder(input.todoId, input.dueAt, ctx), 201); } catch (error) { return jsonError(c, error); } });
  route.post("/reminders/:id/wake", async (c) => { try { return c.json(await application(ctx).handoffReminder(c.req.param("id"), ctx)); } catch (error) { return jsonError(c, error); } });
  route.post("/reminders/:id/cancel", async (c) => { try { return c.json(await application(ctx).cancelReminder(c.req.param("id"), ctx)); } catch (error) { return jsonError(c, error); } });
  route.post("/occurrences/:id/complete", (c) => { try { return c.json(application(ctx).completeOccurrence(c.req.param("id"))); } catch (error) { return jsonError(c, error); } });
  route.post("/occurrences/:id/skip", (c) => { try { return c.json(application(ctx).skipOccurrence(c.req.param("id"))); } catch (error) { return jsonError(c, error); } });
  route.get("/recurrence/occurrences", (c) => { try { return c.json({ occurrences: application(ctx).queryOccurrences(c.req.query("todoId")) }); } catch (error) { return jsonError(c, error); } });
  route.post("/recurrence", async (c) => { try { const input = await body(c); return c.json(application(ctx).createRecurrence(input.todoId, input.rule), 201); } catch (error) { return jsonError(c, error); } });
  route.patch("/recurrence/:id", async (c) => { try { const input = await body(c); return c.json(application(ctx).updateRecurrence(c.req.param("id"), input.expectedVersion, input.patch)); } catch (error) { return jsonError(c, error); } });
  route.get("/automation/runs", (c) => { try { return c.json({ runs: application(ctx).listRuns(c.req.query("status")) }); } catch (error) { return jsonError(c, error); } });
  route.post("/automation/runs", async (c) => { try { const input = await body(c); return c.json(application(ctx).createRun(input.todoId, input.occurrenceId || null), 201); } catch (error) { return jsonError(c, error); } });
  route.post("/automation/runs/:id/start", async (c) => { try { return c.json(await application(ctx).startRun(c.req.param("id"), ctx)); } catch (error) { return jsonError(c, error); } });
  route.post("/automation/runs/:id/retry", (c) => { try { return c.json(application(ctx).retryRun(c.req.param("id"))); } catch (error) { return jsonError(c, error); } });
  route.post("/automation/runs/:id/cancel", (c) => { try { return c.json(application(ctx).setRunState(c.req.param("id"), "cancel_requested")); } catch (error) { return jsonError(c, error); } });
  route.post("/automation/runs/:id/confirm-cancel", (c) => { try { return c.json(application(ctx).setRunState(c.req.param("id"), "cancelled")); } catch (error) { return jsonError(c, error); } });
  route.get("/review", (c) => { try { return c.json(application(ctx).review()); } catch (error) { return jsonError(c, error); } });
  route.post("/exchange/preview", async (c) => { try { const input = await body(c); return c.json(getExchange(ctx).preview(input.document, input.commandId)); } catch (error) { return jsonError(c, error); } });
  route.post("/exchange/commit", async (c) => { try { const input = await body(c); return c.json(getExchange(ctx).commit(input.previewId)); } catch (error) { return jsonError(c, error); } });
  route.get("/exchange/export", (c) => { try { const result = getExchange(ctx).export(c.req.query("includeTrash") === "true"); return c.json(result); } catch (error) { return jsonError(c, error); } });
  route.get("/review/markdown", (c) => { try { return c.text(getExchange(ctx).markdownReview()); } catch (error) { return jsonError(c, error); } });
  app.route("/api", route);
}
