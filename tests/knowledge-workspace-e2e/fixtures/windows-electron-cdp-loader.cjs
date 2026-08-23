"use strict";

const path = require("node:path");

function installWindowsElectronCdp({
  argv = process.argv,
  app,
  platform = process.platform,
} = {}) {
  const readSingleArgument = (name) => {
    const prefix = `--${name}=`;
    const values = argv
      .filter((argument) => argument.startsWith(prefix))
      .map((argument) => argument.slice(prefix.length));
    if (values.length !== 1 || !values[0]) {
      throw new Error(`Windows Knowledge E2E requires exactly one ${name} argument`);
    }
    return values[0];
  };

  const portText = readSingleArgument("hana-windows-cdp-port");
  const port = Number(portText);
  if (!/^\d+$/.test(portText) || !Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error("Windows Knowledge E2E received an invalid Chromium CDP port");
  }
  const userDataDirectory = readSingleArgument("hana-windows-cdp-user-data-dir");
  const pathApi = platform === "win32" ? path.win32 : path;
  if (!pathApi.isAbsolute(userDataDirectory)) {
    throw new Error("Windows Knowledge E2E requires an absolute Chromium user data directory");
  }

  app.commandLine.appendSwitch("user-data-dir", userDataDirectory);
  app.commandLine.appendSwitch("remote-debugging-address", "127.0.0.1");
  app.commandLine.appendSwitch("remote-debugging-port", portText);
  globalThis.__hanaWindowsCdpLoaderState = {
    port,
    userDataConfigured: true,
  };
  return { port, userDataDirectory };
}

if (process.versions.electron) {
  const { app } = require("electron");
  installWindowsElectronCdp({ app });
}

module.exports = { installWindowsElectronCdp };
