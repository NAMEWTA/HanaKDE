import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Hono } from "hono";
import { afterEach, describe, expect, it } from "vitest";
import { upsertStudioMount } from "../core/studio-mounts.ts";
import { normalizePrincipal } from "../core/security-principal.ts";
import { createSandboxResourceIO } from "../lib/resource-io/sandbox-resource-io.ts";
import { createKnowledgeWorkspaceRoute } from "../server/routes/knowledge-workspace.ts";

describe("knowledge workspace clipboard route", () => {
  let root: string | null = null;

  afterEach(() => {
    if (root) fs.rmSync(root, { recursive: true, force: true });
    root = null;
  });

  it("rejects a cross-source cut before any source or target write", async () => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "hana-knowledge-clipboard-route-"));
    const main = path.join(root, "main");
    const research = path.join(root, "research");
    const hanakoHome = path.join(root, "hana");
    fs.mkdirSync(main, { recursive: true });
    fs.mkdirSync(research, { recursive: true });
    fs.writeFileSync(path.join(research, "Source.md"), "[[Target.md]]\n", "utf8");
    upsertStudioMount(hanakoHome, {
      mountId: "mount_clipboard_research",
      hostStudioId: "studio_clipboard",
      sourceKind: "storage",
      provider: "local_fs",
      rootLocator: { path: research },
      label: "Research",
      presentation: "folder",
      capabilities: ["list", "read", "write", "watch", "materialize"],
    });
    const resourceIO = createSandboxResourceIO({
      cwd: main,
      agentDir: main,
      workspace: main,
      workspaceFolders: [main],
      authorizedFolders: [main, research],
      hanakoHome,
      getSandboxEnabled: () => false,
      studioId: "studio_clipboard",
    });
    const engine = {
      hanakoHome,
      defaultDeskCwd: main,
      homeCwd: main,
      deskCwd: main,
      resourceIO,
      getRuntimeContext: () => ({ studioId: "studio_clipboard" }),
    };
    const app = new Hono();
    app.use("*", async (c, next) => {
      (c as unknown as { set(key: string, value: unknown): void }).set(
        "authPrincipal",
        normalizePrincipal({
          kind: "local_user",
          userId: "user_clipboard",
          studioId: "studio_clipboard",
          serverId: "server_clipboard",
          serverNodeId: "node_clipboard",
          connectionKind: "local",
          credentialKind: "loopback_token",
          scopes: ["studio.owner", "files.read", "files.write"],
        }),
      );
      await next();
    });
    app.route("/api", createKnowledgeWorkspaceRoute(engine));

    const response = await app.request("/api/knowledge-workspace/resources/paste", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        intent: "cut",
        items: [{ sourceKey: "research", relativePath: "Source.md" }],
        target: { sourceKey: "main", directoryPath: "" },
      }),
    });

    expect(response.status).toBe(412);
    expect(await response.json()).toMatchObject({
      code: "knowledge_operation_precondition_failed",
      retryable: false,
    });
    expect(fs.readFileSync(path.join(research, "Source.md"), "utf8"))
      .toBe("[[Target.md]]\n");
    expect(fs.existsSync(path.join(main, "Source.md"))).toBe(false);
  });
});
