import { spawn, type ChildProcess } from "node:child_process";
import { randomUUID } from "node:crypto";
import type {
  Browser,
  BrowserContext,
  Page,
} from "@playwright/test";
import type { ElectronMainProcessApplication } from "./electron-main-process-application.ts";

const STARTUP_TIMEOUT_MS = 90_000;
const ENDPOINT_REQUEST_TIMEOUT_MS = 1_000;
const INSPECTOR_CONNECT_TIMEOUT_MS = 5_000;
const INSPECTOR_REQUEST_TIMEOUT_MS = 5_000;
const INSPECTOR_EVALUATE_TIMEOUT_MS = 90_000;
const CHILD_TERMINATION_TIMEOUT_MS = 5_000;

// The direct-CDP path replaces Playwright's Electron loader. Keep the loader's
// backgrounding guarantees so hidden/secondary Windows stay responsive during
// the same real user-flow tests.
const DIRECT_ELECTRON_CHROMIUM_SWITCHES = [
  "--disable-background-timer-throttling",
  "--disable-backgrounding-occluded-windows",
  "--disable-renderer-backgrounding",
] as const;

type LaunchOptions = {
  executablePath: string;
  loaderPath: string;
  bootstrapPath: string;
  electronArgs: readonly string[];
  env: NodeJS.ProcessEnv;
  cwd: string;
  reserveLoopbackPort(): Promise<number>;
};

export type InspectorIdentity = {
  pid: number;
  token: string;
};

export type ElectronCdpPortPair = {
  nodeInspectorPort: number;
  chromiumPort: number;
};

export type ElectronChromiumConfiguration = {
  commandLinePort: string;
  commandLineUserDataConfigured: boolean;
};

type ElectronCdpLaunchArguments = ElectronCdpPortPair & {
  loaderPath: string;
  launchToken: string;
  electronArgs: readonly string[];
};

type ChromiumCdpConnector = {
  chromium: {
    connectOverCDP(endpointURL: string): Promise<Browser>;
  };
};

type NodeInspectorResponse = {
  id?: number;
  result?: {
    result?: { value?: unknown };
    exceptionDetails?: unknown;
  };
  error?: unknown;
};

type NodeInspectorEvent = {
  method?: string;
  params?: {
    executionContextId?: unknown;
    context?: {
      id?: unknown;
    };
  };
};

type NodeInspectorMessage = NodeInspectorResponse & NodeInspectorEvent;

type ChildFailureMonitor = {
  assertReady(kind: "node" | "chromium"): void;
};

export type WindowsElectronCdpLaunch = {
  application: ElectronMainProcessApplication;
  browser: Browser;
  page(): Promise<Page>;
  dispose(): void;
};

export function buildWindowsElectronCdpArgs({
  nodeInspectorPort,
  chromiumPort,
  loaderPath,
  launchToken,
  electronArgs,
}: ElectronCdpLaunchArguments): string[] {
  if (nodeInspectorPort === chromiumPort) {
    throw new Error("Windows Electron requires distinct node inspector and Chromium CDP ports");
  }
  const userDataArgs = electronArgs.filter((argument) => (
    argument.startsWith("--user-data-dir=")
  ));
  if (userDataArgs.length !== 1 || userDataArgs[0] === "--user-data-dir=") {
    throw new Error("Windows Electron requires exactly one non-empty user data directory");
  }
  const applicationArgs = electronArgs.filter((argument) => (
    !argument.startsWith("--user-data-dir=")
  ));
  return [
    `--inspect=127.0.0.1:${nodeInspectorPort}`,
    ...DIRECT_ELECTRON_CHROMIUM_SWITCHES,
    ...userDataArgs,
    loaderPath,
    `--hana-windows-cdp-token=${launchToken}`,
    ...applicationArgs,
  ];
}

export async function reserveDistinctLoopbackPorts(
  reserveLoopbackPort: () => Promise<number>,
): Promise<ElectronCdpPortPair> {
  const nodeInspectorPort = await reserveLoopbackPort();
  if (!Number.isInteger(nodeInspectorPort) || nodeInspectorPort < 1 || nodeInspectorPort > 65_535) {
    throw new Error("Windows Electron received an invalid node inspector port");
  }
  for (let attempts = 0; attempts < 8; attempts += 1) {
    const chromiumPort = await reserveLoopbackPort();
    if (!Number.isInteger(chromiumPort) || chromiumPort < 1 || chromiumPort > 65_535) {
      throw new Error("Windows Electron received an invalid Chromium CDP port");
    }
    if (chromiumPort !== nodeInspectorPort) {
      return { nodeInspectorPort, chromiumPort };
    }
  }
  throw new Error("Windows Electron could not reserve distinct CDP ports");
}

/**
 * Electron GUI children on hosted Windows do not relay Chromium's DevTools
 * banner through stdio, so Playwright's Electron launcher cannot complete its
 * otherwise normal two-CDP-endpoint handshake. Keep both endpoints strictly
 * loopback-only and connect to them directly instead.
 */
export async function launchWindowsElectronOverCdp(
  playwright: ChromiumCdpConnector,
  options: LaunchOptions,
): Promise<WindowsElectronCdpLaunch> {
  const { nodeInspectorPort, chromiumPort } = await reserveDistinctLoopbackPorts(
    options.reserveLoopbackPort,
  );
  const launchToken = randomUUID();
  const launchArguments = buildWindowsElectronCdpArgs({
    nodeInspectorPort,
    chromiumPort,
    loaderPath: options.loaderPath,
    launchToken,
    electronArgs: options.electronArgs,
  });
  const userDataDirectory = launchArguments
    .find((argument) => argument.startsWith("--user-data-dir="))!
    .slice("--user-data-dir=".length);
  const child = spawn(options.executablePath, launchArguments, {
    cwd: options.cwd,
    env: {
      ...options.env,
      HANA_WINDOWS_CDP_PORT: String(chromiumPort),
      HANA_WINDOWS_CDP_USER_DATA_DIR: userDataDirectory,
      HANA_WINDOWS_CDP_BOOTSTRAP_PATH: options.bootstrapPath,
    },
    stdio: "ignore",
    windowsHide: true,
  });
  const childFailure = monitorChildFailure(child);
  if (!child.pid) {
    await terminateChild(child);
    throw new Error("Windows Electron process did not expose a pid");
  }

  let browser: Browser | null = null;
  let inspector: NodeInspectorClient | null = null;
  try {
    const deadline = Date.now() + STARTUP_TIMEOUT_MS;
    const nodeEndpoint = await waitForEndpoint(
      nodeInspectorPort,
      child,
      childFailure,
      "node",
      deadline,
    );
    const connectedInspector = await NodeInspectorClient.connect(nodeEndpoint);
    inspector = connectedInspector;
    await connectedInspector.assertIdentity({ pid: child.pid, token: launchToken });
    const chromiumEndpoint = await waitForEndpoint(
      chromiumPort,
      child,
      childFailure,
      "chromium",
      deadline,
    );
    const connectedBrowser = await playwright.chromium.connectOverCDP(chromiumEndpoint);
    browser = connectedBrowser;
    const context = connectedBrowser.contexts()[0];
    if (!context) throw new Error("Windows Electron Chromium context did not open");
    const application = createElectronApplication(child, context, connectedInspector);
    const page = await waitForDesktopPage(
      context,
      child,
      connectedBrowser,
      connectedInspector,
      Math.min(deadline, Date.now() + INSPECTOR_CONNECT_TIMEOUT_MS),
    );
    return {
      application,
      browser: connectedBrowser,
      page: () => Promise.resolve(page),
      dispose: () => connectedInspector.close(),
    };
  } catch (error) {
    inspector?.close();
    await browser?.close().catch(() => {});
    await terminateChild(child);
    throw error;
  }
}

function createElectronApplication(
  child: ChildProcess,
  context: BrowserContext,
  inspector: NodeInspectorClient,
): ElectronMainProcessApplication {
  return {
    process: () => child,
    evaluate: inspector.evaluate.bind(inspector),
    windows: () => context.pages(),
    waitForEvent: (event: string) => {
      if (event !== "window") {
        return Promise.reject(new Error(`Unsupported Windows Electron event: ${event}`));
      }
      return context.waitForEvent("page");
    },
  } as ElectronMainProcessApplication;
}

async function waitForDesktopPage(
  context: BrowserContext,
  child: ChildProcess,
  browser: Browser,
  inspector: NodeInspectorClient,
  deadline: number,
): Promise<Page> {
  while (Date.now() < deadline) {
    assertDesktopLaunchAlive(child, browser, inspector);
    const page = context.pages().find((candidate) => (
      /(?:^|\/)index\.html(?:[?#]|$)/.test(candidate.url())
    ));
    if (page) {
      await page.waitForLoadState("domcontentloaded");
      const session = await context.newCDPSession(page);
      let targetInfo: unknown;
      try {
        targetInfo = (await session.send("Target.getTargetInfo")).targetInfo;
      } finally {
        await session.detach().catch(() => {});
      }
      const targetId = rendererTargetIdFromInfo(targetInfo);
      if (!await inspector.ownsRendererTarget(targetId)) {
        throw new Error("Windows Electron Chromium CDP did not connect to the verified renderer");
      }
      return page;
    }
    await delay(100);
  }
  throw new Error("Windows Electron main window did not open");
}

export function rendererTargetIdFromInfo(value: unknown): string {
  const target = value as {
    targetId?: unknown;
    type?: unknown;
    url?: unknown;
  } | null;
  if (
    !target
    || typeof target.targetId !== "string"
    || !target.targetId
    || target.type !== "page"
    || typeof target.url !== "string"
    || !/(?:^|\/)index\.html(?:[?#]|$)/.test(target.url)
  ) {
    throw new Error("Windows Electron Chromium CDP did not expose the desktop renderer target");
  }
  return target.targetId;
}

export function assertDesktopLaunchAlive(
  child: Pick<ChildProcess, "exitCode" | "signalCode">,
  browser: Pick<Browser, "isConnected">,
  inspector: { isConnected(): boolean },
): void {
  if (child.exitCode !== null || child.signalCode !== null) {
    throw new Error("Windows Electron exited before its main window opened");
  }
  if (!browser.isConnected()) {
    throw new Error("Windows Electron Chromium CDP disconnected before its main window opened");
  }
  if (!inspector.isConnected()) {
    throw new Error("Windows Electron node inspector disconnected before its main window opened");
  }
}

async function waitForEndpoint(
  port: number,
  child: ChildProcess,
  childFailure: ChildFailureMonitor,
  kind: "node" | "chromium",
  deadline: number = Date.now() + STARTUP_TIMEOUT_MS,
): Promise<string> {
  const route = kind === "node" ? "/json/list" : "/json/version";
  while (Date.now() < deadline) {
    childFailure.assertReady(kind);
    if (child.exitCode !== null || child.signalCode !== null) {
      throw new Error(`Windows Electron exited before ${kind} CDP was ready`);
    }
    try {
      const remainingMs = deadline - Date.now();
      const response = await fetch(`http://127.0.0.1:${port}${route}`, {
        signal: AbortSignal.timeout(Math.max(
          1,
          Math.min(ENDPOINT_REQUEST_TIMEOUT_MS, remainingMs),
        )),
      });
      if (!response.ok) throw new Error("CDP endpoint did not return HTTP 200");
      const payload = await response.json() as unknown;
      const endpoint = endpointFromPayload(payload, kind, port);
      if (endpoint) return endpoint;
    } catch {
      // Electron has not bound its loopback debugger yet.
    }
    await delay(Math.min(100, Math.max(1, deadline - Date.now())));
  }
  throw new Error(`Windows Electron ${kind} CDP did not become ready`);
}

export function endpointFromPayload(
  payload: unknown,
  kind: "node" | "chromium",
  port: number,
): string | null {
  const candidates = Array.isArray(payload) ? payload : [payload];
  for (const candidate of candidates) {
    if (!candidate || typeof candidate !== "object") continue;
    const endpoint = (candidate as { webSocketDebuggerUrl?: unknown }).webSocketDebuggerUrl;
    if (typeof endpoint !== "string") continue;
    try {
      const parsed = new URL(endpoint);
      if (
        parsed.protocol !== "ws:"
        || !["127.0.0.1", "localhost"].includes(parsed.hostname)
        || parsed.port !== String(port)
        || parsed.username !== ""
        || parsed.password !== ""
      ) {
        continue;
      }
      if (kind === "node" && parsed.pathname === "/") continue;
      // Windows Chromium advertises `localhost` even when its debugger was
      // explicitly bound to 127.0.0.1. The metadata itself was fetched from
      // that numeric loopback address; normalize the WebSocket connection to
      // the same address so hosts-file or resolver state cannot widen trust.
      parsed.hostname = "127.0.0.1";
      return parsed.toString();
    } catch {
      // Only a well-formed loopback WebSocket URL may control Electron.
    }
  }
  return null;
}

class NodeInspectorClient {
  private readonly pending = new Map<number, {
    resolve(response: NodeInspectorResponse): void;
    reject(error: Error): void;
    timer: ReturnType<typeof setTimeout>;
  }>();
  private readonly contexts = new Set<number>();
  private readonly firstContext: Promise<void>;
  private mainContextId: number | null = null;
  private nextId = 0;
  private rejectFirstContext!: (error: Error) => void;
  private resolveFirstContext!: () => void;

  private constructor(private readonly socket: WebSocket) {
    this.firstContext = new Promise<void>((resolve, reject) => {
      this.resolveFirstContext = resolve;
      this.rejectFirstContext = reject;
    });
    socket.addEventListener("message", (event) => {
      const message = parseInspectorMessage(event.data);
      if (!message) return;
      const createdContextId = createdExecutionContextId(message);
      if (createdContextId !== null) {
        this.contexts.add(createdContextId);
        this.resolveFirstContext();
      }
      const destroyedContextId = destroyedExecutionContextId(message);
      if (destroyedContextId !== null) {
        this.contexts.delete(destroyedContextId);
        if (this.mainContextId === destroyedContextId) this.mainContextId = null;
      }
      if (typeof message.id !== "number") return;
      const pending = this.pending.get(message.id);
      if (!pending) return;
      this.pending.delete(message.id);
      clearTimeout(pending.timer);
      pending.resolve(message);
    });
    socket.addEventListener("close", () => this.rejectPending());
    socket.addEventListener("error", () => this.rejectPending());
  }

  static async connect(endpoint: string): Promise<NodeInspectorClient> {
    const socket = new WebSocket(endpoint);
    await waitForWebSocketOpen(socket);
    const client = new NodeInspectorClient(socket);
    try {
      await client.send("Runtime.enable");
      await withTimeout(
        client.firstContext,
        INSPECTOR_CONNECT_TIMEOUT_MS,
        "Windows Electron node inspector did not publish an execution context",
      );
      return client;
    } catch (error) {
      client.close();
      throw error;
    }
  }

  async evaluate<R, Arg>(pageFunction: unknown, arg?: Arg): Promise<R> {
    const argument = serializeEvaluationArgument(arg);
    const contextId = this.requireMainContext();
    const response = await this.send("Runtime.evaluate", {
      expression: `(async () => (${String(pageFunction)})(require('electron'), ${argument}))()`,
      awaitPromise: true,
      contextId,
      includeCommandLineAPI: true,
      returnByValue: true,
      userGesture: true,
    }, INSPECTOR_EVALUATE_TIMEOUT_MS);
    if (response.error || response.result?.exceptionDetails) {
      throw new Error("Windows Electron main-process evaluation failed");
    }
    return response.result?.result?.value as R;
  }

  async assertIdentity(expected: InspectorIdentity): Promise<void> {
    const tokenArgument = `--hana-windows-cdp-token=${expected.token}`;
    const deadline = Date.now() + INSPECTOR_CONNECT_TIMEOUT_MS;
    while (Date.now() < deadline) {
      for (const contextId of this.contexts) {
        const response = await this.send("Runtime.evaluate", {
          expression: `({ pid: process.pid, token: process.argv.includes(${JSON.stringify(tokenArgument)}) ? ${JSON.stringify(expected.token)} : null })`,
          contextId,
          includeCommandLineAPI: true,
          returnByValue: true,
        });
        if (response.error || response.result?.exceptionDetails) continue;
        try {
          assertInspectorIdentity(response.result?.result?.value, expected);
          this.mainContextId = contextId;
          return;
        } catch {
          // A preload context can share the inspector but not the app argv.
        }
      }
      await delay(Math.min(50, Math.max(1, deadline - Date.now())));
    }
    throw new Error("Windows Electron could not verify its node inspector identity");
  }

  async assertChromiumConfiguration(expectedPort: number): Promise<void> {
    const contextId = this.requireMainContext();
    const response = await this.send("Runtime.evaluate", {
      expression: `(() => {
        const { app } = require('electron');
        return {
          commandLinePort: app.commandLine.getSwitchValue('remote-debugging-port'),
          commandLineUserDataConfigured: app.commandLine.getSwitchValue('user-data-dir') !== '',
        };
      })()`,
      contextId,
      includeCommandLineAPI: true,
      returnByValue: true,
    });
    if (response.error || response.result?.exceptionDetails) {
      throw new Error("Windows Electron could not inspect its Chromium CDP configuration");
    }
    assertChromiumConfiguration(response.result?.result?.value, expectedPort);
  }

  async ownsRendererTarget(targetId: string): Promise<boolean> {
    return this.evaluate<boolean, string>(
      ({ BrowserWindow, webContents }, id) => {
        const contents = webContents.fromDevToolsTargetId(id);
        if (!contents || contents.isDestroyed()) return false;
        const window = BrowserWindow.fromWebContents(contents);
        return !!window
          && /(?:^|\/)index\.html(?:[?#]|$)/.test(contents.getURL());
      },
      targetId,
    );
  }

  isConnected(): boolean {
    return this.socket.readyState === WebSocket.OPEN;
  }

  close(): void {
    this.socket.close();
    this.rejectPending();
  }

  private send(
    method: string,
    params?: Record<string, unknown>,
    timeoutMs: number = INSPECTOR_REQUEST_TIMEOUT_MS,
  ): Promise<NodeInspectorResponse> {
    const id = ++this.nextId;
    return new Promise<NodeInspectorResponse>((resolve, reject) => {
      const timer = setTimeout(() => {
        if (!this.pending.delete(id)) return;
        reject(new Error(`Windows Electron node inspector ${method} timed out`));
      }, timeoutMs);
      this.pending.set(id, { resolve, reject, timer });
      try {
        this.socket.send(JSON.stringify({ id, method, params }));
      } catch {
        this.pending.delete(id);
        clearTimeout(timer);
        reject(new Error(`Windows Electron node inspector could not send ${method}`));
      }
    });
  }

  private rejectPending(): void {
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timer);
      pending.reject(new Error("Windows Electron node inspector disconnected"));
    }
    this.pending.clear();
    if (this.contexts.size === 0) {
      this.rejectFirstContext(new Error("Windows Electron node inspector disconnected"));
    }
  }

  private requireMainContext(): number {
    if (this.mainContextId === null || !this.contexts.has(this.mainContextId)) {
      throw new Error("Windows Electron node inspector lost its verified main context");
    }
    return this.mainContextId;
  }
}

export function assertInspectorIdentity(
  actual: unknown,
  expected: InspectorIdentity,
): void {
  const candidate = actual as Partial<InspectorIdentity> | null;
  if (
    !candidate
    || !Number.isInteger(candidate.pid)
    || candidate.pid !== expected.pid
    || candidate.token !== expected.token
  ) {
    throw new Error("Windows Electron inspector endpoint did not belong to the spawned application");
  }
}

export function assertChromiumConfiguration(
  actual: unknown,
  expectedPort: number,
): void {
  const candidate = actual as Partial<ElectronChromiumConfiguration> | null;
  if (!candidate || candidate.commandLinePort !== String(expectedPort)) {
    throw new Error("Windows Electron early loader did not retain the requested CDP port");
  }
  if (candidate.commandLineUserDataConfigured !== true) {
    throw new Error("Windows Electron command line did not retain its isolated user data directory");
  }
}

function createdExecutionContextId(message: NodeInspectorMessage): number | null {
  const context = message.method === "Runtime.executionContextCreated"
    ? message.params?.context
    : undefined;
  return Number.isInteger(context?.id)
    ? Number(context.id)
    : null;
}

function destroyedExecutionContextId(message: NodeInspectorMessage): number | null {
  const contextId = message.method === "Runtime.executionContextDestroyed"
    ? message.params?.executionContextId
    : undefined;
  return Number.isInteger(contextId) ? Number(contextId) : null;
}

function serializeEvaluationArgument(arg: unknown): string {
  if (arg === undefined) return "undefined";
  try {
    const serialized = JSON.stringify(arg);
    if (serialized !== undefined) return serialized;
  } catch {
    // The caller receives the same generic contract failure for non-JSON input.
  }
  throw new Error("Windows Electron evaluation argument is not serializable");
}

function parseInspectorMessage(data: unknown): NodeInspectorMessage | null {
  try {
    const text = typeof data === "string"
      ? data
      : Buffer.from(data as ArrayBuffer).toString("utf8");
    return JSON.parse(text) as NodeInspectorMessage;
  } catch {
    return null;
  }
}

function monitorChildFailure(child: ChildProcess): ChildFailureMonitor {
  let failure = false;
  child.once("error", () => {
    failure = true;
  });
  return {
    assertReady(kind) {
      if (failure) {
        throw new Error(`Windows Electron could not start its ${kind} CDP endpoint`);
      }
    },
  };
}

async function waitForWebSocketOpen(socket: WebSocket): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    let settled = false;
    const finish = (callback: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      callback();
    };
    const timer = setTimeout(() => {
      socket.close();
      finish(() => reject(new Error("Windows Electron node inspector connection timed out")));
    }, INSPECTOR_CONNECT_TIMEOUT_MS);
    socket.addEventListener("open", () => finish(resolve), { once: true });
    socket.addEventListener("close", () => finish(() => reject(
      new Error("Windows Electron node inspector closed before connection"),
    )), { once: true });
    socket.addEventListener("error", () => finish(() => reject(
      new Error("Windows Electron node inspector connection failed"),
    )), { once: true });
  });
}

async function terminateChild(child: ChildProcess): Promise<void> {
  if (child.exitCode !== null || child.signalCode !== null || !child.pid) return;
  if (process.platform === "win32") {
    const taskkill = spawn("taskkill.exe", ["/PID", String(child.pid), "/T", "/F"], {
      windowsHide: true,
      stdio: "ignore",
    });
    if (!await waitForProcessExit(taskkill, CHILD_TERMINATION_TIMEOUT_MS)) {
      taskkill.kill();
      if (!await waitForProcessExit(child, CHILD_TERMINATION_TIMEOUT_MS)) {
        throw new Error("Windows Electron taskkill did not complete");
      }
      return;
    }
    if (!await waitForProcessExit(child, CHILD_TERMINATION_TIMEOUT_MS)) {
      throw new Error("Windows Electron child did not exit after taskkill");
    }
    return;
  }
  child.kill("SIGTERM");
  if (!await waitForProcessExit(child, CHILD_TERMINATION_TIMEOUT_MS)) {
    child.kill("SIGKILL");
    if (!await waitForProcessExit(child, CHILD_TERMINATION_TIMEOUT_MS)) {
      throw new Error("Windows Electron child did not exit after SIGKILL");
    }
  }
}

async function waitForProcessExit(
  child: ChildProcess,
  timeoutMs: number,
): Promise<boolean> {
  if (child.exitCode !== null || child.signalCode !== null) return true;
  return new Promise<boolean>((resolve) => {
    let settled = false;
    const timer = setTimeout(() => finish(false), timeoutMs);
    function finish(result: boolean): void {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      child.off("exit", onExit);
      child.off("error", onError);
      resolve(result);
    }
    const onExit = () => finish(true);
    const onError = () => finish(false);
    child.once("exit", onExit);
    child.once("error", onError);
  });
}

async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  message: string,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_resolve, reject) => {
        timer = setTimeout(() => reject(new Error(message)), timeoutMs);
      }),
    ]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}
