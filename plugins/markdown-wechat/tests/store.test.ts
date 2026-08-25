import fs from "node:fs";
import { afterEach, describe, expect, it } from "vitest";
import { PrivateDocumentStore, PrivateStoreError } from "../src/store.ts";
import { removeDirectory, temporaryDirectory } from "./helpers.ts";

const directories: string[] = [];
afterEach(() => { for (const dir of directories.splice(0)) removeDirectory(dir); });

describe("private document store", () => {
  it("persists a versioned document and detects stale saves", () => {
    const dir = temporaryDirectory(); directories.push(dir);
    const store = new PrivateDocumentStore(dir, () => new Date("2026-08-25T00:00:00Z"));
    const saved = store.save({ markdown: "# Saved\n\nBody", expectedRevision: 0, settings: { theme: "jade", font: "serif", fontSize: 19 } });
    expect(saved).toMatchObject({ schemaVersion: 1, revision: 1, title: "Saved", dirty: true });
    expect(new PrivateDocumentStore(dir).load().state).toMatchObject({ revision: 1, markdown: "# Saved\n\nBody" });
    expect(() => store.save({ markdown: "stale", expectedRevision: 0 })).toThrowError(PrivateStoreError);
  });

  it("reports corrupt and unsupported files without overwriting them", () => {
    const corruptDir = temporaryDirectory(); directories.push(corruptDir);
    fs.writeFileSync(`${corruptDir}/active-document.v1.json`, "{broken");
    const corruptStore = new PrivateDocumentStore(corruptDir);
    const corrupt = corruptStore.load();
    expect(corrupt.recovery?.code).toBe("corrupt");
    expect(fs.readFileSync(`${corruptDir}/active-document.v1.json`, "utf8")).toBe("{broken");
    expect(() => corruptStore.save({ markdown: "automatic overwrite", expectedRevision: 0 })).toThrowError(/locked/);
    expect(fs.readFileSync(`${corruptDir}/active-document.v1.json`, "utf8")).toBe("{broken");
    const reset = corruptStore.resetAfterRecovery();
    expect(reset.backupName).toMatch(/\.bak$/);
    expect(fs.readFileSync(`${corruptDir}/${reset.backupName}`, "utf8")).toBe("{broken");
    expect(corruptStore.load().recovery).toBeNull();

    const futureDir = temporaryDirectory(); directories.push(futureDir);
    fs.writeFileSync(`${futureDir}/active-document.v1.json`, JSON.stringify({ schemaVersion: 99 }));
    expect(new PrivateDocumentStore(futureDir).load().recovery?.code).toBe("unsupported");
  });
});
