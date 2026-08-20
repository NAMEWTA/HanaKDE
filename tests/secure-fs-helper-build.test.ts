import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildSecureFsCompileCommand,
  buildSecureFsHelper,
  secureFsHelperOutputDir,
  shouldBuildSecureFsHelper,
} from "../scripts/build-secure-fs-helper.mjs";
import { LocalFsProvider } from "../lib/resource-io/providers/local-fs-provider.ts";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

describe("HanaSecureFsHelper build and native boundary", () => {
  const temporaryRoots: string[] = [];

  afterEach(() => {
    vi.unstubAllEnvs();
    for (const root of temporaryRoots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
  });

  it("keeps unsupported Linux explicit instead of substituting ctime for birthtime", () => {
    expect(shouldBuildSecureFsHelper({ platform: "linux" })).toBe(false);
    expect(shouldBuildSecureFsHelper({ platform: "darwin" })).toBe(true);
    expect(shouldBuildSecureFsHelper({ platform: "win32" })).toBe(true);
  });

  it("defines a real Win32 handle-relative implementation and strict compiler flags", () => {
    const source = fs.readFileSync(
      path.join(ROOT, "desktop", "native", "HanaSecureFsHelper", "main.cpp"),
      "utf8",
    );
    const windowsSection = source.split("#else", 1)[0] || source;
    expect(windowsSection).toContain("NtCreateFile");
    expect(windowsSection).toContain("FILE_OPEN_REPARSE_POINT");
    expect(windowsSection).toContain("GetFileInformationByHandle");
    expect(windowsSection).toContain("GetFinalPathNameByHandleW");
    expect(windowsSection).toContain("_setmode(_fileno(stdin), _O_BINARY)");
    expect(windowsSection).toContain("ERROR_BROKEN_PIPE");
    expect(windowsSection).not.toContain("int main() {\n  return 1;");

    const command = buildSecureFsCompileCommand({
      source: "C:\\repo\\desktop\\native\\HanaSecureFsHelper\\main.cpp",
      output: "C:\\repo\\dist-secure-fs\\win-x64\\hana-secure-fs-helper.exe",
    });
    expect(command).toContain("/std:c++17");
    expect(command).toContain("/W4");
    expect(command).toContain("/WX");
  });

  it("builds the host helper and rejects a root swap before any native write", async () => {
    if (!shouldBuildSecureFsHelper({ platform: process.platform })) {
      expect(process.platform).toBe("linux");
      return;
    }

    const outputRoot = fs.mkdtempSync(path.join(os.tmpdir(), "hana-secure-helper-build-"));
    const workspace = fs.mkdtempSync(path.join(os.tmpdir(), "hana-secure-helper-workspace-"));
    temporaryRoots.push(outputRoot, workspace);
    const target = path.join(workspace, "notes", "a.md");
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, "before", "utf8");
    const originalVersion = fs.statSync(target);
    const built = buildSecureFsHelper({ rootDir: ROOT, outputRoot, platform: process.platform, arch: process.arch });
    expect(built.skipped).toBe(false);
    expect(fs.existsSync(built.target)).toBe(true);
    expect(built.target).toBe(path.join(
      secureFsHelperOutputDir({ rootDir: ROOT, outputRoot, platform: process.platform, arch: process.arch }),
      process.platform === "win32" ? "hana-secure-fs-helper.exe" : "hana-secure-fs-helper",
    ));
    const malformed = spawnSync(built.target, [], {
      input: Buffer.from([0, 0, 0, 0]),
      encoding: null,
    });
    expect(malformed.status).not.toBe(0);
    expect(malformed.stdout).toHaveLength(0);

    const provider = new LocalFsProvider({ cwd: workspace });
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("HANA_SECURE_FS_HELPER_PATH", built.target);
    const written = await provider.writeExpectedVersion(
      { kind: "local-file", path: target },
      "after",
      { mtimeMs: originalVersion.mtime.getTime(), size: originalVersion.size },
    );
    expect(written).toMatchObject({ changeType: "modified" });
    expect(fs.readFileSync(target, "utf8")).toBe("after");

    const createdTarget = path.join(workspace, "notes", "created.md");
    const created = await provider.writeExpectedVersion(
      { kind: "local-file", path: createdTarget },
      "created",
      null,
    );
    expect(created).toMatchObject({ changeType: "created" });
    expect(fs.readFileSync(createdTarget, "utf8")).toBe("created");

    const stale = await provider.writeExpectedVersion(
      { kind: "local-file", path: target },
      "must-not-apply",
      { mtimeMs: originalVersion.mtime.getTime(), size: originalVersion.size },
    );
    expect(stale).toMatchObject({ ok: false, conflict: true });
    expect(fs.readFileSync(target, "utf8")).toBe("after");

    fs.writeFileSync(target, "before", "utf8");
    const staleVersion = fs.statSync(target);
    const displaced = `${workspace}-displaced`;
    const wrapper = path.join(outputRoot, "swap-wrapper.cjs");
    fs.writeFileSync(wrapper, `
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const chunks = [];
process.stdin.on("data", (chunk) => chunks.push(chunk));
process.stdin.on("end", () => {
  const root = process.env.HANA_SECURE_SWAP_ROOT;
  const displaced = process.env.HANA_SECURE_SWAP_DISPLACED;
  fs.renameSync(root, displaced);
  fs.mkdirSync(path.join(root, "notes"), { recursive: true });
  const replacement = path.join(root, "notes", "a.md");
  fs.writeFileSync(replacement, "before", "utf8");
  const time = new Date(Number(process.env.HANA_SECURE_SWAP_MTIME));
  fs.utimesSync(replacement, time, time);
  const result = spawnSync(process.env.HANA_SECURE_REAL_HELPER, [], {
    input: Buffer.concat(chunks),
    stdio: ["pipe", "pipe", "pipe"],
  });
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  process.exit(result.status ?? 1);
});
`, "utf8");
    vi.stubEnv("HANA_SECURE_FS_HELPER_PATH", wrapper);
    vi.stubEnv("HANA_SECURE_SWAP_ROOT", workspace);
    vi.stubEnv("HANA_SECURE_SWAP_DISPLACED", displaced);
    vi.stubEnv("HANA_SECURE_SWAP_MTIME", String(staleVersion.mtime.getTime()));
    vi.stubEnv("HANA_SECURE_REAL_HELPER", built.target);
    const rejected = await provider.writeExpectedVersion(
      { kind: "local-file", path: path.join(workspace, "notes", "a.md") },
      "restore",
      { mtimeMs: staleVersion.mtime.getTime(), size: staleVersion.size },
    );
    expect(rejected).toMatchObject({ ok: false, conflict: true });
    expect(fs.readFileSync(path.join(displaced, "notes", "a.md"), "utf8")).toBe("before");
    expect(fs.readFileSync(path.join(workspace, "notes", "a.md"), "utf8")).toBe("before");
  });
});
