import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function source(relativePath: string): string {
  return fs.readFileSync(path.join(ROOT, relativePath), "utf-8");
}

function json(relativePath: string): unknown {
  return JSON.parse(source(relativePath));
}

function releaseDigestEntries(value: unknown): Array<Record<string, unknown>> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return [];

  const digest = value as Record<string, unknown>;
  if (!Array.isArray(digest.entries)) return [digest];

  return digest.entries.filter((entry): entry is Record<string, unknown> => (
    Boolean(entry) && typeof entry === "object" && !Array.isArray(entry)
  ));
}

describe("file-history production boundary", () => {
  it("activates History only through the healthy main production assembly", () => {
    const engine = source("core/engine.ts");
    const assembly = source("core/workspace-runtime/production-workspace-runtime.ts");

    expect(engine).toContain("new ResourceWatchRegistry");
    expect(engine).toContain("FileHistoryService");
    expect(engine).toContain("historyResourceIO: this.getResourceIO()");
    expect(engine).toContain("this._mainFileHistoryBinding = assembly.fileHistoryBinding");
    expect(engine).toContain("await this._closeFileHistoryService();");
    expect(engine).not.toContain("refreshFileHistoryWorkspaces");
    expect(assembly).toContain("sourceKey: \"main\" as const");
    expect(assembly).toContain("subscribe: (consumer) => runtime.subscribe(consumer)");
    expect(assembly).toContain("subscribe: (subscriber) => resourceEvents.subscribe(subscriber)");
  });

  it("mounts exactly one main-only route without granting it filesystem ownership", () => {
    const openRoot = source("server/composition/open-root.ts");
    const route = source("server/routes/file-history.ts");
    const service = source("lib/file-history/file-history-service.ts");
    const rendererEntrypoints = [
      "server/routes/agents.ts",
      "desktop/src/react/App.tsx",
      "desktop/src/react/components/desk/DeskTree.tsx",
      "desktop/src/react/components/preview/FloatingActions.tsx",
      "desktop/src/react/stores/index.ts",
    ];

    expect(openRoot.match(/createFileHistoryRoute\(engine\)/g)).toHaveLength(1);
    expect(route).not.toContain("historyStoreKey");
    expect(route).not.toContain("privateStore");
    expect(route).not.toContain("history.sqlite");
    expect(service).not.toMatch(/from ["']node:fs["']/);
    expect(service).not.toContain("fs.watch");

    for (const entrypoint of rendererEntrypoints) {
      const text = source(entrypoint);
      expect(text).not.toContain("file-history");
      expect(text).not.toContain("FileHistory");
      expect(text).not.toContain("openFileHistory");
    }
  });

  it("registers the activated SQLite owner in the production persistence census", () => {
    const registry = source("shared/persistence/store-registry.ts");
    const scanner = source("scripts/scan-persistent-stores.mjs");

    expect(registry).toContain('id: "file-history-sqlite"');
    expect(registry).toContain('module: "lib/file-history/history-store.ts"');
    expect(scanner).not.toContain("dormant-file-history-input");
    expect(scanner).toContain('"FileHistoryService"');
    expect(scanner).toContain('"FileHistoryStore"');
  });

  it("does not advertise the dormant input through packaged release digests", () => {
    const digestPaths = ["release-digest.v1.json", "release-digest.v2.json"];

    for (const digestPath of digestPaths) {
      const digest = json(digestPath);
      const entries = releaseDigestEntries(digest);
      const itemIds = entries.flatMap(entry => {
        const items = entry.items;
        if (!Array.isArray(items)) return [];

        return items.map(item => (
          item && typeof item === "object" && !Array.isArray(item)
            ? (item as Record<string, unknown>).id
            : undefined
        ));
      });

      expect(itemIds).not.toContain("workspace-file-history");
      expect(JSON.stringify(digest)).not.toMatch(/file history/i);
    }
  });
});
