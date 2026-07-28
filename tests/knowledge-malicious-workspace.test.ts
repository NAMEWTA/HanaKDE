/**
 * @vitest-environment jsdom
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Hono } from "hono";
import { afterEach, describe, expect, it, vi } from "vitest";
import { normalizePrincipal } from "../core/security-principal.ts";
import { upsertStudioMount } from "../core/studio-mounts.ts";
import { LocalFsProvider } from "../lib/resource-io/providers/local-fs-provider.ts";
import { MountProvider } from "../lib/resource-io/providers/mount-provider.ts";
import { ResourceIO } from "../lib/resource-io/resource-io.ts";
import {
  KNOWLEDGE_MARKDOWN_MAX_BYTES,
  parseKnowledgeResourceAddress,
} from "../shared/knowledge-workspace-contract.ts";
import { createResourceIoRoute } from "../server/routes/resource-io.ts";
import {
  __setMermaidLoaderForTests,
  renderMermaidDiagrams,
} from "../desktop/src/react/utils/mermaid-renderer.ts";
import { renderMarkdownPreview } from "../desktop/src/react/utils/markdown.ts";
import { sanitizeMarkdownPreviewHtml } from "../desktop/src/react/utils/markdown-html-sanitizer.ts";

type MountedSandbox = {
  tempRoot: string;
  sourceRoot: string;
  outsideRoot: string;
  provider: MountProvider;
  resourceIO: ResourceIO;
};

const tempRoots = new Set<string>();

afterEach(() => {
  __setMermaidLoaderForTests(null);
  document.body.replaceChildren();
  for (const tempRoot of tempRoots) {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
  tempRoots.clear();
});

function createMountedSandbox(): MountedSandbox {
  const tempRoot = fs.mkdtempSync(
    path.join(os.tmpdir(), "hana-malicious-workspace-"),
  );
  tempRoots.add(tempRoot);
  const sourceRoot = path.join(tempRoot, "source");
  const outsideRoot = path.join(tempRoot, "outside");
  const hanakoHome = path.join(tempRoot, "hana");
  fs.mkdirSync(sourceRoot, { recursive: true });
  fs.mkdirSync(outsideRoot, { recursive: true });
  upsertStudioMount(hanakoHome, {
    schemaVersion: 1,
    mountId: "malicious-source",
    hostStudioId: "security-studio",
    sourceKind: "storage",
    provider: "local_fs",
    rootLocator: { path: sourceRoot },
    label: "Malicious fixture",
    presentation: "folder",
    capabilities: [
      "list",
      "read",
      "write",
      "watch",
      "materialize",
    ],
    grantId: null,
  });
  const provider = new MountProvider({
    hanakoHome,
    studioId: "security-studio",
    localFsProviderFactory: ({ cwd, guard }) =>
      new LocalFsProvider({ cwd, guard }),
  });
  return {
    tempRoot,
    sourceRoot,
    outsideRoot,
    provider,
    resourceIO: new ResourceIO({ providers: { mount: provider } }),
  };
}

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

function useRemotePrincipal(app: Hono): void {
  app.use("*", async (c, next) => {
    setHonoContext(c, "authPrincipal", normalizePrincipal({
      kind: "device",
      deviceId: "security-device",
      userId: "security-user",
      studioId: "security-studio",
      connectionKind: "lan",
      credentialKind: "device_credential",
      scopes: ["studio.owner", "files.read", "files.write"],
    }));
    setHonoContext(c, "transportConnectionKind", "lan");
    await next();
  });
}

async function collect(
  body: AsyncIterable<Uint8Array>,
): Promise<Buffer> {
  const chunks: Uint8Array[] = [];
  for await (const chunk of body) chunks.push(chunk);
  return Buffer.concat(chunks);
}

describe("knowledge malicious workspace gate", () => {
  it("rejects a real symlink that escapes a mounted source", async () => {
    const { sourceRoot, outsideRoot, provider } = createMountedSandbox();
    const secret = path.join(outsideRoot, "secret.md");
    fs.writeFileSync(secret, "outside-secret");
    fs.symlinkSync(
      outsideRoot,
      path.join(sourceRoot, "escape"),
      process.platform === "win32" ? "junction" : "dir",
    );

    await expect(provider.read({
      kind: "mount",
      mountId: "malicious-source",
      path: "escape/secret.md",
    })).rejects.toMatchObject({
      code: "invalid_path",
    });
  });

  it("rejects a real symlink loop without exposing either native path", async () => {
    const { sourceRoot, provider } = createMountedSandbox();
    fs.symlinkSync("b.md", path.join(sourceRoot, "a.md"));
    fs.symlinkSync("a.md", path.join(sourceRoot, "b.md"));

    await expect(provider.openRead({
      kind: "mount",
      mountId: "malicious-source",
      path: "a.md",
    })).rejects.toMatchObject({
      code: "symbolic_link_not_allowed",
      safeMessage: "Resource content unavailable",
    });
  });

  it("stops an opened stream before yielding bytes after a TOCTOU path swap", async () => {
    const { sourceRoot, outsideRoot, provider } = createMountedSandbox();
    const source = path.join(sourceRoot, "note.md");
    const secret = path.join(outsideRoot, "secret.md");
    fs.writeFileSync(source, "source");
    fs.writeFileSync(secret, "outside-secret");
    const opened = await provider.openRead({
      kind: "mount",
      mountId: "malicious-source",
      path: "note.md",
    });

    fs.unlinkSync(source);
    fs.symlinkSync(secret, source);

    await expect(collect(opened.body)).rejects.toMatchObject({
      code: "resource_access_denied",
    });
  });

  it("follows native case/Unicode identity without guessing aliases and rejects unsafe addresses", async () => {
    const { sourceRoot } = createMountedSandbox();
    const provider = new LocalFsProvider({ cwd: sourceRoot });
    const nfc = "Notes/Café.md";
    const nfd = "Notes/Cafe\u0301.md";
    const caseVariant = "Notes/café.md";
    fs.mkdirSync(path.join(sourceRoot, "Notes"));
    fs.writeFileSync(path.join(sourceRoot, ...nfc.split("/")), "nfc");
    expect(parseKnowledgeResourceAddress({
      sourceKey: "main",
      relativePath: nfc,
    })).toEqual({
      ok: true,
      value: { sourceKey: "main", relativePath: nfc },
    });
    expect(parseKnowledgeResourceAddress({
      sourceKey: "main",
      relativePath: nfd,
    })).toEqual({
      ok: true,
      value: { sourceKey: "main", relativePath: nfd },
    });
    for (const relativePath of [nfc, nfd, caseVariant]) {
      const nativePath = path.join(
        sourceRoot,
        ...relativePath.split("/"),
      );
      const result = await provider.stat({
        kind: "local-file",
        path: nativePath,
      });
      expect(result.exists).toBe(fs.existsSync(nativePath));
    }
    const identity = await provider.getRootIdentity({
      kind: "local-file",
      path: sourceRoot,
    });
    expect(identity.caseMode).toBe(
      process.platform === "linux"
        ? "sensitive"
        : process.platform === "win32" || process.platform === "darwin"
          ? "insensitive"
          : "unknown",
    );
    for (const relativePath of [
      "Notes/\u0000secret.md",
      "C:/secret.md",
      "\\\\server\\share\\secret.md",
      "//server/share/secret.md",
    ]) {
      expect(parseKnowledgeResourceAddress({
        sourceKey: "main",
        relativePath,
      })).toMatchObject({
        ok: false,
        error: { code: "invalid_relative_path" },
      });
    }
  });

  it("rejects forged identity/native fields before provider access", async () => {
    const stat = vi.fn();
    const app = new Hono();
    useRemotePrincipal(app);
    app.route("/api", createResourceIoRoute({ resourceIO: { stat } }));

    const response = await app.request("/api/resource-io/stat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        resource: {
          kind: "mount",
          mountId: "malicious-source",
          path: "note.md",
        },
        principal: "attacker",
        nativeBridgeCredential: "stolen",
      }),
    });
    const text = await response.text();

    expect(response.status).toBe(400);
    expect(JSON.parse(text)).toMatchObject({
      code: "forbidden_resource_authority_field",
    });
    expect(stat).not.toHaveBeenCalled();
    expect(text).not.toContain("stolen");
    expect(text).not.toContain("attacker");
  });

  it("redacts native paths, body, token and control-character log payloads", async () => {
    const privatePath = path.join(
      os.tmpdir(),
      "private-source",
      "secret.md",
    );
    const app = new Hono();
    useRemotePrincipal(app);
    app.route("/api", createResourceIoRoute({
      resourceIO: {
        read: vi.fn(async () => {
          throw new Error(
            `${privatePath}\nforged_log=true token=secret body=private`,
          );
        }),
      },
    }));

    const response = await app.request("/api/resource-io/read", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        resource: {
          kind: "mount",
          mountId: "malicious-source",
          path: "note.md",
        },
      }),
    });
    const text = await response.text();

    expect(response.status).toBe(500);
    expect(JSON.parse(text)).toEqual({
      error: "Resource operation failed",
      code: "resource_operation_failed",
      safeMessage: "Resource operation failed",
    });
    for (const secret of [
      privatePath,
      "forged_log",
      "token=secret",
      "body=private",
    ]) {
      expect(text).not.toContain(secret);
    }
  });

  it("stats a Knowledge address before opening content and rejects oversize without reading", async () => {
    const tempRoot = fs.mkdtempSync(
      path.join(os.tmpdir(), "hana-malicious-content-gate-"),
    );
    tempRoots.add(tempRoot);
    const main = path.join(tempRoot, "main");
    fs.mkdirSync(main);
    const filePath = path.join(main, "large.md");
    fs.writeFileSync(filePath, "x");
    fs.truncateSync(filePath, KNOWLEDGE_MARKDOWN_MAX_BYTES + 1);
    const provider = new LocalFsProvider({ cwd: main });
    const stat = vi.spyOn(provider, "stat");
    const openRead = vi.spyOn(provider, "openRead");
    const read = vi.spyOn(provider, "read");
    const resourceIO = new ResourceIO({
      providers: { local_fs: provider },
    });
    const app = new Hono();
    app.route("/api", createResourceIoRoute({
      hanakoHome: path.join(tempRoot, "hana"),
      defaultDeskCwd: main,
      homeCwd: main,
      deskCwd: main,
      getRuntimeContext: () => ({
        userId: "security-user",
        studioId: "security-studio",
        connectionKind: "local",
        credentialKind: "loopback_token",
      }),
      resourceIO,
    }));

    const response = await app.request("/api/resource-io/read", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        address: { sourceKey: "main", relativePath: "large.md" },
      }),
    });

    expect(response.status).toBe(413);
    expect(await response.json()).toMatchObject({
      code: "knowledge_transfer_limit_exceeded",
      details: {
        limit: KNOWLEDGE_MARKDOWN_MAX_BYTES,
        actual: KNOWLEDGE_MARKDOWN_MAX_BYTES + 1,
      },
    });
    expect(stat).toHaveBeenCalledTimes(1);
    expect(openRead).not.toHaveBeenCalled();
    expect(read).not.toHaveBeenCalled();
  });

  it("uses expected-version openRead for an allowed Knowledge address", async () => {
    const tempRoot = fs.mkdtempSync(
      path.join(os.tmpdir(), "hana-malicious-content-open-"),
    );
    tempRoots.add(tempRoot);
    const main = path.join(tempRoot, "main");
    fs.mkdirSync(main);
    const filePath = path.join(main, "safe.md");
    fs.writeFileSync(filePath, "safe");
    const provider = new LocalFsProvider({ cwd: main });
    const stat = vi.spyOn(provider, "stat");
    const openRead = vi.spyOn(provider, "openRead");
    const read = vi.spyOn(provider, "read");
    const resourceIO = new ResourceIO({
      providers: { local_fs: provider },
    });
    const app = new Hono();
    app.route("/api", createResourceIoRoute({
      hanakoHome: path.join(tempRoot, "hana"),
      defaultDeskCwd: main,
      homeCwd: main,
      deskCwd: main,
      getRuntimeContext: () => ({
        userId: "security-user",
        studioId: "security-studio",
        connectionKind: "local",
        credentialKind: "loopback_token",
      }),
      resourceIO,
    }));

    const response = await app.request("/api/resource-io/read", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        address: { sourceKey: "main", relativePath: "safe.md" },
      }),
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      content: "safe",
      encoding: "utf-8",
      version: { size: 4 },
    });
    expect(openRead).toHaveBeenCalledWith(
      expect.objectContaining({ kind: "local-file" }),
      {
        expectedVersion: expect.objectContaining({ size: 4 }),
      },
    );
    expect(stat).toHaveBeenCalledTimes(1);
    expect(read).not.toHaveBeenCalled();

    stat.mockResolvedValueOnce({
      exists: true,
      isDirectory: false,
      resourceKey: "main:safe.md",
      resource: { kind: "local-file", path: filePath },
      version: { size: 4 },
    });
    const missingVersion = await app.request("/api/resource-io/read", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        address: { sourceKey: "main", relativePath: "safe.md" },
      }),
    });
    expect(missingVersion.status).toBe(412);
    expect(await missingVersion.json()).toMatchObject({
      code: "knowledge_operation_precondition_failed",
      details: { state: "content_version_unavailable" },
    });
    expect(openRead).toHaveBeenCalledTimes(1);
    expect(read).not.toHaveBeenCalled();
  });

  it("removes active HTML/SVG and every non-click-safe URI", () => {
    const html = renderMarkdownPreview([
      '<script>alert(1)</script>',
      '<svg onload="alert(2)"><foreignObject>bad</foreignObject></svg>',
      '<img src="https://tracker.example/pixel.png" onerror="alert(3)">',
      '<img src="file:///private/secret.png">',
      '<a href="javascript:alert(4)">javascript</a>',
      '<a href="data:text/html,boom">data</a>',
      '<a href="file:///private/secret">file</a>',
      '<a href="blob:https://example.com/id">blob</a>',
      '<a href="mailto:secret@example.com">mail</a>',
      '<a href="tel:+10000000000">tel</a>',
      '<a href="https://example.com/safe">https</a>',
    ].join(""));

    expect(html).not.toContain("<script");
    expect(html).not.toContain("<svg");
    expect(html).not.toContain("<img");
    expect(html).not.toContain("javascript:");
    expect(html).not.toContain("data:");
    expect(html).not.toContain("file:");
    expect(html).not.toContain("blob:");
    expect(html).not.toContain("mailto:");
    expect(html).not.toContain("tel:");
    expect(html).toContain(
      '<a href="https://example.com/safe" rel="noopener noreferrer">https</a>',
    );
    expect(sanitizeMarkdownPreviewHtml(
      '<img src="javascript:alert(5)">',
      { trustedImageUrls: new Set(["javascript:alert(5)"]) },
    )).not.toContain("<img");
  });

  it("sanitizes Mermaid SVG, discards bindings and ignores stale active content", async () => {
    const bindFunctions = vi.fn();
    const initialize = vi.fn();
    __setMermaidLoaderForTests(async () => ({
      initialize,
      render: vi.fn(async () => ({
        svg: [
          '<svg viewBox="0 0 10 10" onload="alert(1)">',
          '<script>alert(2)</script>',
          '<foreignObject><iframe src="https://evil.example"></iframe></foreignObject>',
          '<image href="file:///private/secret.png"></image>',
          '<a href="javascript:alert(3)"><text>bad</text></a>',
          '<path d="M0 0L10 10" stroke="currentColor"></path>',
          "</svg>",
        ].join(""),
        bindFunctions,
      })),
    }));
    const container = document.createElement("div");
    container.innerHTML = [
      '<div class="mermaid-diagram">',
      '<pre class="mermaid-source"><code>graph TD\\nA--&gt;B</code></pre>',
      '<div class="mermaid-rendered"></div>',
      "</div>",
    ].join("");

    await renderMermaidDiagrams(container);
    const rendered = container.querySelector(".mermaid-rendered")!;

    expect(initialize).toHaveBeenCalledWith(expect.objectContaining({
      startOnLoad: false,
      securityLevel: "strict",
    }));
    expect(bindFunctions).not.toHaveBeenCalled();
    expect(rendered.querySelector("svg")).toBeInstanceOf(SVGElement);
    expect(rendered.querySelector("path")).toBeInstanceOf(SVGElement);
    expect(rendered.querySelector("script")).toBeNull();
    expect(rendered.querySelector("foreignObject")).toBeNull();
    expect(rendered.querySelector("iframe")).toBeNull();
    expect(rendered.querySelector("image")).toBeNull();
    expect(rendered.innerHTML).not.toContain("onload");
    expect(rendered.innerHTML).not.toContain("javascript:");
    expect(rendered.innerHTML).not.toContain("file:");
  });
});
