/**
 * Electron client single-instance guard.
 *
 * Electron's requestSingleInstanceLock() is scoped by userData, so HanaAgent sets
 * userData from HANA_HOME before requesting the lock. Production and dev homes
 * get different namespaces, while duplicate launches within the same home are
 * redirected to the first client.
 */
const path = require("path");

function markWindowsPlaywrightStartupStage(stage) {
  if (process.env.HANA_WINDOWS_PLAYWRIGHT_STARTUP_TRACE === "1") {
    console.error(`[hana-windows-startup] ${stage}`);
  }
}

function normalizeForCompare(filePath) {
  const resolved = path.resolve(filePath);
  return process.platform === "win32" ? resolved.toLowerCase() : resolved;
}

function getUserDataAppName(hanakoHome, defaultHome) {
  if (normalizeForCompare(hanakoHome) === normalizeForCompare(defaultHome)) {
    return "Hanako";
  }
  const suffix = path.basename(hanakoHome).replace(/^\./, "");
  if (!suffix) return "Hanako";
  return suffix.charAt(0).toUpperCase() + suffix.slice(1);
}

function exitDuplicateClient(app) {
  if (typeof app.exit === "function") {
    app.exit(0);
    return;
  }
  app.quit();
}

function focusExistingWindow(win) {
  if (!win || win.isDestroyed?.()) return false;
  if (win.isMinimized?.()) win.restore?.();
  win.show?.();
  win.focus?.();
  return true;
}

function configureClientSingleInstance(app, opts) {
  const {
    hanakoHome,
    defaultHome,
    onSecondInstance,
    acquireLock = true,
  } = opts;
  if (!acquireLock) {
    markWindowsPlaywrightStartupStage("single-instance-configuration-skipped");
    return true;
  }

  const appName = getUserDataAppName(hanakoHome, defaultHome);
  markWindowsPlaywrightStartupStage("single-instance-name-resolved");
  if (appName) {
    const appData = app.getPath("appData");
    markWindowsPlaywrightStartupStage("app-data-resolved");
    app.setPath("userData", path.join(appData, appName));
    markWindowsPlaywrightStartupStage("user-data-configured");
  }

  const gotLock = app.requestSingleInstanceLock({ hanakoHome });
  markWindowsPlaywrightStartupStage("single-instance-lock-returned");
  if (!gotLock) {
    exitDuplicateClient(app);
    return false;
  }

  app.on("second-instance", () => {
    onSecondInstance?.();
  });
  return true;
}

module.exports = {
  configureClientSingleInstance,
  focusExistingWindow,
  getUserDataAppName,
};
