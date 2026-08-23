"use strict";

const path = require("node:path");
const Module = require("node:module");

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
  app.commandLine.appendSwitch("remote-debugging-address", "127.0.0.1");
  app.commandLine.appendSwitch("remote-debugging-port", portText);
  globalThis.__hanaWindowsCdpLoaderState = {
    port,
    userDataConfigured: true,
  };
  return { port, userDataDirectory };
}

function installWhenElectronApiAvailable({
  moduleApi = Module,
  platform = process.platform,
  env = process.env,
} = {}) {
  const originalLoad = moduleApi._load;
  moduleApi._load = function loadWithElectronCdp(request, parent, isMain) {
    const loaded = originalLoad.call(this, request, parent, isMain);
    if (request !== "electron" || !loaded?.app) return loaded;
    moduleApi._load = originalLoad;
    installWindowsElectronCdp({
      app: loaded.app,
      platform,
      env,
    });
    return loaded;
  };
  return () => {
    if (moduleApi._load === originalLoad) return;
    moduleApi._load = originalLoad;
  };
}

if (process.versions.electron) {
  installWhenElectronApiAvailable();
}

module.exports = {
  installWhenElectronApiAvailable,
  installWindowsElectronCdp,
};
