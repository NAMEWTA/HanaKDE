"use strict";

const path = require("node:path");

function runDeferredWindowsElectronEntry({
  env = process.env,
  isReady = () => require("electron").app.isReady(),
  registerBootstrap = (bootstrap) => {
    const state = globalThis.__hanaWindowsPlaywrightState;
    if (!state || typeof state !== "object") {
      throw new Error("Windows Knowledge E2E requires the Playwright bootstrap state");
    }
    state.bootstrapRegistered = true;
    globalThis.__hanaWindowsPlaywrightBootstrap = bootstrap;
  },
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
  registerBootstrap(() => {
    const state = globalThis.__hanaWindowsPlaywrightState;
    try {
      if (!isReady()) {
        throw new Error("Windows Knowledge E2E bootstrap ran before native Electron readiness");
      }
      loadBootstrap(bootstrapPath);
      if (state && typeof state === "object") state.bootstrapLoaded = true;
    } catch (error) {
      if (state && typeof state === "object") {
        state.bootstrapError = error instanceof Error ? error.message : String(error);
      }
      onError(error);
    }
  });
  return bootstrapPath;
}

if (process.versions.electron) {
  runDeferredWindowsElectronEntry();
}

module.exports = { runDeferredWindowsElectronEntry };
