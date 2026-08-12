import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { HanaEngine } from "../core/engine.ts";
import { ResourceEventBus } from "../lib/resource-io/resource-event-bus.ts";
import type { KnowledgeSourceDto } from "../shared/knowledge-workspace-contract.ts";
import {
  knowledgeWritableSources,
  orderKnowledgeUnsavedDocuments,
  runKnowledgeCloseFlow,
  runKnowledgeWorkspaceTransition,
  saveKnowledgeOrphanDocument,
  shouldConfirmKnowledgeViewClose,
  transitionKnowledgeDocumentForSourceLoss,
  type KnowledgeLifecycleDocument,
} from "../core/knowledge-workspace/knowledge-workspace-lifecycle.ts";

function document(
  overrides: Partial<KnowledgeLifecycleDocument> = {},
): KnowledgeLifecycleDocument {
  return {
    sessionKey: "main:Notes/A.md",
    address: { sourceKey: "main", relativePath: "Notes/A.md" },
    sourceName: "Main",
    buffer: "# local",
    dirty: true,
    orphan: false,
    resourceState: "available",
    viewIds: ["view-a"],
    displayOrder: 0,
    active: true,
    ...overrides,
  };
}

const sources: KnowledgeSourceDto[] = [
  {
    sourceKey: "main",
    displayName: "Main",
    role: "main",
    capabilities: ["stat", "read", "write"],
    availability: "available",
  },
  {
    sourceKey: "archive",
    displayName: "Archive",
    role: "mounted",
    capabilities: ["stat", "read"],
    availability: "available",
  },
  {
    sourceKey: "offline",
    displayName: "Offline",
    role: "mounted",
    capabilities: ["stat", "read", "write"],
    availability: "unavailable",
  },
];

describe("knowledge workspace lifecycle", () => {
  it("uses the active session directory as main without promoting authorized folders", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "hana-knowledge-main-"));
    const workDirectory = path.join(root, "work-directory");
    const authorizedDirectory = path.join(root, "authorized-only");
    fs.mkdirSync(workDirectory, { recursive: true });
    fs.mkdirSync(authorizedDirectory, { recursive: true });
    const sessionPath = path.join(root, "session.jsonl");
    try {
      const engine = Object.create(HanaEngine.prototype) as HanaEngine & Record<string, any>;
      Object.assign(engine, {
        _sessionCoord: {
          currentSessionPath: sessionPath,
          getSessionWorkspaceMount: () => null,
          getSessionFolderScope: () => ({
            cwd: workDirectory,
            authorizedFolders: [authorizedDirectory],
          }),
        },
        _agentMgr: {
          agent: {
            config: { desk: { home_folder: authorizedDirectory } },
          },
        },
      });
      Object.defineProperties(engine, {
        currentSessionPath: { configurable: true, value: sessionPath },
        defaultDeskCwd: { configurable: true, value: authorizedDirectory },
        homeCwd: { configurable: true, value: authorizedDirectory },
        deskCwd: { configurable: true, value: authorizedDirectory },
      });

      expect(engine._resolveActiveMainWorkspaceRoot()).toBe(workDirectory);
      expect(engine._resolveKnowledgeResourceOwner()).toEqual({
        key: JSON.stringify({ kind: "local-file", path: workDirectory }),
        localRoot: workDirectory,
      });
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("does not fall back when an explicitly selected session directory is unavailable", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "hana-knowledge-missing-main-"));
    const fallbackHome = path.join(root, "fallback-home");
    const missingWorkDirectory = path.join(root, "missing-work-directory");
    fs.mkdirSync(fallbackHome, { recursive: true });
    try {
      const engine = Object.create(HanaEngine.prototype) as HanaEngine & Record<string, any>;
      Object.assign(engine, {
        _sessionCoord: {
          currentSessionPath: path.join(root, "session.jsonl"),
          getSessionWorkspaceMount: () => null,
          getSessionFolderScope: () => ({ cwd: missingWorkDirectory }),
        },
        _agentMgr: { agent: { config: { desk: {} } } },
        getHomeCwd: () => fallbackHome,
      });

      expect(engine._hasSelectedLocalMainWorkspaceRoot()).toBe(true);
      expect(engine._resolveActiveMainWorkspaceRoot()).toBeNull();
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("drains the old main owner and rejects stale calls before binding the next root", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "hana-knowledge-owner-"));
    const rootA = path.join(root, "workspace-a");
    const rootB = path.join(root, "workspace-b");
    const hanakoHome = path.join(root, "hana");
    fs.mkdirSync(rootA, { recursive: true });
    fs.mkdirSync(rootB, { recursive: true });
    fs.mkdirSync(hanakoHome, { recursive: true });
    let activeRoot = rootA;
    try {
      const engine = Object.create(HanaEngine.prototype) as HanaEngine & Record<string, any>;
      Object.assign(engine, {
        hanakoHome,
        agentsDir: root,
        _agentMgr: { agent: { dir: root } },
        _resourceIO: null,
        _resourceIOOwnerKey: null,
        _resourceIOOwnerScope: null,
        _resourceIOOwnerTransitioning: false,
        _runtimeContext: { studioId: "studio-owner-scope" },
        _sessionFiles: null,
        _resourceEvents: () => new ResourceEventBus({ emit: () => {} }),
        getResourceService: () => null,
      });
      Object.defineProperties(engine, {
        currentSessionPath: { configurable: true, value: null },
        defaultDeskCwd: { configurable: true, get: () => activeRoot },
        homeCwd: { configurable: true, get: () => activeRoot },
        deskCwd: { configurable: true, get: () => activeRoot },
      });

      const ownerA = engine.getKnowledgeResourceIO();
      const provider = ownerA.providers.local_fs;
      const providerWrite = provider.write.bind(provider);
      let releaseWrite: () => void = () => {};
      provider.write = async (...args: Parameters<typeof provider.write>) => {
        await new Promise<void>((resolve) => { releaseWrite = resolve; });
        return providerWrite(...args);
      };
      const pendingWrite = ownerA.write(
        { kind: "local-file", path: path.join(rootA, "pending.md") },
        "pending",
      );
      const drain = engine._drainKnowledgeResourceOwner();
      await expect(ownerA.write(
        { kind: "local-file", path: path.join(rootA, "stale.md") },
        "stale",
      )).rejects.toMatchObject({
        code: "knowledge_resource_unavailable",
        httpStatus: 503,
        retryable: true,
      });
      releaseWrite();
      await Promise.all([pendingWrite, drain]);

      activeRoot = rootB;
      const ownerB = engine.getKnowledgeResourceIO();
      expect(ownerB).not.toBe(ownerA);
      expect(ownerA.providers.local_fs.cwd).toBe(rootA);
      expect(ownerB.providers.local_fs.cwd).toBe(rootB);
      await ownerB.write(
        { kind: "local-file", path: path.join(rootB, "current.md") },
        "current",
      );
      expect(fs.existsSync(path.join(rootA, "stale.md"))).toBe(false);
      expect(fs.readFileSync(path.join(rootB, "current.md"), "utf8")).toBe("current");
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("KW-US-045 closes a non-last shared view without confirmation", () => {
    const shared = document({ viewIds: ["view-a", "view-b"] });
    expect(shouldConfirmKnowledgeViewClose(shared, "view-a")).toBe(false);
    expect(shared.buffer).toBe("# local");
  });

  it("KW-US-046 and KW-US-140 require confirmation for the dirty last view", () => {
    expect(shouldConfirmKnowledgeViewClose(document(), "view-a")).toBe(true);
    expect(shouldConfirmKnowledgeViewClose(
      document({ dirty: false }),
      "view-a",
    )).toBe(false);
  });

  it("KW-US-047 and KW-US-048 represent a new workspace as no restored documents", () => {
    expect(orderKnowledgeUnsavedDocuments([])).toEqual([]);
  });

  it("KW-US-050 keeps a clean missing resource as a non-recovering invalid placeholder", () => {
    expect(transitionKnowledgeDocumentForSourceLoss(
      document({ dirty: false }),
      "resource-missing",
    )).toEqual({
      orphan: false,
      resourceState: "missing",
      reloadWhenSourceRecovers: false,
    });
  });

  it("KW-US-051 keeps a clean unavailable source placeholder but orphans dirty content", () => {
    expect(transitionKnowledgeDocumentForSourceLoss(
      document({ dirty: false }),
      "source-unavailable",
    )).toEqual({
      orphan: false,
      resourceState: "source-unavailable",
      reloadWhenSourceRecovers: true,
    });
    expect(transitionKnowledgeDocumentForSourceLoss(
      document({ dirty: true }),
      "source-unavailable",
    )).toEqual({
      orphan: true,
      resourceState: "orphan",
      reloadWhenSourceRecovers: false,
    });
  });

  it("KW-US-052 never auto-rebinds an orphan after source recovery", () => {
    expect(transitionKnowledgeDocumentForSourceLoss(
      document({ dirty: false, orphan: true, resourceState: "orphan" }),
      "source-unavailable",
    )).toEqual({
      orphan: true,
      resourceState: "orphan",
      reloadWhenSourceRecovers: false,
    });
  });

  it("KW-US-136 exposes only current available writable sources", () => {
    expect(knowledgeWritableSources(sources).map(source => source.sourceKey))
      .toEqual(["main"]);
  });

  it("KW-US-136 rejects targets outside the current writable source set", async () => {
    const createPage = vi.fn();
    const result = await saveKnowledgeOrphanDocument({
      document: document({ orphan: true, resourceState: "orphan" }),
      sources,
      chooseTarget: async () => ({
        address: { sourceKey: "offline", relativePath: "Recovered.md" },
        sourceName: "Offline",
      }),
      createPage,
    });
    expect(result).toEqual({ ok: false, reason: "invalid-target" });
    expect(createPage).not.toHaveBeenCalled();
  });

  it("KW-US-137 rebinds only after the create-page save succeeds", async () => {
    const result = await saveKnowledgeOrphanDocument({
      document: document({ orphan: true, resourceState: "orphan" }),
      sources,
      chooseTarget: async () => ({
        address: { sourceKey: "main", relativePath: "Recovered.md" },
        sourceName: "Main",
      }),
      createPage: async (target, buffer) => ({
        ok: true,
        address: target.address,
        version: { size: buffer.length },
      }),
    });
    expect(result).toEqual({
      ok: true,
      address: { sourceKey: "main", relativePath: "Recovered.md" },
      version: { size: 7 },
    });
  });

  it("KW-US-138 passes only unchanged buffer text and a new target to create-page", async () => {
    const createPage = vi.fn(async (target, buffer) => ({
      ok: true as const,
      address: target.address,
      version: { size: buffer.length },
    }));
    await saveKnowledgeOrphanDocument({
      document: document({
        buffer: "[[Old/Link.md]]\n![asset](../old.png)",
        orphan: true,
        resourceState: "orphan",
      }),
      sources,
      chooseTarget: async () => ({
        address: { sourceKey: "main", relativePath: "Recovered.md" },
        sourceName: "Main",
      }),
      createPage,
    });
    expect(createPage).toHaveBeenCalledWith(
      {
        address: { sourceKey: "main", relativePath: "Recovered.md" },
        sourceName: "Main",
      },
      "[[Old/Link.md]]\n![asset](../old.png)",
    );
  });

  it("KW-US-139 returns ordinary create-page conflict without rebinding", async () => {
    const result = await saveKnowledgeOrphanDocument({
      document: document({ orphan: true, resourceState: "orphan" }),
      sources,
      chooseTarget: async () => ({
        address: { sourceKey: "main", relativePath: "Occupied.md" },
        sourceName: "Main",
      }),
      createPage: async () => ({ ok: false, reason: "conflict" }),
    });
    expect(result).toEqual({ ok: false, reason: "conflict" });
  });

  it("KW-US-141 processes active document first then stable tab order and dedupes sessions", async () => {
    const sequence: string[] = [];
    const inactiveFirst = document({
      sessionKey: "first",
      active: false,
      displayOrder: 0,
    });
    const activeLast = document({
      sessionKey: "active",
      address: { sourceKey: "main", relativePath: "Active.md" },
      active: true,
      displayOrder: 2,
    });
    const duplicate = document({
      sessionKey: "first",
      active: false,
      displayOrder: 3,
      viewIds: ["other-view"],
    });
    const result = await runKnowledgeCloseFlow(
      [inactiveFirst, activeLast, duplicate],
      {
        decide: async item => {
          sequence.push(item.sessionKey);
          return "discard";
        },
        save: async () => true,
        discard: () => undefined,
      },
    );
    expect(result.ok).toBe(true);
    expect(sequence).toEqual(["active", "first"]);
  });

  it("KW-US-142 stops on cancel without rolling back completed decisions", async () => {
    const discarded: string[] = [];
    const decision = vi.fn()
      .mockResolvedValueOnce("discard")
      .mockResolvedValueOnce("cancel");
    const result = await runKnowledgeCloseFlow(
      [
        document({ sessionKey: "active", displayOrder: 0 }),
        document({
          sessionKey: "second",
          address: { sourceKey: "main", relativePath: "Second.md" },
          active: false,
          displayOrder: 1,
        }),
        document({
          sessionKey: "third",
          address: { sourceKey: "main", relativePath: "Third.md" },
          active: false,
          displayOrder: 2,
        }),
      ],
      {
        decide: decision,
        save: async () => true,
        discard: item => {
          discarded.push(item.sessionKey);
        },
      },
    );
    expect(result).toEqual({
      ok: false,
      stoppedBy: "cancel",
      processedSessionKeys: ["active"],
    });
    expect(discarded).toEqual(["active"]);
    expect(decision).toHaveBeenCalledTimes(2);
  });

  it("KW-US-142 stops on save failure and preserves prior completed results", async () => {
    const saved: string[] = [];
    const result = await runKnowledgeCloseFlow(
      [
        document({ sessionKey: "active", displayOrder: 0 }),
        document({
          sessionKey: "second",
          address: { sourceKey: "main", relativePath: "Second.md" },
          active: false,
          displayOrder: 1,
        }),
        document({
          sessionKey: "third",
          address: { sourceKey: "main", relativePath: "Third.md" },
          active: false,
          displayOrder: 2,
        }),
      ],
      {
        decide: async () => "save",
        save: async item => {
          saved.push(item.sessionKey);
          return item.sessionKey !== "second";
        },
        discard: () => undefined,
      },
    );
    expect(result).toEqual({
      ok: false,
      stoppedBy: "save-failed",
      processedSessionKeys: ["active"],
    });
    expect(saved).toEqual(["active", "second"]);
  });

  it("preflights a candidate before prompting and commits only after all documents resolve", async () => {
    const sequence: string[] = [];
    const result = await runKnowledgeWorkspaceTransition([document()], {
      preflight: async () => {
        sequence.push("preflight");
        return true;
      },
      decide: async () => {
        sequence.push("decide");
        return "discard";
      },
      save: async () => true,
      discard: () => {
        sequence.push("discard");
      },
      commit: () => {
        sequence.push("commit");
      },
    });
    expect(result).toEqual({ ok: true });
    expect(sequence).toEqual(["preflight", "decide", "discard", "commit"]);
  });

  it("does not prompt or commit when workspace candidate preflight fails", async () => {
    const decide = vi.fn();
    const commit = vi.fn();
    await expect(runKnowledgeWorkspaceTransition([document()], {
      preflight: async () => false,
      decide,
      save: async () => true,
      discard: () => undefined,
      commit,
    })).resolves.toEqual({
      ok: false,
      stoppedBy: "preflight-failed",
    });
    expect(decide).not.toHaveBeenCalled();
    expect(commit).not.toHaveBeenCalled();
  });
});
