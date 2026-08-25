import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { assertRuntimeComplete } from "../../mingit-runtime.js";

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function waitFor(predicate, timeoutMs, label) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (predicate()) return;
    await sleep(25);
  }
  throw new Error(`[windows-gate] timeout waiting for ${label}`);
}

function isWithin(root, candidate) {
  const relative = path.relative(root, candidate);
  return relative === ""
    || (!relative.startsWith(`..${path.sep}`) && relative !== ".." && !path.isAbsolute(relative));
}

function assertFile(target, label) {
  let stat;
  try {
    stat = fs.statSync(target);
  } catch {
    throw new Error(`[windows-gate] required ${label} is missing`);
  }
  if (!stat.isFile()) throw new Error(`[windows-gate] required ${label} is not a file`);
}

function assertDirectory(target, label) {
  let stat;
  try {
    stat = fs.statSync(target);
  } catch {
    throw new Error(`[windows-gate] required ${label} directory is missing`);
  }
  if (!stat.isDirectory()) throw new Error(`[windows-gate] required ${label} is not a directory`);
}

function assertPortableExecutable(target, label) {
  const descriptor = fs.openSync(target, "r");
  try {
    const dosHeader = Buffer.alloc(64);
    const dosBytes = fs.readSync(descriptor, dosHeader, 0, dosHeader.length, 0);
    if (dosBytes < dosHeader.length || dosHeader.toString("ascii", 0, 2) !== "MZ") {
      throw new Error(`[windows-gate] required ${label} is not a PE executable`);
    }
    const peOffset = dosHeader.readUInt32LE(0x3c);
    const peSignature = Buffer.alloc(4);
    const peBytes = fs.readSync(descriptor, peSignature, 0, peSignature.length, peOffset);
    if (peBytes < peSignature.length || peSignature.toString("ascii") !== "PE\u0000\u0000") {
      throw new Error(`[windows-gate] required ${label} is not a PE executable`);
    }
  } finally {
    fs.closeSync(descriptor);
  }
}

function identityOf(target) {
  const stat = fs.statSync(target);
  const identity = {
    dev: String(stat.dev ?? ""),
    ino: String(stat.ino ?? ""),
    birthtimeMs: Number(stat.birthtimeMs),
  };
  if (
    !identity.dev
    || !identity.ino
    || identity.dev === "0"
    || identity.ino === "0"
    || !Number.isFinite(identity.birthtimeMs)
    || identity.birthtimeMs <= 0
  ) {
    throw new Error("[windows-gate] filesystem identity fields are unavailable on this Windows volume");
  }
  return identity;
}

function sameIdentity(left, right) {
  return left.dev === right.dev
    && left.ino === right.ino
    && left.birthtimeMs === right.birthtimeMs;
}

function assertSupportedArch(arch) {
  if (arch !== "x64" && arch !== "arm64") {
    throw new Error(`[windows-gate] unsupported Windows architecture ${JSON.stringify(arch)}`);
  }
}

function listArchiveEntries(archivePath) {
  const tar = process.platform === "win32" ? "tar.exe" : "tar";
  return execFileSync(tar, ["-tzf", archivePath], {
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
    windowsHide: true,
  }).split(/\r?\n/).filter(Boolean);
}

/**
 * Inspect an electron-builder `win-unpacked` directory without launching it.
 * The archive lister is injectable so this contract remains testable on hosts
 * that cannot execute Windows binaries; the blocking runner itself stays win32-only.
 */
export function inspectWindowsPackage(
  packageDir,
  { arch = "x64", archiveLister = listArchiveEntries } = {},
) {
  if (!packageDir) throw new Error("[windows-gate] package directory is required");
  assertSupportedArch(arch);
  const packageRoot = path.resolve(packageDir);
  assertDirectory(packageRoot, "unpacked package");
  const executablePath = path.join(packageRoot, "HanaKDE.exe");
  assertFile(executablePath, "HanaKDE.exe");
  assertPortableExecutable(executablePath, "HanaKDE.exe");

  const resources = path.join(packageRoot, "resources");
  const seed = path.join(resources, "seed");
  assertFile(path.join(resources, "app.asar"), "resources/app.asar");
  assertDirectory(seed, "resources/seed");
  const gitRuntime = path.join(resources, "git");
  assertDirectory(gitRuntime, "resources/git");
  try {
    assertRuntimeComplete(gitRuntime);
  } catch {
    throw new Error("[windows-gate] packaged MinGit runtime is incomplete");
  }
  const sandboxHelper = path.join(resources, "sandbox", "windows", "hana-win-sandbox.exe");
  assertFile(sandboxHelper, "resources/sandbox/windows/hana-win-sandbox.exe");
  assertPortableExecutable(sandboxHelper, "resources/sandbox/windows/hana-win-sandbox.exe");

  const entries = fs.readdirSync(seed, { withFileTypes: true });
  const serverArchives = entries
    .filter((entry) => entry.isFile() && new RegExp(`^server-.+-win32-${arch}\\.tar\\.gz$`).test(entry.name))
    .map((entry) => entry.name);
  const rendererArchives = entries
    .filter((entry) => entry.isFile() && /^renderer-.+\.tar\.gz$/.test(entry.name))
    .map((entry) => entry.name);
  const manifests = entries
    .filter((entry) => entry.isFile() && entry.name === `seed-train-win32-${arch}.json`)
    .map((entry) => entry.name);
  const signatures = entries
    .filter((entry) => entry.isFile() && entry.name === `seed-train-win32-${arch}.json.sig`)
    .map((entry) => entry.name);
  if (serverArchives.length !== 1 || rendererArchives.length !== 1 || manifests.length !== 1 || signatures.length !== 1) {
    throw new Error("[windows-gate] seed must contain exactly one Windows server archive, renderer archive, manifest, and signature");
  }

  const archiveEntries = archiveLister(path.join(seed, serverArchives[0]));
  const requiredEntries = [
    "bundle/index.js",
    "bundle/anydoc-child.cjs",
    "bundle/html-child.ts",
    `dist-secure-fs/win-${arch}/hana-secure-fs-helper.exe`,
  ];
  for (const required of requiredEntries) {
    if (!archiveEntries.some((entry) => entry === required || entry.endsWith(`/${required}`))) {
      throw new Error(`[windows-gate] server archive is missing ${required}`);
    }
  }

  return {
    packageRoot: path.basename(packageRoot),
    executable: "HanaKDE.exe",
    serverArchive: serverArchives[0],
    rendererArchive: rendererArchives[0],
    manifest: manifests[0],
    signature: signatures[0],
    minGitRuntime: "resources/git",
    sandboxHelper: "resources/sandbox/windows/hana-win-sandbox.exe",
    secureHelper: `dist-secure-fs/win-${arch}/hana-secure-fs-helper.exe`,
  };
}

export function inspectWindowsInstaller(installerPath) {
  if (!installerPath) throw new Error("[windows-gate] installer path is required");
  assertFile(installerPath, "NSIS installer");
  if (path.extname(installerPath).toLowerCase() !== ".exe") {
    throw new Error("[windows-gate] NSIS installer must be an .exe");
  }
  assertPortableExecutable(installerPath, "NSIS installer");
  return { installer: path.basename(installerPath), peHeaderVerified: true };
}

async function runLockedFileProbe(workspace) {
  const lockPath = path.join(workspace, "locked-file.txt");
  const readyPath = path.join(workspace, "locked-file.ready");
  const scriptPath = path.join(workspace, "lock-file-probe.ps1");
  const renamedPath = path.join(workspace, "locked-file-renamed.txt");
  fs.writeFileSync(lockPath, "locked", "utf8");
  fs.writeFileSync(scriptPath, [
    "$path = $args[0]",
    "$ready = $args[1]",
    "$stream = [System.IO.File]::Open($path, [System.IO.FileMode]::Open, [System.IO.FileAccess]::ReadWrite, [System.IO.FileShare]::None)",
    "[System.IO.File]::WriteAllText($ready, 'ready')",
    "Start-Sleep -Seconds 30",
    "$stream.Dispose()",
  ].join("\r\n") + "\r\n", "utf8");

  const child = spawn("powershell.exe", [
    "-NoLogo",
    "-NoProfile",
    "-NonInteractive",
    "-ExecutionPolicy",
    "Bypass",
    "-File",
    scriptPath,
    lockPath,
    readyPath,
  ], { stdio: "ignore", windowsHide: true });
  let childError = null;
  let childExited = false;
  child.once("error", (error) => { childError = error; });
  child.once("exit", () => { childExited = true; });
  try {
    await waitFor(
      () => fs.existsSync(readyPath) || childError || childExited,
      5000,
      "PowerShell locked-file probe readiness",
    );
    if (childError || childExited) {
      throw new Error("[windows-gate] PowerShell locked-file probe could not acquire a native lock");
    }
    let denied = false;
    try {
      fs.renameSync(lockPath, renamedPath);
    } catch (error) {
      denied = ["EACCES", "EBUSY", "EPERM"].includes(error?.code);
    }
    if (!denied) throw new Error("[windows-gate] locked-file rename unexpectedly succeeded");
    return { lockedRenameDenied: true };
  } finally {
    if (!childExited) child.kill();
    if (!childExited) {
      await new Promise((resolve) => {
        const timer = setTimeout(resolve, 2000);
        child.once("exit", () => {
          clearTimeout(timer);
          resolve();
        });
      });
    }
    for (const target of [lockPath, readyPath, scriptPath, renamedPath]) fs.rmSync(target, { force: true });
  }
}

async function runFilesystemMatrix(fixtureRoot) {
  const workspace = path.join(fixtureRoot, "main");
  const outside = path.join(fixtureRoot, "outside");
  fs.mkdirSync(workspace, { recursive: true });
  fs.mkdirSync(outside, { recursive: true });

  const caseProbe = path.join(workspace, "CaseProbe.txt");
  fs.writeFileSync(caseProbe, "case", "utf8");
  if (!fs.existsSync(path.join(workspace, "caseprobe.txt"))) {
    throw new Error("[windows-gate] fixture volume is case-sensitive; Windows case-insensitive contract is unverified");
  }

  const outsideFile = path.join(outside, "secret.txt");
  fs.writeFileSync(outsideFile, "outside", "utf8");
  const junction = path.join(workspace, "junction-outside");
  try {
    fs.symlinkSync(outside, junction, "junction");
  } catch (error) {
    throw new Error(
      `[windows-gate] could not create a Windows junction; blocking security row is unverified (${error?.code || "unknown"})`,
    );
  }
  const junctionRealPath = fs.realpathSync(path.join(junction, "secret.txt"));
  if (isWithin(workspace, junctionRealPath)) {
    throw new Error("[windows-gate] junction fixture did not escape the workspace root");
  }
  if (fs.readFileSync(outsideFile, "utf8") !== "outside") {
    throw new Error("[windows-gate] junction fixture changed outside content");
  }

  const events = [];
  let watcher;
  let renameBurstObserved = false;
  let tempSaveObserved = false;
  let recursiveEvents = 0;
  try {
    watcher = fs.watch(workspace, { recursive: true }, (_eventType, filename) => {
      if (filename) events.push(String(filename));
    });
    const nested = path.join(workspace, "Nested");
    fs.mkdirSync(nested);
    const burstTarget = path.join(nested, "rename-burst.md");
    const tempSaveTarget = path.join(nested, "temp-save.md");
    for (let index = 0; index < 8; index += 1) {
      const temp = path.join(nested, `rename-burst-${index}.tmp`);
      fs.writeFileSync(temp, `burst-${index}`, "utf8");
      fs.renameSync(temp, burstTarget);
    }
    const tempSave = path.join(nested, "temp-save.tmp");
    fs.writeFileSync(tempSave, "saved", "utf8");
    fs.renameSync(tempSave, tempSaveTarget);
    await waitFor(
      () => events.some((entry) => entry.toLowerCase().includes("temp-save.md")),
      5000,
      "recursive watcher temp-save event",
    );
    renameBurstObserved = events.some((entry) => entry.toLowerCase().includes("rename-burst.md"));
    if (!renameBurstObserved) throw new Error("[windows-gate] rename burst produced no target event");
    tempSaveObserved = true;
    recursiveEvents = events.length;
  } finally {
    watcher?.close();
  }

  const originalIdentity = identityOf(workspace);
  const movedRoot = `${workspace}.replaced`;
  fs.renameSync(workspace, movedRoot);
  fs.mkdirSync(workspace);
  const replacementIdentity = identityOf(workspace);
  if (sameIdentity(originalIdentity, replacementIdentity)) {
    throw new Error("[windows-gate] root replacement did not change filesystem identity");
  }
  if (fs.readFileSync(outsideFile, "utf8") !== "outside") {
    throw new Error("[windows-gate] root replacement changed outside content");
  }

  const locked = await runLockedFileProbe(workspace);
  fs.unlinkSync(path.join(movedRoot, "junction-outside"));
  fs.rmSync(movedRoot, { recursive: true, force: true });
  return {
    caseInsensitive: true,
    junctionEscapeDetected: true,
    rootReplacementIdentityChanged: true,
    lockedRenameDenied: locked.lockedRenameDenied,
    renameBurstObserved,
    tempSaveObserved,
    recursiveEvents,
    watcherClosed: true,
    outsideUntouched: true,
  };
}

function cleanupFixtureRoot(fixtureRoot) {
  for (const relative of ["main/junction-outside", "main.replaced/junction-outside"]) {
    const junction = path.join(fixtureRoot, ...relative.split("/"));
    try {
      if (fs.lstatSync(junction).isSymbolicLink()) fs.unlinkSync(junction);
    } catch {
      // The fixture may have failed before the junction was created.
    }
  }
  fs.rmSync(fixtureRoot, { recursive: true, force: true });
}

export async function runWindowsGate({
  rootDir,
  packageDir = null,
  installerPath = null,
  arch = "x64",
  cleanup = true,
} = {}) {
  if (process.platform !== "win32") {
    throw new Error(`[windows-gate] blocking gate requires win32, got ${process.platform}`);
  }
  assertSupportedArch(arch);
  const fixtureRoot = rootDir ?? fs.mkdtempSync(path.join(os.tmpdir(), "hana-t22-windows-"));
  try {
    const fixture = await runFilesystemMatrix(fixtureRoot);
    const packageResult = packageDir ? inspectWindowsPackage(packageDir, { arch }) : null;
    const installerResult = installerPath ? inspectWindowsInstaller(installerPath) : null;
    return {
      platform: process.platform,
      arch: process.arch,
      fixture,
      package: packageResult,
      installer: installerResult,
    };
  } finally {
    if (cleanup) cleanupFixtureRoot(fixtureRoot);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const optionValue = (name) => {
    const index = process.argv.indexOf(name);
    if (index < 0) return null;
    const value = process.argv[index + 1];
    if (!value || value.startsWith("--")) throw new Error(`[windows-gate] ${name} requires a value`);
    return value;
  };
  const packageDir = optionValue("--package");
  const installerPath = optionValue("--installer");
  const arch = optionValue("--arch") || "x64";
  runWindowsGate({ packageDir, installerPath, arch }).then((result) => {
    process.stdout.write(`${JSON.stringify(result)}\n`);
  }).catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
