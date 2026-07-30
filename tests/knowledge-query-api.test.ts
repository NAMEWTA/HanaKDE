import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Hono } from "hono";
import { afterEach, describe, expect, it } from "vitest";
import {
  KnowledgeIndexCoordinator,
} from "../core/knowledge-workspace/knowledge-index-coordinator.ts";
import {
  queryKnowledgeIndex,
} from "../lib/knowledge-workspace/knowledge-query.ts";
import type {
  KnowledgeIndexResourceDocument,
} from "../lib/knowledge-workspace/knowledge-index-store.ts";
import type {
  ProviderRootIdentity,
} from "../lib/resource-io/types.ts";
import {
  createKnowledgeWorkspaceRoute,
} from "../server/routes/knowledge-workspace.ts";

const temporaryDirectories: string[] = [];

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

describe("knowledge query API", () => {
  it("queries saved tags, outbound links, backlinks, and outline inside one source generation", async () => {
    const fixture = await createFixture();

    await expect(queryKnowledgeIndex(fixture.index, {
      kind: "tags",
      sourceKey: "main",
    })).resolves.toEqual({
      kind: "tags",
      sourceKey: "main",
      generationId: "main-generation",
      items: [
        {
          tag: "alpha",
          origin: "body",
          address: { sourceKey: "main", relativePath: "Notes/Host.md" },
        },
        {
          tag: "shared",
          origin: "frontmatter",
          address: { sourceKey: "main", relativePath: "Notes/Host.md" },
        },
        {
          tag: "shared",
          origin: "body",
          address: { sourceKey: "main", relativePath: "Notes/Ref.md" },
        },
      ],
      hasMore: false,
    });

    await expect(queryKnowledgeIndex(fixture.index, {
      kind: "outbound",
      address: { sourceKey: "main", relativePath: "Notes/Host.md" },
    })).resolves.toEqual({
      kind: "outbound",
      sourceKey: "main",
      generationId: "main-generation",
      items: [
        {
          ordinal: 0,
          linkKind: "wikilink",
          targetAddress: {
            sourceKey: "main",
            relativePath: "Notes/Ref.md",
          },
          fragment: "details",
          fromOffset: 20,
          toOffset: 36,
        },
        {
          ordinal: 1,
          linkKind: "markdown",
          targetAddress: null,
          fragment: null,
          fromOffset: 37,
          toOffset: 57,
        },
      ],
      hasMore: false,
    });

    await expect(queryKnowledgeIndex(fixture.index, {
      kind: "backlinks",
      address: { sourceKey: "main", relativePath: "Notes/Ref.md" },
    })).resolves.toEqual({
      kind: "backlinks",
      sourceKey: "main",
      generationId: "main-generation",
      items: [{
        sourceAddress: {
          sourceKey: "main",
          relativePath: "Notes/Host.md",
        },
        ordinal: 0,
        linkKind: "wikilink",
        fragment: "details",
        fromOffset: 20,
        toOffset: 36,
      }],
      hasMore: false,
    });

    await expect(queryKnowledgeIndex(fixture.index, {
      kind: "outline",
      address: { sourceKey: "main", relativePath: "Notes/Host.md" },
    })).resolves.toEqual({
      kind: "outline",
      sourceKey: "main",
      generationId: "main-generation",
      items: [{
        ordinal: 0,
        level: 1,
        text: "Host",
        slug: "host",
        fromOffset: 0,
        toOffset: 6,
      }],
      hasMore: false,
    });
  });

  it("does not join tags or reference edges across source partitions", async () => {
    const fixture = await createFixture();

    const mainTags = await queryKnowledgeIndex(fixture.index, {
      kind: "tags",
      sourceKey: "main",
      tag: "shared",
    });
    expect(mainTags.items).toHaveLength(2);
    expect(JSON.stringify(mainTags)).not.toContain("Research");

    const researchBacklinks = await queryKnowledgeIndex(fixture.index, {
      kind: "backlinks",
      address: { sourceKey: "research", relativePath: "Notes/Ref.md" },
    });
    expect(researchBacklinks.items).toHaveLength(1);
    expect(researchBacklinks.items[0]?.sourceAddress).toEqual({
      sourceKey: "research",
      relativePath: "Research/Host.md",
    });
    expect(JSON.stringify(researchBacklinks)).not.toContain("Notes/Host.md");

    const mainBacklinks = await queryKnowledgeIndex(fixture.index, {
      kind: "backlinks",
      address: { sourceKey: "main", relativePath: "Notes/Ref.md" },
    });
    expect(mainBacklinks.items).toHaveLength(1);
    expect(mainBacklinks.items[0]?.sourceAddress.sourceKey).toBe("main");
  });

  it("bounds results, validates public input, supports cancellation, and reports stale generations", async () => {
    const fixture = await createFixture();
    const limited = await queryKnowledgeIndex(fixture.index, {
      kind: "tags",
      sourceKey: "main",
      limit: 1,
    });
    expect(limited.items).toHaveLength(1);
    expect(limited.hasMore).toBe(true);

    await expect(queryKnowledgeIndex(fixture.index, {
      kind: "tags",
      sourceKey: "main",
      limit: 101,
    })).rejects.toThrow(/limit/i);
    await expect(queryKnowledgeIndex(fixture.index, {
      kind: "outline",
      address: { sourceKey: "main", relativePath: "../escape.md" },
    })).rejects.toMatchObject({ code: "invalid_relative_path" });

    const controller = new AbortController();
    controller.abort();
    await expect(queryKnowledgeIndex(fixture.index, {
      kind: "tags",
      sourceKey: "main",
    }, {
      signal: controller.signal,
    })).rejects.toMatchObject({ name: "AbortError", code: "ABORT_ERR" });

    await expect(queryKnowledgeIndex(fixture.index, {
      kind: "backlinks",
      address: { sourceKey: "main", relativePath: "Notes/Ref.md" },
      generationId: "older-generation",
    })).rejects.toMatchObject({
      code: "knowledge_version_conflict",
      details: { state: "stale_generation" },
    });
  });

  it("exposes read-scoped query and health routes with safe unavailable errors", async () => {
    const fixture = await createFixture();
    const engine = {
      hanakoHome: fixture.hanakoHome,
      defaultDeskCwd: fixture.workspace,
      homeCwd: fixture.workspace,
      deskCwd: fixture.workspace,
      knowledgeIndexCoordinator: fixture.index,
      getRuntimeContext: () => ({
        serverId: "server_1",
        serverNodeId: "node_1",
        userId: "user_1",
        studioId: "studio_1",
        connectionKind: "local",
        credentialKind: "loopback_token",
      }),
    };
    const app = new Hono();
    app.route("/api", createKnowledgeWorkspaceRoute(engine));

    const response = await app.request("/api/knowledge-workspace/query", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        kind: "backlinks",
        address: { sourceKey: "main", relativePath: "Notes/Ref.md" },
      }),
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      result: {
        kind: "backlinks",
        sourceKey: "main",
        generationId: "main-generation",
      },
    });

    const health = await app.request(
      "/api/knowledge-workspace/index/status?sourceKey=main",
    );
    expect(health.status).toBe(200);
    expect(await health.json()).toEqual({
      sourceKey: "main",
      health: {
        state: "ready",
        generationId: "main-generation",
        sequence: 7,
      },
    });

    const unavailableApp = new Hono();
    unavailableApp.route("/api", createKnowledgeWorkspaceRoute({
      ...engine,
      knowledgeIndexCoordinator: undefined,
    }));
    const unavailable = await unavailableApp.request(
      "/api/knowledge-workspace/query",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind: "tags", sourceKey: "main" }),
      },
    );
    const unavailableText = await unavailable.text();
    expect(unavailable.status).toBe(503);
    expect(JSON.parse(unavailableText)).toEqual({
      code: "knowledge_index_unavailable",
      httpStatus: 503,
      retryable: true,
    });
    expect(unavailableText).not.toContain(fixture.hanakoHome);
    expect(unavailableText).not.toMatch(/SQLITE_/);
  });

  it("releases the generation lease and redacts storage failures", async () => {
    let releases = 0;
    const coordinator = {
      health() {
        return { state: "unavailable", reason: "test" } as const;
      },
      acquireQueryLease() {
        return {
          generationId: "fault-generation",
          queryTags() {
            throw new Error(
              "SQLITE_CORRUPT /private/workspace/generation.sqlite",
            );
          },
          release() {
            releases += 1;
          },
        } as never;
      },
    };

    let failure: unknown;
    try {
      await queryKnowledgeIndex(coordinator, {
        kind: "tags",
        sourceKey: "main",
      });
    } catch (error) {
      failure = error;
    }
    expect(failure).toMatchObject({
      code: "knowledge_index_unavailable",
      httpStatus: 503,
      retryable: true,
    });
    expect(JSON.stringify(failure)).not.toContain("SQLITE_CORRUPT");
    expect(JSON.stringify(failure)).not.toContain("/private/workspace");
    expect(releases).toBe(1);
  });

  it("denies query routes when the authenticated principal lacks files.read", async () => {
    const fixture = await createFixture();
    const engine = {
      hanakoHome: fixture.hanakoHome,
      defaultDeskCwd: fixture.workspace,
      homeCwd: fixture.workspace,
      deskCwd: fixture.workspace,
      knowledgeIndexCoordinator: fixture.index,
      getRuntimeContext: () => ({
        serverId: "server_1",
        serverNodeId: "node_1",
        userId: "user_1",
        studioId: "studio_1",
      }),
    };
    const app = new Hono();
    app.use("*", async (c, next) => {
      c.set("authPrincipal" as never, {
        kind: "device",
        userId: "user_1",
        studioId: "studio_1",
        serverId: "server_1",
        serverNodeId: "node_1",
        deviceId: "write_only",
        connectionKind: "lan",
        credentialKind: "device_credential",
        trustState: "paired",
        scopes: ["files.write"],
      } as never);
      await next();
    });
    app.route("/api", createKnowledgeWorkspaceRoute(engine));

    const response = await app.request("/api/knowledge-workspace/query", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind: "tags", sourceKey: "main" }),
    });
    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({
      code: "knowledge_resource_out_of_scope",
    });
  });
});

async function createFixture(): Promise<{
  hanakoHome: string;
  index: KnowledgeIndexCoordinator;
  workspace: string;
}> {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "hana-query-api-"));
  temporaryDirectories.push(root);
  const hanakoHome = path.join(root, "hana");
  const workspace = path.join(root, "workspace");
  fs.mkdirSync(hanakoHome, { recursive: true });
  fs.mkdirSync(workspace, { recursive: true });
  const identities = new Map<string, ProviderRootIdentity>([
    ["main", identity("main-root")],
    ["research", identity("research-root")],
  ]);
  const index = new KnowledgeIndexCoordinator({
    hanakoHome,
    workspaceIdentity: identity("workspace-root"),
    sourceRegistry: {
      rootIdentity(sourceKey) {
        const value = identities.get(sourceKey);
        if (!value) throw new Error("source unavailable");
        return value;
      },
      async revalidate(sourceKey) {
        if (!identities.has(sourceKey)) throw new Error("source unavailable");
      },
    },
    extractorContractVersion: "query-v1",
    hostId: "query-test-host",
    pid: 41_044,
  });

  const main = await index.beginRebuild("main", {
    rebuildId: "main-build",
    generationId: "main-generation",
    startedSequence: 0,
  });
  main.replaceResource(document("Notes/Host.md", {
    title: "Host",
    tags: [
      { tag: "alpha", origin: "body" },
      { tag: "shared", origin: "frontmatter" },
    ],
    headings: [{
      ordinal: 0,
      level: 1,
      text: "Host",
      slug: "host",
      fromOffset: 0,
      toOffset: 6,
    }],
    links: [
      {
        ordinal: 0,
        linkKind: "wikilink",
        rawTarget: "Notes/Ref.md",
        resolvedRelativePath: "Notes/Ref.md",
        fragment: "details",
        fromOffset: 20,
        toOffset: 36,
      },
      {
        ordinal: 1,
        linkKind: "markdown",
        rawTarget: "https://example.test",
        resolvedRelativePath: null,
        fragment: null,
        fromOffset: 37,
        toOffset: 57,
      },
    ],
  }));
  main.replaceResource(document("Notes/Ref.md", {
    title: "Reference",
    tags: [{ tag: "shared", origin: "body" }],
  }));
  await main.publish({ lastCompleteSequence: 7 });

  const research = await index.beginRebuild("research", {
    rebuildId: "research-build",
    generationId: "research-generation",
    startedSequence: 0,
  });
  research.replaceResource(document("Research/Host.md", {
    title: "Research host",
    tags: [{ tag: "shared", origin: "body" }],
    links: [{
      ordinal: 0,
      linkKind: "wikilink",
      rawTarget: "Notes/Ref.md",
      resolvedRelativePath: "Notes/Ref.md",
      fragment: null,
      fromOffset: 0,
      toOffset: 16,
    }],
  }));
  await research.publish({ lastCompleteSequence: 3 });
  return { hanakoHome, index, workspace };
}

function identity(opaqueRootId: string): ProviderRootIdentity {
  return {
    providerId: "local_fs",
    identityNamespace: "query-test",
    opaqueRootId,
    scopeToken: `${opaqueRootId}-scope`,
    caseMode: "sensitive",
  };
}

function document(
  relativePath: string,
  input: {
    title: string;
    headings?: KnowledgeIndexResourceDocument["headings"];
    links?: KnowledgeIndexResourceDocument["links"];
    tags?: KnowledgeIndexResourceDocument["tags"];
  },
): KnowledgeIndexResourceDocument {
  const basename = relativePath.split("/").at(-1)!;
  const parentPath = relativePath.includes("/")
    ? relativePath.slice(0, relativePath.lastIndexOf("/"))
    : "";
  return {
    resource: {
      relativePath,
      parentPath,
      basename,
      extension: ".md",
      kind: "page",
      sizeBytes: 128,
      mtimeMs: 1_000,
      versionToken: `version:${relativePath}`,
      contentState: "indexed",
      contentReason: null,
      indexedAtMs: 2_000,
    },
    page: {
      title: input.title,
      frontmatterJson: null,
      bodyText: `# ${input.title}`,
      bodyHash: `hash:${relativePath}`,
    },
    headings: input.headings ?? [],
    links: input.links ?? [],
    tags: input.tags ?? [],
    tasks: [],
    search: {
      titleFold: input.title.toLocaleLowerCase("und"),
      pathFold: relativePath.toLocaleLowerCase("und"),
      metadataFold: "",
      bodyFold: input.title.toLocaleLowerCase("und"),
    },
  };
}
