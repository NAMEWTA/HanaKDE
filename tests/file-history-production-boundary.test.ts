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
  it("keeps the upstream capture implementation detached from engine lifecycle and resource events", () => {
    const engine = source("core/engine.ts");

    expect(engine).toContain("new ResourceWatchRegistry");
    expect(engine).not.toContain("FileHistoryService");
    expect(engine).not.toContain("_fileHistory");
    expect(engine).not.toContain("refreshFileHistoryWorkspaces");
    expect(engine).not.toContain("file-history");
  });

  it("does not expose the dormant file-history input through routes or renderer entrypoints", () => {
    const entrypoints = [
      "server/composition/open-root.ts",
      "server/routes/agents.ts",
      "desktop/src/react/App.tsx",
      "desktop/src/react/components/desk/DeskTree.tsx",
      "desktop/src/react/components/preview/FloatingActions.tsx",
      "desktop/src/react/stores/index.ts",
    ];

    for (const entrypoint of entrypoints) {
      const text = source(entrypoint);
      expect(text).not.toContain("file-history");
      expect(text).not.toContain("FileHistory");
      expect(text).not.toContain("openFileHistory");
    }
  });

  it("does not register the dormant input as a production persistence store", () => {
    const registry = source("shared/persistence/store-registry.ts");
    const scanner = source("scripts/scan-persistent-stores.mjs");

    expect(registry).not.toContain("file-history-sqlite");
    expect(scanner).toContain("dormant-file-history-input");
    expect(scanner).not.toContain('"FileHistoryStore"');
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
