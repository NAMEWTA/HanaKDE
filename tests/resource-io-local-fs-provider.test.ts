import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LocalFsProvider } from "../lib/resource-io/providers/local-fs-provider.ts";
import { ResourceAccessPolicy } from "../lib/resource-io/resource-access-policy.ts";
import {
  RESOURCE_LIST_BLOCKED_ENTRIES,
  RESOURCE_SCOPE_ROOT,
  type ResourceRef,
} from "../lib/resource-io/types.ts";

const CAPABILITY_KEYS = [
  "stat",
  "read",
  "openRead",
  "write",
  "writeExpectedVersion",
  "edit",
  "list",
  "search",
  "watch",
  "materialize",
  "copy",
  "rename",
  "move",
  "trash",
  "delete",
  "mkdir",
  "exportTree",
  "importTree",
].sort();

describe("LocalFsProvider", () => {
  let tempRoot: string | null = null;

  afterEach(() => {
    if (tempRoot) fs.rmSync(tempRoot, { recursive: true, force: true });
    tempRoot = null;
  });

  function makeProvider(check = vi.fn(() => ({ allowed: true }))) {
    tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "hana-resource-local-fs-"));
    const cwd = path.join(tempRoot, "workspace");
    const trashRoot = path.join(tempRoot, "trash");
    fs.mkdirSync(cwd, { recursive: true });
    const realCwd = fs.realpathSync(cwd);
    return {
      cwd,
      realCwd,
      trashRoot,
      check,
      provider: new LocalFsProvider({ cwd, guard: { check }, trashRoot }),
    };
  }

  it("creates an absent expected-version target once and never overwrites a conflict", async () => {
    const { cwd, provider } = makeProvider();
    const ref = { kind: "local-file" as const, path: path.join(cwd, "Recovered.md") };

    const created = await provider.writeExpectedVersion(ref, "# recovered\n", null);
    expect(created).toMatchObject({ changeType: "created" });
    expect(fs.readFileSync(ref.path, "utf8")).toBe("# recovered\n");

    const conflict = await provider.writeExpectedVersion(ref, "# overwrite\n", null);
    expect(conflict).toMatchObject({ ok: false, conflict: true });
    expect(fs.readFileSync(ref.path, "utf8")).toBe("# recovered\n");
  });

  it("declares the complete provider capability matrix", () => {
    const { provider } = makeProvider();

    expect(Object.keys(provider.capabilities()).sort()).toEqual(CAPABILITY_KEYS);
  });

  it("writes and stats a local file through PathGuard", async () => {
    const { cwd, realCwd, check, provider } = makeProvider();
    const result = await provider.write({ kind: "local-file", path: "notes/a.md" }, "hello");

    const target = path.join(cwd, "notes", "a.md");
    const realTarget = path.join(realCwd, "notes", "a.md");
    expect(fs.readFileSync(target, "utf-8")).toBe("hello");
    expect(check).toHaveBeenCalledWith(realTarget, "write");
    expect(result).toMatchObject({
      changeType: "created",
      resourceKey: `local_fs:${realTarget.replace(/\\/g, "/")}`,
      resource: { kind: "local-file", path: realTarget, filePath: realTarget, provider: "local_fs" },
      version: { size: 5 },
    });

    await provider.write({ kind: "local-file", path: "notes/a.md" }, "hello again");
    const stat = await provider.stat({ kind: "local-file", path: "notes/a.md" });
    expect(stat).toMatchObject({ exists: true, isDirectory: false, version: { size: 11 } });
  });

  it("denies writes outside the guard", async () => {
    const { provider } = makeProvider(vi.fn(() => ({ allowed: false, reason: "denied by test" })));

    await expect(provider.write({ kind: "local-file", path: "blocked.md" }, "x"))
      .rejects.toMatchObject({
        code: "resource_access_denied",
        status: 403,
        operation: "write",
        message: "denied by test",
      });
  });

  it("propagates typed authority denials without losing safe messages", async () => {
    const { provider } = makeProvider(vi.fn(() => ({
      allowed: false,
      code: "path_outside_authorized_roots",
      reason: "outside /secret/path",
      safeMessage: "Resource is outside authorized roots",
    })));

    await expect(provider.write({ kind: "local-file", path: "blocked.md" }, "x"))
      .rejects.toMatchObject({
        code: "resource_access_denied",
        reason: "path_outside_authorized_roots",
        safeMessage: "Resource is outside authorized roots",
      });
  });

  it("allows missing-path writes under authorized parents and rejects outside writes", async () => {
    const { cwd, provider } = makeProviderWithPolicy();

    await expect(provider.write({ kind: "local-file", path: "new/deep/note.md" }, "ok"))
      .resolves.toMatchObject({ changeType: "created" });
    expect(fs.readFileSync(path.join(cwd, "new", "deep", "note.md"), "utf-8")).toBe("ok");

    await expect(provider.write({ kind: "local-file", path: path.join(path.dirname(cwd), "outside.md") }, "no"))
      .rejects.toMatchObject({
        code: "resource_access_denied",
        reason: "path_outside_authorized_roots",
      });
  });

  it("rejects symlink writes that escape the authorized workspace", async () => {
    const { cwd, provider } = makeProviderWithPolicy();
    const outside = path.join(path.dirname(cwd), "outside");
    fs.mkdirSync(outside, { recursive: true });
    fs.writeFileSync(path.join(outside, "secret.md"), "secret");
    fs.symlinkSync(outside, path.join(cwd, "linked"), "dir");

    await expect(provider.write({ kind: "local-file", path: "linked/secret.md" }, "overwrite"))
      .rejects.toMatchObject({
        code: "resource_access_denied",
        reason: "path_outside_authorized_roots",
      });
    expect(fs.readFileSync(path.join(outside, "secret.md"), "utf-8")).toBe("secret");
  });

  it("never returns bytes when an authorized parent is replaced before read", async () => {
    let guardChecks = 0;
    const { cwd, provider } = makeProvider(vi.fn(() => {
      guardChecks += 1;
      if (guardChecks === 1) {
        fs.renameSync(path.join(cwd, "race-current"), path.join(cwd, "race-holding"));
        fs.renameSync(path.join(cwd, "race-link"), path.join(cwd, "race-current"));
      }
      return { allowed: true };
    }));
    const outside = path.join(path.dirname(cwd), "outside");
    fs.mkdirSync(path.join(cwd, "race-current"));
    fs.mkdirSync(outside);
    fs.writeFileSync(path.join(cwd, "race-current", "Raced.md"), "inside-race-token\n");
    fs.writeFileSync(path.join(outside, "Raced.md"), "outside-race-secret-token\n");
    fs.symlinkSync(
      outside,
      path.join(cwd, "race-link"),
      process.platform === "win32" ? "junction" : "dir",
    );

    let returned = "";
    try {
      const result = await provider.read({
        kind: "local-file",
        path: path.join(cwd, "race-current", "Raced.md"),
      });
      returned = result.content.toString("utf8");
    } catch {
      // A fail-closed rejection is an acceptable outcome for the raced read.
    }

    expect(returned.includes("outside-race-secret-token")).toBe(false);
  });

  it("never falls back when a trusted scope root resolves outside", async () => {
    const { cwd, provider } = makeProvider();
    const outside = path.join(path.dirname(cwd), "outside-scope");
    fs.mkdirSync(outside);
    fs.writeFileSync(path.join(outside, "Secret.md"), "outside-scope-secret\n");
    fs.symlinkSync(
      outside,
      path.join(cwd, "linked-scope"),
      process.platform === "win32" ? "junction" : "dir",
    );
    const scopedRef = (relativePath: string): ResourceRef => {
      const ref = {
        kind: "local-file",
        path: path.join(cwd, "linked-scope", relativePath),
      } as ResourceRef;
      Object.defineProperty(ref, RESOURCE_SCOPE_ROOT, {
        value: fs.realpathSync(cwd),
        enumerable: false,
      });
      return ref;
    };
    const fileRef = scopedRef("Secret.md");
    const directoryRef = scopedRef("");

    for (const operation of [
      () => provider.stat(fileRef),
      () => provider.read(fileRef),
      () => provider.list(directoryRef),
      () => provider.search(directoryRef, { query: "secret" }),
      () => provider.materialize(fileRef),
      () => provider.write(fileRef, "overwrite"),
      () => provider.delete(fileRef),
      () => provider.trash(fileRef),
    ]) {
      await expect(operation()).rejects.toMatchObject({
        code: "resource_access_denied",
        status: 403,
        safeMessage: "Resource is outside authorized roots",
      });
    }
    expect(fs.readFileSync(path.join(outside, "Secret.md"), "utf8"))
      .toBe("outside-scope-secret\n");
  });

  it("reads, lists, searches, copies, deletes, and materializes local files", async () => {
    const { cwd, realCwd, provider } = makeProvider();
    await provider.write({ kind: "local-file", path: "a.md" }, "alpha");
    await provider.mkdir({ kind: "local-file", path: "nested" });
    await provider.write({ kind: "local-file", path: "nested/b.md" }, "beta alpha");

    const read = await provider.read({ kind: "local-file", path: "a.md" });
    expect(read.content.toString("utf-8")).toBe("alpha");

    const list = await provider.list({ kind: "local-file", path: "." });
    expect(list.items.map((item) => item.name)).toEqual(expect.arrayContaining(["a.md", "nested"]));

    const search = await provider.search({ kind: "local-file", path: "." }, { query: "alpha" });
    expect(search.matches.map((match) => path.relative(realCwd, match.filePath).replace(/\\/g, "/"))).toEqual([
      "a.md",
      "nested/b.md",
    ]);

    const copy = await provider.copy(
      { kind: "local-file", path: "a.md" },
      { kind: "local-file", path: "copy.md" },
    );
    expect(copy.changeType).toBe("created");
    expect(fs.readFileSync(path.join(cwd, "copy.md"), "utf-8")).toBe("alpha");

    const materialized = await provider.materialize({ kind: "local-file", path: "copy.md" });
    expect(materialized.filePath).toBe(path.join(realCwd, "copy.md"));

    const deleted = await provider.delete({ kind: "local-file", path: "copy.md" });
    expect(deleted.resourceKey).toBe(`local_fs:${path.join(realCwd, "copy.md").replace(/\\/g, "/")}`);
    expect(fs.existsSync(path.join(cwd, "copy.md"))).toBe(false);
  });

  it("keeps list and search inside the source when a directory contains a real link", async () => {
    const { cwd, provider } = makeProvider();
    const outside = path.join(path.dirname(cwd), "outside-list-search");
    fs.mkdirSync(outside);
    fs.writeFileSync(path.join(cwd, "Visible.md"), "inside-search-token\n");
    fs.writeFileSync(path.join(outside, "outside-secret.md"), "outside-list-search-secret\n");
    fs.symlinkSync(
      outside,
      path.join(cwd, "escape"),
      process.platform === "win32" ? "junction" : "dir",
    );

    const list = await provider.list({ kind: "local-file", path: "." });
    expect(list.items.map((item) => item.name)).toContain("Visible.md");
    expect(list.items.map((item) => item.name)).not.toContain("escape");
    expect(list[RESOURCE_LIST_BLOCKED_ENTRIES]).toEqual(["escape"]);
    expect(JSON.stringify(list)).not.toContain("escape");

    const textSearch = await provider.search(
      { kind: "local-file", path: "." },
      { query: "outside-list-search-secret" },
    );
    const nameSearch = await provider.search(
      { kind: "local-file", path: "." },
      { query: "escape", mode: "name" },
    );
    expect(textSearch.matches).toEqual([]);
    expect(nameSearch.matches).toEqual([]);
  });

  it("refuses to materialize a target replaced after authorization", async () => {
    let target = "";
    let swapped = false;
    const { cwd, provider } = makeProvider(vi.fn(() => {
      if (!swapped && target) {
        const outside = path.join(path.dirname(cwd), "outside-materialize");
        fs.mkdirSync(outside);
        fs.writeFileSync(path.join(outside, "secret.md"), "outside-materialize-secret\n");
        fs.renameSync(target, `${target}.holding`);
        fs.symlinkSync(
          path.join(outside, "secret.md"),
          target,
          process.platform === "win32" ? "file" : "file",
        );
        swapped = true;
      }
      return { allowed: true };
    }));
    target = path.join(cwd, "materialize.md");
    fs.writeFileSync(target, "inside-materialize-token\n");

    await expect(provider.materialize({ kind: "local-file", path: "materialize.md" }))
      .rejects.toMatchObject({
        code: "symbolic_link_not_allowed",
        status: 400,
      });
  });

  it("opens a bounded provider-owned read stream without buffering the whole file", async () => {
    const { cwd, provider } = makeProvider();
    fs.writeFileSync(path.join(cwd, "stream.txt"), "abcdef", "utf-8");

    const opened = await provider.openRead(
      { kind: "local-file", path: "stream.txt" },
      { start: 1, end: 3 },
    );
    const chunks = [];
    for await (const chunk of opened.body) chunks.push(Buffer.from(chunk));

    expect(Buffer.concat(chunks).toString("utf-8")).toBe("bcd");
    expect(opened).toMatchObject({
      size: 6,
      version: { size: 6 },
    });
  });

  it("keeps every openRead chunk immutable while streaming files larger than one chunk", async () => {
    const { cwd, provider } = makeProvider();
    const content = Buffer.concat([
      Buffer.alloc(1024 * 1024, 0x11),
      Buffer.from("tail"),
    ]);
    fs.writeFileSync(path.join(cwd, "large.bin"), content);

    const opened = await provider.openRead({ kind: "local-file", path: "large.bin" });
    const chunks: Uint8Array[] = [];
    for await (const chunk of opened.body) chunks.push(chunk);

    // One complete maximum-sized chunk followed by a tail keeps the exact
    // boundary coverage while exercising distinct buffers without making the
    // release suite needlessly compete with other large-file fixtures.
    expect(chunks).toHaveLength(2);
    expect(Buffer.concat(chunks)).toEqual(content);
  });

  it("maps relative file watch names back to the watched file", async () => {
    const { cwd, realCwd, provider } = makeProvider();
    const filePath = path.join(cwd, "notes", "a.md");
    const realFilePath = path.join(realCwd, "notes", "a.md");
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, "alpha");

    const target = provider.watchTarget({ kind: "local-file", path: "notes/a.md" });
    const snapshot = target.toResource("a.md");

    expect(snapshot).toMatchObject({
      resourceKey: `local_fs:${realFilePath.replace(/\\/g, "/")}`,
      resource: {
        kind: "local-file",
        provider: "local_fs",
        path: realFilePath,
        filePath: realFilePath,
      },
      filePath: realFilePath,
    });
  });

  it("supports expected-version writes, rename, move, and trash as ResourceIO authority operations", async () => {
    const { cwd, realCwd, trashRoot, provider } = makeProvider();
    const source = path.join(cwd, "draft.md");
    fs.writeFileSync(source, "old", "utf-8");
    const before = fs.statSync(source);

    const stale = await provider.writeExpectedVersion(
      { kind: "local-file", path: "draft.md" },
      "stale overwrite",
      { mtimeMs: before.mtimeMs - 1, size: before.size },
    );
    expect(stale).toMatchObject({
      ok: false,
      conflict: true,
      version: { size: before.size },
    });
    expect(fs.readFileSync(source, "utf-8")).toBe("old");

    const saved = await provider.writeExpectedVersion(
      { kind: "local-file", path: "draft.md" },
      "new",
      { mtimeMs: before.mtime.getTime(), size: before.size },
    );
    expect(saved).toMatchObject({ changeType: "modified", version: { size: 3 } });

    const rename = await provider.rename(
      { kind: "local-file", path: "draft.md" },
      { kind: "local-file", path: "renamed.md" },
    );
    expect(rename).toMatchObject({
      oldResource: { filePath: path.join(realCwd, "draft.md") },
      newResource: { filePath: path.join(realCwd, "renamed.md") },
    });
    expect(fs.existsSync(path.join(cwd, "draft.md"))).toBe(false);

    const move = await provider.move(
      { kind: "local-file", path: "renamed.md" },
      { kind: "local-file", path: "archive/renamed.md" },
    );
    expect(move.newResource).toMatchObject({ filePath: path.join(realCwd, "archive", "renamed.md") });
    expect(fs.readFileSync(path.join(cwd, "archive", "renamed.md"), "utf-8")).toBe("new");

    const trashed = await provider.trash(
      { kind: "local-file", path: "archive/renamed.md" },
      { namespace: "mobile-workbench", metadata: { originalName: "renamed.md", rootId: "default" } },
    );
    expect(trashed.trashId).toMatch(/^trash_/);
    expect(trashed.payloadPath).toBe(path.join(trashRoot, "mobile-workbench", trashed.trashId, "payload"));
    expect(fs.readFileSync(trashed.payloadPath!, "utf-8")).toBe("new");
    expect(JSON.parse(fs.readFileSync(path.join(trashRoot, "mobile-workbench", trashed.trashId, "metadata.json"), "utf-8")))
      .toMatchObject({ originalName: "renamed.md", rootId: "default" });
    expect(fs.existsSync(path.join(cwd, "archive", "renamed.md"))).toBe(false);
  });

  it("rechecks source and target versions inside the provider rename boundary", async () => {
    const { cwd, provider } = makeProvider();
    fs.writeFileSync(path.join(cwd, "source.md"), "before", "utf8");
    const planned = await provider.stat({
      kind: "local-file",
      path: "source.md",
    });
    fs.writeFileSync(path.join(cwd, "source.md"), "changed after plan", "utf8");

    await expect(provider.rename(
      { kind: "local-file", path: "source.md" },
      { kind: "local-file", path: "target.md" },
      {
        expectedSourceVersion: planned.version,
        expectedTargetVersion: null,
      },
    )).rejects.toMatchObject({
      code: "knowledge_version_conflict",
    });
    expect(fs.readFileSync(path.join(cwd, "source.md"), "utf8"))
      .toBe("changed after plan");
    expect(fs.existsSync(path.join(cwd, "target.md"))).toBe(false);

    fs.writeFileSync(path.join(cwd, "occupied.md"), "occupied", "utf8");
    const current = await provider.stat({
      kind: "local-file",
      path: "source.md",
    });
    await expect(provider.rename(
      { kind: "local-file", path: "source.md" },
      { kind: "local-file", path: "occupied.md" },
      {
        expectedSourceVersion: current.version,
        expectedTargetVersion: null,
      },
    )).rejects.toMatchObject({
      code: "knowledge_resource_conflict",
    });
  });
});

function makeProviderWithPolicy() {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "hana-resource-local-fs-policy-"));
  const cwd = path.join(tempRoot, "workspace");
  const agentDir = path.join(tempRoot, "hana-home", "agents", "hana");
  const hanakoHome = path.join(tempRoot, "hana-home");
  const trashRoot = path.join(tempRoot, "trash");
  fs.mkdirSync(cwd, { recursive: true });
  fs.mkdirSync(agentDir, { recursive: true });
  const guard = new ResourceAccessPolicy({
    cwd,
    agentDir,
    workspace: cwd,
    workspaceFolders: [cwd],
    hanakoHome,
    getSandboxEnabled: () => true,
  });
  return {
    cwd,
    provider: new LocalFsProvider({ cwd, guard, trashRoot }),
  };
}
