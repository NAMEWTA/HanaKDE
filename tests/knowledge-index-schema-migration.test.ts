import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";
import { afterEach, describe, expect, it } from "vitest";
import {
  KnowledgeIndexStore,
  knowledgeIndexCompactPartitionPath,
} from "../lib/knowledge-workspace/knowledge-index-store.ts";

const WORKSPACE_FINGERPRINT = "d".repeat(64);
const SOURCE_FINGERPRINT = "e".repeat(64);

describe("knowledge index schema generations", () => {
  const cleanup = new Set<string>();

  afterEach(() => {
    for (const root of cleanup) {
      fs.rmSync(root, { recursive: true, force: true });
    }
    cleanup.clear();
  });

  function home(): string {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "hana-index-schema-"));
    cleanup.add(root);
    return root;
  }

  function store(
    hanakoHome: string,
    extractorContractVersion: string,
  ): KnowledgeIndexStore {
    return new KnowledgeIndexStore({
      hanakoHome,
      workspaceFingerprint: WORKSPACE_FINGERPRINT,
      sourceFingerprint: SOURCE_FINGERPRINT,
      extractorContractVersion,
      hostId: "schema-host",
      pid: 1200,
    });
  }

  it("rebuilds extractor/schema changes into a new file without mutating the old generation", () => {
    const hanakoHome = home();
    const original = store(hanakoHome, "extractor-v1");
    original.beginRebuild({
      rebuildId: "v1",
      generationId: "generation-v1",
      startedSequence: 0,
    }).publish({ lastCompleteSequence: 4 });
    const oldPath = path.join(
      partitionPath(hanakoHome),
      "generation-generation-v1.sqlite",
    );
    const oldBytes = fs.readFileSync(oldPath);
    const oldLease = original.acquireQueryLease();

    const upgraded = store(hanakoHome, "extractor-v2");
    expect(upgraded.health()).toEqual({
      state: "stale",
      generationId: "generation-v1",
      reason: "extractor_contract_mismatch",
    });
    expect(oldLease.inspect().extractorContractVersion).toBe("extractor-v1");

    upgraded.beginRebuild({
      rebuildId: "v2",
      generationId: "generation-v2",
      startedSequence: 4,
    }).publish({ lastCompleteSequence: 5 });
    expect(upgraded.health()).toEqual({
      state: "ready",
      generationId: "generation-v2",
      sequence: 5,
    });
    expect(fs.readFileSync(oldPath)).toEqual(oldBytes);
    expect(oldLease.inspect().generationId).toBe("generation-v1");
    oldLease.release();
  });

  it("marks schema mismatch and corruption per source instead of attempting an in-place repair", () => {
    const hanakoHome = home();
    const initial = store(hanakoHome, "extractor-v1");
    initial.beginRebuild({
      rebuildId: "initial",
      generationId: "generation-1",
      startedSequence: 0,
    }).publish({ lastCompleteSequence: 2 });
    const generationPath = path.join(
      partitionPath(hanakoHome),
      "generation-generation-1.sqlite",
    );

    const database = new Database(generationPath);
    database.prepare(
      "UPDATE meta SET value = '999' WHERE key = 'schema_version'",
    ).run();
    database.pragma("wal_checkpoint(TRUNCATE)");
    database.close();
    expect(store(hanakoHome, "extractor-v1").health()).toEqual({
      state: "stale",
      generationId: "generation-1",
      reason: "schema_version_mismatch",
    });

    const schemaDrift = new Database(generationPath);
    schemaDrift.prepare(
      "UPDATE meta SET value = '1' WHERE key = 'schema_version'",
    ).run();
    schemaDrift.exec("DROP TABLE tasks");
    schemaDrift.exec(`
      CREATE TABLE tasks (
        resource_id INTEGER NOT NULL,
        ordinal INTEGER NOT NULL,
        text TEXT NOT NULL,
        PRIMARY KEY (resource_id, ordinal)
      ) STRICT
    `);
    schemaDrift.pragma("wal_checkpoint(TRUNCATE)");
    schemaDrift.close();
    expect(store(hanakoHome, "extractor-v1").health()).toEqual({
      state: "stale",
      generationId: "generation-1",
      reason: "schema_contract_mismatch",
    });

    fs.writeFileSync(generationPath, Buffer.from("not a sqlite database"));
    expect(store(hanakoHome, "extractor-v1").health()).toEqual({
      state: "corrupt",
      generationId: "generation-1",
      reason: "generation_integrity_failed",
    });
  });

  it("rejects a corrupt manifest without leaking its path or SQLite error", () => {
    const hanakoHome = home();
    store(hanakoHome, "extractor-v1");
    fs.mkdirSync(partitionPath(hanakoHome), { recursive: true });
    fs.writeFileSync(
      path.join(partitionPath(hanakoHome), "current.json"),
      `{"schemaVersion":1,"generationId":"../escape","sourceFingerprint":"${SOURCE_FINGERPRINT}"}`,
    );
    const health = store(hanakoHome, "extractor-v1").health();
    expect(health).toEqual({
      state: "corrupt",
      reason: "manifest_invalid",
    });
    expect(JSON.stringify(health)).not.toContain(hanakoHome);
    expect(JSON.stringify(health)).not.toMatch(/SQLITE_/);
  });

  it("rejects an active generation with a corrupt WAL sidecar", () => {
    const hanakoHome = home();
    const initial = store(hanakoHome, "extractor-v1");
    initial.beginRebuild({
      rebuildId: "wal",
      generationId: "generation-wal",
      startedSequence: 0,
    }).publish({ lastCompleteSequence: 1 });
    const generationPath = path.join(
      partitionPath(hanakoHome),
      "generation-generation-wal.sqlite",
    );
    fs.writeFileSync(`${generationPath}-wal`, Buffer.alloc(4_096, 0xff));

    expect(store(hanakoHome, "extractor-v1").health()).toEqual({
      state: "corrupt",
      generationId: "generation-wal",
      reason: "generation_integrity_failed",
    });
  });
});

function partitionPath(hanakoHome: string): string {
  return knowledgeIndexCompactPartitionPath(
    hanakoHome,
    WORKSPACE_FINGERPRINT,
    SOURCE_FINGERPRINT,
  );
}
