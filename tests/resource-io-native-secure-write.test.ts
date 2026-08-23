import { execFileSync } from "child_process";
import fs from "fs";
import os from "os";
import path from "path";
import { fileURLToPath, pathToFileURL } from "url";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  secureConditionalWrite,
  withLocalSecureWriteProof,
} from "../lib/resource-io/native-secure-write.ts";
import { LocalFsProvider } from "../lib/resource-io/providers/local-fs-provider.ts";
import {
  attachInternalLocalResourceAuthority,
  normalizeResourceRef,
} from "../lib/resource-io/resource-refs.ts";
import { ResourceIO } from "../lib/resource-io/resource-io.ts";
import {
  localRootNativeIdentity,
  resolveLocalFsRootIdentity,
} from "../lib/resource-io/root-identity.ts";
import { RESOURCE_READ_PROOF, RESOURCE_SCOPE_ROOT } from "../lib/resource-io/types.ts";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const FIXTURE_ROOT = path.join(ROOT, "tests", "fixtures", "secure-fs-helper");

describe("native secure conditional write", () => {
  let tempRoot: string | null = null;

  afterEach(() => {
    if (tempRoot) fs.rmSync(tempRoot, { recursive: true, force: true });
    tempRoot = null;
    vi.unstubAllEnvs();
  });

  it("loads through Node's strip-only TypeScript runtime used by the E2E server", () => {
    const moduleUrl = pathToFileURL(
      path.join(ROOT, "lib", "resource-io", "native-secure-write.ts"),
    ).href;
    const output = execFileSync(process.execPath, [
      "--experimental-strip-types",
      "--input-type=module",
      "-e",
      `import(${JSON.stringify(moduleUrl)}).then((module) => console.log(typeof module.secureConditionalWrite)).catch((error) => { console.error(error); process.exit(1); })`,
    ], {
      cwd: ROOT,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
    expect(output.trim()).toBe("function");
  });

  it("delegates once and fails closed when the native runner is unavailable", async () => {
    const { provider, target, before } = makeProvider();
    useFixture("unavailable.cjs");

    await expect(provider.writeExpectedVersion(
      { kind: "local-file", path: target },
      "after",
      before,
    )).rejects.toMatchObject({ code: "provider_not_available", status: 503 });

    expect(fs.readFileSync(target, "utf8")).toBe("before");
  });

  it.each([
    ["an NTFS alternate-data-stream suffix", "a.md:stream"],
    ["a control character", "a.md\u0001"],
  ])("rejects %s before invoking the helper", async (_description, segment) => {
    const { provider, target } = makeProvider();
    const helperMarker = path.join(tempRoot!, "helper-was-invoked");
    useFixture("written.cjs");
    vi.stubEnv("HANA_SECURE_FS_HELPER_MARKER", helperMarker);

    await expect(provider.writeExpectedVersion(
      { kind: "local-file", path: path.join(tempRoot!, "notes", segment) },
      "after",
      null,
    )).rejects.toMatchObject({ code: "resource_version_conflict", status: 409 });

    expect(fs.existsSync(helperMarker)).toBe(false);
    expect(fs.readFileSync(target, "utf8")).toBe("before");
  });

  it("fails closed with a typed conflict when conditional creation has a missing parent", async () => {
    tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "hana-native-secure-write-"));
    const provider = new LocalFsProvider({ cwd: tempRoot });
    const target = path.join(tempRoot, "missing", "deep", "note.md");
    const helperMarker = path.join(tempRoot, "helper-was-invoked");
    useFixture("written.cjs");
    vi.stubEnv("HANA_SECURE_FS_HELPER_MARKER", helperMarker);

    await expect(provider.writeExpectedVersion(
      { kind: "local-file", path: target },
      "after",
      null,
    )).rejects.toMatchObject({ code: "resource_version_conflict", status: 409 });

    expect(fs.existsSync(path.dirname(target))).toBe(false);
    expect(fs.existsSync(helperMarker)).toBe(false);
  });

  it("ignores the JavaScript helper override outside tests and never falls back to Node", async () => {
    const { provider, target, before } = makeProvider();
    const helperMarker = path.join(tempRoot!, "helper-was-invoked");
    const fixturePath = path.join(FIXTURE_ROOT, "written.cjs");
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("HANA_SECURE_FS_HELPER_PATH", fixturePath);
    vi.stubEnv("HANA_SECURE_FS_HELPER_MARKER", helperMarker);
    const existsSync = fs.existsSync.bind(fs);
    const existsSpy = vi.spyOn(fs, "existsSync").mockImplementation(((candidate) => {
      // Force the production artifact lookup to fail while retaining the
      // assertion that the test-only JavaScript override is never consulted.
      return candidate === fixturePath ? true : false;
    }) as typeof fs.existsSync);
    try {
      await expect(provider.writeExpectedVersion(targetRef(target), "after", before))
        .rejects.toMatchObject({ code: "provider_not_available", status: 503 });
      expect(existsSpy).not.toHaveBeenCalledWith(fixturePath);
      expect(fs.existsSync(helperMarker)).toBe(false);
      expect(existsSync(target)).toBe(true);
      expect(fs.readFileSync(target, "utf8")).toBe("before");
    } finally {
      existsSpy.mockRestore();
    }
  });

  it("rejects an invalid helper frame without writing", async () => {
    const { provider, target, before } = makeProvider();
    useFixture("malformed-frame.cjs");

    await expect(provider.writeExpectedVersion(
      { kind: "local-file", path: target },
      "after",
      before,
    )).rejects.toMatchObject({ code: "secure_write_protocol_error", status: 503 });

    expect(fs.readFileSync(target, "utf8")).toBe("before");
  });

  it("maps an unsafe helper result to a safe conflict without writing", async () => {
    const { provider, target, before } = makeProvider();
    useFixture("unsafe.cjs");

    await expect(provider.writeExpectedVersion(
      { kind: "local-file", path: target },
      "after",
      before,
    )).rejects.toMatchObject({ code: "resource_version_conflict", status: 409 });

    expect(fs.readFileSync(target, "utf8")).toBe("before");
  });

  it("maps a helper conflict to the existing conditional-write result without writing", async () => {
    const { provider, target, before } = makeProvider();
    useFixture("conflict.cjs");

    await expect(provider.writeExpectedVersion(
      { kind: "local-file", path: target },
      "after",
      before,
    )).resolves.toMatchObject({ ok: false, conflict: true });

    expect(fs.readFileSync(target, "utf8")).toBe("before");
  });

  it("requires the provider-private proof identity instead of ResourceRef shape", async () => {
    const { target, before } = makeProvider();
    const forgedRef = {
      kind: "local-file" as const,
      path: target,
      secureWriteProof: {
        rootPath: tempRoot,
        segments: ["notes", "a.md"],
      },
    };

    await expect(secureConditionalWrite(forgedRef, "after", before))
      .rejects.toMatchObject({ code: "resource_version_conflict", status: 409 });

    expect(fs.readFileSync(target, "utf8")).toBe("before");
  });

  it("rejects structurally forged internal authority symbols before invoking the helper", async () => {
    const { provider, target, before } = makeProvider();
    const resourceIO = new ResourceIO({ providers: { local_fs: provider } });
    const observed = await resourceIO.stat({ kind: "local-file", path: target });
    const helperMarker = path.join(tempRoot!, "helper-was-invoked");
    useFixture("written.cjs");
    vi.stubEnv("HANA_SECURE_FS_HELPER_MARKER", helperMarker);
    const forgedRef = { kind: "local-file" as const, path: target };
    Object.defineProperty(forgedRef, RESOURCE_SCOPE_ROOT, {
      value: tempRoot,
      enumerable: false,
    });
    Object.defineProperty(forgedRef, RESOURCE_READ_PROOF, {
      value: observed[RESOURCE_READ_PROOF],
      enumerable: false,
    });

    expect(() => normalizeResourceRef(forgedRef)).toThrow(/untrusted internal ResourceRef authority/i);
    await expect(resourceIO.writeExpectedVersion(forgedRef, "after", before))
      .rejects.toThrow(/untrusted internal ResourceRef authority/i);
    expect(fs.existsSync(helperMarker)).toBe(false);
    expect(fs.readFileSync(target, "utf8")).toBe("before");
  });

  it("rejects copied and structurally forged activation-root authority before invoking the helper", async () => {
    const { provider, target, before } = makeProvider();
    const resourceIO = new ResourceIO({ providers: { local_fs: provider } });
    const activationIdentity = await provider.getRootIdentity({
      kind: "local-file",
      path: tempRoot!,
    });
    const trustedRef = attachInternalLocalResourceAuthority(
      { kind: "local-file" as const, path: target },
      { activationRootIdentity: activationIdentity },
    );
    const [activationSymbol] = Object.getOwnPropertySymbols(trustedRef);
    const activationDescriptor = activationSymbol
      ? Object.getOwnPropertyDescriptor(trustedRef, activationSymbol)
      : undefined;
    if (!activationSymbol || !activationDescriptor) {
      throw new Error("test fixture did not attach activation-root authority");
    }
    const structurallyForgedRef = { kind: "local-file" as const, path: target };
    Object.defineProperty(structurallyForgedRef, activationSymbol, activationDescriptor);
    expect(() => normalizeResourceRef(structurallyForgedRef))
      .toThrow(/untrusted internal ResourceRef authority/i);

    const copiedIdentityRef = attachInternalLocalResourceAuthority(
      { kind: "local-file" as const, path: target },
      { activationRootIdentity: Object.freeze({ ...activationIdentity }) },
    );
    const helperMarker = path.join(tempRoot!, "helper-was-invoked");
    useFixture("written.cjs");
    vi.stubEnv("HANA_SECURE_FS_HELPER_MARKER", helperMarker);

    await expect(resourceIO.writeExpectedVersion(copiedIdentityRef, "after", before))
      .rejects.toMatchObject({ code: "resource_version_conflict", status: 409 });
    expect(fs.existsSync(helperMarker)).toBe(false);
    expect(fs.readFileSync(target, "utf8")).toBe("before");
  });

  it("cleans provider-private secure-write proofs after successful and failed callbacks", async () => {
    const { target, before } = makeProvider();
    const ref = { kind: "local-file" as const, path: target };
    const identity = Object.freeze({ device: "1", inode: "2", birthtimeNs: "3" });
    const proof = Object.freeze({
      rootPath: tempRoot!,
      segments: Object.freeze(["notes", "a.md"]),
      root: identity,
      ancestors: Object.freeze([identity]),
      final: Object.freeze({ identity, mtimeNs: "1", size: "6" }),
    });

    await expect(withLocalSecureWriteProof(ref, proof, async () => undefined))
      .resolves.toBeUndefined();
    await expect(withLocalSecureWriteProof(ref, proof, async () => {
      throw new Error("expected cleanup failure");
    })).rejects.toThrow("expected cleanup failure");
    await expect(withLocalSecureWriteProof(ref, proof, async () => undefined))
      .resolves.toBeUndefined();
    await expect(secureConditionalWrite(ref, "after", before))
      .rejects.toMatchObject({ code: "resource_version_conflict", status: 409 });
  });

  it("uses one root snapshot across a former between-call replacement and rejects the replacement before helper invocation", async () => {
    const rawWorkspaceParent = fs.mkdtempSync(path.join(os.tmpdir(), "hana-root-snapshot-"));
    const workspaceParent = typeof fs.realpathSync.native === "function"
      ? fs.realpathSync.native(rawWorkspaceParent)
      : fs.realpathSync(rawWorkspaceParent);
    const root = path.join(workspaceParent, "main");
    const displacedRoot = path.join(workspaceParent, "main-before-replacement");
    const target = path.join(root, "notes", "a.md");
    const helperMarker = path.join(workspaceParent, "helper-was-invoked");
    try {
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, "before", "utf8");
      const originalTargetStat = fs.statSync(target);
      const originalRootStat = fs.statSync(root);
      const baselineIdentity = resolveLocalFsRootIdentity("local_fs", root);
      const baselineNativeIdentity = localRootNativeIdentity(baselineIdentity);
      if (!baselineNativeIdentity) throw new Error("test fixture did not create a local root identity");

      let rootReplaced = false;
      const replaceRoot = () => {
        if (rootReplaced) return;
        rootReplaced = true;
        fs.renameSync(root, displacedRoot);
        fs.mkdirSync(path.dirname(target), { recursive: true });
        fs.writeFileSync(target, "before", "utf8");
        fs.chmodSync(target, originalTargetStat.mode & 0o777);
        fs.utimesSync(target, originalTargetStat.atime, originalTargetStat.mtime);
        fs.chmodSync(root, originalRootStat.mode & 0o777);
        fs.utimesSync(root, originalRootStat.atime, originalRootStat.mtime);
      };
      const statSync = fs.statSync.bind(fs);
      const statSpy = vi.spyOn(fs, "statSync").mockImplementation(((candidate, options) => {
        const stat = statSync(candidate, options as fs.StatSyncOptions | undefined);
        if (typeof candidate === "string" && path.resolve(candidate) === root) replaceRoot();
        return stat;
      }) as typeof fs.statSync);
      const lstatSpy = vi.spyOn(fs, "lstatSync");
      let activationIdentity;
      try {
        activationIdentity = resolveLocalFsRootIdentity("local_fs", root);
        // A mixed identity would retain the old public fields while exposing
        // the replacement native identity. One snapshot must preserve both halves.
        expect(statSpy).not.toHaveBeenCalled();
        expect(lstatSpy).toHaveBeenCalledTimes(1);
        expect(lstatSpy).toHaveBeenCalledWith(root, { bigint: true });
      } finally {
        statSpy.mockRestore();
        lstatSpy.mockRestore();
      }

      expect(activationIdentity.opaqueRootId).toBe(baselineIdentity.opaqueRootId);
      expect(activationIdentity.scopeToken).toBe(baselineIdentity.scopeToken);
      expect(localRootNativeIdentity(activationIdentity)).toEqual(baselineNativeIdentity);

      replaceRoot();
      const provider = new LocalFsProvider({ cwd: root });
      const resourceIO = new ResourceIO({ providers: { local_fs: provider } });
      const ref = attachInternalLocalResourceAuthority(
        { kind: "local-file" as const, path: target },
        { scopeRoot: root, activationRootIdentity: activationIdentity },
      );
      useFixture("written.cjs");
      vi.stubEnv("HANA_SECURE_FS_HELPER_MARKER", helperMarker);

      await expect(resourceIO.writeExpectedVersion(
        ref,
        "restore",
        { mtimeMs: originalTargetStat.mtime.getTime(), size: originalTargetStat.size },
      )).rejects.toMatchObject({ code: "resource_version_conflict", status: 409 });
      expect(fs.existsSync(helperMarker)).toBe(false);
      expect(fs.readFileSync(path.join(displacedRoot, "notes", "a.md"), "utf8")).toBe("before");
      expect(fs.readFileSync(target, "utf8")).toBe("before");
    } finally {
      vi.unstubAllEnvs();
      fs.rmSync(rawWorkspaceParent, { recursive: true, force: true });
    }
  });

  it("rejects a same-version replacement bound to a provider-issued read proof before invoking the helper", async () => {
    const { provider, target } = makeProvider();
    const resourceIO = new ResourceIO({ providers: { local_fs: provider } });
    const observed = await resourceIO.stat({ kind: "local-file", path: target });
    const readProof = observed[RESOURCE_READ_PROOF];
    const expectedVersion = observed.version;
    if (!readProof || !expectedVersion || typeof expectedVersion.mtimeMs !== "number") {
      throw new Error("test fixture did not produce a provider read proof");
    }

    const displacedTarget = `${target}.before-replacement`;
    fs.renameSync(target, displacedTarget);
    fs.writeFileSync(target, "evil!!", "utf8");
    const originalTime = new Date(expectedVersion.mtimeMs);
    fs.utimesSync(target, originalTime, originalTime);
    expect(fs.statSync(target).mtime.getTime()).toBe(expectedVersion.mtimeMs);
    expect(fs.statSync(target).size).toBe(expectedVersion.size);

    const helperMarker = path.join(tempRoot!, "helper-was-invoked");
    useFixture("written.cjs");
    vi.stubEnv("HANA_SECURE_FS_HELPER_MARKER", helperMarker);
    const boundRef = attachInternalLocalResourceAuthority(
      { kind: "local-file" as const, path: target },
      { readProof },
    );

    await expect(resourceIO.writeExpectedVersion(boundRef, "restore", expectedVersion))
      .resolves.toMatchObject({ ok: false, conflict: true });
    expect(fs.existsSync(helperMarker)).toBe(false);
    expect(fs.readFileSync(target, "utf8")).toBe("evil!!");
    expect(fs.readFileSync(displacedTarget, "utf8")).toBe("before");
  });

  function makeProvider() {
    tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "hana-native-secure-write-"));
    const target = path.join(tempRoot, "notes", "a.md");
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, "before", "utf8");
    const stat = fs.statSync(target);
    return {
      provider: new LocalFsProvider({ cwd: tempRoot }),
      target,
      before: { mtimeMs: stat.mtime.getTime(), size: stat.size },
    };
  }

  function targetRef(target: string) {
    return { kind: "local-file" as const, path: target };
  }

  function useFixture(name: string): void {
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("HANA_SECURE_FS_HELPER_PATH", path.join(FIXTURE_ROOT, name));
  }
});
