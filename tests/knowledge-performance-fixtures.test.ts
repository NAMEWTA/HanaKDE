import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { TextDecoder } from "node:util";
import { afterEach, describe, expect, it } from "vitest";
import {
  FIXTURE_SEED,
  buildFixtureManifest,
  buildFixtureManifestEnvelope,
  createKnowledgeFixtureDataset,
  createTabs,
  createUtf8BoundaryDocument,
  fixtureDatasetHash,
  fixtureIdentityHash,
  fixtureManifestHash,
  generateWatchEvents,
  iterateResourceEntries,
  materializeFixture,
  resolveFixtureProfile,
  validateFixtureManifest,
} from "./fixtures/knowledge-workspace/generate-fixture.js";

const cleanupRoots = new Set<string>();

afterEach(() => {
  for (const root of cleanupRoots) {
    fs.rmSync(root, { recursive: true, force: true });
  }
  cleanupRoots.clear();
});

describe("knowledge performance fixtures", () => {
  it("freezes the full 20260725 profile without materializing generated bulk data", () => {
    const manifest = buildFixtureManifest(resolveFixtureProfile("full"));

    expect(manifest.seed).toBe(FIXTURE_SEED);
    expect(manifest.sources).toHaveLength(4);
    expect(manifest.treeEntryCounts).toEqual([10_000, 100_000]);
    expect(manifest.resources).toEqual({
      markdown: 60_000,
      safeText: 20_000,
      imageMetadata: 10_000,
      pdfMetadata: 5_000,
      unknownBinary: 5_000,
    });
    expect(manifest.semanticCounts).toEqual({
      wikilinks: 50_000,
      brokenLinks: 10_000,
      tags: 20_000,
      tasks: 20_000,
      headingsHeavyPages: 5_000,
    });
    expect(manifest.watchEventCount).toBe(5_000);
    expect(manifest.tabCount).toBe(100);
    expect(manifest.documentBytes).toEqual({
      acceptedUtf8: 10 * 1024 * 1024,
      rejectedOverLimit: 10 * 1024 * 1024 + 1,
    });
    expect(manifest.pathCharacteristics).toEqual(
      expect.objectContaining({
        minDepth: 1,
        maxDepth: 12,
        mixedCase: true,
        unicode: true,
        longNames: true,
        emptyDirectories: true,
        sameNameAcrossSources: true,
      }),
    );
    expect(validateFixtureManifest(buildFixtureManifestEnvelope(resolveFixtureProfile("full")))).toEqual({
      ok: true,
    });
  });

  it("uses a bounded CI smoke profile while retaining every algorithm-limit dimension", () => {
    const smoke = buildFixtureManifest(resolveFixtureProfile("smoke"));
    const full = buildFixtureManifest(resolveFixtureProfile("full"));

    expect(smoke.scale).toBe(0.1);
    expect(smoke.treeEntryCounts).toEqual(full.treeEntryCounts.map((count) => count / 10));
    expect(smoke.resources).toEqual(
      Object.fromEntries(
        Object.entries(full.resources).map(([key, count]) => [key, count / 10]),
      ),
    );
    expect(smoke.semanticCounts).toEqual(
      Object.fromEntries(
        Object.entries(full.semanticCounts).map(([key, count]) => [key, count / 10]),
      ),
    );
    expect(smoke.watchEventCount).toBe(full.watchEventCount / 10);
    expect(smoke.tabCount).toBe(full.tabCount / 10);
    expect(smoke.sources).toHaveLength(4);
    expect(smoke.sources).toEqual(full.sources);
    expect(smoke.pathCharacteristics).toEqual(full.pathCharacteristics);
    expect(smoke.pathCharacteristics.maxDepth).toBe(12);
    expect(smoke.documentBytes).toEqual(full.documentBytes);
  });

  it("lazily expresses the exact 100k full resource mix and semantic upper limits", () => {
    const totals = {
      markdown: 0,
      safeText: 0,
      imageMetadata: 0,
      pdfMetadata: 0,
      unknownBinary: 0,
      wikilinks: 0,
      brokenLinks: 0,
      tags: 0,
      tasks: 0,
      headingsHeavyPages: 0,
    };
    let count = 0;
    let maximumDepth = 0;
    let actualWikilinks = 0;
    let actualBrokenLinks = 0;
    let actualTags = 0;
    let actualTasks = 0;
    let actualHeadingsHeavyPages = 0;
    let metadataResources = 0;
    for (const entry of iterateResourceEntries(resolveFixtureProfile("full"), "tree100k")) {
      count += 1;
      totals[entry.kind] += 1;
      totals.wikilinks += entry.wikilinks;
      totals.brokenLinks += entry.brokenLinks;
      totals.tags += entry.tags;
      totals.tasks += entry.tasks;
      totals.headingsHeavyPages += entry.headingsHeavy ? 1 : 0;
      maximumDepth = Math.max(maximumDepth, entry.relativePath.split("/").length);
      const content = entry.read().toString("utf8");
      actualWikilinks += (content.match(/\[\[Target-/g) ?? []).length;
      actualBrokenLinks += (content.match(/\[\[Missing-/g) ?? []).length;
      actualTags += (content.match(/#fixture-/g) ?? []).length;
      actualTasks += (content.match(/- \[ \] deterministic task/g) ?? []).length;
      actualHeadingsHeavyPages += (content.match(/\n#{1,6} Heading/g) ?? []).length >= 24 ? 1 : 0;
      metadataResources += entry.metadata === null ? 0 : 1;
    }

    expect(count).toBe(100_000);
    expect(totals).toEqual({
      markdown: 60_000,
      safeText: 20_000,
      imageMetadata: 10_000,
      pdfMetadata: 5_000,
      unknownBinary: 5_000,
      wikilinks: 50_000,
      brokenLinks: 10_000,
      tags: 20_000,
      tasks: 20_000,
      headingsHeavyPages: 5_000,
    });
    expect(maximumDepth).toBe(12);
    expect({ actualWikilinks, actualBrokenLinks, actualTags, actualTasks, actualHeadingsHeavyPages }).toEqual({
      actualWikilinks: 50_000,
      actualBrokenLinks: 10_000,
      actualTags: 20_000,
      actualTasks: 20_000,
      actualHeadingsHeavyPages: 5_000,
    });
    expect(metadataResources).toBe(20_000);
  });

  it("exposes deterministic consumable source, document, tab and full dataset streams", () => {
    const profile = resolveFixtureProfile("full");
    const dataset = createKnowledgeFixtureDataset(profile);
    const first = dataset.resources("tree10k").next().value;
    const hash = fixtureDatasetHash(profile, "tree100k");

    expect(dataset.sourceRoots).toEqual([
      { sourceKey: "main", sameNameRelativePath: "Shared/SameName.md" },
      { sourceKey: "research", sameNameRelativePath: "Shared/SameName.md" },
      { sourceKey: "archive", sameNameRelativePath: "Shared/SameName.md" },
      { sourceKey: "资料", sameNameRelativePath: "Shared/SameName.md" },
    ]);
    expect(first?.read().byteLength).toBeGreaterThan(0);
    expect(createTabs(profile)).toHaveLength(100);
    expect(dataset.boundaryDocument("accepted")).toHaveLength(10 * 1024 * 1024);
    expect(dataset.boundaryDocument("overLimit")).toHaveLength(10 * 1024 * 1024 + 1);
    expect(hash.resourceCount).toBe(100_000);
    expect(hash.contentHash).toMatch(/^[a-f0-9]{64}$/);
    expect(fixtureDatasetHash(profile, "tree100k")).toEqual(hash);
    expect(dataset.identity).toBe(fixtureIdentityHash(profile));
    const sameNameAddresses = [...dataset.resources("tree100k")]
      .filter((entry) => entry.relativePath === "Shared/SameName.md")
      .map((entry) => `${entry.sourceKey}:${entry.relativePath}`);
    expect(sameNameAddresses).toEqual([
      "main:Shared/SameName.md",
      "research:Shared/SameName.md",
      "archive:Shared/SameName.md",
      "资料:Shared/SameName.md",
    ]);
  });

  it("provides discriminated, consumable inputs for all twelve benchmark scenarios", () => {
    const dataset = createKnowledgeFixtureDataset(resolveFixtureProfile("full"));
    const dense = dataset.scenario("denseWikilinks50k");
    const recovery = dataset.scenario("operationRecovery1k");
    const ids = [
      "initialTree10k",
      "hugeTree100k",
      "markdown10MiB",
      "denseWikilinks50k",
      "watcherBurst5k",
      "searchWarmTrigram",
      "searchWarmShort",
      "searchColdOpen",
      "multiView100Tabs",
      "fullRebuild100k",
      "generationSwitch",
      "operationRecovery1k",
    ] as const;

    expect(ids.map((id) => dataset.scenario(id).id)).toEqual(ids);
    expect(dense.kind).toBe("dense-wikilinks");
    if (dense.kind === "dense-wikilinks") {
      expect((dense.readDocument().toString("utf8").match(/\[\[Dense-Target-/g) ?? []).length).toBe(
        50_000,
      );
    }
    expect(recovery.kind).toBe("operation-recovery");
    if (recovery.kind === "operation-recovery") {
      const records = [...recovery.records()];
      expect(records).toHaveLength(1_000);
      expect(new Set(records.map((record) => record.operationId)).size).toBe(1_000);
    }
  });

  it("produces stable hashes for the same seed and distinct hashes for another seed", () => {
    const first = buildFixtureManifest(resolveFixtureProfile("smoke", FIXTURE_SEED));
    const second = buildFixtureManifest(resolveFixtureProfile("smoke", FIXTURE_SEED));
    const other = buildFixtureManifest(resolveFixtureProfile("smoke", FIXTURE_SEED + 1));

    expect(fixtureManifestHash(first)).toBe(fixtureManifestHash(second));
    expect(fixtureManifestHash(other)).not.toBe(fixtureManifestHash(first));
  });

  it("generates strict UTF-8 at exactly 10 MiB and the rejected 10 MiB plus one boundary", () => {
    const accepted = createUtf8BoundaryDocument(10 * 1024 * 1024, FIXTURE_SEED);
    const rejected = createUtf8BoundaryDocument(10 * 1024 * 1024 + 1, FIXTURE_SEED);
    const decoder = new TextDecoder("utf-8", { fatal: true });

    expect(accepted.byteLength).toBe(10 * 1024 * 1024);
    expect(rejected.byteLength).toBe(10 * 1024 * 1024 + 1);
    expect(() => decoder.decode(accepted)).not.toThrow();
    expect(() => decoder.decode(rejected)).not.toThrow();
    expect(accepted.includes(Buffer.from("\r\n"))).toBe(true);
    expect(accepted.includes(Buffer.from("\n"))).toBe(true);
  });

  it("models duplicate, rename, delete, gap and operation-correlated watcher bursts", () => {
    const events = generateWatchEvents(resolveFixtureProfile("full"));
    const smokeEvents = generateWatchEvents(resolveFixtureProfile("smoke"));

    expect(events).toHaveLength(5_000);
    expect(events.some((event) => event.kind === "rename")).toBe(true);
    expect(events.some((event) => event.kind === "delete")).toBe(true);
    expect(events.some((event) => event.duplicateOf !== undefined)).toBe(true);
    expect(events.some((event, index) => index > 0 && event.sequence > events[index - 1]!.sequence + 1)).toBe(
      true,
    );
    expect(events.some((event) => event.operationId !== undefined)).toBe(true);
    expect(smokeEvents).toHaveLength(500);
    expect(
      smokeEvents.some(
        (event, index) => index > 0 && event.sequence > smokeEvents[index - 1]!.sequence + 1,
      ),
    ).toBe(true);
    expect(events[0]?.timestampMs).toBe(0);
    expect(events.at(-1)?.timestampMs).toBeLessThan(10_000);
    expect(events.every((event, index) => index === 0 || event.timestampMs >= events[index - 1]!.timestampMs)).toBe(
      true,
    );
    expect(
      events
        .filter((event) => event.operationId !== undefined)
        .every((event) =>
          /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(
            event.operationId!,
          ),
        ),
    ).toBe(true);
  });

  it("materializes only inside an isolated temporary root and cleans partial output after failure", async () => {
    const parent = fs.mkdtempSync(path.join(os.tmpdir(), "hana-kw-fixture-parent-"));
    cleanupRoots.add(parent);
    const before = fs.readdirSync(parent);

    await expect(
      materializeFixture(
        { parentDirectory: parent, profile: resolveFixtureProfile("smoke") },
        async (fixture) => {
          expect(fixture.root.startsWith(`${parent}${path.sep}`)).toBe(true);
          expect(fs.existsSync(fixture.manifestPath)).toBe(true);
          expect(
            validateFixtureManifest(JSON.parse(fs.readFileSync(fixture.manifestPath, "utf8"))),
          ).toEqual({ ok: true });
          expect(fixture.sourceRoots).toHaveLength(4);
          expect(fixture.sourceRoots.map((root) => path.basename(root))).not.toContain("silverbullet");
          expect(await fixture.writeResources({ tree: "tree100k", limit: 25 })).toBe(25);
          expect(
            fixture.sourceRoots.some((sourceRoot) =>
              fs.readdirSync(sourceRoot, { recursive: true }).some((entry) => String(entry).endsWith(".md")),
            ),
          ).toBe(true);
          throw new Error("injected fixture consumer failure");
        },
      ),
    ).rejects.toThrow("injected fixture consumer failure");

    expect(fs.readdirSync(parent)).toEqual(before);
  });

  it("cancels requested materialization and removes its isolated root", async () => {
    const parent = fs.mkdtempSync(path.join(os.tmpdir(), "hana-kw-fixture-cancel-"));
    cleanupRoots.add(parent);
    const controller = new AbortController();
    controller.abort();

    await materializeFixture(
      { parentDirectory: parent, profile: resolveFixtureProfile("smoke") },
      async (fixture) => {
        await expect(
          fixture.writeResources({
            tree: "tree100k",
            signal: controller.signal,
          }),
        ).rejects.toMatchObject({ name: "AbortError" });
      },
    );

    expect(fs.readdirSync(parent)).toEqual([]);
  });

  it("materializes exactly the smoke stream count without out-of-stream same-name files", async () => {
    const parent = fs.mkdtempSync(path.join(os.tmpdir(), "hana-kw-fixture-exact-"));
    cleanupRoots.add(parent);
    await materializeFixture(
      { parentDirectory: parent, profile: resolveFixtureProfile("smoke") },
      async (fixture) => {
        expect(await fixture.writeResources({ tree: "tree100k" })).toBe(10_000);
        const files = fixture.sourceRoots.flatMap((sourceRoot) =>
          fs
            .readdirSync(sourceRoot, { recursive: true, withFileTypes: true })
            .filter((entry) => entry.isFile()),
        );
        expect(files).toHaveLength(10_000);
        const sameNameFiles = fixture.sourceRoots.filter((sourceRoot) =>
          fs.existsSync(path.join(sourceRoot, "Shared", "SameName.md")),
        );
        expect(sameNameFiles).toHaveLength(4);
      },
    );
    expect(fs.readdirSync(parent)).toEqual([]);
  });

  it("rejects unknown profiles, invalid seeds and malformed manifests", () => {
    expect(() => resolveFixtureProfile("unknown")).toThrow(/unknown fixture profile/i);
    expect(() => resolveFixtureProfile("smoke", -1)).toThrow(/seed/i);
    expect(validateFixtureManifest({ seed: FIXTURE_SEED })).toEqual(
      expect.objectContaining({ ok: false }),
    );
    const valid = buildFixtureManifestEnvelope(resolveFixtureProfile("smoke"));
    expect(
      validateFixtureManifest({
        ...valid,
        manifest: { ...valid.manifest, scale: 0.01 },
      }),
    ).toEqual(expect.objectContaining({ ok: false }));
    expect(validateFixtureManifest({ ...valid, fixtureHash: valid.fixtureIdentity })).toEqual(
      expect.objectContaining({ ok: false }),
    );
    expect(
      validateFixtureManifest({
        ...valid,
        manifest: { ...valid.manifest, watchEventCount: -1 },
      }),
    ).toEqual(
      expect.objectContaining({ ok: false }),
    );
    expect(
      validateFixtureManifest({
        ...valid,
        manifest: { ...valid.manifest, sources: [...valid.manifest.sources].reverse() },
      }),
    ).toEqual(expect.objectContaining({ ok: false }));
    expect(
      validateFixtureManifest({
        ...valid,
        manifest: {
          ...valid.manifest,
          pathCharacteristics: { ...valid.manifest.pathCharacteristics, maxDepth: 11 },
        },
      }),
    ).toEqual(expect.objectContaining({ ok: false }));
    expect(
      validateFixtureManifest({
        ...valid,
        manifest: {
          ...valid.manifest,
          documentBytes: {
            ...valid.manifest.documentBytes,
            acceptedUtf8: 10 * 1024 * 1024 - 1,
          },
        },
      }),
    ).toEqual(expect.objectContaining({ ok: false }));
    expect(validateFixtureManifest(new Proxy(valid, {}))).toEqual(expect.objectContaining({ ok: false }));
    let getterCalls = 0;
    const accessor = Object.defineProperty({}, "profile", {
      enumerable: true,
      get: () => {
        getterCalls += 1;
        return "smoke";
      },
    });
    expect(validateFixtureManifest(accessor)).toEqual(expect.objectContaining({ ok: false }));
    expect(getterCalls).toBe(0);
  });

  it("does not serialize a developer home or workspace path into the fixture manifest", () => {
    const serialized = JSON.stringify(buildFixtureManifest(resolveFixtureProfile("smoke")));

    expect(serialized).not.toContain(os.homedir());
    expect(serialized).not.toContain(process.cwd());
    expect(serialized).not.toMatch(/(?:[A-Za-z]:\\Users\\|\/Users\/|\/home\/)/);
  });
});
