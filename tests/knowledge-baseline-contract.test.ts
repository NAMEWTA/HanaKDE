import { Hono } from "hono";
import { describe, expect, it } from "vitest";
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { normalizePrincipal } from "../core/security-principal.ts";
import { ResourceIO } from "../lib/resource-io/resource-io.ts";
import type {
  ResourceDescriptor,
  ResourceProvider,
  ResourceReadResult,
  ResourceRef,
  ResourceStat,
} from "../lib/resource-io/types.ts";
import { createResourceIoRoute } from "../server/routes/resource-io.ts";
import { installNativeDialogStub } from "./knowledge-workspace-e2e/fixtures/native-fixture.ts";
import { createKnowledgeLaunchConfig } from "./knowledge-workspace-e2e/fixtures/server-fixture.ts";
import { createKnowledgeWorkspaceSandbox } from "./knowledge-workspace-e2e/fixtures/workspace-fixture.ts";

const repositoryRoot = process.cwd();
const changeRoot = path.join(
  repositoryRoot,
  "speculo/.speculo/specdev/changes/2026-07-24-openhanako-knowledge-workspace",
);

function setHonoContext(
  context: unknown,
  key: string,
  value: unknown,
): void {
  (
    context as {
      set(contextKey: string, contextValue: unknown): void;
    }
  ).set(key, value);
}

function useBaselineLocalOwnerAuth(app: Hono): void {
  app.use("*", async (c, next) => {
    setHonoContext(c, "authPrincipal", normalizePrincipal({
      kind: "local_user",
      userId: "baseline-user",
      studioId: "baseline-studio",
      connectionKind: "local",
      credentialKind: "loopback_token",
      scopes: ["chat", "resources", "tools"],
    }));
    setHonoContext(c, "transportConnectionKind", "local");
    await next();
  });
}

function readPackageContract(): {
  devDependencies?: Record<string, string>;
  scripts?: Record<string, string>;
} {
  return JSON.parse(
    fs.readFileSync(path.join(repositoryRoot, "package.json"), "utf8"),
  );
}

function markdownTableRows(markdown: string, idPrefix: string): string[][] {
  return markdown
    .split("\n")
    .filter((line) => line.startsWith(`| ${idPrefix}`))
    .map((line) =>
      line
        .slice(1, -1)
        .split("|")
        .map((cell) => cell.trim()),
    );
}

function runImportProbe(
  workspace: Awaited<ReturnType<typeof createKnowledgeWorkspaceSandbox>>,
): Promise<{ code: number | null; signal: NodeJS.Signals | null; stdout: string; stderr: string }> {
  const launchConfig = createKnowledgeLaunchConfig(workspace);
  const source = `
    const [openRoot, fullRoot, server] = await Promise.all([
      import("./server/composition/open-root.ts"),
      import("./server/composition/full-root.ts"),
      import("./server/index.ts"),
    ]);
    process.stdout.write(JSON.stringify({
      open: typeof openRoot.registerOpenRoutes,
      full: typeof fullRoot.registerClosedRoutes,
      adapters: Array.isArray(fullRoot.builtinMediaAdapters) ? fullRoot.builtinMediaAdapters.length : -1,
      serverExports: Object.keys(server).sort(),
    }));
  `;
  return new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      ["--input-type=module", "--eval", source],
      {
        cwd: repositoryRoot,
        env: launchConfig.env,
        stdio: ["ignore", "pipe", "pipe"],
      },
    );
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += String(chunk);
    });
    child.stderr.on("data", (chunk) => {
      stderr += String(chunk);
    });
    const timeout = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error(`composition import probe timed out; stderr=${stderr}`));
    }, 20_000);
    child.once("close", (code, signal) => {
      clearTimeout(timeout);
      resolve({ code, signal, stdout, stderr });
    });
  });
}

function localDescriptor(ref: ResourceRef): ResourceDescriptor {
  if (ref.kind !== "local-file") {
    throw new Error(`local adapter received ${ref.kind}`);
  }
  return { ...ref, provider: "local_fs", displayName: path.basename(ref.path) };
}

function mountDescriptor(ref: ResourceRef): ResourceDescriptor {
  if (ref.kind !== "mount") {
    throw new Error(`mount adapter received ${ref.kind}`);
  }
  return { ...ref, provider: "mount", displayName: path.posix.basename(ref.path) };
}

function createBaselineResourceIO(): ResourceIO {
  const localProvider: ResourceProvider = {
    id: "local_fs",
    capabilities: () => ({ stat: true, read: true }),
    async stat(ref): Promise<ResourceStat> {
      return {
        resourceKey: "local_fs:/workspace/notes.md",
        resource: localDescriptor(ref),
        exists: true,
        isDirectory: false,
        version: { sha256: "baseline-v1" },
      };
    },
    async read(ref): Promise<ResourceReadResult> {
      return {
        resourceKey: "local_fs:/workspace/notes.md",
        resource: localDescriptor(ref),
        content: Buffer.from("# Baseline\n"),
        version: { sha256: "baseline-v1" },
      };
    },
  };
  const mountProvider: ResourceProvider = {
    id: "mount",
    capabilities: () => ({ stat: true, read: false }),
    async stat(ref): Promise<ResourceStat> {
      return {
        resourceKey: "mount:reference:notes.md",
        resource: mountDescriptor(ref),
        exists: true,
        isDirectory: false,
        version: { etag: "reference-v1" },
      };
    },
  };
  return new ResourceIO({
    providers: {
      local_fs: localProvider,
      mount: mountProvider,
    },
  });
}

describe("KW-RULE-TEST fixed test-stack contract", () => {
  it("pins Playwright before product work begins", () => {
    const packageContract = readPackageContract();

    expect(packageContract.devDependencies?.["@playwright/test"]).toBe("1.62.0");
  });

  it("keeps the four frozen knowledge E2E entry points", () => {
    const packageContract = readPackageContract();

    expect(packageContract.scripts).toMatchObject({
      "test:knowledge:e2e":
        "playwright test -c tests/knowledge-workspace-e2e/playwright.config.ts",
      "test:knowledge:e2e:desktop":
        "playwright test -c tests/knowledge-workspace-e2e/playwright.config.ts --project=desktop-full",
      "test:knowledge:e2e:open":
        "playwright test -c tests/knowledge-workspace-e2e/playwright.config.ts --project=web-open",
      "test:knowledge:e2e:full":
        "playwright test -c tests/knowledge-workspace-e2e/playwright.config.ts --project=web-full",
    });
  });

  it("excludes non-Vitest suites through shared Vitest discovery", async () => {
    const vitestConfig = (await import("../vitest.config.js")).default;
    expect(vitestConfig.test?.exclude).toContain("silverbullet/**");
    expect(vitestConfig.test?.exclude).toContain(
      "tests/knowledge-workspace-e2e/specs/**",
    );
  });

  it("defines the three frozen projects and failure artifacts through Playwright's public config", async () => {
    const config = (
      await import("./knowledge-workspace-e2e/playwright.config.ts")
    ).default;

    expect(config.projects?.map((project) => project.name)).toEqual([
      "desktop-full",
      "web-open",
      "web-full",
    ]);
    expect(config).toMatchObject({
      testDir: "./specs",
      outputDir: "./artifacts",
      retries: 0,
      preserveOutput: "never",
      workers: 1,
      use: {
        trace: "off",
        screenshot: "off",
        video: "off",
      },
    });
  });

  it("launches the web E2E Vite process through Node instead of a Windows command shell", () => {
    const appFixture = fs.readFileSync(
      path.join(
        repositoryRoot,
        "tests/knowledge-workspace-e2e/fixtures/app-fixture.ts",
      ),
      "utf8",
    );

    expect(appFixture).toContain(
      'path.resolve("node_modules", "vite", "bin", "vite.js")',
    );
    expect(appFixture).toContain("windowsHide: true");
    expect(appFixture).not.toContain("vite.cmd");
    expect(appFixture).not.toContain("shell: process.platform === \"win32\"");
  });

  it("builds isolated launch configs without inheriting user or Hana environment", async () => {
    const first = await createKnowledgeWorkspaceSandbox(0);
    const second = await createKnowledgeWorkspaceSandbox(0);
    try {
      const inheritedEnvironment = {
        PATH: "/test/bin",
        HANA_TOKEN: "must-not-leak",
        HANA_HOME: "/real/home",
        HOME: "/real/user",
        USERPROFILE: "C:\\real-user",
        SECRET_UNRELATED: "must-not-leak",
      };
      const firstLaunch = createKnowledgeLaunchConfig(
        first,
        inheritedEnvironment,
        repositoryRoot,
        "darwin",
      );
      const secondLaunch = createKnowledgeLaunchConfig(second, {});
      const parsedUserHome = path.parse(first.userHome);
      const relativeUserHome = first.userHome.slice(parsedUserHome.root.length);
      const expectedHomePath = relativeUserHome.startsWith(path.sep)
        ? relativeUserHome
        : `${path.sep}${relativeUserHome}`;

      expect(first.rootDir).not.toBe(second.rootDir);
      expect(first.hanaHome).not.toBe(second.hanaHome);
      expect(first.userHome).not.toBe(second.userHome);
      expect(first.electronUserData).not.toBe(second.electronUserData);
      expect(first.mainSource).not.toBe(second.mainSource);
      expect(first.mountedSources).not.toEqual(second.mountedSources);
      expect(firstLaunch).toMatchObject({
        host: "127.0.0.1",
        requestedPort: 0,
        workspaceRoot: first.mainSource,
        electronArgs: [`--user-data-dir=${first.electronUserData}`],
        env: {
          PATH: "/test/bin",
          HOME: first.userHome,
          USERPROFILE: first.userHome,
          HOMEDRIVE: parsedUserHome.root,
          HOMEPATH: expectedHomePath,
          XDG_CONFIG_HOME: first.configHome,
          APPDATA: first.appData,
          LOCALAPPDATA: first.localAppData,
          TMPDIR: first.tempDir,
          TEMP: first.tempDir,
          TMP: first.tempDir,
          HANA_HOME: first.hanaHome,
          HANA_ROOT: repositoryRoot,
          HANA_PORT: "0",
        },
      });
      const windowsLaunch = createKnowledgeLaunchConfig(
        first,
        inheritedEnvironment,
        repositoryRoot,
        "win32",
      );
      expect(windowsLaunch.electronArgs).toEqual([
        `--user-data-dir=${first.electronUserData}`,
        "--no-stdio-init",
      ]);
      expect(firstLaunch.env).not.toHaveProperty("HANA_TOKEN");
      expect(firstLaunch.env).not.toHaveProperty("SECRET_UNRELATED");
      expect(secondLaunch.env.HANA_PORT).toBe("0");
    } finally {
      await Promise.all([first.dispose(), second.dispose()]);
    }
  });

  it("restores Electron dialog methods through an idempotent disposer", async () => {
    const originalOpen = async () => ({ canceled: true, filePaths: [] });
    const originalSave = async () => ({ canceled: true, filePath: "" });
    const dialog = {
      showOpenDialog: originalOpen,
      showSaveDialog: originalSave,
    };
    const electronApplication = {
      evaluate: async (
        pageFunction: (
          electron: { dialog: typeof dialog },
          argument: unknown,
        ) => unknown,
        argument: unknown,
      ) => pageFunction({ dialog }, argument),
    } as unknown as Parameters<typeof installNativeDialogStub>[0];

    const dispose = await installNativeDialogStub(electronApplication, {
      canceled: false,
      openPaths: ["/isolated/import.md"],
      savePath: "/isolated/save.md",
    });
    expect(await dialog.showOpenDialog()).toEqual({
      canceled: false,
      filePaths: ["/isolated/import.md"],
    });
    expect(await dialog.showSaveDialog()).toEqual({
      canceled: false,
      filePath: "/isolated/save.md",
    });

    await dispose();
    await dispose();
    expect(dialog.showOpenDialog).toBe(originalOpen);
    expect(dialog.showSaveDialog).toBe(originalSave);
  });

  it("keeps all 193 user stories singly owned and release evidence fail-closed", () => {
    const traceability = fs.readFileSync(
      path.join(changeRoot, "requirements-traceability.md"),
      "utf8",
    );
    const releaseEvidence = fs.readFileSync(
      path.join(changeRoot, "release-evidence.md"),
      "utf8",
    );
    const ownershipRows = markdownTableRows(traceability, "KW-US-");
    const releaseRows = markdownTableRows(releaseEvidence, "KW-US-");

    expect(ownershipRows).toHaveLength(193);
    expect(releaseRows).toHaveLength(193);
    ownershipRows.forEach((row, index) => {
      expect(row[0]).toBe(`KW-US-${String(index + 1).padStart(3, "0")}`);
      expect(row[2], `${row[0]} must have exactly one numeric owner`).toMatch(
        /^\d{2}$/,
      );
      expect(row[2], `${row[0]} must not be owned by Ticket 57`).not.toBe("57");
      const automatedPaths = [...row[4].matchAll(/`([^`]+)`/g)].map(
        (match) => match[1],
      );
      expect(
        automatedPaths.length,
        `${row[0]} must name precise automated evidence`,
      ).toBeGreaterThan(0);
      automatedPaths.forEach((automatedPath) => {
        expect(automatedPath).toMatch(
          /(?:^|\/)[^/]*(?:test|spec)\.[cm]?[jt]sx?$/,
        );
      });
    });

    releaseRows.forEach((row, index) => {
      expect(row[0]).toBe(ownershipRows[index][0]);
      expect(row[1]).toBe(ownershipRows[index][2]);
      expect(row[2]).toBe(ownershipRows[index][4]);
      expect(row[3]).toBe(ownershipRows[index][5]);
      const status = row[4];
      expect(
        ["未执行", "通过", "失败", "flaky"],
        `${row[0]} must use a frozen release status`,
      ).toContain(status);
      const artifact = row[5];
      const completeRow = row.join(" ");
      if (
        /未执行|NOT[_ -]?RUN|失败|FAIL|仅重试成功|首次失败.*重试成功|RETRY[_ -]?ONLY|RETRY.*SUCCESS|FLAKY/i.test(
          completeRow,
        )
      ) {
        expect(status).not.toBe("通过");
      }
      if (status === "通过") {
        expect(artifact).not.toMatch(/^(?:|—|NOT[_ -]?RUN)$/i);
        expect(
          artifact,
          `${row[0]} passing evidence must name a real command or artifact`,
        ).toMatch(
          /`[^`]+`|https:\/\/\S+|(?:^|\/)(?:artifacts?|test-results|playwright-report)(?:\/|$)/,
        );
      }
    });
  });
});

describe("real ResourceIO/provider seam baseline", () => {
  it("serves the same public stat/read behavior through the ResourceIO facade and HTTP adapter", async () => {
    const resourceIO = createBaselineResourceIO();
    const resource = { kind: "local-file" as const, path: "/workspace/notes.md" };

    const direct = await resourceIO.read(resource);
    expect(Buffer.from(direct.content).toString("utf8")).toBe("# Baseline\n");

    const app = new Hono();
    useBaselineLocalOwnerAuth(app);
    app.route(
      "/api",
      createResourceIoRoute({
        getResourceIO: () => resourceIO,
      }),
    );
    const response = await app.request("/api/resource-io/read", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ resource }),
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      resourceKey: "local_fs:/workspace/notes.md",
      content: "# Baseline\n",
      encoding: "utf-8",
      version: { sha256: "baseline-v1" },
    });
  });

  it("proves the provider seam has two adapters and fails closed when an adapter denies a capability", async () => {
    const resourceIO = createBaselineResourceIO();

    await expect(
      resourceIO.stat({ kind: "mount", mountId: "reference", path: "notes.md" }),
    ).resolves.toMatchObject({
      resourceKey: "mount:reference:notes.md",
      version: { etag: "reference-v1" },
    });

    await expect(
      resourceIO.read({ kind: "mount", mountId: "reference", path: "notes.md" }),
    ).rejects.toMatchObject({
      code: "capability_denied",
    });
  });

  it("reports an unavailable ResourceIO through the public HTTP response instead of reaching Engine state", async () => {
    const app = new Hono();
    useBaselineLocalOwnerAuth(app);
    app.route("/api", createResourceIoRoute({ getResourceIO: () => null }));

    const response = await app.request("/api/resource-io/stat", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        resource: { kind: "local-file", path: "/workspace/notes.md" },
      }),
    });

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: "resource io unavailable" });
  });
});

describe("public composition seam baseline", () => {
  it("imports public roots in an isolated child with a clean, side-effect-free exit", async () => {
    const workspace = await createKnowledgeWorkspaceSandbox(0);
    try {
      const result = await runImportProbe(workspace);
      expect(result).toMatchObject({ code: 0, signal: null, stderr: "" });
      expect(JSON.parse(result.stdout)).toMatchObject({
        open: "function",
        full: "function",
        adapters: expect.any(Number),
        serverExports: [
          "resolveSessionMetadataRecoveryStatusForHealth",
          "startServer",
        ],
      });
      expect(
        fs.existsSync(path.join(workspace.hanaHome, "server-info.json")),
      ).toBe(false);
      expect(
        fs.readdirSync(workspace.electronUserData),
        "import-only probe must not initialize Electron user-data",
      ).toEqual([]);
    } finally {
      await workspace.dispose();
    }
  });
});
