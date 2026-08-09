import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ResourceIO } from "../lib/resource-io/resource-io.ts";
import { UrlProvider } from "../lib/resource-io/providers/url-provider.ts";

describe("ResourceIO materialize lifecycle", () => {
  let root: string | null = null;

  afterEach(() => {
    vi.restoreAllMocks();
    if (root) fs.rmSync(root, { recursive: true, force: true });
    root = null;
  });

  it("releases temporary staging after the scoped materialize callback", async () => {
    const cleanup = vi.fn();
    const provider = {
      id: "url" as const,
      capabilities: () => ({ materialize: true }),
      materialize: vi.fn(async () => ({
        resourceKey: "url:https://example.com/report.txt",
        resource: { kind: "url" as const, url: "https://example.com/report.txt" },
        filePath: "/tmp/materialized-report.txt",
        cleanup,
      })),
    };
    const resourceIO = new ResourceIO({ providers: { url: provider } });

    const result = await resourceIO.withMaterialized(
      { kind: "url", url: "https://example.com/report.txt" },
      async (materialized) => materialized.filePath,
    );

    expect(result).toBe("/tmp/materialized-report.txt");
    expect(cleanup).toHaveBeenCalledTimes(1);
  });

  it("releases temporary staging when the scoped materialize callback fails", async () => {
    const cleanup = vi.fn();
    const provider = {
      id: "url" as const,
      capabilities: () => ({ materialize: true }),
      materialize: vi.fn(async () => ({
        resourceKey: "url:https://example.com/report.txt",
        resource: { kind: "url" as const, url: "https://example.com/report.txt" },
        filePath: "/tmp/materialized-report.txt",
        cleanup,
      })),
    };
    const resourceIO = new ResourceIO({ providers: { url: provider } });

    await expect(resourceIO.withMaterialized(
      { kind: "url", url: "https://example.com/report.txt" },
      async () => {
        throw new Error("converter failed");
      },
    )).rejects.toThrow("converter failed");

    expect(cleanup).toHaveBeenCalledTimes(1);
  });

  it("returns an idempotent URL staging lease that removes only its temporary projection", async () => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "hana-resource-materialize-"));
    const timer = { unref: vi.fn() } as unknown as ReturnType<typeof setTimeout>;
    const clearLeaseTimeout = vi.fn();
    const provider = new UrlProvider({
      materializeRoot: root,
      fetch: vi.fn(async () => new Response("temporary document", { status: 200 })),
      resolveHostname: async () => ["93.184.216.34"],
      setMaterializeLeaseTimeout: vi.fn(() => timer),
      clearMaterializeLeaseTimeout: clearLeaseTimeout,
    });

    const materialized = await provider.materialize({
      kind: "url",
      url: "https://example.com/report.txt",
    });
    expect(fs.readFileSync(materialized.filePath, "utf8")).toBe("temporary document");

    await materialized.cleanup?.();
    await materialized.cleanup?.();

    expect(fs.existsSync(materialized.filePath)).toBe(false);
    expect(fs.readdirSync(root)).toEqual([]);
    expect(timer.unref).toHaveBeenCalledTimes(1);
    expect(clearLeaseTimeout).toHaveBeenCalledTimes(1);
  });

  it("releases URL staging when a direct caller ignores its lease", async () => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "hana-resource-materialize-"));
    const timer = { unref: vi.fn() } as unknown as ReturnType<typeof setTimeout>;
    let releaseLease: (() => void) | undefined;
    const provider = new UrlProvider({
      materializeRoot: root,
      fetch: vi.fn(async () => new Response("temporary document", { status: 200 })),
      resolveHostname: async () => ["93.184.216.34"],
      materializeLeaseMs: 1,
      setMaterializeLeaseTimeout: (callback, delayMs) => {
        expect(delayMs).toBe(1);
        releaseLease = callback;
        return timer;
      },
      clearMaterializeLeaseTimeout: vi.fn(),
    });

    const materialized = await provider.materialize({
      kind: "url",
      url: "https://example.com/report.txt",
    });
    expect(fs.existsSync(materialized.filePath)).toBe(true);

    releaseLease?.();

    expect(fs.existsSync(materialized.filePath)).toBe(false);
    expect(fs.readdirSync(root)).toEqual([]);
  });

  it("cleans URL staging immediately when writing the projection fails", async () => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "hana-resource-materialize-"));
    vi.spyOn(fs, "writeFileSync").mockImplementationOnce(() => {
      throw new Error("disk full");
    });
    const provider = new UrlProvider({
      materializeRoot: root,
      fetch: vi.fn(async () => new Response("temporary document", { status: 200 })),
      resolveHostname: async () => ["93.184.216.34"],
    });

    await expect(provider.materialize({
      kind: "url",
      url: "https://example.com/report.txt",
    })).rejects.toMatchObject({ code: "materialize_failed" });

    expect(fs.readdirSync(root)).toEqual([]);
  });

  it("cleans URL staging when it cannot arm a cleanup lease", async () => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "hana-resource-materialize-"));
    const provider = new UrlProvider({
      materializeRoot: root,
      fetch: vi.fn(async () => new Response("temporary document", { status: 200 })),
      resolveHostname: async () => ["93.184.216.34"],
      setMaterializeLeaseTimeout: () => {
        throw new Error("timer unavailable");
      },
    });

    await expect(provider.materialize({
      kind: "url",
      url: "https://example.com/report.txt",
    })).rejects.toMatchObject({ code: "materialize_failed" });

    expect(fs.readdirSync(root)).toEqual([]);
  });
});
