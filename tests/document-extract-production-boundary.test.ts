import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function source(relativePath: string): string {
  return fs.readFileSync(path.join(ROOT, relativePath), "utf-8");
}

describe("document-extract production boundary", () => {
  it("keeps the upstream parser as a dormant module rather than a tool, route, engine, hub, or renderer dependency", () => {
    const productionEntrypoints = [
      "core/engine.ts",
      "core/agent-manager.ts",
      "lib/tools/file-tool.ts",
      "lib/tools/session-tool.ts",
      "server/composition/open-root.ts",
      "server/routes/agents.ts",
      "server/routes/chat.ts",
      "server/routes/sessions.ts",
      "hub/index.ts",
      "desktop/main.cjs",
      "desktop/src/react/App.tsx",
    ];

    for (const entrypoint of productionEntrypoints) {
      const text = source(entrypoint);
      expect(text).not.toMatch(/document-extract|@firecrawl\/anydoc|extractDocument|toMarkdownBytes/);
    }
  });

  it("does not expose an extract action through the production file tool", () => {
    const fileTool = source("lib/tools/file-tool.ts");

    expect(fileTool).not.toContain('Type.Literal("extract")');
    expect(fileTool).not.toContain("extractDocument");
    expect(fileTool).not.toContain("resolveReadableFileRef");
  });
});
