/* global module, process */
"use strict";

/**
 * Electron 42 on hosted Windows opens Chromium's CDP endpoint only after its
 * real ready event. Playwright's stock loader defers that event until after
 * connecting to CDP, which creates a startup cycle. Keep the Node inspector
 * control plane and make the post-connection hook a no-op for this test-only
 * Windows launch.
 */
function installWindowsElectronLoader({
  argv = process.argv,
  globalObject = globalThis,
} = {}) {
  const remoteDebuggingIndex = argv.indexOf("--remote-debugging-port=0");
  if (remoteDebuggingIndex < 1) {
    throw new Error("Windows Electron loader requires Playwright remote debugging");
  }

  argv.splice(1, remoteDebuggingIndex);
  const ready = Promise.resolve();
  globalObject.__playwright_run = () => ready;
}

if (process.versions.electron) {
  installWindowsElectronLoader();
}

module.exports = { installWindowsElectronLoader };
