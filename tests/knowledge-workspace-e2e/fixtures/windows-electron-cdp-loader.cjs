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
  const expectedToken = env.HANA_WINDOWS_CDP_EXPECTED_TOKEN ?? "";
  if (!/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(expectedToken)) {
    throw new Error("Windows Knowledge E2E requires a valid loader token");
  }

  app.commandLine.appendSwitch("user-data-dir", userDataDirectory);
  app.commandLine.appendSwitch("remote-debugging-address", "127.0.0.1");
  app.commandLine.appendSwitch("remote-debugging-port", portText);
  env.HANA_WINDOWS_CDP_LOADED_TOKEN = expectedToken;
  return { port, userDataDirectory };
}

if (process.versions.electron) {
  const { app } = require("electron");
  installWindowsElectronCdp({ app });
}

module.exports = { installWindowsElectronCdp };
