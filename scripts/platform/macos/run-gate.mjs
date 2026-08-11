import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { execFileSync } from "node:child_process";

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function waitFor(predicate, timeoutMs, label) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (predicate()) return;
    await sleep(20);
  }
  throw new Error(`[macos-gate] timeout waiting for ${label}`);
}

function isWithin(root, candidate) {
  const relative = path.relative(root, candidate);
  return relative === "" || (!relative.startsWith(`..${path.sep}`) && relative !== ".." && !path.isAbsolute(relative));
}

function findAppBundle(packageDir) {
  const candidates = [];
  const visit = (directory, depth = 0) => {
    if (depth > 4 || !fs.existsSync(directory)) return;
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const candidate = path.join(directory, entry.name);
      if (entry.isDirectory() && entry.name.endsWith(".app")) candidates.push(candidate);
      else if (entry.isDirectory()) visit(candidate, depth + 1);
    }
  };
  visit(packageDir);
  if (candidates.length !== 1) {
    throw new Error(`[macos-gate] expected exactly one app bundle under package output, found ${candidates.length}`);
  }
  return candidates[0];
}

function inspectAppBundle(packageDir) {
  const app = findAppBundle(packageDir);
  const resources = path.join(app, "Contents", "Resources");
  const executable = path.join(app, "Contents", "MacOS", "HanaAgent");
  const asar = path.join(resources, "app.asar");
  const seed = path.join(resources, "seed");
  const required = [asar, seed, executable];
  for (const target of required) {
    if (!fs.existsSync(target)) throw new Error(`[macos-gate] app bundle is missing ${path.basename(target)}`);
  }
  const serverArchive = fs.readdirSync(seed).find((name) => /^server-.*\.tar\.gz$/.test(name));
  const rendererArchive = fs.readdirSync(seed).find((name) => /^renderer-.*\.tar\.gz$/.test(name));
  const manifest = fs.readdirSync(seed).find((name) => /^seed-train-.*\.json$/.test(name));
  const signature = fs.readdirSync(seed).find((name) => /^seed-train-.*\.json\.sig$/.test(name));
  if (!serverArchive || !rendererArchive || !manifest || !signature) {
    throw new Error("[macos-gate] app seed is missing server/renderer archive or signed manifest");
  }
  const serverArchivePath = path.join(seed, serverArchive);
  const archiveEntries = execFileSync("tar", ["-tzf", serverArchivePath], {
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  }).split("\n");
  const requiredEntries = [
    "bundle/index.js",
    "bundle/anydoc-child.cjs",
    "bundle/html-child.ts",
    `dist-secure-fs/mac-${process.arch}/hana-secure-fs-helper`,
  ];
  for (const entry of requiredEntries) {
    if (!archiveEntries.some((candidate) => candidate === entry || candidate.endsWith(`/${entry}`))) {
      throw new Error(`[macos-gate] server seed is missing ${entry}`);
    }
  }
  return {
    appBundle: path.basename(app),
    hasAsar: true,
    hasServer: true,
    hasExecutable: true,
    hasSecureHelper: true,
  };
}

export async function runMacosGate({ rootDir, packageDir = null, cleanup = true } = {}) {
  if (process.platform !== "darwin") {
    throw new Error(`[macos-gate] blocking gate requires darwin, got ${process.platform}`);
  }

  const fixtureRoot = rootDir ?? fs.mkdtempSync(path.join(os.tmpdir(), "hana-t23-macos-"));
  const workspace = path.join(fixtureRoot, "main");
  const outside = path.join(fixtureRoot, "outside");
  fs.mkdirSync(workspace, { recursive: true });
  fs.mkdirSync(outside, { recursive: true });

  try {
    const caseProbe = path.join(workspace, "CaseProbe.txt");
    fs.writeFileSync(caseProbe, "case");
    if (!fs.existsSync(path.join(workspace, "caseprobe.txt"))) {
      throw new Error("[macos-gate] fixture volume is case-sensitive; the case-insensitive root contract cannot be verified");
    }

    const outsideFile = path.join(outside, "secret.txt");
    fs.writeFileSync(outsideFile, "outside");
    const link = path.join(workspace, "linked-outside");
    fs.symlinkSync(outside, link, "dir");
    const linkedRealPath = fs.realpathSync(path.join(link, "secret.txt"));
    if (isWithin(workspace, linkedRealPath)) {
      throw new Error("[macos-gate] symlink fixture did not escape the workspace root");
    }
    if (fs.readFileSync(outsideFile, "utf8") !== "outside") {
      throw new Error("[macos-gate] symlink fixture changed outside content");
    }

    const events = [];
    const watcher = fs.watch(workspace, { recursive: true }, (_eventType, filename) => {
      if (filename) events.push(String(filename));
    });
    const nested = path.join(workspace, "Nested");
    fs.mkdirSync(nested);
    const watchedFile = path.join(nested, "rapid.md");
    for (let index = 0; index < 8; index += 1) fs.writeFileSync(watchedFile, `rapid-${index}`);
    const atomicTemp = path.join(nested, "atomic.tmp");
    const atomicTarget = path.join(nested, "atomic.md");
    fs.writeFileSync(atomicTemp, "atomic-1");
    fs.renameSync(atomicTemp, atomicTarget);
    fs.writeFileSync(atomicTemp, "atomic-2");
    fs.renameSync(atomicTemp, atomicTarget);
    await waitFor(() => events.length > 0, 1500, "recursive watcher event");
    watcher.close();

    const originalRoot = fs.statSync(workspace);
    const movedRoot = `${workspace}.replaced`;
    fs.renameSync(workspace, movedRoot);
    fs.mkdirSync(workspace);
    const replacementRoot = fs.statSync(workspace);
    if (originalRoot.dev === replacementRoot.dev && originalRoot.ino === replacementRoot.ino) {
      throw new Error("[macos-gate] root replacement did not change the filesystem identity");
    }
    if (fs.readFileSync(outsideFile, "utf8") !== "outside") {
      throw new Error("[macos-gate] root replacement changed outside content");
    }

    const resumeMarker = path.join(fixtureRoot, "resume-marker");
    const child = spawn(process.execPath, ["-e", `
      const fs = require('node:fs');
      const marker = process.argv[1];
      fs.writeFileSync(marker, 'ready');
      process.on('SIGCONT', () => fs.appendFileSync(marker, '|continued'));
      setInterval(() => {}, 1000);
    `, resumeMarker], { stdio: "ignore" });
    try {
      await waitFor(() => fs.existsSync(resumeMarker), 1500, "resume probe readiness");
      child.kill("SIGSTOP");
      await sleep(100);
      if (fs.readFileSync(resumeMarker, "utf8") !== "ready") throw new Error("[macos-gate] stopped process advanced while suspended");
      child.kill("SIGCONT");
      await waitFor(() => fs.readFileSync(resumeMarker, "utf8") === "ready|continued", 1500, "resume probe continuation");
    } finally {
      child.kill("SIGTERM");
      await new Promise((resolve) => child.once("exit", resolve));
    }

    return {
      platform: process.platform,
      arch: process.arch,
      fixture: {
        caseInsensitive: true,
        recursiveEvents: events.length,
        atomicReplaceObserved: events.length > 0,
        rootReplacementIdentityChanged: true,
        symlinkEscapeDetected: true,
        suspendResumeObserved: true,
      },
      package: packageDir ? inspectAppBundle(packageDir) : null,
    };
  } finally {
    if (cleanup) fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const packageIndex = process.argv.indexOf("--package");
  const packageDir = packageIndex >= 0 ? process.argv[packageIndex + 1] : null;
  runMacosGate({ packageDir }).then((result) => {
    process.stdout.write(`${JSON.stringify(result)}\n`);
  }).catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
