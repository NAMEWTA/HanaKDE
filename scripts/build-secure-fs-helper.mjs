import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";

const scriptRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

export function secureFsHelperOutputDir({
  rootDir = scriptRoot,
  outputRoot = rootDir,
  platform = process.platform,
  arch = process.arch,
} = {}) {
  const osName = platform === "win32" ? "win" : platform === "darwin" ? "mac" : platform;
  return path.join(outputRoot, "dist-secure-fs", `${osName}-${arch}`);
}

export function shouldBuildSecureFsHelper({ platform = process.platform } = {}) {
  // Linux lacks a portable birthtime field matching Node's statx-backed
  // birthtimeNs contract in the minimum toolchain. It remains fail-closed
  // until a platform-specific backend is authorized.
  return platform === "darwin" || platform === "win32";
}

function quoteCommandArg(value) {
  return `"${String(value).replaceAll('"', '\\"')}"`;
}

export function buildSecureFsCompileCommand({ source, output } = {}) {
  if (!source) throw new Error("source is required");
  if (!output) throw new Error("output is required");
  return [
    "cl.exe",
    "/nologo",
    "/EHsc",
    "/std:c++17",
    "/W4",
    "/WX",
    "/O2",
    quoteCommandArg(source),
    "/link",
    `/OUT:${quoteCommandArg(output)}`,
  ].join(" ");
}

function darwinTargetArch(arch) {
  if (arch === "arm64") return "arm64";
  if (arch === "x64") return "x86_64";
  throw new Error(`[secure-fs-helper] unsupported macOS architecture: ${arch}`);
}

export function verifyDarwinSecureFsHelperArchitecture({ output, arch, execFile = execFileSync } = {}) {
  if (!output) throw new Error("output is required");
  const targetArch = darwinTargetArch(arch);
  try {
    execFile("lipo", [output, "-verify_arch", targetArch], { stdio: "ignore" });
  } catch (error) {
    throw new Error(
      `[secure-fs-helper] ${output} is not a ${targetArch} macOS binary; refusing to package it`,
      { cause: error },
    );
  }
}

function findVsDevCmd() {
  const programFilesX86 = process.env["ProgramFiles(x86)"] || "C:\\Program Files (x86)";
  const vswhere = path.join(programFilesX86, "Microsoft Visual Studio", "Installer", "vswhere.exe");
  if (!fs.existsSync(vswhere)) return null;
  try {
    const installationPath = execFileSync(vswhere, [
      "-latest",
      "-products", "*",
      "-requires", "Microsoft.VisualStudio.Component.VC.Tools.x86.x64",
      "-property", "installationPath",
    ], { encoding: "utf8", windowsHide: true }).trim();
    if (!installationPath) return null;
    const devCmd = path.join(installationPath, "Common7", "Tools", "VsDevCmd.bat");
    return fs.existsSync(devCmd) ? devCmd : null;
  } catch {
    return null;
  }
}

function buildWindows({ rootDir, arch, source, output }) {
  const outDir = path.dirname(output);
  fs.mkdirSync(outDir, { recursive: true });
  const command = buildSecureFsCompileCommand({ source, output });
  const devCmd = findVsDevCmd();
  const scriptPath = path.join(outDir, "build-secure-fs-helper.cmd");
  const lines = ["@echo off"];
  if (devCmd) {
    const msvcArch = arch === "arm64" ? "arm64" : "x64";
    lines.push(`call ${quoteCommandArg(devCmd)} -arch=${msvcArch}`);
    lines.push("if errorlevel 1 exit /b %errorlevel%");
  }
  lines.push(command);
  lines.push("exit /b %errorlevel%");
  fs.writeFileSync(scriptPath, `${lines.join("\r\n")}\r\n`, "utf8");
  execFileSync("cmd.exe", ["/d", "/c", scriptPath], {
    cwd: rootDir,
    stdio: "inherit",
    windowsHide: true,
  });
}

export function buildSecureFsHelper({
  rootDir = scriptRoot,
  outputRoot = rootDir,
  platform = process.platform,
  arch = process.arch,
  env = process.env,
} = {}) {
  if (!shouldBuildSecureFsHelper({ platform })) {
    console.log(`[secure-fs-helper] skipped on ${platform}`);
    return { skipped: true };
  }
  const source = path.join(rootDir, "desktop", "native", "HanaSecureFsHelper", "main.cpp");
  if (!fs.existsSync(source)) throw new Error(`[secure-fs-helper] source not found: ${source}`);
  const outDir = secureFsHelperOutputDir({ rootDir, outputRoot, platform, arch });
  fs.rmSync(outDir, { recursive: true, force: true });
  fs.mkdirSync(outDir, { recursive: true });
  const extension = platform === "win32" ? ".exe" : "";
  const output = path.join(outDir, `hana-secure-fs-helper${extension}`);
  if (platform === "win32") {
    buildWindows({ rootDir, arch, source, output });
  } else {
    const compiler = env.CXX || "clang++";
    const targetArch = darwinTargetArch(arch);
    execFileSync(compiler, [
      "-std=c++17",
      "-O2",
      "-Wall",
      "-Wextra",
      "-Werror",
      "-arch",
      targetArch,
      source,
      "-o",
      output,
    ], { cwd: rootDir, stdio: "inherit" });
    fs.chmodSync(output, 0o755);
    verifyDarwinSecureFsHelperArchitecture({ output, arch });
  }
  if (!fs.existsSync(output)) throw new Error(`[secure-fs-helper] build did not produce ${output}`);
  return { skipped: false, target: output };
}

/**
 * Copies the already-built helper into the server seed before signing/packing.
 * The helper is intentionally absent on unsupported platforms so ResourceIO
 * remains fail-closed there instead of silently shipping a host binary.
 */
export function copySecureFsHelperRuntime({
  rootDir = scriptRoot,
  outDir,
  platform = process.platform,
  arch = process.arch,
} = {}) {
  if (!outDir) throw new Error("outDir is required");
  if (!shouldBuildSecureFsHelper({ platform })) {
    console.log(`[secure-fs-helper] runtime copy skipped on ${platform}`);
    return { skipped: true };
  }
  const sourceDir = secureFsHelperOutputDir({ rootDir, outputRoot: rootDir, platform, arch });
  const extension = platform === "win32" ? ".exe" : "";
  const source = path.join(sourceDir, `hana-secure-fs-helper${extension}`);
  if (!fs.existsSync(source)) {
    throw new Error(`[secure-fs-helper] built helper missing; run build-secure-fs-helper first: ${source}`);
  }
  const targetDir = secureFsHelperOutputDir({ rootDir, outputRoot: outDir, platform, arch });
  fs.rmSync(targetDir, { recursive: true, force: true });
  fs.mkdirSync(path.dirname(targetDir), { recursive: true });
  fs.cpSync(sourceDir, targetDir, { recursive: true });
  const target = path.join(targetDir, path.basename(source));
  if (!fs.existsSync(target)) throw new Error(`[secure-fs-helper] runtime copy missing: ${target}`);
  if (platform !== "win32") fs.chmodSync(target, 0o755);
  console.log(`[secure-fs-helper] runtime helper staged at ${path.relative(outDir, target)}`);
  return { skipped: false, source, target };
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  try {
    buildSecureFsHelper({ arch: process.argv[2] || process.arch });
  } catch (error) {
    console.error(error?.stack || error?.message || String(error));
    process.exitCode = 1;
  }
}
