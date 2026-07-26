import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, describe, expect, it } from "vitest";
import { SourceRegistry } from "../core/knowledge-workspace/source-registry.ts";
import {
  disableStudioMount,
  upsertStudioMount,
} from "../core/studio-mounts.ts";
import { createSandboxResourceIO } from "../lib/resource-io/sandbox-resource-io.ts";

describe("knowledge SourceRegistry", () => {
  let tempRoot: string | null = null;

  afterEach(() => {
    if (tempRoot) fs.rmSync(tempRoot, { recursive: true, force: true });
    tempRoot = null;
  });

  async function setup() {
    tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "hana-source-registry-"));
    const main = path.join(tempRoot, "main");
    const source = path.join(tempRoot, "source");
    const second = path.join(tempRoot, "second");
    const nested = path.join(main, "nested");
    const hanakoHome = path.join(tempRoot, "hana");
    for (const dir of [main, source, second, nested]) {
      fs.mkdirSync(dir, { recursive: true });
    }
    for (const [mountId, root] of [
      ["mount_source", source],
      ["mount_second", second],
      ["mount_nested", nested],
      ["mount_main", main],
    ]) {
      upsertStudioMount(hanakoHome, {
        mountId,
        hostStudioId: "studio_1",
        sourceKind: "storage",
        provider: "local_fs",
        rootLocator: { path: root },
        label: mountId,
        presentation: "folder",
        capabilities: ["list", "read", "write", "watch", "materialize"],
      });
    }
    const resourceIO = createSandboxResourceIO({
      cwd: main,
      agentDir: main,
      workspace: main,
      workspaceFolders: [main],
      authorizedFolders: [main],
      hanakoHome,
      getSandboxEnabled: () => false,
      studioId: "studio_1",
    });
    const create = () => SourceRegistry.create({
      mainRoot: { kind: "local-file", path: main },
      resourceIO,
      hanakoHome,
    });
    return { main, source, second, hanakoHome, resourceIO, create };
  }

  it("always exposes unmountable main and starts every registry with no restored mounts", async () => {
    const { create } = await setup();
    const first = await create();
    expect(first.list()).toEqual([
      expect.objectContaining({
        sourceKey: "main",
        role: "main",
        availability: "available",
      }),
    ]);
    await expect(first.remove("main")).rejects.toMatchObject(
      {
        code: "knowledge_operation_precondition_failed",
      },
    );

    await first.register({
      sourceKey: "research",
      displayName: "Research",
      root: { kind: "mount", mountId: "mount_source", path: "" },
    });
    expect((await create()).list().map((source) => source.sourceKey)).toEqual([
      "main",
    ]);
  });

  it("registers only provably disjoint roots and returns path-free DTOs", async () => {
    const { create } = await setup();
    const registry = await create();
    const source = await registry.register({
      sourceKey: "research",
      displayName: "Research",
      root: { kind: "mount", mountId: "mount_source", path: "" },
    });

    expect(source).toMatchObject({
      sourceKey: "research",
      displayName: "Research",
      role: "mounted",
      availability: "available",
      capabilities: expect.arrayContaining(["read", "write", "list", "watch", "transfer"]),
    });
    const serialized = JSON.stringify(registry.list());
    expect(serialized).not.toContain("opaqueRootId");
    expect(serialized).not.toContain("scopeToken");
    expect(serialized).not.toContain(tempRoot);

    await expect(registry.register({
      sourceKey: "nested",
      displayName: "Nested",
      root: { kind: "mount", mountId: "mount_nested", path: "" },
    })).rejects.toMatchObject({ code: "source_root_not_disjoint", status: 409 });
    await expect(registry.register({
      sourceKey: "alias",
      displayName: "Alias",
      root: { kind: "mount", mountId: "mount_main", path: "" },
    })).rejects.toMatchObject({ code: "source_root_not_disjoint", status: 409 });
  });

  it("reuses a historical key only for the same inactive opaque root", async () => {
    const { create } = await setup();
    const first = await create();
    await first.register({
      sourceKey: "research",
      displayName: "Research",
      root: { kind: "mount", mountId: "mount_source", path: "" },
    });
    await first.remove("research");
    await expect(first.register({
      sourceKey: "research",
      displayName: "Research again",
      root: { kind: "mount", mountId: "mount_source", path: "" },
    })).resolves.toMatchObject({ sourceKey: "research" });

    const freshSession = await create();
    await expect(freshSession.register({
      sourceKey: "research",
      displayName: "Wrong root",
      root: { kind: "mount", mountId: "mount_second", path: "" },
    })).rejects.toMatchObject({
      code: "knowledge_resource_conflict",
      status: 409,
    });
  });

  it("fails closed when a provider cannot prove identity and revalidates scope before high-risk work", async () => {
    const { create } = await setup();
    const registry = await create();
    await expect(registry.register({
      sourceKey: "unknown",
      displayName: "Unknown",
      root: { kind: "url", url: "https://example.test/" },
    })).rejects.toMatchObject({
      code: "source_root_identity_unprovable",
      status: 422,
    });

    await registry.register({
      sourceKey: "research",
      displayName: "Research",
      root: { kind: "mount", mountId: "mount_source", path: "" },
    });
    await expect(registry.revalidate("research")).resolves.toBeUndefined();
  });

  it("detects symlink retargeting during high-risk scope revalidation", async () => {
    const { main, source, second, hanakoHome, resourceIO } = await setup();
    const selected = path.join(path.dirname(source), "selected");
    fs.symlinkSync(source, selected, "dir");
    upsertStudioMount(hanakoHome, {
      mountId: "mount_selected",
      hostStudioId: "studio_1",
      sourceKind: "storage",
      provider: "local_fs",
      rootLocator: { path: selected },
      label: "Selected",
      presentation: "folder",
      capabilities: ["list", "read", "write"],
    });
    const registry = await SourceRegistry.create({
      mainRoot: { kind: "local-file", path: main },
      resourceIO,
      hanakoHome,
    });
    await registry.register({
      sourceKey: "selected",
      displayName: "Selected",
      root: { kind: "mount", mountId: "mount_selected", path: "" },
    });

    fs.unlinkSync(selected);
    fs.symlinkSync(second, selected, "dir");
    await expect(registry.revalidate("selected")).rejects.toMatchObject({
      code: "source_root_identity_unprovable",
      status: 422,
    });
  });

  it("fails closed when persisted historical bindings are corrupt", async () => {
    const { create, hanakoHome } = await setup();
    const first = await create();
    await first.register({
      sourceKey: "research",
      displayName: "Research",
      root: { kind: "mount", mountId: "mount_source", path: "" },
    });
    fs.writeFileSync(
      path.join(
        hanakoHome,
        "knowledge-workspace/source-bindings/v1.json",
      ),
      "{\"schemaVersion\":1,\"bindings\":\"corrupt\"}\n",
      "utf-8",
    );
    const next = await create();

    await expect(next.register({
      sourceKey: "second",
      displayName: "Second",
      root: { kind: "mount", mountId: "mount_second", path: "" },
    })).rejects.toMatchObject({
      code: "source_root_identity_unprovable",
      status: 422,
    });
  });

  it("serializes concurrent registrations so active roots remain pairwise disjoint", async () => {
    const { create } = await setup();
    const registry = await create();
    const results = await Promise.allSettled([
      registry.register({
        sourceKey: "research",
        displayName: "Research",
        root: { kind: "mount", mountId: "mount_source", path: "" },
      }),
      registry.register({
        sourceKey: "research-alias",
        displayName: "Research alias",
        root: { kind: "mount", mountId: "mount_source", path: "" },
      }),
    ]);

    expect(results.filter((result) => result.status === "fulfilled"))
      .toHaveLength(1);
    expect(results.filter((result) => result.status === "rejected"))
      .toHaveLength(1);
    expect(registry.list()).toHaveLength(2);
  });

  it("projects provider capability loss as unavailable instead of reusing stale capabilities", async () => {
    const { create, hanakoHome } = await setup();
    const registry = await create();
    await registry.register({
      sourceKey: "research",
      displayName: "Research",
      root: { kind: "mount", mountId: "mount_source", path: "" },
    });
    disableStudioMount(hanakoHome, "mount_source", {
      hostStudioId: "studio_1",
    });

    expect(registry.get("research")).toEqual({
      sourceKey: "research",
      displayName: "Research",
      role: "mounted",
      capabilities: [],
      availability: "unavailable",
    });
  });
});
