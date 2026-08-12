import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Hono } from "hono";
import { afterEach, describe, expect, it, vi } from "vitest";
import { normalizePrincipal } from "../core/security-principal.ts";
import { createSandboxResourceIO } from "../lib/resource-io/sandbox-resource-io.ts";
import { createKnowledgeWorkspaceRoute } from "../server/routes/knowledge-workspace.ts";
import { createResourceIoRoute } from "../server/routes/resource-io.ts";

describe("knowledge workspace resource convergence", () => {
  let testRoot: string | null = null;

  afterEach(() => {
    if (testRoot) fs.rmSync(testRoot, { recursive: true, force: true });
    testRoot = null;
  });

  it("uses one public owner for expected-version save, create, and trash", async () => {
    testRoot = fs.mkdtempSync(path.join(os.tmpdir(), "hana-resource-convergence-"));
    const workDirectory = path.join(testRoot, "work-directory");
    const hanakoHome = path.join(testRoot, "hana");
    fs.mkdirSync(workDirectory, { recursive: true });
    const notePath = path.join(workDirectory, "Existing.md");
    fs.writeFileSync(notePath, "before", "utf8");

    const resourceIO = createSandboxResourceIO({
      cwd: workDirectory,
      agentDir: workDirectory,
      workspace: workDirectory,
      workspaceFolders: [workDirectory],
      authorizedFolders: [workDirectory],
      hanakoHome,
      getSandboxEnabled: () => false,
      studioId: "studio_convergence",
    });
    const atomicCoordinator = {
      recover: vi.fn(async () => ({
        scanned: 0,
        finalized: 0,
        rolledBack: 0,
        recoveryRequired: 0,
      })),
      isSourceRecovering: () => false,
      run: vi.fn(async (request, executor, context) => {
        const execution = await executor(request.items[0], 0, {
          ...context,
          operationId: "123e4567-e89b-42d3-a456-426614174078",
        });
        return {
          items: [{
            ...request.items[0],
            state: "applied",
            bytesTransferred: execution.bytesTransferred,
          }],
        };
      }),
    };
    const engine = {
      hanakoHome,
      defaultDeskCwd: workDirectory,
      homeCwd: workDirectory,
      deskCwd: workDirectory,
      resourceIO,
      getKnowledgeResourceIO: () => resourceIO,
      knowledgeAtomicOperationCoordinator: atomicCoordinator,
      getRuntimeContext: () => ({
        serverId: "server_convergence",
        serverNodeId: "node_convergence",
        userId: "user_convergence",
        studioId: "studio_convergence",
        connectionKind: "local",
        credentialKind: "loopback_token",
      }),
    };
    const app = new Hono();
    app.use("*", async (c, next) => {
      c.set("transportConnectionKind" as never, "local" as never);
      c.set("authPrincipal" as never, normalizePrincipal({
        kind: "local_user",
        userId: "user_convergence",
        studioId: "studio_convergence",
        serverId: "server_convergence",
        serverNodeId: "node_convergence",
        connectionKind: "local",
        credentialKind: "loopback_token",
        scopes: ["studio.owner", "files.read", "files.write"],
      }) as never);
      await next();
    });
    app.route("/api", createKnowledgeWorkspaceRoute(engine));
    app.route("/api", createResourceIoRoute(engine));

    const address = { sourceKey: "main", relativePath: "Existing.md" };
    const statResponse = await app.request("/api/resource-io/stat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ address }),
    });
    expect(statResponse.status).toBe(200);
    const initialVersion = (await statResponse.json()).version;

    const saved = await app.request("/api/resource-io/write-expected-version", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        address,
        content: Buffer.from("after", "utf8").toString("base64"),
        encoding: "base64",
        expectedVersion: initialVersion,
      }),
    });
    expect(saved.status).toBe(200);
    expect(fs.readFileSync(notePath, "utf8")).toBe("after");

    const staleWrite = await app.request("/api/resource-io/write-expected-version", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        address,
        content: Buffer.from("must-not-overwrite", "utf8").toString("base64"),
        encoding: "base64",
        expectedVersion: initialVersion,
      }),
    });
    expect(staleWrite.status).toBe(409);
    expect(fs.readFileSync(notePath, "utf8")).toBe("after");

    const created = await app.request("/api/knowledge-workspace/resources/create", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        kind: "page",
        sourceKey: "main",
        directoryPath: "",
        name: "Created",
      }),
    });
    expect(created.status).toBe(201);
    expect(await created.json()).toMatchObject({
      result: {
        address: { sourceKey: "main", relativePath: "Created.md" },
      },
    });
    const createdPath = path.join(workDirectory, "Created.md");
    expect(fs.existsSync(createdPath)).toBe(true);

    const trashed = await app.request("/api/knowledge-workspace/trash", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        addresses: [{ sourceKey: "main", relativePath: "Created.md" }],
      }),
    });
    expect(trashed.status).toBe(200);
    expect(await trashed.json()).toMatchObject({
      result: { items: [{ ok: true }] },
    });
    expect(fs.existsSync(createdPath)).toBe(false);
    expect(atomicCoordinator.run).toHaveBeenCalledTimes(1);
  });
});
