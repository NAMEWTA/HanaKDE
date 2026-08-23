function resolveDesktopApplicationReady({
  app,
  env = process.env,
  globalObject = globalThis,
} = {}) {
  if (env.HANA_WINDOWS_PLAYWRIGHT_READY_GATE !== "1") {
    return app.whenReady();
  }
  const gate = globalObject.__hanaWindowsPlaywrightReady;
  if (!gate || typeof gate.then !== "function") {
    throw new Error("Windows Knowledge E2E requires its Playwright ready gate");
  }
  return gate;
}

module.exports = { resolveDesktopApplicationReady };
