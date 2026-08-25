import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { PluginContextLike, PluginResourceReadResult } from "../src/contracts.ts";

export function temporaryDirectory(label = "markdown-wechat-"): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), label));
}

export function removeDirectory(target: string): void {
  fs.rmSync(target, { recursive: true, force: true });
}

export function mockContext(dataDir: string, overrides: Partial<PluginContextLike> = {}): PluginContextLike {
  return {
    pluginId: "markdown-wechat",
    dataDir,
    resources: {
      async stat() { return { version: { etag: "v1" } }; },
      async read(): Promise<PluginResourceReadResult> { return { content: "# Imported", version: { etag: "v1" }, name: "article.md" }; },
      async writeExpectedVersion() { return { ok: true, version: { etag: "v2" } }; },
    },
    ...overrides,
  };
}
