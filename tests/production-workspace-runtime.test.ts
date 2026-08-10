import { describe, expect, it, vi } from "vitest";
import { createProductionWorkspaceRuntime } from "../core/workspace-runtime/production-workspace-runtime.ts";

describe("production workspace runtime assembly", () => {
  it("owns the legacy-to-coordinator handoff and bridges watched changes through the injected EventBus", async () => {
    const order: string[] = [];
    let listener: {
      onChange(change: { relativePath: string; changeType: "created" | "modified" | "deleted" }): void;
      onGap(): void;
      onError(): void;
    } | null = null;
    const legacyWatchRegistry = {
      entries: new Map([
        ["legacy-main", {
          ref: { kind: "local-file" },
          filePath: "/workspace/notes/old.md",
        }],
      ]),
      release: vi.fn((resourceKey: string) => {
        order.push(`release:${resourceKey}`);
        legacyWatchRegistry.entries.delete(resourceKey);
      }),
    };
    const resourceEvents = {
      latestSequence: () => 0,
      changed: vi.fn(),
      deleted: vi.fn(),
    };
    const runtime = createProductionWorkspaceRuntime({
      rootPath: "/workspace",
      rootAuthority: {
        proveMain: async (root) => ({
          root: { kind: "local-file", path: root.path },
          identity: {
            providerId: "local_fs",
            identityNamespace: "test",
            opaqueRootId: "workspace",
            scopeToken: "scope",
            caseMode: "sensitive",
          },
          watchTarget: {
            ref: { kind: "local-file", path: root.path },
            filePath: root.path,
            isDirectory: true,
          },
        }),
        revalidateMain: async (proof) => proof,
      },
      watchAdapter: {
        open: (_proof, nextListener) => {
          listener = nextListener;
          order.push("watch-open");
          return { close: () => order.push("watch-close") };
        },
        baseline: function* () {
          order.push("baseline");
          yield { relativePath: "notes", kind: "directory" as const };
          yield { relativePath: "notes/old.md", kind: "file" as const };
        },
      },
      resourceEvents,
      legacyWatchRegistry,
      isolatedProof: () => order.push("isolated-proof"),
      beforeCoordinatorStart: () => order.push("repartition"),
    });

    await runtime.cutover.start();

    expect(order).toEqual([
      "isolated-proof",
      "release:legacy-main",
      "repartition",
      "watch-open",
      "baseline",
    ]);
    expect(runtime.cutover.snapshot()).toMatchObject({
      state: "HEALTHY",
      overlap: 0,
      legacy: { watchers: 0, mutations: 0, baselines: 0 },
      coordinator: { watchers: 1, mutations: 0, baselines: 1 },
    });

    listener?.onChange({ relativePath: "notes/new.md", changeType: "created" });
    await vi.waitFor(() => {
      expect(resourceEvents.changed).toHaveBeenCalledWith(expect.objectContaining({
        resourceKey: "local_fs:/workspace/notes/new.md",
        source: "provider_watch",
      }));
    });

    await runtime.cutover.stop();
    expect(order).toContain("watch-close");
    expect(runtime.cutover.snapshot()).toMatchObject({
      state: "DEGRADED",
      overlap: 0,
    });
  });
});
