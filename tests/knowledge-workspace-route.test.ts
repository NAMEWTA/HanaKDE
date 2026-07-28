import fs from "fs";
import os from "os";
import path from "path";
import { Hono } from "hono";
import { afterEach, describe, expect, it, vi } from "vitest";
import { upsertStudioMount } from "../core/studio-mounts.ts";
import { normalizePrincipal } from "../core/security-principal.ts";
import { ResourceWatchRegistry } from "../lib/resource-io/resource-watch-registry.ts";
import {
  createKnowledgeWorkspaceRoute,
} from "../server/routes/knowledge-workspace.ts";
import { createResourceIoRoute } from "../server/routes/resource-io.ts";

describe("knowledge workspace source route", () => {
  let tempRoot: string | null = null;

  afterEach(() => {
    if (tempRoot) fs.rmSync(tempRoot, { recursive: true, force: true });
    tempRoot = null;
  });

  function setup() {
    tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "hana-knowledge-route-"));
    const main = path.join(tempRoot, "main");
    const research = path.join(tempRoot, "research");
    const hanakoHome = path.join(tempRoot, "hana");
    fs.mkdirSync(main, { recursive: true });
    fs.mkdirSync(research, { recursive: true });
    upsertStudioMount(hanakoHome, {
      mountId: "mount_research",
      hostStudioId: "studio_1",
      sourceKind: "storage",
      provider: "local_fs",
      rootLocator: { path: research },
      label: "Research",
      presentation: "folder",
      capabilities: ["list", "read", "write", "watch", "materialize"],
    });
    const engine = {
      hanakoHome,
      defaultDeskCwd: main,
      homeCwd: main,
      deskCwd: main,
      getRuntimeContext: () => ({
        serverId: "server_1",
        serverNodeId: "node_1",
        userId: "user_1",
        studioId: "studio_1",
        connectionKind: "local",
        credentialKind: "loopback_token",
      }),
    };
    const app = new Hono();
    app.route("/api", createKnowledgeWorkspaceRoute(engine));
    return { app, engine, main, research };
  }

  it("lists main, mounts and removes a session-only source through the public API", async () => {
    const { app } = setup();
    const initial = await app.request("/api/knowledge-workspace/sources");
    expect(initial.status).toBe(200);
    expect(await initial.json()).toEqual({
      sources: [expect.objectContaining({ sourceKey: "main", role: "main" })],
    });

    const created = await app.request("/api/knowledge-workspace/sources", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sourceKey: "research",
        displayName: "Research",
        mountId: "mount_research",
      }),
    });
    expect(created.status).toBe(201);
    expect(await created.json()).toEqual({
      source: expect.objectContaining({
        sourceKey: "research",
        role: "mounted",
      }),
    });

    const listed = await app.request("/api/knowledge-workspace/sources");
    expect((await listed.json()).sources.map((source) => source.sourceKey))
      .toEqual(["main", "research"]);

    const removed = await app.request(
      "/api/knowledge-workspace/sources/research",
      { method: "DELETE" },
    );
    expect(removed.status).toBe(200);
    expect(await removed.json()).toEqual({
      ok: true,
      sourceKey: "research",
    });
  });

  it("resolves public KnowledgeResourceAddress values before ResourceIO access", async () => {
    const { engine, main } = setup();
    const stat = vi.fn(async (resource) => ({
      resourceKey: "local_fs:redacted",
      resource,
      exists: true,
      isDirectory: false,
      version: { size: 3, mtimeMs: 12 },
      filePath: path.join(main, "notes", "a.md"),
    }));
    Object.assign(engine, { resourceIO: { stat } });
    const app = new Hono();
    app.route("/api", createResourceIoRoute(engine));

    const response = await app.request("/api/resource-io/stat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        address: { sourceKey: "main", relativePath: "notes/a.md" },
      }),
    });

    expect(response.status).toBe(200);
    expect(stat).toHaveBeenCalledWith({
      kind: "local-file",
      path: path.join(fs.realpathSync(main), "notes", "a.md"),
    });
    const text = await response.text();
    expect(JSON.parse(text)).toEqual({
      exists: true,
      isDirectory: false,
      version: { size: 3, mtimeMs: 12 },
    });
    expect(text).not.toContain(main);
  });

  it("keeps mounted provider identity behind sourceKey during ResourceIO access", async () => {
    const { engine } = setup();
    const app = new Hono();
    app.route("/api", createKnowledgeWorkspaceRoute(engine));
    const stat = vi.fn(async (resource) => ({
      resourceKey: "mount:redacted",
      resource,
      exists: true,
      isDirectory: false,
      version: { size: 3, mtimeMs: 12 },
    }));
    Object.assign(engine, { resourceIO: { stat } });
    app.route("/api", createResourceIoRoute(engine));

    const created = await app.request("/api/knowledge-workspace/sources", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sourceKey: "research",
        displayName: "Research",
        mountId: "mount_research",
      }),
    });
    expect(created.status).toBe(201);

    const response = await app.request("/api/resource-io/stat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        address: {
          sourceKey: "research",
          relativePath: "papers/a.md",
        },
      }),
    });

    expect(response.status).toBe(200);
    expect(stat).toHaveBeenCalledWith({
      kind: "mount",
      mountId: "mount_research",
      path: "papers/a.md",
    });
  });

  it("creates a source-scoped paired watch, emits changes, and binds cleanup to its principal", async () => {
    const { engine, main } = setup();
    const emitted: unknown[] = [];
    const closeWatch = vi.fn();
    let notifyWatch: ((changedPath?: string) => void) | null = null;
    const watchRegistry = new ResourceWatchRegistry({
      debounceMs: 0,
      emitEvent: (event) => emitted.push(event),
      resolveWatchTarget: (resource) => {
        const ref = resource as { kind: "local-file"; path: string };
        return {
          ref,
          filePath: ref.path,
          resourceKey: `local_fs:${ref.path}`,
          resource: ref,
          isDirectory: true,
          toResource: (changedPath) => ({
            resourceKey: `local_fs:${changedPath}`,
            resource: { kind: "local-file", path: changedPath },
            filePath: changedPath,
          }),
        };
      },
      watchPath: (_targetPath, handler) => {
        notifyWatch = handler as (changedPath?: string) => void;
        return { close: closeWatch };
      },
      statPath: () => ({
        exists: true,
        isDirectory: false,
        mtimeMs: 12,
        size: 7,
      }),
    });
    Object.assign(engine, {
      subscribeResourceWatch: (input) => watchRegistry.subscribe(input),
      unsubscribeResourceWatch: (subscriptionId) =>
        watchRegistry.unsubscribe(subscriptionId),
    });
    const app = new Hono();
    app.use("*", async (c, next) => {
      const deviceId = c.req.header("x-test-device") || "device-a";
      (c as unknown as {
        set(key: string, value: unknown): void;
      }).set("authPrincipal", normalizePrincipal({
        kind: "device",
        deviceId,
        userId: "user_1",
        studioId: "studio_1",
        serverId: "server_1",
        serverNodeId: "node_1",
        connectionKind: "lan",
        credentialKind: "device_credential",
        trustState: "paired",
        scopes: ["files.read"],
      }));
      await next();
    });
    app.route("/api", createResourceIoRoute(engine));

    const subscribed = await app.request("/api/resource-io/subscribe", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-test-device": "device-a",
      },
      body: JSON.stringify({
        purpose: "knowledge-source-watch",
        sourceKeys: ["main"],
      }),
    });
    expect(subscribed.status).toBe(200);
    const subscription = await subscribed.json() as {
      subscriptionId: string;
    };
    expect(subscription).toMatchObject({
      ok: true,
      subscriptionId: expect.any(String),
      leaseDurationMs: 30_000,
      leaseExpiresAt: expect.any(String),
    });
    expect(JSON.stringify(subscription)).not.toContain(main);
    expect(watchRegistry.diagnostics()).toMatchObject({
      subscriptions: 1,
      watches: [{ refCount: 1, isDirectory: true }],
    });

    notifyWatch?.("changed.md");
    await vi.waitFor(() => expect(emitted).toHaveLength(1));
    expect(emitted[0]).toMatchObject({
      type: "resource.changed",
      changeType: "modified",
      source: "provider_watch",
    });

    const foreignCleanup = await app.request(
      `/api/resource-io/subscriptions/${subscription.subscriptionId}`,
      {
        method: "DELETE",
        headers: { "x-test-device": "device-b" },
      },
    );
    expect(await foreignCleanup.json()).toEqual({
      ok: true,
      released: false,
    });
    expect(watchRegistry.diagnostics().subscriptions).toBe(1);
    expect(closeWatch).not.toHaveBeenCalled();

    const ownerCleanup = await app.request(
      `/api/resource-io/subscriptions/${subscription.subscriptionId}`,
      {
        method: "DELETE",
        headers: { "x-test-device": "device-a" },
      },
    );
    expect(await ownerCleanup.json()).toEqual({
      ok: true,
      released: true,
    });
    expect(watchRegistry.diagnostics().subscriptions).toBe(0);
    expect(closeWatch).toHaveBeenCalledTimes(1);
  });

  it("renews an owned remote watch lease and reclaims its watcher after expiry", async () => {
    const { engine } = setup();
    let closeAttempts = 0;
    const closeWatch = vi.fn(() => {
      closeAttempts += 1;
      if (closeAttempts === 1) throw new Error("watch close failed");
    });
    const leaseCallbacks: Array<() => void> = [];
    const watchRegistry = new ResourceWatchRegistry({
      emitEvent: () => {},
      resolveWatchTarget: (resource) => {
        const ref = resource as { kind: "local-file"; path: string };
        return {
          ref,
          filePath: ref.path,
          resourceKey: `local_fs:${ref.path}`,
          resource: ref,
          isDirectory: true,
        };
      },
      watchPath: () => ({ close: closeWatch }),
    });
    Object.assign(engine, {
      subscribeResourceWatch: (input) => watchRegistry.subscribe(input),
      unsubscribeResourceWatch: (subscriptionId) =>
        watchRegistry.unsubscribe(subscriptionId),
    });
    const app = new Hono();
    app.use("*", async (c, next) => {
      (c as unknown as {
        set(key: string, value: unknown): void;
      }).set("authPrincipal", normalizePrincipal({
        kind: "device",
        deviceId: "device-a",
        userId: "user_1",
        studioId: "studio_1",
        serverId: "server_1",
        serverNodeId: "node_1",
        connectionKind: "lan",
        credentialKind: "device_credential",
        trustState: "paired",
        scopes: ["files.read"],
      }));
      await next();
    });
    app.route("/api", createResourceIoRoute(engine, {
      remoteWatchLeaseMs: 1_000,
      setLeaseTimeout: ((callback: () => void) => {
        leaseCallbacks.push(callback);
        return { unref: () => {} };
      }) as unknown as typeof setTimeout,
      clearLeaseTimeout: () => {},
      now: () => 1_000,
    }));

    const subscribed = await app.request("/api/resource-io/subscribe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        purpose: "knowledge-source-watch",
        sourceKeys: ["main"],
      }),
    });
    const subscription = await subscribed.json() as {
      subscriptionId: string;
    };
    expect(watchRegistry.diagnostics().subscriptions).toBe(1);
    expect(leaseCallbacks).toHaveLength(1);

    const renewed = await app.request(
      `/api/resource-io/subscriptions/${subscription.subscriptionId}/renew`,
      { method: "POST" },
    );
    expect(await renewed.json()).toMatchObject({
      ok: true,
      renewed: true,
      leaseDurationMs: 1_000,
    });
    expect(leaseCallbacks).toHaveLength(2);

    leaseCallbacks[0]();
    expect(watchRegistry.diagnostics().subscriptions).toBe(1);
    expect(() => leaseCallbacks[1]()).not.toThrow();
    expect(watchRegistry.diagnostics().subscriptions).toBe(1);
    expect(leaseCallbacks).toHaveLength(3);
    leaseCallbacks[2]();
    expect(watchRegistry.diagnostics()).toMatchObject({
      subscriptions: 0,
      watches: [],
    });
    expect(closeWatch).toHaveBeenCalledTimes(2);
  });

  it("authorizes address operations by capability and rejects non-contract body fields", async () => {
    const { engine } = setup();
    const stat = vi.fn(async () => ({
      exists: true,
      isDirectory: false,
    }));
    Object.assign(engine, { resourceIO: { stat } });
    const remoteApp = new Hono();
    remoteApp.use("*", async (c, next) => {
      (c as unknown as {
        set(key: string, value: unknown): void;
      }).set("authPrincipal", {
        kind: "device",
        userId: "user_1",
        studioId: "studio_1",
        serverId: "server_1",
        serverNodeId: "node_1",
        deviceId: "device_write_only",
        connectionKind: "lan",
        credentialKind: "device_credential",
        trustState: "paired",
        scopes: ["files.write"],
      });
      await next();
    });
    remoteApp.route("/api", createResourceIoRoute(engine));

    const denied = await remoteApp.request("/api/resource-io/stat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        address: { sourceKey: "main", relativePath: "notes/a.md" },
      }),
    });
    expect(denied.status).toBe(403);
    expect(await denied.json()).toMatchObject({
      code: "knowledge_resource_out_of_scope",
      httpStatus: 403,
    });

    const localApp = new Hono();
    localApp.route("/api", createResourceIoRoute(engine));
    const forged = await localApp.request("/api/resource-io/stat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        address: { sourceKey: "main", relativePath: "notes/a.md" },
        principal: "attacker",
      }),
    });
    expect(forged.status).toBe(412);
    expect(await forged.json()).toMatchObject({
      code: "knowledge_operation_precondition_failed",
      details: { field: "principal" },
    });
    expect(stat).not.toHaveBeenCalled();
  });

  it("returns closed safe envelopes and never leaks roots or identity tokens", async () => {
    const { app, main, research } = setup();
    const forbidden = await app.request("/api/knowledge-workspace/sources", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sourceKey: "research",
        displayName: "Research",
        mountId: "mount_research",
        scopeToken: "attacker",
      }),
    });
    expect(forbidden.status).toBe(400);
    expect(await forbidden.json()).toMatchObject({
      code: "forbidden_contract_field",
      httpStatus: 400,
      retryable: false,
    });

    const mainDelete = await app.request(
      "/api/knowledge-workspace/sources/main",
      { method: "DELETE" },
    );
    expect(mainDelete.status).toBe(412);
    const responseText = await mainDelete.text();
    expect(JSON.parse(responseText)).toEqual({
      code: "knowledge_operation_precondition_failed",
      httpStatus: 412,
      retryable: false,
    });
    expect(responseText).not.toContain(main);
    expect(responseText).not.toContain(research);
    expect(responseText).not.toContain("opaqueRootId");
    expect(responseText).not.toContain("scopeToken");
  });

  it("maps a session workspaceMountId to logical main and rejects mounting it again", async () => {
    const { engine } = setup();
    const sessionPath = "/sessions/current.jsonl";
    const mountedApp = new Hono();
    mountedApp.route("/api", createKnowledgeWorkspaceRoute({
      ...engine,
      currentSessionPath: sessionPath,
      getSessionWorkspaceMount: (candidate: string) =>
        candidate === sessionPath
          ? { mountId: "mount_research", label: "Research main" }
          : null,
    }));

    const listed = await mountedApp.request(
      "/api/knowledge-workspace/sources",
    );
    expect(listed.status).toBe(200);
    expect(await listed.json()).toEqual({
      sources: [expect.objectContaining({
        sourceKey: "main",
        displayName: "Research main",
        role: "main",
      })],
    });

    const duplicate = await mountedApp.request(
      "/api/knowledge-workspace/sources",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sourceKey: "duplicate",
          displayName: "Duplicate",
          mountId: "mount_research",
        }),
      },
    );
    expect(duplicate.status).toBe(409);
    expect(await duplicate.json()).toEqual({
      code: "source_root_not_disjoint",
      httpStatus: 409,
      retryable: false,
    });
  });

  it("drops active mounts across workspace switches and does not restore them when switching back", async () => {
    const { engine } = setup();
    const mutableEngine = {
      ...engine,
      currentSessionPath: "/sessions/one.jsonl",
    };
    const switchedApp = new Hono();
    switchedApp.route(
      "/api",
      createKnowledgeWorkspaceRoute(mutableEngine),
    );
    const created = await switchedApp.request(
      "/api/knowledge-workspace/sources",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sourceKey: "research",
          displayName: "Research",
          mountId: "mount_research",
        }),
      },
    );
    expect(created.status).toBe(201);

    mutableEngine.currentSessionPath = "/sessions/two.jsonl";
    const afterSwitch = await switchedApp.request(
      "/api/knowledge-workspace/sources",
    );
    expect((await afterSwitch.json()).sources.map((source) => source.sourceKey))
      .toEqual(["main"]);

    mutableEngine.currentSessionPath = "/sessions/one.jsonl";
    const afterReturn = await switchedApp.request(
      "/api/knowledge-workspace/sources",
    );
    expect((await afterReturn.json()).sources.map((source) => source.sourceKey))
      .toEqual(["main"]);
  });

  it("enforces authenticated file scopes for source mutations", async () => {
    const { engine } = setup();
    const remoteApp = new Hono();
    remoteApp.use("*", async (c, next) => {
      (c as unknown as {
        set(key: string, value: unknown): void;
      }).set("authPrincipal", {
        kind: "device",
        userId: "user_1",
        studioId: "studio_1",
        serverId: "server_1",
        serverNodeId: "node_1",
        deviceId: "device_read_only",
        connectionKind: "lan",
        credentialKind: "device_credential",
        trustState: "paired",
        scopes: ["files.read"],
      });
      await next();
    });
    remoteApp.route("/api", createKnowledgeWorkspaceRoute(engine));

    const read = await remoteApp.request(
      "/api/knowledge-workspace/sources",
    );
    expect(read.status).toBe(200);
    const denied = await remoteApp.request(
      "/api/knowledge-workspace/sources",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sourceKey: "research",
          displayName: "Research",
          mountId: "mount_research",
        }),
      },
    );
    expect(denied.status).toBe(403);
    expect(await denied.json()).toMatchObject({
      code: "knowledge_resource_out_of_scope",
      httpStatus: 403,
      retryable: false,
    });
  });
});
