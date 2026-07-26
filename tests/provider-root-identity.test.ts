import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, describe, expect, it } from "vitest";
import { upsertStudioMount } from "../core/studio-mounts.ts";
import { LocalFsProvider } from "../lib/resource-io/providers/local-fs-provider.ts";
import { MountProvider } from "../lib/resource-io/providers/mount-provider.ts";
import {
  ProviderRootIdentityBroker,
} from "../lib/resource-io/root-identity.ts";

describe("provider root identity", () => {
  let root: string | null = null;

  afterEach(() => {
    if (root) fs.rmSync(root, { recursive: true, force: true });
    root = null;
  });

  function setup() {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "hana-root-identity-"));
    const main = path.join(root, "main");
    const child = path.join(main, "child");
    const sibling = path.join(root, "sibling");
    const hanakoHome = path.join(root, "hana");
    fs.mkdirSync(child, { recursive: true });
    fs.mkdirSync(sibling, { recursive: true });
    const local = new LocalFsProvider({ cwd: main });
    return { main, child, sibling, hanakoHome, local };
  }

  it("uses real filesystem identity for aliases and root relations", async () => {
    const { main, child, sibling, local } = setup();
    const alias = path.join(path.dirname(main), "alias");
    fs.symlinkSync(main, alias, "dir");
    const broker = new ProviderRootIdentityBroker();
    const mainIdentity = await local.getRootIdentity({ kind: "local-file", path: main });
    const aliasIdentity = await local.getRootIdentity({ kind: "local-file", path: alias });
    const childIdentity = await local.getRootIdentity({ kind: "local-file", path: child });
    const siblingIdentity = await local.getRootIdentity({ kind: "local-file", path: sibling });

    expect(mainIdentity.identityNamespace).toBe("local_fs");
    expect(mainIdentity.opaqueRootId).toBe(aliasIdentity.opaqueRootId);
    expect(await broker.compareRoots(mainIdentity, aliasIdentity)).toBe("same");
    expect(await broker.compareRoots(mainIdentity, childIdentity)).toBe("ancestor");
    expect(await broker.compareRoots(childIdentity, mainIdentity)).toBe("descendant");
    expect(await broker.compareRoots(mainIdentity, siblingIdentity)).toBe("disjoint");
  });

  it("places local-file and local backing mounts in the same namespace", async () => {
    const { main, hanakoHome, local } = setup();
    upsertStudioMount(hanakoHome, {
      mountId: "mount_main",
      hostStudioId: "studio_1",
      sourceKind: "storage",
      provider: "local_fs",
      rootLocator: { path: main },
      label: "Main alias",
      presentation: "folder",
      capabilities: ["list", "read", "write"],
    });
    const mount = new MountProvider({
      hanakoHome,
      studioId: "studio_1",
      localFsProviderFactory: ({ cwd, guard }) =>
        new LocalFsProvider({ cwd, guard }),
    });
    const localIdentity = await local.getRootIdentity({
      kind: "local-file",
      path: main,
    });
    const mountIdentity = await mount.getRootIdentity({
      kind: "mount",
      mountId: "mount_main",
      path: "",
    });

    expect(mountIdentity.providerId).toBe("mount");
    expect(mountIdentity.identityNamespace).toBe("local_fs");
    expect(await new ProviderRootIdentityBroker().compareRoots(
      localIdentity,
      mountIdentity,
    )).toBe("same");
  });

  it("fails closed across namespaces unless composition supplies a bilateral static proof", async () => {
    const { main, local } = setup();
    const identity = await local.getRootIdentity({
      kind: "local-file",
      path: main,
    });
    const virtual = Object.freeze({
      providerId: "virtual",
      identityNamespace: "virtual_store",
      opaqueRootId: "opaque",
      scopeToken: "scope",
      caseMode: "sensitive" as const,
    });

    expect(await new ProviderRootIdentityBroker().compareRoots(identity, virtual))
      .toBe("unknown");
    const proved = new ProviderRootIdentityBroker({
      intrinsicallyDisjoint: [{
        a: "local_fs",
        b: "virtual_store",
        intrinsicallyDisjoint: true,
      }],
    });
    expect(await proved.compareRoots(identity, virtual)).toBe("disjoint");
    expect(await proved.compareRoots(virtual, identity)).toBe("disjoint");
  });
});
