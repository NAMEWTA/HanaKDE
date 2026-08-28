import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, describe, expect, it, vi } from "vitest";

describe("MountAwareFileService", () => {
  let tmpDir = null;

  afterEach(() => {
    if (tmpDir) fs.rmSync(tmpDir, { recursive: true, force: true });
    tmpDir = null;
  });

  it("resolves default root and active local_fs studio mounts without exposing paths", async () => {
    const { upsertStudioMount } = await import("../core/studio-mounts.ts");
    const { MountAwareFileService } = await import("../core/mount-aware-file-service.ts");
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "hana-mount-file-"));
    const defaultRoot = path.join(tmpDir, "default");
    const mountRoot = path.join(tmpDir, "mount");
    fs.mkdirSync(defaultRoot, { recursive: true });
    fs.mkdirSync(mountRoot, { recursive: true });
    fs.writeFileSync(path.join(mountRoot, "mounted.md"), "hello mount", "utf-8");
    upsertStudioMount(tmpDir, {
      mountId: "mount_docs",
      hostStudioId: "studio_1",
      sourceKind: "storage",
      provider: "local_fs",
      rootLocator: { path: mountRoot },
      label: "Docs",
      presentation: "folder",
      capabilities: ["list", "read", "write"],
    });

    const service = new MountAwareFileService({
      hanakoHome: tmpDir,
      defaultRoot,
      studioId: "studio_1",
    });

    expect(service.resolveRoot("default")).toMatchObject({
      id: "default",
      label: "Default",
      capabilities: ["list", "read", "write"],
    });
    expect(service.resolveRoot("default")).not.toHaveProperty("path");

    const mounted = service.resolveRoot("mount_docs");
    expect(mounted).toMatchObject({
      id: "mount_docs",
      label: "Docs",
      mountId: "mount_docs",
      capabilities: ["list", "read", "write"],
    });
    expect(mounted).not.toHaveProperty("path");
    expect(await service.listFiles("mount_docs", "")).toMatchObject({
      rootId: "mount_docs",
      files: [{ name: "mounted.md", isDir: false }],
    });
  });

  it("rejects local_fs mounts outside their resolved root", async () => {
    const { MountAwareFileService } = await import("../core/mount-aware-file-service.ts");
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "hana-mount-file-"));
    const defaultRoot = path.join(tmpDir, "default");
    fs.mkdirSync(defaultRoot, { recursive: true });
    const service = new MountAwareFileService({
      hanakoHome: tmpDir,
      defaultRoot,
      studioId: "studio_1",
    });

    expect(() => service.resolveDirectory("default", "../outside")).toThrow("invalid_subdir");
  });

  it("discloses local_fs native roots only when constructed with discloseNativeRoot", async () => {
    const { upsertStudioMount } = await import("../core/studio-mounts.ts");
    const { MountAwareFileService } = await import("../core/mount-aware-file-service.ts");
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "hana-mount-file-"));
    const defaultRoot = path.join(tmpDir, "default");
    const mountRoot = path.join(tmpDir, "mount");
    fs.mkdirSync(defaultRoot, { recursive: true });
    fs.mkdirSync(mountRoot, { recursive: true });
    fs.writeFileSync(path.join(mountRoot, "mounted.md"), "hello mount", "utf-8");
    upsertStudioMount(tmpDir, {
      mountId: "mount_docs",
      hostStudioId: "studio_1",
      sourceKind: "storage",
      provider: "local_fs",
      rootLocator: { path: mountRoot },
      label: "Docs",
      presentation: "folder",
      capabilities: ["list", "read", "write"],
    });

    const disclosing = new MountAwareFileService({
      hanakoHome: tmpDir,
      defaultRoot,
      studioId: "studio_1",
      discloseNativeRoot: true,
    });
    expect(disclosing.resolveRoot("mount_docs")).toMatchObject({
      mountId: "mount_docs",
      nativeRootPath: mountRoot,
    });
    expect(disclosing.resolveRoot("mount_docs")).not.toHaveProperty("path");
    expect(disclosing.resolveRoot("default")).toMatchObject({ nativeRootPath: defaultRoot });
    expect((await disclosing.listFiles("mount_docs", "")).mount).toMatchObject({
      nativeRootPath: mountRoot,
    });

    const closed = new MountAwareFileService({
      hanakoHome: tmpDir,
      defaultRoot,
      studioId: "studio_1",
    });
    expect(closed.resolveRoot("mount_docs")).not.toHaveProperty("nativeRootPath");
    expect(closed.resolveRoot("default")).not.toHaveProperty("nativeRootPath");
    expect((await closed.listFiles("mount_docs", "")).mount).not.toHaveProperty("nativeRootPath");
  });

  it("preserves ResourceIO operation context for workbench mutations", async () => {
    const { MountAwareFileService } = await import("../core/mount-aware-file-service.ts");
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "hana-mount-file-"));
    const defaultRoot = path.join(tmpDir, "default");
    fs.mkdirSync(defaultRoot, { recursive: true });
    fs.writeFileSync(path.join(defaultRoot, "old.md"), "old", "utf-8");
    fs.mkdirSync(path.join(defaultRoot, "archive"), { recursive: true });
    const resourceIO = {
      stat: vi.fn(async () => ({ exists: false, isDirectory: false, resourceKey: "local_fs:/note.md" })),
      read: vi.fn(async () => ({ content: Buffer.from(""), resourceKey: "local_fs:/note.md" })),
      write: vi.fn(async (ref, content) => ({
        changeType: "created",
        resourceKey: "local_fs:/note.md",
        resource: ref,
        content,
      })),
      mkdir: vi.fn(async (ref) => ({
        changeType: "created",
        resourceKey: "local_fs:/archive",
        resource: ref,
      })),
      move: vi.fn(async (from, to) => ({
        oldResourceKey: "local_fs:/old.md",
        newResourceKey: "local_fs:/archive/old.md",
        oldResource: from,
        newResource: to,
      })),
      list: vi.fn(async () => ({ items: [] })),
    };
    const service = new MountAwareFileService({
      hanakoHome: tmpDir,
      defaultRoot,
      studioId: "studio_1",
      resourceIO,
      operationContext: {
        source: "api",
        sessionId: "sess_1",
        sessionPath: "/sessions/current.jsonl",
        principal: {
          kind: "api",
          userId: "user_1",
          studioId: "studio_1",
          sessionId: "sess_1",
          sessionPath: "/sessions/current.jsonl",
          connectionKind: "lan",
          credentialKind: "device_credential",
          requestId: "req_1",
        },
        requestId: "req_1",
      },
    });

    await service.writeText("default", "", { name: "note.md", content: "hello" }, { reason: "mobile_workbench.write" });
    await service.move("default", "", { name: "old.md", destSubdir: "archive" }, { reason: "mobile_workbench.move" });

    expect(resourceIO.write).toHaveBeenCalledWith(
      expect.objectContaining({ kind: "local-file", path: path.join(defaultRoot, "note.md") }),
      "hello",
      expect.objectContaining({
        source: "api",
        reason: "mobile_workbench.write",
        sessionId: "sess_1",
        sessionPath: "/sessions/current.jsonl",
        requestId: "req_1",
        principal: expect.objectContaining({
          kind: "api",
          userId: "user_1",
          studioId: "studio_1",
          connectionKind: "lan",
          credentialKind: "device_credential",
        }),
      }),
    );
    expect(resourceIO.mkdir).toHaveBeenCalledWith(
      expect.objectContaining({ kind: "local-file", path: path.join(defaultRoot, "archive") }),
      expect.objectContaining({
        emit: false,
        reason: "mobile_workbench.move",
        principal: expect.objectContaining({ kind: "api", requestId: "req_1" }),
      }),
    );
  });

  it("uses provider stat and does not create a missing destination when move requires an existing folder", async () => {
    const { MountAwareFileService } = await import("../core/mount-aware-file-service.ts");
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "hana-mount-file-"));
    const defaultRoot = path.join(tmpDir, "default");
    fs.mkdirSync(defaultRoot, { recursive: true });
    fs.writeFileSync(path.join(defaultRoot, "note.md"), "note", "utf-8");
    fs.mkdirSync(path.join(defaultRoot, "missing"));
    const resourceIO = {
      stat: vi.fn(async () => ({
        exists: false,
        isDirectory: false,
        resourceKey: `local_fs:${path.join(defaultRoot, "missing")}`,
      })),
      read: vi.fn(),
      write: vi.fn(),
      list: vi.fn(async () => ({ items: [] })),
      mkdir: vi.fn(),
      move: vi.fn(),
    };
    const service = new MountAwareFileService({
      hanakoHome: tmpDir,
      defaultRoot,
      resourceIO,
    });

    await expect(service.move(
      "default",
      "",
      { name: "note.md", destSubdir: "missing" },
      { reason: "desk.files.move", createDestIfMissing: false },
    )).rejects.toMatchObject({
      code: "dest_not_directory",
      status: 400,
    });

    expect(resourceIO.stat).toHaveBeenCalledWith(
      expect.objectContaining({ kind: "local-file", path: path.join(defaultRoot, "missing") }),
    );
    expect(resourceIO.mkdir).not.toHaveBeenCalled();
    expect(resourceIO.move).not.toHaveBeenCalled();
  });

  it("copies files and folders with collision-safe names", async () => {
    const { MountAwareFileService } = await import("../core/mount-aware-file-service.ts");
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "hana-mount-file-copy-"));
    const defaultRoot = path.join(tmpDir, "default");
    fs.mkdirSync(path.join(defaultRoot, "docs"), { recursive: true });
    fs.mkdirSync(path.join(defaultRoot, "archive"), { recursive: true });
    fs.writeFileSync(path.join(defaultRoot, "note.md"), "note", "utf-8");
    fs.writeFileSync(path.join(defaultRoot, "docs", "nested.md"), "nested", "utf-8");
    const service = new MountAwareFileService({ hanakoHome: tmpDir, defaultRoot });

    const sameDirectory = await service.copyPaths("default", {
      items: [{ sourceSubdir: "", name: "note.md" }],
      destSubdir: "",
      currentSubdir: "",
    }, { reason: "desk.files.copy" });
    const intoArchive = await service.copyPaths("default", {
      items: [{ sourceSubdir: "", name: "docs", isDirectory: true }],
      destSubdir: "archive",
      currentSubdir: "",
    }, { reason: "desk.files.copy" });

    expect(sameDirectory.results).toEqual([{ name: "note.md", targetName: "note copy.md", ok: true }]);
    expect(fs.readFileSync(path.join(defaultRoot, "note copy.md"), "utf-8")).toBe("note");
    expect(intoArchive.results).toEqual([{ name: "docs", targetName: "docs", ok: true }]);
    expect(fs.readFileSync(path.join(defaultRoot, "archive", "docs", "nested.md"), "utf-8")).toBe("nested");
  });

  it("re-resolves mounted replace uploads inside transfer instead of carrying a stale-root version", async () => {
    const { upsertStudioMount } = await import("../core/studio-mounts.ts");
    const { MountAwareFileService } = await import("../core/mount-aware-file-service.ts");
    const { createSandboxResourceIO } = await import("../lib/resource-io/sandbox-resource-io.ts");
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "hana-mount-file-race-"));
    const defaultRoot = path.join(tmpDir, "default");
    const oldRoot = path.join(tmpDir, "old-root");
    const newRoot = path.join(tmpDir, "new-root");
    const sourceRoot = path.join(tmpDir, "source");
    for (const dir of [defaultRoot, oldRoot, newRoot, sourceRoot]) {
      fs.mkdirSync(dir, { recursive: true });
    }
    const sourcePath = path.join(sourceRoot, "same.md");
    fs.writeFileSync(sourcePath, "SRC!", "utf-8");
    fs.writeFileSync(path.join(oldRoot, "same.md"), "OLD!", "utf-8");
    fs.writeFileSync(path.join(newRoot, "same.md"), "NEW!", "utf-8");
    const mount = (rootLocator) => ({
      mountId: "mount_docs",
      hostStudioId: "studio_1",
      sourceKind: "storage",
      provider: "local_fs",
      rootLocator: { path: rootLocator },
      label: "Docs",
      presentation: "folder",
      capabilities: ["list", "read", "write"],
    });
    upsertStudioMount(tmpDir, mount(oldRoot));
    const resourceIO = createSandboxResourceIO({
      cwd: defaultRoot,
      agentDir: defaultRoot,
      workspace: defaultRoot,
      workspaceFolders: [defaultRoot],
      authorizedFolders: [defaultRoot],
      hanakoHome: tmpDir,
      getSandboxEnabled: () => false,
      studioId: "studio_1",
    });
    const transfer = resourceIO.transfer.bind(resourceIO);
    vi.spyOn(resourceIO, "transfer").mockImplementation(async (...args) => {
      upsertStudioMount(tmpDir, mount(newRoot));
      return transfer(...args);
    });
    const service = new MountAwareFileService({
      hanakoHome: tmpDir,
      defaultRoot,
      defaultRootRef: { kind: "mount", mountId: "mount_docs", path: "" },
      studioId: "studio_1",
      resourceIO,
    });

    await service.copyLocalPathIntoDirectory("default", "", sourcePath);

    expect(fs.readFileSync(path.join(oldRoot, "same.md"), "utf-8")).toBe("OLD!");
    expect(fs.readFileSync(path.join(newRoot, "same.md"), "utf-8")).toBe("SRC!");
  });
});
