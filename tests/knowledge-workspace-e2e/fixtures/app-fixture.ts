import {
  _electron,
  expect,
  test as base,
  type Browser,
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
  };
};

export const test = base.extend<KnowledgeFixtures>({
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
    { playwright, launchConfig, workspaceSandbox },
    use,
    testInfo,
  ) => {
    const runtime = testInfo.project.name as
      | "desktop-full"
      | "web-open"
      | "web-full";
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
      try {
        const appPage = await waitForDesktopMainWindow(electronApplication);
        await use({
          page: appPage,
          runtime,
          electronApplication,
        });
      } finally {
        await electronApplication.close();
      }
      return;
    }

    const processes: ChildProcess[] = [];
    let browser: Browser | null = null;
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
          stdio: ["ignore", "pipe", "pipe"],
        },
      );
      processes.push(server);
      const serverInfo = await waitForServerInfo(
        workspaceSandbox.hanaHome,
        server,
      );
      const clientPort = await reserveLoopbackPort();
      const vite = spawn(
        path.resolve(
          "node_modules",
          ".bin",
          process.platform === "win32" ? "vite.cmd" : "vite",
        ),
        [
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
          shell: process.platform === "win32",
          stdio: ["ignore", "pipe", "pipe"],
        },
      );
      processes.push(vite);
      const appUrl = `http://127.0.0.1:${clientPort}/index.html`;
      await waitForHttp(appUrl, vite);
      browser = await playwright.chromium.launch();
      const page = await browser.newPage();
      await page.goto(appUrl, { waitUntil: "domcontentloaded" });
      await use({
        page,
        runtime,
        electronApplication: null,
      });
    } finally {
      await browser?.close();
      await Promise.all(processes.reverse().map(stopChild));
    }
  },
});

export { expect };

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
): Promise<{ port: number; token: string }> {
  const file = path.join(hanaHome, "server-info.json");
  const deadline = Date.now() + 90_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null || child.signalCode !== null) {
      throw new Error(`Knowledge server exited before readiness (${child.exitCode ?? child.signalCode})`);
    }
    try {
      const parsed = JSON.parse(await fs.readFile(file, "utf8")) as {
        port?: unknown;
        token?: unknown;
      };
      if (
        Number.isInteger(parsed.port)
        && Number(parsed.port) > 0
        && typeof parsed.token === "string"
        && parsed.token.length > 0
      ) {
        return { port: Number(parsed.port), token: parsed.token };
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
  child.kill("SIGTERM");
  await Promise.race([
    new Promise<void>((resolve) => child.once("exit", () => resolve())),
    new Promise<void>((resolve) => setTimeout(resolve, 5_000)),
  ]);
  if (child.exitCode === null && child.signalCode === null) {
    child.kill("SIGKILL");
  }
}
