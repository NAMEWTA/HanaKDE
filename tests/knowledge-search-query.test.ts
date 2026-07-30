import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  KnowledgeIndexCoordinator,
} from "../core/knowledge-workspace/knowledge-index-coordinator.ts";
import {
  lexSearchExpression,
  parseKnowledgeSearchRequest,
  searchKnowledgeIndex,
} from "../lib/knowledge-workspace/knowledge-search-query.ts";
import type {
  KnowledgeIndexResourceDocument,
} from "../lib/knowledge-workspace/knowledge-index-store.ts";
import type {
  ProviderRootIdentity,
} from "../lib/resource-io/types.ts";

const temporaryDirectories: string[] = [];

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

describe("knowledge super search", () => {
  it("lexes tolerant phrases, escapes, literal mixed-case or, and resource-level AND/OR", () => {
    expect(lexSearchExpression('alpha "two  spaces" OR beta or \\"quoted\\"'))
      .toEqual([
        ["alpha", "two  spaces"],
        ["beta", "or", '"quoted"'],
      ]);
    expect(lexSearchExpression('"unclosed phrase')).toEqual([
      ["unclosed phrase"],
    ]);
    expect(lexSearchExpression('"" alpha OR OR beta')).toEqual([
      ["alpha"],
      ["beta"],
    ]);
  });

  it("groups main first and mounts in session order without cross-source ranking", async () => {
    const fixture = await createFixture();
    const result = await searchKnowledgeIndex(fixture.index, {
      query: "café planning",
    }, {
      sources: fixture.sources,
    });

    expect(result.groups.map((group) => group.sourceKey)).toEqual([
      "main",
      "research",
    ]);
    expect(result.groups[0]).toMatchObject({
      state: "ready",
      displayName: "Main workspace",
      items: [{
        address: { sourceKey: "main", relativePath: "Plans/Café.md" },
        title: "Café plan",
      }],
    });
    expect(result.groups[1]).toMatchObject({
      state: "ready",
      displayName: "Research",
      items: [{
        address: {
          sourceKey: "research",
          relativePath: "Archive/Planning.md",
        },
      }],
    });
    expect(result.groups[0]).toHaveProperty("generationId", "main-generation");
    expect(result.groups[1]).toHaveProperty(
      "generationId",
      "research-generation",
    );
  });

  it("uses exact NFC lowercase continuous substrings and never drops one- or two-code-point matches", async () => {
    const fixture = await createFixture();
    const composed = await searchKnowledgeIndex(fixture.index, {
      query: "CAFE\u0301",
    }, { sources: fixture.sources });
    expect(readyItems(composed, "main").map((item) => item.title)).toEqual([
      "Café plan",
    ]);

    const short = await searchKnowledgeIndex(fixture.index, {
      query: "資料",
    }, { sources: fixture.sources });
    expect(readyItems(short, "main").map((item) => item.title)).toEqual([
      "資料",
    ]);

    const continuous = await searchKnowledgeIndex(fixture.index, {
      query: '"alpha beta"',
    }, { sources: fixture.sources });
    expect(readyItems(continuous, "main")).toHaveLength(0);

    const resourceAnd = await searchKnowledgeIndex(fixture.index, {
      query: "alpha beta",
    }, { sources: fixture.sources });
    expect(readyItems(resourceAnd, "main")).toHaveLength(1);
  });

  it("selects trigram candidates for long terms and bounded scans for short terms", async () => {
    const observed: Array<string | null> = [];
    const rows = Array.from({ length: 120 }, (_, resourceId) =>
      searchRow(resourceId)
    );
    const coordinator = {
      acquireQueryLease() {
        return {
          generationId: "generation",
          querySearchCandidates(input: {
            ftsQuery: string | null;
            offset: number;
            limit: number;
          }) {
            observed.push(input.ftsQuery);
            return rows.slice(input.offset, input.offset + input.limit);
          },
          release() {},
        } as never;
      },
    };
    const sources = [{
      sourceKey: "main",
      displayName: "Main",
      availability: "available",
    }];
    const long = await searchKnowledgeIndex(coordinator, {
      query: "alpha",
    }, { sources });
    expect(observed).toEqual(['"alpha"']);
    expect(readyGroup(long, "main").items).toHaveLength(50);

    observed.length = 0;
    const short = await searchKnowledgeIndex(coordinator, {
      query: "a",
      limit: 100,
    }, { sources });
    expect(observed).toEqual([null]);
    expect(readyGroup(short, "main").items).toHaveLength(100);
  });

  it("bounds query, per-source page size, snippets, and generation-bound cursors", async () => {
    const fixture = await createFixture();
    expect(() => parseKnowledgeSearchRequest({
      query: "x".repeat(513),
    })).toThrow(/query/i);
    expect(() => parseKnowledgeSearchRequest({
      query: "x",
      limit: 101,
    })).toThrow(/limit/i);

    const first = await searchKnowledgeIndex(fixture.index, {
      query: "alpha OR planning",
      limit: 1,
    }, { sources: fixture.sources });
    const main = readyGroup(first, "main");
    expect(main.items).toHaveLength(1);
    expect(main.nextCursor).toEqual(expect.any(String));
    expect(main.items[0]!.snippets.length).toBeLessThanOrEqual(3);
    expect(main.items[0]!.snippets.every((snippet) =>
      Array.from(snippet.text).length <= 240
    )).toBe(true);

    const second = await searchKnowledgeIndex(fixture.index, {
      query: "alpha OR planning",
      limit: 1,
      cursors: { main: main.nextCursor! },
    }, { sources: fixture.sources.slice(0, 1) });
    expect(readyGroup(second, "main").items[0]?.address.relativePath)
      .not.toBe(main.items[0]?.address.relativePath);

    const decoded = JSON.parse(
      Buffer.from(main.nextCursor!, "base64url").toString("utf8"),
    );
    const stale = Buffer.from(JSON.stringify({
      ...decoded,
      generationId: "old-generation",
    })).toString("base64url");
    const staleResult = await searchKnowledgeIndex(fixture.index, {
      query: "alpha OR planning",
      cursors: { main: stale },
    }, { sources: fixture.sources.slice(0, 1) });
    expect(staleResult.groups[0]).toMatchObject({
      state: "error",
      error: {
        code: "knowledge_version_conflict",
        details: { state: "stale_generation" },
      },
    });

    const rebound = await searchKnowledgeIndex(fixture.index, {
      query: "alpha OR planning",
      cursors: { main: main.nextCursor! },
      scope: { kind: "tag", sourceKey: "main" },
    }, { sources: fixture.sources });
    expect(rebound.groups[0]).toMatchObject({
      state: "error",
      error: {
        code: "knowledge_operation_precondition_failed",
        details: { field: "cursors" },
      },
    });
    expect(decoded).toMatchObject({
      scope: "all",
      sort: "score-desc,path-byte,resource-id",
    });
  });

  it("locks tag navigation to its visible source scope and rejects absent scopes", async () => {
    const fixture = await createFixture();
    const result = await searchKnowledgeIndex(fixture.index, {
      query: "planning",
      scope: { kind: "tag", sourceKey: "research" },
    }, { sources: fixture.sources });
    expect(result.scope).toEqual({ kind: "tag", sourceKey: "research" });
    expect(result.groups.map((group) => group.sourceKey)).toEqual(["research"]);

    await expect(searchKnowledgeIndex(fixture.index, {
      query: "planning",
      scope: { kind: "tag", sourceKey: "removed" },
    }, { sources: fixture.sources })).rejects.toMatchObject({
      code: "knowledge_resource_out_of_scope",
    });
  });

  it("isolates unavailable/faulting sources, releases leases, and propagates cancellation", async () => {
    let released = 0;
    const faulting = {
      acquireQueryLease(sourceKey: string) {
        if (sourceKey === "bad") throw new Error("/private/index SQLITE_IOERR");
        return {
          generationId: "generation",
          querySearchCandidates() {
            return [];
          },
          release() {
            released += 1;
          },
        } as never;
      },
    };
    const result = await searchKnowledgeIndex(faulting, { query: "alpha" }, {
      sources: [
        { sourceKey: "main", displayName: "Main", availability: "available" },
        { sourceKey: "bad", displayName: "Bad", availability: "available" },
        {
          sourceKey: "offline",
          displayName: "Offline",
          availability: "unavailable",
        },
      ],
    });
    expect(result.groups).toMatchObject([
      { sourceKey: "main", state: "ready" },
      {
        sourceKey: "bad",
        state: "error",
        error: { code: "knowledge_index_unavailable" },
      },
      {
        sourceKey: "offline",
        state: "error",
        error: { code: "knowledge_resource_unavailable" },
      },
    ]);
    expect(JSON.stringify(result)).not.toContain("/private");
    expect(JSON.stringify(result)).not.toContain("SQLITE_IOERR");
    expect(released).toBe(1);

    const controller = new AbortController();
    let cancellationReleases = 0;
    const rows = Array.from({ length: 256 }, (_, resourceId) =>
      searchRow(resourceId)
    );
    const pending = searchKnowledgeIndex({
      acquireQueryLease() {
        return {
          generationId: "generation",
          querySearchCandidates() {
            return rows;
          },
          release() {
            cancellationReleases += 1;
          },
        } as never;
      },
    }, { query: "a" }, {
      sources: [{
        sourceKey: "main",
        displayName: "Main",
        availability: "available",
      }],
      signal: controller.signal,
    });
    controller.abort();
    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
    expect(cancellationReleases).toBe(1);
  });
});

async function createFixture(): Promise<{
  index: KnowledgeIndexCoordinator;
  sources: readonly {
    sourceKey: string;
    displayName: string;
    availability: string;
  }[];
}> {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "hana-search-query-"));
  temporaryDirectories.push(root);
  const identities = new Map<string, ProviderRootIdentity>([
    ["main", identity("main-root")],
    ["research", identity("research-root")],
  ]);
  const index = new KnowledgeIndexCoordinator({
    hanakoHome: path.join(root, "hana"),
    workspaceIdentity: identity("workspace"),
    sourceRegistry: {
      rootIdentity(sourceKey) {
        const value = identities.get(sourceKey);
        if (!value) throw new Error("missing source");
        return value;
      },
      async revalidate(sourceKey) {
        if (!identities.has(sourceKey)) throw new Error("missing source");
      },
    },
    extractorContractVersion: "search-v1",
    hostId: "search-test",
    pid: 45_045,
  });
  const main = await index.beginRebuild("main", {
    rebuildId: "main-build",
    generationId: "main-generation",
    startedSequence: 0,
  });
  main.replaceResource(document("Plans/Café.md", {
    title: "Café plan",
    metadata: "alpha",
    body: `beta ${"x".repeat(300)} planning`,
  }));
  main.replaceResource(document("Plans/Planning.md", {
    title: "Planning",
    metadata: "alpha",
    body: "archive",
  }));
  main.replaceResource(document("资料.md", {
    title: "資料",
    metadata: "",
    body: "短内容",
  }));
  await main.publish({ lastCompleteSequence: 4 });

  const research = await index.beginRebuild("research", {
    rebuildId: "research-build",
    generationId: "research-generation",
    startedSequence: 0,
  });
  research.replaceResource(document("Archive/Planning.md", {
    title: "Planning research",
    metadata: "café",
    body: "planning notes",
  }));
  await research.publish({ lastCompleteSequence: 2 });
  return {
    index,
    sources: [
      {
        sourceKey: "main",
        displayName: "Main workspace",
        availability: "available",
      },
      {
        sourceKey: "research",
        displayName: "Research",
        availability: "available",
      },
    ],
  };
}

function document(
  relativePath: string,
  input: { title: string; metadata: string; body: string },
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
      sizeBytes: 100,
      mtimeMs: 1,
      versionToken: `v:${relativePath}`,
      contentState: "indexed",
      contentReason: null,
      indexedAtMs: 2,
    },
    page: {
      title: input.title,
      frontmatterJson: JSON.stringify({ note: input.metadata }),
      bodyText: input.body,
      bodyHash: `hash:${relativePath}`,
    },
    headings: [],
    links: [],
    tags: [],
    tasks: [],
    search: {
      titleFold: input.title.normalize("NFC").toLocaleLowerCase("und"),
      pathFold: relativePath.normalize("NFC").toLocaleLowerCase("und"),
      metadataFold: input.metadata.normalize("NFC").toLocaleLowerCase("und"),
      bodyFold: input.body.normalize("NFC").toLocaleLowerCase("und"),
    },
  };
}

function searchRow(resourceId: number) {
  return {
    resourceId,
    relativePath: `Notes/${resourceId}.md`,
    basename: `${resourceId}.md`,
    kind: "page" as const,
    title: "alpha",
    frontmatterJson: null,
    bodyText: "alpha",
    titleFold: "alpha",
    pathFold: `notes/${resourceId}.md`,
    metadataFold: "",
    bodyFold: "alpha",
  };
}

function identity(opaqueRootId: string): ProviderRootIdentity {
  return {
    providerId: "local_fs",
    identityNamespace: "search-test",
    opaqueRootId,
    scopeToken: `${opaqueRootId}-scope`,
    caseMode: "sensitive",
  };
}

function readyGroup(
  result: Awaited<ReturnType<typeof searchKnowledgeIndex>>,
  sourceKey: string,
) {
  const group = result.groups.find((candidate) =>
    candidate.sourceKey === sourceKey
  );
  if (group?.state !== "ready") throw new Error("ready group expected");
  return group;
}

function readyItems(
  result: Awaited<ReturnType<typeof searchKnowledgeIndex>>,
  sourceKey: string,
) {
  return readyGroup(result, sourceKey).items;
}
