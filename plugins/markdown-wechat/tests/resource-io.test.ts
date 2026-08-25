import { afterEach, describe, expect, it } from "vitest";
import registerResourceRoutes from "../routes/resource-io.ts";
import { disposeRuntime } from "../src/runtime.ts";
import type { HonoAppLike, HonoContextLike } from "../src/http.ts";
import type { PluginContextLike } from "../src/contracts.ts";
import { mockContext, removeDirectory, temporaryDirectory } from "./helpers.ts";

type Handler = (context: HonoContextLike) => unknown | Promise<unknown>;
const directories: string[] = [];
const contexts: PluginContextLike[] = [];
afterEach(() => {
  for (const context of contexts.splice(0)) disposeRuntime(context);
  for (const dir of directories.splice(0)) removeDirectory(dir);
});

function routeHarness(context: PluginContextLike) {
  const handlers = new Map<string, Handler>();
  const add = (method: string) => (path: string, handler: Handler) => { handlers.set(`${method} ${path}`, handler); };
  const app = { get: add("GET"), post: add("POST"), put: add("PUT") } as HonoAppLike;
  registerResourceRoutes(app, context);
  return async (method: string, path: string, body: Record<string, unknown>) => {
    const handler = handlers.get(`${method} ${path}`);
    if (!handler) throw new Error(`Missing route ${method} ${path}`);
    return handler({
      req: { json: async () => body, query: () => undefined },
      json: (value, status = 200) => ({ status, value }),
      html: (value, status = 200) => ({ status, value }),
    }) as Promise<{ status: number; value: Record<string, any> }>;
  };
}

describe("ResourceIO routes", () => {
  it("imports ResourceRef text only after validation", async () => {
    const dir = temporaryDirectory(); directories.push(dir);
    const context = mockContext(dir); contexts.push(context);
    const request = routeHarness(context);
    const response = await request("POST", "/api/resource/read", { ref: { kind: "local", name: "story.md" }, expectedRevision: 0 });
    expect(response.status).toBe(200);
    expect(response.value.state).toMatchObject({ markdown: "# Imported", revision: 1, dirty: true });
  });

  it("preserves the draft when reads are denied or binary", async () => {
    const dir = temporaryDirectory(); directories.push(dir);
    const denied = mockContext(dir, { resources: {
      async stat() { return {}; },
      async read() { throw Object.assign(new Error("denied"), { code: "RESOURCE_DENIED" }); },
      async writeExpectedVersion() { return {}; },
    } }); contexts.push(denied);
    let response = await routeHarness(denied)("POST", "/api/resource/read", { ref: { kind: "mount", name: "story.md" }, expectedRevision: 0 });
    expect(response.status).toBe(403);

    disposeRuntime(denied); contexts.pop();
    const binary = mockContext(dir, { resources: {
      async stat() { return {}; },
      async read() { return { content: new Uint8Array([65, 0, 66]), name: "story.md" }; },
      async writeExpectedVersion() { return {}; },
    } }); contexts.push(binary);
    response = await routeHarness(binary)("POST", "/api/resource/read", { ref: { kind: "local", name: "story.md" }, expectedRevision: 0 });
    expect(response.status).toBe(415);
    expect(response.value.error.code).toBe("not_text");
  });

  it("requires version identity and performs explicit expected-version writes", async () => {
    const dir = temporaryDirectory(); directories.push(dir);
    let written: unknown;
    const context = mockContext(dir, { resources: {
      async stat() { return { version: { etag: "v1" } }; },
      async read() { return { content: "" }; },
      async writeExpectedVersion(ref, content, expected) { written = { ref, content, expected }; return { ok: true }; },
    } }); contexts.push(context);
    const request = routeHarness(context);
    const ref = { kind: "mount", name: "target.md" };
    const prepared = await request("POST", "/api/resource/prepare-write", { ref });
    expect(prepared.value.target.version).toEqual({ etag: "v1" });
    const response = await request("POST", "/api/resource/write", { ref, markdown: "# Updated", expectedVersion: { etag: "v1" } });
    expect(response.status).toBe(200);
    expect(written).toEqual({ ref, content: "# Updated", expected: { etag: "v1" } });
  });
});
