import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { renderShell } from "../routes/page.ts";
import { mockContext, removeDirectory, temporaryDirectory } from "./helpers.ts";

const pluginRoot = path.resolve(import.meta.dirname, "..");

describe("Page and Widget surfaces", () => {
  it("serves official plugin assets and filters injected host CSS", () => {
    const dir = temporaryDirectory();
    try {
      const context = mockContext(dir);
      const shell = renderShell({ req: { json: async () => ({}), query: (name) => name === "hana-css" ? "/assets/hana.css" : undefined }, json: () => null, html: () => null }, context, "page");
      expect(shell).toContain('/api/plugins/markdown-wechat/assets/app.css');
      expect(shell).toContain('/api/plugins/markdown-wechat/assets/app.js');
      expect(shell).toContain('/assets/hana.css');
      const rejected = renderShell({ req: { json: async () => ({}), query: (name) => name === "hana-css" ? "https://example.invalid/x.css" : undefined }, json: () => null, html: () => null }, context, "widget");
      expect(rejected).not.toContain("example.invalid");
    } finally { removeDirectory(dir); }
  });

  it("has one editor, a summary-only Widget, hana.ready, and narrow layout rules", () => {
    const source = fs.readFileSync(path.join(pluginRoot, "src/ui/main.tsx"), "utf8");
    const css = fs.readFileSync(path.join(pluginRoot, "assets/app.css"), "utf8");
    expect(source.match(/className="markdown-editor"/g)).toHaveLength(1);
    expect(source).toContain('hana.ready({ surface: "page"');
    expect(source).toContain('hana.ready({ surface: "widget"');
    expect(source).not.toContain("window.location.assign");
    expect(css).toMatch(/@media\s*\(max-width:/);
  });
});
