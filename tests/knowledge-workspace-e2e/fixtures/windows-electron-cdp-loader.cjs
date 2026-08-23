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
  const logPath = env.HANA_WINDOWS_CDP_LOG_PATH ?? "";
  if (!pathApi.isAbsolute(logPath)) {
    throw new Error("Windows Knowledge E2E requires an absolute Chromium diagnostic log path");
  }
  app.commandLine.appendSwitch("user-data-dir", userDataDirectory);
  app.commandLine.appendSwitch("remote-debugging-port", portText);
  app.commandLine.appendSwitch("remote-debugging-address", "127.0.0.1");
  app.commandLine.appendSwitch("enable-logging", "file");
  app.commandLine.appendSwitch("log-file", logPath);
  return { port, userDataDirectory, logPath };
}

function runWindowsElectronEntry({
  app,
  platform = process.platform,
  env = process.env,
  loadBootstrap = require,
} = {}) {
  globalThis.__hanaWindowsCdpBootstrap = {
    entryStarted: true,
    bootstrapLoaded: false,
    eventLoopReached: false,
  };
  setImmediate(() => {
    globalThis.__hanaWindowsCdpBootstrap.eventLoopReached = true;
  });
  installWindowsElectronCdp({ app, platform, env });
  const bootstrapPath = env.HANA_WINDOWS_CDP_BOOTSTRAP_PATH ?? "";
  const pathApi = platform === "win32" ? path.win32 : path;
  if (!pathApi.isAbsolute(bootstrapPath)) {
    throw new Error("Windows Knowledge E2E requires an absolute desktop bootstrap path");
  }
  const result = loadBootstrap(bootstrapPath);
  globalThis.__hanaWindowsCdpBootstrap.bootstrapLoaded = true;
  return result;
}

if (process.versions.electron) {
  const { app } = require("electron");
  runWindowsElectronEntry({ app });
}

module.exports = { installWindowsElectronCdp, runWindowsElectronEntry };
