import fs from "fs";
import path from "path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { verifyRuntimeDependencyEntrypoints } = require("../shared/runtime-dependency-integrity.cjs");

/**
 * Read and JSON-parse a file, retrying on EMFILE/ENFILE (file handle exhaustion).
 *
 * Windows has no ulimit-equivalent, so nft trace can exhaust the OS handle quota.
 * EMFILE means "temporarily can't open" — the file exists and is valid. Treating
 * it the same as ENOENT is a contract bug: it maps an I/O resource error onto a
 * product-integrity failure, which is exactly the misdiagnosis that kills Windows builds.
 *
 * @param {string} filePath - Absolute path to the JSON file.
 * @param {{ maxRetries?: number, baseDelayMs?: number }} [opts]
 * @returns {unknown} Parsed JSON value.
 * @throws On ENOENT, JSON parse failure, or EMFILE after all retries.
 */
export function readPackageJsonWithRetry(filePath, { maxRetries = 5, baseDelayMs = 50 } = {}) {
  let lastErr;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return JSON.parse(fs.readFileSync(filePath, "utf-8"));
    } catch (err) {
      const code = err && err.code;
      // EMFILE = too many open file descriptors (Windows/macOS kernel limit hit).
      // ENFILE = system-wide file table full (rarer but same transient nature).
      // Both are recoverable: wait and retry. Do NOT treat as "file missing".
      if (code === "EMFILE" || code === "ENFILE") {
        lastErr = err;
        if (attempt < maxRetries) {
          // Synchronous exponential backoff — this is a build script, blocking is fine.
          // Atomics.wait on a fresh SharedArrayBuffer gives a true sync sleep without
          // spinning and without requiring a running event loop.
          const delayMs = baseDelayMs * Math.pow(2, attempt);
          Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, delayMs);
          continue;
        }
        // Exhausted retries: re-throw the original EMFILE so the caller knows why.
        throw lastErr;
      }
      // ENOENT = file truly absent. JSON SyntaxError = corrupt file.
      // All other errors: propagate as-is.
      throw err;
    }
  }
}

function getLockedPackageVersion(rootLock, packageName) {
  const packagePath = `node_modules/${packageName}`;
  const lockedPackage = rootLock?.packages?.[packagePath];
  if (!lockedPackage?.version) {
    throw new Error(`[build-server] package-lock.json does not contain ${packagePath}`);
  }
  return lockedPackage.version;
}

export function buildExternalPackage(
  rootPkg,
  externalDeps,
  { rootLock, pinnedTransitiveDeps = [] } = {},
) {
  const dependencies = {};

  for (const [packageName, requestedVersion] of Object.entries(externalDeps)) {
    dependencies[packageName] = rootLock
      ? getLockedPackageVersion(rootLock, packageName)
      : requestedVersion;
  }

  for (const packageName of pinnedTransitiveDeps) {
    dependencies[packageName] = getLockedPackageVersion(rootLock, packageName);
  }

  return {
    name: "hanako-server",
    version: rootPkg.version,
    type: "module",
    dependencies,
  };
}

function packageNameFromBareSpecifier(specifier) {
  if (
    typeof specifier !== "string"
    || specifier.length === 0
    || specifier.startsWith(".")
    || specifier.startsWith("/")
    || specifier.startsWith("node:")
  ) {
    return null;
  }

  const parts = specifier.split("/");
  if (specifier.startsWith("@")) {
    if (parts.length < 2) return null;
    return `${parts[0]}/${parts[1]}`;
  }
  return parts[0];
}

export function collectBareImportPackageNames(source) {
  const packages = new Set();
  const importPattern = /^\s*import\s+(?:[^'"\n]*?\s+from\s+)?["']([^"']+)["']/gm;
  let match;
  while ((match = importPattern.exec(source)) !== null) {
    const packageName = packageNameFromBareSpecifier(match[1]);
    if (packageName) packages.add(packageName);
  }
  return [...packages].sort();
}

export function collectInstalledOptionalDependencyDirs(nmDir, packageNames) {
  const dirs = [];

  for (const packageName of packageNames) {
    const packageJsonPath = path.join(nmDir, packageName, "package.json");
    let pkg;
    try {
      pkg = JSON.parse(fs.readFileSync(packageJsonPath, "utf-8"));
    } catch {
      continue;
    }

    for (const optionalName of Object.keys(pkg.optionalDependencies || {})) {
      const optionalDir = path.join(nmDir, optionalName);
      if (fs.existsSync(optionalDir)) {
        dirs.push(path.resolve(optionalDir));
      }
    }
  }

  return dirs;
}

export function buildJiebaRuntimeSmokeScript() {
  return [
    "import { createRequire } from 'node:module';",
    "const require = createRequire(new URL('./package.json', import.meta.url));",
    "const { Jieba } = require('@node-rs/jieba');",
    "const { dict } = require('@node-rs/jieba/dict');",
    "const jieba = Jieba.withDict(dict);",
    "jieba.loadDict(Buffer.from('session_search 1000 nz\\nA2A通信 1000 nz\\n聊天记录 1000 nz', 'utf8'));",
    "const tokens = jieba.cutForSearch('聊天记录 A2A通信 session_search', true);",
    "for (const token of ['聊天记录', 'A2A通信', 'session_search']) {",
    "  if (!tokens.includes(token)) {",
    "    throw new Error(`@node-rs/jieba runtime smoke failed: missing ${token} from ${tokens.join('|')}`);",
    "  }",
    "}",
    "console.log('[build-server] jieba runtime smoke passed');",
    "",
  ].join("\n");
}

export function buildBetterSqliteRuntimeSmokeScript() {
  return [
    "import { createRequire } from 'node:module';",
    "const require = createRequire(new URL('./package.json', import.meta.url));",
    "const Database = require('better-sqlite3');",
    "const db = new Database(':memory:');",
    "try {",
    "  const row = db.prepare('select 1 as ok').get();",
    "  if (row?.ok !== 1) {",
    "    throw new Error(`better-sqlite3 runtime smoke failed: ${JSON.stringify(row)}`);",
    "  }",
    "} finally {",
    "  db.close();",
    "}",
    "console.log('[build-server] better-sqlite3 runtime smoke passed');",
    "",
  ].join("\n");
}

/**
 * Unlike the two smokes above, this one goes through a dynamic `import()`
 * rather than createRequire, because that is how the packaged server reaches
 * this package: the bundle keeps it external and imports it lazily, so the
 * ESM-importing-CJS interop is part of what needs to hold. Both export shapes
 * are accepted for the same reason the runtime loader accepts both.
 *
 * The assertion deliberately stops at "a real conversion produced the source
 * values" instead of matching the exact table layout — the layout belongs to
 * the upstream Markdown serializer, and pinning it here would turn a harmless
 * upstream formatting change into a failed build.
 */
export function buildAnydocRuntimeSmokeScript() {
  return [
    "const mod = await import('@firecrawl/anydoc');",
    "const api = mod && typeof mod.toMarkdownBytes === 'function' ? mod : mod?.default;",
    "if (typeof api?.toMarkdownBytes !== 'function') {",
    "  throw new Error('@firecrawl/anydoc runtime smoke failed: toMarkdownBytes is not callable');",
    "}",
    "const markdown = await api.toMarkdownBytes(Buffer.from('a,b\\n1,2'), 'csv');",
    "if (typeof markdown !== 'string' || !markdown.includes('1') || !markdown.includes('2')) {",
    "  throw new Error(`@firecrawl/anydoc runtime smoke failed: ${JSON.stringify(markdown)}`);",
    "}",
    "console.log('[build-server] @firecrawl/anydoc runtime smoke passed');",
    "",
  ].join("\n");
}

export function verifyExternalEntrypoints(outDir, packageNames, { readRetries, readBaseDelayMs } = {}) {
  const retryOpts = {};
  if (readRetries !== undefined) retryOpts.maxRetries = readRetries;
  if (readBaseDelayMs !== undefined) retryOpts.baseDelayMs = readBaseDelayMs;
  try {
    verifyRuntimeDependencyEntrypoints(outDir, packageNames, {
      scope: "root-only",
      readPackageJson: (packageJsonPath) => readPackageJsonWithRetry(packageJsonPath, retryOpts),
    });
  } catch (error) {
    if (error?.code === "EMFILE" || error?.code === "ENFILE") throw error;
    const failures = Array.isArray(error?.failures)
      ? error.failures.map((failure) => failure.reason === "entrypoint-missing"
        ? `${failure.packageName}: ${failure.target} resolves to missing file ${failure.resolvedPath}`
        : `${failure.packageName}: ${failure.cause?.message || failure.errorCode}`)
      : [error?.message || String(error)];
    throw new Error([
      "[build-server] external package entrypoint verification failed:",
      ...failures.map((failure) => `  - ${failure}`),
    ].join("\n"));
  }
}
