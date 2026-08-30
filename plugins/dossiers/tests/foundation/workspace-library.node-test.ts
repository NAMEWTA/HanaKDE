import assert from "node:assert/strict";
import test from "node:test";

import { openWorkspaceLibrary } from "../../src/infrastructure/workspace/workspace-library.ts";
import { MemoryResources } from "./memory-resources.ts";

test("initializes a missing Dossiers root as a portable ready library", async () => {
  const resources = new MemoryResources();
  const workspaceRoot = { kind: "mount" as const, mountId: "workspace", path: "" };

  const result = await openWorkspaceLibrary({
    resources,
    workspaceRoot,
    now: () => "2026-08-30T00:00:00.000Z",
    createId: () => "lib_01hzdossiersfoundation",
  });

  assert.equal(result.state, "ready");
  assert.equal(result.rootPath, "Dossiers");
  assert.equal(result.manifest?.kind, "hana.dossiers.library");
  assert.equal(result.manifest?.schemaVersion, 1);
  assert.equal(result.manifest?.libraryId, "lib_01hzdossiersfoundation");
  assert.deepEqual(result.paths, {
    manifest: "Dossiers/manifest.json",
    types: "Dossiers/types",
    contacts: "Dossiers/contacts",
    dossiers: "Dossiers/dossiers",
    operations: "Dossiers/.system/operations",
    staging: "Dossiers/.system/staging",
    trash: "Dossiers/.trash",
    audit: "Dossiers/audit",
  });

  const serialized = resources.text({ kind: "mount", mountId: "workspace", path: "Dossiers/manifest.json" });
  assert.ok(serialized);
  assert.doesNotMatch(serialized, /[A-Za-z]:[\\/]|file:\/\//);
  assert.equal(JSON.parse(serialized).libraryId, "lib_01hzdossiersfoundation");
});

test("blocks an incompatible non-empty Dossiers directory without mutating it", async () => {
  const resources = new MemoryResources();
  const workspaceRoot = { kind: "mount" as const, mountId: "workspace", path: "" };
  resources.seedDirectory({ ...workspaceRoot, path: "Dossiers" });
  resources.seedFile({ ...workspaceRoot, path: "Dossiers/existing-notes.txt" }, "user content");

  const result = await openWorkspaceLibrary({ resources, workspaceRoot });

  assert.equal(result.state, "blocked");
  assert.equal(result.reason, "incompatible-root");
  assert.deepEqual(resources.mutations, []);
  assert.equal(resources.text({ ...workspaceRoot, path: "Dossiers/existing-notes.txt" }), "user content");
});

test("fails closed with a stable reason when ResourceIO inspection is denied", async () => {
  const resources = new MemoryResources();
  const workspaceRoot = { kind: "mount" as const, mountId: "workspace", path: "" };
  resources.failNext("stat", "C:/secret/workspace access denied for credential abc123");

  const result = await openWorkspaceLibrary({ resources, workspaceRoot });

  assert.equal(result.state, "blocked");
  assert.equal(result.reason, "resource-access-denied");
  assert.deepEqual(resources.mutations, []);
  assert.doesNotMatch(JSON.stringify(result), /C:\/|secret|abc123/);
});

test("recovers an interrupted initialization without publishing a partial manifest", async () => {
  const resources = new MemoryResources();
  const workspaceRoot = { kind: "mount" as const, mountId: "workspace", path: "" };
  resources.failOn("write", 2, "disk full at C:/secret/workspace");

  const interrupted = await openWorkspaceLibrary({
    resources,
    workspaceRoot,
    now: () => "2026-08-30T00:00:00.000Z",
    createId: () => "lib_01hzrecoverableinit",
  });

  assert.equal(interrupted.state, "blocked");
  assert.equal(interrupted.reason, "initialization-failed");
  assert.equal(resources.text({ ...workspaceRoot, path: "Dossiers/manifest.json" }), null);
  assert.ok(resources.text({ ...workspaceRoot, path: "Dossiers/.dossiers-initializing.json" }));

  const recovered = await openWorkspaceLibrary({
    resources,
    workspaceRoot,
    now: () => "2026-08-31T00:00:00.000Z",
    createId: () => "lib_mustnotreplaceoriginal",
  });

  assert.equal(recovered.state, "ready");
  assert.equal(recovered.manifest?.libraryId, "lib_01hzrecoverableinit");
  assert.equal(resources.text({ ...workspaceRoot, path: "Dossiers/.dossiers-initializing.json" }), null);
});

test("blocks a manifest-shaped library whose required directories are incomplete", async () => {
  const resources = new MemoryResources();
  const workspaceRoot = { kind: "mount" as const, mountId: "workspace", path: "" };
  resources.seedDirectory({ ...workspaceRoot, path: "Dossiers" });
  resources.seedFile({ ...workspaceRoot, path: "Dossiers/manifest.json" }, JSON.stringify({
    kind: "hana.dossiers.library",
    schemaVersion: 1,
    libraryId: "lib_01hzincompletelibrary",
    revision: 1,
    createdAt: "2026-08-30T00:00:00.000Z",
    updatedAt: "2026-08-30T00:00:00.000Z",
    extensions: { retained: true },
  }));

  const result = await openWorkspaceLibrary({ resources, workspaceRoot });

  assert.equal(result.state, "blocked");
  assert.equal(result.reason, "incomplete-library");
  assert.deepEqual(resources.mutations, []);
});

test("does not trust a spoofed initialization marker in an ordinary directory", async () => {
  const resources = new MemoryResources();
  const workspaceRoot = { kind: "mount" as const, mountId: "workspace", path: "" };
  resources.seedDirectory({ ...workspaceRoot, path: "Dossiers" });
  resources.seedFile({ ...workspaceRoot, path: "Dossiers/.dossiers-initializing.json" }, JSON.stringify({
    kind: "hana.dossiers.initialization",
    schemaVersion: 1,
    libraryId: "not-a-library-id",
    createdAt: "not-a-time",
  }));
  resources.seedFile({ ...workspaceRoot, path: "Dossiers/private-notes.txt" }, "must remain untouched");

  const result = await openWorkspaceLibrary({ resources, workspaceRoot });

  assert.equal(result.state, "blocked");
  assert.equal(result.reason, "incompatible-root");
  assert.deepEqual(resources.mutations, []);
  assert.equal(resources.text({ ...workspaceRoot, path: "Dossiers/private-notes.txt" }), "must remain untouched");
});

test("reports old schemas for migration and blocks unknown future schemas without writes", async () => {
  const resources = new MemoryResources();
  const workspaceRoot = { kind: "mount" as const, mountId: "workspace", path: "" };
  const initialized = await openWorkspaceLibrary({
    resources,
    workspaceRoot,
    now: () => "2026-08-30T00:00:00.000Z",
    createId: () => "lib_01hzschemacompatible",
  });
  assert.equal(initialized.state, "ready");
  const manifestRef = { ...workspaceRoot, path: "Dossiers/manifest.json" };
  const base = JSON.parse(resources.text(manifestRef) ?? "null");

  resources.seedFile(manifestRef, JSON.stringify({ ...base, schemaVersion: 0 }));
  resources.mutations.length = 0;
  const oldSchema = await openWorkspaceLibrary({ resources, workspaceRoot });
  assert.equal(oldSchema.state, "migration-required");
  assert.equal(oldSchema.reason, "older-schema");
  assert.deepEqual(resources.mutations, []);

  resources.seedFile(manifestRef, JSON.stringify({ ...base, schemaVersion: 2, futureField: true }));
  const futureSchema = await openWorkspaceLibrary({ resources, workspaceRoot });
  assert.equal(futureSchema.state, "blocked");
  assert.equal(futureSchema.reason, "unsupported-schema");
  assert.equal(futureSchema.manifest?.futureField, true);
  assert.deepEqual(resources.mutations, []);
});

test("does not downgrade a published manifest when initialization marker cleanup fails", async () => {
  const resources = new MemoryResources();
  const workspaceRoot = { kind: "mount" as const, mountId: "workspace", path: "" };
  resources.failNext("delete", "marker cleanup interrupted");

  const result = await openWorkspaceLibrary({
    resources,
    workspaceRoot,
    now: () => "2026-08-30T00:00:00.000Z",
    createId: () => "lib_01hzmarkercleanup",
  });

  assert.equal(result.state, "ready");
  assert.equal(result.manifest?.libraryId, "lib_01hzmarkercleanup");
  assert.ok(resources.text({ ...workspaceRoot, path: "Dossiers/.dossiers-initializing.json" }));
  const reopened = await openWorkspaceLibrary({ resources, workspaceRoot });
  assert.equal(reopened.state, "ready");
  assert.equal(reopened.manifest?.libraryId, "lib_01hzmarkercleanup");
});
