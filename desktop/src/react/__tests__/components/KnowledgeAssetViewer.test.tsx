// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { KnowledgeResourceAddress } from "../../../../../shared/knowledge-workspace-contract.ts";
import { KNOWLEDGE_ASSET_MAX_BYTES } from "../../../../../lib/knowledge-workspace/resource-open-policy.ts";
import {
  KnowledgeAssetViewer,
  type KnowledgeAssetViewerChangeSignal,
} from "../../components/knowledge-workspace/KnowledgeAssetViewer";
import {
  KnowledgeWorkspaceClientError,
  type KnowledgeWorkspaceClient,
  type RendererResourceReadResult,
  type RendererResourceStatResult,
} from "../../services/knowledge-workspace-client";

const address: KnowledgeResourceAddress = {
  sourceKey: "main",
  relativePath: "Assets/example.txt",
};

function base64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function stat(size: number): RendererResourceStatResult {
  return {
    exists: true,
    isDirectory: false,
    version: { mtimeMs: 1, size },
  };
}

function readBytes(bytes: Uint8Array): RendererResourceReadResult {
  return {
    content: base64(bytes),
    encoding: "base64",
    version: { mtimeMs: 1, size: bytes.byteLength },
  };
}

function viewerClient({
  statImpl,
  readImpl,
}: {
  statImpl: KnowledgeWorkspaceClient["resources"]["stat"];
  readImpl?: KnowledgeWorkspaceClient["resources"]["read"];
}): KnowledgeWorkspaceClient {
  return {
    resources: {
      stat: statImpl,
      read: readImpl ?? vi.fn(),
    },
  } as KnowledgeWorkspaceClient;
}

function installTranslations(): void {
  window.t = ((key: string, vars?: Record<string, string | number>) => {
    const values: Record<string, string> = {
      "knowledge.asset.label": "Asset viewer",
      "knowledge.asset.loading": "Loading asset…",
      "knowledge.asset.openDefault": "Open with default application",
      "knowledge.asset.reload": "Reload",
      "knowledge.asset.missing": "Resource does not exist",
      "knowledge.asset.unavailable": "Asset unavailable",
      "knowledge.asset.nativeUnavailable": "Default application is unavailable",
      "knowledge.asset.fileInfo": "File information",
      "knowledge.asset.source": "Source: {source}",
      "knowledge.asset.address": "Address: {address}",
      "knowledge.asset.size": "Size: {size}",
      "knowledge.asset.reason.content_too_large": "Content is larger than 10 MiB",
      "knowledge.asset.reason.active_content": "Active content is not previewed",
      "knowledge.asset.reason.unsupported_type": "No safe built-in preview",
      "knowledge.asset.reason.unsafe_encoding": "Text encoding is not safely decodable",
      "knowledge.asset.reason.content_size_unavailable": "File size is unavailable",
      "knowledge.asset.reason.not_a_file": "This resource is not a file",
    };
    let value = values[key] ?? key;
    for (const [name, replacement] of Object.entries(vars ?? {})) {
      value = value.replaceAll(`{${name}}`, String(replacement));
    }
    return value;
  }) as typeof window.t;
}

describe("KnowledgeAssetViewer", () => {
  beforeEach(() => {
    installTranslations();
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("stats before reading and never reads oversized or active content", async () => {
    const read = vi.fn();
    const oversizeStat = vi.fn(async () => stat(KNOWLEDGE_ASSET_MAX_BYTES + 1));
    const view = render(
      <KnowledgeAssetViewer
        address={address}
        client={viewerClient({ statImpl: oversizeStat, readImpl: read })}
        subscribeToChanges={() => () => {}}
        watchSource={() => () => {}}
      />,
    );

    expect(await screen.findByText("Content is larger than 10 MiB")).toBeInTheDocument();
    expect(oversizeStat).toHaveBeenCalledTimes(1);
    expect(read).not.toHaveBeenCalled();

    view.rerender(
      <KnowledgeAssetViewer
        address={{ ...address, relativePath: "Assets/unsafe.svg" }}
        client={viewerClient({ statImpl: vi.fn(async () => stat(128)), readImpl: read })}
        subscribeToChanges={() => () => {}}
        watchSource={() => () => {}}
      />,
    );

    expect(await screen.findByText("Active content is not previewed")).toBeInTheDocument();
    expect(read).not.toHaveBeenCalled();
  });

  it("opens safe text with deterministic decoding and never creates an editable surface", async () => {
    const bytes = Uint8Array.from([0xff, 0xfe, 0x60, 0x4f, 0x7d, 0x59]);
    const statImpl = vi.fn(async () => stat(bytes.byteLength));
    const read = vi.fn(async () => readBytes(bytes));
    render(
      <KnowledgeAssetViewer
        address={address}
        client={viewerClient({
          statImpl,
          readImpl: read,
        })}
        subscribeToChanges={() => () => {}}
        watchSource={() => () => {}}
      />,
    );

    expect(await screen.findByText("你好")).toBeInTheDocument();
    expect(screen.getByTestId("knowledge-asset-text")).toHaveAttribute("aria-readonly", "true");
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    expect(read).toHaveBeenCalledWith(address, expect.objectContaining({
      encoding: "base64",
      signal: expect.any(AbortSignal),
    }));
    expect(statImpl.mock.invocationCallOrder[0]).toBeLessThan(
      read.mock.invocationCallOrder[0],
    );
  });

  it("opens bounded image, PDF, audio and video assets without consulting an index", async () => {
    const cases = [
      ["photo.png", "img", "image"],
      ["paper.pdf", "iframe", "pdf"],
      ["voice.mp3", "audio", "audio"],
      ["clip.webm", "video", "video"],
    ] as const;

    for (const [fileName, selector, kind] of cases) {
      const bytes = new TextEncoder().encode(`${kind}-bytes`);
      const client = viewerClient({
        statImpl: vi.fn(async () => stat(bytes.byteLength)),
        readImpl: vi.fn(async () => readBytes(bytes)),
      });
      const view = render(
        <KnowledgeAssetViewer
          address={{ sourceKey: "main", relativePath: `Assets/${fileName}` }}
          client={client}
          subscribeToChanges={() => () => {}}
          watchSource={() => () => {}}
        />,
      );

      await waitFor(() => {
        expect(view.container.querySelector(selector)).toHaveAttribute(
          "data-knowledge-asset-kind",
          kind,
        );
      });
      expect(client.resources.stat).toHaveBeenCalledTimes(1);
      expect(client.resources.read).toHaveBeenCalledTimes(1);
      view.unmount();
    }
  });

  it("falls back to file information for an unsafe encoding after a bounded read", async () => {
    const bytes = Uint8Array.from([0xc3, 0x28]);
    const read = vi.fn(async () => readBytes(bytes));
    const openDefault = vi.fn(async () => undefined);
    render(
      <KnowledgeAssetViewer
        address={address}
        client={viewerClient({
          statImpl: vi.fn(async () => stat(bytes.byteLength)),
          readImpl: read,
        })}
        openDefault={openDefault}
        subscribeToChanges={() => () => {}}
        watchSource={() => () => {}}
      />,
    );

    expect(await screen.findByText("Text encoding is not safely decodable")).toBeInTheDocument();
    expect(read).toHaveBeenCalledTimes(1);
    expect(screen.getAllByText("example.txt")).toHaveLength(2);
    fireEvent.click(screen.getByRole("button", { name: "Open with default application" }));
    expect(openDefault).toHaveBeenCalledWith(address);
  });

  it("auto-refreshes on external changes, preserves scroll, and retains a missing tab", async () => {
    let publish: ((signal: KnowledgeAssetViewerChangeSignal) => void) | undefined;
    const subscribeToChanges = vi.fn((listener: (signal: KnowledgeAssetViewerChangeSignal) => void) => {
      publish = listener;
      return () => {};
    });
    const first = new TextEncoder().encode("first version");
    const second = new TextEncoder().encode("second version");
    const statImpl = vi.fn()
      .mockResolvedValueOnce(stat(first.byteLength))
      .mockResolvedValueOnce({
        ...stat(second.byteLength),
        version: { mtimeMs: 2, size: second.byteLength },
      })
      .mockResolvedValueOnce({ exists: false, isDirectory: false });
    const readImpl = vi.fn()
      .mockResolvedValueOnce(readBytes(first))
      .mockResolvedValueOnce({
        ...readBytes(second),
        version: { mtimeMs: 2, size: second.byteLength },
      });

    render(
      <KnowledgeAssetViewer
        address={address}
        client={viewerClient({ statImpl, readImpl })}
        refreshDelayMs={0}
        subscribeToChanges={subscribeToChanges}
        watchSource={() => () => {}}
      />,
    );

    expect(await screen.findByText("first version")).toBeInTheDocument();
    const scroller = screen.getByTestId("knowledge-asset-scroll");
    scroller.scrollTop = 73;

    act(() => publish?.({ kind: "resource-event" }));
    expect(await screen.findByText("second version")).toBeInTheDocument();
    expect(scroller.scrollTop).toBe(73);

    act(() => publish?.({ kind: "resource-event" }));
    expect(await screen.findByText("Resource does not exist")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Reload" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Asset viewer" })).toBeInTheDocument();
  });

  it("keeps failure state retryable, reports native degradation, and cancels stale work", async () => {
    const unavailable = new KnowledgeWorkspaceClientError({
      code: "knowledge_resource_unavailable",
      httpStatus: 503,
      retryable: true,
    });
    let firstSignal: AbortSignal | undefined;
    const statImpl = vi.fn(({ relativePath }, options = {}) => {
      if (relativePath === "Assets/example.txt") {
        firstSignal = options.signal;
        return new Promise<RendererResourceStatResult>(() => {});
      }
      return Promise.reject(unavailable);
    });
    const openDefault = vi.fn(async () => {
      throw new KnowledgeWorkspaceClientError({
        code: "knowledge_native_capability_unavailable",
        httpStatus: 501,
        retryable: false,
      });
    });
    const view = render(
      <KnowledgeAssetViewer
        address={address}
        client={viewerClient({ statImpl })}
        openDefault={openDefault}
        subscribeToChanges={() => () => {}}
        watchSource={() => () => {}}
      />,
    );

    view.rerender(
      <KnowledgeAssetViewer
        address={{ ...address, relativePath: "Assets/failure.bin" }}
        client={viewerClient({ statImpl })}
        openDefault={openDefault}
        subscribeToChanges={() => () => {}}
        watchSource={() => () => {}}
      />,
    );

    expect(firstSignal?.aborted).toBe(true);
    expect(await screen.findByText("Asset unavailable")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Open with default application" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Default application is unavailable",
    );
    expect(openDefault).toHaveBeenCalledWith({
      sourceKey: "main",
      relativePath: "Assets/failure.bin",
    });

    fireEvent.click(screen.getByRole("button", { name: "Reload" }));
    await waitFor(() => expect(statImpl).toHaveBeenCalledTimes(3));
  });

  it("fails closed when the bounded body no longer matches the stat version", async () => {
    const bytes = new TextEncoder().encode("changed");
    render(
      <KnowledgeAssetViewer
        address={address}
        client={viewerClient({
          statImpl: vi.fn(async () => stat(bytes.byteLength + 1)),
          readImpl: vi.fn(async () => readBytes(bytes)),
        })}
        subscribeToChanges={() => () => {}}
        watchSource={() => () => {}}
      />,
    );

    expect(await screen.findByText("Asset unavailable")).toBeInTheDocument();
    expect(screen.queryByText("changed")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Reload" })).toBeInTheDocument();
  });

  it("preserves media time across external refresh and makes decode failures retryable", async () => {
    let publish: ((signal: KnowledgeAssetViewerChangeSignal) => void) | undefined;
    const bytes = new TextEncoder().encode("video");
    const statImpl = vi.fn(async () => stat(bytes.byteLength));
    const readImpl = vi.fn(async () => readBytes(bytes));
    const view = render(
      <KnowledgeAssetViewer
        address={{ sourceKey: "main", relativePath: "Assets/clip.webm" }}
        client={viewerClient({ statImpl, readImpl })}
        refreshDelayMs={0}
        subscribeToChanges={(listener) => {
          publish = listener;
          return () => {};
        }}
        watchSource={() => () => {}}
      />,
    );

    const firstVideo = await waitFor(() => {
      const video = view.container.querySelector("video");
      expect(video).toBeInTheDocument();
      return video as HTMLVideoElement;
    });
    firstVideo.currentTime = 12;

    act(() => publish?.({ kind: "resource-event" }));
    await waitFor(() => expect(readImpl).toHaveBeenCalledTimes(2));
    const refreshedVideo = view.container.querySelector("video") as HTMLVideoElement;
    fireEvent.loadedMetadata(refreshedVideo);
    expect(refreshedVideo.currentTime).toBe(12);

    fireEvent.error(refreshedVideo);
    expect(await screen.findByText("Asset unavailable")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Reload" })).toBeInTheDocument();
  });

  it("shows explicit Open/Web degradation when no native action is available", async () => {
    render(
      <KnowledgeAssetViewer
        address={{ sourceKey: "main", relativePath: "Assets/archive.zip" }}
        client={viewerClient({
          statImpl: vi.fn(async () => stat(128)),
        })}
        subscribeToChanges={() => () => {}}
        watchSource={() => () => {}}
      />,
    );

    expect(await screen.findByText("No safe built-in preview")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Open with default application" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Default application is unavailable",
    );
  });
});
