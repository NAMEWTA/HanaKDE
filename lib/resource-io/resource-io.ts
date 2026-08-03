import type { ResourceEventBus } from "./resource-event-bus.ts";
import { isOperationCorrelationId } from "../../shared/knowledge-diagnostics.ts";
import {
  capabilityDenied,
  crossProviderCopyUnsupported,
  crossProviderMoveUnsupported,
  providerNotAvailable,
  ResourceIOError,
} from "./errors.ts";
import { childResourceRef, normalizeResourceRef, providerIdForResourceRef } from "./resource-refs.ts";
import {
  TransferPlanTracker,
  encodeResourceTransferVersion,
  guardedTransferEntries,
  isTransferNameSegment,
  processTransferBudget,
  transferEntryUnsupported,
} from "./transfer.ts";
import type {
  MaterializeResult,
  ResourceAuditSink,
  ResourceDescriptor,
  ResourceDeletedEvent,
  ResourceEdit,
  ResourceListResult,
  ResourceMutationResult,
  ResourceMoveResult,
  ResourceOperationContext,
  ResourceProvider,
  ResourceProviderCapability,
  ResourceProviderId,
  ProviderRootIdentity,
  ResourceOpenReadOptions,
  ResourceOpenReadResult,
  ResourceReadResult,
  ResourceRef,
  ResourceSearchResult,
  ResourceStat,
  ResourceTrashOptions,
  ResourceTrashResult,
  ResourceTransferRequest,
  ResourceTransferResult,
  ResourceVersion,
  ResourceWriteConflictResult,
  ResourceWriteExpectedVersionResult,
} from "./types.ts";

type ResourceIOOptions = {
  providers: Record<string, ResourceProvider>;
  eventBus?: ResourceEventBus | null;
  audit?: ResourceAuditSink | null;
  getSessionPath?: () => string | null;
};

type AuditResourceResult = {
  resourceKey: string;
  resource: ResourceDescriptor;
};

export class ResourceIO {
  declare providers: Record<string, ResourceProvider>;
  declare eventBus: ResourceEventBus | null;
  declare audit: ResourceAuditSink | null;
  declare getSessionPath: () => string | null;

  constructor({ providers, eventBus = null, audit = null, getSessionPath = () => null }: ResourceIOOptions) {
    this.providers = providers || {};
    this.eventBus = eventBus;
    this.audit = audit;
    this.getSessionPath = getSessionPath;
  }

  async stat(input: unknown, options: ResourceOperationContext = {}): Promise<ResourceStat> {
    const ref = normalizeResourceRef(input);
    const result = await this.callProvider<ResourceStat>(ref, "stat", options, ref);
    if (options.auditRead) this.auditAllowed("stat", result, options);
    return result;
  }

  async read(input: unknown, options: ResourceOperationContext = {}): Promise<ResourceReadResult> {
    const ref = normalizeResourceRef(input);
    const result = await this.callProvider<ResourceReadResult>(ref, "read", options, ref);
    if (options.auditRead) this.auditAllowed("read", result, options);
    return result;
  }

  async openRead(
    input: unknown,
    readOptions: ResourceOpenReadOptions = {},
    options: ResourceOperationContext = {},
  ): Promise<ResourceOpenReadResult> {
    const ref = normalizeResourceRef(input);
    const result = await this.callProvider<ResourceOpenReadResult>(
      ref,
      "openRead",
      options,
      ref,
      readOptions,
    );
    if (options.auditRead) this.auditAllowed("openRead", result, options);
    return result;
  }

  async write(input: unknown, content: string | Buffer, options: ResourceOperationContext = {}): Promise<ResourceMutationResult> {
    const ref = normalizeResourceRef(input);
    const result = await this.callProvider<ResourceMutationResult>(ref, "write", options, ref, content);
    this.auditAllowed("write", result, options);
    this.emitChanged(result, options);
    return result;
  }

  async writeExpectedVersion(input: unknown, content: string | Buffer, expectedVersion: ResourceVersion | null, options: ResourceOperationContext = {}): Promise<ResourceWriteExpectedVersionResult> {
    const ref = normalizeResourceRef(input);
    const result = await this.callProvider<ResourceWriteExpectedVersionResult>(ref, "writeExpectedVersion", options, ref, content, expectedVersion);
    if (isWriteConflict(result)) {
      this.auditConflict("writeExpectedVersion", result, options);
    } else {
      this.auditAllowed("writeExpectedVersion", result, options);
      this.emitChanged(result, options);
    }
    return result;
  }

  async edit(input: unknown, edits: ResourceEdit[], options: ResourceOperationContext = {}): Promise<ResourceMutationResult> {
    const ref = normalizeResourceRef(input);
    const result = await this.callProvider<ResourceMutationResult>(ref, "edit", options, ref, edits);
    this.auditAllowed("edit", result, options);
    this.emitChanged(result, options);
    return result;
  }

  async mkdir(input: unknown, options: ResourceOperationContext = {}): Promise<ResourceMutationResult> {
    const ref = normalizeResourceRef(input);
    const result = await this.callProvider<ResourceMutationResult>(
      ref,
      "mkdir",
      options,
      ref,
      mutationPreconditions(options),
    );
    this.auditAllowed("mkdir", result, options);
    this.emitChanged(result, options);
    return result;
  }

  async delete(input: unknown, options: ResourceOperationContext = {}): Promise<ResourceMutationResult> {
    const ref = normalizeResourceRef(input);
    const result = await this.callProvider<ResourceMutationResult>(
      ref,
      "delete",
      options,
      ref,
      mutationPreconditions(options),
    );
    this.auditAllowed("delete", result, options);
    if (options.emit !== false && this.eventBus) {
      this.eventBus.deleted({
        resourceKey: result.resourceKey,
        resource: result.resource,
        source: options.source || "api",
        sessionPath: options.sessionPath ?? this.getSessionPath?.() ?? null,
        ...operationCorrelation(options),
      } satisfies Omit<ResourceDeletedEvent, "type" | "sequence" | "occurredAt">);
    }
    return result;
  }

  async list(input: unknown, options: ResourceOperationContext = {}): Promise<ResourceListResult> {
    const ref = normalizeResourceRef(input);
    const result = await this.callProvider<ResourceListResult>(ref, "list", options, ref);
    if (options.auditRead) this.auditAllowed("list", result, options);
    return result;
  }

  async search(input: unknown, options: Record<string, unknown> = {}, context: ResourceOperationContext = {}): Promise<ResourceSearchResult> {
    const ref = normalizeResourceRef(input);
    const result = await this.callProvider<ResourceSearchResult>(ref, "search", context, ref, options);
    if (context.auditRead) this.auditAllowed("search", result, context);
    return result;
  }

  async materialize(input: unknown, options: ResourceOperationContext = {}): Promise<MaterializeResult> {
    const ref = normalizeResourceRef(input);
    const result = await this.callProvider<MaterializeResult>(ref, "materialize", options, ref);
    if (options.auditRead) this.auditAllowed("materialize", result, options);
    return result;
  }

  resolveWatchTarget(input: unknown, options: ResourceOperationContext = {}) {
    const ref = normalizeResourceRef(input);
    const provider = this.providerFor(ref);
    const capabilities = provider.capabilities?.(ref) || {};
    if (capabilities.watch === false || typeof provider.watchTarget !== "function") {
      const err = capabilityDenied("watch", providerIdForResourceRef(ref));
      this.auditDenied("watch", providerIdForResourceRef(ref), options, err);
      throw err;
    }
    return provider.watchTarget(ref);
  }

  async copy(from: unknown, to: unknown, options: ResourceOperationContext = {}): Promise<ResourceMutationResult> {
    const fromRef = normalizeResourceRef(from);
    const toRef = normalizeResourceRef(to);
    if (fromRef.kind !== toRef.kind) {
      throw crossProviderCopyUnsupported(providerIdForResourceRef(fromRef), providerIdForResourceRef(toRef));
    }
    const result = await this.callProvider<ResourceMutationResult>(
      toRef,
      "copy",
      options,
      fromRef,
      toRef,
      mutationPreconditions(options),
    );
    this.auditAllowed("copy", result, options);
    this.emitChanged(result, options);
    return result;
  }

  async transfer(
    input: ResourceTransferRequest | unknown,
    options: ResourceOperationContext = {},
  ): Promise<ResourceTransferResult> {
    const request = normalizeTransferRequest(input);
    const context = { ...options, operationId: request.operationId };
    const sourceProviderId = providerIdForResourceRef(request.source);
    const targetProviderId = providerIdForResourceRef(request.targetDirectory);
    const sourceProvider = this.providerFor(request.source);
    const targetProvider = this.providerFor(request.targetDirectory);
    const target = childResourceRef(request.targetDirectory, request.targetName);
    if (!target) throw transferEntryUnsupported("unsupported_target_address");
    const transferAbort = createTransferAbort(request.signal);

    try {
      assertTransferProviderCapability(
        sourceProvider,
        request.source,
        "exportTree",
        sourceProviderId,
      );
      assertTransferProviderCapability(
        targetProvider,
        request.targetDirectory,
        "importTree",
        targetProviderId,
      );
      let revalidateSourceScope: (() => void | Promise<void>) | null = null;
      const exported = sourceProvider.exportTree!(request.source, {
        signal: transferAbort.signal,
        registerScopeRevalidator: (revalidate) => {
          revalidateSourceScope = revalidate;
        },
      });
      const entries = guardedTransferEntries(
        exported,
        new TransferPlanTracker(),
        processTransferBudget,
        transferAbort.signal,
      );
      const result = await targetProvider.importTreeAtomically!(
        request.targetDirectory,
        request.targetName,
        entries,
        {
          signal: transferAbort.signal,
          expectedTargetVersion: request.expectedTargetVersion,
          replaceExisting: request.replaceExisting,
          operationId: request.operationId,
          abortTransfer: transferAbort.abort,
          revalidateSourceScope: async () => {
            if (revalidateSourceScope) await revalidateSourceScope();
          },
        },
      );
      this.recordAudit({
        outcome: "allowed",
        operation: "transfer",
        providerId: targetProviderId,
        ...transferAuditContext(context),
      });
      this.emitChanged(result, context);
      return {
        target,
        version: encodeResourceTransferVersion(result.version),
        bytesTransferred: result.bytesTransferred,
      };
    } catch (error) {
      const safeError = normalizeTransferError(error);
      transferAbort.abort();
      this.recordAudit({
        outcome: transferErrorOutcome(safeError),
        operation: "transfer",
        providerId: targetProviderId,
        code: errorCode(safeError),
        safeMessage: "Resource transfer failed",
        ...transferAuditContext(context),
      });
      throw safeError;
    } finally {
      transferAbort.dispose();
    }
  }

  async rename(from: unknown, to: unknown, options: ResourceOperationContext = {}): Promise<ResourceMoveResult> {
    return this.moveLike("rename", from, to, options);
  }

  async move(from: unknown, to: unknown, options: ResourceOperationContext = {}): Promise<ResourceMoveResult> {
    return this.moveLike("move", from, to, options);
  }

  async trash(input: unknown, trashOptions: ResourceTrashOptions = {}, options: ResourceOperationContext = {}): Promise<ResourceTrashResult> {
    const ref = normalizeResourceRef(input);
    const result = await this.callProvider<ResourceTrashResult>(ref, "trash", options, ref, trashOptions);
    this.auditAllowed("trash", result, options);
    this.emitDeletedResult(result, options);
    return result;
  }

  async moveLike(capability: "rename" | "move", from: unknown, to: unknown, options: ResourceOperationContext = {}): Promise<ResourceMoveResult> {
    const fromRef = normalizeResourceRef(from);
    const toRef = normalizeResourceRef(to);
    if (providerIdForResourceRef(fromRef) !== providerIdForResourceRef(toRef)) {
      throw crossProviderMoveUnsupported(providerIdForResourceRef(fromRef), providerIdForResourceRef(toRef));
    }
    const result = await this.callProvider<ResourceMoveResult>(
      toRef,
      capability,
      options,
      fromRef,
      toRef,
      {
        expectedSourceVersion: options.expectedSourceVersion,
        expectedTargetVersion: options.expectedTargetVersion,
      },
    );
    this.auditAllowed(capability, {
      resourceKey: result.newResourceKey,
      resource: result.newResource,
    }, options);
    this.emitRenamed(result, options);
    return result;
  }

  providerFor(ref: ResourceRef): ResourceProvider {
    const id = providerIdForResourceRef(ref);
    const provider = this.providers[id];
    if (!provider) throw providerNotAvailable(id);
    return provider;
  }

  capabilitiesFor(input: unknown) {
    const ref = normalizeResourceRef(input);
    const provider = this.providerFor(ref);
    return provider.capabilities?.(ref) || {};
  }

  async getRootIdentity(
    input: unknown,
    options: ResourceOperationContext = {},
  ): Promise<ProviderRootIdentity> {
    const ref = normalizeResourceRef(input);
    const provider = this.providerFor(ref);
    if (typeof provider.getRootIdentity !== "function") {
      const error: any = new Error("provider root identity is unavailable");
      error.code = "source_root_identity_unprovable";
      error.status = 422;
      throw error;
    }
    return provider.getRootIdentity(ref, options);
  }

  async callProvider<T>(ref: ResourceRef, capability: ResourceProviderCapability, context: ResourceOperationContext, ...args: unknown[]): Promise<T> {
    const providerId = providerIdForResourceRef(ref);
    const provider = this.providers[providerId];
    if (!provider) {
      const err = providerNotAvailable(providerId);
      this.auditDenied(capability, providerId, context, err);
      throw err;
    }
    const capabilities = provider.capabilities?.(ref) || {};
    if (capabilities[capability] === false || typeof provider[capability] !== "function") {
      const err = capabilityDenied(String(capability), providerId);
      this.auditDenied(capability, providerId, context, err);
      throw err;
    }
    try {
      return await (provider[capability] as (...args: unknown[]) => Promise<T>)(...args);
    } catch (err) {
      if (isDeniedProviderError(err)) {
        this.auditDenied(capability, providerId, context, err);
      }
      throw err;
    }
  }

  emitChanged(result: ResourceMutationResult, options: ResourceOperationContext): void {
    if (options.emit === false || !this.eventBus) return;
    this.eventBus.changed({
      changeType: result.changeType,
      resourceKey: result.resourceKey,
      resource: result.resource,
      ...(result.version ? { version: result.version } : {}),
      source: options.source || "api",
      reason: options.reason,
      sessionPath: options.sessionPath ?? this.getSessionPath?.() ?? null,
      ...operationCorrelation(options),
    });
  }

  emitDeletedResult(result: ResourceTrashResult | ResourceMutationResult, options: ResourceOperationContext): void {
    if (options.emit === false || !this.eventBus) return;
    this.eventBus.deleted({
      resourceKey: result.resourceKey,
      resource: result.resource,
      source: options.source || "api",
      reason: options.reason,
      sessionPath: options.sessionPath ?? this.getSessionPath?.() ?? null,
      ...operationCorrelation(options),
    } as any);
  }

  emitRenamed(result: ResourceMoveResult, options: ResourceOperationContext): void {
    if (options.emit === false || !this.eventBus) return;
    this.eventBus.renamed({
      oldResourceKey: result.oldResourceKey,
      newResourceKey: result.newResourceKey,
      oldResource: result.oldResource,
      newResource: result.newResource,
      source: options.source || "api",
      reason: options.reason,
      sessionPath: options.sessionPath ?? this.getSessionPath?.() ?? null,
      ...operationCorrelation(options),
    } as any);
  }

  auditAllowed(operation: ResourceProviderCapability, result: AuditResourceResult, context: ResourceOperationContext): void {
    this.recordAudit({
      outcome: "allowed",
      operation,
      providerId: providerIdForResourceRef(result.resource),
      resourceKey: result.resourceKey,
      resource: result.resource,
      ...auditContext(context, this.getSessionPath),
    });
  }

  auditConflict(operation: ResourceProviderCapability, result: ResourceWriteConflictResult, context: ResourceOperationContext): void {
    this.recordAudit({
      outcome: "conflict",
      operation,
      providerId: providerIdForResourceRef(result.resource),
      resourceKey: result.resourceKey,
      resource: result.resource,
      safeMessage: "Resource write conflict",
      ...auditContext(context, this.getSessionPath),
    });
  }

  auditDenied(operation: ResourceProviderCapability, providerId: ResourceProviderId, context: ResourceOperationContext, err: unknown): void {
    this.recordAudit({
      outcome: "denied",
      operation,
      providerId,
      code: errorCode(err),
      safeMessage: safeDeniedMessage(operation, providerId, err),
      ...auditContext(context, this.getSessionPath),
    });
  }

  recordAudit(event: Parameters<ResourceAuditSink["record"]>[0]): void {
    if (!this.audit || typeof this.audit.record !== "function") return;
    this.audit.record(event);
  }
}

function normalizeTransferRequest(input: ResourceTransferRequest | unknown): ResourceTransferRequest {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw transferEntryUnsupported("invalid_transfer_request");
  }
  const value = input as Partial<ResourceTransferRequest>;
  const source = normalizeResourceRef(value.source);
  const targetDirectory = normalizeResourceRef(value.targetDirectory);
  if (!isTransferNameSegment(value.targetName)) {
    throw transferEntryUnsupported("invalid_target_name");
  }
  if (targetDirectory.kind === "mount" && value.targetName.includes("\\")) {
    throw transferEntryUnsupported("target_provider_cannot_address_name");
  }
  if (!isOperationCorrelationId(value.operationId)) {
    throw transferEntryUnsupported("invalid_operation_id");
  }
  if (
    value.expectedTargetVersion !== undefined
    && value.expectedTargetVersion !== null
    && (typeof value.expectedTargetVersion !== "string" || value.expectedTargetVersion.length === 0)
  ) {
    throw transferEntryUnsupported("invalid_expected_target_version");
  }
  if (value.replaceExisting !== undefined && typeof value.replaceExisting !== "boolean") {
    throw transferEntryUnsupported("invalid_replace_existing");
  }
  if (value.replaceExisting === true && value.expectedTargetVersion !== undefined) {
    throw transferEntryUnsupported("ambiguous_target_precondition");
  }
  return {
    source,
    targetDirectory,
    targetName: value.targetName,
    expectedTargetVersion: value.expectedTargetVersion,
    replaceExisting: value.replaceExisting,
    signal: value.signal,
    operationId: value.operationId,
  };
}

function assertTransferProviderCapability(
  provider: ResourceProvider,
  ref: ResourceRef,
  capability: "exportTree" | "importTree",
  providerId: ResourceProviderId,
): void {
  const capabilities = provider.capabilities?.(ref) || {};
  const implementation = capability === "exportTree"
    ? provider.exportTree
    : provider.importTreeAtomically;
  if (capabilities[capability] === false || typeof implementation !== "function") {
    throw capabilityDenied(capability, providerId);
  }
}

function transferErrorOutcome(error: unknown): "denied" | "conflict" {
  const code = errorCode(error);
  return code === "knowledge_resource_conflict" || code === "knowledge_version_conflict"
    ? "conflict"
    : "denied";
}

/**
 * Providers can encounter an OS-level access error after a caller has moved
 * a directory or closed a handle mid-transfer. That detail is neither a
 * stable ResourceIO contract nor safe to surface from a route, so turn it
 * into the same path-free denial used by LocalFS before auditing or replying.
 */
function normalizeTransferError(error: unknown): unknown {
  const code = errorCode(error);
  if (code === "EACCES" || code === "EPERM" || code === "ELOOP") {
    return new ResourceIOError("Resource transfer access denied", {
      code: "resource_access_denied",
      status: 403,
    });
  }
  return error;
}

function createTransferAbort(parentSignal?: AbortSignal): {
  signal: AbortSignal;
  abort: () => void;
  dispose: () => void;
} {
  const controller = new AbortController();
  const abort = () => controller.abort();
  if (parentSignal?.aborted) {
    abort();
  } else {
    parentSignal?.addEventListener("abort", abort, { once: true });
  }
  return {
    signal: controller.signal,
    abort,
    dispose: () => parentSignal?.removeEventListener("abort", abort),
  };
}

function mutationPreconditions(
  context: ResourceOperationContext,
): { expectedVersion?: ResourceVersion | null } {
  return context.expectedVersion === undefined
    ? {}
    : { expectedVersion: context.expectedVersion };
}

function isWriteConflict(result: ResourceWriteExpectedVersionResult): result is ResourceWriteConflictResult {
  return Boolean((result as any)?.ok === false && (result as any)?.conflict === true);
}

function operationCorrelation(context: ResourceOperationContext): { operationId?: string } {
  return isOperationCorrelationId(context.operationId)
    ? { operationId: context.operationId }
    : {};
}

function auditContext(context: ResourceOperationContext, getSessionPath: () => string | null) {
  return {
    ...(context.reason ? { reason: context.reason } : {}),
    ...(context.principal ? { principal: context.principal } : {}),
    sessionId: context.sessionId ?? context.principal?.sessionId ?? null,
    sessionPath: context.sessionPath ?? context.principal?.sessionPath ?? getSessionPath?.() ?? null,
    requestId: context.requestId ?? context.principal?.requestId ?? null,
    ...operationCorrelation(context),
  };
}

function transferAuditContext(context: ResourceOperationContext) {
  const principal = context.principal
    ? { ...context.principal, sessionPath: undefined }
    : undefined;
  return {
    ...(context.reason ? { reason: context.reason } : {}),
    ...(principal ? { principal } : {}),
    sessionId: context.sessionId ?? principal?.sessionId ?? null,
    sessionPath: null,
    requestId: context.requestId ?? principal?.requestId ?? null,
    ...operationCorrelation(context),
  };
}

function errorCode(err: unknown): string | undefined {
  return typeof (err as any)?.code === "string" ? (err as any).code : undefined;
}

function isDeniedProviderError(err: unknown): boolean {
  const code = errorCode(err);
  return code === "resource_access_denied" || code === "capability_denied";
}

function safeDeniedMessage(operation: ResourceProviderCapability, providerId: ResourceProviderId, err: unknown): string {
  if (typeof (err as any)?.safeMessage === "string" && (err as any).safeMessage) {
    return (err as any).safeMessage;
  }
  return `ResourceIO ${operation} denied by provider ${providerId}`;
}
