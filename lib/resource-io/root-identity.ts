import crypto from "crypto";
import fs from "fs";
import path from "path";
import type {
  ProviderRootIdentity,
  RootRelation,
} from "./types.ts";

type LocalRootPrivate = Readonly<{
  canonicalPath: string;
  comparisonPath: string;
  nativeIdentity: LocalRootNativeIdentity;
}>;

type LocalRootIdentitySnapshot = Readonly<{
  device: string;
  inode: string;
  mode: string;
  birthtimeMs: number;
  nativeIdentity: LocalRootNativeIdentity;
}>;

export type LocalRootNativeIdentity = Readonly<{
  device: string;
  inode: string;
  birthtimeNs: string;
}>;

type IntrinsicallyDisjointProof = Readonly<{
  a: string;
  b: string;
  intrinsicallyDisjoint: true;
}>;

const localRootPrivate = new WeakMap<ProviderRootIdentity, LocalRootPrivate>();

export function resolveLocalFsRootIdentity(
  providerId: string,
  rootPath: string,
): ProviderRootIdentity {
  const canonicalPath = nativeRealpath(rootPath);
  const snapshot = captureLocalRootIdentitySnapshot(canonicalPath);
  const caseMode = localCaseMode();
  const comparisonPath = caseMode === "insensitive"
    ? canonicalPath.normalize("NFC").toLocaleLowerCase("en-US")
    : canonicalPath;
  // Windows filesystems can report inode 0 for every directory. Treating
  // that placeholder as a stable file identity would make unrelated sibling
  // roots look identical and deny a valid source registration. realpath is a
  // conservative fallback: aliases resolve to the same canonical path, while
  // roots without a usable file identity never share an opaque id by accident.
  const opaqueRootId = hasStableInode(snapshot)
    ? digest(["local_fs", "inode", snapshot.device, snapshot.inode])
    : digest(["local_fs", "canonical-path", comparisonPath]);
  const scopeToken = digest([
    opaqueRootId,
    comparisonPath,
    snapshot.device,
    snapshot.inode,
    snapshot.mode,
    String(snapshot.birthtimeMs),
  ]);
  const identity: ProviderRootIdentity = Object.freeze({
    providerId,
    identityNamespace: "local_fs",
    opaqueRootId,
    scopeToken,
    caseMode,
  });
  localRootPrivate.set(identity, Object.freeze({
    canonicalPath,
    comparisonPath,
    nativeIdentity: snapshot.nativeIdentity,
  }));
  return identity;
}

function captureLocalRootIdentitySnapshot(canonicalPath: string): LocalRootIdentitySnapshot {
  let stat: fs.BigIntStats;
  try {
    stat = fs.lstatSync(canonicalPath, { bigint: true });
  } catch {
    throw rootIdentityError("source root identity is unavailable");
  }
  if (stat.isSymbolicLink() || !stat.isDirectory()) {
    throw rootIdentityError("source root must be a directory");
  }
  const birthtimeMs = Number(stat.birthtimeNs) / 1_000_000;
  if (!Number.isFinite(birthtimeMs)) {
    throw rootIdentityError("source root identity is unavailable");
  }
  return Object.freeze({
    device: stat.dev.toString(),
    inode: stat.ino.toString(),
    mode: stat.mode.toString(),
    birthtimeMs,
    nativeIdentity: Object.freeze({
      device: stat.dev.toString(),
      inode: stat.ino.toString(),
      birthtimeNs: stat.birthtimeNs.toString(),
    }),
  });
}

/**
 * Private local-root authority for in-process ResourceIO seams. A copied
 * ProviderRootIdentity has no WeakMap entry and therefore cannot yield it.
 */
export function localRootNativeIdentity(
  identity: ProviderRootIdentity,
): LocalRootNativeIdentity | null {
  return localRootPrivate.get(identity)?.nativeIdentity || null;
}

export class ProviderRootIdentityBroker {
  readonly #intrinsicallyDisjointPairs: ReadonlySet<string>;

  constructor({
    intrinsicallyDisjoint = [],
  }: {
    intrinsicallyDisjoint?: readonly IntrinsicallyDisjointProof[];
  } = {}) {
    const pairs = new Set<string>();
    for (const proof of intrinsicallyDisjoint) {
      if (
        proof?.intrinsicallyDisjoint !== true
        || !validNamespace(proof.a)
        || !validNamespace(proof.b)
        || proof.a === proof.b
      ) {
        throw new Error("invalid intrinsically-disjoint root identity proof");
      }
      pairs.add(namespacePair(proof.a, proof.b));
    }
    this.#intrinsicallyDisjointPairs = pairs;
  }

  async compareRoots(
    a: ProviderRootIdentity,
    b: ProviderRootIdentity,
  ): Promise<RootRelation> {
    if (!validIdentity(a) || !validIdentity(b)) return "unknown";
    if (a.identityNamespace !== b.identityNamespace) {
      return this.#intrinsicallyDisjointPairs.has(
        namespacePair(a.identityNamespace, b.identityNamespace),
      )
        ? "disjoint"
        : "unknown";
    }
    if (a.identityNamespace !== "local_fs") return "unknown";

    const aPrivate = localRootPrivate.get(a);
    const bPrivate = localRootPrivate.get(b);
    if (!aPrivate || !bPrivate) return "unknown";
    if (a.opaqueRootId === b.opaqueRootId) {
      return a.scopeToken === b.scopeToken ? "same" : "unknown";
    }
    const aPath = aPrivate.comparisonPath;
    const bPath = bPrivate.comparisonPath;
    if (isStrictAncestor(aPath, bPath)) return "ancestor";
    if (isStrictAncestor(bPath, aPath)) return "descendant";
    return "disjoint";
  }
}

function nativeRealpath(rootPath: string): string {
  if (typeof rootPath !== "string" || !path.isAbsolute(rootPath)) {
    throw rootIdentityError("source root must be an absolute path");
  }
  try {
    const native = typeof fs.realpathSync.native === "function"
      ? fs.realpathSync.native(rootPath)
      : fs.realpathSync(rootPath);
    return path.normalize(native);
  } catch {
    throw rootIdentityError("source root identity is unavailable");
  }
}

function localCaseMode(): ProviderRootIdentity["caseMode"] {
  if (process.platform === "win32" || process.platform === "darwin") {
    return "insensitive";
  }
  return process.platform === "linux" ? "sensitive" : "unknown";
}

function isStrictAncestor(parent: string, child: string): boolean {
  const relative = path.relative(parent, child);
  return relative.length > 0
    && !relative.startsWith("..")
    && !path.isAbsolute(relative);
}

function hasStableInode(snapshot: LocalRootIdentitySnapshot): boolean {
  let device: number;
  let inode: number;
  try {
    device = Number(BigInt(snapshot.device));
    inode = Number(BigInt(snapshot.inode));
  } catch {
    return false;
  }
  return Number.isSafeInteger(device)
    && Number.isSafeInteger(inode)
    && inode > 0;
}

function digest(parts: readonly string[]): string {
  return crypto.createHash("sha256")
    .update(parts.join("\0"))
    .digest("base64url");
}

function namespacePair(a: string, b: string): string {
  return [a, b].sort().join("\0");
}

function validNamespace(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

function validIdentity(value: unknown): value is ProviderRootIdentity {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const identity = value as Partial<ProviderRootIdentity>;
  return validNamespace(identity.providerId)
    && validNamespace(identity.identityNamespace)
    && validNamespace(identity.opaqueRootId)
    && validNamespace(identity.scopeToken)
    && ["sensitive", "insensitive", "unknown"].includes(
      String(identity.caseMode),
    );
}

function rootIdentityError(message: string): Error {
  return Object.assign(new Error(message), {
    code: "source_root_identity_unprovable",
    status: 422,
  });
}
