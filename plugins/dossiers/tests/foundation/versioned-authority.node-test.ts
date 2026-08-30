import assert from "node:assert/strict";
import test from "node:test";

import {
  createVersionedAuthority,
  parseVersionedAuthority,
} from "../../src/domain/versioned-authority.ts";

test("creates and parses a versioned authority envelope with retained extensions", () => {
  const dossier = createVersionedAuthority({
    kind: "dossier",
    id: "dos_01hzportableentity",
    now: "2026-08-30T00:00:00.000Z",
    data: { name: "广州数据交易所" },
  });
  dossier.extensions.importSource = "workspace";

  const parsed = parseVersionedAuthority(JSON.stringify(dossier), "dossier");

  assert.equal(parsed.ok, true);
  if (parsed.ok) {
    assert.equal(parsed.value.schemaVersion, 1);
    assert.equal(parsed.value.revision, 1);
    assert.equal(parsed.value.id, "dos_01hzportableentity");
    assert.deepEqual(parsed.value.extensions, { importSource: "workspace" });
    assert.deepEqual(parsed.value.data, { name: "广州数据交易所" });
  }
});

test("rejects an authority whose stable id belongs to another kind", () => {
  assert.throws(() => createVersionedAuthority({
    kind: "contact",
    id: "doc_01hzwrongeentitykind",
    now: "2026-08-30T00:00:00.000Z",
    data: {},
  }), /stable con_ identifier/);
});
