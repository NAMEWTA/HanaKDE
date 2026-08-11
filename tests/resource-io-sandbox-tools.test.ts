import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ResourceIO } from "../lib/resource-io/resource-io.ts";
import { createResourceIoToolOperations } from "../lib/resource-io/pi-tool-operations.ts";
import { createSandboxedTools } from "../lib/sandbox/index.ts";

describe("ResourceIO sandbox file tools", () => {
  let tempRoot: string | null = null;

  afterEach(() => {
    if (tempRoot) fs.rmSync(tempRoot, { recursive: true, force: true });
    tempRoot = null;
  });

  function makeTools(options: any = {}) {
    tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "hana-resource-sandbox-tools-"));
    const workspace = path.join(tempRoot, "workspace");
    const hanakoHome = path.join(tempRoot, "hana-home");
    const agentDir = path.join(hanakoHome, "agents", "hana");
    fs.mkdirSync(workspace, { recursive: true });
    fs.mkdirSync(agentDir, { recursive: true });
    const emitEvent = vi.fn();
    const sessionPath = path.join(agentDir, "sessions", "main.jsonl");
    const result = createSandboxedTools(workspace, [], {
      agentDir,
      workspace,
      workspaceFolders: [],
      hanakoHome,
      getSandboxEnabled: () => true,
      getSessionPath: () => sessionPath,
      getSessionIdForPath: options.getSessionIdForPath,
      emitEvent,
      recordFileOperation: options.recordFileOperation,
      recordAgentFileChange: options.recordAgentFileChange,
    } as any);
    return { workspace, emitEvent, sessionPath, tools: result.tools };
  }

  function makeToolsWithResourceIO(resourceIO) {
    tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "hana-resource-sandbox-tools-"));
    const workspace = path.join(tempRoot, "workspace");
    const hanakoHome = path.join(tempRoot, "hana-home");
    const agentDir = path.join(hanakoHome, "agents", "hana");
    fs.mkdirSync(workspace, { recursive: true });
    fs.mkdirSync(agentDir, { recursive: true });
    const sessionPath = path.join(agentDir, "sessions", "main.jsonl");
    const result = createSandboxedTools(workspace, [], {
      agentDir,
      workspace,
      workspaceFolders: [],
      hanakoHome,
      getSandboxEnabled: () => true,
      getSessionPath: () => sessionPath,
      resourceIO,
    } as any);
    return { workspace, tools: result.tools };
  }

  it("routes write, read, and edit through ResourceIO and emits mutation events", async () => {
    const { workspace, emitEvent, tools } = makeTools();
    const realWorkspace = fs.realpathSync(workspace);
    const write = tools.find((tool) => tool.name === "write");
    const read = tools.find((tool) => tool.name === "read");
    const edit = tools.find((tool) => tool.name === "edit");

    await write.execute("write-1", { path: "notes/a.md", content: "hello" });
    expect(fs.readFileSync(path.join(workspace, "notes", "a.md"), "utf-8")).toBe("hello");
    expect(emitEvent).toHaveBeenCalledWith(expect.objectContaining({
      type: "resource.changed",
      source: "agent_tool",
      reason: "agent_write",
      resourceKey: `local_fs:${path.join(realWorkspace, "notes", "a.md").replace(/\\/g, "/")}`,
    }), expect.any(String));

    const readResult = await read.execute("read-1", { path: "notes/a.md" });
    expect(readResult.content[0].text).toBe("hello");

    await edit.execute("edit-1", {
      path: "notes/a.md",
      edits: [{ oldText: "hello", newText: "hello again" }],
    });
    expect(fs.readFileSync(path.join(workspace, "notes", "a.md"), "utf-8")).toBe("hello again");
    expect(emitEvent).toHaveBeenCalledWith(expect.objectContaining({
      type: "resource.changed",
      source: "agent_tool",
      reason: "agent_edit",
      resourceKey: `local_fs:${path.join(realWorkspace, "notes", "a.md").replace(/\\/g, "/")}`,
    }), expect.any(String));
  });

  it("isolates concurrent mutation captures and preserves multiple receipts", async () => {
    const pending = new Map<string, () => void>();
    const resourceIO = {
      write: vi.fn(async (ref, content, context) => {
        await new Promise<void>((resolve) => pending.set(String(content), resolve));
        return {
          changeType: "updated",
          resourceKey: `local_fs:${ref.path}`,
          resource: { ...ref, provider: "local_fs" },
          version: { size: String(content).length, mtimeMs: 1 },
          operationId: context.operationId,
        };
      }),
    };
    const operations = createResourceIoToolOperations({
      cwd: "/workspace",
      resourceIO: resourceIO as unknown as ResourceIO,
    });
    const operationA = "11111111-1111-4111-8111-111111111111";
    const operationB = "22222222-2222-4222-8222-222222222222";
    const captureA = operations.withMutationCapture({
      operationId: operationA,
      sessionId: "sess_a",
      sessionPath: "/sessions/a.jsonl",
    }, async () => operations.write.writeFile("a.md", "a"));
    const captureB = operations.withMutationCapture({
      operationId: operationB,
      sessionId: "sess_b",
      sessionPath: "/sessions/b.jsonl",
    }, async () => operations.write.writeFile("b.md", "b"));

    await vi.waitFor(() => expect(pending.size).toBe(2));
    pending.get("b")?.();
    pending.get("a")?.();
    const [resultA, resultB] = await Promise.all([captureA, captureB]);

    expect(resultA.mutations).toHaveLength(1);
    expect(resultA.mutations[0]).toMatchObject({ operationId: operationA });
    expect(resultB.mutations).toHaveLength(1);
    expect(resultB.mutations[0]).toMatchObject({ operationId: operationB });
    expect(resourceIO.write.mock.calls.map((call) => call[2])).toEqual(expect.arrayContaining([
      expect.objectContaining({ operationId: operationA, sessionId: "sess_a" }),
      expect.objectContaining({ operationId: operationB, sessionId: "sess_b" }),
    ]));

    resourceIO.write.mockImplementation(async (ref, content, context) => ({
      changeType: "updated",
      resourceKey: `local_fs:${ref.path}`,
      resource: { ...ref, provider: "local_fs" },
      version: { size: String(content).length, mtimeMs: 2 },
      operationId: context.operationId,
    }));
    const multiple = await operations.withMutationCapture({
      operationId: operationA,
      sessionId: "sess_a",
      sessionPath: "/sessions/a.jsonl",
    }, async () => {
      await operations.write.writeFile("a.md", "first");
      await operations.write.writeFile("a.md", "second");
    });
    expect(multiple.mutations).toHaveLength(2);

    resourceIO.write.mockRejectedValueOnce(new Error("write failed"));
    await expect(operations.withMutationCapture({
      operationId: operationA,
      sessionId: "sess_a",
      sessionPath: "/sessions/a.jsonl",
    }, async () => operations.write.writeFile("a.md", "failed"))).rejects.toThrow("write failed");
  });

  it("returns separate SessionFile identity and writable local refs for write outputs", async () => {
    const recordFileOperation = vi.fn(({ sessionPath, filePath, label, origin, operation }) => ({
      id: "sf_notes",
      fileId: "sf_notes",
      sessionPath,
      filePath,
      label,
      origin,
      operations: [operation],
      storageKind: "external",
      status: "available",
    }));
    const { workspace, sessionPath, tools } = makeTools({ recordFileOperation });
    const write = tools.find((tool) => tool.name === "write");
    const targetPath = path.join(workspace, "notes", "a.md");

    const result = await write.execute("write-refs", {
      path: "notes/a.md",
      content: "hello",
    });

    expect(recordFileOperation).toHaveBeenCalledWith(expect.objectContaining({
      sessionPath,
      filePath: targetPath,
      origin: "agent_write",
      operation: "created",
    }));
    expect(result.details).toMatchObject({
      sessionFile: { fileId: "sf_notes", filePath: targetPath },
      sessionFileRef: { kind: "session-file", fileId: "sf_notes" },
      writableLocalRef: { kind: "local-file", path: targetPath },
    });
  });

  it("correlates a write from its authoritative ResourceIO mutation receipt", async () => {
    tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "hana-resource-sandbox-tools-"));
    const workspace = path.join(tempRoot, "workspace");
    const hanakoHome = path.join(tempRoot, "hana-home");
    const agentDir = path.join(hanakoHome, "agents", "hana");
    const sessionPath = path.join(agentDir, "sessions", "main.jsonl");
    const requestedPath = path.join(workspace, "notes", "requested.md");
    const authoritativePath = path.join(workspace, "notes", "authoritative.md");
    fs.mkdirSync(agentDir, { recursive: true });
    fs.mkdirSync(path.dirname(requestedPath), { recursive: true });

    const resourceIO = {
      stat: vi.fn(async () => ({
        resourceKey: `local_fs:${requestedPath}`,
        resource: { kind: "local-file", provider: "local_fs", path: requestedPath },
        exists: false,
        isDirectory: false,
      })),
      mkdir: vi.fn(async () => ({
        changeType: "created",
        resourceKey: `local_fs:${path.dirname(requestedPath)}`,
        resource: { kind: "local-file", provider: "local_fs", path: path.dirname(requestedPath) },
      })),
      write: vi.fn(async (_ref, content, context) => {
        fs.writeFileSync(requestedPath, content);
        return {
          changeType: "created",
          resourceKey: `local_fs:${authoritativePath}`,
          resource: { kind: "local-file", provider: "local_fs", path: authoritativePath },
          version: { size: Buffer.byteLength(content), mtimeMs: 2 },
          operationId: context.operationId,
        };
      }),
    };
    const recordAgentFileChange = vi.fn(async ({ sessionId, operationId, mutation }) => ({
      sessionId,
      operationId,
      resource: { sourceKey: "main", relativePath: path.basename(mutation.resource.path) },
    }));
    const recordFileOperation = vi.fn(({ filePath }) => ({
      id: "sf_authoritative",
      fileId: "sf_authoritative",
      sessionPath,
      filePath,
      label: path.basename(filePath),
      storageKind: "external",
      status: "available",
    }));
    const result = createSandboxedTools(workspace, [], {
      agentDir,
      workspace,
      workspaceFolders: [],
      hanakoHome,
      getSandboxEnabled: () => true,
      getSessionPath: () => sessionPath,
      getSessionIdForPath: () => "sess_main",
      resourceIO,
      recordFileOperation,
      recordAgentFileChange,
    } as any);
    const write = result.tools.find((tool) => tool.name === "write");

    const writeResult = await write.execute("write-correlated", {
      path: "notes/requested.md",
      content: "hello",
    });

    const operationId = resourceIO.write.mock.calls[0][2].operationId;
    expect(operationId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
    expect(recordAgentFileChange).toHaveBeenCalledWith(expect.objectContaining({
      sessionId: "sess_main",
      sessionPath,
      operationId,
      mutation: expect.objectContaining({
        resource: expect.objectContaining({ path: authoritativePath }),
      }),
    }));
    expect(writeResult.details.agentFileChange).toEqual({
      sessionId: "sess_main",
      operationId,
      resource: { sourceKey: "main", relativePath: "authoritative.md" },
    });
  });

  it("preserves successful SessionFile details when optional correlation fails", async () => {
    const recordFileOperation = vi.fn(({ filePath }) => ({
      id: "sf_notes",
      fileId: "sf_notes",
      filePath,
      label: path.basename(filePath),
      storageKind: "external",
      status: "available",
    }));
    const recordAgentFileChange = vi.fn(async () => {
      throw new Error("main projection unavailable at /private/secret/main");
    });
    const { tools } = makeTools({
      getSessionIdForPath: () => "sess_main",
      recordFileOperation,
      recordAgentFileChange,
    });
    const write = tools.find((tool) => tool.name === "write");

    const result = await write.execute("write-correlation-failure", {
      path: "notes/a.md",
      content: "hello",
    });

    expect(result.details).toMatchObject({
      sessionFile: { fileId: "sf_notes" },
      sessionFileRef: { kind: "session-file", fileId: "sf_notes" },
    });
    expect(result.details).not.toHaveProperty("agentFileChange");
    expect(result.content).toEqual(expect.arrayContaining([
      expect.objectContaining({
        type: "text",
        text: "Agent file change correlation unavailable.",
      }),
    ]));
    expect(result.content).not.toEqual(expect.arrayContaining([
      expect.objectContaining({
        text: expect.stringContaining("/private/secret/main"),
      }),
    ]));
  });

  it("routes mount ResourceRefs through ResourceIO instead of local workspace paths", async () => {
    const files = new Map();
    files.set("notes/a.md", "hello");
    const calls: Array<{ method: string; ref: any; content?: string }> = [];
    const failLocal = (method: string, ref: any) => {
      if (ref?.kind === "local-file") {
        throw new Error(`${method} unexpectedly used local-file ${ref.path}`);
      }
    };
    const keyFor = (ref: any) => ref.path || "";
    const resourceIO = {
      stat: vi.fn(async (ref) => {
        failLocal("stat", ref);
        calls.push({ method: "stat", ref });
        const key = keyFor(ref);
        const exists = files.has(key);
        return {
          resourceKey: `mount:${ref.mountId}:${key}`,
          resource: { kind: "mount", mountId: ref.mountId, path: key, provider: "mount" },
          exists,
          isDirectory: false,
          version: { size: exists ? files.get(key).length : 0, mtimeMs: 1 },
        };
      }),
      read: vi.fn(async (ref) => {
        failLocal("read", ref);
        calls.push({ method: "read", ref });
        const key = keyFor(ref);
        return {
          resourceKey: `mount:${ref.mountId}:${key}`,
          resource: { kind: "mount", mountId: ref.mountId, path: key, provider: "mount" },
          content: Buffer.from(files.get(key) || ""),
          version: { size: (files.get(key) || "").length, mtimeMs: 1 },
        };
      }),
      write: vi.fn(async (ref, content) => {
        failLocal("write", ref);
        calls.push({ method: "write", ref, content: String(content) });
        files.set(keyFor(ref), String(content));
        return {
          changeType: "modified",
          resourceKey: `mount:${ref.mountId}:${keyFor(ref)}`,
          resource: { kind: "mount", mountId: ref.mountId, path: keyFor(ref), provider: "mount" },
          version: { size: String(content).length, mtimeMs: 2 },
        };
      }),
      mkdir: vi.fn(async (ref) => {
        failLocal("mkdir", ref);
        calls.push({ method: "mkdir", ref });
        return {
          changeType: "modified",
          resourceKey: `mount:${ref.mountId}:${keyFor(ref)}`,
          resource: { kind: "mount", mountId: ref.mountId, path: keyFor(ref), provider: "mount" },
        };
      }),
      list: vi.fn(async (ref) => {
        failLocal("list", ref);
        calls.push({ method: "list", ref });
        return {
          resourceKey: `mount:${ref.mountId}:${keyFor(ref)}`,
          resource: { kind: "mount", mountId: ref.mountId, path: keyFor(ref), provider: "mount" },
          items: [],
        };
      }),
    };
    const { workspace, tools } = makeToolsWithResourceIO(resourceIO);
    const read = tools.find((tool) => tool.name === "read");
    const write = tools.find((tool) => tool.name === "write");
    const edit = tools.find((tool) => tool.name === "edit");

    const readResult = await read.execute("read-mount", {
      resource: { kind: "mount", mountId: "mount_docs", path: "notes/a.md" },
    });
    await write.execute("write-mount", {
      resource: { kind: "mount", mountId: "mount_docs", path: "notes/b.md" },
      content: "new file",
    });
    await edit.execute("edit-mount", {
      resource: { kind: "mount", mountId: "mount_docs", path: "notes/a.md" },
      edits: [{ oldText: "hello", newText: "hello mount" }],
    });

    expect(readResult.content[0].text).toBe("hello");
    expect(files.get("notes/a.md")).toBe("hello mount");
    expect(files.get("notes/b.md")).toBe("new file");
    expect(fs.existsSync(path.join(workspace, "notes", "a.md"))).toBe(false);
    expect(calls.map((call) => [call.method, call.ref])).toEqual(expect.arrayContaining([
      ["read", { kind: "mount", mountId: "mount_docs", path: "notes/a.md" }],
      ["mkdir", { kind: "mount", mountId: "mount_docs", path: "notes" }],
      ["write", { kind: "mount", mountId: "mount_docs", path: "notes/b.md" }],
      ["write", { kind: "mount", mountId: "mount_docs", path: "notes/a.md" }],
    ]));
  });
});
