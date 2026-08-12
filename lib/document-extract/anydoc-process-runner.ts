import { fork, spawn, type ChildProcess } from "node:child_process";
import { fileURLToPath } from "node:url";

export type DocumentConversionRunner = {
  convertBytes(bytes: Uint8Array, format: string, signal?: AbortSignal): Promise<string>;
  convertMaterializedPath(filePath: string, signal?: AbortSignal): Promise<string>;
};

export type HtmlConversionRunner = {
  convertHtml(bytes: Uint8Array, signal?: AbortSignal): Promise<string>;
};

export const MAX_DERIVED_MARKDOWN_BYTES = 50 * 1024 * 1024;

export function normalizeDerivedMarkdownLimit(value?: number): number {
  if (value === undefined) return MAX_DERIVED_MARKDOWN_BYTES;
  if (!Number.isSafeInteger(value) || value < 1 || value > MAX_DERIVED_MARKDOWN_BYTES) {
    throw new RangeError("Document conversion output limit must be a positive integer within the shared maximum.");
  }
  return value;
}

type WorkerFailureCode = "parse-failed" | "scanned-pdf";

type WorkerRequest =
  | {
      kind: "bytes";
      bytes: Uint8Array;
      format: string;
      modulePath: string;
    }
  | {
      kind: "materialized-path";
      filePath: string;
      modulePath: string;
    }
  | {
      kind: "html";
      bytes: Uint8Array;
    };

type WorkerResponse = {
  type?: unknown;
  ok?: unknown;
  markdown?: unknown;
  failureCode?: unknown;
};

type WorkerResult =
  | { ok: true; markdown: string }
  | { ok: false; failureCode: WorkerFailureCode };

export class DocumentConversionProcessError extends Error {
  readonly conversionFailureCode: WorkerFailureCode;

  constructor(conversionFailureCode: WorkerFailureCode = "parse-failed") {
    super("Document conversion process failed.");
    this.name = "DocumentConversionProcessError";
    this.conversionFailureCode = conversionFailureCode;
  }
}

export function isScannedPdfConversionError(error: unknown): boolean {
  return error instanceof DocumentConversionProcessError
    && error.conversionFailureCode === "scanned-pdf";
}

export interface AnydocProcessRunnerOptions {
  childScript?: string;
  getModulePath?: () => string;
  onChildStarted?: (pid: number) => void;
  maxOutputBytes?: number;
  processControl?: ChildProcessControlOptions;
}

export interface HtmlProcessRunnerOptions {
  childScript?: string;
  onChildStarted?: (pid: number) => void;
  maxOutputBytes?: number;
}

export interface ChildProcessControlOptions {
  platform?: NodeJS.Platform;
  spawnTaskkill?: (pid: number) => ChildProcess;
  windowsTaskkillTimeoutMs?: number;
  // Test seam for parent-side ChildProcess transport failures.
  forkChild?: (childScript: string, options: IsolatedForkOptions) => ChildProcess;
}

type IsolatedForkOptions = {
  detached: boolean;
  env: Record<string, string>;
  execArgv: string[];
  serialization: "advanced";
  stdio: ["ignore", "ignore", "ignore", "ipc"];
};

type ResolvedChildProcessControl = {
  platform: NodeJS.Platform;
  spawnTaskkill: (pid: number) => ChildProcess;
  windowsTaskkillTimeoutMs: number;
  forkChild?: (childScript: string, options: IsolatedForkOptions) => ChildProcess;
};

const DEFAULT_ANYDOC_CHILD_SCRIPT = fileURLToPath(new URL("./anydoc-child.cjs", import.meta.url));
const DEFAULT_HTML_CHILD_SCRIPT = fileURLToPath(new URL("./html-child.ts", import.meta.url));

/**
 * Anydoc uses the libuv thread pool and exposes no abort API. Each conversion
 * therefore runs in a short-lived child which is reaped before its caller can
 * release a Materialize lease.
 */
export class AnydocProcessRunner implements DocumentConversionRunner {
  private readonly runner: IsolatedChildRunner;
  private readonly getModulePath: () => string;

  constructor({
    childScript = DEFAULT_ANYDOC_CHILD_SCRIPT,
    getModulePath = () => "",
    onChildStarted,
    maxOutputBytes,
    processControl,
  }: AnydocProcessRunnerOptions = {}) {
    this.runner = new IsolatedChildRunner({
      childScript,
      onChildStarted,
      maxOutputBytes,
      processControl,
    });
    this.getModulePath = getModulePath;
  }

  async convertBytes(bytes: Uint8Array, format: string, signal?: AbortSignal): Promise<string> {
    return this.runner.run({
      kind: "bytes",
      bytes: Buffer.from(bytes),
      format,
      modulePath: this.getModulePath(),
    }, signal);
  }

  async convertMaterializedPath(filePath: string, signal?: AbortSignal): Promise<string> {
    return this.runner.run({
      kind: "materialized-path",
      filePath,
      modulePath: this.getModulePath(),
    }, signal);
  }
}

/** HTML parsing is also isolated so cancellation never leaves host JS parsing. */
export class HtmlProcessRunner implements HtmlConversionRunner {
  private readonly runner: IsolatedChildRunner;

  constructor({
    childScript = DEFAULT_HTML_CHILD_SCRIPT,
    onChildStarted,
    maxOutputBytes,
  }: HtmlProcessRunnerOptions = {}) {
    this.runner = new IsolatedChildRunner({
      childScript,
      execArgv: ["--experimental-strip-types"],
      onChildStarted,
      maxOutputBytes,
    });
  }

  convertHtml(bytes: Uint8Array, signal?: AbortSignal): Promise<string> {
    return this.runner.run({ kind: "html", bytes: Buffer.from(bytes) }, signal);
  }
}

class IsolatedChildRunner {
  private readonly childScript: string;
  private readonly execArgv: string[];
  private readonly onChildStarted?: (pid: number) => void;
  private readonly maxOutputBytes: number;
  private readonly processControl: ResolvedChildProcessControl;

  constructor({
    childScript,
    execArgv = [],
    onChildStarted,
    maxOutputBytes = MAX_DERIVED_MARKDOWN_BYTES,
    processControl,
  }: {
    childScript: string;
    execArgv?: string[];
    onChildStarted?: (pid: number) => void;
    maxOutputBytes?: number;
    processControl?: ChildProcessControlOptions;
  }) {
    this.childScript = childScript;
    this.execArgv = execArgv;
    this.onChildStarted = onChildStarted;
    this.maxOutputBytes = normalizeDerivedMarkdownLimit(maxOutputBytes);
    this.processControl = {
      platform: processControl?.platform ?? process.platform,
      spawnTaskkill: processControl?.spawnTaskkill ?? defaultSpawnTaskkill,
      windowsTaskkillTimeoutMs: normalizeTaskkillTimeout(processControl?.windowsTaskkillTimeoutMs),
      forkChild: processControl?.forkChild,
    };
  }

  run(request: WorkerRequest, signal?: AbortSignal): Promise<string> {
    throwIfAborted(signal);
    return new Promise((resolve, reject) => {
      let child: ChildProcess;
      try {
        const forkOptions: IsolatedForkOptions = {
          detached: this.processControl.platform !== "win32",
          env: childEnvironment(),
          execArgv: this.execArgv,
          serialization: "advanced",
          stdio: ["ignore", "ignore", "ignore", "ipc"],
        };
        child = this.processControl.forkChild
          ? this.processControl.forkChild(this.childScript, forkOptions)
          : fork(this.childScript, [], forkOptions);
      } catch (error) {
        reject(error);
        return;
      }

      let settled = false;
      let stopping: Promise<void> | null = null;
      let started = false;
      let result: WorkerResult | null = null;
      const finish = (): boolean => {
        if (settled) return false;
        settled = true;
        signal?.removeEventListener("abort", onAbort);
        return true;
      };
      const finishResolve = (markdown: string) => {
        if (finish()) resolve(markdown);
      };
      const finishReject = (error: Error) => {
        if (finish()) reject(error);
      };
      const stopAndReject = (error: Error) => {
        if (settled || stopping) return;
        stopping = terminateChild(child, this.processControl);
        void stopping.then(
          () => finishReject(error),
          () => finishReject(error),
        );
      };
      const abort = () => stopAndReject(abortError(signal));
      const onAbort = () => abort();
      const onMessage = (message: WorkerResponse) => {
        if (!message || typeof message !== "object") {
          stopAndReject(new DocumentConversionProcessError());
          return;
        }
        if (message.type === "started") {
          if (started || result || stopping) {
            stopAndReject(new DocumentConversionProcessError());
            return;
          }
          started = true;
          if (typeof child.pid === "number") {
            notifyChildStarted(this.onChildStarted, child.pid);
          }
          return;
        }
        if (message.type !== "result" || !started || result || stopping) {
          stopAndReject(new DocumentConversionProcessError());
          return;
        }
        const parsed = parseWorkerResult(message, this.maxOutputBytes);
        if (!parsed) {
          stopAndReject(new DocumentConversionProcessError());
          return;
        }
        if (parsed.ok === false) {
          stopAndReject(new DocumentConversionProcessError(parsed.failureCode));
          return;
        }
        result = parsed;
      };
      const onError = () => {
        if (signal?.aborted) {
          abort();
          return;
        }
        stopAndReject(new DocumentConversionProcessError());
      };
      const onDisconnect = () => {
        // A worker closes its IPC channel as part of a normal exit. Once a
        // valid result is in hand, exit status remains the success authority.
        if (result?.ok) return;
        onError();
      };
      const onExit = (code: number | null, exitSignal: NodeJS.Signals | null) => {
        if (settled || stopping) return;
        if (signal?.aborted) {
          abort();
          return;
        }
        if (result?.ok && code === 0 && exitSignal === null) {
          finishResolve(result.markdown);
          return;
        }
        stopAndReject(new DocumentConversionProcessError());
      };

      child.on("message", onMessage);
      child.once("error", onError);
      child.once("disconnect", onDisconnect);
      child.once("exit", onExit);
      signal?.addEventListener("abort", onAbort, { once: true });
      if (signal?.aborted) {
        abort();
        return;
      }
      if (typeof child.send !== "function") {
        stopAndReject(new DocumentConversionProcessError());
        return;
      }
      child.send({ ...request, maxOutputBytes: this.maxOutputBytes }, (error) => {
        if (!error || settled || stopping) return;
        if (signal?.aborted) {
          abort();
          return;
        }
        stopAndReject(new DocumentConversionProcessError());
      });
    });
  }
}

function parseWorkerResult(message: WorkerResponse, maxOutputBytes: number): WorkerResult | null {
  if (
    message.ok === true
    && typeof message.markdown === "string"
    && Buffer.byteLength(message.markdown, "utf8") <= maxOutputBytes
  ) {
    return { ok: true, markdown: message.markdown };
  }
  if (message.ok === false && isWorkerFailureCode(message.failureCode)) {
    return { ok: false, failureCode: message.failureCode };
  }
  return null;
}

function isWorkerFailureCode(value: unknown): value is WorkerFailureCode {
  return value === "parse-failed" || value === "scanned-pdf";
}

async function terminateChild(
  child: ChildProcess,
  processControl: ResolvedChildProcessControl,
): Promise<void> {
  if (hasExited(child)) return;
  const pid = child.pid;
  if (typeof pid !== "number" || pid <= 0) return;
  const exited = waitForChildExit(child);
  if (processControl.platform === "win32") {
    await terminateWindowsProcessTree(pid, processControl);
    if (!hasExited(child)) {
      killChildIfStillRunning(child);
    }
  } else {
    try {
      process.kill(-pid, "SIGKILL");
    } catch {
      killChildIfStillRunning(child);
    }
  }
  await exited;
}

function hasExited(child: ChildProcess): boolean {
  return child.exitCode !== null || child.signalCode !== null;
}

function waitForChildExit(child: ChildProcess): Promise<void> {
  if (hasExited(child)) return Promise.resolve();
  return new Promise((resolve) => child.once("exit", resolve));
}

async function terminateWindowsProcessTree(
  pid: number,
  processControl: ResolvedChildProcessControl,
): Promise<void> {
  await new Promise<void>((resolve) => {
    let taskkill: ChildProcess | null = null;
    let finished = false;
    const finish = () => {
      if (finished) return;
      finished = true;
      clearTimeout(timeout);
      resolve();
    };
    const timeout = setTimeout(() => {
      killChildIfStillRunning(taskkill);
      finish();
    }, processControl.windowsTaskkillTimeoutMs);
    try {
      taskkill = processControl.spawnTaskkill(pid);
      taskkill.once("close", finish);
      taskkill.once("error", finish);
    } catch {
      finish();
    }
  });
}

const WINDOWS_TASKKILL_TIMEOUT_MS = 5_000;

function defaultSpawnTaskkill(pid: number): ChildProcess {
  return spawn("taskkill", ["/F", "/T", "/PID", String(pid)], {
    stdio: "ignore",
    windowsHide: true,
  });
}

function normalizeTaskkillTimeout(value: number | undefined): number {
  if (value === undefined) return WINDOWS_TASKKILL_TIMEOUT_MS;
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new RangeError("Windows taskkill timeout must be a positive integer.");
  }
  return value;
}

function notifyChildStarted(onChildStarted: ((pid: number) => void) | undefined, pid: number): void {
  try {
    onChildStarted?.(pid);
  } catch {
    // Lifecycle observation must not alter the conversion protocol.
  }
}

function killChildIfStillRunning(child: ChildProcess | null): void {
  if (!child) return;
  try {
    child.kill("SIGKILL");
  } catch {
    // The child can exit between the liveness check and forced termination.
  }
}


function childEnvironment(): Record<string, string> {
  const env: Record<string, string> = {};
  for (const name of [
    "LANG",
    "LC_ALL",
    "LC_CTYPE",
    "LD_LIBRARY_PATH",
    "NAPI_RS_NATIVE_LIBRARY_PATH",
    "PATH",
    "SystemRoot",
    "TEMP",
    "TMP",
    "TMPDIR",
    "WINDIR",
  ]) {
    const value = process.env[name];
    if (typeof value === "string" && value) env[name] = value;
  }
  if (process.versions.electron) env.ELECTRON_RUN_AS_NODE = "1";
  return env;
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw abortError(signal);
}

function abortError(signal?: AbortSignal): Error {
  const reason = signal?.reason;
  if (reason instanceof Error && reason.name === "AbortError") return reason;
  const error = new Error(reason instanceof Error && reason.message ? reason.message : "Document extraction cancelled");
  error.name = "AbortError";
  return error;
}
