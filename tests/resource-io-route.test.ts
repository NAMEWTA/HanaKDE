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
      error: "Resource content is not valid UTF-8; request encoding \"base64\" for binary content",
      code: "invalid_resource_encoding",
      safeMessage: "Resource content is not valid UTF-8; request encoding \"base64\" for binary content",
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
      error: "Resource content is not valid base64",
      code: "invalid_resource_encoding",
      safeMessage: "Resource content is not valid base64",
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
        error: "Remote resource requests cannot use local-file references",
        code: "resource_path_not_remote_safe",
        safeMessage:
          "Remote resource requests cannot use local-file references",
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
      error: "Resource access denied by authority policy",
      code: "resource_access_denied",
      safeMessage: "Resource access denied by authority policy",
    });
    expect(JSON.stringify(body)).not.toContain("/tmp/hana-fixture");
  });
});
