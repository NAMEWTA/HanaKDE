import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { types as utilTypes } from "node:util";

export const FIXTURE_SEED = 20260725;
export const TEN_MIB = 10 * 1024 * 1024;

export type FixtureProfileName = "smoke" | "full";

export interface FixtureProfile {
  readonly name: FixtureProfileName;
  readonly seed: number;
  readonly scale: number;
}

export interface FixtureManifest {
  readonly schemaVersion: 1;
  readonly profile: FixtureProfileName;
  readonly seed: number;
  readonly scale: number;
  readonly sources: readonly [
    { readonly sourceKey: "main"; readonly role: "main"; readonly displayName: "Main" },
    { readonly sourceKey: "research"; readonly role: "mounted"; readonly displayName: "Research" },
    { readonly sourceKey: "archive"; readonly role: "mounted"; readonly displayName: "Archive" },
    { readonly sourceKey: "materials"; readonly role: "mounted"; readonly displayName: "资料" },
  ];
  readonly treeEntryCounts: readonly [number, number];
  readonly resources: {
    readonly markdown: number;
    readonly safeText: number;
    readonly imageMetadata: number;
    readonly pdfMetadata: number;
    readonly unknownBinary: number;
  };
  readonly semanticCounts: {
    readonly wikilinks: number;
    readonly brokenLinks: number;
    readonly tags: number;
    readonly tasks: number;
    readonly headingsHeavyPages: number;
  };
  readonly watchEventCount: number;
  readonly watchWindowMs: 10_000;
  readonly tabCount: number;
  readonly tabGroupCount: 4;
  readonly documentBytes: {
    readonly acceptedUtf8: number;
    readonly rejectedOverLimit: number;
  };
  readonly pathCharacteristics: {
    readonly minDepth: 1;
    readonly maxDepth: 12;
    readonly mixedCase: true;
    readonly unicode: true;
    readonly longNames: true;
    readonly emptyDirectories: true;
    readonly sameNameAcrossSources: true;
  };
  readonly newlineInputs: readonly ["lf", "crlf", "mixed"];
}

export interface FixtureManifestEnvelope {
  readonly schemaVersion: 1;
  readonly manifest: FixtureManifest;
  readonly fixtureIdentity: string;
}

export interface WatchFixtureEvent {
  readonly sequence: number;
  readonly timestampMs: number;
  readonly sourceKey: string;
  readonly kind: "create" | "modify" | "rename" | "delete";
  readonly relativePath: string;
  readonly previousRelativePath?: string;
  readonly operationId?: string;
  readonly duplicateOf?: number;
}

export interface ResourceFixtureEntry {
  readonly sourceKey: string;
  readonly relativePath: string;
  readonly kind: keyof FixtureManifest["resources"];
  readonly wikilinks: number;
  readonly brokenLinks: number;
  readonly tags: number;
  readonly tasks: number;
  readonly headingsHeavy: boolean;
  readonly read: () => Buffer;
  readonly metadata:
    | null
    | {
        readonly mediaType: string;
        readonly byteLength: number;
        readonly pageCount?: number;
        readonly width?: number;
        readonly height?: number;
      };
}

export interface TabFixture {
  readonly tabId: string;
  readonly group: 0 | 1 | 2 | 3;
  readonly sourceKey: string;
  readonly relativePath: string;
  readonly visible: boolean;
}

export type FixtureScenarioId =
  | "initialTree10k"
  | "hugeTree100k"
  | "markdown10MiB"
  | "denseWikilinks50k"
  | "watcherBurst5k"
  | "searchWarmTrigram"
  | "searchWarmShort"
  | "searchColdOpen"
  | "multiView100Tabs"
  | "fullRebuild100k"
  | "generationSwitch"
  | "operationRecovery1k";

export interface JournalFixtureRecord {
  readonly operationId: string;
  readonly state: "PREPARED" | "COMMITTING" | "ROLLING_BACK";
  readonly sourceKey: string;
  readonly relativePath: string;
  readonly sequence: number;
}

export type KnowledgeScenarioFixture =
  | {
      readonly id: "initialTree10k";
      readonly kind: "resource-tree";
      readonly expectedEntries: number;
      readonly resources: () => Generator<ResourceFixtureEntry>;
    }
  | {
      readonly id: "hugeTree100k" | "fullRebuild100k";
      readonly kind: "huge-resource-tree";
      readonly expectedEntries: number;
      readonly resources: () => Generator<ResourceFixtureEntry>;
    }
  | {
      readonly id: "markdown10MiB";
      readonly kind: "markdown-boundary";
      readonly accepted: () => Buffer;
      readonly overLimit: () => Buffer;
    }
  | {
      readonly id: "denseWikilinks50k";
      readonly kind: "dense-wikilinks";
      readonly expectedWikilinks: number;
      readonly readDocument: () => Buffer;
    }
  | {
      readonly id: "watcherBurst5k";
      readonly kind: "watch-burst";
      readonly expectedEvents: number;
      readonly events: () => WatchFixtureEvent[];
    }
  | {
      readonly id: "searchWarmTrigram";
      readonly kind: "search";
      readonly query: "資料庫";
      readonly expectedEntries: number;
      readonly resources: () => Generator<ResourceFixtureEntry>;
    }
  | {
      readonly id: "searchWarmShort";
      readonly kind: "search";
      readonly query: "資";
      readonly expectedEntries: number;
      readonly resources: () => Generator<ResourceFixtureEntry>;
    }
  | {
      readonly id: "searchColdOpen";
      readonly kind: "cold-search";
      readonly query: "fixture";
      readonly expectedEntries: number;
      readonly resources: () => Generator<ResourceFixtureEntry>;
    }
  | {
      readonly id: "multiView100Tabs";
      readonly kind: "tabs";
      readonly expectedTabs: number;
      readonly tabs: () => TabFixture[];
    }
  | {
      readonly id: "generationSwitch";
      readonly kind: "generation-switch";
      readonly previousGeneration: "generation-0001";
      readonly currentGeneration: "generation-0002";
      readonly concurrentQuery: "fixture";
    }
  | {
      readonly id: "operationRecovery1k";
      readonly kind: "operation-recovery";
      readonly expectedRecords: number;
      readonly records: () => Generator<JournalFixtureRecord>;
    };

export interface KnowledgeFixtureDataset {
  readonly manifest: FixtureManifest;
  readonly identity: string;
  readonly sourceRoots: readonly {
    readonly sourceKey: string;
    readonly sameNameRelativePath: "Shared/SameName.md";
  }[];
  readonly resources: (tree: "tree10k" | "tree100k") => Generator<ResourceFixtureEntry>;
  readonly watchEvents: () => WatchFixtureEvent[];
  readonly tabs: () => TabFixture[];
  readonly boundaryDocument: (kind: "accepted" | "overLimit") => Buffer;
  readonly scenario: (id: FixtureScenarioId) => KnowledgeScenarioFixture;
}

export interface MaterializedFixture {
  readonly root: string;
  readonly sourceRoots: readonly string[];
  readonly manifestPath: string;
  readonly manifest: FixtureManifest;
  readonly dataset: KnowledgeFixtureDataset;
  readonly writeResources: (options: {
    readonly tree: "tree10k" | "tree100k";
    readonly limit?: number;
    readonly signal?: AbortSignal;
  }) => Promise<number>;
}

function scaled(fullCount: number, scale: number): number {
  return Math.max(1, Math.floor(fullCount * scale));
}

export function resolveFixtureProfile(name: string, seed = FIXTURE_SEED): FixtureProfile {
  if (!Number.isSafeInteger(seed) || seed < 0) {
    throw new RangeError("Fixture seed must be a non-negative safe integer");
  }
  if (name !== "smoke" && name !== "full") {
    throw new Error(`Unknown fixture profile: ${name}`);
  }
  return Object.freeze({
    name,
    seed,
    scale: name === "full" ? 1 : 0.1,
  });
}

export function buildFixtureManifest(profile: FixtureProfile): FixtureManifest {
  const { scale } = profile;
  return {
    schemaVersion: 1,
    profile: profile.name,
    seed: profile.seed,
    scale,
    sources: [
      { sourceKey: "main", role: "main", displayName: "Main" },
      { sourceKey: "research", role: "mounted", displayName: "Research" },
      { sourceKey: "archive", role: "mounted", displayName: "Archive" },
      { sourceKey: "materials", role: "mounted", displayName: "资料" },
    ],
    treeEntryCounts: [scaled(10_000, scale), scaled(100_000, scale)],
    resources: {
      markdown: scaled(60_000, scale),
      safeText: scaled(20_000, scale),
      imageMetadata: scaled(10_000, scale),
      pdfMetadata: scaled(5_000, scale),
      unknownBinary: scaled(5_000, scale),
    },
    semanticCounts: {
      wikilinks: scaled(50_000, scale),
      brokenLinks: scaled(10_000, scale),
      tags: scaled(20_000, scale),
      tasks: scaled(20_000, scale),
      headingsHeavyPages: scaled(5_000, scale),
    },
    watchEventCount: scaled(5_000, scale),
    watchWindowMs: 10_000,
    tabCount: scaled(100, scale),
    tabGroupCount: 4,
    documentBytes: {
      acceptedUtf8: TEN_MIB,
      rejectedOverLimit: TEN_MIB + 1,
    },
    pathCharacteristics: {
      minDepth: 1,
      maxDepth: 12,
      mixedCase: true,
      unicode: true,
      longNames: true,
      emptyDirectories: true,
      sameNameAcrossSources: true,
    },
    newlineInputs: ["lf", "crlf", "mixed"],
  };
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(canonicalJson).join(",")}]`;
  }
  if (value !== null && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

export function fixtureManifestHash(manifest: FixtureManifest): string {
  return createHash("sha256").update(canonicalJson(manifest), "utf8").digest("hex");
}

function createPrng(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4_294_967_296;
  };
}

function deterministicRelativePath(
  index: number,
  random: () => number,
  kind: ResourceFixtureEntry["kind"] = "markdown",
): string {
  if (index < 4) return "Shared/SameName.md";
  const depth = (index % 12) + 1;
  const parts: string[] = [];
  const variants = ["Alpha", "beta", "資料", "Über", "LongName-" + "x".repeat(48)];
  for (let segment = 0; segment < depth - 1; segment += 1) {
    parts.push(`${variants[(index + segment) % variants.length]}-${Math.floor(random() * 97)}`);
  }
  const extension = {
    markdown: ".md",
    safeText: ".txt",
    imageMetadata: ".png",
    pdfMetadata: ".pdf",
    unknownBinary: ".bin",
  }[kind];
  parts.push(
    index % 17 === 0
      ? `SameName-${index.toString().padStart(6, "0")}${extension}`
      : `Resource-${index.toString().padStart(6, "0")}${extension}`,
  );
  return parts.join("/");
}

function resourceBody(
  index: number,
  kind: ResourceFixtureEntry["kind"],
  semantics: Pick<
    ResourceFixtureEntry,
    "wikilinks" | "brokenLinks" | "tags" | "tasks" | "headingsHeavy"
  >,
  seed: number,
): Buffer {
  if (kind === "markdown") {
    const lines = [`# Fixture ${index}`, `seed:${seed}`];
    if (semantics.wikilinks > 0) lines.push(`[[Target-${index}.md]]`);
    if (semantics.brokenLinks > 0) lines.push(`[[Missing-${index}.md]]`);
    if (semantics.tags > 0) lines.push(`#fixture-${index}`);
    if (semantics.tasks > 0) lines.push(`- [ ] deterministic task ${index}`);
    if (semantics.headingsHeavy) {
      for (let heading = 0; heading < 24; heading += 1) {
        lines.push(`${"#".repeat((heading % 6) + 1)} Heading ${heading}`);
      }
    }
    return Buffer.from(`${lines.join(index % 2 === 0 ? "\n" : "\r\n")}\n`, "utf8");
  }
  if (kind === "safeText") {
    return Buffer.from(`safe text ${index}\nseed:${seed}\n資料庫\n`, "utf8");
  }
  return Buffer.alloc(0);
}

export function* iterateResourceEntries(
  profile: FixtureProfile,
  tree: "tree10k" | "tree100k",
): Generator<ResourceFixtureEntry> {
  const fullCount = tree === "tree10k" ? 10_000 : 100_000;
  const count = scaled(fullCount, profile.scale);
  const random = createPrng(profile.seed);
  const sourceKeys = ["main", "research", "archive", "materials"];
  const kindLimits = {
    markdown: scaled(fullCount * 0.6, profile.scale),
    safeText: scaled(fullCount * 0.2, profile.scale),
    imageMetadata: scaled(fullCount * 0.1, profile.scale),
    pdfMetadata: scaled(fullCount * 0.05, profile.scale),
  };
  const semanticLimits = {
    wikilinks: scaled(fullCount * 0.5, profile.scale),
    brokenLinks: scaled(fullCount * 0.1, profile.scale),
    tags: scaled(fullCount * 0.2, profile.scale),
    tasks: scaled(fullCount * 0.2, profile.scale),
    headings: scaled(fullCount * 0.05, profile.scale),
  };
  for (let index = 0; index < count; index += 1) {
    let kind: ResourceFixtureEntry["kind"];
    if (index < kindLimits.markdown) kind = "markdown";
    else if (index < kindLimits.markdown + kindLimits.safeText) kind = "safeText";
    else if (index < kindLimits.markdown + kindLimits.safeText + kindLimits.imageMetadata) kind = "imageMetadata";
    else if (
      index <
      kindLimits.markdown + kindLimits.safeText + kindLimits.imageMetadata + kindLimits.pdfMetadata
    ) {
      kind = "pdfMetadata";
    } else kind = "unknownBinary";
    const semantics = {
      wikilinks: index < semanticLimits.wikilinks ? 1 : 0,
      brokenLinks: index < semanticLimits.brokenLinks ? 1 : 0,
      tags: index < semanticLimits.tags ? 1 : 0,
      tasks: index < semanticLimits.tasks ? 1 : 0,
      headingsHeavy: index < semanticLimits.headings,
    };
    const metadata =
      kind === "imageMetadata"
        ? { mediaType: "image/png", byteLength: 4_096 + index, width: 640, height: 480 }
        : kind === "pdfMetadata"
          ? { mediaType: "application/pdf", byteLength: 8_192 + index, pageCount: (index % 50) + 1 }
          : kind === "unknownBinary"
            ? { mediaType: "application/octet-stream", byteLength: 1_024 + index }
            : null;
    yield {
      sourceKey: sourceKeys[index % sourceKeys.length]!,
      relativePath: deterministicRelativePath(index, random, kind),
      kind,
      ...semantics,
      read: () => resourceBody(index, kind, semantics, profile.seed),
      metadata,
    };
  }
}

function deterministicUuidV4(seed: number, operationIndex: number): string {
  const bytes = createHash("sha256").update(`${seed}:operation:${operationIndex}`, "utf8").digest().subarray(0, 16);
  bytes[6] = (bytes[6]! & 0x0f) | 0x40;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export function generateWatchEvents(profile: FixtureProfile): WatchFixtureEvent[] {
  const count = scaled(5_000, profile.scale);
  const random = createPrng(profile.seed);
  const sourceKeys = ["main", "research", "archive", "materials"];
  const events: WatchFixtureEvent[] = [];
  let sequence = 0;
  for (let index = 0; index < count; index += 1) {
    sequence += index === Math.floor(count / 2) ? 2 : 1;
    const relativePath = deterministicRelativePath(index, random);
    const selector = index % 10;
    const base = {
      sequence,
      timestampMs: Math.floor((index * 10_000) / count),
      sourceKey: sourceKeys[index % sourceKeys.length]!,
      relativePath,
    };
    if (selector === 3) {
      events.push({
        ...base,
        kind: "rename",
        previousRelativePath: relativePath.replace(/Resource-|SameName/, "Old-"),
        operationId: deterministicUuidV4(profile.seed, Math.floor(index / 10)),
      });
    } else if (selector === 7) {
      events.push({
        ...base,
        kind: "delete",
        operationId: deterministicUuidV4(profile.seed, Math.floor(index / 10)),
      });
    } else if (selector === 9 && events.length > 0) {
      const duplicate = events[events.length - 1]!;
      events.push({
        ...duplicate,
        sequence,
        duplicateOf: duplicate.sequence,
      });
    } else {
      events.push({
        ...base,
        kind: selector % 2 === 0 ? "modify" : "create",
        operationId:
          selector === 5
            ? deterministicUuidV4(profile.seed, Math.floor(index / 10))
            : undefined,
      });
    }
  }
  return events;
}

export function createTabs(profile: FixtureProfile): TabFixture[] {
  const count = scaled(100, profile.scale);
  const sourceKeys = ["main", "research", "archive", "materials"];
  return Array.from({ length: count }, (_, index) => ({
    tabId: `tab-${index.toString().padStart(3, "0")}`,
    group: (index % 4) as 0 | 1 | 2 | 3,
    sourceKey: sourceKeys[index % sourceKeys.length]!,
    relativePath: `Tabs/Page-${index.toString().padStart(3, "0")}.md`,
    visible: index < 4,
  }));
}

export function createUtf8BoundaryDocument(byteLength: number, seed = FIXTURE_SEED): Buffer {
  if (!Number.isSafeInteger(byteLength) || byteLength < 0) {
    throw new RangeError("Document byte length must be a non-negative safe integer");
  }
  const prefix = Buffer.from(`# Seed ${seed}\r\nUnicode: 資料 Über 🌸\nMixed line\r\n`, "utf8");
  if (byteLength <= prefix.byteLength) {
    return Buffer.from("x".repeat(byteLength), "utf8");
  }
  const output = Buffer.alloc(byteLength, 0x78);
  prefix.copy(output);
  return output;
}

function createDenseWikilinksDocument(profile: FixtureProfile): Buffer {
  const count = scaled(50_000, profile.scale);
  const lines = Array.from(
    { length: count },
    (_, index) => `[[Dense-Target-${index.toString().padStart(5, "0")}.md]]`,
  );
  return Buffer.from(`# Dense links seed:${profile.seed}\n${lines.join("\n")}\n`, "utf8");
}

function* iterateJournalRecords(profile: FixtureProfile): Generator<JournalFixtureRecord> {
  const count = scaled(1_000, profile.scale);
  const states: JournalFixtureRecord["state"][] = ["PREPARED", "COMMITTING", "ROLLING_BACK"];
  const sourceKeys = ["main", "research", "archive", "materials"];
  for (let index = 0; index < count; index += 1) {
    yield {
      operationId: deterministicUuidV4(profile.seed, 10_000 + index),
      state: states[index % states.length]!,
      sourceKey: sourceKeys[index % sourceKeys.length]!,
      relativePath: `Recovery/record-${index.toString().padStart(4, "0")}.md`,
      sequence: index + 1,
    };
  }
}

export function createKnowledgeFixtureDataset(profile: FixtureProfile): KnowledgeFixtureDataset {
  const manifest = buildFixtureManifest(profile);
  const identity = fixtureIdentityHash(profile);
  const resources = (tree: "tree10k" | "tree100k"): Generator<ResourceFixtureEntry> =>
    iterateResourceEntries(profile, tree);
  const watchEvents = (): WatchFixtureEvent[] => generateWatchEvents(profile);
  const tabs = (): TabFixture[] => createTabs(profile);
  const boundaryDocument = (kind: "accepted" | "overLimit"): Buffer =>
    createUtf8BoundaryDocument(
      kind === "accepted" ? manifest.documentBytes.acceptedUtf8 : manifest.documentBytes.rejectedOverLimit,
      profile.seed,
    );
  const scenario = (id: FixtureScenarioId): KnowledgeScenarioFixture => {
    switch (id) {
      case "initialTree10k":
        return {
          id,
          kind: "resource-tree",
          expectedEntries: manifest.treeEntryCounts[0],
          resources: () => resources("tree10k"),
        };
      case "hugeTree100k":
      case "fullRebuild100k":
        return {
          id,
          kind: "huge-resource-tree",
          expectedEntries: manifest.treeEntryCounts[1],
          resources: () => resources("tree100k"),
        };
      case "markdown10MiB":
        return {
          id,
          kind: "markdown-boundary",
          accepted: () => boundaryDocument("accepted"),
          overLimit: () => boundaryDocument("overLimit"),
        };
      case "denseWikilinks50k":
        return {
          id,
          kind: "dense-wikilinks",
          expectedWikilinks: scaled(50_000, profile.scale),
          readDocument: () => createDenseWikilinksDocument(profile),
        };
      case "watcherBurst5k":
        return {
          id,
          kind: "watch-burst",
          expectedEvents: manifest.watchEventCount,
          events: watchEvents,
        };
      case "searchWarmTrigram":
        return {
          id,
          kind: "search",
          query: "資料庫",
          expectedEntries: manifest.treeEntryCounts[1],
          resources: () => resources("tree100k"),
        };
      case "searchWarmShort":
        return {
          id,
          kind: "search",
          query: "資",
          expectedEntries: manifest.treeEntryCounts[1],
          resources: () => resources("tree100k"),
        };
      case "searchColdOpen":
        return {
          id,
          kind: "cold-search",
          query: "fixture",
          expectedEntries: manifest.treeEntryCounts[1],
          resources: () => resources("tree100k"),
        };
      case "multiView100Tabs":
        return { id, kind: "tabs", expectedTabs: manifest.tabCount, tabs };
      case "generationSwitch":
        return {
          id,
          kind: "generation-switch",
          previousGeneration: "generation-0001",
          currentGeneration: "generation-0002",
          concurrentQuery: "fixture",
        };
      case "operationRecovery1k":
        return {
          id,
          kind: "operation-recovery",
          expectedRecords: scaled(1_000, profile.scale),
          records: () => iterateJournalRecords(profile),
        };
    }
  };
  return {
    manifest,
    identity,
    sourceRoots: manifest.sources.map((source) => ({
      sourceKey: source.sourceKey,
      sameNameRelativePath: "Shared/SameName.md",
    })),
    resources,
    watchEvents,
    tabs,
    boundaryDocument,
    scenario,
  };
}

export function fixtureDatasetHash(
  profile: FixtureProfile,
  tree: "tree10k" | "tree100k",
): { resourceCount: number; contentHash: string } {
  const hash = createHash("sha256");
  let resourceCount = 0;
  for (const entry of iterateResourceEntries(profile, tree)) {
    resourceCount += 1;
    hash.update(entry.sourceKey, "utf8");
    hash.update("\0");
    hash.update(entry.relativePath, "utf8");
    hash.update("\0");
    hash.update(entry.kind, "utf8");
    hash.update("\0");
    hash.update(entry.read());
    hash.update("\0");
    hash.update(JSON.stringify(entry.metadata));
    hash.update("\n");
  }
  return { resourceCount, contentHash: hash.digest("hex") };
}

export function fixtureIdentityHash(profile: FixtureProfile): string {
  const manifest = buildFixtureManifest(profile);
  const datasetHash = fixtureDatasetHash(profile, "tree100k");
  const hash = createHash("sha256");
  const updateJson = (value: unknown): void => {
    hash.update(canonicalJson(value), "utf8");
    hash.update("\n");
  };
  updateJson(manifest);
  updateJson(datasetHash);
  updateJson(generateWatchEvents(profile));
  updateJson(createTabs(profile));
  updateJson({
    accepted: createHash("sha256")
      .update(createUtf8BoundaryDocument(manifest.documentBytes.acceptedUtf8, profile.seed))
      .digest("hex"),
    overLimit: createHash("sha256")
      .update(createUtf8BoundaryDocument(manifest.documentBytes.rejectedOverLimit, profile.seed))
      .digest("hex"),
    denseWikilinks: createHash("sha256").update(createDenseWikilinksDocument(profile)).digest("hex"),
  });
  updateJson([...iterateJournalRecords(profile)]);
  updateJson({
    generationSwitch: ["generation-0001", "generation-0002", "fixture"],
    sourceRoots: manifest.sources.map((source) => [source.sourceKey, "Shared/SameName.md"]),
  });
  return hash.digest("hex");
}

export function buildFixtureManifestEnvelope(profile: FixtureProfile): FixtureManifestEnvelope {
  return {
    schemaVersion: 1,
    manifest: buildFixtureManifest(profile),
    fixtureIdentity: fixtureIdentityHash(profile),
  };
}

export function validateFixtureManifest(input: unknown): { ok: true } | { ok: false; errors: string[] } {
  const safe = readSafePlainData(input);
  if ("error" in safe) return { ok: false, errors: [safe.error] };
  if (safe.value === null || typeof safe.value !== "object" || Array.isArray(safe.value)) {
    return { ok: false, errors: ["manifest must be an object"] };
  }
  const value = safe.value as Record<string, unknown>;
  if (
    Object.keys(value).length !== 3 ||
    value.schemaVersion !== 1 ||
    typeof value.fixtureIdentity !== "string" ||
    !/^[a-f0-9]{64}$/.test(value.fixtureIdentity) ||
    value.manifest === null ||
    typeof value.manifest !== "object" ||
    Array.isArray(value.manifest)
  ) {
    return { ok: false, errors: ["manifest envelope does not match the closed schema"] };
  }
  const manifest = value.manifest as Record<string, unknown>;
  const profile = manifest.profile;
  const seed = manifest.seed;
  if ((profile !== "smoke" && profile !== "full") || !Number.isSafeInteger(seed) || Number(seed) < 0) {
    return { ok: false, errors: ["profile or seed is invalid"] };
  }
  const expected = buildFixtureManifestEnvelope(resolveFixtureProfile(profile, Number(seed)));
  if (canonicalJson(safe.value) !== canonicalJson(expected)) {
    return { ok: false, errors: ["manifest does not exactly match the frozen profile"] };
  }
  if (containsDevelopmentPath(safe.value)) {
    return { ok: false, errors: ["manifest contains a development path"] };
  }
  return { ok: true };
}

async function removeFixtureRoot(root: string): Promise<void> {
  // Each entry immediately below a generated fixture root is independent.
  // Removing the source roots together avoids serial recursive deletion of a
  // 10,000-file smoke fixture on NTFS, while still awaiting complete cleanup
  // before the fixture is released to its caller.
  const entries = await fs.promises.readdir(root);
  await Promise.all(entries.map((entry) => fs.promises.rm(path.join(root, entry), {
    recursive: true,
    force: true,
    maxRetries: 3,
    retryDelay: 50,
  })));
  await fs.promises.rmdir(root);
}

type SafePlainDataResult =
  | { readonly ok: true; readonly value: unknown }
  | { readonly ok: false; readonly error: string };

function readSafePlainData(input: unknown): SafePlainDataResult {
  const seen = new Set<object>();
  const visit = (value: unknown, depth: number): unknown => {
    if (depth > 16) throw new Error("input nesting exceeds limit");
    if (value === null || typeof value === "boolean") return value;
    if (typeof value === "string") {
      if (value.length > 4_096) throw new Error("input string exceeds limit");
      return value;
    }
    if (typeof value === "number") {
      if (!Number.isFinite(value)) throw new Error("input number must be finite");
      return value;
    }
    if (typeof value !== "object") throw new Error("input contains an unsupported value");
    if (utilTypes.isProxy(value)) throw new Error("proxy input is not allowed");
    if (seen.has(value)) throw new Error("cyclic input is not allowed");
    seen.add(value);
    try {
      if (Array.isArray(value)) {
        if (value.length > 256) throw new Error("input array exceeds limit");
        const descriptors = Object.getOwnPropertyDescriptors(value);
        const keys = Object.keys(descriptors).filter((key) => key !== "length");
        if (keys.length !== value.length || keys.some((key, index) => key !== String(index))) {
          throw new Error("sparse or decorated arrays are not allowed");
        }
        return keys.map((key) => {
          const descriptor = descriptors[key]!;
          if (!("value" in descriptor) || descriptor.get !== undefined || descriptor.set !== undefined) {
            throw new Error("accessor input is not allowed");
          }
          return visit(descriptor.value, depth + 1);
        });
      }
      const prototype = Object.getPrototypeOf(value);
      if (prototype !== Object.prototype && prototype !== null) throw new Error("non-plain input is not allowed");
      if (Object.getOwnPropertySymbols(value).length > 0) throw new Error("symbol fields are not allowed");
      const descriptors = Object.getOwnPropertyDescriptors(value);
      const keys = Object.keys(descriptors);
      if (keys.length > 64) throw new Error("input object has too many fields");
      const output: Record<string, unknown> = {};
      for (const key of keys) {
        if (key.length > 128) throw new Error("input field name exceeds limit");
        const descriptor = descriptors[key]!;
        if (!descriptor.enumerable || !("value" in descriptor) || descriptor.get !== undefined || descriptor.set !== undefined) {
          throw new Error("accessor or hidden input is not allowed");
        }
        output[key] = visit(descriptor.value, depth + 1);
      }
      return output;
    } finally {
      seen.delete(value);
    }
  };
  try {
    return { ok: true, value: visit(input, 0) };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "invalid input" };
  }
}

function containsDevelopmentPath(value: unknown): boolean {
  if (typeof value === "string") {
    return /(?:[A-Za-z]:\\Users\\|\/Users\/|\/home\/)/.test(value);
  }
  if (Array.isArray(value)) return value.some(containsDevelopmentPath);
  if (value !== null && typeof value === "object") {
    return Object.values(value as Record<string, unknown>).some(containsDevelopmentPath);
  }
  return false;
}

export async function materializeFixture<T>(
  options: {
    readonly parentDirectory?: string;
    readonly profile: FixtureProfile;
  },
  consume: (fixture: MaterializedFixture) => Promise<T> | T,
): Promise<T> {
  const parentDirectory = options.parentDirectory ?? os.tmpdir();
  const root = fs.mkdtempSync(path.join(parentDirectory, "hana-kw-performance-"));
  try {
    const dataset = createKnowledgeFixtureDataset(options.profile);
    const { manifest } = dataset;
    const sourceRoots = manifest.sources.map((source) => {
      const sourceRoot = path.join(root, source.sourceKey === "materials" ? "source-unicode" : `source-${source.sourceKey}`);
      fs.mkdirSync(sourceRoot, { recursive: true });
      return sourceRoot;
    });
    const manifestPath = path.join(root, "fixture-manifest.json");
    const envelope: FixtureManifestEnvelope = {
      schemaVersion: 1,
      manifest,
      fixtureIdentity: dataset.identity,
    };
    fs.writeFileSync(manifestPath, `${JSON.stringify(envelope, null, 2)}\n`, "utf8");
    // A fixture entry owns its leaf path, so directory creation for distinct
    // entries can proceed independently.  Keeping the directory promises
    // here prevents an NTFS worker from serially walking every ancestor while
    // the bounded write window is otherwise idle.
    const materializedDirectories = new Map<string, Promise<void>>(
      sourceRoots.map((sourceRoot) => [sourceRoot, Promise.resolve()]),
    );
    const writeResources: MaterializedFixture["writeResources"] = async ({
      tree,
      limit = Number.POSITIVE_INFINITY,
      signal,
    }) => {
      let written = 0;
      const pendingWrites: Array<Promise<void>> = [];
      const flushWrites = async () => {
        await Promise.all(pendingWrites.splice(0));
      };
      for (const entry of dataset.resources(tree)) {
        if (written >= limit) break;
        if (signal?.aborted) {
          const error = new Error("Fixture materialization aborted");
          error.name = "AbortError";
          throw error;
        }
        const sourceIndex = manifest.sources.findIndex((source) => source.sourceKey === entry.sourceKey);
        const target = path.join(sourceRoots[sourceIndex]!, ...entry.relativePath.split("/"));
        const targetDirectory = path.dirname(target);
        let directoryReady = materializedDirectories.get(targetDirectory);
        if (!directoryReady) {
          directoryReady = fs.promises.mkdir(targetDirectory, { recursive: true }).then(() => undefined);
          materializedDirectories.set(targetDirectory, directoryReady);
        }
        const body = entry.read();
        if (body.byteLength > 0) {
          pendingWrites.push(directoryReady.then(() => fs.promises.writeFile(target, body)));
        } else {
          pendingWrites.push(
            directoryReady.then(() =>
              fs.promises.writeFile(target, `${JSON.stringify(entry.metadata)}\n`, "utf8"),
            ),
          );
        }
        written += 1;
        // A 256-entry batch still leaves NTFS repeatedly draining the libuv
        // queue while the fixture creates its 10,000-entry smoke tree. Keep
        // the write window bounded, but large enough to amortize that drain
        // and retain all real files/paths in the fixed fixture.
        if (pendingWrites.length >= 1_024) await flushWrites();
      }
      await flushWrites();
      return written;
    };
    return await consume({ root, sourceRoots, manifestPath, manifest, dataset, writeResources });
  } finally {
    await removeFixtureRoot(root);
  }
}
