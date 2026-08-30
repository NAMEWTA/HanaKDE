import assert from "node:assert/strict";
import test from "node:test";

import { appendResourcePath, normalizeRelativePath } from "../../src/infrastructure/workspace/resource-path.ts";

test("builds workspace ResourceRefs without materializing or persisting host paths", () => {
  assert.deepEqual(
    appendResourcePath({ kind: "mount", mountId: "workspace", path: "" }, "Dossiers/dossiers/dos_123/dossier.json"),
    { kind: "mount", mountId: "workspace", path: "Dossiers/dossiers/dos_123/dossier.json" },
  );
  assert.equal(normalizeRelativePath("Dossiers\\contacts\\contacts.json"), "Dossiers/contacts/contacts.json");
});

test("rejects traversal, absolute, ambiguous, and control-character resource paths", () => {
  for (const unsafe of [
    "../outside.json",
    "Dossiers/../outside.json",
    "C:/secret.txt",
    "\\\\server\\share\\secret.txt",
    "/root/secret.txt",
    "Dossiers//manifest.json",
    "Dossiers/contacts\u0001.json",
  ]) {
    assert.throws(() => normalizeRelativePath(unsafe), /relative path|unsafe segment/);
  }
});
