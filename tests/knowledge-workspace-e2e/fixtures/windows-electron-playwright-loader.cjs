"use strict";

const http = require("node:http");

/**
 * Electron 42 on hosted Windows opens Chromium's CDP endpoint only after its
 * real ready event. Playwright's stock loader defers that event until after
 * connecting to CDP, which creates a startup cycle. Keep Playwright's process
 * ownership while allowing the real ready event to initialize Chromium.
 */
function installWindowsElectronPlaywrightLoader({
  argv = process.argv,
  app,
  env = process.env,
  globalObject = globalThis,
} = {}) {
  const remoteDebuggingIndex = argv.indexOf("--remote-debugging-port=0");
  const bridgeArgIndex = argv.findIndex((arg) => (
    arg.startsWith("--hana-playwright-cdp-port=")
  ));
  const bridgePort = Number(argv[bridgeArgIndex]?.slice("--hana-playwright-cdp-port=".length));
  if (remoteDebuggingIndex < 1) {
    throw new Error("Windows Electron loader requires Playwright remote debugging");
  }
  if (!Number.isInteger(bridgePort) || bridgePort < 1 || bridgePort > 65_535) {
    throw new Error("Windows Electron loader requires a loopback CDP port");
  }

  argv.splice(1, remoteDebuggingIndex);
  argv.splice(argv.indexOf(`--hana-playwright-cdp-port=${bridgePort}`), 1);
  app.commandLine.appendSwitch("remote-debugging-port", String(bridgePort));
  app.commandLine.appendSwitch("remote-debugging-address", "127.0.0.1");
  if (env.HANA_GPU_SANDBOX_COMPAT === "1") {
    app.commandLine.appendSwitch("disable-gpu-sandbox");
    app.commandLine.appendSwitch("disable-features", "GpuSandbox");
  }
  globalObject.__hanaWindowsPlaywrightState = {
    connected: false,
    bootstrapRegistered: false,
    bootstrapStarted: false,
    bootstrapLoaded: false,
    bootstrapError: null,
  };
  globalObject.__playwright_run = () => {
    const state = globalObject.__hanaWindowsPlaywrightState;
    state.connected = true;
    const bootstrap = globalObject.__hanaWindowsPlaywrightBootstrap;
    if (typeof bootstrap !== "function") {
      throw new Error("Windows Knowledge E2E bootstrap was not registered");
    }
    state.bootstrapStarted = true;
    bootstrap();
    return Promise.resolve();
  };
  return bridgePort;
}

function reportChromiumEndpoint(port) {
  const deadline = Date.now() + 85_000;
  let reported = false;
  const poll = () => {
    if (reported || Date.now() >= deadline) {
      clearInterval(timer);
      return;
    }
    const request = http.get({ host: "127.0.0.1", port, path: "/json/version" }, (response) => {
      let body = "";
      response.setEncoding("utf8");
      response.on("data", (chunk) => { body += chunk; });
      response.on("end", () => {
        if (response.statusCode !== 200 || reported) return;
        try {
          const endpoint = JSON.parse(body).webSocketDebuggerUrl;
          if (typeof endpoint !== "string" || !endpoint.startsWith("ws://127.0.0.1:")) return;
          reported = true;
          clearInterval(timer);
          console.error(`DevTools listening on ${endpoint}`);
        } catch {
          return;
        }
      });
    });
    request.setTimeout(500, () => request.destroy());
    request.on("error", () => {});
  };
  const timer = setInterval(poll, 50);
  timer.unref?.();
  poll();
}

if (process.versions.electron) {
  const { app } = require("electron");
  const port = installWindowsElectronPlaywrightLoader({ app });
  console.error(`[hana-windows-e2e] configured Chromium CDP on 127.0.0.1:${port}`);
  setImmediate(() => {
    console.error(`[hana-windows-e2e] first event-loop turn; appReady=${app.isReady()}`);
  });
  app.whenReady().then(() => {
    console.error("[hana-windows-e2e] native Electron ready");
  });
  reportChromiumEndpoint(port);
}

module.exports = {
  installWindowsElectronPlaywrightLoader,
  reportChromiumEndpoint,
};
