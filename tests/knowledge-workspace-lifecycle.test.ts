import { describe, expect, it, vi } from "vitest";
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
