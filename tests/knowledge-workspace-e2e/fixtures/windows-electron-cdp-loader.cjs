"use strict";

const path = require("node:path");

function installWindowsElectronCdp({
  app,
  platform = process.platform,
  env = process.env,
} = {}) {
  const portText = env.HANA_WINDOWS_CDP_PORT ?? "";
  const port = Number(portText);
  if (!/^\d+$/.test(portText) || !Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error("Windows Knowledge E2E received an invalid Chromium CDP port");
  }
  const userDataDirectory = env.HANA_WINDOWS_CDP_USER_DATA_DIR ?? "";
  const pathApi = platform === "win32" ? path.win32 : path;
  if (!pathApi.isAbsolute(userDataDirectory)) {
    throw new Error("Windows Knowledge E2E requires an absolute Chromium user data directory");
  }
  app.commandLine.appendSwitch("user-data-dir", userDataDirectory);
  app.commandLine.appendSwitch("remote-debugging-port", portText);
  return { port, userDataDirectory };
}

function runWindowsElectronEntry({
  app,
  platform = process.platform,
  env = process.env,
  loadBootstrap = require,
} = {}) {
  installWindowsElectronCdp({ app, platform, env });
  const bootstrapPath = env.HANA_WINDOWS_CDP_BOOTSTRAP_PATH ?? "";
  const pathApi = platform === "win32" ? path.win32 : path;
  if (!pathApi.isAbsolute(bootstrapPath)) {
    throw new Error("Windows Knowledge E2E requires an absolute desktop bootstrap path");
  }
  return loadBootstrap(bootstrapPath);
}

if (process.versions.electron) {
  const { app } = require("electron");
  runWindowsElectronEntry({ app });
}

module.exports = { installWindowsElectronCdp, runWindowsElectronEntry };
