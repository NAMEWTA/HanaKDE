import fs from "fs";
import os from "os";
import path from "path";
import { Hono } from "hono";
import { afterEach, describe, expect, it, vi } from "vitest";
import { upsertStudioMount } from "../core/studio-mounts.ts";
import { HanaEngine } from "../core/engine.ts";
import { normalizePrincipal } from "../core/security-principal.ts";
import { createSandboxResourceIO } from "../lib/resource-io/sandbox-resource-io.ts";
import { ResourceEventBus } from "../lib/resource-io/resource-event-bus.ts";
import { ResourceWatchRegistry } from "../lib/resource-io/resource-watch-registry.ts";
import { ResourceIO } from "../lib/resource-io/resource-io.ts";
import { LocalFsProvider } from "../lib/resource-io/providers/local-fs-provider.ts";
import {
  configureKnowledgeNativeBridge,
  createKnowledgeWorkspaceRoute,
} from "../server/routes/knowledge-workspace.ts";
import { SourceRegistry } from "../core/knowledge-workspace/source-registry.ts";
import { DurableKnowledgeOperationJournal } from "../core/knowledge-workspace/durable-operation-journal.ts";
import { DurableKnowledgeAtomicOperationJournal } from "../core/knowledge-workspace/durable-atomic-operation-journal.ts";
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

  function passthroughAtomicCoordinator() {
    return {
      recover: vi.fn(async () => ({
        scanned: 0,
        finalized: 0,
        rolledBack: 0,
        recoveryRequired: 0,
      })),
      isSourceRecovering: () => false,
      run: vi.fn(async (request, executor, context) => {
        const execution = await executor(request.items[0], 0, {
          ...context,
          operationId: "123e4567-e89b-42d3-a456-426614174038",
        });
        return {
          items: [{
            ...request.items[0],
            state: "applied",
            bytesTransferred: execution.bytesTransferred,
          }],
        };
      }),
    };
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

  it("rebuilds one source through the Engine public index facade", async () => {
    const { engine } = setup();
    const bindKnowledgeIndexWorkspace = vi.fn(async () => ({}));
    const rebuildKnowledgeIndex = vi.fn(async () => ({
      state: "ready" as const,
      generationId: "route-generation",
      sequence: 4,
    }));
    Object.assign(engine, {
      bindKnowledgeIndexWorkspace,
      rebuildKnowledgeIndex,
    });
    const app = new Hono();
    app.route("/api", createKnowledgeWorkspaceRoute(engine));

    const response = await app.request(
      "/api/knowledge-workspace/index/main/rebuild",
      { method: "POST" },
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      sourceKey: "main",
      health: {
        state: "ready",
        generationId: "route-generation",
        sequence: 4,
      },
    });
    expect(bindKnowledgeIndexWorkspace).toHaveBeenCalledWith(
      expect.any(SourceRegistry),
    );
    expect(rebuildKnowledgeIndex).toHaveBeenCalledWith(
      "main",
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
  });

  it("maps an internal rebuild failure to a retryable sanitized index error", async () => {
    const { engine } = setup();
    Object.assign(engine, {
      bindKnowledgeIndexWorkspace: vi.fn(async () => ({})),
      rebuildKnowledgeIndex: vi.fn(async () => {
        throw Object.assign(new Error("SQLITE_CANTOPEN /private/index.sqlite"), {
          code: "SQLITE_CANTOPEN",
        });
      }),
    });
    const app = new Hono();
    app.route("/api", createKnowledgeWorkspaceRoute(engine));

    const response = await app.request(
      "/api/knowledge-workspace/index/main/rebuild",
      { method: "POST" },
    );

    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({
      code: "knowledge_index_unavailable",
      httpStatus: 503,
      retryable: true,
    });
  });

  it("keeps a newly mounted source bound through a source-scoped rebuild", async () => {
    const { main, research } = setup();
    if (!tempRoot) throw new Error("test root unavailable");
    fs.writeFileSync(path.join(main, "Main.md"), "# Main", "utf8");
    fs.writeFileSync(path.join(research, "Research.md"), "# Research", "utf8");
    const hanakoHome = path.join(tempRoot, "hana");
    const eventBus = new ResourceEventBus({ emit: () => {} });
    const resourceIO = createSandboxResourceIO({
      cwd: main,
      agentDir: main,
      workspace: main,
      workspaceFolders: [main],
      authorizedFolders: [main, research],
      hanakoHome,
      getSandboxEnabled: () => false,
      eventBus,
      studioId: "studio_1",
    });
    const watchRegistry = new ResourceWatchRegistry({
      eventBus,
      resolveWatchTarget: (resource) => resourceIO.resolveWatchTarget(resource),
    });
    const engine = Object.create(HanaEngine.prototype) as HanaEngine;
    Object.assign(engine, {
      hanakoHome,
      _knowledgeIndexRuntime: null,
      _resourceEventBus: eventBus,
      _resourceIO: resourceIO,
      _resourceWatchRegistry: watchRegistry,
      _runtimeContext: {
        serverId: "server_1",
        serverNodeId: "node_1",
        userId: "user_1",
        studioId: "studio_1",
        connectionKind: "local",
        credentialKind: "loopback_token",
      },
    });
    Object.defineProperties(engine, {
      currentSessionPath: { configurable: true, value: null },
      defaultDeskCwd: { configurable: true, value: main },
      homeCwd: { configurable: true, value: main },
      deskCwd: { configurable: true, value: main },
    });
    const app = new Hono();
    app.route("/api", createKnowledgeWorkspaceRoute(engine));

    const registered = await app.request("/api/knowledge-workspace/sources", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sourceKey: "research",
        displayName: "Research",
        mountId: "mount_research",
      }),
    });
    expect(registered.status).toBe(201);
    expect((await (await app.request("/api/knowledge-workspace/sources")).json()).sources)
      .toEqual(expect.arrayContaining([
        expect.objectContaining({ sourceKey: "research" }),
      ]));

    const researchRebuild = await app.request(
      "/api/knowledge-workspace/index/research/rebuild",
      { method: "POST" },
    );
    expect(researchRebuild.status).toBe(200);
    expect(await researchRebuild.json()).toMatchObject({
      sourceKey: "research",
      health: { state: "ready" },
    });

    await engine.disposeKnowledgeIndexRuntime();
  });

  it("projects a source recovering in either operation coordinator without exposing journal identity", async () => {
    const { engine } = setup();
    Object.assign(engine, {
      knowledgeOperationCoordinator: {
        isSourceRecovering: () => false,
      },
      knowledgeTrashOperationCoordinator: {
        isSourceRecovering: (sourceKey: string) => sourceKey === "main",
      },
    });
    const app = new Hono();
    app.route("/api", createKnowledgeWorkspaceRoute(engine));

    const response = await app.request("/api/knowledge-workspace/sources");
    const text = await response.text();

    expect(response.status).toBe(200);
    expect(JSON.parse(text)).toEqual({
      sources: [expect.objectContaining({
        sourceKey: "main",
        availability: "recovering",
      })],
    });
    expect(text).not.toContain("rootIdentity");
    expect(text).not.toContain("recoveryReason");
  });

  it("copies an editor resource through the scoped domain route without path DTOs", async () => {
    const { engine, main } = setup();
    const result = {
      copied: true,
      targetAddress: {
        sourceKey: "main",
        relativePath: "Notes/assets/2026-07-30-photo.png",
      },
      bytesTransferred: 5,
      embed: true,
      originalName: "photo.png",
    };
    const copyForEditor = vi.fn(async (request) => ({
      plan: {
        disposition: "copy",
        prepared: {
          source: { kind: "mount", mountId: "mount_research", path: "Media/photo.png" },
          sourceAddress: request.sourceAddress,
          expectedSourceVersion: { size: 5, etag: "source-v1" },
          pageAddress: request.pageAddress,
          expectedPageVersion: { size: 4, etag: "page-v1" },
          targetDirectoryAddress: { sourceKey: "main", relativePath: "Notes/assets" },
          targetAddress: result.targetAddress,
          kind: request.kind,
          originalName: result.originalName,
          embed: true,
        },
      },
      execute: vi.fn(async () => result),
    }));
    Object.assign(engine, {
      prepareKnowledgeResourceCopyForEditor: copyForEditor,
      knowledgeAtomicOperationCoordinator: passthroughAtomicCoordinator(),
    });
    const app = new Hono();
    app.route("/api", createKnowledgeWorkspaceRoute(engine));
    expect((await app.request("/api/knowledge-workspace/sources", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sourceKey: "research",
        displayName: "Research",
        mountId: "mount_research",
      }),
    })).status).toBe(201);
    const request = {
      sourceAddress: {
        sourceKey: "research",
        relativePath: "Media/photo.png",
      },
      pageAddress: {
        sourceKey: "main",
        relativePath: "Notes/Host.md",
      },
      kind: "attachment",
      localDate: "2026-07-30",
    };

    const response = await app.request(
      "/api/knowledge-workspace/copy-for-editor",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-request-id": "request-copy-1",
        },
        body: JSON.stringify(request),
      },
    );
    const text = await response.text();

    expect(response.status).toBe(201);
    expect(JSON.parse(text)).toEqual({
      result: expect.objectContaining({
        targetAddress: {
          sourceKey: "main",
          relativePath: "Notes/assets/2026-07-30-photo.png",
        },
      }),
    });
    expect(copyForEditor).toHaveBeenCalledWith(
      request,
      expect.objectContaining({
        reason: "knowledge-copy-for-editor",
        requestId: "request-copy-1",
        source: "api",
      }),
    );
    expect(text).not.toContain(main);
    expect(text).not.toContain("filePath");
  });

  it("accepts an external file stream through opaque metadata without path DTOs", async () => {
    const { engine, main } = setup();
    const result = {
      copied: true,
      targetAddress: {
        sourceKey: "main",
        relativePath: "Notes/assets/2026-07-30-photo.png",
      },
      bytesTransferred: 5,
      embed: true,
      originalName: "photo.png",
    };
    const copyExternalForEditor = vi.fn(async (request) => ({
      plan: {
        disposition: "copy",
        prepared: {
          source: { kind: "session-file", fileId: "opaque-upload" },
          expectedSourceVersion: { size: request.sizeBytes },
          pageAddress: request.pageAddress,
          expectedPageVersion: { size: 4, etag: "page-v1" },
          targetDirectoryAddress: { sourceKey: "main", relativePath: "Notes/assets" },
          targetAddress: result.targetAddress,
          kind: "attachment",
          originalName: result.originalName,
          embed: true,
        },
      },
      execute: vi.fn(async () => result),
    }));
    Object.assign(engine, {
      prepareExternalKnowledgeResourceCopyForEditor: copyExternalForEditor,
      knowledgeAtomicOperationCoordinator: passthroughAtomicCoordinator(),
    });
    const app = new Hono();
    app.route("/api", createKnowledgeWorkspaceRoute(engine));
    const metadata = Buffer.from(JSON.stringify({
      fileName: "photo.png",
      fileSize: 5,
      mimeType: "image/png",
      pageAddress: {
        sourceKey: "main",
        relativePath: "Notes/Host.md",
      },
      localDate: "2026-07-30",
    }), "utf8").toString("base64url");

    const response = await app.request(
      "/api/knowledge-workspace/copy-external-for-editor",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/octet-stream",
          "X-Hanako-Knowledge-Copy": metadata,
          "x-request-id": "request-copy-external-1",
        },
        body: "bytes",
      },
    );
    const text = await response.text();

    expect(response.status).toBe(201);
    expect(copyExternalForEditor).toHaveBeenCalledWith(
      expect.objectContaining({
        body: expect.any(ReadableStream),
        sizeBytes: 5,
        originalName: "photo.png",
        mimeType: "image/png",
        pageAddress: {
          sourceKey: "main",
          relativePath: "Notes/Host.md",
        },
        localDate: "2026-07-30",
      }),
      expect.objectContaining({
        reason: "knowledge-copy-external-for-editor",
        requestId: "request-copy-external-1",
        source: "api",
      }),
    );
    expect(text).not.toContain(main);
    expect(text).not.toContain("filePath");
  });

  it("rejects malformed external file metadata before invoking the copy service", async () => {
    const { engine } = setup();
    const copyExternalForEditor = vi.fn();
    Object.assign(engine, {
      prepareExternalKnowledgeResourceCopyForEditor: copyExternalForEditor,
    });
    const app = new Hono();
    app.route("/api", createKnowledgeWorkspaceRoute(engine));

    const response = await app.request(
      "/api/knowledge-workspace/copy-external-for-editor",
      {
        method: "POST",
        headers: {
          "X-Hanako-Knowledge-Copy": Buffer.from(JSON.stringify({
            fileName: "photo.png",
            fileSize: 5,
            mimeType: "image/png",
            pageAddress: {
              sourceKey: "main",
              relativePath: "Notes/Host.md",
            },
            localDate: "2026-07-30",
            absolutePath: "/Users/example/photo.png",
          })).toString("base64url"),
        },
        body: "bytes",
      },
    );

    expect(response.status).toBe(412);
    expect(copyExternalForEditor).not.toHaveBeenCalled();
  });

  it("durably journals real internal and streamed editor copies before publishing their targets", async () => {
    const { engine, main, research } = setup();
    const resourceIO = createSandboxResourceIO({
      cwd: main,
      agentDir: main,
      workspace: main,
      workspaceFolders: [main],
      authorizedFolders: [main, research],
      hanakoHome: engine.hanakoHome,
      getSandboxEnabled: () => false,
      studioId: "studio_1",
    });
    Object.assign(engine, {
      resourceIO,
      getResourceIO: () => resourceIO,
      prepareKnowledgeResourceCopyForEditor:
        HanaEngine.prototype.prepareKnowledgeResourceCopyForEditor,
      prepareExternalKnowledgeResourceCopyForEditor:
        HanaEngine.prototype.prepareExternalKnowledgeResourceCopyForEditor,
    });
    const app = new Hono();
    app.use("*", async (c, next) => {
      (c as unknown as { set(key: string, value: unknown): void }).set(
        "authPrincipal",
        normalizePrincipal({
          kind: "local_user",
          userId: "user_1",
          studioId: "studio_1",
          serverId: "server_1",
          serverNodeId: "node_1",
          connectionKind: "local",
          credentialKind: "loopback_token",
          scopes: ["studio.owner", "files.read", "files.write"],
        }),
      );
      await next();
    });
    app.route("/api", createKnowledgeWorkspaceRoute(engine));
    expect((await app.request("/api/knowledge-workspace/sources", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sourceKey: "research",
        displayName: "Research",
        mountId: "mount_research",
      }),
    })).status).toBe(201);
    fs.mkdirSync(path.join(main, "Notes"), { recursive: true });
    fs.mkdirSync(path.join(research, "Media"), { recursive: true });
    fs.writeFileSync(path.join(main, "Notes", "Host.md"), "# host", "utf8");
    fs.writeFileSync(path.join(research, "Media", "photo.png"), "photo", "utf8");
    expect(fs.existsSync(path.join(main, "Notes", "assets"))).toBe(false);

    const internal = await app.request("/api/knowledge-workspace/copy-for-editor", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sourceAddress: { sourceKey: "research", relativePath: "Media/photo.png" },
        pageAddress: { sourceKey: "main", relativePath: "Notes/Host.md" },
        kind: "attachment",
        localDate: "2026-07-30",
      }),
    });
    expect(internal.status).toBe(201);
    expect(fs.readFileSync(
      path.join(main, "Notes", "assets", "2026-07-30-photo.png"),
      "utf8",
    )).toBe("photo");

    const metadata = Buffer.from(JSON.stringify({
      fileName: "capture.webp",
      fileSize: 8,
      mimeType: "image/webp",
      pageAddress: { sourceKey: "main", relativePath: "Notes/Host.md" },
      localDate: "2026-07-30",
    }), "utf8").toString("base64url");
    const external = await app.request(
      "/api/knowledge-workspace/copy-external-for-editor",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/octet-stream",
          "X-Hanako-Knowledge-Copy": metadata,
        },
        body: "private!",
      },
    );
    expect(external.status).toBe(201);
    expect(fs.readFileSync(
      path.join(main, "Notes", "assets", "2026-07-30-capture.webp"),
      "utf8",
    )).toBe("private!");

    const records = new DurableKnowledgeAtomicOperationJournal({
      hanakoHome: engine.hanakoHome,
    }).list();
    expect(records.map(record => record.kind).sort()).toEqual(["copy", "import"]);
    expect(records.find(record => record.kind === "copy")).toMatchObject({
      state: "FINALIZED",
      request: {
        items: [{
          sourceAddress: { sourceKey: "research", relativePath: "Media/photo.png" },
          targetAddress: { sourceKey: "main", relativePath: "Notes/assets/2026-07-30-photo.png" },
        }],
      },
    });
    const externalRecord = records.find(record => record.kind === "import");
    expect(externalRecord).toMatchObject({
      state: "FINALIZED",
      request: {
        items: [{
          sourceToken: expect.any(String),
          expectedSourceVersion: { size: 8 },
          targetAddress: { sourceKey: "main", relativePath: "Notes/assets/2026-07-30-capture.webp" },
        }],
      },
    });
    expect(externalRecord?.request.items[0]).not.toHaveProperty("sourceAddress");
    const serialized = JSON.stringify(records);
    expect(serialized).not.toContain(main);
    expect(serialized).not.toContain(research);
    expect(serialized).not.toContain("opaque-upload");
    expect(serialized).not.toContain("private!");
  });

  it("exposes the shared operation plan/commit/status/cancel protocol without path DTOs", async () => {
    const { engine, main } = setup();
    const operationId = "123e4567-e89b-42d3-a456-426614174000";
    const requestHash = "a".repeat(64);
    const plan = vi.fn(async (request) => ({
      schemaVersion: 1,
      operationId,
      requestHash,
      kind: "rename",
      createdAt: "2026-07-28T00:00:00.000Z",
      expiresAt: "2026-07-28T00:15:00.000Z",
      checkpointRequired: true,
      items: [{
        from: request.from,
        to: request.to,
        expectedVersion: request.expectedVersion,
      }],
      preview: { resourceChanges: 1, linkWrites: 0 },
    }));
    const result = {
      schemaVersion: 1,
      operationId,
      requestHash,
      kind: "rename",
      state: "FINALIZED",
      completedAt: "2026-07-28T00:00:01.000Z",
      items: [],
      summary: {
        succeeded: 1,
        failed: 0,
        rolledBack: 0,
        recoveryRequired: 0,
      },
      projections: {
        session: "applied",
        event: "applied",
        index: "applied",
      },
    };
    const commit = vi.fn(async () => result);
    const cancel = vi.fn(async () => ({ ...result, state: "ROLLED_BACK" }));
    const get = vi.fn(async () => result);
    Object.assign(engine, {
      knowledgeOperationCoordinator: {
        recover: vi.fn(async () => ({
          scanned: 0,
          finalized: 0,
          rolledBack: 0,
          recoveryRequired: 0,
          expired: 0,
        })),
        plan,
        commit,
        cancel,
        get,
      },
    });
    const app = new Hono();
    app.route("/api", createKnowledgeWorkspaceRoute(engine));
    const body = {
      kind: "rename",
      from: { sourceKey: "main", relativePath: "old.md" },
      to: { sourceKey: "main", relativePath: "new.md" },
      expectedVersion: { mtimeMs: 1, size: 3 },
    };

    const planned = await app.request(
      "/api/knowledge-workspace/operations/plan",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-request-id": "request-1",
        },
        body: JSON.stringify(body),
      },
    );
    expect(planned.status).toBe(201);
    expect(await planned.json()).toEqual({
      plan: expect.objectContaining({ operationId, requestHash }),
    });
    expect(plan).toHaveBeenCalledWith(
      body,
      expect.objectContaining({
        source: "api",
        reason: "knowledge-operation-plan",
        requestId: "request-1",
      }),
    );

    const committed = await app.request(
      `/api/knowledge-workspace/operations/${operationId}/commit`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requestHash }),
      },
    );
    expect(committed.status).toBe(200);
    const committedText = await committed.text();
    expect(JSON.parse(committedText)).toEqual({ result });
    expect(committedText).not.toContain(main);

    const status = await app.request(
      `/api/knowledge-workspace/operations/${operationId}`,
    );
    expect(status.status).toBe(200);
    expect(await status.json()).toEqual({ operation: result });

    const cancelled = await app.request(
      `/api/knowledge-workspace/operations/${operationId}/cancel`,
      { method: "POST" },
    );
    expect(cancelled.status).toBe(200);
    expect(await cancelled.json()).toEqual({
      result: { ...result, state: "ROLLED_BACK" },
    });
  });

  it("dispatches atomic operation commit, status and cancel through the shared protocol", async () => {
    const { engine } = setup();
    const operationId = "123e4567-e89b-42d3-a456-426614174050";
    const requestHash = "b".repeat(64);
    const result = {
      schemaVersion: 1,
      operationId,
      requestHash,
      kind: "copy",
      sourceKey: "main",
      state: "FINALIZED",
      completedAt: "2026-08-07T00:00:00.000Z",
      items: [],
      summary: { succeeded: 1, failed: 0, rolledBack: 0, recoveryRequired: 0 },
      projections: { session: "applied", event: "applied", index: "applied" },
    };
    const commit = vi.fn(async () => result);
    const cancel = vi.fn(async () => ({ ...result, state: "ROLLED_BACK" }));
    const get = vi.fn(async () => result);
    Object.assign(engine, {
      knowledgeOperationCoordinator: {
        recover: vi.fn(async () => ({})),
        isSourceRecovering: () => false,
      },
      knowledgeTrashOperationCoordinator: {
        recover: vi.fn(async () => ({})),
        isSourceRecovering: () => false,
        owns: () => false,
      },
      knowledgeAtomicOperationCoordinator: {
        recover: vi.fn(async () => ({})),
        isSourceRecovering: () => false,
        owns: (candidate: string) => candidate === operationId,
        commit,
        cancel,
        get,
      },
    });
    const app = new Hono();
    app.route("/api", createKnowledgeWorkspaceRoute(engine));

    const committed = await app.request(
      `/api/knowledge-workspace/operations/${operationId}/commit`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requestHash }),
      },
    );
    expect(committed.status).toBe(200);
    expect(await committed.json()).toEqual({ result });
    expect(commit).toHaveBeenCalledWith(
      operationId,
      { requestHash },
      expect.objectContaining({ reason: "knowledge-operation-commit" }),
    );

    expect((await app.request(
      `/api/knowledge-workspace/operations/${operationId}`,
    )).status).toBe(200);
    expect(get).toHaveBeenCalledWith(
      operationId,
      expect.objectContaining({ reason: "knowledge-operation-status" }),
    );

    expect((await app.request(
      `/api/knowledge-workspace/operations/${operationId}/cancel`,
      { method: "POST" },
    )).status).toBe(200);
    expect(cancel).toHaveBeenCalledWith(
      operationId,
      expect.objectContaining({ reason: "knowledge-operation-cancel" }),
    );
  });

  it("commits a real same-source rename through the public operation route", async () => {
    const { engine, main } = setup();
    const oldPath = path.join(main, "old.md");
    const newPath = path.join(main, "new.md");
    fs.writeFileSync(oldPath, "real route", "utf8");
    const resourceIO = new ResourceIO({
      providers: {
        local_fs: new LocalFsProvider({ cwd: main }),
      },
    });
    const version = (await resourceIO.stat({
      kind: "local-file",
      path: oldPath,
    })).version;
    Object.assign(engine, {
      resourceIO,
      createUserEditCheckpoint: vi.fn(async () => ({
        id: "checkpoint-route",
      })),
    });
    const app = new Hono();
    app.use("*", async (c, next) => {
      (c as unknown as {
        set(key: string, value: unknown): void;
      }).set("authPrincipal", normalizePrincipal({
        kind: "local_user",
        userId: "user_1",
        studioId: "studio_1",
        serverId: "server_1",
        serverNodeId: "node_1",
        connectionKind: "local",
        credentialKind: "loopback_token",
        scopes: ["studio.owner", "files.read", "files.write"],
      }));
      await next();
    });
    app.route("/api", createKnowledgeWorkspaceRoute(engine));

    const planned = await app.request(
      "/api/knowledge-workspace/operations/plan",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind: "rename",
          from: { sourceKey: "main", relativePath: "old.md" },
          to: { sourceKey: "main", relativePath: "new.md" },
          expectedVersion: version,
        }),
      },
    );
    expect(planned.status).toBe(201);
    const plan = (await planned.json()).plan;
    const committed = await app.request(
      `/api/knowledge-workspace/operations/${plan.operationId}/commit`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requestHash: plan.requestHash }),
      },
    );
    expect(committed.status).toBe(200);
    const responseText = await committed.text();
    expect(JSON.parse(responseText).result).toMatchObject({
      operationId: plan.operationId,
      state: "FINALIZED",
      items: [{
        from: { sourceKey: "main", relativePath: "old.md" },
        to: { sourceKey: "main", relativePath: "new.md" },
        state: "applied",
        checkpointId: "checkpoint-route",
      }],
    });
    expect(responseText).not.toContain(main);
    expect(fs.existsSync(oldPath)).toBe(false);
    expect(fs.readFileSync(newPath, "utf8")).toBe("real route");
  });

  it("plans and commits delete/restore through the public operation protocol and exposes cleanup planning", async () => {
    const { engine, main } = setup();
    const resourceIO = new ResourceIO({
      providers: {
        local_fs: new LocalFsProvider({ cwd: main }),
      },
    });
    Object.assign(engine, { resourceIO });
    const app = new Hono();
    app.use("*", async (c, next) => {
      (c as unknown as { set(key: string, value: unknown): void }).set(
        "authPrincipal",
        normalizePrincipal({
          kind: "local_user",
          userId: "user_1",
          studioId: "studio_1",
          serverId: "server_1",
          serverNodeId: "node_1",
          connectionKind: "local",
          credentialKind: "loopback_token",
          scopes: ["studio.owner", "files.read", "files.write"],
        }),
      );
      await next();
    });
    app.route("/api", createKnowledgeWorkspaceRoute(engine));
    const notePath = path.join(main, "Planned.md");
    fs.writeFileSync(notePath, "planned", "utf8");

    const deletePlanResponse = await app.request(
      "/api/knowledge-workspace/operations/plan",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind: "delete",
          addresses: [{ sourceKey: "main", relativePath: "Planned.md" }],
        }),
      },
    );
    expect(deletePlanResponse.status).toBe(201);
    const deletePlan = (await deletePlanResponse.json()).plan;
    expect(deletePlan).toMatchObject({
      kind: "delete",
      sourceKey: "main",
    });
    expect(fs.existsSync(notePath)).toBe(true);

    const deleteCommit = await app.request(
      `/api/knowledge-workspace/operations/${deletePlan.operationId}/commit`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requestHash: deletePlan.requestHash }),
      },
    );
    expect(deleteCommit.status).toBe(200);
    expect((await deleteCommit.json()).result).toMatchObject({
      kind: "delete",
      state: "FINALIZED",
      summary: { succeeded: 1, failed: 0 },
    });
    expect(fs.existsSync(notePath)).toBe(false);

    const listed = await app.request("/api/knowledge-workspace/trash/main");
    const batch = (await listed.json()).batches.find(
      (candidate: { batchId: string }) => candidate.batchId === deletePlan.batchId,
    );
    const entry = batch.entries[0];
    const restorePlanResponse = await app.request(
      "/api/knowledge-workspace/trash/restore/plan",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sourceKey: "main",
          batchId: deletePlan.batchId,
          entryIds: [entry.entryId],
        }),
      },
    );
    expect(restorePlanResponse.status).toBe(201);
    const restorePlan = (await restorePlanResponse.json()).plan;
    expect(restorePlan).toMatchObject({
      kind: "restore",
      batchId: deletePlan.batchId,
      items: [{ targetAddress: { sourceKey: "main", relativePath: "Planned.md" } }],
    });
    expect(fs.existsSync(notePath)).toBe(false);

    const restoreCommit = await app.request(
      `/api/knowledge-workspace/operations/${restorePlan.operationId}/commit`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requestHash: restorePlan.requestHash }),
      },
    );
    expect(restoreCommit.status).toBe(200);
    expect((await restoreCommit.json()).result).toMatchObject({
      kind: "restore",
      state: "FINALIZED",
    });
    expect(fs.readFileSync(notePath, "utf8")).toBe("planned");

    const trashedAgain = await app.request("/api/knowledge-workspace/trash", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        addresses: [{ sourceKey: "main", relativePath: "Planned.md" }],
      }),
    });
    const secondBatchId = (await trashedAgain.json()).result.batchId as string;
    const secondListed = await app.request("/api/knowledge-workspace/trash/main");
    const secondEntry = (await secondListed.json()).batches.find(
      (candidate: { batchId: string }) => candidate.batchId === secondBatchId,
    ).entries[0];
    const cleanupPlanResponse = await app.request(
      "/api/knowledge-workspace/trash/cleanup/plan",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ address: secondEntry.trashAddress }),
      },
    );
    expect(cleanupPlanResponse.status).toBe(201);
    const cleanupPlan = (await cleanupPlanResponse.json()).plan;
    expect(cleanupPlan).toMatchObject({ kind: "cleanup", batchId: secondBatchId });
    const cancelled = await app.request(
      `/api/knowledge-workspace/operations/${cleanupPlan.operationId}/cancel`,
      { method: "POST" },
    );
    expect(cancelled.status).toBe(200);
    expect((await cancelled.json()).result).toMatchObject({ state: "ROLLED_BACK" });
  });

  it("records a retained system-trash failure when native consumption rejects a changed grant", async () => {
    const { engine, main } = setup();
    const resourceIO = new ResourceIO({
      providers: {
        local_fs: new LocalFsProvider({ cwd: main }),
      },
    });
    Object.assign(engine, { resourceIO });
    configureKnowledgeNativeBridge(engine, "a".repeat(43));
    const app = new Hono();
    app.use("*", async (c, next) => {
      (c as unknown as { set(key: string, value: unknown): void }).set(
        "transportConnectionKind",
        "local",
      );
      (c as unknown as { set(key: string, value: unknown): void }).set(
        "authPrincipal",
        normalizePrincipal({
          kind: "local_user",
          userId: "user_1",
          studioId: "studio_1",
          serverId: "server_1",
          serverNodeId: "node_1",
          connectionKind: "local",
          credentialKind: "loopback_token",
          scopes: ["studio.owner", "files.read", "files.write"],
        }),
      );
      await next();
    });
    app.route("/api", createKnowledgeWorkspaceRoute(engine));
    fs.writeFileSync(path.join(main, "Retained.md"), "retained", "utf8");

    const trashed = await app.request("/api/knowledge-workspace/trash", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        addresses: [{ sourceKey: "main", relativePath: "Retained.md" }],
      }),
    });
    expect(trashed.status).toBe(200);
    const batchId = (await trashed.json()).result.batchId as string;
    const listed = await app.request("/api/knowledge-workspace/trash/main");
    const entry = (await listed.json()).batches.find((batch: { batchId: string }) => batch.batchId === batchId)
      .entries[0];
    const grant = await app.request("/api/knowledge-workspace/native/grants", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "systemTrash", address: entry.trashAddress }),
    });
    expect(grant.status).toBe(201);
    const grantId = (await grant.json()).grant.grantId as string;
    fs.appendFileSync(path.join(main, ...entry.trashAddress.relativePath.split("/")), "changed", "utf8");

    const rejected = await app.request("/api/knowledge-workspace/native/consume", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Hana-Native-Bridge": "a".repeat(43),
      },
      body: JSON.stringify({ action: "systemTrash", grantId }),
    });
    expect(rejected.status).toBe(409);
    expect(await rejected.text()).not.toContain(main);

    const afterFailure = await app.request("/api/knowledge-workspace/trash/main");
    expect((await afterFailure.json()).batches.find((batch: { batchId: string }) => batch.batchId === batchId))
      .toEqual(expect.objectContaining({ entries: [expect.objectContaining({
        state: "trashed",
        errorCode: "knowledge_resource_unavailable",
      })] }));
    const journal = new DurableKnowledgeOperationJournal({
      hanakoHome: engine.hanakoHome,
    });
    expect(journal.listTrash()).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: "delete", state: "FINALIZED" }),
      expect.objectContaining({
        kind: "cleanup",
        state: "ROLLED_BACK",
        items: [expect.objectContaining({ state: "rolled-back" })],
      }),
    ]));
  });

  it("finalizes the durable cleanup journal after Main confirms system-trash success", async () => {
    const { engine, main } = setup();
    const resourceIO = new ResourceIO({
      providers: {
        local_fs: new LocalFsProvider({ cwd: main }),
      },
    });
    Object.assign(engine, { resourceIO });
    configureKnowledgeNativeBridge(engine, "b".repeat(43));
    const app = new Hono();
    app.use("*", async (c, next) => {
      (c as unknown as { set(key: string, value: unknown): void }).set(
        "transportConnectionKind",
        "local",
      );
      (c as unknown as { set(key: string, value: unknown): void }).set(
        "authPrincipal",
        normalizePrincipal({
          kind: "local_user",
          userId: "user_1",
          studioId: "studio_1",
          serverId: "server_1",
          serverNodeId: "node_1",
          connectionKind: "local",
          credentialKind: "loopback_token",
          scopes: ["studio.owner", "files.read", "files.write"],
        }),
      );
      await next();
    });
    app.route("/api", createKnowledgeWorkspaceRoute(engine));
    fs.writeFileSync(path.join(main, "Cleanup.md"), "cleanup", "utf8");

    const trashed = await app.request("/api/knowledge-workspace/trash", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        addresses: [{ sourceKey: "main", relativePath: "Cleanup.md" }],
      }),
    });
    const batchId = (await trashed.json()).result.batchId as string;
    const listed = await app.request("/api/knowledge-workspace/trash/main");
    const entry = (await listed.json()).batches
      .find((batch: { batchId: string }) => batch.batchId === batchId)
      .entries[0];
    const planned = await app.request(
      "/api/knowledge-workspace/trash/cleanup/plan",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ address: entry.trashAddress }),
      },
    );
    expect(planned.status).toBe(201);
    const cleanupPlan = (await planned.json()).plan;
    const issued = await app.request("/api/knowledge-workspace/native/grants", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "systemTrash",
        address: entry.trashAddress,
        operationId: cleanupPlan.operationId,
      }),
    });
    const issuedBody = await issued.json();
    expect(issuedBody).not.toHaveProperty("operationId");
    const plannedJournals = new DurableKnowledgeOperationJournal({
      hanakoHome: engine.hanakoHome,
    }).listTrash().filter(candidate => candidate.kind === "cleanup");
    expect(plannedJournals).toHaveLength(1);
    expect(plannedJournals[0].operationId).toBe(cleanupPlan.operationId);
    const grantId = issuedBody.grant.grantId as string;
    const consumed = await app.request("/api/knowledge-workspace/native/consume", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Hana-Native-Bridge": "b".repeat(43),
      },
      body: JSON.stringify({ action: "systemTrash", grantId }),
    });
    expect(consumed.status).toBe(200);
    const filePath = (await consumed.json()).filePath as string;
    fs.rmSync(filePath, { recursive: true, force: true });

    const completed = await app.request("/api/knowledge-workspace/native/complete", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Hana-Native-Bridge": "b".repeat(43),
      },
      body: JSON.stringify({ grantId, ok: true }),
    });
    expect(completed.status).toBe(200);
    expect(await completed.json()).toEqual({ ok: true });

    const manifest = JSON.parse(fs.readFileSync(
      path.join(main, ".trash", batchId, "manifest.json"),
      "utf8",
    ));
    expect(manifest.entries[0]).toMatchObject({ state: "cleaned" });
    const journal = new DurableKnowledgeOperationJournal({
      hanakoHome: engine.hanakoHome,
    });
    expect(journal.listTrash().find(candidate => candidate.kind === "cleanup"))
      .toMatchObject({ state: "FINALIZED", items: [{ state: "applied" }] });
  });

  it("journals native import replacement through the trash coordinator and rejects injected identity fields", async () => {
    const { engine, main, research } = setup();
    const resourceIO = new ResourceIO({
      providers: {
        local_fs: new LocalFsProvider({ cwd: main }),
      },
    });
    Object.assign(engine, { resourceIO });
    configureKnowledgeNativeBridge(engine, "c".repeat(43));
    const app = new Hono();
    app.use("*", async (c, next) => {
      (c as unknown as { set(key: string, value: unknown): void }).set(
        "transportConnectionKind",
        "local",
      );
      (c as unknown as { set(key: string, value: unknown): void }).set(
        "authPrincipal",
        normalizePrincipal({
          kind: "local_user",
          userId: "user_1",
          studioId: "studio_1",
          serverId: "server_1",
          serverNodeId: "node_1",
          connectionKind: "local",
          credentialKind: "loopback_token",
          scopes: ["studio.owner", "files.read", "files.write"],
        }),
      );
      await next();
    });
    app.route("/api", createKnowledgeWorkspaceRoute(engine));
    const targetPath = path.join(main, "Replace.md");
    const externalPath = path.join(research, "Replace.md");
    fs.writeFileSync(targetPath, "old", "utf8");
    fs.writeFileSync(externalPath, "new", "utf8");
    const requestBody = {
      filePaths: [externalPath],
      target: { sourceKey: "main", directoryPath: "" },
      conflictPolicy: "replace",
    };

    const injected = await app.request("/api/knowledge-workspace/native/import", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Hana-Native-Bridge": "c".repeat(43),
      },
      body: JSON.stringify({ ...requestBody, principal: { userId: "attacker" } }),
    });
    expect(injected.status).toBe(412);
    expect(fs.readFileSync(targetPath, "utf8")).toBe("old");

    const imported = await app.request("/api/knowledge-workspace/native/import", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Hana-Native-Bridge": "c".repeat(43),
      },
      body: JSON.stringify(requestBody),
    });

    expect(imported.status).toBe(200);
    const responseText = await imported.text();
    expect(JSON.parse(responseText)).toEqual({
      results: [expect.objectContaining({
        ok: true,
        targetAddress: { sourceKey: "main", relativePath: "Replace.md" },
      })],
    });
    expect(responseText).not.toContain(externalPath);
    expect(responseText).not.toContain(main);
    expect(fs.readFileSync(targetPath, "utf8")).toBe("new");
    const journal = new DurableKnowledgeOperationJournal({
      hanakoHome: engine.hanakoHome,
    });
    expect(journal.listTrash()).toEqual(expect.arrayContaining([
      expect.objectContaining({
        kind: "delete",
        state: "FINALIZED",
        items: [expect.objectContaining({ state: "applied" })],
      }),
    ]));
    const atomicJournal = new DurableKnowledgeAtomicOperationJournal({
      hanakoHome: engine.hanakoHome,
    });
    const importRecord = atomicJournal.list().find(candidate => candidate.kind === "import");
    expect(importRecord).toMatchObject({
      state: "FINALIZED",
      items: [{
        targetAddress: { sourceKey: "main", relativePath: "Replace.md" },
        disposition: "replace",
        state: "applied",
        steps: [{ kind: "resource-replace", state: "applied" }],
      }],
    });
    expect(JSON.stringify(importRecord)).not.toContain(externalPath);
    expect(JSON.stringify(importRecord)).not.toContain(main);
  });

  it("journals paste copies atomically and routes cuts through durable refactor moves", async () => {
    const { engine, main, research } = setup();
    const resourceIO = createSandboxResourceIO({
      cwd: main,
      agentDir: main,
      workspace: main,
      workspaceFolders: [main],
      authorizedFolders: [main, research],
      hanakoHome: engine.hanakoHome,
      getSandboxEnabled: () => false,
      studioId: "studio_1",
    });
    Object.assign(engine, {
      resourceIO,
      createUserEditCheckpoint: vi.fn(async () => ({ id: "checkpoint-paste" })),
    });
    const app = new Hono();
    app.use("*", async (c, next) => {
      (c as unknown as { set(key: string, value: unknown): void }).set(
        "authPrincipal",
        normalizePrincipal({
          kind: "local_user",
          userId: "user_1",
          studioId: "studio_1",
          serverId: "server_1",
          serverNodeId: "node_1",
          connectionKind: "local",
          credentialKind: "loopback_token",
          scopes: ["studio.owner", "files.read", "files.write"],
        }),
      );
      await next();
    });
    app.route("/api", createKnowledgeWorkspaceRoute(engine));
    const registered = await app.request("/api/knowledge-workspace/sources", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sourceKey: "research",
        displayName: "Research",
        mountId: "mount_research",
      }),
    });
    expect(registered.status).toBe(201);
    fs.mkdirSync(path.join(main, "Folder"), { recursive: true });
    fs.writeFileSync(path.join(research, "Copied.md"), "copy bytes", "utf8");
    fs.writeFileSync(path.join(main, "Moved.md"), "move bytes", "utf8");

    const copied = await app.request("/api/knowledge-workspace/resources/paste", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        intent: "copy",
        items: [{ sourceKey: "research", relativePath: "Copied.md" }],
        target: { sourceKey: "main", directoryPath: "Folder" },
      }),
    });
    expect(copied.status).toBe(200);
    const copiedText = await copied.text();
    expect(JSON.parse(copiedText)).toEqual({
      results: [expect.objectContaining({
        ok: true,
        effect: "copy",
        targetAddress: { sourceKey: "main", relativePath: "Folder/Copied.md" },
      })],
    });
    expect(fs.readFileSync(path.join(main, "Folder", "Copied.md"), "utf8"))
      .toBe("copy bytes");

    const moved = await app.request("/api/knowledge-workspace/resources/paste", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        intent: "cut",
        items: [{ sourceKey: "main", relativePath: "Moved.md" }],
        target: { sourceKey: "main", directoryPath: "Folder" },
      }),
    });
    expect(moved.status).toBe(200);
    const movedText = await moved.text();
    expect(JSON.parse(movedText)).toEqual({
      results: [expect.objectContaining({
        ok: true,
        effect: "move",
        targetAddress: { sourceKey: "main", relativePath: "Folder/Moved.md" },
      })],
    });
    expect(fs.existsSync(path.join(main, "Moved.md"))).toBe(false);
    expect(fs.readFileSync(path.join(main, "Folder", "Moved.md"), "utf8"))
      .toBe("move bytes");

    const atomicRecord = new DurableKnowledgeAtomicOperationJournal({
      hanakoHome: engine.hanakoHome,
    }).list().find(candidate => candidate.kind === "copy");
    expect(atomicRecord).toMatchObject({
      state: "FINALIZED",
      request: {
        sourceKey: "main",
        items: [{
          sourceAddress: { sourceKey: "research", relativePath: "Copied.md" },
          targetAddress: { sourceKey: "main", relativePath: "Folder/Copied.md" },
        }],
      },
      items: [{ state: "applied", steps: [{ kind: "resource-transfer", state: "applied" }] }],
    });
    const moveRecord = new DurableKnowledgeOperationJournal({
      hanakoHome: engine.hanakoHome,
    }).list().find(candidate => candidate.kind === "move");
    expect(moveRecord).toMatchObject({
      state: "FINALIZED",
      request: {
        from: { sourceKey: "main", relativePath: "Moved.md" },
        to: { sourceKey: "main", relativePath: "Folder/Moved.md" },
      },
      items: [{ state: "applied", checkpointId: "checkpoint-paste" }],
    });
    for (const serialized of [copiedText, movedText, JSON.stringify(atomicRecord), JSON.stringify(moveRecord)]) {
      expect(serialized).not.toContain(main);
      expect(serialized).not.toContain(research);
    }
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
