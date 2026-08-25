import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = path.resolve(import.meta.dirname, "..");
const productFiles = ["manifest.json", "index.ts", "routes", "src", "tools"];

function sources(target: string): string[] {
  const absolute = path.join(root, target);
  if (fs.statSync(absolute).isFile()) return [fs.readFileSync(absolute, "utf8")];
  return fs.readdirSync(absolute, { withFileTypes: true }).flatMap((entry) => {
    const next = path.join(target, entry.name);
    return entry.isDirectory() ? sources(next) : entry.name.endsWith(".ts") || entry.name.endsWith(".tsx") ? [fs.readFileSync(path.join(root, next), "utf8")] : [];
  });
}

describe("plugin policy boundary", () => {
  it("declares only ResourceIO and UI host capabilities with no network", () => {
    const manifest = JSON.parse(fs.readFileSync(path.join(root, "manifest.json"), "utf8"));
    expect(manifest.capabilities).toEqual(["resource.read", "resource.write"]);
    expect(manifest.ui.hostCapabilities).toEqual(["resource.pick", "clipboard.writeText"]);
    expect(manifest.network).toBeUndefined();
    expect(manifest.hidden).toBe(true);
  });

  it("contains no browser persistence, network fetch, or workspace path input", () => {
    const text = productFiles.flatMap(sources).join("\n");
    for (const forbidden of ["local" + "Storage", "indexed" + "DB", "XMLHttpRequest", "network.fetch", "workspacePath", "absolutePath"]) {
      expect(text).not.toContain(forbidden);
    }
    expect(text).not.toMatch(/https?:\/\/[A-Za-z0-9]/);
  });
});
