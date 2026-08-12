import fs from "fs";
import os from "os";
import path from "path";
import { describe, expect, it } from "vitest";
import { copySecureFsHelperRuntime } from "../scripts/build-secure-fs-helper.mjs";

const root = process.cwd();

function readPackageJson() {
  return JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
}

describe("electron-builder native rebuild contract", () => {
  it("does not rebuild server native addons against Electron ABI", () => {
    const pkg = readPackageJson();

    expect(pkg.build.npmRebuild).toBe(false);
    expect(pkg.build.files).toContain("!**/node_modules/**");
    expect(pkg.build.files).toContain("node_modules/ws/**");
    expect(pkg.build.files).not.toContain("node_modules/better-sqlite3/**");
  });

  it("wires secure helper and extraction child assets into the production build contract", () => {
    const pkg = readPackageJson();
    const phases = fs.readFileSync(path.join(root, "scripts", "build-server-phases.mjs"), "utf8");
    const secureHelper = fs.readFileSync(path.join(root, "scripts", "build-secure-fs-helper.mjs"), "utf8");
    const nativeWrite = fs.readFileSync(path.join(root, "lib", "resource-io", "native-secure-write.ts"), "utf8");
    const manifest = JSON.parse(fs.readFileSync(path.join(root, "export-manifest.json"), "utf8"));

    expect(pkg.scripts["build:server"]).toContain("build:secure-fs-helper");
    expect(phases).toContain('"--ssr"');
    expect(phases).toContain("anydoc-child.cjs");
    expect(phases).toContain("html-child.ts");
    expect(secureHelper).toContain('"-arch"');
    expect(secureHelper).toContain("verifyDarwinSecureFsHelperArchitecture");
    expect(nativeWrite).toContain("process.env.HANA_ROOT");
    expect(manifest.paths).toEqual(expect.arrayContaining([
      "lib/document-extract/anydoc-child.cjs",
      "lib/document-extract/anydoc-process-runner.ts",
      "lib/document-extract/html-child.ts",
      "lib/knowledge-workspace/document-index-extractor.ts",
    ]));

    const lock = JSON.parse(fs.readFileSync(path.join(root, "package-lock.json"), "utf8"));
    expect(lock.packages[""].dependencies["@firecrawl/anydoc"]).toBe(pkg.dependencies["@firecrawl/anydoc"]);
  });

  it("copies only the matching host helper and fails when its input is absent", () => {
    const fixture = fs.mkdtempSync(path.join(os.tmpdir(), "hana-secure-fs-package-"));
    try {
      const rootDir = path.join(fixture, "repo");
      const outDir = path.join(fixture, "server");
      const source = path.join(rootDir, "dist-secure-fs", "mac-arm64", "hana-secure-fs-helper");
      fs.mkdirSync(path.dirname(source), { recursive: true });
      fs.writeFileSync(source, "fixture-helper");

      const result = copySecureFsHelperRuntime({ rootDir, outDir, platform: "darwin", arch: "arm64" });
      expect(result.skipped).toBe(false);
      expect(fs.readFileSync(path.join(outDir, "dist-secure-fs", "mac-arm64", "hana-secure-fs-helper"), "utf8"))
        .toBe("fixture-helper");

      expect(() => copySecureFsHelperRuntime({
        rootDir: path.join(fixture, "missing-repo"),
        outDir: path.join(fixture, "missing-server"),
        platform: "darwin",
        arch: "arm64",
      })).toThrow(/built helper missing/);
      expect(copySecureFsHelperRuntime({
        rootDir,
        outDir: path.join(fixture, "linux-server"),
        platform: "linux",
        arch: "x64",
      }).skipped).toBe(true);
    } finally {
      fs.rmSync(fixture, { recursive: true, force: true });
    }
  });
});
