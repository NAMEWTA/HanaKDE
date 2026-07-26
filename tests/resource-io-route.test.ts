import { Hono } from "hono";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { normalizePrincipal } from "../core/security-principal.ts";
import { upsertStudioMount } from "../core/studio-mounts.ts";
import { ResourceIO } from "../lib/resource-io/resource-io.ts";
import { LocalFsProvider } from "../lib/resource-io/providers/local-fs-provider.ts";
import { MountProvider } from "../lib/resource-io/providers/mount-provider.ts";
import { createResourceIoRoute } from "../server/routes/resource-io.ts";
import { ResourceIOError, toKnowledgeResourceIOError } from "../lib/resource-io/errors.ts";

function setHonoContext(
  context: unknown,
  key: string,
  value: unknown,
): void {
  (
    context as {
      set(contextKey: string, contextValue: unknown): void;
    }
  ).set(key, value);
}

function useLocalOwnerAuth(app: Hono): void {
  app.use("*", async (c, next) => {
    setHonoContext(c, "authPrincipal", normalizePrincipal({
      kind: "local_user",
      userId: "test-user",
      studioId: "test-studio",
      connectionKind: "local",
      credentialKind: "loopback_token",
      scopes: ["chat", "resources", "tools"],
    }));
    setHonoContext(c, "transportConnectionKind", "local");
    await next();
  });
}

function useRemoteOwnerAuth(app: Hono): void {
  app.use("*", async (c, next) => {
    setHonoContext(c, "authPrincipal", normalizePrincipal({
      kind: "device",
      deviceId: "remote-device",
      userId: "remote-user",
      studioId: "remote-studio",
      connectionKind: "lan",
      credentialKind: "device_credential",
      scopes: ["studio.owner", "files.write", "files.read"],
    }));
    setHonoContext(c, "transportConnectionKind", "lan");
    await next();
  });
}

describe("resource-io route", () => {
  it("projects the same stable unavailable error for direct and route adapters", async () => {
    const direct = toKnowledgeResourceIOError(new ResourceIOError("provider /private/path unavailable", {
      code: "provider_not_available",
    }));
    const app = new Hono();
    useLocalOwnerAuth(app);
    app.route("/api", createResourceIoRoute({
      resourceEventsSince: () => { throw new ResourceIOError("provider /private/path unavailable", { code: "provider_not_available" }); },
    }));
    const response = await app.request("/api/resource-io/events?since=0");
    expect(response.status).toBe(503);
    const body = await response.json();
    expect(body).toMatchObject({
      code: direct.code,
      httpStatus: direct.httpStatus,
      retryable: direct.retryable,
    });
    expect(JSON.stringify(body)).not.toContain("/private/path");
  });

  it("fails closed when an unknown route error uses hostile property traps", async () => {
    let getRuns = 0;
    const hostile = new Proxy({ safeMessage: "/private/leak", status: 200 }, {
      get(target, key, receiver) { getRuns += 1; return Reflect.get(target, key, receiver); },
    });
    const app = new Hono();
    useLocalOwnerAuth(app);
    app.route("/api", createResourceIoRoute({ resourceEventsSince: () => { throw hostile; } }));
    const response = await app.request("/api/resource-io/events?since=0");
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({
      error: "Resource operation failed",
      code: "resource_operation_failed",
      safeMessage: "Resource operation failed",
    });
    expect(getRuns).toBe(0);
  });

  it.each(["__proto__", "constructor", "prototype"])("never treats prototype key %s as a compatibility error", async (code) => {
    const app = new Hono();
    useLocalOwnerAuth(app);
    app.route("/api", createResourceIoRoute({
      resourceEventsSince: () => { throw Object.assign(new Error("unsafe"), { code, status: 200, safeMessage: "unsafe" }); },
    }));
    const response = await app.request("/api/resource-io/events?since=0");
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({
      error: "Resource operation failed",
      code: "resource_operation_failed",
      safeMessage: "Resource operation failed",
    });
  });

  it("returns fixed 500 for a known code carrying unsafe accessor details", async () => {
    let getterRuns = 0;
    const details = {};
    Object.defineProperty(details, "field", { enumerable: true, get() { getterRuns += 1; return "token"; } });
    const app = new Hono();
    useLocalOwnerAuth(app);
    app.route("/api", createResourceIoRoute({
      resourceEventsSince: () => { throw Object.assign(new Error("unsafe"), { code: "knowledge_resource_not_found", details }); },
    }));
    const response = await app.request("/api/resource-io/events?since=0");
    expect(response.status).toBe(500);
    expect(getterRuns).toBe(0);
  });
  it("returns retained resource events for catch-up by cursor", async () => {
    const resourceEventsSince = vi.fn(() => ({
      stale: false,
      latestSequence: 7,
      events: [{
        type: "resource.changed",
        changeType: "modified",
        resourceKey: "local_fs:/tmp/a.md",
        resource: { kind: "local-file", path: "/tmp/a.md" },
        source: "provider_watch",
        sequence: 7,
        occurredAt: "2026-06-22T00:00:00.000Z",
      }],
    }));
    const app = new Hono();
    useLocalOwnerAuth(app);
    app.route("/api", createResourceIoRoute({ resourceEventsSince }));

    const res = await app.request("/api/resource-io/events?since=3");

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      stale: false,
      latestSequence: 7,
      events: [{
        type: "resource.changed",
        changeType: "modified",
        resourceKey: "local_fs:/tmp/a.md",
        resource: { kind: "local-file", path: "/tmp/a.md" },
        source: "provider_watch",
        sequence: 7,
        occurredAt: "2026-06-22T00:00:00.000Z",
      }],
    });
    expect(resourceEventsSince).toHaveBeenCalledWith(3);
  });

  it("returns a resync hint when the event cursor is stale", async () => {
    const app = new Hono();
    useLocalOwnerAuth(app);
    app.route("/api", createResourceIoRoute({
      resourceEventsSince: vi.fn(() => ({
        stale: true,
        latestSequence: 12,
        events: [],
      })),
    }));

    const res = await app.request("/api/resource-io/events?since=1");

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      stale: true,
      latestSequence: 12,
      events: [],
      resync: "resource-stat-required",
    });
  });

  it("redacts auxiliary ResourceIO diagnostics and event paths for remote principals", async () => {
    const privatePath = "/private/remote/source/a.md";
    const app = new Hono();
    useRemoteOwnerAuth(app);
    app.route("/api", createResourceIoRoute({
      resourceEventsSince: vi.fn(() => ({
        stale: false,
        latestSequence: 1,
        events: [{
          type: "resource.changed",
          changeType: "modified",
          resourceKey: `local_fs:${privatePath}`,
          resource: {
            kind: "local-file",
            path: privatePath,
            filePath: privatePath,
          },
          source: "provider_watch",
          sequence: 1,
          occurredAt: "2026-07-26T00:00:00.000Z",
        }],
      })),
      resourceWatchDiagnostics: vi.fn(() => ({
        subscriptions: 1,
        watches: [{ filePath: privatePath }],
      })),
      subscribeResourceWatch: vi.fn(() => ({
        subscriptionId: "sub-remote",
        resourceKeys: [`local_fs:${privatePath}`],
      })),
    }));

    const events = await (
      await app.request("/api/resource-io/events?since=0")
    ).json();
    expect(events).toEqual({
      stale: true,
      latestSequence: 1,
      events: [],
      resync: "resource-stat-required",
    });

    const diagnostics = await (
      await app.request("/api/resource-io/watch-diagnostics")
    ).json();
    expect(diagnostics).toEqual({
      ok: true,
      diagnostics: { subscriptions: 1 },
    });

    const subscription = await (
      await app.request("/api/resource-io/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          purpose: "remote",
          resources: [{ kind: "mount", mountId: "safe", path: "a.md" }],
        }),
      })
    ).json();
    expect(subscription).toEqual({
      ok: true,
      subscriptionId: "sub-remote",
    });

    expect(
      JSON.stringify({ events, diagnostics, subscription }),
    ).not.toContain(privatePath);
  });

  it("subscribes and unsubscribes backend resource watches", async () => {
    const subscribeResourceWatch = vi.fn(() => ({
      subscriptionId: "sub-1",
      resourceKeys: ["local_fs:/tmp/a.md"],
    }));
    const unsubscribeResourceWatch = vi.fn(() => true);
    const app = new Hono();
    useLocalOwnerAuth(app);
    app.route("/api", createResourceIoRoute({
      subscribeResourceWatch,
      unsubscribeResourceWatch,
    }));

    const subRes = await app.request("/api/resource-io/subscribe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        purpose: "preview",
        resources: [{ kind: "local-file", path: "/tmp/a.md" }],
      }),
    });

    expect(await subRes.json()).toEqual({
      ok: true,
      subscriptionId: "sub-1",
      resourceKeys: ["local_fs:/tmp/a.md"],
    });
    expect(subscribeResourceWatch).toHaveBeenCalledWith({
      purpose: "preview",
      resources: [{ kind: "local-file", path: "/tmp/a.md" }],
    });

    const releaseRes = await app.request("/api/resource-io/subscriptions/sub-1", {
      method: "DELETE",
    });
    expect(await releaseRes.json()).toEqual({ ok: true, released: true });
    expect(unsubscribeResourceWatch).toHaveBeenCalledWith("sub-1");
  });

  it("retains and releases backend resource watches", async () => {
    const release = vi.fn();
    const retainResourceWatch = vi.fn(() => release);
    const app = new Hono();
    useLocalOwnerAuth(app);
    app.route("/api", createResourceIoRoute({
      retainResourceWatch,
    }));

    const watchRes = await app.request("/api/resource-io/watch", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ resource: { kind: "local-file", path: "/tmp/a.md" } }),
    });
    const watchData = await watchRes.json();

    expect(watchRes.status).toBe(200);
    expect(retainResourceWatch).toHaveBeenCalledWith({ kind: "local-file", path: "/tmp/a.md" });
    expect(typeof watchData.watchId).toBe("string");

    const releaseRes = await app.request(`/api/resource-io/watch/${watchData.watchId}`, {
      method: "DELETE",
    });
    const releaseData = await releaseRes.json();

    expect(releaseRes.status).toBe(200);
    expect(releaseData).toEqual({ ok: true, released: true });
    expect(release).toHaveBeenCalledTimes(1);
  });

  it("fails closed before retaining or subscribing unsafe remote watches", async () => {
    const release = vi.fn();
    const retainResourceWatch = vi.fn(() => release);
    const subscribeResourceWatch = vi.fn(() => ({
      subscriptionId: "must-not-exist",
    }));
    const app = new Hono();
    useRemoteOwnerAuth(app);
    app.route("/api", createResourceIoRoute({
      retainResourceWatch,
      subscribeResourceWatch,
    }));
    const headers = { "Content-Type": "application/json" };
    const unsafeRequests = [
      {
        endpoint: "/api/resource-io/watch",
        body: {
          resource: { kind: "local-file", path: "relative.md" },
        },
      },
      {
        endpoint: "/api/resource-io/watch",
        body: {
          resource: { kind: "mount", mountId: "safe", path: "../escape.md" },
        },
      },
      {
        endpoint: "/api/resource-io/watch",
        body: {
          resource: { kind: "mount", mountId: "safe", path: "/absolute.md" },
        },
      },
      {
        endpoint: "/api/resource-io/subscribe",
        body: {
          resources: [
            { kind: "mount", mountId: "safe", path: "Notes/a.md" },
            { kind: "local-file", path: "/private/a.md" },
          ],
        },
      },
      {
        endpoint: "/api/resource-io/subscribe",
        body: {
          resources: [{
            kind: "mount",
            mountId: "safe",
            path: "Notes/a.md",
            principal: { kind: "local_user" },
          }],
        },
      },
      {
        endpoint: "/api/resource-io/subscribe",
        body: {
          resources: [{
            kind: "mount",
            mountId: "safe",
            path: "Notes/a.md",
            scopes: ["studio.owner", "files.write"],
          }],
        },
      },
      {
        endpoint: "/api/resource-io/subscribe",
        body: {
          sessionPath: "/forged/session.jsonl",
          resources: [{
            kind: "mount",
            mountId: "safe",
            path: "Notes/a.md",
          }],
        },
      },
    ];

    for (const request of unsafeRequests) {
      const res = await app.request(request.endpoint, {
        method: "POST",
        headers,
        body: JSON.stringify(request.body),
      });
      expect([400, 403]).toContain(res.status);
    }
    expect(retainResourceWatch).not.toHaveBeenCalled();
    expect(subscribeResourceWatch).not.toHaveBeenCalled();
    expect(release).not.toHaveBeenCalled();
  });

  it("allows authenticated remote watches only for canonical provider-neutral refs", async () => {
    const release = vi.fn();
    const retainResourceWatch = vi.fn(() => release);
    const subscribeResourceWatch = vi.fn(() => ({
      subscriptionId: "sub-safe",
      resourceKeys: ["mount:safe:Notes/a.md"],
    }));
    const app = new Hono();
    useRemoteOwnerAuth(app);
    app.route("/api", createResourceIoRoute({
      retainResourceWatch,
      subscribeResourceWatch,
    }));
    const headers = { "Content-Type": "application/json" };
    const resource = {
      kind: "mount",
      mountId: "safe",
      path: "Notes/a.md",
    };

    const watch = await app.request("/api/resource-io/watch", {
      method: "POST",
      headers,
      body: JSON.stringify({ resource }),
    });
    expect(watch.status).toBe(200);
    expect(retainResourceWatch).toHaveBeenCalledWith(resource);

    const subscribe = await app.request("/api/resource-io/subscribe", {
      method: "POST",
      headers,
      body: JSON.stringify({ resources: [resource] }),
    });
    expect(subscribe.status).toBe(200);
    expect(await subscribe.json()).toEqual({
      ok: true,
      subscriptionId: "sub-safe",
    });
    expect(subscribeResourceWatch).toHaveBeenCalledWith({
      resources: [resource],
    });
  });

  it("rejects a backslash mount path before the real provider can reinterpret it", async () => {
    const sandbox = fs.mkdtempSync(
      path.join(os.tmpdir(), "hana-resource-route-mount-backslash-"),
    );
    try {
      const hanakoHome = path.join(sandbox, "hana");
      const mountRoot = path.join(sandbox, "mounted");
      const nestedPath = path.join(mountRoot, "Notes", "a", "b.md");
      fs.mkdirSync(path.dirname(nestedPath), { recursive: true });
      fs.writeFileSync(nestedPath, "nested-secret");
      upsertStudioMount(hanakoHome, {
        schemaVersion: 1,
        mountId: "mount-local",
        hostStudioId: "remote-studio",
        sourceKind: "storage",
        provider: "local_fs",
        rootLocator: { path: mountRoot },
        label: "Mounted",
        presentation: "folder",
        capabilities: ["list", "read"],
        grantId: null,
      });
      const provider = new MountProvider({
        hanakoHome,
        studioId: "remote-studio",
        localFsProviderFactory: ({ cwd, guard }) =>
          new LocalFsProvider({ cwd, guard }),
      });
      const read = vi.spyOn(provider, "read");
      const app = new Hono();
      useRemoteOwnerAuth(app);
      app.route("/api", createResourceIoRoute({
        resourceIO: new ResourceIO({
          providers: { mount: provider },
        }),
      }));
      const headers = { "Content-Type": "application/json" };

      const ambiguous = await app.request("/api/resource-io/read", {
        method: "POST",
        headers,
        body: JSON.stringify({
          resource: {
            kind: "mount",
            mountId: "mount-local",
            path: "Notes/a\\b.md",
          },
        }),
      });
      expect(ambiguous.status).toBe(403);
      expect(read).not.toHaveBeenCalled();

      const canonical = await app.request("/api/resource-io/read", {
        method: "POST",
        headers,
        body: JSON.stringify({
          resource: {
            kind: "mount",
            mountId: "mount-local",
            path: "Notes/a/b.md",
          },
        }),
      });
      expect(canonical.status).toBe(200);
      expect((await canonical.json()).content).toBe("nested-secret");
      expect(read).toHaveBeenCalledTimes(1);
    } finally {
      fs.rmSync(sandbox, { recursive: true, force: true });
    }
  });

  it("forces remote reconnect consumers to resync for unlocatable events", async () => {
    const app = new Hono();
    useRemoteOwnerAuth(app);
    app.route("/api", createResourceIoRoute({
      resourceEventsSince: vi.fn(() => ({
        stale: false,
        latestSequence: 42,
        events: [{
          type: "resource.changed",
          resource: { kind: "local-file", path: "relative-but-opaque.md" },
          sequence: 42,
        }],
      })),
    }));

    const res = await app.request("/api/resource-io/events?since=41");
    expect(await res.json()).toEqual({
      stale: true,
      latestSequence: 42,
      events: [],
      resync: "resource-stat-required",
    });
  });

  it("keeps an empty remote event page non-stale", async () => {
    const app = new Hono();
    useRemoteOwnerAuth(app);
    app.route("/api", createResourceIoRoute({
      resourceEventsSince: vi.fn(() => ({
        stale: false,
        latestSequence: 42,
        events: [],
      })),
    }));

    const res = await app.request("/api/resource-io/events?since=42");
    expect(await res.json()).toEqual({
      stale: false,
      latestSequence: 42,
      events: [],
    });
  });

  it("routes stat, read, list, and search through engine ResourceIO", async () => {
    const resourceIO = {
      stat: vi.fn(async () => ({ exists: true, resourceKey: "local_fs:/tmp/a.md" })),
      read: vi.fn(async () => ({ content: Buffer.from("hello"), version: { size: 5 } })),
      list: vi.fn(async () => ({ items: [{ name: "a.md", isDirectory: false }] })),
      search: vi.fn(async () => ({ matches: [{ filePath: "/tmp/a.md", line: 1, text: "hello" }] })),
    };
    const app = new Hono();
    useLocalOwnerAuth(app);
    app.route("/api", createResourceIoRoute({ resourceIO }));

    const statRes = await app.request("/api/resource-io/stat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ resource: { kind: "local-file", path: "/tmp/a.md" } }),
    });
    expect(await statRes.json()).toEqual({ exists: true, resourceKey: "local_fs:/tmp/a.md" });
    expect(resourceIO.stat).toHaveBeenCalledWith({ kind: "local-file", path: "/tmp/a.md" });

    const readRes = await app.request("/api/resource-io/read", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ resource: { kind: "local-file", path: "/tmp/a.md" } }),
    });
    expect(await readRes.json()).toEqual({ content: "hello", encoding: "utf-8", version: { size: 5 } });

    await app.request("/api/resource-io/list", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ resource: { kind: "local-file", path: "/tmp" } }),
    });
    expect(resourceIO.list).toHaveBeenCalledWith({ kind: "local-file", path: "/tmp" });

    await app.request("/api/resource-io/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ resource: { kind: "local-file", path: "/tmp" }, query: "hello" }),
    });
    expect(resourceIO.search).toHaveBeenCalledWith({ kind: "local-file", path: "/tmp" }, { query: "hello" });
  });

  it("projects only canonical Knowledge relative paths in remote search results", async () => {
    const app = new Hono();
    useRemoteOwnerAuth(app);
    app.route("/api", createResourceIoRoute({
      resourceIO: {
        search: vi.fn(async () => ({
          matches: [
            { line: 1, relativePath: "Notes/a\\b.md" },
            { line: 2, relativePath: "../private.md" },
            { line: 3, relativePath: "Notes//empty.md" },
            { line: 4, relativePath: "/absolute.md" },
            { line: 5, relativePath: "Notes/\u0000control.md" },
          ],
        })),
      },
    }));

    const res = await app.request("/api/resource-io/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        resource: {
          kind: "mount",
          mountId: "safe",
          path: "Notes",
        },
        query: "a",
      }),
    });

    expect(await res.json()).toEqual({
      matches: [
        { line: 1, relativePath: "Notes/a\\b.md" },
        { line: 2 },
        { line: 3 },
        { line: 4 },
        { line: 5 },
      ],
    });
  });

  it("returns binary resource reads as base64 when requested", async () => {
    const binary = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x00, 0xff, 0xfe, 0xfd]);
    const resourceIO = {
      read: vi.fn(async () => ({
        content: binary,
        version: { size: binary.byteLength },
        resourceKey: "local_fs:/tmp/pixel.bin",
      })),
    };
    const app = new Hono();
    useLocalOwnerAuth(app);
    app.route("/api", createResourceIoRoute({ resourceIO }));

    const readRes = await app.request("/api/resource-io/read", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        resource: { kind: "local-file", path: "/tmp/pixel.bin" },
        encoding: "base64",
      }),
    });

    expect(readRes.status).toBe(200);
    expect(await readRes.json()).toEqual({
      content: binary.toString("base64"),
      encoding: "base64",
      version: { size: binary.byteLength },
      resourceKey: "local_fs:/tmp/pixel.bin",
    });
  });

  it("rejects invalid UTF-8 reads instead of returning replacement-corrupted content", async () => {
    const resourceIO = {
      read: vi.fn(async () => ({ content: Buffer.from([0xff, 0xfe, 0xfd]) })),
    };
    const app = new Hono();
    useLocalOwnerAuth(app);
    app.route("/api", createResourceIoRoute({ resourceIO }));

    const readRes = await app.request("/api/resource-io/read", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ resource: { kind: "local-file", path: "/tmp/pixel.bin" } }),
    });

    expect(readRes.status).toBe(400);
    expect(await readRes.json()).toEqual({
      error: "Resource content encoding is invalid",
      code: "invalid_resource_encoding",
      safeMessage: "Resource content encoding is invalid",
    });
  });

  it("decodes base64 writes into Buffer before calling ResourceIO", async () => {
    const binary = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x00, 0xff, 0xfe, 0xfd]);
    const write = vi.fn(async (_resource: unknown, _content: unknown, _context?: unknown) => ({
      changeType: "modified",
      resourceKey: "a",
    }));
    const writeExpectedVersion = vi.fn(async (
      _resource: unknown,
      _content: unknown,
      _expectedVersion: unknown,
      _context?: unknown,
    ) => ({ ok: false, conflict: true, version: { size: 5 } }));
    const resourceIO = {
      write,
      writeExpectedVersion,
    };
    const app = new Hono();
    useLocalOwnerAuth(app);
    app.route("/api", createResourceIoRoute({ resourceIO }));

    await app.request("/api/resource-io/write", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        resource: { kind: "local-file", path: "/tmp/pixel.bin" },
        content: binary.toString("base64"),
        encoding: "base64",
      }),
    });

    const writeContent = resourceIO.write.mock.calls[0][1];
    expect(Buffer.isBuffer(writeContent)).toBe(true);
    if (!Buffer.isBuffer(writeContent)) throw new Error("expected Buffer write content");
    expect(writeContent.equals(binary)).toBe(true);

    const writeRes = await app.request("/api/resource-io/write-expected-version", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        resource: { kind: "local-file", path: "/tmp/pixel.bin" },
        content: binary.toString("base64"),
        encoding: "base64",
        expectedVersion: { mtimeMs: 1, size: 5 },
      }),
    });

    expect(writeRes.status).toBe(409);
    const expectedVersionContent = resourceIO.writeExpectedVersion.mock.calls[0][1];
    expect(Buffer.isBuffer(expectedVersionContent)).toBe(true);
    if (!Buffer.isBuffer(expectedVersionContent)) throw new Error("expected Buffer writeExpectedVersion content");
    expect(expectedVersionContent.equals(binary)).toBe(true);
  });

  it("rejects malformed base64 writes without calling ResourceIO", async () => {
    const resourceIO = {
      write: vi.fn(async () => ({ changeType: "modified", resourceKey: "a" })),
    };
    const app = new Hono();
    useLocalOwnerAuth(app);
    app.route("/api", createResourceIoRoute({ resourceIO }));

    const res = await app.request("/api/resource-io/write", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        resource: { kind: "local-file", path: "/tmp/pixel.bin" },
        content: "%%%not-base64%%%",
        encoding: "base64",
      }),
    });

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({
      error: "Resource content encoding is invalid",
      code: "invalid_resource_encoding",
      safeMessage: "Resource content encoding is invalid",
    });
    expect(resourceIO.write).not.toHaveBeenCalled();
  });

  it("routes route-grade mutations through engine ResourceIO with API principal context", async () => {
    const resourceIO = {
      write: vi.fn(async () => ({ changeType: "modified", resourceKey: "a" })),
      writeExpectedVersion: vi.fn(async () => ({ ok: false, conflict: true, version: { size: 5 } })),
      rename: vi.fn(async () => ({ oldResourceKey: "a", newResourceKey: "b" })),
      move: vi.fn(async () => ({ oldResourceKey: "b", newResourceKey: "c" })),
      trash: vi.fn(async () => ({ resourceKey: "c", trashId: "trash_1" })),
    };
    const app = new Hono();
    app.use("*", async (c, next) => {
      setHonoContext(c, "authPrincipal", normalizePrincipal({
        kind: "local_user",
        userId: "user-from-auth",
        studioId: "studio-from-auth",
        connectionKind: "local",
        credentialKind: "loopback_token",
        scopes: ["chat", "resources", "tools"],
        sessionId: "must-be-dropped",
        sessionPath: "/must-be-dropped.jsonl",
      }));
      setHonoContext(c, "transportConnectionKind", "local");
      await next();
    });
    app.route("/api", createResourceIoRoute({ resourceIO }));

    await app.request("/api/resource-io/write", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Request-Id": "request-from-header",
      },
      body: JSON.stringify({
        resource: { kind: "local-file", path: "/tmp/a.md" },
        content: "next",
        reason: "route_write",
      }),
    });
    expect(resourceIO.write).toHaveBeenCalledWith(
      { kind: "local-file", path: "/tmp/a.md" },
      "next",
      expect.objectContaining({
        source: "api",
        reason: "route_write",
        sessionId: null,
        sessionPath: null,
        requestId: "request-from-header",
        principal: expect.objectContaining({
          kind: "api",
          principalId:
            "principal_local_user_user_from_auth_studio_from_auth_no_node",
          scopes: ["chat", "resources", "tools"],
          userId: "user-from-auth",
          studioId: "studio-from-auth",
          sessionId: null,
          sessionPath: null,
          requestId: "request-from-header",
          connectionKind: "local",
          credentialKind: "loopback_token",
        }),
      }),
    );

    const writeRes = await app.request("/api/resource-io/write-expected-version", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        resource: { kind: "local-file", path: "/tmp/a.md" },
        content: "next",
        expectedVersion: { mtimeMs: 1, size: 5 },
        reason: "route_test",
      }),
    });
    expect(writeRes.status).toBe(409);
    expect(await writeRes.json()).toEqual({
      ok: false,
      conflict: true,
      version: { size: 5 },
      safeMessage: "Resource write conflict",
    });
    expect(resourceIO.writeExpectedVersion).toHaveBeenCalledWith(
      { kind: "local-file", path: "/tmp/a.md" },
      "next",
      { mtimeMs: 1, size: 5 },
      expect.objectContaining({
        source: "api",
        reason: "route_test",
        sessionId: null,
        sessionPath: null,
        principal: expect.objectContaining({
          kind: "api",
          principalId:
            "principal_local_user_user_from_auth_studio_from_auth_no_node",
          scopes: ["chat", "resources", "tools"],
          sessionId: null,
        }),
      }),
    );

    await app.request("/api/resource-io/rename", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        from: { kind: "local-file", path: "/tmp/a.md" },
        to: { kind: "local-file", path: "/tmp/b.md" },
      }),
    });
    expect(resourceIO.rename).toHaveBeenCalledWith(
      { kind: "local-file", path: "/tmp/a.md" },
      { kind: "local-file", path: "/tmp/b.md" },
      expect.objectContaining({
        source: "api",
        reason: "resource_io_route",
        sessionPath: null,
        principal: expect.objectContaining({ kind: "api" }),
      }),
    );

    await app.request("/api/resource-io/move", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        from: { kind: "local-file", path: "/tmp/b.md" },
        to: { kind: "local-file", path: "/tmp/archive/b.md" },
      }),
    });
    expect(resourceIO.move).toHaveBeenCalledWith(
      { kind: "local-file", path: "/tmp/b.md" },
      { kind: "local-file", path: "/tmp/archive/b.md" },
      expect.objectContaining({
        source: "api",
        reason: "resource_io_route",
        sessionPath: null,
        principal: expect.objectContaining({ kind: "api" }),
      }),
    );

    await app.request("/api/resource-io/trash", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        resource: { kind: "local-file", path: "/tmp/archive/b.md" },
        trash: { namespace: "workbench" },
      }),
    });
    expect(resourceIO.trash).toHaveBeenCalledWith(
      { kind: "local-file", path: "/tmp/archive/b.md" },
      { namespace: "workbench" },
      expect.objectContaining({
        source: "api",
        reason: "resource_io_route",
        sessionPath: null,
        principal: expect.objectContaining({ kind: "api" }),
      }),
    );
  });

  it.each([
    "principal",
    "userId",
    "studioId",
    "owner",
    "ownerId",
    "scope",
    "scopeToken",
    "sessionId",
    "sessionPath",
    "connectionKind",
    "credentialKind",
    "scopes",
  ])("rejects forged mutation authority field %s before ResourceIO", async (field) => {
    const resourceIO = {
      write: vi.fn(async () => ({ changeType: "modified", resourceKey: "a" })),
    };
    const app = new Hono();
    app.use("*", async (c, next) => {
      setHonoContext(c, "authPrincipal", normalizePrincipal({
        kind: "local_user",
        userId: "real-user",
        studioId: "real-studio",
        connectionKind: "local",
        credentialKind: "loopback_token",
        scopes: ["chat", "resources", "tools"],
      }));
      await next();
    });
    app.route("/api", createResourceIoRoute({ resourceIO }));

    const res = await app.request("/api/resource-io/write", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        resource: { kind: "local-file", path: "/tmp/a.md" },
        content: "forged",
        [field]: field === "principal" ? { userId: "attacker" } : "attacker",
      }),
    });

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({
      error: "Resource mutation authority must come from authenticated context",
      code: "forbidden_resource_authority_field",
      safeMessage: "Resource mutation authority must come from authenticated context",
      details: { field },
    });
    expect(resourceIO.write).not.toHaveBeenCalled();
  });

  it.each([
    ["missing principal", null],
    [
      "invalid principal",
      normalizePrincipal({
        kind: "invalid",
        studioId: "studio-real",
        scopes: ["files.write"],
      }),
    ],
    [
      "missing owner",
      normalizePrincipal({
        kind: "device",
        deviceId: "device-real",
        connectionKind: "lan",
        credentialKind: "device_credential",
        scopes: ["studio.owner", "files.write"],
      }),
    ],
    [
      "missing scope",
      normalizePrincipal({
        kind: "local_user",
        userId: "user-real",
        studioId: "studio-real",
        connectionKind: "local",
        credentialKind: "loopback_token",
        scopes: [],
      }),
    ],
  ])("fails closed for %s auth context before mutation", async (_case, principal) => {
    const resourceIO = {
      write: vi.fn(async () => ({ changeType: "modified", resourceKey: "a" })),
    };
    const app = new Hono();
    if (principal !== null) {
      app.use("*", async (c, next) => {
        setHonoContext(c, "authPrincipal", principal);
        await next();
      });
    }
    app.route("/api", createResourceIoRoute({ resourceIO }));

    const res = await app.request("/api/resource-io/write", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        resource: { kind: "local-file", path: "/tmp/a.md" },
        content: "blocked",
      }),
    });

    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({
      error: "Authenticated resource owner and scope required",
      code: "resource_auth_context_invalid",
      safeMessage: "Authenticated resource owner and scope required",
    });
    expect(resourceIO.write).not.toHaveBeenCalled();
  });

  it.each([
    ["files-only", ["files.write"], 403],
    ["owner-only", ["studio.owner"], 403],
    ["owner-and-files", ["studio.owner", "files.write"], 200],
    ["owner-and-files-wildcard", ["studio.owner", "files.*"], 200],
  ])("requires remote studio owner and file-write scopes: %s", async (
    _case,
    scopes,
    expectedStatus,
  ) => {
    const write = vi.fn(async () => ({
      changeType: "modified",
      resourceKey: "mount:safe:Notes/a.md",
    }));
    const app = new Hono();
    app.use("*", async (c, next) => {
      setHonoContext(c, "authPrincipal", normalizePrincipal({
        kind: "device",
        deviceId: "device-real",
        studioId: "studio-real",
        connectionKind: "lan",
        credentialKind: "device_credential",
        scopes,
      }));
      await next();
    });
    app.route("/api", createResourceIoRoute({
      resourceIO: { write },
    }));

    const res = await app.request("/api/resource-io/write", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        resource: {
          kind: "mount",
          mountId: "safe",
          path: "Notes/a.md",
        },
        content: "next",
      }),
    });

    expect(res.status).toBe(expectedStatus);
    expect(write).toHaveBeenCalledTimes(expectedStatus === 200 ? 1 : 0);
  });

  it("does not let body principalId, studioId, or scopes complete an invalid context", async () => {
    const resourceIO = {
      write: vi.fn(async () => ({ changeType: "modified", resourceKey: "a" })),
    };
    const app = new Hono();
    app.use("*", async (c, next) => {
      setHonoContext(c, "authPrincipal", normalizePrincipal({
        kind: "device",
        deviceId: "device-real",
        connectionKind: "lan",
        credentialKind: "device_credential",
        scopes: [],
      }));
      await next();
    });
    app.route("/api", createResourceIoRoute({ resourceIO }));

    for (const [field, value] of [
      ["principalId", "forged-principal"],
      ["studioId", "forged-studio"],
      ["scopes", ["files.write"]],
    ] as const) {
      const res = await app.request("/api/resource-io/write", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          resource: { kind: "local-file", path: "/tmp/a.md" },
          content: "blocked",
          [field]: value,
        }),
      });
      expect(res.status).toBe(400);
      expect((await res.json()).details).toEqual({ field });
    }
    expect(resourceIO.write).not.toHaveBeenCalled();
  });

  it("KW-US-009 rejects every remote local-file spelling before ResourceIO", async () => {
    const write = vi.fn(async () => ({ changeType: "modified" }));
    const stat = vi.fn(async () => ({ exists: true }));
    const rename = vi.fn(async () => ({ ok: true }));
    const app = new Hono();
    useRemoteOwnerAuth(app);
    app.route("/api", createResourceIoRoute({
      resourceIO: { write, stat, rename },
    }));
    const headers = { "Content-Type": "application/json" };
    const requests = [
      {
        endpoint: "/api/resource-io/write",
        body: {
          resource: { kind: "local-file", path: "relative.md" },
          content: "blocked",
        },
      },
      {
        endpoint: "/api/resource-io/stat",
        body: {
          resource: { kind: "local-file", path: "/private/a.md" },
        },
      },
      {
        endpoint: "/api/resource-io/rename",
        body: {
          from: { kind: "mount", mountId: "safe", path: "a.md" },
          to: { kind: "local-file", path: "..\\private.md" },
        },
      },
    ];

    for (const request of requests) {
      const res = await app.request(request.endpoint, {
        method: "POST",
        headers,
        body: JSON.stringify(request.body),
      });
      expect(res.status).toBe(403);
      expect(await res.json()).toEqual({
        error: "Remote resource request is not allowed",
        code: "resource_path_not_remote_safe",
        safeMessage:
          "Remote resource request is not allowed",
      });
    }
    expect(write).not.toHaveBeenCalled();
    expect(stat).not.toHaveBeenCalled();
    expect(rename).not.toHaveBeenCalled();
  });

  it("blocks real LocalFs traversal without a disk side effect", async () => {
    const sandbox = fs.mkdtempSync(
      path.join(os.tmpdir(), "hana-resource-route-traversal-"),
    );
    try {
      const sourceRoot = path.join(sandbox, "source");
      fs.mkdirSync(sourceRoot);
      const outsidePath = path.join(sandbox, "outside.md");
      const resourceIO = new ResourceIO({
        providers: {
          local_fs: new LocalFsProvider({
            cwd: sourceRoot,
          }),
        },
      });
      const app = new Hono();
      useRemoteOwnerAuth(app);
      app.route("/api", createResourceIoRoute({ resourceIO }));

      const res = await app.request("/api/resource-io/write", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          resource: { kind: "local-file", path: "../outside.md" },
          content: "must-not-exist",
        }),
      });
      expect(res.status).toBe(403);
      expect(fs.existsSync(outsidePath)).toBe(false);
    } finally {
      fs.rmSync(sandbox, { recursive: true, force: true });
    }
  });

  it("keeps existing local-owner ResourceIO compatibility fields", async () => {
    const sandbox = fs.mkdtempSync(
      path.join(os.tmpdir(), "hana-resource-route-local-"),
    );
    try {
      const resourceIO = new ResourceIO({
        providers: {
          local_fs: new LocalFsProvider({ cwd: sandbox }),
        },
      });
      const app = new Hono();
      useLocalOwnerAuth(app);
      app.route("/api", createResourceIoRoute({ resourceIO }));
      const filePath = path.join(sandbox, "local.md");
      fs.writeFileSync(filePath, "local");

      const stat = await app.request("/api/resource-io/stat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          resource: { kind: "local-file", path: filePath },
        }),
      });
      const body = await stat.json();
      const realFilePath = fs.realpathSync(filePath);
      expect(body.filePath).toBe(realFilePath);
      expect(body.resource.path).toBe(realFilePath);
    } finally {
      fs.rmSync(sandbox, { recursive: true, force: true });
    }
  });

  it("KW-US-163 returns a fixed safe error for unclassified local-fs failures", async () => {
    const privatePath = "/private/provider/root/a.md";
    const app = new Hono();
    useRemoteOwnerAuth(app);
    app.route("/api", createResourceIoRoute({
      resourceIO: {
        read: vi.fn(async () => {
          throw new Error(`failed reading ${privatePath}`);
        }),
      },
    }));

    const res = await app.request("/api/resource-io/read", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        resource: {
          kind: "mount",
          mountId: "safe",
          path: "Notes/a.md",
        },
      }),
    });
    const body = await res.json();

    expect(res.status).toBe(500);
    expect(body).toEqual({
      error: "Resource operation failed",
      code: "resource_operation_failed",
      safeMessage: "Resource operation failed",
    });
    expect(JSON.stringify(body)).not.toContain(privatePath);
  });

  it("routes mkdir, delete, and copy through engine ResourceIO with API principal context", async () => {
    const resourceIO = {
      mkdir: vi.fn(async () => ({ changeType: "created", resourceKey: "a", version: { mtimeMs: 1, size: null } })),
      delete: vi.fn(async () => ({ changeType: "modified", resourceKey: "a" })),
      copy: vi.fn(async () => ({ changeType: "created", resourceKey: "b", version: { mtimeMs: 2, size: 5 } })),
    };
    const app = new Hono();
    useLocalOwnerAuth(app);
    app.route("/api", createResourceIoRoute({ resourceIO }));
    const headers = { "Content-Type": "application/json" };

    const mkdirRes = await app.request("/api/resource-io/mkdir", {
      method: "POST",
      headers,
      body: JSON.stringify({
        resource: { kind: "local-file", path: "/tmp/new-dir" },
        reason: "route_mkdir",
      }),
    });
    expect(mkdirRes.status).toBe(200);
    expect(await mkdirRes.json()).toMatchObject({ changeType: "created" });
    expect(resourceIO.mkdir).toHaveBeenCalledWith(
      { kind: "local-file", path: "/tmp/new-dir" },
      expect.objectContaining({
        source: "api",
        reason: "route_mkdir",
        principal: expect.objectContaining({ kind: "api" }),
      }),
    );

    const deleteRes = await app.request("/api/resource-io/delete", {
      method: "POST",
      headers,
      body: JSON.stringify({
        resource: { kind: "local-file", path: "/tmp/new-dir" },
      }),
    });
    expect(deleteRes.status).toBe(200);
    expect(resourceIO.delete).toHaveBeenCalledWith(
      { kind: "local-file", path: "/tmp/new-dir" },
      expect.objectContaining({
        source: "api",
        reason: "resource_io_route",
        principal: expect.objectContaining({ kind: "api" }),
      }),
    );

    const copyRes = await app.request("/api/resource-io/copy", {
      method: "POST",
      headers,
      body: JSON.stringify({
        from: { kind: "local-file", path: "/tmp/a.md" },
        to: { kind: "local-file", path: "/tmp/b.md" },
      }),
    });
    expect(copyRes.status).toBe(200);
    expect(resourceIO.copy).toHaveBeenCalledWith(
      { kind: "local-file", path: "/tmp/a.md" },
      { kind: "local-file", path: "/tmp/b.md" },
      expect.objectContaining({
        source: "api",
        principal: expect.objectContaining({ kind: "api" }),
      }),
    );
  });

  it.each([
    ["mkdir", { resource: { kind: "mount", mountId: "safe", path: "Notes" } }],
    ["delete", { resource: { kind: "mount", mountId: "safe", path: "Notes/a.md" } }],
    ["copy", {
      from: { kind: "mount", mountId: "safe", path: "Notes/a.md" },
      to: { kind: "mount", mountId: "safe", path: "Notes/b.md" },
    }],
  ])("rejects forged authority fields on %s before ResourceIO", async (endpoint, base) => {
    const handler = vi.fn(async () => ({ changeType: "created", resourceKey: "x" }));
    const app = new Hono();
    useLocalOwnerAuth(app);
    app.route("/api", createResourceIoRoute({
      resourceIO: { [endpoint]: handler },
    }));

    for (const field of ["principal", "userId", "studioId", "owner", "scopeToken", "resolvedPath"]) {
      const res = await app.request(`/api/resource-io/${endpoint}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...base,
          [field]: field === "principal" ? { userId: "attacker" } : "attacker",
        }),
      });
      expect(res.status).toBe(400);
      expect((await res.json()).code).toBe("forbidden_resource_authority_field");
    }
    expect(handler).not.toHaveBeenCalled();
  });

  it("projects remote mkdir, delete, and copy results without local paths", async () => {
    const privatePath = "/private/mount/root/Notes";
    const resourceIO = {
      mkdir: vi.fn(async () => ({
        changeType: "created",
        resourceKey: `local_fs:${privatePath}`,
        resource: { kind: "mount", mountId: "safe", path: "Notes", filePath: privatePath },
        version: { mtimeMs: 4, size: null },
        filePath: privatePath,
      })),
      delete: vi.fn(async () => ({
        changeType: "modified",
        resourceKey: `local_fs:${privatePath}`,
        resource: { kind: "mount", mountId: "safe", path: "Notes", filePath: privatePath },
        filePath: privatePath,
      })),
      copy: vi.fn(async () => ({
        changeType: "created",
        resourceKey: `local_fs:${privatePath}`,
        resource: { kind: "mount", mountId: "safe", path: "Notes/b.md", filePath: privatePath },
        version: { mtimeMs: 5, size: 5 },
        filePath: privatePath,
      })),
    };
    const app = new Hono();
    useRemoteOwnerAuth(app);
    app.route("/api", createResourceIoRoute({ resourceIO }));
    const headers = { "Content-Type": "application/json" };

    const mkdir = await (await app.request("/api/resource-io/mkdir", {
      method: "POST",
      headers,
      body: JSON.stringify({ resource: { kind: "mount", mountId: "safe", path: "Notes" } }),
    })).json();
    expect(mkdir).toEqual({
      ok: true,
      changeType: "created",
      version: { mtimeMs: 4, size: null },
    });

    const deleted = await (await app.request("/api/resource-io/delete", {
      method: "POST",
      headers,
      body: JSON.stringify({ resource: { kind: "mount", mountId: "safe", path: "Notes/a.md" } }),
    })).json();
    expect(deleted).toEqual({ ok: true, changeType: "modified" });

    const copied = await (await app.request("/api/resource-io/copy", {
      method: "POST",
      headers,
      body: JSON.stringify({
        from: { kind: "mount", mountId: "safe", path: "Notes/a.md" },
        to: { kind: "mount", mountId: "safe", path: "Notes/b.md" },
      }),
    })).json();
    expect(copied).toEqual({
      ok: true,
      changeType: "created",
      version: { mtimeMs: 5, size: 5 },
    });

    expect(JSON.stringify({ mkdir, deleted, copied })).not.toContain(privatePath);
  });

  it("rejects remote local-file refs on mkdir, delete, and copy before ResourceIO", async () => {
    const mkdir = vi.fn(async () => ({ changeType: "created" }));
    const del = vi.fn(async () => ({ changeType: "modified" }));
    const copy = vi.fn(async () => ({ changeType: "created" }));
    const app = new Hono();
    useRemoteOwnerAuth(app);
    app.route("/api", createResourceIoRoute({
      resourceIO: { mkdir, delete: del, copy },
    }));
    const headers = { "Content-Type": "application/json" };
    const requests = [
      ["/api/resource-io/mkdir", { resource: { kind: "local-file", path: "/private/dir" } }],
      ["/api/resource-io/delete", { resource: { kind: "local-file", path: "/private/a.md" } }],
      ["/api/resource-io/copy", {
        from: { kind: "mount", mountId: "safe", path: "Notes/a.md" },
        to: { kind: "local-file", path: "/private/b.md" },
      }],
    ] as const;

    for (const [endpoint, body] of requests) {
      const res = await app.request(endpoint, {
        method: "POST",
        headers,
        body: JSON.stringify(body),
      });
      expect(res.status).toBe(403);
      expect((await res.json()).code).toBe("resource_path_not_remote_safe");
    }
    expect(mkdir).not.toHaveBeenCalled();
    expect(del).not.toHaveBeenCalled();
    expect(copy).not.toHaveBeenCalled();
  });

  it("keeps HTTP mkdir and delete consistent with denied provider capabilities", async () => {
    const app = new Hono();
    useLocalOwnerAuth(app);
    app.route("/api", createResourceIoRoute({
      resourceIO: new ResourceIO({
        providers: {
          resource: {
            id: "resource",
            capabilities: () => ({ mkdir: false, delete: false }),
          },
        },
      }),
    }));
    const headers = { "Content-Type": "application/json" };

    for (const endpoint of ["mkdir", "delete"]) {
      const res = await app.request(`/api/resource-io/${endpoint}`, {
        method: "POST",
        headers,
        body: JSON.stringify({ resource: { kind: "resource", resourceId: "res_1" } }),
      });
      expect(res.status).toBe(403);
      expect(await res.json()).toMatchObject({
        code: "knowledge_resource_out_of_scope",
        httpStatus: 403,
        retryable: false,
      });
    }
  });

  it("creates and deletes real directories through the HTTP seam with event correlation", async () => {
    const sandbox = fs.mkdtempSync(
      path.join(os.tmpdir(), "hana-resource-route-mkdir-"),
    );
    try {
      const events: unknown[] = [];
      const resourceIO = new ResourceIO({
        providers: { local_fs: new LocalFsProvider({ cwd: sandbox }) },
        eventBus: {
          changed: (event: unknown) => { events.push(event); return event; },
          deleted: (event: unknown) => { events.push(event); return event; },
          renamed: (event: unknown) => { events.push(event); return event; },
        } as never,
      });
      const app = new Hono();
      useLocalOwnerAuth(app);
      app.route("/api", createResourceIoRoute({ resourceIO }));
      const headers = { "Content-Type": "application/json" };
      const dirPath = path.join(sandbox, "notes");
      const operationId = "6f0d2f1a-4d5e-4a5b-9b6a-1f2e3d4c5b6a";

      const mkdirRes = await app.request("/api/resource-io/mkdir", {
        method: "POST",
        headers,
        body: JSON.stringify({
          resource: { kind: "local-file", path: dirPath },
          operationId,
        }),
      });
      expect(mkdirRes.status).toBe(200);
      expect(fs.statSync(dirPath).isDirectory()).toBe(true);

      const deleteRes = await app.request("/api/resource-io/delete", {
        method: "POST",
        headers,
        body: JSON.stringify({
          resource: { kind: "local-file", path: dirPath },
          operationId,
        }),
      });
      expect(deleteRes.status).toBe(200);
      expect(fs.existsSync(dirPath)).toBe(false);
      expect(events).toHaveLength(2);
      for (const event of events) {
        expect((event as { operationId?: string }).operationId).toBe(operationId);
      }
    } finally {
      fs.rmSync(sandbox, { recursive: true, force: true });
    }
  });

  it("applies expected-version preconditions to HTTP mkdir, copy, and delete", async () => {
    const sandbox = fs.mkdtempSync(
      path.join(os.tmpdir(), "hana-resource-route-expected-"),
    );
    try {
      const resourceIO = new ResourceIO({
        providers: { local_fs: new LocalFsProvider({ cwd: sandbox }) },
      });
      const app = new Hono();
      useLocalOwnerAuth(app);
      app.route("/api", createResourceIoRoute({ resourceIO }));
      const headers = { "Content-Type": "application/json" };
      const existingDirectory = path.join(sandbox, "existing");
      fs.mkdirSync(existingDirectory);

      const mkdirConflict = await app.request("/api/resource-io/mkdir", {
        method: "POST",
        headers,
        body: JSON.stringify({
          resource: { kind: "local-file", path: existingDirectory },
          expectedVersion: null,
        }),
      });
      expect(mkdirConflict.status).toBe(409);
      expect((await mkdirConflict.json()).code).toBe("knowledge_resource_conflict");

      const source = path.join(sandbox, "source.md");
      const target = path.join(sandbox, "target.md");
      fs.writeFileSync(source, "new");
      fs.writeFileSync(target, "old");
      const staleCopy = await app.request("/api/resource-io/copy", {
        method: "POST",
        headers,
        body: JSON.stringify({
          from: { kind: "local-file", path: source },
          to: { kind: "local-file", path: target },
          expectedVersion: { mtimeMs: 0, size: 3 },
        }),
      });
      expect(staleCopy.status).toBe(409);
      expect((await staleCopy.json()).code).toBe("knowledge_version_conflict");
      expect(fs.readFileSync(target, "utf-8")).toBe("old");

      const targetStat = fs.lstatSync(target);
      const copied = await app.request("/api/resource-io/copy", {
        method: "POST",
        headers,
        body: JSON.stringify({
          from: { kind: "local-file", path: source },
          to: { kind: "local-file", path: target },
          expectedVersion: {
            mtimeMs: targetStat.mtime.getTime(),
            size: targetStat.size,
          },
        }),
      });
      expect(copied.status).toBe(200);
      expect(fs.readFileSync(target, "utf-8")).toBe("new");

      const staleDelete = await app.request("/api/resource-io/delete", {
        method: "POST",
        headers,
        body: JSON.stringify({
          resource: { kind: "local-file", path: target },
          expectedVersion: { mtimeMs: 0, size: 3 },
        }),
      });
      expect(staleDelete.status).toBe(409);
      expect(fs.existsSync(target)).toBe(true);

      const deleteStat = fs.lstatSync(target);
      const deleted = await app.request("/api/resource-io/delete", {
        method: "POST",
        headers,
        body: JSON.stringify({
          resource: { kind: "local-file", path: target },
          expectedVersion: {
            mtimeMs: deleteStat.mtime.getTime(),
            size: deleteStat.size,
          },
        }),
      });
      expect(deleted.status).toBe(200);
      expect(fs.existsSync(target)).toBe(false);
    } finally {
      fs.rmSync(sandbox, { recursive: true, force: true });
    }
  });

  it("rejects malformed mutation expected versions instead of silently dropping them", async () => {
    const app = new Hono();
    useLocalOwnerAuth(app);
    const copy = vi.fn();
    app.route("/api", createResourceIoRoute({
      resourceIO: {
        copy,
      },
    }));

    for (const expectedVersion of ["opaque", true, []]) {
      const response = await app.request("/api/resource-io/copy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          from: { kind: "resource", resourceId: "from" },
          to: { kind: "resource", resourceId: "to" },
          expectedVersion,
        }),
      });
      expect(response.status).toBe(412);
      expect((await response.json()).code)
        .toBe("knowledge_operation_precondition_failed");
    }
    expect(copy).not.toHaveBeenCalled();
  });

  it("rejects a malformed mutation operationId before ResourceIO", async () => {
    const resourceIO = {
      mkdir: vi.fn(async () => ({ changeType: "created", resourceKey: "a" })),
    };
    const app = new Hono();
    useLocalOwnerAuth(app);
    app.route("/api", createResourceIoRoute({ resourceIO }));

    const res = await app.request("/api/resource-io/mkdir", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        resource: { kind: "local-file", path: "/tmp/dir" },
        operationId: "not-a-uuid",
      }),
    });

    expect(res.status).toBe(412);
    expect(await res.json()).toMatchObject({
      code: "knowledge_operation_precondition_failed",
      httpStatus: 412,
      retryable: false,
      details: { field: "operationId" },
    });
    expect(resourceIO.mkdir).not.toHaveBeenCalled();
  });

  it("routes provider-neutral transfer with authenticated context and correlation", async () => {
    const operationId = "6f0d2f1a-4d5e-4a5b-9b6a-1f2e3d4c5b6a";
    const transfer = vi.fn(async () => ({
      target: { kind: "mount", mountId: "target", path: "Notes/copy.md" },
      version: "v1:10:5",
      bytesTransferred: 5,
    }));
    const app = new Hono();
    useLocalOwnerAuth(app);
    app.route("/api", createResourceIoRoute({ resourceIO: { transfer } }));

    const response = await app.request("/api/resource-io/transfer", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        source: { kind: "mount", mountId: "source", path: "Notes/a.md" },
        targetDirectory: { kind: "mount", mountId: "target", path: "Notes" },
        targetName: "copy.md",
        operationId,
      }),
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      ok: true,
      target: { kind: "mount", mountId: "target", path: "Notes/copy.md" },
      version: "v1:10:5",
      bytesTransferred: 5,
    });
    expect(transfer).toHaveBeenCalledWith(
      expect.objectContaining({
        targetName: "copy.md",
        operationId,
        signal: expect.any(AbortSignal),
      }),
      expect.objectContaining({
        source: "api",
        operationId,
        principal: expect.objectContaining({ kind: "api" }),
      }),
    );
  });

  it("projects remote transfer responses without native paths or private provider data", async () => {
    const privatePath = "/private/workspace/Notes/copy.md";
    const transfer = vi.fn(async () => ({
      target: {
        kind: "mount",
        mountId: "target",
        path: "Notes/copy.md",
        filePath: privatePath,
        resolvedPath: privatePath,
      },
      version: "v1:10:5",
      bytesTransferred: 5,
      filePath: privatePath,
      resourceKey: `mount:target:${privatePath}`,
    }));
    const app = new Hono();
    useRemoteOwnerAuth(app);
    app.route("/api", createResourceIoRoute({ resourceIO: { transfer } }));

    const response = await app.request("/api/resource-io/transfer", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        source: { kind: "mount", mountId: "source", path: "Notes/a.md" },
        targetDirectory: { kind: "mount", mountId: "target", path: "Notes" },
        targetName: "copy.md",
        operationId: "6f0d2f1a-4d5e-4a5b-9b6a-1f2e3d4c5b6a",
      }),
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({
      ok: true,
      target: { kind: "mount", mountId: "target", path: "Notes/copy.md" },
      version: "v1:10:5",
      bytesTransferred: 5,
    });
    expect(JSON.stringify(body)).not.toContain(privatePath);
  });

  it("rejects nested forged authority and remote local-file transfer refs before ResourceIO", async () => {
    const transfer = vi.fn();
    const localApp = new Hono();
    useLocalOwnerAuth(localApp);
    localApp.route("/api", createResourceIoRoute({ resourceIO: { transfer } }));
    const forged = await localApp.request("/api/resource-io/transfer", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        source: {
          kind: "mount",
          mountId: "source",
          path: "a.md",
          principal: { userId: "attacker" },
        },
        targetDirectory: { kind: "mount", mountId: "target", path: "" },
        targetName: "copy.md",
        operationId: "6f0d2f1a-4d5e-4a5b-9b6a-1f2e3d4c5b6a",
      }),
    });
    expect(forged.status).toBe(400);
    expect(await forged.json()).toMatchObject({
      code: "forbidden_resource_authority_field",
      details: { field: "principal" },
    });

    const remoteApp = new Hono();
    useRemoteOwnerAuth(remoteApp);
    remoteApp.route("/api", createResourceIoRoute({ resourceIO: { transfer } }));
    const remote = await remoteApp.request("/api/resource-io/transfer", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        source: { kind: "local-file", path: "/private/a.md" },
        targetDirectory: { kind: "mount", mountId: "target", path: "" },
        targetName: "copy.md",
        operationId: "6f0d2f1a-4d5e-4a5b-9b6a-1f2e3d4c5b6a",
      }),
    });
    expect(remote.status).toBe(403);
    expect((await remote.json()).code).toBe("resource_path_not_remote_safe");

    const privateAlias = await localApp.request("/api/resource-io/transfer", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        source: { kind: "local-file", filePath: "/private/a.md" },
        targetDirectory: { kind: "mount", mountId: "target", path: "" },
        targetName: "copy.md",
        operationId: "6f0d2f1a-4d5e-4a5b-9b6a-1f2e3d4c5b6a",
      }),
    });
    expect(privateAlias.status).toBe(400);
    expect(await privateAlias.json()).toMatchObject({
      code: "forbidden_resource_authority_field",
      details: { field: "filePath" },
    });
    expect(transfer).not.toHaveBeenCalled();
  });

  it("returns sanitized ResourceIO denial errors", async () => {
    const resourceIO = {
      write: vi.fn(async () => {
        throw Object.assign(
          new Error("Denied /tmp/hana-fixture/private/repo/.git/config"),
          {
            code: "resource_access_denied",
            status: 403,
            safeMessage: "Resource access denied by authority policy",
          },
        );
      }),
    };
    const app = new Hono();
    useLocalOwnerAuth(app);
    app.route("/api", createResourceIoRoute({ resourceIO }));

    const res = await app.request("/api/resource-io/write", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        resource: { kind: "local-file", path: "/tmp/hana-fixture/private/repo/.git/config" },
        content: "bad",
      }),
    });
    const body = await res.json();

    expect(res.status).toBe(403);
    expect(body).toEqual({
      error: "Knowledge resource operation failed",
      code: "knowledge_resource_out_of_scope",
      httpStatus: 403,
      retryable: false,
    });
    expect(JSON.stringify(body)).not.toContain("/tmp/hana-fixture");
  });
});
