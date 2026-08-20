const fs = require("fs");
const path = require("path");

const INTEGRITY_ERROR_CODE = "HANA_DEPENDENCY_INTEGRITY";
const VALID_SCOPES = new Set(["root-only", "all-exact"]);

class RuntimeDependencyIntegrityError extends Error {
  constructor(failures) {
    super([
      `${INTEGRITY_ERROR_CODE}: runtime dependency entrypoint verification failed:`,
      ...failures.map(formatFailure),
    ].join("\n"));
    this.name = "RuntimeDependencyIntegrityError";
    this.code = INTEGRITY_ERROR_CODE;
    this.failures = failures;
  }
}

function formatFailure(failure) {
  if (failure.reason === "entrypoint-missing") {
    return `  - ${failure.packageName} ${failure.exportKey} -> ${failure.target} is missing`;
  }
  return `  - ${failure.packageName}/package.json is unavailable (${failure.errorCode || "invalid"})`;
}

function collectStaticTargets(value, exportKey, targets) {
  if (typeof value === "string") {
    if (value.startsWith("./") && !value.includes("*")) {
      targets.push({ exportKey, target: value });
    }
    return;
  }
  if (!value || typeof value !== "object") return;

  if (Array.isArray(value)) {
    for (const item of value) collectStaticTargets(item, exportKey, targets);
    return;
  }

  for (const [condition, nested] of Object.entries(value)) {
    if (condition === "types") continue;
    collectStaticTargets(nested, exportKey, targets);
  }
}

function getRootExport(exportsField) {
  if (!exportsField || typeof exportsField !== "object" || Array.isArray(exportsField)) {
    return exportsField;
  }
  if (Object.hasOwn(exportsField, ".")) return exportsField["."];
  return Object.keys(exportsField).some((key) => key.startsWith("."))
    ? undefined
    : exportsField;
}

function collectRuntimeEntrypoints(manifest, { scope = "root-only" } = {}) {
  if (!VALID_SCOPES.has(scope)) throw new TypeError(`Unknown runtime dependency verification scope: ${scope}`);

  const candidates = [];
  if (manifest && Object.hasOwn(manifest, "exports")) {
    const exportsField = manifest.exports;
    const isSubpathMap = exportsField
      && typeof exportsField === "object"
      && !Array.isArray(exportsField)
      && Object.keys(exportsField).some((key) => key.startsWith("."));

    if (scope === "all-exact" && isSubpathMap) {
      for (const [exportKey, value] of Object.entries(exportsField)) {
        if (!exportKey.startsWith(".") || exportKey.includes("*")) continue;
        collectStaticTargets(value, exportKey, candidates);
      }
    } else {
      const rootExport = getRootExport(exportsField);
      if (rootExport !== undefined) collectStaticTargets(rootExport, ".", candidates);
    }
  } else {
    if (typeof manifest?.module === "string") candidates.push({ exportKey: "module", target: manifest.module });
    if (typeof manifest?.main === "string") candidates.push({ exportKey: "main", target: manifest.main });
  }

  const seenTargets = new Set();
  return candidates.filter(({ target }) => {
    if (!target.startsWith("./") || target.includes("*") || seenTargets.has(target)) return false;
    seenTargets.add(target);
    return true;
  });
}

function defaultReadPackageJson(packageJsonPath) {
  return JSON.parse(fs.readFileSync(packageJsonPath, "utf8"));
}

function findMissingRuntimeEntrypoints(rootDir, packageNames, opts = {}) {
  const scope = opts.scope || "root-only";
  const readPackageJson = opts.readPackageJson || defaultReadPackageJson;
  const exists = opts.exists || fs.existsSync;
  const failures = [];

  for (const packageName of packageNames) {
    const packageDir = path.join(rootDir, "node_modules", packageName);
    const packageJsonPath = path.join(packageDir, "package.json");
    let manifest;
    try {
      manifest = readPackageJson(packageJsonPath);
    } catch (error) {
      if (error?.code === "EMFILE" || error?.code === "ENFILE") throw error;
      failures.push({
        packageName,
        exportKey: "package.json",
        target: "./package.json",
        resolvedPath: packageJsonPath,
        reason: "package-manifest-unavailable",
        errorCode: error?.code || error?.name || "invalid",
        cause: error,
      });
      continue;
    }

    for (const { exportKey, target } of collectRuntimeEntrypoints(manifest, { scope })) {
      const resolvedPath = path.resolve(packageDir, target);
      if (!exists(resolvedPath)) {
        failures.push({
          packageName,
          exportKey,
          target,
          resolvedPath,
          reason: "entrypoint-missing",
        });
      }
    }
  }

  return failures;
}

function verifyRuntimeDependencyEntrypoints(rootDir, packageNames, opts = {}) {
  const failures = findMissingRuntimeEntrypoints(rootDir, packageNames, opts);
  if (failures.length > 0) throw new RuntimeDependencyIntegrityError(failures);
  return { ok: true, checkedPackages: packageNames.length };
}

module.exports = {
  INTEGRITY_ERROR_CODE,
  RuntimeDependencyIntegrityError,
  collectRuntimeEntrypoints,
  findMissingRuntimeEntrypoints,
  verifyRuntimeDependencyEntrypoints,
};
