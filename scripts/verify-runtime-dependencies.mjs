#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const {
  INTEGRITY_ERROR_CODE,
  verifyRuntimeDependencyEntrypoints,
} = require("../shared/runtime-dependency-integrity.cjs");

const RECOVERY_COMMAND = "volta run npm ci";

function withRecoveryGuidance(error) {
  const wrapped = new Error(`${error.message}\nRecovery: ${RECOVERY_COMMAND}`);
  wrapped.name = error.name || "RuntimeDependencyIntegrityError";
  wrapped.code = INTEGRITY_ERROR_CODE;
  wrapped.failures = error.failures || [];
  wrapped.cause = error;
  return wrapped;
}

function summarizeImportFailure(error) {
  const code = error?.code || error?.name || "IMPORT_FAILED";
  const normalized = String(error?.message || "").replace(/\\/g, "/");
  const match = normalized.match(/\/node_modules\/(.+?)(?:['"\s]|$)/);
  return match ? `${code}: missing ${match[1]}` : code;
}

export async function verifyRootRuntimeDependencies(rootDir = process.cwd(), opts = {}) {
  const manifest = JSON.parse(fs.readFileSync(path.join(rootDir, "package.json"), "utf8"));
  const packageNames = Object.keys(manifest.dependencies || {});

  try {
    const result = verifyRuntimeDependencyEntrypoints(rootDir, packageNames, { scope: "all-exact" });
    const importPackage = opts.importPackage || ((specifier) => import(specifier));
    await importPackage("@earendil-works/pi-ai");
    return result;
  } catch (error) {
    if (error?.code === INTEGRITY_ERROR_CODE) throw withRecoveryGuidance(error);
    const smokeError = new Error([
      `${INTEGRITY_ERROR_CODE}: @earendil-works/pi-ai smoke import failed`,
      `  - ${summarizeImportFailure(error)}`,
    ].join("\n"));
    smokeError.code = INTEGRITY_ERROR_CODE;
    smokeError.cause = error;
    throw withRecoveryGuidance(smokeError);
  }
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : "";
if (invokedPath === fileURLToPath(import.meta.url)) {
  verifyRootRuntimeDependencies()
    .then(({ checkedPackages }) => {
      console.log(`[runtime-deps] verified ${checkedPackages} production dependencies and Pi AI import`);
    })
    .catch((error) => {
      console.error(`[runtime-deps] ${error.message}`);
      process.exitCode = 1;
    });
}
