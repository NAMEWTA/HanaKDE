import type { ExecutionMode, Priority, ReminderRecord, ViewName } from "../src/domain/model.ts";
import { TodoError } from "../src/errors.ts";
import { listAgents } from "../src/infrastructure/host.ts";
import { getRuntime } from "../src/runtime.ts";
import { requestContextFromHono, type PluginContextLike } from "../src/interfaces/context.ts";
import { asyncRoute, queryBoolean, queryList, queryNumber, readJson, type HonoAppLike } from "../src/interfaces/http.ts";

const API = "/api";

export default function register(app: HonoAppLike, ctx: PluginContextLike): void {
  const runtime = getRuntime(ctx);
  const invocation = (c: Parameters<Parameters<HonoAppLike["get"]>[1]>[0]) => requestContextFromHono(c, ctx);

  app.get(`${API}/status`, asyncRoute((c) => c.json({ ok: true, ...runtime.application.status() })));

  app.get(`${API}/todos`, asyncRoute((c) => {
    const priorities = queryList(c, "priority") as Priority[] | undefined;
    const modes = queryList(c, "mode") as ExecutionMode[] | undefined;
    const tags = queryList(c, "tag");
    return c.json(runtime.application.query({
      view: (c.req.query("view") ?? "all") as ViewName,
      projectId: c.req.query("projectId"),
      search: c.req.query("search"),
      tags,
      priorities,
      modes,
      limit: queryNumber(c, "limit", 50),
      cursor: c.req.query("cursor"),
      timeZone: c.req.query("timeZone"),
      today: c.req.query("today"),
      includeTrash: queryBoolean(c, "includeTrash", false),
    }));
  }));
  app.get(`${API}/todos/:id`, asyncRoute((c) => c.json({ ok: true, todo: runtime.application.getTodo(c.req.param("id")) })));
  app.post(`${API}/todos`, asyncRoute(async (c) => c.json(await runtime.application.createTodo(await readJson(c) as never, invocation(c)), 201)));
  app.patch(`${API}/todos/:id`, asyncRoute(async (c) => {
    const input = await readJson(c);
    return c.json(await runtime.application.updateTodo(c.req.param("id"), input.patch ?? input, input.expectedVersion, invocation(c), typeof input.mutationId === "string" ? input.mutationId : undefined));
  }));
  app.post(`${API}/todos/:id/complete`, asyncRoute(async (c) => {
    const input = await readJson(c);
    return c.json(await runtime.application.completeTodo(c.req.param("id"), input.expectedVersion, invocation(c), typeof input.commandId === "string" ? input.commandId : undefined));
  }));
  app.post(`${API}/todos/:id/reopen`, asyncRoute(async (c) => {
    const input = await readJson(c);
    return c.json(await runtime.application.reopenTodo(c.req.param("id"), input.expectedVersion, invocation(c), typeof input.commandId === "string" ? input.commandId : undefined));
  }));
  app.delete(`${API}/todos/:id`, asyncRoute(async (c) => {
    const input = await readJson(c);
    return c.json(await runtime.application.trashTodo(c.req.param("id"), input.expectedVersion, invocation(c), typeof input.commandId === "string" ? input.commandId : undefined));
  }));
  app.post(`${API}/todos/:id/restore`, asyncRoute(async (c) => {
    const input = await readJson(c);
    return c.json(await runtime.application.restoreTodo(c.req.param("id"), input.expectedVersion, invocation(c), typeof input.commandId === "string" ? input.commandId : undefined));
  }));
  app.post(`${API}/todos/:id/purge/prepare`, asyncRoute(async (c) => {
    const input = await readJson(c);
    return c.json({ ok: true, ...(await runtime.application.preparePurge(c.req.param("id"), input.expectedVersion, invocation(c))) });
  }));
  app.post(`${API}/todos/:id/purge/confirm`, asyncRoute(async (c) => {
    const input = await readJson(c);
    if (typeof input.token !== "string") throw new TodoError("validation", "token is required", { field: "token" });
    return c.json(await runtime.application.confirmPurge(c.req.param("id"), input.token, invocation(c)));
  }));
  app.post(`${API}/todos/batch`, asyncRoute(async (c) => c.json(await runtime.application.batchMutate(await readJson(c), invocation(c)))));

  app.get(`${API}/projects`, asyncRoute((c) => c.json({ ok: true, ...runtime.application.listProjects({ includeTrash: queryBoolean(c, "includeTrash", false) }) })));
  app.post(`${API}/projects`, asyncRoute(async (c) => {
    const input = await readJson(c);
    return c.json(await runtime.application.createProject(input.name, invocation(c), typeof input.commandId === "string" ? input.commandId : undefined), 201);
  }));
  app.patch(`${API}/projects/:id`, asyncRoute(async (c) => {
    const input = await readJson(c);
    return c.json(await runtime.application.updateProject(c.req.param("id"), input.name, input.expectedVersion, invocation(c)));
  }));
  app.delete(`${API}/projects/:id`, asyncRoute(async (c) => {
    const input = await readJson(c);
    return c.json(await runtime.application.trashProject(c.req.param("id"), input.expectedVersion, invocation(c)));
  }));
  app.post(`${API}/projects/:id/restore`, asyncRoute(async (c) => {
    const input = await readJson(c);
    return c.json(await runtime.application.restoreProject(c.req.param("id"), input.expectedVersion, invocation(c)));
  }));

  app.get(`${API}/review`, asyncRoute((c) => c.json({ ok: true, review: runtime.application.review(c.req.query("timeZone"), c.req.query("today")) })));
  app.get(`${API}/agents`, asyncRoute(async (c) => c.json({ ok: true, agents: await listAgents(invocation(c)) })));
  app.get(`${API}/reminders`, asyncRoute((c) => c.json({ ok: true, ...runtime.application.listReminders({ todoId: c.req.query("todoId"), status: c.req.query("status") as ReminderRecord["status"] | undefined, limit: queryNumber(c, "limit", 50) }) })));
  app.post(`${API}/reminders/:id/retry`, asyncRoute((c) => runtime.application.retryReminder(c.req.param("id"), invocation(c)).then((result) => c.json(result))));
  app.post(`${API}/reminders/:id/cancel`, asyncRoute((c) => runtime.application.cancelReminder(c.req.param("id"), invocation(c)).then((result) => c.json(result))));

  app.get(`${API}/recurrence`, asyncRoute((c) => c.json({ ok: true, ...runtime.application.listRecurrence() })));
  app.post(`${API}/recurrence`, asyncRoute(async (c) => {
    const input = await readJson(c);
    if (typeof input.todoId !== "string") throw new TodoError("validation", "todoId is required", { field: "todoId" });
    return c.json(await runtime.application.createRecurrenceSeries(input.todoId, input.rule, input.expectedVersion, invocation(c), typeof input.throughDate === "string" ? input.throughDate : undefined), 201);
  }));
  app.post(`${API}/recurrence/:id/materialize`, asyncRoute(async (c) => {
    const input = await readJson(c);
    if (typeof input.fromDate !== "string" || typeof input.throughDate !== "string") throw new TodoError("validation", "fromDate and throughDate are required", { field: "fromDate" });
    return c.json(await runtime.application.materializeRecurrence(c.req.param("id"), input.fromDate, input.throughDate, invocation(c)));
  }));
  app.patch(`${API}/recurrence/occurrences/:id`, asyncRoute(async (c) => {
    const input = await readJson(c);
    if (input.scope !== "only_this" && input.scope !== "this_and_future") throw new TodoError("validation", "scope must be only_this or this_and_future", { field: "scope" });
    return c.json(await runtime.application.updateRecurrence(c.req.param("id"), input.scope, { patch: input.patch, rule: input.rule, expectedVersion: input.expectedVersion }, invocation(c)));
  }));
  app.post(`${API}/recurrence/occurrences/:id/skip`, asyncRoute(async (c) => {
    const input = await readJson(c);
    return c.json(await runtime.application.skipOccurrence(c.req.param("id"), input.expectedVersion, invocation(c)));
  }));
  app.post(`${API}/recurrence/:id/status`, asyncRoute(async (c) => {
    const input = await readJson(c);
    if (input.status !== "active" && input.status !== "paused" && input.status !== "ended") throw new TodoError("validation", "status must be active, paused, or ended", { field: "status" });
    return c.json(await runtime.application.setRecurrenceStatus(c.req.param("id"), input.status, input.expectedVersion, invocation(c)));
  }));

  app.get(`${API}/automation/runs`, asyncRoute((c) => c.json({ ok: true, ...runtime.application.listRuns({ todoId: c.req.query("todoId"), status: c.req.query("status") as never, limit: queryNumber(c, "limit", 50) }) })));
  app.get(`${API}/automation/runs/:id`, asyncRoute((c) => c.json({ ok: true, ...runtime.application.getRunDetails(c.req.param("id")) })));
  app.post(`${API}/automation/runs/:id/retry`, asyncRoute(async (c) => {
    const input = await readJson(c);
    return c.json(await runtime.application.retryRun(c.req.param("id"), invocation(c), typeof input.runAt === "string" ? input.runAt : undefined));
  }));
  app.post(`${API}/automation/runs/:id/start`, asyncRoute((c) => runtime.application.startRun(c.req.param("id"), invocation(c)).then((result) => c.json(result))));
  app.post(`${API}/automation/runs/:id/cancel`, asyncRoute((c) => runtime.application.cancelRun(c.req.param("id"), invocation(c)).then((result) => c.json(result))));

  app.post(`${API}/exchange/preview`, asyncRoute(async (c) => {
    const input = await readJson(c);
    return c.json(await runtime.exchange.preview(input.document ?? input.source, invocation(c)));
  }));
  app.post(`${API}/exchange/commit`, asyncRoute(async (c) => {
    const input = await readJson(c);
    if (typeof input.previewId !== "string" || typeof input.commandId !== "string") throw new TodoError("validation", "previewId and commandId are required", { field: "previewId" });
    return c.json(await runtime.exchange.commit(input.previewId, input.commandId, invocation(c)));
  }));
  app.get(`${API}/exchange/export`, asyncRoute((c) => c.json(runtime.exchange.exportDocument({ includeTrash: queryBoolean(c, "includeTrash", false) }))));
}
