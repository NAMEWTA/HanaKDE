"use strict";

const http = require("node:http");
const path = require("node:path");
const Module = require("node:module");

function installWindowsRequireTrace({
  env = process.env,
  moduleApi = Module,
  root = process.cwd(),
  log = (message) => console.error(message),
} = {}) {
  if (env.HANA_WINDOWS_PLAYWRIGHT_REQUIRE_TRACE !== "1") return false;
  const originalLoad = moduleApi._load;
  moduleApi._load = function tracedLoad(request, parent, isMain) {
    const parentFile = parent?.filename;
    const localRequest = typeof request === "string"
      && (request.startsWith(".") || path.isAbsolute(request));
    const shouldTrace = localRequest
      && typeof parentFile === "string"
      && path.resolve(parentFile).startsWith(path.resolve(root) + path.sep);
    if (!shouldTrace) return originalLoad.call(this, request, parent, isMain);
    const parentLabel = path.relative(root, parentFile);
    log(`[hana-windows-require] start ${request} <- ${parentLabel}`);
    const result = originalLoad.call(this, request, parent, isMain);
    log(`[hana-windows-require] complete ${request} <- ${parentLabel}`);
    return result;
  };
  return true;
}

/**
 * Electron 42 on hosted Windows does not reliably publish Playwright's dynamic
 * Chromium endpoint. Use a fixed loopback endpoint and expose an application-
 * specific ready gate without replacing Electron's public readiness methods.
 * Electron 42 itself uses app.whenReady() during Windows startup.
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
  const nativeWhenReady = app.whenReady();
  let releaseApplicationReady;
  const applicationWhenReady = new Promise((resolve) => {
    releaseApplicationReady = resolve;
  });
  const state = {
    nativeReady: false,
    playwrightReleased: false,
  };
  globalObject.__hanaWindowsPlaywrightState = state;
  globalObject.__hanaWindowsPlaywrightReady = applicationWhenReady;
  nativeWhenReady.then(() => { state.nativeReady = true; });
  globalObject.__playwright_run = async () => {
    const event = await nativeWhenReady;
    releaseApplicationReady(event);
    state.playwrightReleased = true;
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
  installWindowsRequireTrace();
  const port = installWindowsElectronPlaywrightLoader({ app });
  console.error(`[hana-windows-e2e] configured Chromium CDP on 127.0.0.1:${port}`);
  setImmediate(() => {
    console.error(`[hana-windows-e2e] first event-loop turn; appReady=${app.isReady()}`);
  });
  reportChromiumEndpoint(port);
}

module.exports = {
  installWindowsElectronPlaywrightLoader,
  installWindowsRequireTrace,
  reportChromiumEndpoint,
};
