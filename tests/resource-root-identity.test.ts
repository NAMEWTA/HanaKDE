import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, describe, expect, it } from "vitest";
import { LocalFsProvider } from "../lib/resource-io/providers/local-fs-provider.ts";
import { ProviderRootIdentityBroker } from "../lib/resource-io/root-identity.ts";

describe("ResourceIO root identity authority", () => {
  let root: string | null = null;

  afterEach(() => {
    if (root) fs.rmSync(root, { recursive: true, force: true });
    root = null;
  });

  function makeProvider() {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "hana-resource-root-"));
    const main = path.join(root, "main");
    fs.mkdirSync(main);
    return { main, local: new LocalFsProvider({ cwd: main }) };
  }

  it("does not accept a copied local identity as physical root proof", async () => {
    const { main, local } = makeProvider();
    const actual = await local.getRootIdentity({
      kind: "local-file",
      path: main,
    });
    const copied = Object.freeze({ ...actual });

    await expect(new ProviderRootIdentityBroker().compareRoots(actual, copied))
      .resolves.toBe("unknown");
  });

  it("treats a root replaced at the same pathname as disjoint", async () => {
    const { main, local } = makeProvider();
    const previous = await local.getRootIdentity({
      kind: "local-file",
      path: main,
    });
    const holding = path.join(path.dirname(main), "main-previous");
    fs.renameSync(main, holding);
    fs.mkdirSync(main);
    const replacement = await local.getRootIdentity({
      kind: "local-file",
      path: main,
    });

    expect(await new ProviderRootIdentityBroker().compareRoots(
      previous,
      replacement,
    )).toBe("disjoint");
  });

  it("fails closed when a local root permission-mode change invalidates its scope token", async () => {
    const { main, local } = makeProvider();
    const previous = await local.getRootIdentity({
      kind: "local-file",
      path: main,
    });
    const originalMode = fs.statSync(main).mode & 0o777;
    fs.chmodSync(main, originalMode === 0o700 ? 0o755 : 0o700);
    const changed = await local.getRootIdentity({
      kind: "local-file",
      path: main,
    });

    expect(changed.opaqueRootId).toBe(previous.opaqueRootId);
    expect(changed.scopeToken).not.toBe(previous.scopeToken);
    expect(await new ProviderRootIdentityBroker().compareRoots(
      previous,
      changed,
    )).toBe("unknown");
  });
});
