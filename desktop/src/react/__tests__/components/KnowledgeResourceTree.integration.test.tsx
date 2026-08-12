// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { KnowledgeSourceDto } from "../../../../../shared/knowledge-workspace-contract.ts";
import type { KnowledgeWorkspaceClient } from "../../services/knowledge-workspace-client";
import { KnowledgeResourceTree } from "../../components/knowledge-workspace/KnowledgeResourceTree";
import { useStore } from "../../stores";

const source: KnowledgeSourceDto = {
  sourceKey: "main",
  displayName: "工作目录",
  role: "main",
  capabilities: ["stat", "read", "list", "watch"],
  availability: "available",
};

describe("KnowledgeResourceTree integration seam", () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("opens every source-relative file through one open projection and shares typed icons", async () => {
    window.t = (key) => key;
    useStore.getState().openKnowledgeWorkspace("knowledge-integration");
    const list = vi.fn(async () => ({
      items: [
        { name: "guide.markdown", isDirectory: false, size: 5, mtimeMs: 1 },
        { name: "paper.pdf", isDirectory: false, size: 5, mtimeMs: 1 },
        { name: "photo.jpg", isDirectory: false, size: 5, mtimeMs: 1 },
        { name: "index.html", isDirectory: false, size: 5, mtimeMs: 1 },
      ],
    }));
    const onOpenResource = vi.fn();
    const client = { resources: { list } } as unknown as KnowledgeWorkspaceClient;
    render(
      <KnowledgeResourceTree
        client={client}
        sources={[source]}
        workspaceKey="knowledge-integration"
        watchSource={() => () => {}}
        subscribeToChanges={() => () => {}}
        refreshDelayMs={0}
        onOpenResource={onOpenResource}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /knowledge\.tree\.expand/u }));
    await waitFor(() => expect(screen.getByText("guide.markdown")).toBeVisible());

    expect(screen.getByText("paper.pdf").parentElement?.querySelector('[data-file-kind="pdf"]'))
      .toBeTruthy();
    expect(screen.getByText("photo.jpg").parentElement?.querySelector('[data-file-kind="image"]'))
      .toBeTruthy();
    expect(screen.getByText("index.html").parentElement?.querySelector('[data-file-kind="code"]'))
      .toBeTruthy();

    fireEvent.doubleClick(screen.getByRole("treeitem", { name: /guide\.markdown/u }));
    fireEvent.doubleClick(screen.getByRole("treeitem", { name: /paper\.pdf/u }));
    fireEvent.doubleClick(screen.getByRole("treeitem", { name: /photo\.jpg/u }));
    fireEvent.doubleClick(screen.getByRole("treeitem", { name: /index\.html/u }));
    expect(onOpenResource).toHaveBeenCalledTimes(4);
    expect(onOpenResource.mock.calls.map(([input]) => input.address.relativePath))
      .toEqual(["guide.markdown", "paper.pdf", "photo.jpg", "index.html"]);
  });
});
