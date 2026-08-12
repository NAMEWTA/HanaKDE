import fs from "fs";
import path from "path";
import crypto from "crypto";
import { ResourceIOError, resourceAccessDenied, resourceNotFound, targetAlreadyExists } from "../errors.ts";
import {
  secureConditionalWrite,
  withLocalSecureWriteProof,
  type LocalSecureWriteProof,
  type NativeFileIdentity,
  type NativeFileProof,
} from "../native-secure-write.ts";
import {
  internalActivationRootIdentity,
  normalizeResourceRef,
  resourceKeyForRef,
} from "../resource-refs.ts";
import { localRootNativeIdentity, resolveLocalFsRootIdentity } from "../root-identity.ts";
import { isOperationCorrelationId } from "../../../shared/knowledge-diagnostics.ts";
import {
  RESOURCE_LIST_BLOCKED_ENTRIES,
  RESOURCE_READ_PROOF,
  RESOURCE_SCOPE_ROOT,
} from "../types.ts";
import {
  TRANSFER_MAX_CHUNK_BYTES,
  TRANSFER_MAX_DEPTH,
  TRANSFER_MAX_ENTRIES,
  TransferStreamGate,
  encodeResourceTransferVersion,
  isTransferNameSegment,
  throwIfTransferAborted,
  transferEntryUnsupported,
  transferTargetConflict,
  transferVersionConflict,
} from "../transfer.ts";
import type {
  MaterializeResult,
  ResourceDescriptor,
  ResourceEdit,
  ResourceExportEntry,
  ResourceExportTreeOptions,
  ResourceImportTreeOptions,
  ResourceImportTreeRecoveryOptions,
  ResourceImportTreeRecoveryResult,
  ResourceImportTreeResult,
  ResourceListResult,
  ResourceMutationResult,
  ResourceMutationPreconditions,
  ResourceMovePreconditions,
  ResourceOpenReadOptions,
  ResourceOpenReadResult,
  ResourceReadProof,
  ResourceReadResult,
  ResourceRef,
  ResourceSearchResult,
  ResourceStat,
  ResourceTrashOptions,
  ResourceTrashResult,
  ResourceVersion,
  ResourceWriteExpectedVersionResult,
  ResourceMoveResult,
} from "../types.ts";
import type { ResourceAccessDecision } from "../resource-access-policy.ts";

type GuardDecision = ResourceAccessDecision | {
  allowed: boolean;
  reason?: string;
  code?: string;
  safeMessage?: string;
};

type Guard = {
  check: (absolutePath: string, operation: "read" | "write" | "delete") => GuardDecision;
};

type LocalFsProviderOptions = {
  cwd: string;
  guard?: Guard;
  trashRoot?: string | null;
  transferFaultInjector?: (
    point: "after_merge_backup_rename",
    details: Readonly<{ operationId: string }>,
  ) => void;
};

const SEARCH_SKIP_DIRS = new Set([".git", "node_modules", "dist", "build", "coverage"]);
const LOCAL_READ_PROOFS = new WeakSet<object>();

type LocalPathIdentityEntry = Readonly<{
  filePath: string;
  identity: FileIdentity;
  nativeIdentity: NativeFileIdentity;
  kind: "directory" | "file";
  changeToken: string;
}>;

type LocalPathIdentityProof = Readonly<{
  filePath: string;
  entries: readonly LocalPathIdentityEntry[];
  targetIdentity: FileIdentity;
  targetStat: fs.Stats;
}>;

export class LocalFsProvider {
  readonly id = "local_fs" as const;

  declare cwd: string;
  declare guard: Guard | null;
  declare trashRoot: string | null;
  declare transferFaultInjector: NonNullable<LocalFsProviderOptions["transferFaultInjector"]>;

  constructor({
    cwd,
    guard = null,
    trashRoot = null,
    transferFaultInjector = () => {},
  }: LocalFsProviderOptions) {
    this.cwd = cwd || process.cwd();
    this.guard = guard;
    this.trashRoot = trashRoot || null;
    this.transferFaultInjector = transferFaultInjector;
  }

  capabilities() {
    return {
      stat: true,
      read: true,
      openRead: true,
      write: true,
      writeExpectedVersion: true,
      edit: true,
      list: true,
      search: true,
      watch: true,
      materialize: true,
      copy: true,
      rename: true,
      move: true,
      trash: Boolean(this.trashRoot),
      delete: true,
      mkdir: true,
      exportTree: true,
      importTree: true,
    };
  }

  async getRootIdentity(ref: ResourceRef | unknown) {
    const filePath = this.resolvePath(ref);
    this.assertAllowed(filePath, "read");
    return resolveLocalFsRootIdentity(this.id, filePath);
  }

  async stat(ref: ResourceRef | unknown): Promise<ResourceStat> {
    const filePath = this.resolvePath(ref);
    const proofRoot = localReadProofRoot(ref, filePath, this.cwd);
    this.assertAllowed(filePath, "read");
    let pathProof: LocalPathIdentityProof;
    try {
      pathProof = captureLocalPathIdentityProof(filePath, proofRoot);
    } catch (error) {
      if ((error as NodeJS.ErrnoException)?.code !== "ENOENT") throw error;
      return {
        resourceKey: localResourceKey(filePath),
        resource: this.resourceForPath(filePath),
        exists: false,
        isDirectory: false,
        filePath,
      };
    }
    this.revalidateReadProof(filePath, pathProof);
    const stat = pathProof.targetStat;
    return attachResourceReadProof({
      resourceKey: localResourceKey(filePath),
      resource: this.resourceForPath(filePath),
      exists: true,
      isDirectory: stat.isDirectory(),
      version: versionFromStat(stat),
      filePath,
    }, localResourceReadProof(pathProof));
  }

  async read(ref: ResourceRef | unknown): Promise<ResourceReadResult> {
    const stat = await this.stat(ref);
    if (!stat.exists) throw resourceNotFound(stat.filePath || "resource");
    if (stat.isDirectory) throw safeOpenReadError("not_a_file", 400);
    const opened = await this.openRead(ref, {
      expectedVersion: stat.version,
      [RESOURCE_READ_PROOF]: stat[RESOURCE_READ_PROOF],
    });
    const chunks: Buffer[] = [];
    let byteLength = 0;
    for await (const chunk of opened.body) {
      const copy = Buffer.from(chunk.buffer, chunk.byteOffset, chunk.byteLength);
      chunks.push(copy);
      byteLength += copy.byteLength;
    }
    return {
      resourceKey: opened.resourceKey,
      resource: opened.resource,
      content: Buffer.concat(chunks, byteLength),
      version: opened.version,
      ...(opened.filePath ? { filePath: opened.filePath } : {}),
    };
  }

  async openRead(
    ref: ResourceRef | unknown,
    options: ResourceOpenReadOptions = {},
  ): Promise<ResourceOpenReadResult> {
    const filePath = this.resolvePath(ref);
    this.assertAllowed(filePath, "read");
    const suppliedProof = localPathProofFromResourceReadProof(
      options[RESOURCE_READ_PROOF],
      filePath,
    );
    const proofRoot = suppliedProof?.entries[0]?.filePath
      || localReadProofRoot(ref, filePath, this.cwd);
    let pathProof: LocalPathIdentityProof;
    try {
      pathProof = captureLocalPathIdentityProof(filePath, proofRoot);
    } catch (error) {
      // The address was resolved before this proof capture. A parent swap can
      // therefore remove it (or make it non-directory) in the narrow gap;
      // classify that as a stale proof, never as an unhandled filesystem
      // exception that becomes a 500 at the route boundary.
      const code = (error as NodeJS.ErrnoException)?.code;
      if (code === "ENOENT" || code === "ENOTDIR") {
        throw safeOpenReadError("resource_version_conflict", 409);
      }
      if (code === "ELOOP") {
        throw safeOpenReadError("symbolic_link_not_allowed", 400);
      }
      if (code === "EACCES" || code === "EPERM") {
        throw safeOpenReadError("resource_access_denied", 403);
      }
      throw error;
    }
    if (suppliedProof && !sameLocalPathIdentityProof(suppliedProof, pathProof)) {
      throw safeOpenReadError("resource_version_conflict", 409);
    }
    const expectedPathProof = suppliedProof || pathProof;
    const noFollow = typeof fs.constants.O_NOFOLLOW === "number"
      ? fs.constants.O_NOFOLLOW
      : 0;
    let descriptor: number | null = null;
    try {
      descriptor = fs.openSync(filePath, fs.constants.O_RDONLY | noFollow);
      const opened = fs.fstatSync(descriptor);
      if (!opened.isFile()) throw safeOpenReadError("not_a_file", 400);
      if (!sameFileIdentity(expectedPathProof.targetIdentity, opened)) {
        throw safeOpenReadError("resource_version_conflict", 409);
      }
      const version = versionFromStat(opened);
      if (options.expectedVersion && !fileVersionsMatch(version, options.expectedVersion)) {
        throw safeOpenReadError("resource_version_conflict", 409);
      }
      const start = options.start ?? 0;
      const end = options.end ?? Math.max(opened.size - 1, 0);
      if (
        !Number.isSafeInteger(start)
        || !Number.isSafeInteger(end)
        || start < 0
        || end < start
        || (opened.size > 0 && end >= opened.size)
      ) {
        throw safeOpenReadError("invalid_read_range", 416);
      }
      this.revalidateReadProof(filePath, expectedPathProof);
      const body = openedLocalFileBody({
        descriptor,
        filePath,
        start,
        end,
        expectedIdentity: fileIdentity(opened),
        expectedVersion: version,
        revalidateScope: () => this.revalidateReadProof(filePath, expectedPathProof),
      });
      descriptor = null;
      return {
        resourceKey: localResourceKey(filePath),
        resource: this.resourceForPath(filePath),
        body,
        size: opened.size,
        mtimeMs: opened.mtimeMs,
        version,
        filePath,
      };
    } catch (error) {
      if (descriptor !== null) fs.closeSync(descriptor);
      const code = (error as NodeJS.ErrnoException)?.code;
      if (code === "ENOENT" || code === "ENOTDIR") {
        throw safeOpenReadError("resource_not_found", 404);
      }
      if (code === "ELOOP") throw safeOpenReadError("symbolic_link_not_allowed", 400);
      if (code === "EACCES" || code === "EPERM") {
        throw safeOpenReadError("resource_access_denied", 403);
      }
      throw error;
    }
  }

  revalidateReadProof(filePath: string, proof: LocalPathIdentityProof): void {
    this.assertAllowed(filePath, "read");
    let current: LocalPathIdentityProof;
    try {
      current = captureLocalPathIdentityProof(
        filePath,
        proof.entries[0]?.filePath || this.cwd,
      );
    } catch {
      throw safeOpenReadError("resource_version_conflict", 409);
    }
    if (!sameLocalPathIdentityProof(proof, current)) {
      throw safeOpenReadError("resource_version_conflict", 409);
    }
  }

  async write(ref: ResourceRef | unknown, content: string | Buffer): Promise<ResourceMutationResult> {
    const filePath = this.resolvePath(ref);
    this.assertAllowed(filePath, "write");
    const existed = fs.existsSync(filePath);
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, content);
    return this.mutationResult(filePath, existed ? "modified" : "created");
  }

  async writeExpectedVersion(ref: ResourceRef | unknown, content: string | Buffer, expectedVersion: ResourceVersion | null): Promise<ResourceWriteExpectedVersionResult> {
    const normalized = normalizeResourceRef(ref);
    const target = resolveLocalSecureWriteTarget(normalized, this.cwd);
    const filePath = target.filePath;
    this.assertAllowed(filePath, "write");
    const activationIdentity = internalActivationRootIdentity(normalized);
    const activationRoot = activationIdentity === undefined
      ? undefined
      : localRootNativeIdentity(activationIdentity);
    if (activationIdentity !== undefined && !activationRoot) throw secureWriteSafetyError();
    const suppliedReadProof = localPathProofFromResourceReadProof(
      normalized[RESOURCE_READ_PROOF],
      filePath,
    );
    if (suppliedReadProof) {
      let currentReadProof: LocalPathIdentityProof | null = null;
      try {
        currentReadProof = captureLocalPathIdentityProof(filePath, target.rootPath);
      } catch {
        // A completed read must still name the exact root/ancestor/final
        // object before a new helper proof is captured or a helper is started.
      }
      if (!currentReadProof || !sameLocalPathIdentityProof(suppliedReadProof, currentReadProof)) {
        return {
          ok: false,
          conflict: true,
          resourceKey: localResourceKey(filePath),
          resource: this.resourceForPath(filePath),
          ...(currentReadProof ? { version: versionFromStat(currentReadProof.targetStat) } : {}),
          filePath,
        };
      }
    }
    const preflight = captureLocalSecureWriteProof(target, activationRoot);
    const currentVersion = preflight.currentVersion;
    if (expectedVersion === null) {
      if (currentVersion) {
        return {
          ok: false,
          conflict: true,
          resourceKey: localResourceKey(filePath),
          resource: this.resourceForPath(filePath),
          version: currentVersion,
          filePath,
        };
      }
    } else if (!currentVersion || !fileVersionsMatch(currentVersion, expectedVersion)) {
      return {
        ok: false,
        conflict: true,
        resourceKey: localResourceKey(filePath),
        resource: this.resourceForPath(filePath),
        ...(currentVersion ? { version: currentVersion } : {}),
        filePath,
      };
    }
    // The caller token is checked above. The helper receives this finer-grained
    // native proof and rechecks it from held handles immediately before effect.
    const committed = await withLocalSecureWriteProof(
      normalized,
      preflight.proof,
      () => secureConditionalWrite(normalized, content, expectedVersion),
    );
    if (committed.kind === "conflict") {
      return {
        ok: false,
        conflict: true,
        resourceKey: localResourceKey(filePath),
        resource: this.resourceForPath(filePath),
        ...(committed.version ? { version: committed.version } : {}),
        filePath,
      };
    }
    return {
      changeType: committed.changeType,
      resourceKey: localResourceKey(filePath),
      resource: this.resourceForPath(filePath),
      version: committed.version,
      filePath,
    };
  }

  async edit(ref: ResourceRef | unknown, edits: ResourceEdit[]): Promise<ResourceMutationResult> {
    const filePath = this.resolvePath(ref);
    this.assertAllowed(filePath, "read");
    this.assertAllowed(filePath, "write");
    let text = fs.readFileSync(filePath, "utf-8");
    for (const edit of edits || []) {
      if (typeof edit?.oldText !== "string" || typeof edit?.newText !== "string") {
        throw new Error("resource edit requires oldText and newText");
      }
      if (!text.includes(edit.oldText)) {
        throw new Error("resource edit oldText not found");
      }
      text = text.replace(edit.oldText, edit.newText);
    }
    fs.writeFileSync(filePath, text, "utf-8");
    return this.mutationResult(filePath, "modified");
  }

  async mkdir(
    ref: ResourceRef | unknown,
    options: ResourceMutationPreconditions = {},
  ): Promise<ResourceMutationResult> {
    const filePath = this.resolvePath(ref);
    this.assertAllowed(filePath, "write");
    assertMutationTargetVersion(filePath, options.expectedVersion, {
      missingAllowed: true,
    });
    const existed = fs.existsSync(filePath);
    fs.mkdirSync(filePath, { recursive: true });
    return this.mutationResult(filePath, existed ? "modified" : "created");
  }

  async delete(
    ref: ResourceRef | unknown,
    options: ResourceMutationPreconditions = {},
  ): Promise<ResourceMutationResult> {
    const filePath = this.resolvePath(ref);
    this.assertAllowed(filePath, "delete");
    assertMutationTargetVersion(filePath, options.expectedVersion);
    const result = this.mutationResult(filePath, "modified");
    fs.rmSync(filePath, { recursive: true, force: false });
    return result;
  }

  async copy(
    from: ResourceRef | unknown,
    to: ResourceRef | unknown,
    options: ResourceMutationPreconditions = {},
  ): Promise<ResourceMutationResult> {
    const sourcePath = this.resolvePath(from);
    const targetPath = this.resolvePath(to);
    this.assertAllowed(sourcePath, "read");
    this.assertAllowed(targetPath, "write");
    assertMutationTargetVersion(targetPath, options.expectedVersion, {
      missingAllowed: true,
    });
    const existed = fs.existsSync(targetPath);
    fs.mkdirSync(path.dirname(targetPath), { recursive: true });
    const sourceStat = fs.statSync(sourcePath);
    if (sourceStat.isDirectory()) {
      fs.cpSync(sourcePath, targetPath, { recursive: true });
    } else {
      fs.copyFileSync(sourcePath, targetPath);
    }
    return this.mutationResult(targetPath, existed ? "modified" : "created");
  }

  async rename(
    from: ResourceRef | unknown,
    to: ResourceRef | unknown,
    options: ResourceMovePreconditions = {},
  ): Promise<ResourceMoveResult> {
    return this.move(from, to, options);
  }

  async move(
    from: ResourceRef | unknown,
    to: ResourceRef | unknown,
    options: ResourceMovePreconditions = {},
  ): Promise<ResourceMoveResult> {
    const sourcePath = this.resolvePath(from);
    const targetPath = this.resolvePath(to);
    this.assertAllowed(sourcePath, "delete");
    this.assertAllowed(targetPath, "write");
    assertMutationTargetVersion(
      sourcePath,
      options.expectedSourceVersion,
    );
    assertMutationTargetVersion(
      targetPath,
      options.expectedTargetVersion,
      { missingAllowed: true },
    );
    if (!fs.existsSync(sourcePath)) throw resourceNotFound(sourcePath);
    if (fs.existsSync(targetPath)) throw targetAlreadyExists(targetPath);
    fs.mkdirSync(path.dirname(targetPath), { recursive: true });
    fs.renameSync(sourcePath, targetPath);
    return this.moveResult(sourcePath, targetPath);
  }

  async trash(ref: ResourceRef | unknown, options: ResourceTrashOptions = {}): Promise<ResourceTrashResult> {
    if (!this.trashRoot) {
      throw new ResourceIOError("ResourceIO trash root is unavailable", {
        code: "provider_not_available",
        status: 501,
      });
    }
    const filePath = this.resolvePath(ref);
    this.assertAllowed(filePath, "delete");
    if (!fs.existsSync(filePath)) throw resourceNotFound(filePath);
    const trashId = `trash_${Date.now()}_${crypto.randomBytes(4).toString("hex")}`;
    const namespace = normalizeTrashNamespace(options.namespace || "resource-io");
    const trashPath = path.join(this.trashRoot, namespace, trashId);
    fs.mkdirSync(trashPath, { recursive: true });
    const payloadPath = path.join(trashPath, "payload");
    fs.renameSync(filePath, payloadPath);
    fs.writeFileSync(path.join(trashPath, "metadata.json"), JSON.stringify({
      schemaVersion: 1,
      trashId,
      originalPath: filePath,
      originalName: path.basename(filePath),
      deletedAt: new Date().toISOString(),
      ...(options.metadata && typeof options.metadata === "object" ? options.metadata : {}),
    }, null, 2) + "\n", "utf-8");
    return {
      resourceKey: localResourceKey(filePath),
      resource: this.resourceForPath(filePath),
      trashId,
      trashPath,
      payloadPath,
      filePath,
    };
  }

  async materialize(ref: ResourceRef | unknown): Promise<MaterializeResult> {
    const filePath = this.resolvePath(ref);
    const proofRoot = localReadProofRoot(ref, filePath, this.cwd);
    this.assertAllowed(filePath, "read");
    const pathProof = captureLocalPathIdentityProof(filePath, proofRoot);
    this.revalidateReadProof(filePath, pathProof);
    const stat = pathProof.targetStat;
    return {
      resourceKey: localResourceKey(filePath),
      resource: this.resourceForPath(filePath),
      filePath,
      version: versionFromStat(stat),
    };
  }

  async *exportTree(ref: ResourceRef | unknown, options: ResourceExportTreeOptions = {}): AsyncIterable<ResourceExportEntry> {
    // 根条目本身不允许被 realpath 解引用：symlink 顶层资源必须按链接导出。
    const rootPath = this.resolveNoFollowPath(ref);
    const rootStat = fs.lstatSync(rootPath);
    const rootIdentity = fileIdentity(rootStat);
    options.registerScopeRevalidator?.(() => {
      throwIfTransferAborted(options.signal);
      this.assertAllowed(rootPath, "read");
      let current: fs.Stats | null = null;
      try {
        current = fs.lstatSync(rootPath);
      } catch {
        throw transferVersionConflict("source_scope_changed_before_publish");
      }
      if (!sameFileIdentity(rootIdentity, current)) {
        throw transferVersionConflict("source_scope_changed_before_publish");
      }
    });
    yield* this.exportNode(rootPath, [], options);
  }

  async *exportNode(nodePath: string, segments: string[], options: ResourceExportTreeOptions): AsyncIterable<ResourceExportEntry> {
    throwIfTransferAborted(options.signal);
    this.assertAllowed(nodePath, "read");
    let stat: fs.Stats | null = null;
    try {
      stat = fs.lstatSync(nodePath);
    } catch {
      throw resourceNotFound(nodePath);
    }
    if (stat.isSymbolicLink()) {
      yield {
        kind: "symbolic_link",
        path: segments,
        linkTarget: fs.readlinkSync(nodePath),
      };
      return;
    }
    if (stat.isDirectory()) {
      yield { kind: "directory", path: segments };
      const names = fs.readdirSync(nodePath).sort();
      for (const name of names) {
        yield* this.exportNode(path.join(nodePath, name), [...segments, name], options);
      }
      return;
    }
    if (stat.isFile()) {
      const sourceIdentity = fileIdentity(stat);
      yield {
        kind: "file",
        path: segments,
        sizeBytes: stat.size,
        version: versionFromStat(stat),
        body: chunkedLocalFileBody(
          nodePath,
          versionFromStat(stat),
          sourceIdentity,
          () => this.assertAllowed(nodePath, "read"),
          options.signal,
        ),
      };
      return;
    }
    // FIFO、socket、device 等特殊类型在读出任何字节前拒绝整个顶层资源。
    throw transferEntryUnsupported("special_file_kind");
  }

  async importTreeAtomically(
    targetDirectory: ResourceRef | unknown,
    targetName: string,
    entries: AsyncIterable<ResourceExportEntry>,
    options: ResourceImportTreeOptions,
  ): Promise<ResourceImportTreeResult> {
    assertPlatformTransferSegment(targetName);
    const dirPath = this.resolvePath(targetDirectory);
    let dirStat: fs.Stats | null = null;
    try {
      dirStat = fs.statSync(dirPath);
    } catch {
      throw resourceNotFound(dirPath);
    }
    if (!dirStat.isDirectory()) throw resourceNotFound(dirPath);
    const targetDirectoryIdentity = directoryIdentity(dirPath, dirStat);
    const finalPath = path.join(dirPath, targetName);
    this.assertAllowed(finalPath, "write");
    const mergePolicy = options.mergeExisting;
    const expected = mergePolicy !== undefined
      ? options.expectedTargetVersion === undefined
        ? encodedCurrentTargetVersion(finalPath)
        : normalizeExpectedTargetVersion(options.expectedTargetVersion)
      : options.replaceExisting === true
      ? encodedCurrentTargetVersion(finalPath)
      : normalizeExpectedTargetVersion(options.expectedTargetVersion);
    assertExpectedTargetState(finalPath, expected);
    if (mergePolicy !== undefined && !fs.lstatSync(finalPath).isDirectory()) {
      throw transferEntryUnsupported("merge_target_not_directory");
    }

    const artifacts = transferPublicationArtifacts(dirPath, options.operationId);
    const stagingPath = artifacts.stagingPath;
    if (lstatOrNull(stagingPath) || lstatOrNull(artifacts.backupPath) || lstatOrNull(artifacts.receiptPath)) {
      throw transferVersionConflict("transfer_publication_recovery_required");
    }
    const stagingName = path.basename(stagingPath);
    const mergeTargetFingerprint = mergePolicy === undefined
      ? null
      : directoryTreeFingerprint(finalPath);
    let bytesTransferred = 0;
    try {
      if (mergePolicy !== undefined) {
        fs.cpSync(finalPath, stagingPath, {
          recursive: true,
          dereference: false,
          errorOnExist: true,
          force: false,
          verbatimSymlinks: true,
        });
      }
      const gate = new TransferStreamGate();
      const tasks: Promise<void>[] = [];
      const mergePaths = new Map<string, string[]>();
      if (mergePolicy !== undefined) mergePaths.set("", []);
      let failure: unknown = null;
      const recordFailure = (error: unknown) => {
        if (failure === null) {
          failure = error;
          options.abortTransfer?.();
        }
      };
      try {
        let sawRoot = false;
        for await (const entry of entries) {
          throwIfTransferAborted(options.signal);
          if (failure !== null) break;
          let entryPath = stagingEntryPath(stagingPath, entry.path);
          let skipEntry = false;
          if (entry.path.length === 0) {
            sawRoot = true;
            if (mergePolicy !== undefined) {
              if (entry.kind !== "directory") {
                throw transferEntryUnsupported("merge_source_not_directory");
              }
              continue;
            }
          } else if (mergePolicy !== undefined) {
            const allocation = allocateStagedMergeEntry(
              stagingPath,
              entry,
              mergePaths,
              mergePolicy,
            );
            entryPath = allocation.path;
            skipEntry = allocation.skip;
          }
          if (entry.kind === "directory") {
            if (!fs.existsSync(entryPath)) fs.mkdirSync(entryPath);
            continue;
          }
          if (skipEntry) continue;
          if (entry.kind === "symbolic_link") {
            removeStagedMergeReplacement(entryPath, mergePolicy);
            createStagedSymbolicLink(entry.linkTarget, entryPath);
            continue;
          }
          if (entry.kind === "file") {
            removeStagedMergeReplacement(entryPath, mergePolicy);
            const release = await gate.acquire(options.signal);
            const task = writeStagedFile(entryPath, entry.body, entry.sizeBytes, options.signal)
              .then((written) => {
                bytesTransferred += written;
              })
              .catch(recordFailure)
              .finally(release);
            tasks.push(task);
            continue;
          }
          throw transferEntryUnsupported("unsupported_entry_kind");
        }
        if (!sawRoot && failure === null) {
          throw transferEntryUnsupported("missing_root_entry");
        }
      } catch (error) {
        recordFailure(error);
      } finally {
        await Promise.allSettled(tasks);
      }
      if (failure !== null) throw failure;
      throwIfTransferAborted(options.signal);
      await options.revalidateSourceScope?.();
      throwIfTransferAborted(options.signal);
      if (
        mergeTargetFingerprint !== null
        && directoryTreeFingerprint(finalPath) !== mergeTargetFingerprint
      ) {
        throw transferVersionConflict("merge_target_changed_during_staging");
      }

      // scope 复验：staged 树完成后目标目录身份必须保持不变，且 guard 仍允许写入。
      this.assertAllowed(finalPath, "write");
      if (!sameDirectoryIdentity(targetDirectoryIdentity, dirPath)) {
        throw resourceAccessDenied("write", dirPath, "transfer_target_directory_changed", {
          safeMessage: "Resource transfer target directory changed during staging",
        });
      }
      assertExpectedTargetState(finalPath, expected);
      const revalidateTarget = () => {
        this.assertAllowed(finalPath, "write");
        if (!sameDirectoryIdentity(targetDirectoryIdentity, dirPath)) {
          throw resourceAccessDenied("write", dirPath, "transfer_target_directory_changed", {
            safeMessage: "Resource transfer target directory changed before publish",
          });
        }
        if (
          mergeTargetFingerprint !== null
          && directoryTreeFingerprint(finalPath) !== mergeTargetFingerprint
        ) {
          throw transferVersionConflict("merge_target_changed_before_publish");
        }
      };
      if (mergePolicy === undefined) {
        publishStagedTree(stagingPath, finalPath, expected, revalidateTarget);
      } else {
        publishStagedMergedDirectory(
          stagingPath,
          finalPath,
          expected,
          options.operationId,
          revalidateTarget,
          this.transferFaultInjector,
        );
      }
      fsyncDirectoryBestEffort(dirPath);
      return {
        changeType: expected === null ? "created" : "modified",
        resourceKey: localResourceKey(finalPath),
        resource: this.resourceForPath(finalPath),
        version: versionFromLstatOrUndefined(finalPath),
        bytesTransferred,
        filePath: finalPath,
      };
    } catch (err) {
      if (
        (err as Error)?.name !== "SimulatedKnowledgeOperationCrash"
        && !lstatOrNull(artifacts.backupPath)
      ) {
        try {
          cleanupStagingTree(
            targetDirectoryIdentity,
            dirPath,
            stagingName,
            cleanupSearchRoot(this.cwd),
          );
          fs.rmSync(artifacts.receiptPath, { force: true });
        } catch {
          // Cleanup is only permitted under the captured directory identity and
          // must never replace the operation's already-classified outcome with
          // a platform-specific path error.
        }
      }
      throw err;
    }
  }

  async recoverImportTreePublication(
    target: ResourceRef | unknown,
    options: ResourceImportTreeRecoveryOptions,
  ): Promise<ResourceImportTreeRecoveryResult> {
    if (!isOperationCorrelationId(options.operationId)) {
      throw transferEntryUnsupported("invalid_transfer_recovery_operation");
    }
    const finalPath = this.resolveNoFollowPath(target);
    const directoryPath = path.dirname(finalPath);
    this.assertAllowed(finalPath, "write");
    const directoryStat = fs.statSync(directoryPath);
    if (!directoryStat.isDirectory()) throw resourceNotFound(directoryPath);
    const artifacts = transferPublicationArtifacts(directoryPath, options.operationId);
    const finalStat = lstatOrNull(finalPath);
    const stagingStat = lstatOrNull(artifacts.stagingPath);
    const backupStat = lstatOrNull(artifacts.backupPath);
    const receiptStat = lstatOrNull(artifacts.receiptPath);
    if (!stagingStat && !backupStat && !receiptStat) return { outcome: "none" };
    if (!receiptStat || !receiptStat.isFile()) {
      throw transferVersionConflict("merge_recovery_receipt_unavailable");
    }
    const receipt = readTransferPublicationReceipt(artifacts.receiptPath);
    if (
      receipt.operationId !== options.operationId
      || receipt.expectedTargetVersion !== options.expectedTargetVersion
    ) {
      throw transferVersionConflict("merge_recovery_receipt_mismatch");
    }
    if (stagingStat) {
      if (
        !stagingStat.isDirectory()
        || directoryTreePublicationFingerprint(artifacts.stagingPath) !== receipt.stagedFingerprint
      ) {
        throw transferVersionConflict("merge_recovery_staging_changed");
      }
    }
    if (backupStat) {
      if (!backupStat.isDirectory()) {
        throw transferVersionConflict("merge_recovery_backup_changed");
      }
      assertExpectedTargetState(
        artifacts.backupPath,
        options.expectedTargetVersion,
      );
      if (finalStat) {
        if (
          stagingStat
          || !finalStat.isDirectory()
          || directoryTreePublicationFingerprint(finalPath) !== receipt.stagedFingerprint
        ) {
          throw transferVersionConflict("merge_recovery_final_ambiguous");
        }
      } else if (stagingStat) {
        fs.renameSync(artifacts.stagingPath, finalPath);
      } else {
        fs.renameSync(artifacts.backupPath, finalPath);
        fs.rmSync(artifacts.receiptPath, { force: true });
        fsyncDirectoryBestEffort(directoryPath);
        return {
          outcome: "rolled-back",
          version: versionFromLstatOrUndefined(finalPath),
        };
      }
      fs.rmSync(artifacts.backupPath, { recursive: true, force: false });
      fs.rmSync(artifacts.receiptPath, { force: true });
      fsyncDirectoryBestEffort(directoryPath);
      return {
        outcome: "committed",
        version: versionFromLstatOrUndefined(finalPath),
      };
    }

    if (!finalStat || !finalStat.isDirectory()) {
      throw transferVersionConflict("merge_recovery_target_ambiguous");
    }
    if (stagingStat) {
      assertExpectedTargetState(finalPath, options.expectedTargetVersion);
      fs.rmSync(artifacts.stagingPath, { recursive: true, force: false });
      fs.rmSync(artifacts.receiptPath, { force: true });
      fsyncDirectoryBestEffort(directoryPath);
      return {
        outcome: "rolled-back",
        version: versionFromLstatOrUndefined(finalPath),
      };
    }
    const finalFingerprint = directoryTreePublicationFingerprint(finalPath);
    if (finalFingerprint === receipt.stagedFingerprint) {
      fs.rmSync(artifacts.receiptPath, { force: true });
      return {
        outcome: "committed",
        version: versionFromLstatOrUndefined(finalPath),
      };
    }
    assertExpectedTargetState(finalPath, options.expectedTargetVersion);
    fs.rmSync(artifacts.receiptPath, { force: true });
    return {
      outcome: "rolled-back",
      version: versionFromLstatOrUndefined(finalPath),
    };
  }

  resolveNoFollowPath(ref: ResourceRef | unknown): string {
    const normalized = normalizeResourceRef(ref);
    if (normalized.kind !== "local-file") {
      throw new Error(`local_fs provider cannot resolve ${normalized.kind}`);
    }
    const rawPath = path.isAbsolute(normalized.path)
      ? path.normalize(normalized.path)
      : path.resolve(this.cwd, normalized.path);
    const parentReal = realOrResolved(path.dirname(rawPath));
    return path.join(parentReal, path.basename(rawPath));
  }

  watchTarget(ref: ResourceRef | unknown) {
    const filePath = this.resolvePath(ref);
    this.assertAllowed(filePath, "read");
    const isDirectory = safeIsDirectory(filePath);
    return {
      ref: { kind: "local-file" as const, path: filePath },
      filePath,
      isDirectory,
      resourceKey: localResourceKey(filePath),
      resource: this.resourceForPath(filePath),
      toResource: (changedPath: string) => {
        const eventPath = normalizeWatchEventPath(filePath, changedPath, isDirectory);
        return {
          resourceKey: localResourceKey(eventPath),
          resource: this.resourceForPath(eventPath),
          filePath: eventPath,
        };
      },
    };
  }

  async list(ref: ResourceRef | unknown): Promise<ResourceListResult> {
    const dirPath = this.resolvePath(ref);
    const proofRoot = localReadProofRoot(ref, dirPath, this.cwd);
    this.assertAllowed(dirPath, "read");
    try {
      const pathProof = captureLocalPathIdentityProof(dirPath, proofRoot);
      if (!pathProof.targetStat.isDirectory()) {
        throw safeOpenReadError("not_a_directory", 400);
      }
      this.revalidateReadProof(dirPath, pathProof);
      const blockedEntries: string[] = [];
      const items = fs.readdirSync(dirPath, { withFileTypes: true })
        .flatMap((entry) => {
          const fullPath = path.join(dirPath, entry.name);
          let stat: fs.Stats;
          try {
            // Never follow a symlink/junction merely to render a directory
            // row: its metadata could belong to a source-external target.
            stat = fs.lstatSync(fullPath);
          } catch (error) {
            const code = (error as NodeJS.ErrnoException)?.code;
            if (["ENOENT", "ENOTDIR", "EACCES", "EPERM"].includes(code ?? "")) {
              return [];
            }
            throw error;
          }
          if (stat.isSymbolicLink()) {
            blockedEntries.push(entry.name);
            return [];
          }
          if (!stat.isDirectory() && !stat.isFile()) {
            return [];
          }
          return [{
            name: entry.name,
            isDirectory: stat.isDirectory(),
            size: stat.isDirectory() ? null : stat.size,
            mtimeMs: stat.mtimeMs,
          }];
        })
        .sort((a, b) => a.name.localeCompare(b.name));
      this.revalidateReadProof(dirPath, pathProof);
      const result: ResourceListResult = {
        resourceKey: localResourceKey(dirPath),
        resource: this.resourceForPath(dirPath),
        items,
      };
      if (blockedEntries.length > 0) {
        Object.defineProperty(result, RESOURCE_LIST_BLOCKED_ENTRIES, {
          value: Object.freeze(blockedEntries.sort()),
          enumerable: false,
          configurable: false,
          writable: false,
        });
      }
      return result;
    } catch (error) {
      const code = (error as NodeJS.ErrnoException)?.code;
      if (code === "ENOENT" || code === "ENOTDIR") throw resourceNotFound(dirPath);
      if (code === "EACCES" || code === "EPERM") {
        throw resourceAccessDenied("read", dirPath, "directory_read_denied", {
          safeMessage: "Resource directory is unreadable",
        });
      }
      throw error;
    }
  }

  async search(ref: ResourceRef | unknown, { query, mode, limit }: { query?: string; mode?: string; limit?: number } = {}): Promise<ResourceSearchResult> {
    const rootPath = this.resolvePath(ref);
    const proofRoot = localReadProofRoot(ref, rootPath, this.cwd);
    this.assertAllowed(rootPath, "read");
    const pathProof = captureLocalPathIdentityProof(rootPath, proofRoot);
    if (!pathProof.targetStat.isDirectory()) {
      throw safeOpenReadError("not_a_directory", 400);
    }
    this.revalidateReadProof(rootPath, pathProof);
    const needle = String(query || "");
    const matches = needle
      ? mode === "name"
        ? searchNames(rootPath, needle, this.guard, limit)
        : searchText(rootPath, needle, this.guard)
      : [];
    this.revalidateReadProof(rootPath, pathProof);
    return {
      resourceKey: localResourceKey(rootPath),
      resource: this.resourceForPath(rootPath),
      matches,
    };
  }

  resolvePath(ref: ResourceRef | unknown): string {
    const normalized = normalizeResourceRef(ref);
    if (normalized.kind !== "local-file") {
      throw new Error(`local_fs provider cannot resolve ${normalized.kind}`);
    }
    const rawPath = path.isAbsolute(normalized.path)
      ? path.normalize(normalized.path)
      : path.resolve(this.cwd, normalized.path);
    const resolved = realOrResolved(rawPath);
    assertTrustedScopeContains(normalized, resolved);
    return resolved;
  }

  resourceForPath(filePath: string): ResourceDescriptor {
    return {
      kind: "local-file",
      path: filePath,
      filePath,
      provider: "local_fs",
    };
  }

  mutationResult(filePath: string, changeType: "created" | "modified"): ResourceMutationResult {
    const stat = fs.existsSync(filePath) ? fs.statSync(filePath) : null;
    return {
      changeType,
      resourceKey: localResourceKey(filePath),
      resource: this.resourceForPath(filePath),
      ...(stat ? { version: versionFromStat(stat) } : {}),
      filePath,
    };
  }

  moveResult(sourcePath: string, targetPath: string): ResourceMoveResult {
    return {
      oldResourceKey: localResourceKey(sourcePath),
      newResourceKey: localResourceKey(targetPath),
      oldResource: this.resourceForPath(sourcePath),
      newResource: this.resourceForPath(targetPath),
      oldFilePath: sourcePath,
      newFilePath: targetPath,
    };
  }

  assertAllowed(filePath: string, operation: "read" | "write" | "delete"): void {
    if (!this.guard) return;
    const result = this.guard.check(filePath, operation);
    if (result.allowed !== true) {
      throw resourceAccessDenied(operation, filePath, result.code || result.reason, {
        safeMessage: result.safeMessage,
      });
    }
  }
}

function localResourceKey(filePath: string): string {
  return resourceKeyForRef({ kind: "local-file", path: filePath });
}

type LocalSecureWriteTarget = Readonly<{
  rootPath: string;
  segments: readonly string[];
  filePath: string;
}>;

type LocalSecureWritePreflight = Readonly<{
  proof: LocalSecureWriteProof;
  currentVersion: ResourceVersion | null;
}>;

function resolveLocalSecureWriteTarget(ref: ResourceRef, providerCwd: string): LocalSecureWriteTarget {
  if (ref.kind !== "local-file") throw secureWriteSafetyError();
  const suppliedScope = ref[RESOURCE_SCOPE_ROOT];
  const scopePath = typeof suppliedScope === "string" && suppliedScope.length > 0
    ? suppliedScope
    : providerCwd;
  if (typeof scopePath !== "string" || !path.isAbsolute(scopePath)) throw secureWriteSafetyError();
  const lexicalRoot = path.resolve(scopePath);
  const rootPath = realOrResolved(lexicalRoot);
  const requestedPath = path.isAbsolute(ref.path)
    ? path.resolve(ref.path)
    : path.resolve(lexicalRoot, ref.path);
  const relative = relativeWithinRoot(lexicalRoot, requestedPath)
    ?? relativeWithinRoot(rootPath, requestedPath);
  if (relative === null || relative.length === 0) throw secureWriteSafetyError();
  const segments = relative.split(path.sep).filter(Boolean);
  if (segments.length === 0 || segments.some(segment => !isSecureWriteSegment(segment))) {
    throw secureWriteSafetyError();
  }
  return Object.freeze({
    rootPath,
    segments: Object.freeze(segments),
    filePath: path.join(rootPath, ...segments),
  });
}

function relativeWithinRoot(rootPath: string, candidatePath: string): string | null {
  const relative = path.relative(rootPath, candidatePath);
  if (
    relative === ".."
    || relative.startsWith(`..${path.sep}`)
    || path.isAbsolute(relative)
  ) {
    return null;
  }
  return relative;
}

function isSecureWriteSegment(value: string): boolean {
  return value.length > 0
    && value !== "."
    && value !== ".."
    && !value.includes("/")
    && !value.includes("\\")
    && !value.includes(":")
    && !containsSecureWriteControlCharacter(value)
    && !/[. ]$/u.test(value)
    && !/[<>"|?*]/u.test(value);
}

function containsSecureWriteControlCharacter(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code < 0x20 || code === 0x7f) return true;
  }
  return false;
}

function captureLocalSecureWriteProof(
  target: LocalSecureWriteTarget,
  activationRoot?: { device: string; inode: string; birthtimeNs: string },
): LocalSecureWritePreflight {
  let root: NativeFileIdentity;
  try {
    root = captureSecureWriteDirectory(target.rootPath);
  } catch (error) {
    const code = (error as NodeJS.ErrnoException)?.code;
    if (code === "ENOENT" || code === "ENOTDIR") throw secureWriteSafetyError();
    throw error;
  }
  if (activationRoot && !sameNativeFileIdentity(root, activationRoot)) {
    throw secureWriteSafetyError();
  }
  const ancestors: NativeFileIdentity[] = [];
  let parentPath = target.rootPath;
  for (const segment of target.segments.slice(0, -1)) {
    parentPath = path.join(parentPath, segment);
    try {
      ancestors.push(captureSecureWriteDirectory(parentPath));
    } catch (error) {
      const code = (error as NodeJS.ErrnoException)?.code;
      if (code === "ENOENT" || code === "ENOTDIR") {
        // Conditional writes never create pathname parents: doing so would
        // add an unbound, path-following mutation before the native proof.
        throw secureWriteSafetyError();
      }
      throw error;
    }
  }
  let final: NativeFileProof | null = null;
  let currentVersion: ResourceVersion | null = null;
  try {
    final = captureSecureWriteFile(target.filePath);
    currentVersion = resourceVersionFromNativeProof(final);
  } catch (error) {
    if ((error as NodeJS.ErrnoException)?.code !== "ENOENT") throw error;
  }
  return Object.freeze({
    proof: Object.freeze({
      rootPath: target.rootPath,
      segments: target.segments,
      root,
      ancestors: Object.freeze(ancestors),
      final,
    }),
    currentVersion,
  });
}

function captureSecureWriteDirectory(filePath: string): NativeFileIdentity {
  const stat = lstatForSecureWrite(filePath);
  if (!stat.isDirectory()) throw secureWriteSafetyError();
  return nativeIdentityFromStat(stat);
}

function captureSecureWriteFile(filePath: string): NativeFileProof {
  const stat = lstatForSecureWrite(filePath);
  if (!stat.isFile()) throw secureWriteSafetyError();
  if (stat.size > BigInt(Number.MAX_SAFE_INTEGER)) throw secureWriteSafetyError();
  return Object.freeze({
    identity: nativeIdentityFromStat(stat),
    mtimeNs: stat.mtimeNs.toString(),
    size: stat.size.toString(),
  });
}

function lstatForSecureWrite(filePath: string): fs.BigIntStats {
  const stat = fs.lstatSync(filePath, { bigint: true });
  if (stat.isSymbolicLink()) throw secureWriteSafetyError();
  return stat;
}

function nativeIdentityFromStat(stat: fs.BigIntStats): NativeFileIdentity {
  return Object.freeze({
    device: stat.dev.toString(),
    inode: stat.ino.toString(),
    birthtimeNs: stat.birthtimeNs.toString(),
  });
}

function resourceVersionFromNativeProof(proof: NativeFileProof): ResourceVersion {
  const mtimeMs = Number((BigInt(proof.mtimeNs) + 500_000n) / 1_000_000n);
  const size = Number(BigInt(proof.size));
  if (!Number.isSafeInteger(mtimeMs) || !Number.isSafeInteger(size)) throw secureWriteSafetyError();
  return Object.freeze({ mtimeMs, size });
}

function secureWriteSafetyError(): ResourceIOError {
  return new ResourceIOError("Secure conditional write rejected", {
    code: "resource_version_conflict",
    status: 409,
  });
}

function captureLocalPathIdentityProof(
  filePath: string,
  proofRoot: string,
): LocalPathIdentityProof {
  const normalized = path.resolve(filePath);
  const normalizedRoot = realOrResolved(proofRoot);
  const relativeToRoot = path.relative(normalizedRoot, normalized);
  const anchoredInsideRoot = relativeToRoot === ""
    || (!relativeToRoot.startsWith("..") && !path.isAbsolute(relativeToRoot));
  const anchor = anchoredInsideRoot ? normalizedRoot : path.dirname(normalized);
  const segments = path.relative(anchor, normalized).split(path.sep).filter(Boolean);
  const candidates = [anchor, ...segments.map((_, index) => (
    path.join(anchor, ...segments.slice(0, index + 1))
  ))];
  const entries: LocalPathIdentityEntry[] = [];
  let targetStat: fs.Stats | null = null;
  for (const [index, candidate] of candidates.entries()) {
    const stat = fs.lstatSync(candidate, { bigint: true });
    if (stat.isSymbolicLink()) {
      throw safeOpenReadError("symbolic_link_not_allowed", 400);
    }
    const isTarget = index === candidates.length - 1;
    if (!isTarget && !stat.isDirectory()) {
      const error = new Error("Resource path parent is not a directory") as NodeJS.ErrnoException;
      error.code = "ENOTDIR";
      throw error;
    }
    if (!stat.isDirectory() && !stat.isFile()) {
      throw safeOpenReadError("unsupported_file_kind", 400);
    }
    entries.push(Object.freeze({
      filePath: path.normalize(candidate),
      identity: Object.freeze({
        device: Number(stat.dev),
        inode: Number(stat.ino),
        birthtimeMs: Number(stat.birthtimeNs) / 1_000_000,
      }),
      nativeIdentity: nativeIdentityFromStat(stat),
      kind: stat.isDirectory() ? "directory" : "file",
      changeToken: [stat.ctimeNs, stat.mtimeNs, stat.size, stat.mode]
        .map(value => value.toString())
        .join(":"),
    }));
    if (isTarget) targetStat = fs.lstatSync(candidate);
  }
  if (!targetStat || entries.length === 0) {
    throw safeOpenReadError("resource_not_found", 404);
  }
  return Object.freeze({
    filePath: path.normalize(normalized),
    entries: Object.freeze(entries),
    targetIdentity: fileIdentity(targetStat),
    targetStat,
  });
}

function localReadProofRoot(
  ref: ResourceRef | unknown,
  filePath: string,
  providerCwd: string,
): string {
  const normalized = normalizeResourceRef(ref);
  const scopeRoot = normalized[RESOURCE_SCOPE_ROOT];
  if (typeof scopeRoot === "string" && scopeRoot.length > 0) {
    const root = realOrResolved(scopeRoot);
    const relative = path.relative(root, path.resolve(filePath));
    if (relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative))) {
      return root;
    }
    throw safeOpenReadError("resource_access_denied", 403);
  }
  return providerCwd;
}

function assertTrustedScopeContains(ref: ResourceRef, filePath: string): void {
  const scopeRoot = ref[RESOURCE_SCOPE_ROOT];
  if (typeof scopeRoot !== "string" || scopeRoot.length === 0) return;
  const root = realOrResolved(scopeRoot);
  const relative = path.relative(root, path.resolve(filePath));
  if (relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative))) return;
  throw resourceAccessDenied("scope", filePath, "trusted_scope_escape", {
    safeMessage: "Resource is outside authorized roots",
  });
}

function sameLocalPathIdentityProof(
  expected: LocalPathIdentityProof,
  current: LocalPathIdentityProof,
): boolean {
  return expected.filePath === current.filePath
    && expected.entries.length === current.entries.length
    && expected.entries.every((entry, index) => {
      const candidate = current.entries[index];
      return Boolean(
        candidate
        && entry.filePath === candidate.filePath
        && entry.kind === candidate.kind
        && entry.changeToken === candidate.changeToken
        && sameIdentity(entry.identity, candidate.identity)
        && sameNativeFileIdentity(entry.nativeIdentity, candidate.nativeIdentity),
      );
    });
}

function sameNativeFileIdentity(left: NativeFileIdentity, right: NativeFileIdentity): boolean {
  return left.device === right.device
    && left.inode === right.inode
    && left.birthtimeNs === right.birthtimeNs;
}

function sameIdentity(left: FileIdentity, right: FileIdentity): boolean {
  return left.device === right.device
    && left.inode === right.inode
    && left.birthtimeMs === right.birthtimeMs;
}

function localResourceReadProof(pathProof: LocalPathIdentityProof): ResourceReadProof {
  LOCAL_READ_PROOFS.add(pathProof);
  return Object.freeze({ providerId: "local_fs", value: pathProof });
}

function localPathProofFromResourceReadProof(
  proof: ResourceReadProof | undefined,
  filePath: string,
): LocalPathIdentityProof | null {
  if (proof === undefined) return null;
  const value = proof?.value;
  if (
    proof.providerId !== "local_fs"
    || !value
    || typeof value !== "object"
    || !LOCAL_READ_PROOFS.has(value)
    || (value as LocalPathIdentityProof).filePath !== path.normalize(path.resolve(filePath))
  ) {
    throw safeOpenReadError("resource_version_conflict", 409);
  }
  return value as LocalPathIdentityProof;
}

function attachResourceReadProof<T extends object>(
  result: T,
  proof: ResourceReadProof,
): T {
  Object.defineProperty(result, RESOURCE_READ_PROOF, {
    value: proof,
    enumerable: false,
    configurable: false,
    writable: false,
  });
  return result;
}

function versionFromStat(stat: fs.Stats): ResourceVersion {
  return {
    mtimeMs: stat.mtime.getTime(),
    size: stat.isDirectory() ? null : stat.size,
  };
}

function fileVersionsMatch(current: ResourceVersion, expected: ResourceVersion): boolean {
  if ("mtimeMs" in expected && current.mtimeMs !== expected.mtimeMs) return false;
  if ("size" in expected && current.size !== expected.size) return false;
  if ("sha256" in expected && current.sha256 !== expected.sha256) return false;
  if ("etag" in expected && current.etag !== expected.etag) return false;
  if ("sequence" in expected && current.sequence !== expected.sequence) return false;
  return true;
}

function assertMutationTargetVersion(
  filePath: string,
  expected: ResourceVersion | null | undefined,
  { missingAllowed = false }: { missingAllowed?: boolean } = {},
): void {
  if (expected === undefined) return;
  const current = versionFromLstatOrUndefined(filePath);
  if (expected === null) {
    if (current) throw transferTargetConflict();
    if (!missingAllowed) throw transferVersionConflict("target_missing");
    return;
  }
  if (!current) throw transferVersionConflict("target_missing");
  if (!fileVersionsMatch(current, expected)) {
    throw transferVersionConflict("target_changed");
  }
}

function normalizeTrashNamespace(value: string): string {
  const raw = String(value || "").trim();
  if (!raw || raw.includes("/") || raw.includes("\\") || raw === "." || raw === "..") {
    throw new ResourceIOError("invalid trash namespace", {
      code: "invalid_trash_namespace",
      status: 400,
    });
  }
  return raw;
}

function normalizeWatchEventPath(rootPath: string, changedPath: string, rootIsDirectory: boolean): string {
  if (!changedPath) return rootPath;
  const value = String(changedPath);
  if (path.isAbsolute(value)) return path.normalize(value);
  return rootIsDirectory ? path.join(rootPath, value) : rootPath;
}

function safeIsDirectory(targetPath: string): boolean {
  try {
    return fs.statSync(targetPath).isDirectory();
  } catch {
    return false;
  }
}

function realOrResolved(filePath: string): string {
  try {
    return path.normalize(fs.realpathSync(filePath));
  } catch {
    const parts: string[] = [];
    let current = path.resolve(filePath);
    while (true) {
      try {
        const real = fs.realpathSync(current);
        return path.join(path.normalize(real), ...parts.reverse());
      } catch {
        const parent = path.dirname(current);
        if (parent === current) return path.resolve(filePath);
        parts.push(path.basename(current));
        current = parent;
      }
    }
  }
}

function searchText(rootPath: string, query: string, guard: Guard | null) {
  const matches: { filePath: string; line: number; text: string }[] = [];
  const visit = (current: string) => {
    let stat: fs.Stats;
    try {
      stat = fs.lstatSync(current);
    } catch {
      return;
    }
    if (stat.isSymbolicLink()) return;
    if (stat.isDirectory()) {
      if (SEARCH_SKIP_DIRS.has(path.basename(current))) return;
      let entries: string[] = [];
      try {
        entries = fs.readdirSync(current);
      } catch {
        return;
      }
      for (const entry of entries) visit(path.join(current, entry));
      return;
    }
    if (!stat.isFile()) return;
    if (guard) {
      const allowed = guard.check(current, "read");
      if (!allowed.allowed) return;
    }
    const text = readSearchableLocalText(current, rootPath);
    if (text === null) return;
    text.split(/\r?\n/).forEach((line, index) => {
      if (line.includes(query)) matches.push({ filePath: current, line: index + 1, text: line });
    });
  };
  visit(rootPath);
  return matches.sort((a, b) => a.filePath.localeCompare(b.filePath) || a.line - b.line);
}

function searchNames(rootPath: string, query: string, guard: Guard | null, limit = 80) {
  const needle = query.toLowerCase();
  const max = Number.isFinite(limit) && Number(limit) > 0 ? Number(limit) : 80;
  const matches: {
    filePath: string;
    line: number;
    text: string;
    name: string;
    relativePath: string;
    parentSubdir: string;
    isDirectory: boolean;
    size: number | null;
    mtimeMs: number;
  }[] = [];
  const visit = (current: string) => {
    if (matches.length >= max) return;
    let entries: fs.Dirent[] = [];
    try {
      entries = fs.readdirSync(current, { withFileTypes: true });
    } catch {
      return;
    }
    entries.sort((a, b) => a.name.localeCompare(b.name));
    for (const entry of entries) {
      if (matches.length >= max) break;
      if (entry.name.startsWith(".")) continue;
      const fullPath = path.join(current, entry.name);
      let stat: fs.Stats;
      try {
        stat = fs.lstatSync(fullPath);
      } catch {
        continue;
      }
      if (stat.isSymbolicLink() || (!stat.isDirectory() && !stat.isFile())) continue;
      if (stat.isDirectory() && SEARCH_SKIP_DIRS.has(entry.name)) continue;
      if (guard) {
        const allowed = guard.check(fullPath, "read");
        if (!allowed.allowed) continue;
      }
      if (entry.name.toLowerCase().includes(needle)) {
        matches.push({
          filePath: fullPath,
          line: 0,
          text: entry.name,
          name: entry.name,
          relativePath: toSlashRelative(rootPath, fullPath),
          parentSubdir: toSlashRelative(rootPath, path.dirname(fullPath)),
          isDirectory: stat.isDirectory(),
          size: stat.isDirectory() ? null : stat.size,
          mtimeMs: stat.mtimeMs,
        });
      }
      if (stat.isDirectory()) visit(fullPath);
    }
  };
  visit(rootPath);
  return matches.slice(0, max);
}

/**
 * Search has to inspect text without retaining the old stat+readFileSync
 * escape hatch. Bind every candidate to its in-root ancestry, use no-follow
 * open, and prove that the path still names that same file after reading.
 */
function readSearchableLocalText(filePath: string, rootPath: string): string | null {
  let pathProof: LocalPathIdentityProof;
  try {
    pathProof = captureLocalPathIdentityProof(filePath, rootPath);
  } catch {
    return null;
  }
  if (!pathProof.targetStat.isFile()) return null;
  const noFollow = typeof fs.constants.O_NOFOLLOW === "number"
    ? fs.constants.O_NOFOLLOW
    : 0;
  let descriptor: number | null = null;
  try {
    descriptor = fs.openSync(filePath, fs.constants.O_RDONLY | noFollow);
    const opened = fs.fstatSync(descriptor);
    if (!opened.isFile() || !sameFileIdentity(pathProof.targetIdentity, opened)) {
      return null;
    }
    const text = fs.readFileSync(descriptor, "utf-8");
    const completed = fs.fstatSync(descriptor);
    const current = captureLocalPathIdentityProof(filePath, rootPath);
    if (
      !sameFileIdentity(pathProof.targetIdentity, completed)
      || !sameLocalPathIdentityProof(pathProof, current)
    ) {
      return null;
    }
    return text;
  } catch {
    return null;
  } finally {
    if (descriptor !== null) fs.closeSync(descriptor);
  }
}

function toSlashRelative(rootPath: string, filePath: string): string {
  return path.relative(rootPath, filePath).split(path.sep).filter(Boolean).join("/");
}

async function* chunkedLocalFileBody(
  filePath: string,
  expectedVersion: ResourceVersion,
  expectedIdentity: FileIdentity,
  revalidateScope: () => void,
  signal?: AbortSignal,
): AsyncIterable<Uint8Array> {
  throwIfTransferAborted(signal);
  revalidateScope();
  const noFollow = typeof fs.constants.O_NOFOLLOW === "number"
    ? fs.constants.O_NOFOLLOW
    : 0;
  let descriptor: number | null = null;
  try {
    descriptor = fs.openSync(filePath, fs.constants.O_RDONLY | noFollow);
  } catch (error) {
    const code = (error as NodeJS.ErrnoException)?.code;
    if (code === "ELOOP") {
      throw transferEntryUnsupported("source_changed_to_symbolic_link");
    }
    if (code === "ENOENT" || code === "ENOTDIR") {
      throw transferVersionConflict("source_missing_before_read");
    }
    if (code === "EACCES" || code === "EPERM") {
      throw resourceAccessDenied("read", filePath, "source_read_denied", {
        safeMessage: "Resource transfer source became unreadable",
      });
    }
    throw error;
  }
  try {
    const opened = fs.fstatSync(descriptor);
    if (
      !opened.isFile()
      || !sameFileIdentity(expectedIdentity, opened)
      || !fileVersionsEqual(versionFromStat(opened), expectedVersion)
    ) {
      throw transferVersionConflict("source_changed_before_read");
    }
    const buffer = Buffer.allocUnsafe(TRANSFER_MAX_CHUNK_BYTES);
    let position = 0;
    while (position < opened.size) {
      throwIfTransferAborted(signal);
      revalidateScope();
      const bytesRead = fs.readSync(
        descriptor,
        buffer,
        0,
        Math.min(buffer.byteLength, opened.size - position),
        position,
      );
      if (bytesRead <= 0) throw transferVersionConflict("source_truncated_during_read");
      position += bytesRead;
      revalidateScope();
      yield buffer.subarray(0, bytesRead);
    }
    const completed = fs.fstatSync(descriptor);
    revalidateScope();
    if (
      !sameFileIdentity(expectedIdentity, completed)
      || !fileVersionsEqual(versionFromStat(completed), expectedVersion)
    ) {
      throw transferVersionConflict("source_changed_during_read");
    }
  } finally {
    if (descriptor !== null) fs.closeSync(descriptor);
  }
}

function fileVersionsEqual(left: ResourceVersion, right: ResourceVersion): boolean {
  return left.mtimeMs === right.mtimeMs && left.size === right.size;
}

async function* openedLocalFileBody({
  descriptor,
  filePath,
  start,
  end,
  expectedIdentity,
  expectedVersion,
  revalidateScope,
}: {
  descriptor: number;
  filePath: string;
  start: number;
  end: number;
  expectedIdentity: FileIdentity;
  expectedVersion: ResourceVersion;
  revalidateScope: () => void;
}): AsyncIterable<Uint8Array> {
  try {
    if (expectedVersion.size === 0) return;
    let position = start;
    while (position <= end) {
      revalidateScope();
      const buffer = Buffer.allocUnsafe(
        Math.min(TRANSFER_MAX_CHUNK_BYTES, end - position + 1),
      );
      const bytesRead = fs.readSync(
        descriptor,
        buffer,
        0,
        buffer.byteLength,
        position,
      );
      if (bytesRead <= 0) throw safeOpenReadError("resource_changed_during_read", 409);
      position += bytesRead;
      revalidateScope();
      yield buffer.subarray(0, bytesRead);
    }
    const completed = fs.fstatSync(descriptor);
    const current = fs.statSync(filePath);
    revalidateScope();
    if (
      !sameFileIdentity(expectedIdentity, completed)
      || !sameFileIdentity(expectedIdentity, current)
      || !fileVersionsEqual(versionFromStat(completed), expectedVersion)
    ) {
      throw safeOpenReadError("resource_changed_during_read", 409);
    }
  } catch (error) {
    const code = (error as NodeJS.ErrnoException)?.code;
    if (code === "ENOENT" || code === "ENOTDIR") {
      throw safeOpenReadError("resource_not_found", 404);
    }
    if (code === "EACCES" || code === "EPERM") {
      throw safeOpenReadError("resource_access_denied", 403);
    }
    throw error;
  } finally {
    fs.closeSync(descriptor);
  }
}

function safeOpenReadError(code: string, status: number): ResourceIOError {
  const error: any = new ResourceIOError("Resource content unavailable", {
    code,
    status,
  });
  error.safeMessage = "Resource content unavailable";
  return error;
}

function assertPlatformTransferSegment(value: string): void {
  if (!isTransferNameSegment(value) || value.includes(path.sep)) {
    throw transferEntryUnsupported("invalid_target_name");
  }
  if (process.platform === "win32") {
    if (value.includes("\\") || /[<>:"|?*]/u.test(value) || /[. ]$/u.test(value)) {
      throw transferEntryUnsupported("invalid_target_name");
    }
    const stem = value.split(".")[0]?.toUpperCase();
    if (
      stem === "CON"
      || stem === "PRN"
      || stem === "AUX"
      || stem === "NUL"
      || /^COM[1-9]$/u.test(stem)
      || /^LPT[1-9]$/u.test(stem)
    ) {
      throw transferEntryUnsupported("invalid_target_name");
    }
  }
}

function normalizeExpectedTargetVersion(value: string | null | undefined): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== "string" || value.length === 0) {
    throw transferVersionConflict("invalid_expected_target_version");
  }
  return value;
}

function encodedCurrentTargetVersion(filePath: string): string | null {
  const current = versionFromLstatOrUndefined(filePath);
  return current ? encodeResourceTransferVersion(current) : null;
}

function assertExpectedTargetState(filePath: string, expected: string | null): void {
  const current = versionFromLstatOrUndefined(filePath);
  if (expected === null) {
    if (current) throw transferTargetConflict();
    return;
  }
  if (!current) throw transferVersionConflict("target_missing");
  if (encodeResourceTransferVersion(current) !== expected) {
    throw transferVersionConflict("target_changed");
  }
}

function stagingEntryPath(stagingRoot: string, segments: string[]): string {
  for (const segment of segments) assertPlatformTransferSegment(segment);
  const candidate = path.resolve(stagingRoot, ...segments);
  const relative = path.relative(path.resolve(stagingRoot), candidate);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw transferEntryUnsupported("entry_path_escapes_staging");
  }
  return candidate;
}

type StagedMergePolicy = NonNullable<ResourceImportTreeOptions["mergeExisting"]>;

function allocateStagedMergeEntry(
  stagingRoot: string,
  entry: ResourceExportEntry,
  mappedPaths: Map<string, string[]>,
  policy: StagedMergePolicy,
): { path: string; skip: boolean } {
  const sourceParent = entry.path.slice(0, -1);
  const mappedParent = mappedPaths.get(transferPathKey(sourceParent));
  if (!mappedParent) throw transferEntryUnsupported("merge_entry_parent_missing");
  const originalName = entry.path[entry.path.length - 1];
  const incomingDirectory = entry.kind === "directory";
  for (let attempt = 1; attempt <= 10_000; attempt += 1) {
    const name = mergeKeepBothName(originalName, attempt, incomingDirectory);
    const targetSegments = [...mappedParent, name];
    const targetPath = stagingEntryPath(stagingRoot, targetSegments);
    const current = lstatOrNull(targetPath);
    if (!current) {
      if (incomingDirectory) {
        mappedPaths.set(transferPathKey(entry.path), targetSegments);
      }
      return { path: targetPath, skip: false };
    }
    if (incomingDirectory && current.isDirectory()) {
      mappedPaths.set(transferPathKey(entry.path), targetSegments);
      return { path: targetPath, skip: false };
    }
    if (incomingDirectory !== current.isDirectory()) continue;
    if (policy === "skip") return { path: targetPath, skip: true };
    if (policy === "replace") return { path: targetPath, skip: false };
  }
  throw transferTargetConflict();
}

function transferPathKey(segments: readonly string[]): string {
  return segments.join("\0");
}

function mergeKeepBothName(
  originalName: string,
  attempt: number,
  directory: boolean,
): string {
  if (attempt === 1) return originalName;
  if (directory) return `${originalName}_${attempt}`;
  const dot = originalName.lastIndexOf(".");
  return dot > 0
    ? `${originalName.slice(0, dot)}_${attempt}${originalName.slice(dot)}`
    : `${originalName}_${attempt}`;
}

function removeStagedMergeReplacement(
  targetPath: string,
  policy: StagedMergePolicy | undefined,
): void {
  if (policy !== "replace" || !lstatOrNull(targetPath)) return;
  fs.rmSync(targetPath, { recursive: true, force: false });
}

function lstatOrNull(filePath: string): fs.Stats | null {
  try {
    return fs.lstatSync(filePath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

function directoryTreeFingerprint(rootPath: string): string {
  const hash = crypto.createHash("sha256");
  const visit = (currentPath: string, relativePath: string) => {
    const stat = fs.lstatSync(currentPath, { bigint: true });
    const kind = stat.isDirectory()
      ? "directory"
      : stat.isFile()
      ? "file"
      : stat.isSymbolicLink()
      ? "symbolic_link"
      : "unsupported";
    hash.update(JSON.stringify([
      relativePath,
      kind,
      stat.dev.toString(),
      stat.ino.toString(),
      stat.mode.toString(),
      stat.size.toString(),
      stat.mtimeNs.toString(),
      stat.ctimeNs.toString(),
      stat.birthtimeNs.toString(),
      stat.isSymbolicLink() ? fs.readlinkSync(currentPath) : null,
    ]));
    hash.update("\n");
    if (!stat.isDirectory()) return;
    for (const name of fs.readdirSync(currentPath).sort()) {
      visit(path.join(currentPath, name), relativePath ? `${relativePath}/${name}` : name);
    }
  };
  visit(rootPath, "");
  return hash.digest("hex");
}

function directoryTreePublicationFingerprint(rootPath: string): string {
  const hash = crypto.createHash("sha256");
  const visit = (currentPath: string, relativePath: string) => {
    const stat = fs.lstatSync(currentPath, { bigint: true });
    const kind = stat.isDirectory()
      ? "directory"
      : stat.isFile()
      ? "file"
      : stat.isSymbolicLink()
      ? "symbolic_link"
      : "unsupported";
    hash.update(JSON.stringify([
      relativePath,
      kind,
      stat.dev.toString(),
      stat.ino.toString(),
      stat.mode.toString(),
      stat.size.toString(),
      stat.mtimeNs.toString(),
      stat.birthtimeNs.toString(),
      stat.isSymbolicLink() ? fs.readlinkSync(currentPath) : null,
    ]));
    hash.update("\n");
    if (!stat.isDirectory()) return;
    for (const name of fs.readdirSync(currentPath).sort()) {
      visit(
        path.join(currentPath, name),
        relativePath ? `${relativePath}/${name}` : name,
      );
    }
  };
  visit(rootPath, "");
  return hash.digest("hex");
}

async function writeStagedFile(
  filePath: string,
  body: AsyncIterable<Uint8Array>,
  expectedSize: number,
  signal?: AbortSignal,
): Promise<number> {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const handle = await fs.promises.open(filePath, "wx", 0o600);
  let written = 0;
  try {
    // FileHandle.writeFile consumes AsyncIterable input incrementally. Keeping
    // the stream in this form avoids materialising an upload in the main
    // process and lets Node use its native sequential-write path instead of a
    // JS-level positioned write for every chunk (notably expensive on Windows).
    const streamWriter = handle as unknown as {
      writeFile(input: AsyncIterable<Uint8Array>): Promise<void>;
    };
    await streamWriter.writeFile((async function* checkedChunks() {
      for await (const chunk of body) {
        throwIfTransferAborted(signal);
        if (!(chunk instanceof Uint8Array) || chunk.byteLength > TRANSFER_MAX_CHUNK_BYTES) {
          throw transferEntryUnsupported("invalid_file_chunk");
        }
        written += chunk.byteLength;
        if (written > expectedSize) {
          throw transferVersionConflict("source_size_increased");
        }
        yield chunk;
      }
    })());
    if (written !== expectedSize) throw transferVersionConflict("source_size_changed");
    await handle.sync();
    return written;
  } finally {
    await handle.close();
  }
}

function createStagedSymbolicLink(linkTarget: string, filePath: string): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  try {
    fs.symlinkSync(linkTarget, filePath);
  } catch (error) {
    const code = (error as NodeJS.ErrnoException)?.code;
    if (code === "EPERM" || code === "EACCES" || code === "ENOTSUP" || code === "EINVAL") {
      throw transferEntryUnsupported("symbolic_link_creation_unsupported");
    }
    throw error;
  }
}

function publishStagedTree(
  stagingPath: string,
  finalPath: string,
  expected: string | null,
  revalidateScope: () => void,
): void {
  revalidateScope();
  assertExpectedTargetState(finalPath, expected);
  const staged = fs.lstatSync(stagingPath);
  if (expected === null) {
    if (!staged.isDirectory()) {
      try {
        // link(2)/symlink(2) 都是单次 no-replace 提交：并发创建
        // finalPath 时返回 EEXIST，不会像 rename 那样覆盖竞争者的数据。
        if (staged.isSymbolicLink()) {
          fs.symlinkSync(fs.readlinkSync(stagingPath), finalPath);
        } else {
          fs.linkSync(stagingPath, finalPath);
        }
        fs.unlinkSync(stagingPath);
      } catch (error) {
        const code = (error as NodeJS.ErrnoException)?.code;
        if (code === "EEXIST") throw transferTargetConflict();
        if (code === "EPERM" || code === "EACCES" || code === "ENOTSUP") {
          throw transferEntryUnsupported("atomic_file_publish_unsupported");
        }
        throw error;
      }
      return;
    }
    try {
      // 目录只能由同文件系统 rename 一次发布。竞争者若创建了非空目录或
      // 其他类型，底层必须拒绝；不做 remove/backup 降级。
      fs.renameSync(stagingPath, finalPath);
    } catch (error) {
      const code = (error as NodeJS.ErrnoException)?.code;
      if (
        code === "EEXIST"
        || code === "ENOTEMPTY"
        || code === "EISDIR"
        || code === "ENOTDIR"
      ) {
        throw transferTargetConflict();
      }
      throw error;
    }
    return;
  }
  const current = fs.lstatSync(finalPath);
  if (current.isDirectory() || staged.isDirectory()) {
    throw transferEntryUnsupported("atomic_directory_replacement_unsupported");
  }
  // 文件/链接由底层 rename 的 replace 语义一次提交；若目标平台不能原子
  // 替换，rename 失败且正式目标保持原样，不使用“两次 rename”降级。
  try {
    fs.renameSync(stagingPath, finalPath);
  } catch (error) {
    const code = (error as NodeJS.ErrnoException)?.code;
    if (code === "EEXIST" || code === "EPERM" || code === "EACCES") {
      throw transferEntryUnsupported("atomic_file_replacement_unsupported");
    }
    throw error;
  }
}

type TransferPublicationReceipt = Readonly<{
  schemaVersion: 1;
  operationId: string;
  expectedTargetVersion: string;
  stagedFingerprint: string;
}>;

function transferPublicationArtifacts(directoryPath: string, operationId: string) {
  if (!isOperationCorrelationId(operationId)) {
    throw transferEntryUnsupported("invalid_transfer_operation_id");
  }
  return Object.freeze({
    stagingPath: path.join(directoryPath, `.hana-transfer-staging-${operationId}`),
    backupPath: path.join(directoryPath, `.hana-transfer-backup-${operationId}`),
    receiptPath: path.join(directoryPath, `.hana-transfer-receipt-${operationId}.json`),
  });
}

function writeTransferPublicationReceipt(
  receiptPath: string,
  receipt: TransferPublicationReceipt,
): void {
  let descriptor: number | null = null;
  try {
    descriptor = fs.openSync(
      receiptPath,
      fs.constants.O_CREAT | fs.constants.O_EXCL | fs.constants.O_WRONLY,
      0o600,
    );
    fs.writeFileSync(descriptor, `${JSON.stringify(receipt)}\n`, "utf8");
    fs.fsyncSync(descriptor);
  } finally {
    if (descriptor !== null) fs.closeSync(descriptor);
  }
}

function readTransferPublicationReceipt(
  receiptPath: string,
): TransferPublicationReceipt {
  let value: unknown;
  try {
    value = JSON.parse(fs.readFileSync(receiptPath, "utf8"));
  } catch {
    throw transferVersionConflict("merge_recovery_receipt_unreadable");
  }
  if (
    typeof value !== "object"
    || value === null
    || Array.isArray(value)
    || Object.keys(value).some((field) => ![
      "schemaVersion",
      "operationId",
      "expectedTargetVersion",
      "stagedFingerprint",
    ].includes(field))
    || (value as { schemaVersion?: unknown }).schemaVersion !== 1
    || !isOperationCorrelationId((value as { operationId?: unknown }).operationId)
    || typeof (value as { expectedTargetVersion?: unknown }).expectedTargetVersion !== "string"
    || !/^[a-f0-9]{64}$/u.test(String(
      (value as { stagedFingerprint?: unknown }).stagedFingerprint,
    ))
  ) {
    throw transferVersionConflict("merge_recovery_receipt_invalid");
  }
  return Object.freeze(value as TransferPublicationReceipt);
}

function publishStagedMergedDirectory(
  stagingPath: string,
  finalPath: string,
  expected: string,
  operationId: string,
  revalidateScope: () => void,
  faultInjector: NonNullable<LocalFsProviderOptions["transferFaultInjector"]>,
): void {
  revalidateScope();
  assertExpectedTargetState(finalPath, expected);
  if (!fs.lstatSync(stagingPath).isDirectory() || !fs.lstatSync(finalPath).isDirectory()) {
    throw transferEntryUnsupported("merge_requires_directories");
  }
  const artifacts = transferPublicationArtifacts(path.dirname(finalPath), operationId);
  const { backupPath, receiptPath } = artifacts;
  if (lstatOrNull(backupPath)) {
    throw transferVersionConflict("merge_backup_already_exists");
  }
  writeTransferPublicationReceipt(receiptPath, {
    schemaVersion: 1,
    operationId,
    expectedTargetVersion: expected,
    stagedFingerprint: directoryTreePublicationFingerprint(stagingPath),
  });
  fs.renameSync(finalPath, backupPath);
  faultInjector("after_merge_backup_rename", { operationId });
  try {
    fs.renameSync(stagingPath, finalPath);
  } catch (error) {
    try {
      fs.renameSync(backupPath, finalPath);
      fs.rmSync(receiptPath, { force: true });
    } catch {
      throw transferVersionConflict("merge_publish_rollback_failed");
    }
    throw error;
  }
  try {
    fs.rmSync(backupPath, { recursive: true, force: false });
  } catch {
    // The merged tree is already published. A durable operation journal can
    // retry cleanup without changing the user-visible target.
  }
  if (!lstatOrNull(backupPath)) fs.rmSync(receiptPath, { force: true });
}

function versionFromLstatOrUndefined(filePath: string): ResourceVersion | undefined {
  try {
    return versionFromStat(fs.lstatSync(filePath));
  } catch (error) {
    if ((error as NodeJS.ErrnoException)?.code === "ENOENT") return undefined;
    throw error;
  }
}

function fsyncDirectoryBestEffort(directoryPath: string): void {
  let descriptor: number | null = null;
  try {
    descriptor = fs.openSync(directoryPath, fs.constants.O_RDONLY);
    fs.fsyncSync(descriptor);
  } catch {
    // Windows and some network filesystems do not allow opening directories.
  } finally {
    if (descriptor !== null) fs.closeSync(descriptor);
  }
}

type DirectoryIdentity = {
  realPath: string;
  device: number;
  inode: number;
  birthtimeMs: number;
};

type FileIdentity = {
  device: number;
  inode: number;
  birthtimeMs: number;
};

function fileIdentity(stat: fs.Stats): FileIdentity {
  return {
    device: stat.dev,
    inode: stat.ino,
    birthtimeMs: stat.birthtimeMs,
  };
}

function sameFileIdentity(expected: FileIdentity, stat: fs.Stats): boolean {
  return stat.dev === expected.device
    && stat.ino === expected.inode
    && stat.birthtimeMs === expected.birthtimeMs;
}

function directoryIdentity(directoryPath: string, stat = fs.statSync(directoryPath)): DirectoryIdentity {
  return {
    realPath: path.normalize(fs.realpathSync(directoryPath)),
    device: stat.dev,
    inode: stat.ino,
    birthtimeMs: stat.birthtimeMs,
  };
}

function sameDirectoryIdentity(expected: DirectoryIdentity, directoryPath: string): boolean {
  try {
    const current = directoryIdentity(directoryPath);
    return current.realPath === expected.realPath
      && current.device === expected.device
      && current.inode === expected.inode
      && current.birthtimeMs === expected.birthtimeMs;
  } catch {
    return false;
  }
}

function cleanupStagingTree(
  targetDirectoryIdentity: DirectoryIdentity,
  originalDirectoryPath: string,
  stagingName: string,
  searchRoot: string,
): void {
  if (sameDirectoryIdentity(targetDirectoryIdentity, originalDirectoryPath)) {
    fs.rmSync(path.join(originalDirectoryPath, stagingName), {
      recursive: true,
      force: true,
      maxRetries: 3,
      retryDelay: 25,
    });
    return;
  }

  // 原目录可能被移动到 provider root 内的另一父目录。进行与 transfer
  // 计划相同上限的 no-follow 身份搜索，只对精确 inode 下的随机 staging
  // 执行删除，避免用已失效的字符串路径触碰替换目录。
  const movedDirectory = findDirectoryByIdentity(
    searchRoot,
    targetDirectoryIdentity,
  );
  if (!movedDirectory) return;
  fs.rmSync(path.join(movedDirectory, stagingName), {
    recursive: true,
    force: true,
    maxRetries: 3,
    retryDelay: 25,
  });
}

function cleanupSearchRoot(providerCwd: string): string {
  const resolvedCwd = path.resolve(providerCwd);
  // 清理遍历绝不越出 provider scope；若 mount root 本身被移出该 scope，
  // 不能通过枚举其父目录来追踪它。
  return resolvedCwd;
}

function findDirectoryByIdentity(
  searchRoot: string,
  expected: DirectoryIdentity,
): string | null {
  const pending: Array<{ directoryPath: string; depth: number }> = [
    { directoryPath: searchRoot, depth: 0 },
  ];
  let cursor = 0;
  let scheduled = 1;
  let visited = 0;
  while (cursor < pending.length && visited < TRANSFER_MAX_ENTRIES) {
    const current = pending[cursor]!;
    cursor += 1;
    if (current.depth > TRANSFER_MAX_DEPTH) continue;
    let stat: fs.Stats | null = null;
    try {
      stat = fs.lstatSync(current.directoryPath);
    } catch {
      continue;
    }
    visited += 1;
    if (!stat.isDirectory() || stat.isSymbolicLink()) continue;
    if (
      stat.dev === expected.device
      && stat.ino === expected.inode
      && stat.birthtimeMs === expected.birthtimeMs
    ) {
      return current.directoryPath;
    }
    let names: string[] = [];
    try {
      names = fs.readdirSync(current.directoryPath).sort();
    } catch {
      continue;
    }
    for (const name of names) {
      if (scheduled >= TRANSFER_MAX_ENTRIES) break;
      pending.push({
        directoryPath: path.join(current.directoryPath, name),
        depth: current.depth + 1,
      });
      scheduled += 1;
    }
  }
  return null;
}
