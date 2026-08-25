import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";

const require = createRequire(import.meta.url);

export function inspectElectronRuntime(packageDirectory) {
  const pathFile = path.join(packageDirectory, "path.txt");
  if (!fs.existsSync(pathFile)) {
    return { ready: false, reason: `missing ${pathFile}` };
  }

  const relativeExecutable = fs.readFileSync(pathFile, "utf8").trim();
  if (!relativeExecutable) {
    return { ready: false, reason: `empty ${pathFile}` };
  }

  const executable = path.join(packageDirectory, "dist", relativeExecutable);
  if (!fs.existsSync(executable)) {
    return { ready: false, reason: `missing ${executable}` };
  }

  const versionFile = path.join(packageDirectory, "dist", "version");
  if (!fs.existsSync(versionFile)) {
    return { ready: false, reason: `missing ${versionFile}` };
  }

  return { ready: true, executable };
}

export function resolveElectronPackageDirectory() {
  try {
    return path.dirname(require.resolve("electron/package.json"));
  } catch {
    return null;
  }
}

function platformExecutable(platform) {
  if (platform === "darwin" || platform === "mas") return "Electron.app/Contents/MacOS/Electron";
  if (platform === "win32") return "electron.exe";
  if (["linux", "freebsd", "openbsd"].includes(platform)) return "electron";
  throw new Error(`Electron builds are not available for platform ${platform}.`);
}

export function electronArchiveExtractionCommand(platform, archivePath, destination) {
  if (platform === "darwin") {
    return { command: "/usr/bin/ditto", args: ["-x", "-k", archivePath, destination] };
  }
  if (platform === "win32") {
    return { command: "tar.exe", args: ["-xf", archivePath, "-C", destination] };
  }
  return { command: "unzip", args: ["-q", archivePath, "-d", destination] };
}

function extractElectronArchive(platform, archivePath, destination) {
  fs.mkdirSync(destination, { recursive: true });
  const extraction = electronArchiveExtractionCommand(platform, archivePath, destination);
  const result = spawnSync(extraction.command, extraction.args, { encoding: "utf8" });
  if (result.status !== 0) {
    const detail = (result.stderr || result.stdout || `status ${String(result.status)}`).trim();
    throw new Error(`Electron archive extraction failed: ${detail}`);
  }
}

async function installElectronRuntime(packageDirectory) {
  const packageRequire = createRequire(path.join(packageDirectory, "package.json"));
  const { downloadArtifact } = packageRequire("@electron/get");
  const electronPackage = packageRequire(path.join(packageDirectory, "package.json"));
  const platform = process.env.ELECTRON_INSTALL_PLATFORM || process.env.npm_config_platform || process.platform;
  const arch = process.env.ELECTRON_INSTALL_ARCH || process.env.npm_config_arch || process.arch;
  const relativeExecutable = platformExecutable(platform);
  const archivePath = await downloadArtifact({
    version: electronPackage.version,
    artifactName: "electron",
    platform,
    arch,
    checksums: packageRequire(path.join(packageDirectory, "checksums.json")),
  });

  const stagingDirectory = path.join(packageDirectory, `.dist-install-${process.pid}-${randomUUID()}`);
  try {
    extractElectronArchive(platform, archivePath, stagingDirectory);
    const stagedExecutable = path.join(stagingDirectory, relativeExecutable);
    const stagedVersion = path.join(stagingDirectory, "version");
    if (!fs.existsSync(stagedExecutable) || !fs.existsSync(stagedVersion)) {
      throw new Error("downloaded Electron archive did not contain a complete runtime");
    }

    const distDirectory = path.join(packageDirectory, "dist");
    fs.rmSync(distDirectory, { recursive: true, force: true });
    fs.renameSync(stagingDirectory, distDirectory);
    const pathFile = path.join(packageDirectory, "path.txt");
    const temporaryPathFile = `${pathFile}.${process.pid}.tmp`;
    fs.writeFileSync(temporaryPathFile, relativeExecutable, "utf8");
    fs.renameSync(temporaryPathFile, pathFile);
  } finally {
    fs.rmSync(stagingDirectory, { recursive: true, force: true });
  }
}

export async function ensureElectronRuntime({ install = false } = {}) {
  const packageDirectory = resolveElectronPackageDirectory();
  if (!packageDirectory) {
    throw new Error("Electron is not installed. Run `volta run npm ci` from the repository root.");
  }

  let inspection = inspectElectronRuntime(packageDirectory);
  if (!inspection.ready && install) {
    console.log(`[electron-runtime] repairing incomplete runtime: ${inspection.reason}`);
    await installElectronRuntime(packageDirectory);
    inspection = inspectElectronRuntime(packageDirectory);
  }

  if (!inspection.ready) {
    throw new Error(
      `Electron runtime is incomplete (${inspection.reason}). ` +
        "Run `volta run npm ci`; if the error remains, remove only `node_modules/electron` and rerun the command."
    );
  }

  console.log(`[electron-runtime] ready: ${inspection.executable}`);
  return inspection;
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : null;
if (invokedPath === fileURLToPath(import.meta.url)) {
  await ensureElectronRuntime({ install: process.argv.includes("--install") });
}
