import {
  _electron,
  expect,
  test as base,
  type Browser,
  type BrowserContext,
  type ElectronApplication,
  type Page,
} from "@playwright/test";
import { spawn, type ChildProcess } from "node:child_process";
import fs from "node:fs/promises";
import net from "node:net";
import path from "node:path";
import {
  createKnowledgeLaunchConfig,
  type KnowledgeLaunchConfig,
} from "./server-fixture.ts";
import {
  installNativeDialogStub,
  type NativeDialogStub,
  type NativeDialogStubDisposer,
} from "./native-fixture.ts";
import {
  createKnowledgeWorkspaceSandbox,
  type KnowledgeWorkspaceSandbox,
} from "./workspace-fixture.ts";

type KnowledgeFixtures = {
  workspaceSandbox: KnowledgeWorkspaceSandbox;
  launchConfig: KnowledgeLaunchConfig;
  installDialogStub(
    electronApplication: ElectronApplication,
    stub: NativeDialogStub,
  ): Promise<NativeDialogStubDisposer>;
  knowledgeApp: {
    page: Page;
    runtime: "desktop-full" | "web-open" | "web-full";
    electronApplication: ElectronApplication | null;
    apiFetch(pathname: string, init?: RequestInit): Promise<Response>;
  };
};

type KnowledgeRuntime = KnowledgeFixtures["knowledgeApp"]["runtime"];

type KnowledgeWorkerFixtures = {
  knowledgeBrowser: Browser | null;
};

// Electron's main-process evaluation uses a separate IPC channel.  During
// Windows shutdown the child can already be wedged while that channel still
// accepts the request, so this request must not prevent the process-tree
// verification and taskkill fallback below from running.
const ELECTRON_QUIT_REQUEST_TIMEOUT_MS = 5_000;

/**
 * These are the same fixed applicability gates asserted in the individual
 * stories. Keeping the lightweight classification here lets Playwright mark a
 * non-applicable story as skipped before it starts an isolated server/browser
 * fixture. On Windows that avoids repeatedly launching a process pair for
 * every deliberate Web Full skip, while preserving the visible 38 pass / 34
 * fixed-skip release result.
 */
const runtimesByStory: Readonly<Record<string, readonly KnowledgeRuntime[]>> = {
  "E2E-KW-001": ["desktop-full", "web-open"],
  "E2E-KW-002": ["desktop-full", "web-open", "web-full"],
  "E2E-KW-003": ["desktop-full", "web-open"],
  "E2E-KW-004": ["desktop-full"],
  "E2E-KW-005": ["desktop-full", "web-open"],
  "E2E-KW-006": ["desktop-full", "web-open"],
  "E2E-KW-007": ["desktop-full", "web-open"],
  "E2E-KW-008": ["desktop-full"],
  "E2E-KW-009": ["desktop-full", "web-open"],
  "E2E-KW-010": ["desktop-full", "web-open"],
  "E2E-KW-011": ["desktop-full", "web-open"],
  "E2E-KW-012": ["desktop-full"],
  "E2E-KW-013": ["desktop-full", "web-open"],
  "E2E-KW-014": ["web-open"],
  "E2E-KW-015": ["desktop-full"],
  "E2E-KW-016": ["desktop-full", "web-open"],
  "E2E-KW-017": ["desktop-full", "web-open"],
  "E2E-KW-018": ["desktop-full"],
  "E2E-KW-019": ["desktop-full", "web-open"],
  "E2E-KW-020": ["desktop-full"],
  "E2E-KW-021": ["web-open"],
  "E2E-KW-022": ["web-open"],
  "E2E-KW-023": ["desktop-full"],
  "E2E-KW-024": ["desktop-full"],
};

function isRuntimeApplicable(testInfo: { title: string }, runtime: KnowledgeRuntime): boolean {
  const story = testInfo.title.match(/E2E-KW-\d{3}/)?.[0];
  return story === undefined || runtimesByStory[story]?.includes(runtime) === true;
}

export const test = base.extend<KnowledgeFixtures, KnowledgeWorkerFixtures>({
  knowledgeBrowser: [async ({ playwright }, use, workerInfo) => {
    // Desktop scenarios use Electron's own Chromium. Do not launch an unused
    // Playwright Chromium process alongside it: on Windows that extra native
    // host competes with Electron's process tree but cannot serve a desktop
    // scenario. Web projects still share one browser per worker below.
    if (workerInfo.project.name === "desktop-full") {
      await use(null);
      return;
    }
    // A fresh BrowserContext remains test-scoped below, so browser state never
    // crosses a scenario boundary. Keeping Chromium itself worker-scoped
    // avoids repeatedly creating and destroying the native browser host on
    // Windows between consecutive Web stories.
    const browser = await playwright.chromium.launch();
    try {
      await use(browser);
    } finally {
      await browser.close();
    }
  }, { scope: "worker" }],
  workspaceSandbox: async ({ playwright: _playwright }, use, testInfo) => {
    const sandbox = await createKnowledgeWorkspaceSandbox(testInfo.workerIndex);
    try {
      await use(sandbox);
    } finally {
      await sandbox.dispose();
    }
  },
  launchConfig: async ({ workspaceSandbox }, use) => {
    await use(createKnowledgeLaunchConfig(workspaceSandbox));
  },
  installDialogStub: async ({ playwright: _playwright }, use) => {
    const disposers: NativeDialogStubDisposer[] = [];
    let useError: unknown;
    try {
      await use(async (electronApplication, stub) => {
        const dispose = await installNativeDialogStub(electronApplication, stub);
        disposers.push(dispose);
        return dispose;
      });
    } catch (error) {
      useError = error;
    }
    const restoreErrors: unknown[] = [];
    for (const dispose of disposers.reverse()) {
      try {
        await dispose();
      } catch (error) {
        restoreErrors.push(error);
      }
    }
    if (useError && restoreErrors.length === 0) throw useError;
    if (useError || restoreErrors.length > 0) {
      throw new AggregateError(
        useError ? [useError, ...restoreErrors] : restoreErrors,
        "knowledge dialog fixture or restoration failed",
      );
    }
  },
  knowledgeApp: async (
    { knowledgeBrowser, launchConfig, workspaceSandbox },
    use,
    testInfo,
  ) => {
    const runtime = testInfo.project.name as
      | "desktop-full"
      | "web-open"
      | "web-full";
    if (!isRuntimeApplicable(testInfo, runtime)) {
      testInfo.skip(true, `not applicable to ${runtime}`);
    }
    if (runtime === "desktop-full") {
      const electronApplication = await _electron.launch({
        args: [
          path.resolve("desktop/bootstrap.cjs"),
          ...launchConfig.electronArgs,
        ],
        cwd: process.cwd(),
        env: {
          ...launchConfig.env,
          HANA_DEV_NODE_BIN: process.execPath,
        },
        timeout: 90_000,
      });
      let serverPid: number | null = null;
      try {
        const appPage = await waitForDesktopMainWindow(electronApplication);
        const serverInfo = await waitForServerInfo(
          workspaceSandbox.hanaHome,
          electronApplication.process(),
        );
        serverPid = serverInfo.pid;
        await use({
          page: appPage,
          runtime,
          electronApplication,
          apiFetch: createAuthenticatedApiFetch(serverInfo),
        });
      } finally {
        await closeElectronApplication(
          electronApplication,
          workspaceSandbox.hanaHome,
          serverPid,
        );
      }
      return;
    }

    const processes: ChildProcess[] = [];
    let browserContext: BrowserContext | null = null;
    try {
      const server = spawn(
        process.execPath,
        [path.resolve("server/bootstrap.ts")],
        {
          cwd: process.cwd(),
          env: {
            ...launchConfig.env,
            HANA_SERVER_ENTRY: path.resolve(
              runtime === "web-open"
                ? "server/main-open.ts"
                : "server/main-full.ts",
            ),
            HANA_RENDERER_DIST: path.resolve("desktop/dist-renderer"),
          },
          // Readiness, exit state, and sanitized Playwright artifacts are the
          // fixture's diagnostics. Leaving child pipes unread can block a
          // long-running Windows server and may preserve test-only paths in
          // CI output.
          stdio: "ignore",
        },
      );
      processes.push(server);
      const serverInfo = await waitForServerInfo(
        workspaceSandbox.hanaHome,
        server,
      );
      const clientPort = await reserveLoopbackPort();
      const vite = spawn(
        process.execPath,
        [
          // Invoking the package's CLI entry through the current Node binary
          // avoids a Windows cmd.exe wrapper per E2E fixture. Keeping the
          // Vite process direct makes the fixture's process-tree ownership
          // explicit during Windows teardown.
          path.resolve("node_modules", "vite", "bin", "vite.js"),
          "--config",
          path.resolve("vite.config.ts"),
          "--host",
          "127.0.0.1",
          "--port",
          String(clientPort),
          "--strictPort",
        ],
        {
          cwd: process.cwd(),
          env: {
            ...launchConfig.env,
            HANA_DEV_WEB: "1",
            HANA_DEV_WEB_CLIENT_PORT: String(clientPort),
            HANA_DEV_WEB_API_BASE_URL: `http://127.0.0.1:${clientPort}`,
            HANA_DEV_WEB_SERVER_URL: `http://127.0.0.1:${serverInfo.port}`,
            HANA_DEV_WEB_SERVER_TOKEN: serverInfo.token,
          },
          stdio: "ignore",
          windowsHide: true,
        },
      );
      processes.push(vite);
      const appUrl = `http://127.0.0.1:${clientPort}/index.html`;
      await waitForHttp(appUrl, vite);
      if (knowledgeBrowser === null) {
        throw new Error("web Knowledge fixture requires its worker browser");
      }
      browserContext = await knowledgeBrowser.newContext();
      const page = await browserContext.newPage();
      await page.goto(appUrl, { waitUntil: "domcontentloaded" });
      await use({
        page,
        runtime,
        electronApplication: null,
        apiFetch: createAuthenticatedApiFetch(serverInfo),
      });
    } finally {
      await browserContext?.close();
      await Promise.all(processes.reverse().map(stopChild));
    }
  },
});

export { expect };

function createAuthenticatedApiFetch(
  serverInfo: { port: number; token: string },
): (pathname: string, init?: RequestInit) => Promise<Response> {
  return (pathname, init = {}) => {
    const headers = new Headers(init.headers);
    headers.set("Authorization", `Bearer ${serverInfo.token}`);
    return fetch(`http://127.0.0.1:${serverInfo.port}${pathname}`, {
      ...init,
      headers,
    });
  };
}

async function waitForDesktopMainWindow(
  application: ElectronApplication,
): Promise<Page> {
  const deadline = Date.now() + 90_000;
  while (Date.now() < deadline) {
    const mainWindow = application.windows().find((candidate) => (
      /(?:^|\/)index\.html(?:[?#]|$)/.test(candidate.url())
    ));
    if (mainWindow) {
      await mainWindow.waitForLoadState("domcontentloaded");
      return mainWindow;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error("Desktop main window did not open");
}

async function waitForServerInfo(
  hanaHome: string,
  child: ChildProcess,
): Promise<{ pid: number; port: number; token: string }> {
  const file = path.join(hanaHome, "server-info.json");
  const deadline = Date.now() + 90_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null || child.signalCode !== null) {
      throw new Error(`Knowledge server exited before readiness (${child.exitCode ?? child.signalCode})`);
    }
    try {
      const parsed = JSON.parse(await fs.readFile(file, "utf8")) as {
        pid?: unknown;
        port?: unknown;
        token?: unknown;
      };
      if (
        Number.isInteger(parsed.pid)
        && Number(parsed.pid) > 0
        && Number.isInteger(parsed.port)
        && Number(parsed.port) > 0
        && typeof parsed.token === "string"
        && parsed.token.length > 0
      ) {
        return {
          pid: Number(parsed.pid),
          port: Number(parsed.port),
          token: parsed.token,
        };
      }
    } catch {
      // The writer uses atomic replacement; retry until the complete file exists.
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error("Knowledge server did not publish server-info.json");
}

async function reserveLoopbackPort(): Promise<number> {
  const server = net.createServer();
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : 0;
  await new Promise<void>((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  });
  if (!port) throw new Error("Failed to reserve a loopback port");
  return port;
}

async function waitForHttp(url: string, child: ChildProcess): Promise<void> {
  const deadline = Date.now() + 90_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null || child.signalCode !== null) {
      throw new Error(`Vite exited before readiness (${child.exitCode ?? child.signalCode})`);
    }
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {
      // Retry while Vite finishes binding and transforming the entry graph.
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Timed out waiting for ${url}`);
}

async function stopChild(child: ChildProcess): Promise<void> {
  if (child.exitCode !== null || child.signalCode !== null) return;
  if (process.platform === "win32") {
    // SIGTERM only reaches the direct child on Windows. Both server bootstrap
    // and Vite can own descendants, so wait for taskkill's complete process
    // tree before the next isolated fixture removes its workspace.
    await terminateProcessTree(child.pid);
    await waitForProcessExit(child, 5_000);
    return;
  }
  child.kill("SIGTERM");
  await Promise.race([
    new Promise<void>((resolve) => child.once("exit", () => resolve())),
    new Promise<void>((resolve) => setTimeout(resolve, 5_000)),
  ]);
  if (child.exitCode === null && child.signalCode === null) {
    child.kill("SIGKILL");
  }
}

async function closeElectronApplication(
  application: ElectronApplication,
  hanaHome: string,
  knownServerPid: number | null,
): Promise<void> {
  const serverPid = knownServerPid ?? await readServerPid(hanaHome);
  const child = application.process();
  if (child.exitCode === null && child.signalCode === null) {
    if (process.platform === "win32") {
      // A timed-out main-process evaluate remains an in-flight Playwright IPC
      // operation on Windows even after its caller's race has elapsed. That
      // can retain the worker after the test has otherwise finished. The
      // fixture owns the complete Electron tree, so use the existing native
      // tree terminator instead of starting an IPC operation that cannot be
      // cancelled. The exit checks below remain the source of truth.
      await terminateProcessTree(child.pid);
    } else {
      await requestElectronQuit(application);
      // The Electron transport may close or its IPC reply may stall during
      // shutdown. Process and owned-server verification below are authoritative.
      if (!await waitForProcessExit(child, 15_000)) {
        await terminateProcessTree(child.pid);
      }
    }
    if (!await waitForProcessExit(child, 5_000)) {
      throw new Error("Desktop fixture could not terminate its owned application");
    }
  }
  if (serverPid === null || await waitForPidExit(serverPid, 10_000)) return;
  await terminateProcessTree(serverPid);
  if (!await waitForPidExit(serverPid, 5_000)) {
    throw new Error("Desktop fixture could not terminate its owned server");
  }
}

async function requestElectronQuit(application: ElectronApplication): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      application.evaluate(({ app, BrowserWindow }) => {
        for (const window of BrowserWindow.getAllWindows()) {
          window.destroy();
        }
        app.quit();
      }).catch(() => undefined),
      new Promise<void>((resolve) => {
        timer = setTimeout(resolve, ELECTRON_QUIT_REQUEST_TIMEOUT_MS);
      }),
    ]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

async function readServerPid(hanaHome: string): Promise<number | null> {
  try {
    const parsed = JSON.parse(
      await fs.readFile(path.join(hanaHome, "server-info.json"), "utf8"),
    ) as { pid?: unknown };
    return Number.isSafeInteger(parsed.pid) && Number(parsed.pid) > 0
      ? Number(parsed.pid)
      : null;
  } catch {
    return null;
  }
}

async function waitForProcessExit(
  child: ChildProcess,
  timeoutMs: number,
): Promise<boolean> {
  if (child.exitCode !== null || child.signalCode !== null) return true;
  return new Promise<boolean>((resolve) => {
    const timer = setTimeout(() => resolve(false), timeoutMs);
    child.once("exit", () => {
      clearTimeout(timer);
      resolve(true);
    });
  });
}

async function waitForPidExit(pid: number, timeoutMs: number): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (!isPidAlive(pid)) return true;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  return !isPidAlive(pid);
}

function isPidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === "EPERM";
  }
}

async function terminateProcessTree(pid: number | undefined): Promise<void> {
  if (!Number.isSafeInteger(pid) || Number(pid) <= 0 || !isPidAlive(Number(pid))) {
    return;
  }
  if (process.platform === "win32") {
    const taskkill = spawn("taskkill.exe", [
      "/PID",
      String(pid),
      "/T",
      "/F",
    ], { stdio: "ignore", windowsHide: true });
    await new Promise<void>((resolve) => taskkill.once("exit", () => resolve()));
    return;
  }
  try {
    process.kill(Number(pid), "SIGTERM");
  } catch {
    return;
  }
  if (await waitForPidExit(Number(pid), 2_000)) return;
  try {
    process.kill(Number(pid), "SIGKILL");
  } catch {
    // The process exited between the liveness check and the signal.
  }
}
