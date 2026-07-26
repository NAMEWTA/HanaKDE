import { spawn, type ChildProcess } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDeviceCredential } from "../core/device-registry.ts";
import type { CompositionRoot } from "../server/composition/contract.ts";
import { registerOpenRoutes } from "../server/composition/open-root.ts";
import {
  builtinMediaAdapters,
  registerClosedRoutes,
} from "../server/composition/full-root.ts";
import {
  knowledgeAddressToMarkdownRelativePath,
  parseKnowledgeResourceAddress,
} from "../shared/knowledge-workspace-contract.ts";

const ROOT = process.cwd();
const TEMP_RM_OPTIONS = {
  recursive: true,
  force: true,
  maxRetries: 20,
  retryDelay: 250,
} as const;

type SpawnedComposition = {
  baseUrl: string;
  child: ChildProcess;
  getStderr(): string;
  hanaHome: string;
  serverNodeId: string;
  token: string;
  workspaceRoot: string;
};

function waitForExit(child: ChildProcess, timeoutMs: number): Promise<boolean> {
  return new Promise((resolve) => {
    if (child.exitCode !== null || child.signalCode !== null) {
      resolve(true);
      return;
    }
    const timer = setTimeout(() => {
      child.off("exit", onExit);
      resolve(false);
    }, timeoutMs);
    const onExit = () => {
      clearTimeout(timer);
      resolve(true);
    };
    child.once("exit", onExit);
  });
}

async function stopComposition(child: ChildProcess): Promise<void> {
  if (child.exitCode !== null || child.signalCode !== null) return;
  child.kill("SIGTERM");
  if (await waitForExit(child, 5_000)) return;
  child.kill("SIGKILL");
  if (!(await waitForExit(child, 15_000))) {
    throw new Error(`server process ${child.pid ?? "unknown"} did not exit`);
  }
}

function waitForServerInfo(
  serverInfoPath: string,
  child: ChildProcess,
  getStderr: () => string,
  timeoutMs = 60_000,
): Promise<{
  port: number;
  token: string;
  serverNodeId?: string;
}> {
  return new Promise((resolve, reject) => {
    let exited = false;
    let exitInfo: unknown = null;
    child.once("exit", (code, signal) => {
      exited = true;
      exitInfo = { code, signal };
    });
    const deadline = Date.now() + timeoutMs;
    const poll = () => {
      if (exited) {
        reject(
          new Error(
            `server exited before readiness: ${JSON.stringify(exitInfo)}\n${getStderr()}`,
          ),
        );
        return;
      }
      try {
        const info = JSON.parse(fs.readFileSync(serverInfoPath, "utf-8"));
        if (
          Number.isInteger(info.port)
          && typeof info.token === "string"
          && info.token.length > 0
        ) {
          resolve(info);
          return;
        }
      } catch {
        // Readiness file is written atomically after the listener is ready.
      }
      if (Date.now() >= deadline) {
        reject(new Error(`timed out waiting for server readiness\n${getStderr()}`));
        return;
      }
      setTimeout(poll, 100);
    };
    poll();
  });
}

async function spawnComposition(
  kind: "open" | "full",
  sandboxRoot: string,
): Promise<SpawnedComposition> {
  const hanaHome = path.join(sandboxRoot, `${kind}-hana-home`);
  const userHome = path.join(sandboxRoot, `${kind}-user-home`);
  const tempDir = path.join(sandboxRoot, `${kind}-tmp`);
  const workspaceRoot = path.join(sandboxRoot, `${kind}-workspace`);
  const sourceRoot = path.join(workspaceRoot, "source");
  fs.mkdirSync(hanaHome, { recursive: true });
  fs.mkdirSync(userHome, { recursive: true });
  fs.mkdirSync(tempDir, { recursive: true });
  fs.mkdirSync(sourceRoot, { recursive: true });
  const child = spawn(process.execPath, ["server/bootstrap.ts"], {
    cwd: ROOT,
    env: {
      ...process.env,
      HOME: userHome,
      USERPROFILE: userHome,
      XDG_CONFIG_HOME: path.join(userHome, ".config"),
      TMPDIR: tempDir,
      TEMP: tempDir,
      TMP: tempDir,
      HANA_HOME: hanaHome,
      HANA_PORT: "0",
      // HANA_ROOT is the read-only product/runtime root, not a knowledge
      // workspace. The writable workspace/source fixture remains sandboxed.
      HANA_ROOT: ROOT,
      HANA_SERVER_ENTRY: path.join(
        ROOT,
        "server",
        kind === "open" ? "main-open.ts" : "main-full.ts",
      ),
      HANA_CREATE_STARTUP_SESSION: "0",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let stderr = "";
  child.stderr?.on("data", (chunk) => {
    stderr += String(chunk);
  });
  child.stdout?.resume();
  const getStderr = () => stderr;
  try {
    const info = await waitForServerInfo(
      path.join(hanaHome, "server-info.json"),
      child,
      getStderr,
    );
    return {
      baseUrl: `http://127.0.0.1:${info.port}`,
      child,
      getStderr,
      hanaHome,
      serverNodeId:
        typeof info.serverNodeId === "string"
          ? info.serverNodeId
          : `${kind}-server-node`,
      token: info.token,
      workspaceRoot,
    };
  } catch (error) {
    await stopComposition(child);
    throw error;
  }
}

function issueRemoteCredential(
  server: SpawnedComposition,
  scopes: string[],
): string {
  return createDeviceCredential(server.hanaHome, {
    serverNodeId: server.serverNodeId,
    userId: "remote-user",
    studioIds: ["remote-studio"],
    displayName: "Remote browser",
    deviceKind: "browser",
    trustState: "lan",
    scopes,
  }).secret;
}

async function assertSharedKnowledgeSecurity(
  server: SpawnedComposition,
): Promise<void> {
  const endpoint = `${server.baseUrl}/api/resource-io/write`;
  const unauthenticated = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      resource: { kind: "local-file", path: "/untrusted/a.md" },
      content: "blocked",
    }),
  });
  expect(unauthenticated.status).toBe(403);

  const forged = await fetch(endpoint, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${server.token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      resource: { kind: "local-file", path: "/untrusted/a.md" },
      content: "blocked",
      principal: {
        kind: "local_user",
        userId: "forged-user",
        studioId: "forged-studio",
      },
    }),
  });
  expect(forged.status).toBe(400);
  expect(await forged.json()).toEqual({
    error: "Resource mutation authority must come from authenticated context",
    code: "forbidden_resource_authority_field",
    safeMessage:
      "Resource mutation authority must come from authenticated context",
    details: { field: "principal" },
  });
}

describe("real Open/Full knowledge composition", () => {
  let sandboxRoot = "";
  let open: SpawnedComposition;
  let full: SpawnedComposition;

  beforeAll(async () => {
    sandboxRoot = fs.mkdtempSync(
      path.join(os.tmpdir(), "hana-knowledge-compositions-"),
    );
    try {
      open = await spawnComposition("open", sandboxRoot);
      full = await spawnComposition("full", sandboxRoot);
    } catch (error) {
      const running = [open, full].filter(
        (server): server is SpawnedComposition => server !== undefined,
      );
      await Promise.all(running.map((server) => stopComposition(server.child)));
      fs.rmSync(sandboxRoot, TEMP_RM_OPTIONS);
      throw error;
    }
  }, 120_000);

  afterAll(async () => {
    const running = [open, full].filter(
      (server): server is SpawnedComposition => server !== undefined,
    );
    await Promise.all(running.map((server) => stopComposition(server.child)));
    fs.rmSync(sandboxRoot, TEMP_RM_OPTIONS);
    if (process.env.HANA_TEST_DEBUG) {
      for (const server of running) process.stderr.write(server.getStderr());
    }
  });

  it("KW-US-004 keeps sourceKey internal when the shared contract is imported by Node", () => {
    const parsed = parseKnowledgeResourceAddress({
      sourceKey: "research",
      relativePath: "Notes/A.md",
    });
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) throw new Error("expected valid address");
    expect(knowledgeAddressToMarkdownRelativePath(parsed.value)).toBe(
      "Notes/A.md",
    );
  });

  it("KW-US-164 runs the same shared security contract in real independent Open and Full Node servers", async () => {
    expect(open.workspaceRoot.startsWith(sandboxRoot)).toBe(true);
    expect(full.workspaceRoot.startsWith(sandboxRoot)).toBe(true);
    expect(open.workspaceRoot).not.toBe(ROOT);
    expect(full.workspaceRoot).not.toBe(ROOT);

    await Promise.all([
      assertSharedKnowledgeSecurity(open),
      assertSharedKnowledgeSecurity(full),
    ]);

    const [openHealth, fullHealth] = await Promise.all([
      fetch(`${open.baseUrl}/api/health`, {
        headers: { Authorization: `Bearer ${open.token}` },
      }),
      fetch(`${full.baseUrl}/api/health`, {
        headers: { Authorization: `Bearer ${full.token}` },
      }),
    ]);
    expect(openHealth.status).toBe(200);
    expect(fullHealth.status).toBe(200);
    expect(Object.keys(await openHealth.json()).sort()).toEqual(
      Object.keys(await fullHealth.json()).sort(),
    );
  });

  it("KW-US-163 rejects non-owner/scope web credentials identically without side effects", async () => {
    const openToken = issueRemoteCredential(open, ["files.write"]);
    const fullToken = issueRemoteCredential(full, ["files.write"]);
    const target = (server: SpawnedComposition) =>
      path.join(server.workspaceRoot, "source", "blocked.md");
    const request = (server: SpawnedComposition, token: string) =>
      fetch(`${server.baseUrl}/api/resource-io/write`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          resource: { kind: "local-file", path: target(server) },
          content: "blocked",
        }),
      });

    const [openResponse, fullResponse] = await Promise.all([
      request(open, openToken),
      request(full, fullToken),
    ]);
    expect(openResponse.status).toBe(403);
    expect(fullResponse.status).toBe(403);
    expect(await openResponse.json()).toEqual(await fullResponse.json());
    expect(fs.existsSync(target(open))).toBe(false);
    expect(fs.existsSync(target(full))).toBe(false);

    const openOwnerToken = issueRemoteCredential(
      open,
      ["studio.owner", "files.write"],
    );
    const fullOwnerToken = issueRemoteCredential(
      full,
      ["studio.owner", "files.write"],
    );
    const outsideTarget = path.join(sandboxRoot, "outside-source.md");
    const outsideRequest = (
      server: SpawnedComposition,
      token: string,
    ) =>
      fetch(`${server.baseUrl}/api/resource-io/write`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          resource: { kind: "local-file", path: outsideTarget },
          content: "blocked",
        }),
      });
    const [openOutside, fullOutside] = await Promise.all([
      outsideRequest(open, openOwnerToken),
      outsideRequest(full, fullOwnerToken),
    ]);
    expect(openOutside.status).toBe(403);
    expect(fullOutside.status).toBe(403);
    const openOutsideBody = await openOutside.json();
    const fullOutsideBody = await fullOutside.json();
    expect(openOutsideBody).toEqual(fullOutsideBody);
    expect(JSON.stringify(openOutsideBody)).not.toContain(sandboxRoot);
    expect(fs.existsSync(outsideTarget)).toBe(false);
  });

  it("KW-US-172 keeps Open free of the closed static import and closed route", async () => {
    const mainOpenSource = fs.readFileSync(
      path.join(ROOT, "server", "main-open.ts"),
      "utf-8",
    );
    const openRootSource = fs.readFileSync(
      path.join(ROOT, "server", "composition", "open-root.ts"),
      "utf-8",
    );
    expect(mainOpenSource).not.toContain("full-root");
    expect(openRootSource).not.toContain("full-root");

    const openDiary = await fetch(`${open.baseUrl}/api/diary/list`, {
      headers: { Authorization: `Bearer ${open.token}` },
    });
    expect(openDiary.status).toBe(404);
  });

  it("KW-US-173 injects only Full behavior without changing the shared protocol", async () => {
    const fullDiary = await fetch(`${full.baseUrl}/api/diary/list`, {
      headers: { Authorization: `Bearer ${full.token}` },
    });
    expect(fullDiary.status).toBe(200);
    expect(Array.isArray((await fullDiary.json()).files)).toBe(true);

    await Promise.all([
      assertSharedKnowledgeSecurity(open),
      assertSharedKnowledgeSecurity(full),
    ]);

    const openRoot: CompositionRoot = {};
    const fullRoot: CompositionRoot = {
      registerClosedRoutes,
      builtinMediaAdapters,
    };
    expect(registerOpenRoutes).toBeTypeOf("function");
    expect(openRoot.registerClosedRoutes).toBeUndefined();
    expect(openRoot.builtinMediaAdapters).toBeUndefined();
    expect(fullRoot.registerClosedRoutes).toBe(registerClosedRoutes);
    expect(fullRoot.builtinMediaAdapters).toBe(builtinMediaAdapters);
  });
});
