import type { PluginContextLike } from "../src/contracts.ts";
import { asyncJsonRoute, HttpError, readJson, type HonoAppLike } from "../src/http.ts";
import { getRuntime } from "../src/runtime.ts";
import { PrivateStoreError } from "../src/store.ts";

export function stateSummary(markdown: string, title: string): { title: string; excerpt: string; characters: number } {
  const excerpt = markdown
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/[#>*_~`\[\]()!-]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120);
  return { title, excerpt, characters: markdown.length };
}

export default function registerStateRoutes(app: HonoAppLike, ctx: PluginContextLike): void {
  const runtime = getRuntime(ctx);

  app.get("/api/state", asyncJsonRoute((c) => {
    const result = runtime.store.load();
    return c.json({
      ok: true,
      state: result.state,
      summary: stateSummary(result.state.markdown, result.state.title),
      recovery: result.recovery,
    });
  }));

  app.put("/api/state", asyncJsonRoute(async (c) => {
    const input = await readJson(c);
    try {
      const state = runtime.store.save({
        markdown: input.markdown,
        title: input.title,
        settings: input.settings,
        dirty: input.dirty,
        expectedRevision: input.expectedRevision,
      });
      return c.json({ ok: true, state, summary: stateSummary(state.markdown, state.title) });
    } catch (error) {
      if (error instanceof PrivateStoreError) {
        throw new HttpError(error.code === "conflict" || error.code === "recovery_locked" ? 409 : error.code === "invalid" ? 400 : 503, error.code, error.message);
      }
      throw error;
    }
  }));

  app.post("/api/state/reset", asyncJsonRoute((c) => {
    const result = runtime.store.resetAfterRecovery();
    return c.json({ ok: true, state: result.state, summary: stateSummary(result.state.markdown, result.state.title), backupName: result.backupName });
  }));

  app.get("/api/diagnostics", asyncJsonRoute((c) => {
    const result = runtime.store.load();
    return c.json({
      ok: true,
      plugin: "markdown-wechat",
      schemaVersion: result.state.schemaVersion,
      revision: result.state.revision,
      recovery: result.recovery?.code ?? null,
      surfaces: ["page", "widget"],
      routes: ["state", "state-reset", "resource-read", "resource-prepare-write", "resource-write", "diagnostics"],
      tools: ["render"],
      failures: ["invalid_input", "resource_denied", "resource_conflict", "store_failure", "render_failure", "clipboard_failure", "download_failure", "stage_failure"],
      activation: ["onPageOpen", "onWidgetOpen", "onToolCall"],
    });
  }));
}
