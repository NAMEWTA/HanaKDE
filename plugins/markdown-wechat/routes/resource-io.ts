import type { PluginContextLike, PluginResourceReadResult } from "../src/contracts.ts";
import { asyncJsonRoute, HttpError, readJson, type HonoAppLike } from "../src/http.ts";
import { getRuntime } from "../src/runtime.ts";

const TEXT_EXTENSIONS = new Set([".md", ".markdown", ".txt"]);

function resourceRef(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new HttpError(400, "invalid_resource_ref", "A ResourceRef object is required");
  }
  const ref = value as Record<string, unknown>;
  if (typeof ref.kind !== "string" || !ref.kind.trim()) {
    throw new HttpError(400, "invalid_resource_ref", "ResourceRef.kind is required");
  }
  return ref;
}

function resourceName(ref: Record<string, unknown>, result?: PluginResourceReadResult): string {
  for (const value of [result?.name, ref.name, ref.path]) {
    if (typeof value !== "string" || !value) continue;
    const normalized = value.replace(/\\/g, "/");
    return normalized.slice(normalized.lastIndexOf("/") + 1);
  }
  return "import.md";
}

function assertMarkdownName(name: string): void {
  const dot = name.lastIndexOf(".");
  if (dot < 0) return;
  const extension = name.slice(dot).toLowerCase();
  if (!TEXT_EXTENSIONS.has(extension)) {
    throw new HttpError(415, "unsupported_resource", "Only .md, .markdown, and .txt resources are supported");
  }
}

export function decodeResourceText(result: PluginResourceReadResult): string {
  const { content } = result;
  let bytes: Uint8Array;
  if (typeof content === "string") {
    if (content.includes("\0")) throw new HttpError(415, "not_text", "The selected resource is not text");
    return content;
  }
  if (content instanceof Uint8Array) bytes = content;
  else if (content instanceof ArrayBuffer) bytes = new Uint8Array(content);
  else if (content && typeof content === "object" && Array.isArray(content.data)) bytes = Uint8Array.from(content.data);
  else throw new HttpError(415, "not_text", "The selected resource has no readable text content");
  if (bytes.subarray(0, 4096).includes(0)) throw new HttpError(415, "not_text", "The selected resource is binary");
  const decoded = new TextDecoder("utf-8", { fatal: false }).decode(bytes);
  const replacements = (decoded.match(/\uFFFD/g) ?? []).length;
  if (replacements > Math.max(2, decoded.length / 200)) {
    throw new HttpError(415, "not_text", "The selected resource is not valid UTF-8 text");
  }
  return decoded;
}

export default function registerResourceRoutes(app: HonoAppLike, ctx: PluginContextLike): void {
  const runtime = getRuntime(ctx);

  app.post("/api/resource/read", asyncJsonRoute(async (c) => {
    const input = await readJson(c);
    const ref = resourceRef(input.ref);
    const before = runtime.store.load().state;
    const expectedRevision = Number(input.expectedRevision);
    if (!Number.isInteger(expectedRevision) || expectedRevision !== before.revision) {
      throw new HttpError(409, "conflict", "The draft changed before import completed");
    }
    const result = await ctx.resources.read(ref);
    const name = resourceName(ref, result);
    assertMarkdownName(name);
    const markdown = decodeResourceText(result);
    if (!markdown.trim()) throw new HttpError(415, "empty_resource", "The selected resource is empty");
    const state = runtime.store.save({ markdown, expectedRevision, dirty: true });
    return c.json({ ok: true, state, source: { name, version: result.version ?? null } });
  }));

  app.post("/api/resource/prepare-write", asyncJsonRoute(async (c) => {
    if (runtime.store.load().recovery) {
      throw new HttpError(409, "recovery_locked", "Writeback is locked until the private draft is explicitly recovered");
    }
    const input = await readJson(c);
    const ref = resourceRef(input.ref);
    const stat = await ctx.resources.stat(ref);
    const version = stat.version;
    if (!version) throw new HttpError(409, "version_unavailable", "The target resource has no writable version identity");
    return c.json({ ok: true, target: { ref, name: resourceName(ref), version } });
  }));

  app.post("/api/resource/write", asyncJsonRoute(async (c) => {
    if (runtime.store.load().recovery) {
      throw new HttpError(409, "recovery_locked", "Writeback is locked until the private draft is explicitly recovered");
    }
    const input = await readJson(c);
    const ref = resourceRef(input.ref);
    if (typeof input.markdown !== "string") throw new HttpError(400, "invalid_markdown", "Markdown is required");
    if (!input.expectedVersion || typeof input.expectedVersion !== "object") {
      throw new HttpError(400, "expected_version_required", "Expected resource version is required");
    }
    const result = await ctx.resources.writeExpectedVersion(ref, input.markdown, input.expectedVersion);
    if (result && result.ok === false) {
      const code = result.conflict ? "resource_conflict" : "resource_write_failed";
      throw new HttpError(code === "resource_conflict" ? 409 : 503, code, "The resource was not changed");
    }
    return c.json({ ok: true, result });
  }));
}
