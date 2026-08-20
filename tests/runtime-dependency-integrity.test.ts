import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { spawnSync } from "node:child_process";
import { afterEach, describe, expect, it } from "vitest";
import { vi } from "vitest";
import { verifyRootRuntimeDependencies } from "../scripts/verify-runtime-dependencies.mjs";

const require = createRequire(import.meta.url);
const {
  collectRuntimeEntrypoints,
  findMissingRuntimeEntrypoints,
  verifyRuntimeDependencyEntrypoints,
} = require("../shared/runtime-dependency-integrity.cjs");

const tempDirs: string[] = [];

function makeRoot() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "hana-runtime-deps-"));
  tempDirs.push(root);
  return root;
}

function writePackage(root: string, name: string, manifest: Record<string, unknown>, files: string[] = []) {
  const packageDir = path.join(root, "node_modules", name);
  fs.mkdirSync(packageDir, { recursive: true });
  fs.writeFileSync(path.join(packageDir, "package.json"), JSON.stringify({ name, ...manifest }));
  for (const file of files) {
    const filePath = path.join(packageDir, file);
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, "export {};\n");
  }
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

describe("runtime dependency export collection", () => {
  const manifest = {
    exports: {
      ".": {
        types: "./build/index.d.ts",
        import: "./build/index.mjs",
        require: "./build/index.cjs",
      },
      "./value": {
        types: "./build/value.d.ts",
        default: "./build/value.mjs",
      },
      "./features/*": "./build/features/*.mjs",
      "./alias": "./build/value.mjs",
    },
  };

  it("keeps root-only verification compatible with pruned packaged dependencies", () => {
    expect(collectRuntimeEntrypoints(manifest, { scope: "root-only" })).toEqual([
      { exportKey: ".", target: "./build/index.mjs" },
      { exportKey: ".", target: "./build/index.cjs" },
    ]);
  });

  it("checks exact runtime subpaths while skipping types, wildcards, and duplicate targets", () => {
    expect(collectRuntimeEntrypoints(manifest, { scope: "all-exact" })).toEqual([
      { exportKey: ".", target: "./build/index.mjs" },
      { exportKey: ".", target: "./build/index.cjs" },
      { exportKey: "./value", target: "./build/value.mjs" },
    ]);
  });

  it("falls back to module and main when exports is absent", () => {
    expect(collectRuntimeEntrypoints({ module: "./esm.js", main: "./cjs.js" }, { scope: "all-exact" })).toEqual([
      { exportKey: "module", target: "./esm.js" },
      { exportKey: "main", target: "./cjs.js" },
    ]);
  });
});

describe("runtime dependency entrypoint verification", () => {
  it("reports an exact exported subpath whose target is missing", () => {
    const root = makeRoot();
    writePackage(root, "typebox", {
      exports: {
        ".": "./build/index.mjs",
        "./value": "./build/value/index.mjs",
      },
    }, ["build/value/index.mjs"]);

    expect(findMissingRuntimeEntrypoints(root, ["typebox"], { scope: "all-exact" })).toEqual([
      expect.objectContaining({
        packageName: "typebox",
        exportKey: ".",
        target: "./build/index.mjs",
        reason: "entrypoint-missing",
      }),
    ]);
  });

  it("does not reject an NFT-pruned package when root-only targets remain", () => {
    const root = makeRoot();
    writePackage(root, "fixture", {
      exports: {
        ".": "./dist/index.js",
        "./unused": "./dist/unused.js",
      },
    }, ["dist/index.js"]);

    expect(() => verifyRuntimeDependencyEntrypoints(root, ["fixture"], { scope: "root-only" })).not.toThrow();
  });

  it("throws a stable integrity error with package-relative diagnostics", () => {
    const root = makeRoot();
    writePackage(root, "broken", { main: "./dist/index.js" });

    try {
      verifyRuntimeDependencyEntrypoints(root, ["broken"], { scope: "all-exact" });
      throw new Error("expected verification to fail");
    } catch (error: any) {
      expect(error.code).toBe("HANA_DEPENDENCY_INTEGRITY");
      expect(error.message).toContain("broken");
      expect(error.message).toContain("./dist/index.js");
      expect(error.message).not.toContain(root);
    }
  });
});

describe("root runtime dependency verifier", () => {
  it("checks every production dependency and smoke imports Pi AI", async () => {
    const root = makeRoot();
    fs.writeFileSync(path.join(root, "package.json"), JSON.stringify({
      dependencies: { fixture: "1.0.0", "@earendil-works/pi-ai": "1.0.0" },
    }));
    writePackage(root, "fixture", { main: "./index.js" }, ["index.js"]);
    writePackage(root, "@earendil-works/pi-ai", { main: "./dist/index.js" }, ["dist/index.js"]);
    const importPackage = vi.fn(async () => ({}));

    await expect(verifyRootRuntimeDependencies(root, { importPackage })).resolves.toEqual({
      ok: true,
      checkedPackages: 2,
    });
    expect(importPackage).toHaveBeenCalledWith("@earendil-works/pi-ai");
  });

  it("blocks a direct launcher invocation before spawning the server", () => {
    const root = makeRoot();
    fs.writeFileSync(path.join(root, "package.json"), JSON.stringify({ dependencies: { broken: "1.0.0" } }));
    writePackage(root, "broken", { main: "./missing.js" });
    const launcher = path.resolve("scripts/launch.js");

    const result = spawnSync(process.execPath, [launcher, "server"], {
      cwd: root,
      encoding: "utf8",
      env: { ...process.env, ELECTRON_RUN_AS_NODE: "1" },
    });
    const output = `${result.stdout}${result.stderr}`;

    expect(result.status).toBe(1);
    expect(output).toContain("HANA_DEPENDENCY_INTEGRITY");
    expect(output).toContain("volta run npm ci");
    expect(output).not.toContain("server/main-full.ts");
  });

  it("adds the Volta recovery command without mutating an incomplete install", async () => {
    const root = makeRoot();
    fs.writeFileSync(path.join(root, "package.json"), JSON.stringify({ dependencies: { broken: "1.0.0" } }));
    writePackage(root, "broken", { main: "./missing.js" });

    await expect(verifyRootRuntimeDependencies(root, { importPackage: vi.fn() })).rejects.toMatchObject({
      code: "HANA_DEPENDENCY_INTEGRITY",
      message: expect.stringContaining("volta run npm ci"),
    });
  });

  it("redacts absolute paths from Pi smoke import failures", async () => {
    const root = makeRoot();
    fs.writeFileSync(path.join(root, "package.json"), JSON.stringify({ dependencies: {} }));
    const importFailure = new Error(`Cannot find module '${path.join(root, "node_modules", "typebox", "build", "index.mjs")}'`);
    Object.assign(importFailure, { code: "ERR_MODULE_NOT_FOUND" });

    try {
      await verifyRootRuntimeDependencies(root, {
        importPackage: async () => { throw importFailure; },
      });
      throw new Error("expected smoke import to fail");
    } catch (error: any) {
      expect(error.code).toBe("HANA_DEPENDENCY_INTEGRITY");
      expect(error.message).toContain("@earendil-works/pi-ai");
      expect(error.message).toContain("volta run npm ci");
      expect(error.message).not.toContain(root);
    }
  });
});
