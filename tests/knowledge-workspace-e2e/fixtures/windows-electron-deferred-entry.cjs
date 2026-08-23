"use strict";

const path = require("node:path");

function runDeferredWindowsElectronEntry({
  env = process.env,
  waitUntilReady = () => require("electron").app.whenReady(),
  loadBootstrap = require,
  onError = (error) => {
    console.error("[hana-windows-e2e] deferred bootstrap failed:", error?.stack || error);
    process.exitCode = 1;
    try { require("electron").app.exit(1); } catch {}
  },
} = {}) {
  const bootstrapPath = env.HANA_WINDOWS_DEFERRED_BOOTSTRAP_PATH ?? "";
  if (!path.win32.isAbsolute(bootstrapPath)) {
    throw new Error("Windows Knowledge E2E requires an absolute deferred bootstrap path");
  }
  Promise.resolve()
    .then(waitUntilReady)
    .then(() => loadBootstrap(bootstrapPath))
    .catch(onError);
  return bootstrapPath;
}

if (process.versions.electron) {
  runDeferredWindowsElectronEntry();
}

module.exports = { runDeferredWindowsElectronEntry };
