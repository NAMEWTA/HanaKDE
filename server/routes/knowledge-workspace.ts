import { Hono } from "hono";
import path from "node:path";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import {
  parseRegisterSourceRequest,
  SourceRegistry,
} from "../../core/knowledge-workspace/source-registry.ts";
import {
  KnowledgeOperationCoordinator,
} from "../../core/knowledge-workspace/knowledge-operation-coordinator.ts";
import { KnowledgeAtomicOperationCoordinator } from "../../core/knowledge-workspace/knowledge-atomic-operation-coordinator.ts";
import {
  KnowledgeRefactorService,
} from "../../core/knowledge-workspace/knowledge-refactor-service.ts";
import {
  KnowledgeImportService,
  type KnowledgeImportItemResult,
} from "../../core/knowledge-workspace/knowledge-import-service.ts";
import { KnowledgeCreateService } from "../../core/knowledge-workspace/knowledge-create-service.ts";
import {
  KnowledgeCopyService,
  type KnowledgeEditorCopyOperation,
  type KnowledgeInternalPasteItemResult,
} from "../../core/knowledge-workspace/knowledge-copy-service.ts";
import { KnowledgeTrashService } from "../../core/knowledge-workspace/knowledge-trash-service.ts";
import { KnowledgeTrashOperationCoordinator } from "../../core/knowledge-workspace/knowledge-trash-operation-coordinator.ts";
import { isKnowledgeTrashEntryExpired } from "../../lib/knowledge-workspace/knowledge-trash-manifest.ts";
import { createKnowledgeOperationId } from "../../lib/knowledge-workspace/knowledge-operation-plan.ts";
import {
  KnowledgeNativeGrantService,
  knowledgeNativeCredentialMatches,
  type KnowledgeNativeGrantAction,
} from "../../core/knowledge-workspace/knowledge-native-grant-service.ts";
import {
  parseKnowledgeResourceAddress,
} from "../../shared/knowledge-workspace-contract.ts";
import {
  createKnowledgeWorkspaceError,
  normalizeKnowledgeErrorCode,
  toKnowledgeErrorEnvelope,
  toPublicKnowledgeErrorEnvelope,
} from "../../shared/knowledge-workspace-errors.ts";
import { safeJson } from "../hono-helpers.ts";
import { createRequestContext } from "../http/boundary.ts";
import {
  createApiResourceOperationContext,
  requestIdFromHono,
} from "../http/resource-operation-context.ts";
import type { ResourceOperationContext } from "../../lib/resource-io/types.ts";
import {
  resolveWorkbenchCompatibilityMain,
} from "../../core/knowledge-workspace/workbench-compatibility.ts";
import {
  queryKnowledgeIndex,
} from "../../lib/knowledge-workspace/knowledge-query.ts";
import {
  searchKnowledgeIndex,
} from "../../lib/knowledge-workspace/knowledge-search-query.ts";

type RegistryEntry = {
  workspaceKey: string;
  signature: string;
  registry: SourceRegistry;
};

const registryStates = new WeakMap<object, {
  current: Promise<RegistryEntry> | null;
  workspaceKey: string | null;
  signature: string | null;
}>();

type OperationEntry = {
  workspaceKey: string;
  signature: string;
  coordinator: KnowledgeOperationCoordinator;
  trashCoordinator: KnowledgeTrashOperationCoordinator;
  atomicCoordinator: KnowledgeAtomicOperationCoordinator;
};

const operationStates = new WeakMap<object, {
  current: Promise<OperationEntry> | null;
  workspaceKey: string | null;
  signature: string | null;
}>();

const atomicOperationStates = new WeakMap<object, {
  current: Promise<KnowledgeAtomicOperationCoordinator> | null;
  workspaceKey: string | null;
  signature: string | null;
}>();

type NativeBridgeState = Readonly<{
  token: string;
  grants: KnowledgeNativeGrantService;
  authService: {
    issueLocalSessionCredential(input: { sessionId: string }): { token: string; sessionId: string };
    revokeLocalSessionCredential(input: { sessionId: string }): boolean;
  } | null;
  cleanupOperations: Map<string, string>;
}>;
const nativeBridgeStates = new WeakMap<object, NativeBridgeState>();

export function configureKnowledgeNativeBridge(engine, token: string | null, authService: NativeBridgeState["authService"] = null): void {
  if (!engine || (typeof engine !== "object" && typeof engine !== "function")) return;
  if (!token) {
    nativeBridgeStates.delete(engine);
    return;
  }
  nativeBridgeStates.set(engine, Object.freeze({
    token,
    grants: new KnowledgeNativeGrantService(),
    authService,
    cleanupOperations: new Map(),
  }));
}

export function createKnowledgeWorkspaceRoute(engine) {
  const route = new Hono();
  const registryState = registryStateFor(engine);

  route.get("/knowledge-workspace/sources", async (c) => {
    try {
      const auth = authorize(c, engine, "files.read");
      if (auth.response) return auth.response;
      const registry = await registryFor(c, engine, auth.requestContext, registryState);
      const [coordinator, trashCoordinator, atomicCoordinator] = await Promise.all([
        currentOperationCoordinator(engine),
        currentTrashOperationCoordinator(engine),
        currentAtomicOperationCoordinator(engine),
      ]);
      const sources = registry.list().map((source) =>
        coordinator?.isSourceRecovering?.(source.sourceKey)
          || trashCoordinator?.isSourceRecovering?.(source.sourceKey)
          || atomicCoordinator?.isSourceRecovering?.(source.sourceKey)
          ? { ...source, availability: "recovering" as const }
          : source
      );
      return c.json({ sources });
    } catch (error) {
      return knowledgeRouteError(c, error);
    }
  });

  route.get("/knowledge-workspace/index/status", async (c) => {
    try {
      const auth = authorize(c, engine, "files.read");
      if (auth.response) return auth.response;
      const registry = await registryFor(
        c,
        engine,
        auth.requestContext,
        registryState,
      );
      const result = await queryKnowledgeIndex(
        await knowledgeIndexCoordinatorFor(engine, registry),
        {
          kind: "health",
          sourceKey: c.req.query("sourceKey"),
        },
        { signal: c.req.raw.signal },
      );
      if (result.kind !== "health") {
        throw routeError("knowledge index health result invalid", 500);
      }
      return c.json({
        sourceKey: result.sourceKey,
        health: result.health,
      });
    } catch (error) {
      return knowledgeRouteError(c, error);
    }
  });

  route.post("/knowledge-workspace/query", async (c) => {
    try {
      const auth = authorize(c, engine, "files.read");
      if (auth.response) return auth.response;
      const registry = await registryFor(
        c,
        engine,
        auth.requestContext,
        registryState,
      );
      const result = await queryKnowledgeIndex(
        await knowledgeIndexCoordinatorFor(engine, registry),
        await safeJson(c),
        { signal: c.req.raw.signal },
      );
      return c.json({ result });
    } catch (error) {
      return knowledgeRouteError(c, error);
    }
  });

  route.post("/knowledge-workspace/search", async (c) => {
    try {
      const auth = authorize(c, engine, "files.read");
      if (auth.response) return auth.response;
      const registry = await registryFor(
        c,
        engine,
        auth.requestContext,
        registryState,
      );
      const result = await searchKnowledgeIndex(
        await knowledgeIndexCoordinatorFor(engine, registry),
        await safeJson(c),
        {
          sources: registry.list(),
          signal: c.req.raw.signal,
        },
      );
      return c.json({ result });
    } catch (error) {
      return knowledgeRouteError(c, error);
    }
  });

  route.post("/knowledge-workspace/sources", async (c) => {
    try {
      const auth = authorize(c, engine, "files.write");
      if (auth.response) return auth.response;
      const input = parseRegisterSourceRequest(await safeJson(c));
      const registry = await registryFor(c, engine, auth.requestContext, registryState);
      const source = await registry.register({
        sourceKey: input.sourceKey,
        displayName: input.displayName,
        root: { kind: "mount", mountId: input.mountId, path: "" },
      });
      await bindKnowledgeIndexWorkspace(engine, registry);
      return c.json({ source }, 201);
    } catch (error) {
      return knowledgeRouteError(c, error);
    }
  });

  route.post("/knowledge-workspace/copy-for-editor", async (c) => {
    try {
      const auth = authorize(c, engine, "files.write");
      if (auth.response) return auth.response;
      const registry = await registryFor(
        c,
        engine,
        auth.requestContext,
        registryState,
      );
      if (typeof engine.prepareKnowledgeResourceCopyForEditor !== "function") {
        throw routeError("knowledge copy service unavailable", 503);
      }
      const context = createApiResourceOperationContext({
        requestContext: auth.requestContext,
        requestId: requestIdFromHono(c),
        reason: "knowledge-copy-for-editor",
      }) as ResourceOperationContext;
      const operation = await engine.prepareKnowledgeResourceCopyForEditor(
        await safeJson(c),
        {
          sourceRegistry: registry,
          ...context,
          signal: c.req.raw?.signal,
        },
      );
      const result = await commitEditorCopyOperation({
        engine,
        registry,
        requestContext: auth.requestContext,
        operation,
        context: { ...context, signal: c.req.raw?.signal },
      });
      return c.json({ result }, result.copied ? 201 : 200);
    } catch (error) {
      return knowledgeRouteError(c, error);
    }
  });

  route.post("/knowledge-workspace/copy-external-for-editor", async (c) => {
    try {
      const auth = authorize(c, engine, "files.write");
      if (auth.response) return auth.response;
      const metadata = parseExternalCopyMetadata(
        c.req.header("x-hanako-knowledge-copy"),
      );
      const registry = await registryFor(
        c,
        engine,
        auth.requestContext,
        registryState,
      );
      if (
        typeof engine.prepareExternalKnowledgeResourceCopyForEditor !== "function"
      ) {
        throw routeError("knowledge external copy service unavailable", 503);
      }
      const context = createApiResourceOperationContext({
        requestContext: auth.requestContext,
        requestId: requestIdFromHono(c),
        reason: "knowledge-copy-external-for-editor",
      }) as ResourceOperationContext;
      const operation = await engine.prepareExternalKnowledgeResourceCopyForEditor({
        body: c.req.raw.body,
        sizeBytes: metadata.fileSize,
        originalName: metadata.fileName,
        mimeType: metadata.mimeType,
        pageAddress: metadata.pageAddress,
        localDate: metadata.localDate,
      }, {
        sourceRegistry: registry,
        ...context,
        signal: c.req.raw.signal,
      });
      const result = await commitEditorCopyOperation({
        engine,
        registry,
        requestContext: auth.requestContext,
        operation,
        context: { ...context, signal: c.req.raw.signal },
      });
      return c.json({ result }, 201);
    } catch (error) {
      return knowledgeRouteError(c, error);
    }
  });

  route.delete("/knowledge-workspace/sources/:sourceKey", async (c) => {
    try {
      const auth = authorize(c, engine, "files.write");
      if (auth.response) return auth.response;
      const registry = await registryFor(c, engine, auth.requestContext, registryState);
      const source = await registry.remove(c.req.param("sourceKey") || "");
      await bindKnowledgeIndexWorkspace(engine, registry);
      return c.json({ ok: true, sourceKey: source.sourceKey });
    } catch (error) {
      return knowledgeRouteError(c, error);
    }
  });

  route.post("/knowledge-workspace/resources/create", async (c) => {
    try {
      const auth = authorize(c, engine, "files.write");
      if (auth.response) return auth.response;
      const registry = await registryFor(c, engine, auth.requestContext, registryState);
      const service = new KnowledgeCreateService({ sourceRegistry: registry, resourceIO: resourceIoFor(engine) });
      const context = {
        ...(createApiResourceOperationContext({ requestContext: auth.requestContext, requestId: requestIdFromHono(c), reason: "knowledge-create" }) as ResourceOperationContext),
        signal: c.req.raw.signal,
      };
      const prepared = await service.plan(await safeJson(c), context);
      let result;
      const operation = await (await atomicOperationCoordinatorFor(
        engine,
        registry,
        auth.requestContext,
      )).run({
        kind: "create",
        sourceKey: prepared.address.sourceKey,
        items: [{
          itemId: createKnowledgeOperationId(),
          targetAddress: prepared.address,
          resourceKind: prepared.request.kind === "folder" ? "directory" : "file",
          disposition: "apply",
          expectedTargetVersion: null,
        }],
      }, async (_item, _index, operationContext) => {
        result = await service.createPrepared(prepared, operationContext);
        return { version: result.version };
      }, context);
      assertAtomicOperationSucceeded(operation);
      return c.json({ result }, 201);
    } catch (error) {
      return knowledgeRouteError(c, error);
    }
  });

  route.post("/knowledge-workspace/resources/paste", async (c) => {
    try {
      const auth = authorize(c, engine, "files.write");
      if (auth.response) return auth.response;
      const registry = await registryFor(c, engine, auth.requestContext, registryState);
      const service = new KnowledgeCopyService({ sourceRegistry: registry, resourceIO: resourceIoFor(engine) });
      const context = {
        ...(createApiResourceOperationContext({ requestContext: auth.requestContext, requestId: requestIdFromHono(c), reason: "knowledge-paste" }) as ResourceOperationContext),
        signal: c.req.raw.signal,
      };
      const plannedItems = await service.planPasteResources(await safeJson(c), context);
      const results: KnowledgeInternalPasteItemResult[] = [];
      for (const planned of plannedItems) {
        if ("errorCode" in planned) {
          results.push(Object.freeze({
            ok: false,
            sourceAddress: planned.sourceAddress,
            errorCode: planned.errorCode,
          }));
          continue;
        }
        const prepared = planned.prepared;
        try {
          if (prepared.intent === "copy") {
            let pasted: Extract<KnowledgeInternalPasteItemResult, { ok: true }> | undefined;
            const operation = await (await atomicOperationCoordinatorFor(
              engine,
              registry,
              auth.requestContext,
            )).run({
              kind: "copy",
              sourceKey: prepared.targetAddress.sourceKey,
              items: [{
                itemId: createKnowledgeOperationId(),
                sourceAddress: prepared.sourceAddress,
                sourceIdentity: registry.rootIdentity(prepared.sourceAddress.sourceKey),
                expectedSourceVersion: prepared.expectedSourceVersion,
                targetAddress: prepared.targetAddress,
                expectedTargetVersion: null,
                resourceKind: prepared.resourceKind,
                disposition: "apply",
              }],
            }, async (_item, _index, operationContext) => {
              pasted = await service.pastePrepared(prepared, operationContext);
              return {};
            }, context);
            const failed = operation.items.find(item => item.state !== "applied");
            if (failed || !pasted) {
              results.push(Object.freeze({
                ok: false,
                sourceAddress: prepared.sourceAddress,
                errorCode: normalizeKnowledgeErrorCode(failed?.errorCode)
                  ?? "knowledge_resource_unavailable",
              }));
            } else {
              results.push(pasted);
            }
            continue;
          }

          const coordinator = await operationCoordinatorFor(
            engine,
            registry,
            auth.requestContext,
          );
          const plan = await coordinator.plan({
            kind: "move",
            from: prepared.sourceAddress,
            to: prepared.targetAddress,
            expectedVersion: prepared.expectedSourceVersion,
          }, context);
          const operation = await coordinator.commit(
            plan.operationId,
            { requestHash: plan.requestHash },
            context,
          );
          const failed = operation.items.find(item => item.state !== "applied");
          if (failed) {
            results.push(Object.freeze({
              ok: false,
              sourceAddress: prepared.sourceAddress,
              errorCode: normalizeKnowledgeErrorCode(failed.errorCode)
                ?? "knowledge_resource_unavailable",
            }));
          } else {
            results.push(Object.freeze({
              ok: true,
              sourceAddress: prepared.sourceAddress,
              targetAddress: prepared.targetAddress,
              effect: "move",
            }));
          }
        } catch (error) {
          if (isAbortError(error) || c.req.raw.signal.aborted) throw error;
          results.push(Object.freeze({
            ok: false,
            sourceAddress: prepared.sourceAddress,
            errorCode: normalizeKnowledgeErrorCode((error as { code?: unknown })?.code)
              ?? "knowledge_resource_unavailable",
          }));
        }
      }
      return c.json({ results });
    } catch (error) {
      return knowledgeRouteError(c, error);
    }
  });

  route.post("/knowledge-workspace/trash", async (c) => {
    try {
      const auth = authorize(c, engine, "files.write");
      if (auth.response) return auth.response;
      const body = await safeJson(c);
      if (!Array.isArray(body?.addresses)) throw createKnowledgeWorkspaceError("knowledge_operation_precondition_failed", "knowledge trash request is invalid");
      const registry = await registryFor(c, engine, auth.requestContext, registryState);
      await engine.prepareKnowledgeTrashSessions?.(body.addresses, auth.requestContext);
      const coordinator = await trashOperationCoordinatorFor(
        engine,
        registry,
        auth.requestContext,
      );
      const result = await coordinator.trash(body.addresses, {
        ...(createApiResourceOperationContext({ requestContext: auth.requestContext, requestId: requestIdFromHono(c), reason: "knowledge-trash" }) as ResourceOperationContext),
        signal: c.req.raw.signal,
      });
      return c.json({ result });
    } catch (error) {
      return knowledgeRouteError(c, error);
    }
  });

  route.post("/knowledge-workspace/trash/restore/plan", async (c) => {
    try {
      const auth = authorize(c, engine, "files.write");
      if (auth.response) return auth.response;
      const body = await safeJson(c);
      if (
        typeof body?.sourceKey !== "string"
        || typeof body?.batchId !== "string"
        || (
          body.entryIds !== undefined
          && (
            !Array.isArray(body.entryIds)
            || body.entryIds.some((value) => typeof value !== "string")
          )
        )
        || Object.keys(body ?? {}).some((key) => !["sourceKey", "batchId", "entryIds"].includes(key))
      ) {
        throw createKnowledgeWorkspaceError("knowledge_operation_precondition_failed", "knowledge trash restore plan request is invalid");
      }
      const registry = await registryFor(c, engine, auth.requestContext, registryState);
      const coordinator = await trashOperationCoordinatorFor(
        engine,
        registry,
        auth.requestContext,
      );
      const plan = await coordinator.planRestore(
        body.sourceKey,
        body.batchId,
        body.entryIds,
        createApiResourceOperationContext({
          requestContext: auth.requestContext,
          requestId: requestIdFromHono(c),
          reason: "knowledge-trash-restore-plan",
        }) as ResourceOperationContext,
      );
      return c.json({ plan }, 201);
    } catch (error) {
      return knowledgeRouteError(c, error);
    }
  });

  route.post("/knowledge-workspace/trash/cleanup/plan", async (c) => {
    try {
      const auth = authorize(c, engine, "files.write");
      if (auth.response) return auth.response;
      const body = await safeJson(c);
      const parsed = parseKnowledgeResourceAddress(body?.address);
      if (
        !parsed.ok
        || Object.keys(body ?? {}).some((key) => key !== "address")
      ) {
        throw createKnowledgeWorkspaceError("knowledge_operation_precondition_failed", "knowledge trash cleanup plan request is invalid");
      }
      const registry = await registryFor(c, engine, auth.requestContext, registryState);
      const coordinator = await trashOperationCoordinatorFor(
        engine,
        registry,
        auth.requestContext,
      );
      const plan = await coordinator.planCleanup(
        parsed.value,
        createApiResourceOperationContext({
          requestContext: auth.requestContext,
          requestId: requestIdFromHono(c),
          reason: "knowledge-trash-cleanup-plan",
        }) as ResourceOperationContext,
      );
      return c.json({ plan }, 201);
    } catch (error) {
      return knowledgeRouteError(c, error);
    }
  });

  route.get("/knowledge-workspace/trash/:sourceKey", async (c) => {
    try {
      const auth = authorize(c, engine, "files.read");
      if (auth.response) return auth.response;
      const registry = await registryFor(c, engine, auth.requestContext, registryState);
      const service = new KnowledgeTrashService({ sourceRegistry: registry, resourceIO: resourceIoFor(engine) });
      const batches = await service.list(c.req.param("sourceKey"), createApiResourceOperationContext({ requestContext: auth.requestContext, requestId: requestIdFromHono(c), reason: "knowledge-trash-list" }) as ResourceOperationContext);
      return c.json({ batches });
    } catch (error) {
      return knowledgeRouteError(c, error);
    }
  });

  route.post("/knowledge-workspace/trash/:sourceKey/:batchId/restore", async (c) => {
    try {
      const auth = authorize(c, engine, "files.write");
      if (auth.response) return auth.response;
      const body = await safeJson(c);
      if (body?.entryIds !== undefined && !Array.isArray(body.entryIds)) throw createKnowledgeWorkspaceError("knowledge_operation_precondition_failed", "knowledge trash restore request is invalid");
      const registry = await registryFor(c, engine, auth.requestContext, registryState);
      const coordinator = await trashOperationCoordinatorFor(
        engine,
        registry,
        auth.requestContext,
      );
      const results = await coordinator.restore(c.req.param("sourceKey"), c.req.param("batchId"), body?.entryIds, {
        ...(createApiResourceOperationContext({ requestContext: auth.requestContext, requestId: requestIdFromHono(c), reason: "knowledge-trash-restore" }) as ResourceOperationContext),
        signal: c.req.raw.signal,
      });
      return c.json({ results });
    } catch (error) {
      return knowledgeRouteError(c, error);
    }
  });

  route.post(
    "/knowledge-workspace/index/:sourceKey/rebuild",
    async (c) => {
      try {
        const auth = authorize(c, engine, "files.write");
        if (auth.response) return auth.response;
        const registry = await registryFor(
          c,
          engine,
          auth.requestContext,
          registryState,
        );
        const sourceKey = c.req.param("sourceKey") || "";
        if (!registry.get(sourceKey)) {
          throw createKnowledgeWorkspaceError(
            "knowledge_resource_not_found",
            "knowledge source is not active",
          );
        }
        await bindKnowledgeIndexWorkspace(engine, registry);
        if (typeof engine.rebuildKnowledgeIndex !== "function") {
          throw createKnowledgeWorkspaceError(
            "knowledge_index_unavailable",
            "knowledge index rebuild is unavailable",
          );
        }
        let health;
        try {
          health = await engine.rebuildKnowledgeIndex(sourceKey, {
            signal: c.req.raw.signal,
          });
        } catch (error) {
          if (isAbortError(error) || c.req.raw.signal.aborted) throw error;
          if (toKnowledgeErrorEnvelope(error)) throw error;
          throw createKnowledgeWorkspaceError(
            "knowledge_index_unavailable",
            "knowledge index rebuild failed",
          );
        }
        return c.json({ sourceKey, health });
      } catch (error) {
        if (isAbortError(error) || c.req.raw.signal.aborted) throw error;
        return knowledgeRouteError(c, error);
      }
    },
  );

  route.post("/knowledge-workspace/operations/plan", async (c) => {
    try {
      const auth = authorize(c, engine, "files.write");
      if (auth.response) return auth.response;
      const registry = await registryFor(
        c,
        engine,
        auth.requestContext,
        registryState,
      );
      const context = createApiResourceOperationContext({
        requestContext: auth.requestContext,
        requestId: requestIdFromHono(c),
        reason: "knowledge-operation-plan",
      }) as ResourceOperationContext;
      const body = await safeJson(c);
      let plan;
      if (body?.kind === "delete") {
        if (
          !Array.isArray(body.addresses)
          || Object.keys(body).some((key) => !["kind", "addresses"].includes(key))
        ) {
          throw createKnowledgeWorkspaceError("knowledge_operation_precondition_failed", "knowledge delete plan request is invalid");
        }
        await engine.prepareKnowledgeTrashSessions?.(body.addresses, auth.requestContext);
        plan = await (await trashOperationCoordinatorFor(
          engine,
          registry,
          auth.requestContext,
        )).planTrash(body.addresses, context);
      } else {
        plan = await (await operationCoordinatorFor(
          engine,
          registry,
          auth.requestContext,
        )).plan(body, context);
      }
      return c.json({ plan }, 201);
    } catch (error) {
      return knowledgeRouteError(c, error);
    }
  });

  route.post(
    "/knowledge-workspace/operations/:operationId/commit",
    async (c) => {
      try {
        const auth = authorize(c, engine, "files.write");
        if (auth.response) return auth.response;
        const registry = await registryFor(
          c,
          engine,
          auth.requestContext,
          registryState,
        );
        const context = createApiResourceOperationContext({
          requestContext: auth.requestContext,
          requestId: requestIdFromHono(c),
          reason: "knowledge-operation-commit",
        }) as ResourceOperationContext;
        const operationId = c.req.param("operationId");
        const commit = await safeJson(c);
        const trashCoordinator = await trashCoordinatorForDispatch(
          engine,
          registry,
          auth.requestContext,
        );
        const atomicCoordinator = await atomicCoordinatorForDispatch(
          engine,
          registry,
          auth.requestContext,
        );
        const result = trashCoordinator?.owns(operationId)
          ? await trashCoordinator.commit(operationId, commit, context)
          : atomicCoordinator?.owns(operationId)
            ? await atomicCoordinator.commit(operationId, commit, context)
          : await (await operationCoordinatorFor(
              engine,
              registry,
              auth.requestContext,
            )).commit(operationId, commit, context);
        return c.json({ result });
      } catch (error) {
        return knowledgeRouteError(c, error);
      }
    },
  );

  route.post(
    "/knowledge-workspace/operations/:operationId/cancel",
    async (c) => {
      try {
        const auth = authorize(c, engine, "files.write");
        if (auth.response) return auth.response;
        const registry = await registryFor(
          c,
          engine,
          auth.requestContext,
          registryState,
        );
        const context = createApiResourceOperationContext({
          requestContext: auth.requestContext,
          requestId: requestIdFromHono(c),
          reason: "knowledge-operation-cancel",
        }) as ResourceOperationContext;
        const operationId = c.req.param("operationId");
        const trashCoordinator = await trashCoordinatorForDispatch(
          engine,
          registry,
          auth.requestContext,
        );
        const atomicCoordinator = await atomicCoordinatorForDispatch(
          engine,
          registry,
          auth.requestContext,
        );
        const result = trashCoordinator?.owns(operationId)
          ? await trashCoordinator.cancel(operationId, context)
          : atomicCoordinator?.owns(operationId)
            ? await atomicCoordinator.cancel(operationId, context)
          : await (await operationCoordinatorFor(
              engine,
              registry,
              auth.requestContext,
            )).cancel(operationId, context);
        return c.json({ result });
      } catch (error) {
        return knowledgeRouteError(c, error);
      }
    },
  );

  route.get(
    "/knowledge-workspace/operations/:operationId",
    async (c) => {
      try {
        const auth = authorize(c, engine, "files.read");
        if (auth.response) return auth.response;
        const registry = await registryFor(
          c,
          engine,
          auth.requestContext,
          registryState,
        );
        const context = createApiResourceOperationContext({
          requestContext: auth.requestContext,
          requestId: requestIdFromHono(c),
          reason: "knowledge-operation-status",
        }) as ResourceOperationContext;
        const operationId = c.req.param("operationId");
        const trashCoordinator = await trashCoordinatorForDispatch(
          engine,
          registry,
          auth.requestContext,
        );
        const atomicCoordinator = await atomicCoordinatorForDispatch(
          engine,
          registry,
          auth.requestContext,
        );
        const operation = trashCoordinator?.owns(operationId)
          ? await trashCoordinator.get(operationId, context)
          : atomicCoordinator?.owns(operationId)
            ? await atomicCoordinator.get(operationId, context)
          : await (await operationCoordinatorFor(
              engine,
              registry,
              auth.requestContext,
            )).get(operationId, context);
        return c.json({ operation });
      } catch (error) {
        return knowledgeRouteError(c, error);
      }
    },
  );

  route.get("/knowledge-workspace/native/capabilities", (c) => {
    const available = nativeBridgeStates.has(engine);
    return c.json({
      directoryPicker: available,
      filePicker: available,
      fileClipboard: available,
      openDefault: available,
      reveal: available,
      copyPath: available,
      systemTrash: available,
    });
  });

  route.post("/knowledge-workspace/native/trash/expired", async (c) => {
    try {
      const auth = authorize(c, engine, "files.read");
      if (auth.response) return auth.response;
      requireNativeBridge(c, engine, auth.requestContext);
      const body = await safeJson(c);
      if (Object.keys(body ?? {}).length !== 0) {
        throw createKnowledgeWorkspaceError("knowledge_operation_precondition_failed", "knowledge expired trash request is invalid");
      }
      const registry = await registryFor(c, engine, auth.requestContext, registryState);
      const trash = new KnowledgeTrashService({ sourceRegistry: registry, resourceIO: resourceIoFor(engine) });
      const now = Date.now();
      const entries: Array<{ sourceKey: string; relativePath: string }> = [];
      for (const source of registry.list()) {
        if (source.availability !== "available") continue;
        try {
          const batches = await trash.list(source.sourceKey, createApiResourceOperationContext({
            requestContext: auth.requestContext,
            requestId: requestIdFromHono(c),
            reason: "knowledge-trash-expired-list",
          }) as ResourceOperationContext);
          for (const batch of batches) {
            for (const entry of batch.entries) {
              if (entry.state === "trashed" && isKnowledgeTrashEntryExpired(entry, now)) {
                entries.push({ ...entry.trashAddress });
              }
            }
          }
        } catch {
          // An unavailable or damaged source is skipped without changing deletion time.
        }
      }
      return c.json({ entries });
    } catch (error) {
      return knowledgeRouteError(c, error);
    }
  });

  route.post("/knowledge-workspace/native/sessions", async (c) => {
    try {
      const auth = authorize(c, engine, "files.write");
      if (auth.response) return auth.response;
      const native = requireNativeSessionAdministrator(c, engine, auth.requestContext);
      const body = await safeJson(c);
      if (!validNativeWindowKey(body?.windowKey) || Object.keys(body).some(key => key !== "windowKey")) {
        throw createKnowledgeWorkspaceError("knowledge_operation_precondition_failed", "knowledge native window session request is invalid");
      }
      return c.json(native.authService!.issueLocalSessionCredential({ sessionId: body.windowKey }), 201);
    } catch (error) {
      return knowledgeRouteError(c, error);
    }
  });

  route.post("/knowledge-workspace/native/sessions/revoke", async (c) => {
    try {
      const auth = authorize(c, engine, "files.write");
      if (auth.response) return auth.response;
      const native = requireNativeSessionAdministrator(c, engine, auth.requestContext);
      const body = await safeJson(c);
      if (!validNativeWindowKey(body?.windowKey) || Object.keys(body).some(key => key !== "windowKey")) {
        throw createKnowledgeWorkspaceError("knowledge_operation_precondition_failed", "knowledge native window session revocation is invalid");
      }
      return c.json({ revoked: native.authService!.revokeLocalSessionCredential({ sessionId: body.windowKey }) });
    } catch (error) {
      return knowledgeRouteError(c, error);
    }
  });

  route.post("/knowledge-workspace/native/grants", async (c) => {
    try {
      const auth = authorize(c, engine, "files.read");
      if (auth.response) return auth.response;
      const native = nativeBridgeStates.get(engine);
      if (!native) throw createKnowledgeWorkspaceError("knowledge_native_capability_unavailable", "knowledge native bridge is unavailable");
      const body = await safeJson(c);
      const action = parseNativeAction(body?.action);
      const parsed = parseKnowledgeResourceAddress(body?.address);
      if (
        !action
        || !parsed.ok
        || (
          body?.operationId !== undefined
          && (
            action !== "systemTrash"
            || typeof body.operationId !== "string"
          )
        )
        || Object.keys(body ?? {}).some(key => !["action", "address", "operationId"].includes(key))
      ) {
        throw createKnowledgeWorkspaceError("knowledge_operation_precondition_failed", "knowledge native grant request is invalid");
      }
      const registry = await registryFor(c, engine, auth.requestContext, registryState);
      const resourceIO = resourceIoFor(engine);
      const context = createApiResourceOperationContext({
        requestContext: auth.requestContext,
        requestId: requestIdFromHono(c),
        reason: "knowledge-native-grant",
      }) as ResourceOperationContext;
      const ref = await registry.resolveAddress(parsed.value);
      const stat = await resourceIO.stat(ref, context);
      if (!stat.exists || !stat.version) throw createKnowledgeWorkspaceError("knowledge_resource_not_found", "knowledge native resource is unavailable");
      const trashCoordinator = action === "systemTrash"
        ? await trashOperationCoordinatorFor(engine, registry, auth.requestContext)
        : null;
      const operationId = trashCoordinator
        ? body.operationId === undefined
          ? await trashCoordinator.beginSystemTrash(parsed.value, context)
          : await trashCoordinator.useSystemTrashPlan(
              body.operationId,
              parsed.value,
              context,
            )
        : null;
      const identity = nativeIdentity(auth.requestContext);
      const grant = native.grants.issue({ action, address: parsed.value, version: stat.version, ...identity });
      if (operationId && trashCoordinator) {
        native.cleanupOperations.set(grant.grantId, operationId);
        try {
          await trashCoordinator.markSystemTrashGrantIssued(operationId, context);
        } catch (error) {
          native.cleanupOperations.delete(grant.grantId);
          native.grants.failSystemTrash({ grantId: grant.grantId, ...identity });
          throw error;
        }
      }
      return c.json({ grant }, 201);
    } catch (error) {
      return knowledgeRouteError(c, error);
    }
  });

  route.post("/knowledge-workspace/native/consume", async (c) => {
    try {
      const auth = authorize(c, engine, "files.write");
      if (auth.response) return auth.response;
      const native = requireNativeBridge(c, engine, auth.requestContext);
      const body = await safeJson(c);
      const action = parseNativeAction(body?.action);
      if (!action || typeof body?.grantId !== "string" || Object.keys(body).some(key => !["action", "grantId"].includes(key))) {
        throw createKnowledgeWorkspaceError("knowledge_operation_precondition_failed", "knowledge native consume request is invalid");
      }
      const grant = native.grants.consume({ grantId: body.grantId, action, ...nativeIdentity(auth.requestContext) });
      const registry = await registryFor(c, engine, auth.requestContext, registryState);
      const resourceIO = resourceIoFor(engine);
      const context = createApiResourceOperationContext({
        requestContext: auth.requestContext,
        requestId: requestIdFromHono(c),
        reason: "knowledge-native-consume",
      }) as ResourceOperationContext;
      const cleanupOperationId = grant.action === "systemTrash"
        ? native.cleanupOperations.get(grant.grantId)
        : undefined;
      try {
        if (grant.action === "systemTrash") {
          if (!cleanupOperationId) {
            throw createKnowledgeWorkspaceError(
              "knowledge_operation_precondition_failed",
              "knowledge native trash operation is unavailable",
            );
          }
          await (await trashOperationCoordinatorFor(
            engine,
            registry,
            auth.requestContext,
          )).markSystemTrashDispatched(cleanupOperationId, context);
        }
        const ref = await registry.resolveAddress(grant.address);
        const stat = await resourceIO.stat(ref, context);
        if (!stat.exists || !sameVersion(stat.version, grant.version) || typeof resourceIO.materialize !== "function") {
          throw createKnowledgeWorkspaceError("knowledge_version_conflict", "knowledge native grant resource changed");
        }
        const materialized = await resourceIO.materialize(ref);
        if (!materialized?.filePath || !path.isAbsolute(materialized.filePath)) {
          throw createKnowledgeWorkspaceError("knowledge_native_capability_unavailable", "knowledge native resource cannot be materialized");
        }
        return c.json({ grantId: grant.grantId, action: grant.action, filePath: materialized.filePath });
      } catch (error) {
        if (grant.action === "systemTrash" && cleanupOperationId) {
          const coordinator = await trashOperationCoordinatorFor(
            engine,
            registry,
            auth.requestContext,
          );
          await coordinator.completeSystemTrash(
            cleanupOperationId,
            false,
            { ...context, reason: "knowledge-native-trash-consume-failed" },
          );
          native.cleanupOperations.delete(grant.grantId);
          native.grants.discardSystemTrash({
            grantId: grant.grantId,
            ...nativeIdentity(auth.requestContext),
          });
        } else if (grant.action === "systemTrash") {
          native.grants.discardSystemTrash({
            grantId: grant.grantId,
            ...nativeIdentity(auth.requestContext),
          });
        }
        throw error;
      }
    } catch (error) {
      return knowledgeRouteError(c, error);
    }
  });

  route.post("/knowledge-workspace/native/complete", async (c) => {
    try {
      const auth = authorize(c, engine, "files.write");
      if (auth.response) return auth.response;
      const native = requireNativeBridge(c, engine, auth.requestContext);
      const body = await safeJson(c);
      if (typeof body?.grantId !== "string" || typeof body?.ok !== "boolean" || Object.keys(body).some(key => !["grantId", "ok"].includes(key))) {
        throw createKnowledgeWorkspaceError("knowledge_operation_precondition_failed", "knowledge native completion is invalid");
      }
      const identity = nativeIdentity(auth.requestContext);
      native.grants.verifySystemTrash(
        { grantId: body.grantId, ...identity },
        { allowUnconsumed: body.ok === false },
      );
      const operationId = native.cleanupOperations.get(body.grantId);
      if (!operationId) {
        throw createKnowledgeWorkspaceError(
          "knowledge_operation_precondition_failed",
          "knowledge native trash operation is unavailable",
        );
      }
      const registry = await registryFor(c, engine, auth.requestContext, registryState);
      const context = createApiResourceOperationContext({
        requestContext: auth.requestContext,
        requestId: requestIdFromHono(c),
        reason: body.ok ? "knowledge-native-trash-complete" : "knowledge-native-trash-failed",
      }) as ResourceOperationContext;
      await (await trashOperationCoordinatorFor(
        engine,
        registry,
        auth.requestContext,
      )).completeSystemTrash(operationId, body.ok, context);
      if (body.ok) {
        native.grants.completeSystemTrash({ grantId: body.grantId, ...identity });
      } else {
        native.grants.failSystemTrash({ grantId: body.grantId, ...identity });
      }
      native.cleanupOperations.delete(body.grantId);
      return c.json({ ok: body.ok });
    } catch (error) {
      return knowledgeRouteError(c, error);
    }
  });

  route.post("/knowledge-workspace/native/import", async (c) => {
    try {
      const auth = authorize(c, engine, "files.write");
      if (auth.response) return auth.response;
      requireNativeBridge(c, engine, auth.requestContext);
      const body = await safeJson(c);
      if (
        !Array.isArray(body?.filePaths)
        || body.filePaths.length === 0
        || body.filePaths.some(filePath => typeof filePath !== "string" || !path.isAbsolute(filePath))
        || Object.keys(body ?? {}).some((key) => !["filePaths", "target", "conflictPolicy"].includes(key))
      ) {
        throw createKnowledgeWorkspaceError("knowledge_operation_precondition_failed", "knowledge native import paths are invalid");
      }
      const registry = await registryFor(c, engine, auth.requestContext, registryState);
      const resourceIO = resourceIoFor(engine);
      const trashCoordinator = await trashOperationCoordinatorFor(
        engine,
        registry,
        auth.requestContext,
      );
      const service = new KnowledgeImportService({
        sourceRegistry: registry,
        resourceIO,
        trashExisting: async (address, context) => {
          const trashed = await trashCoordinator.trash([address], context);
          const item = trashed.items.find(candidate => candidate.ok);
          if (!item) throw createKnowledgeWorkspaceError("knowledge_resource_unavailable", "knowledge import replacement could not preserve the existing resource");
          return async () => {
            const restored = await trashCoordinator.restore(
              address.sourceKey,
              trashed.batchId,
              [item.entryId],
              context,
            );
            if (!restored[0]?.ok) throw createKnowledgeWorkspaceError("knowledge_resource_unavailable", "knowledge import replacement rollback failed");
          };
        },
      });
      const context = {
        ...(createApiResourceOperationContext({ requestContext: auth.requestContext, requestId: requestIdFromHono(c), reason: "knowledge-native-import" }) as ResourceOperationContext),
        signal: c.req.raw.signal,
      };
      const atomicCoordinator = await atomicOperationCoordinatorFor(
        engine,
        registry,
        auth.requestContext,
      );
      const results: Array<Record<string, unknown>> = [];
      for (const filePath of body.filePaths) {
        const originalName = path.basename(filePath);
        try {
          const prepared = await service.planItem(
            { source: { kind: "local-file" as const, path: filePath }, originalName },
            body.target,
            body.conflictPolicy,
            context,
          );
          let imported: Extract<KnowledgeImportItemResult, { ok: true }> | undefined = prepared.disposition === "skip"
            ? {
                ok: true as const,
                skipped: true,
                originalName,
                targetAddress: null,
                bytesTransferred: 0,
              }
            : undefined;
          const operation = await atomicCoordinator.run({
            kind: "import",
            sourceKey: prepared.targetAddress.sourceKey,
            items: [{
              itemId: createKnowledgeOperationId(),
              sourceToken: createKnowledgeOperationId(),
              targetAddress: prepared.targetAddress,
              resourceKind: prepared.resourceKind,
              disposition: prepared.disposition,
              expectedSourceVersion: prepared.expectedSourceVersion,
              expectedTargetVersion: prepared.expectedTargetVersion,
            }],
          }, async (_item, _index, operationContext) => {
            const next = await service.importPrepared(prepared, operationContext);
            if ("errorCode" in next) {
              throw createKnowledgeWorkspaceError(next.errorCode, "knowledge import item failed");
            }
            imported = next;
            return { bytesTransferred: imported.bytesTransferred };
          }, context);
          const failed = operation.items.find(item => item.state !== "applied");
          if (failed) {
            results.push(Object.freeze({
              ok: false,
              originalName,
              errorCode: failed.errorCode || "knowledge_resource_unavailable",
            }));
          } else {
            results.push(Object.freeze(imported!));
          }
        } catch (error) {
          if (isAbortError(error) || c.req.raw.signal.aborted) throw error;
          results.push(Object.freeze({
            ok: false,
            originalName,
            errorCode: normalizeKnowledgeErrorCode((error as { code?: unknown })?.code)
              ?? "knowledge_resource_unavailable",
          }));
        }
      }
      return c.json({ results });
    } catch (error) {
      return knowledgeRouteError(c, error);
    }
  });

  return route;
}

/**
 * Production composition calls this before createKnowledgeWorkspaceRoute()
 * is mounted. Direct route tests may inject engine.knowledgeOperationCoordinator;
 * otherwise the first operation request uses the same cached barrier.
 */
export async function prepareKnowledgeOperationRecovery(
  engine,
): Promise<KnowledgeOperationCoordinator> {
  if (
    engine?.knowledgeOperationCoordinator
    && typeof engine.knowledgeOperationCoordinator.recover === "function"
    && engine?.knowledgeTrashOperationCoordinator
    && typeof engine.knowledgeTrashOperationCoordinator.recover === "function"
    && engine?.knowledgeAtomicOperationCoordinator
    && typeof engine.knowledgeAtomicOperationCoordinator.recover === "function"
  ) {
    await Promise.all([
      engine.knowledgeOperationCoordinator.recover(),
      engine.knowledgeTrashOperationCoordinator.recover(),
      engine.knowledgeAtomicOperationCoordinator.recover(),
    ]);
    return engine.knowledgeOperationCoordinator;
  }
  const requestContext = startupRequestContext(engine);
  const registry = await registryFor(
    null,
    engine,
    requestContext,
    registryStateFor(engine),
  );
  const coordinator = await operationCoordinatorFor(
    engine,
    registry,
    requestContext,
  );
  const trashCoordinator = await trashOperationCoordinatorFor(
    engine,
    registry,
    requestContext,
  );
  const atomicCoordinator = await atomicOperationCoordinatorFor(
    engine,
    registry,
    requestContext,
  );
  await Promise.all([
    coordinator.recover(),
    trashCoordinator.recover(),
    atomicCoordinator.recover(),
  ]);
  return coordinator;
}

export async function resolveKnowledgeResourceAddressForRequest(
  c,
  engine,
  input: unknown,
  capability: "files.read" | "files.write",
  options: Readonly<{ allowSourceRoot?: boolean }> = {},
) {
  if (
    options.allowSourceRoot === true
    && input
    && typeof input === "object"
    && !Array.isArray(input)
    && (input as Record<string, unknown>).relativePath === ""
    && Object.keys(input).every(key => key === "sourceKey" || key === "relativePath")
  ) {
    const root = parseKnowledgeResourceAddress({
      sourceKey: (input as Record<string, unknown>).sourceKey,
      relativePath: "__source_root__",
    });
    if (root.ok === false) {
      throw Object.assign(new Error(root.error.code), root.error);
    }
    const requestContext = authorizeAddress(c, engine, capability);
    const registry = await registryFor(
      c,
      engine,
      requestContext,
      registryStateFor(engine),
    );
    await registry.revalidate(root.value.sourceKey);
    return registry.rootRef(root.value.sourceKey);
  }
  const parsed = parseKnowledgeResourceAddress(input);
  if (parsed.ok === false) throw Object.assign(new Error(parsed.error.code), parsed.error);
  const requestContext = authorizeAddress(c, engine, capability);
  const registry = await registryFor(
    c,
    engine,
    requestContext,
    registryStateFor(engine),
  );
  return registry.resolveAddress(parsed.value);
}

export async function resolveKnowledgeSourceRootForRequest(
  c,
  engine,
  sourceKey: unknown,
  capability: "files.read" | "files.write",
) {
  const parsed = parseKnowledgeResourceAddress({
    sourceKey,
    relativePath: "__source_watch__",
  });
  if (parsed.ok === false) {
    throw Object.assign(new Error(parsed.error.code), parsed.error);
  }
  const requestContext = authorizeAddress(c, engine, capability);
  const registry = await registryFor(
    c,
    engine,
    requestContext,
    registryStateFor(engine),
  );
  await registry.revalidate(parsed.value.sourceKey);
  return registry.rootRef(parsed.value.sourceKey);
}

function authorizeAddress(
  c,
  engine,
  capability: "files.read" | "files.write",
) {
  const requestContext = createRequestContext(c, engine);
  if (requestContext.authPrincipal?.kind === "unknown") return requestContext;
  const decision = requestContext.authorize(capability, {
    kind: "studio",
    studioId: requestContext.studioId,
  });
  if (decision.allowed) return requestContext;
  throw createKnowledgeWorkspaceError(
    "knowledge_resource_out_of_scope",
    "knowledge resource capability is outside the authenticated scope",
  );
}

function registryStateFor(engine) {
  if (!engine || (typeof engine !== "object" && typeof engine !== "function")) {
    throw routeError("knowledge workspace engine required", 500);
  }
  let state = registryStates.get(engine);
  if (!state) {
    state = {
      current: null,
      workspaceKey: null,
      signature: null,
    };
    registryStates.set(engine, state);
  }
  return state;
}

function operationStateFor(engine) {
  if (!engine || (typeof engine !== "object" && typeof engine !== "function")) {
    throw routeError("knowledge workspace engine required", 500);
  }
  let state = operationStates.get(engine);
  if (!state) {
    state = {
      current: null,
      workspaceKey: null,
      signature: null,
    };
    operationStates.set(engine, state);
  }
  return state;
}

async function currentOperationCoordinator(
  engine,
): Promise<KnowledgeOperationCoordinator | null> {
  if (
    engine?.knowledgeOperationCoordinator
    && typeof engine.knowledgeOperationCoordinator.isSourceRecovering
      === "function"
  ) {
    return engine.knowledgeOperationCoordinator;
  }
  const state = operationStates.get(engine);
  return state?.current ? (await state.current).coordinator : null;
}

async function currentTrashOperationCoordinator(
  engine,
): Promise<KnowledgeTrashOperationCoordinator | null> {
  if (
    engine?.knowledgeTrashOperationCoordinator
    && typeof engine.knowledgeTrashOperationCoordinator.isSourceRecovering
      === "function"
  ) {
    return engine.knowledgeTrashOperationCoordinator;
  }
  const state = operationStates.get(engine);
  return state?.current ? (await state.current).trashCoordinator : null;
}

async function currentAtomicOperationCoordinator(
  engine,
): Promise<KnowledgeAtomicOperationCoordinator | null> {
  if (
    engine?.knowledgeAtomicOperationCoordinator
    && typeof engine.knowledgeAtomicOperationCoordinator.isSourceRecovering === "function"
  ) {
    return engine.knowledgeAtomicOperationCoordinator;
  }
  const state = operationStates.get(engine);
  if (state?.current) return (await state.current).atomicCoordinator;
  const atomicState = atomicOperationStates.get(engine);
  return atomicState?.current ? await atomicState.current : null;
}

async function bindKnowledgeIndexWorkspace(
  engine,
  registry: SourceRegistry,
) {
  if (typeof engine?.bindKnowledgeIndexWorkspace === "function") {
    return engine.bindKnowledgeIndexWorkspace(registry);
  }
  return null;
}

async function knowledgeIndexCoordinatorFor(
  engine,
  registry: SourceRegistry,
) {
  await bindKnowledgeIndexWorkspace(engine, registry);
  const coordinator = typeof engine?.getKnowledgeIndexCoordinator === "function"
    ? engine.getKnowledgeIndexCoordinator()
    : engine?.knowledgeIndexCoordinator;
  if (
    !coordinator
    || typeof coordinator.health !== "function"
    || typeof coordinator.acquireQueryLease !== "function"
  ) {
    throw createKnowledgeWorkspaceError(
      "knowledge_index_unavailable",
      "knowledge index coordinator is unavailable",
    );
  }
  return coordinator;
}

function authorize(c, engine, capability: "files.read" | "files.write") {
  const requestContext = createRequestContext(c, engine);
  if (requestContext.authPrincipal?.kind === "unknown") {
    return { requestContext };
  }
  const decision = requestContext.authorize(capability, {
    kind: "studio",
    studioId: requestContext.studioId,
  });
  if (decision.allowed) return { requestContext };
  const error = createKnowledgeWorkspaceError(
    "knowledge_resource_out_of_scope",
    "knowledge workspace capability is outside the authenticated scope",
    { capability },
  );
  return {
    requestContext,
    response: knowledgeRouteError(c, error),
  };
}

async function registryFor(
  c,
  engine,
  requestContext,
  registryState: {
    current: Promise<RegistryEntry> | null;
    workspaceKey: string | null;
    signature: string | null;
  },
): Promise<SourceRegistry> {
  const studioId = requestContext?.studioId
    || engine.getRuntimeContext?.()?.studioId
    || "default";
  const compatibilityMain = resolveWorkbenchCompatibilityMain(engine);
  const sessionPath = compatibilityMain.sessionPath || "";
  const mainRoot = compatibilityMain.root;
  const signature = JSON.stringify(mainRoot);
  const workspaceKey = `${studioId}\0${sessionPath || "default"}`;
  if (
    registryState.current
    && registryState.workspaceKey === workspaceKey
    && registryState.signature === signature
  ) {
    return (await registryState.current).registry;
  }

  const pending = createRegistryEntry({
    c,
    engine,
    requestContext,
    mainRoot,
    mainDisplayName: compatibilityMain.displayName,
    signature,
    studioId,
    workspaceKey,
  });
  registryState.current = pending;
  registryState.workspaceKey = workspaceKey;
  registryState.signature = signature;
  try {
    return (await pending).registry;
  } catch (error) {
    if (registryState.current === pending) {
      registryState.current = null;
      registryState.workspaceKey = null;
      registryState.signature = null;
    }
    throw error;
  }
}

async function createRegistryEntry({
  c,
  engine,
  requestContext,
  mainRoot,
  mainDisplayName,
  signature,
  studioId,
  workspaceKey,
}): Promise<RegistryEntry> {
  if (!engine.hanakoHome) throw routeError("hanakoHome required", 500);
  if (mainRoot.kind === "local-file" && !mainRoot.path) {
    throw routeError("knowledge workspace main root unavailable", 503);
  }
  const resourceIO = resourceIoFor(engine, {
    mainRoot,
    requestContext,
    studioId,
    forRegistry: true,
  });
  const registry = await SourceRegistry.create({
    mainRoot,
    mainDisplayName,
    resourceIO,
    hanakoHome: engine.hanakoHome,
    context: createApiResourceOperationContext({
      requestContext,
      requestId: requestIdFromHono(c),
    }) as ResourceOperationContext,
  });
  return {
    workspaceKey,
    signature,
    registry,
  };
}

async function operationCoordinatorFor(
  engine,
  registry: SourceRegistry,
  requestContext,
): Promise<KnowledgeOperationCoordinator> {
  if (
    engine.knowledgeOperationCoordinator
    && typeof engine.knowledgeOperationCoordinator.recover === "function"
  ) {
    await engine.knowledgeOperationCoordinator.recover();
    return engine.knowledgeOperationCoordinator;
  }
  const runtime = engine.getRuntimeContext?.() || {};
  const compatibilityMain = resolveWorkbenchCompatibilityMain(engine);
  const studioId = requestContext?.studioId || runtime.studioId || "default";
  const sessionPath = compatibilityMain.sessionPath || "";
  const signature = JSON.stringify(compatibilityMain.root);
  const workspaceKey = `${studioId}\0${sessionPath || "default"}`;
  const state = operationStateFor(engine);
  if (
    state.current
    && state.workspaceKey === workspaceKey
    && state.signature === signature
  ) {
    return (await state.current).coordinator;
  }
  const pending = createOperationEntry({
    engine,
    registry,
    signature,
    workspaceKey,
  });
  state.current = pending;
  state.workspaceKey = workspaceKey;
  state.signature = signature;
  try {
    return (await pending).coordinator;
  } catch (error) {
    if (state.current === pending) {
      state.current = null;
      state.workspaceKey = null;
      state.signature = null;
    }
    throw error;
  }
}

async function trashOperationCoordinatorFor(
  engine,
  registry: SourceRegistry,
  requestContext,
): Promise<KnowledgeTrashOperationCoordinator> {
  if (
    engine.knowledgeTrashOperationCoordinator
    && typeof engine.knowledgeTrashOperationCoordinator.recover === "function"
  ) {
    await engine.knowledgeTrashOperationCoordinator.recover();
    return engine.knowledgeTrashOperationCoordinator;
  }
  const runtime = engine.getRuntimeContext?.() || {};
  const compatibilityMain = resolveWorkbenchCompatibilityMain(engine);
  const studioId = requestContext?.studioId || runtime.studioId || "default";
  const sessionPath = compatibilityMain.sessionPath || "";
  const signature = JSON.stringify(compatibilityMain.root);
  const workspaceKey = `${studioId}\0${sessionPath || "default"}`;
  const state = operationStateFor(engine);
  if (
    state.current
    && state.workspaceKey === workspaceKey
    && state.signature === signature
  ) {
    return (await state.current).trashCoordinator;
  }
  const pending = createOperationEntry({
    engine,
    registry,
    signature,
    workspaceKey,
  });
  state.current = pending;
  state.workspaceKey = workspaceKey;
  state.signature = signature;
  try {
    return (await pending).trashCoordinator;
  } catch (error) {
    if (state.current === pending) {
      state.current = null;
      state.workspaceKey = null;
      state.signature = null;
    }
    throw error;
  }
}

async function atomicOperationCoordinatorFor(
  engine,
  registry: SourceRegistry,
  requestContext,
): Promise<KnowledgeAtomicOperationCoordinator> {
  if (
    engine.knowledgeAtomicOperationCoordinator
    && typeof engine.knowledgeAtomicOperationCoordinator.recover === "function"
  ) {
    await engine.knowledgeAtomicOperationCoordinator.recover();
    return engine.knowledgeAtomicOperationCoordinator;
  }
  const runtime = engine.getRuntimeContext?.() || {};
  const compatibilityMain = resolveWorkbenchCompatibilityMain(engine);
  const studioId = requestContext?.studioId || runtime.studioId || "default";
  const sessionPath = compatibilityMain.sessionPath || "";
  const signature = JSON.stringify(compatibilityMain.root);
  const workspaceKey = `${studioId}\0${sessionPath || "default"}`;
  const state = operationStateFor(engine);
  if (
    state.current
    && state.workspaceKey === workspaceKey
    && state.signature === signature
  ) {
    return (await state.current).atomicCoordinator;
  }
  let atomicState = atomicOperationStates.get(engine);
  if (!atomicState) {
    atomicState = { current: null, workspaceKey: null, signature: null };
    atomicOperationStates.set(engine, atomicState);
  }
  if (
    atomicState.current
    && atomicState.workspaceKey === workspaceKey
    && atomicState.signature === signature
  ) {
    return atomicState.current;
  }
  const pending = createAtomicOperationEntry(engine, registry);
  atomicState.current = pending;
  atomicState.workspaceKey = workspaceKey;
  atomicState.signature = signature;
  try {
    return await pending;
  } catch (error) {
    if (atomicState.current === pending) {
      atomicState.current = null;
      atomicState.workspaceKey = null;
      atomicState.signature = null;
    }
    throw error;
  }
}

async function createAtomicOperationEntry(
  engine,
  registry: SourceRegistry,
): Promise<KnowledgeAtomicOperationCoordinator> {
  if (!engine.hanakoHome) throw routeError("hanakoHome required", 500);
  const coordinator = new KnowledgeAtomicOperationCoordinator({
    hanakoHome: engine.hanakoHome,
    sourceRegistry: registry,
    resourceIO: resourceIoFor(engine, { mainRoot: registry.rootRef("main") }),
  });
  await coordinator.recover();
  return coordinator;
}

async function trashCoordinatorForDispatch(
  engine,
  registry: SourceRegistry,
  requestContext,
): Promise<KnowledgeTrashOperationCoordinator | null> {
  const current = await currentTrashOperationCoordinator(engine);
  if (current) return current;
  if (
    engine?.knowledgeOperationCoordinator
    && !engine?.knowledgeTrashOperationCoordinator
  ) {
    return null;
  }
  return trashOperationCoordinatorFor(engine, registry, requestContext);
}

async function atomicCoordinatorForDispatch(
  engine,
  registry: SourceRegistry,
  requestContext,
): Promise<KnowledgeAtomicOperationCoordinator | null> {
  const current = await currentAtomicOperationCoordinator(engine);
  if (current) return current;
  if (
    engine?.knowledgeOperationCoordinator
    && !engine?.knowledgeAtomicOperationCoordinator
  ) {
    return null;
  }
  return atomicOperationCoordinatorFor(engine, registry, requestContext);
}

async function createOperationEntry({
  engine,
  registry,
  signature,
  workspaceKey,
}): Promise<OperationEntry> {
  if (!engine.hanakoHome) throw routeError("hanakoHome required", 500);
  const resourceIO = resourceIoFor(engine, { mainRoot: registry.rootRef("main") });
  if (
    !resourceIO
    || typeof resourceIO.stat !== "function"
    || typeof resourceIO.rename !== "function"
  ) {
    throw routeError("knowledge operation ResourceIO unavailable", 503);
  }
  const refactorService = new KnowledgeRefactorService({
    sourceRegistry: registry,
    resourceIO,
    findSavedBacklinks: async (address) => {
      const hasIndexSurface = typeof engine?.getKnowledgeIndexCoordinator === "function"
        || Boolean(engine?.knowledgeIndexCoordinator);
      if (!hasIndexSurface) return [];
      const indexCoordinator = await knowledgeIndexCoordinatorFor(engine, registry);
      const lease = indexCoordinator.acquireQueryLease(address.sourceKey);
      const pageSize = 1_000;
      const savedPages = new Map<string, typeof address>();
      try {
        for (let offset = 0;; offset += pageSize) {
          const links = lease.queryBacklinks(
            address.relativePath,
            pageSize,
            offset,
          );
          for (const link of links) {
            savedPages.set(link.relativePath, {
              sourceKey: address.sourceKey,
              relativePath: link.relativePath,
            });
          }
          if (links.length < pageSize) break;
        }
      } finally {
        lease.release();
      }
      return [...savedPages.values()];
    },
  });
  const coordinator = new KnowledgeOperationCoordinator({
    hanakoHome: engine.hanakoHome,
    sourceRegistry: registry,
    resourceIO,
    createCheckpoint: async ({
      resource,
      reason,
    }) => {
      if (typeof engine.createUserEditCheckpoint !== "function") {
        throw createKnowledgeWorkspaceError(
          "knowledge_operation_precondition_failed",
          "knowledge checkpoint service is unavailable",
        );
      }
      let filePath: string | null = resource.kind === "local-file"
        ? resource.path
        : null;
      if (!filePath && typeof resourceIO.materialize === "function") {
        const materialized = await resourceIO.materialize(resource);
        filePath = typeof materialized?.filePath === "string"
          ? materialized.filePath
          : null;
      }
      if (!filePath) {
        throw createKnowledgeWorkspaceError(
          "knowledge_operation_precondition_failed",
          "knowledge checkpoint source cannot be materialized",
        );
      }
      const checkpoint = await engine.createUserEditCheckpoint({
        filePath,
        reason,
      });
      if (
        !checkpoint
        || typeof checkpoint.id !== "string"
        || checkpoint.id.length === 0
      ) {
        throw createKnowledgeWorkspaceError(
          "knowledge_operation_precondition_failed",
          "knowledge checkpoint could not be created",
        );
      }
      return checkpoint.id;
    },
    rebindSessions: async (projection, context) => {
      await engine.rebindKnowledgeOperationSessions?.(projection, context);
    },
    publishEvent: async (projection, context) => {
      if (typeof engine.publishKnowledgeOperationEvent === "function") {
        await engine.publishKnowledgeOperationEvent(projection, context);
        return;
      }
      resourceIO.emitRenamed?.({
        oldResourceKey:
          `${projection.from.sourceKey}:${projection.from.relativePath}`,
        newResourceKey:
          `${projection.to.sourceKey}:${projection.to.relativePath}`,
        oldResource: projection.fromRef,
        newResource: projection.toRef,
      }, context);
    },
    invalidateIndex: async (projection, context) => {
      await engine.invalidateKnowledgeOperationIndex?.(projection, context);
    },
    rewriteLinks: async ({ operationId, from, to, context }) => {
      await refactorService.rewriteSavedLinks({
        operationId,
        from,
        to,
        context,
      });
    },
  });
  const trashCoordinator = new KnowledgeTrashOperationCoordinator({
    hanakoHome: engine.hanakoHome,
    sourceRegistry: registry,
    resourceIO,
  });
  const atomicCoordinator = new KnowledgeAtomicOperationCoordinator({
    hanakoHome: engine.hanakoHome,
    sourceRegistry: registry,
    resourceIO,
  });
  await Promise.all([
    coordinator.recover(),
    trashCoordinator.recover(),
    atomicCoordinator.recover(),
  ]);
  return {
    workspaceKey,
    signature,
    coordinator,
    trashCoordinator,
    atomicCoordinator,
  };
}

function startupRequestContext(engine) {
  const runtime = engine.getRuntimeContext?.() || {};
  const studioId = typeof runtime.studioId === "string"
    ? runtime.studioId
    : "default";
  const userId = typeof runtime.userId === "string"
    ? runtime.userId
    : "local";
  return {
    studioId,
    userId,
    sessionPath: null,
    authPrincipal: {
      kind: "local_user",
      principalId: `local:${userId}:${studioId}`,
      userId,
      studioId,
      scopes: ["studio.owner", "files.read", "files.write"],
      connectionKind: "local",
      credentialKind: "loopback_token",
    },
  };
}

function knowledgeRouteError(c, error: unknown) {
  const envelope = toKnowledgeErrorEnvelope(error)
    ?? toPublicKnowledgeErrorEnvelope(error);
  if (envelope) {
    return c.json(envelope, envelope.httpStatus as ContentfulStatusCode);
  }
  const status = errorStatus(error);
  return c.json({
    code: "knowledge_operation_precondition_failed",
    httpStatus: status,
    retryable: false,
  }, status as ContentfulStatusCode);
}

async function commitEditorCopyOperation(input: {
  engine: unknown;
  registry: SourceRegistry;
  requestContext: unknown;
  operation: KnowledgeEditorCopyOperation;
  context: ResourceOperationContext & { signal?: AbortSignal };
}) {
  if (input.operation.plan.disposition === "reference") {
    return input.operation.plan.result;
  }
  const prepared = input.operation.plan.prepared;
  let result: Awaited<ReturnType<KnowledgeEditorCopyOperation["execute"]>> | undefined;
  const operation = await (await atomicOperationCoordinatorFor(
    input.engine,
    input.registry,
    input.requestContext,
  )).run({
    kind: prepared.sourceAddress ? "copy" : "import",
    sourceKey: prepared.targetAddress.sourceKey,
    items: [{
      itemId: createKnowledgeOperationId(),
      ...(prepared.sourceAddress
        ? {
            sourceAddress: prepared.sourceAddress,
            sourceIdentity: input.registry.rootIdentity(
              prepared.sourceAddress.sourceKey,
            ),
          }
        : { sourceToken: createKnowledgeOperationId() }),
      expectedSourceVersion: prepared.expectedSourceVersion,
      targetAddress: prepared.targetAddress,
      expectedTargetVersion: null,
      resourceKind: "file",
      disposition: "apply",
    }],
  }, async (_item, _index, operationContext) => {
    result = await input.operation.execute(operationContext);
    return { bytesTransferred: result.bytesTransferred };
  }, input.context);
  assertAtomicOperationSucceeded(operation);
  if (!result) {
    throw createKnowledgeWorkspaceError(
      "knowledge_resource_unavailable",
      "knowledge editor copy result is unavailable",
    );
  }
  return result;
}

function assertAtomicOperationSucceeded(operation): void {
  const failed = operation.items.find((item) => item.state !== "applied");
  if (!failed) return;
  throw createKnowledgeWorkspaceError(
    failed.errorCode || "knowledge_resource_unavailable",
    "knowledge atomic operation failed",
  );
}

function routeError(message: string, status: number): Error {
  return Object.assign(new Error(message), { status });
}

function resourceIoFor(engine, options: {
  forRegistry?: boolean;
  mainRoot?: unknown;
  requestContext?: unknown;
  studioId?: string | null;
} = {}) {
  const forRegistry = options.forRegistry === true;
  const injectedResourceIO = engine?.resourceIO;
  const knowledgeResourceIO = injectedResourceIO
    || (typeof engine?.getKnowledgeResourceIO === "function"
      ? engine.getKnowledgeResourceIO()
      : null);
  let resourceIO = isKnowledgeResourceOwner(knowledgeResourceIO, { forRegistry })
    ? knowledgeResourceIO
    : null;
  if (!resourceIO && isKnowledgeResourceOwner(injectedResourceIO, { forRegistry })) {
    resourceIO = injectedResourceIO;
  }
  if (!resourceIO && typeof engine?.getResourceIO === "function") {
    resourceIO = engine.getResourceIO();
  }
  if (!resourceIO && isKnowledgeResourceOwner(engine?.knowledgeResourceIO, { forRegistry })) {
    resourceIO = engine.knowledgeResourceIO;
  }
  if (!resourceIO || typeof resourceIO.stat !== "function") {
    throw routeError("knowledge ResourceIO unavailable", 503);
  }
  return resourceIO;
}

function isKnowledgeResourceOwner(resourceIO, { forRegistry = false } = {}) {
  const localProvider = resourceIO?.providers?.local_fs;
  return Boolean(
    resourceIO
    && typeof resourceIO.stat === "function"
    && typeof resourceIO.getRootIdentity === "function"
    && typeof resourceIO.capabilitiesFor === "function"
    && (!forRegistry || !localProvider || localProvider.trashRoot),
  );
}

function parseNativeAction(value: unknown): KnowledgeNativeGrantAction | null {
  return value === "openDefault" || value === "reveal" || value === "copyPath" || value === "systemTrash" ? value : null;
}

function validNativeWindowKey(value: unknown): value is string {
  return typeof value === "string"
    && value.length >= 1
    && value.length <= 128
    && !/[\p{Cc}]/u.test(value);
}

function nativeIdentity(requestContext): { ownerKey: string; windowKey: string } {
  const principal = requestContext?.authPrincipal ?? {};
  return {
    ownerKey: typeof principal.principalId === "string" ? principal.principalId : `local:${requestContext?.userId ?? "local"}`,
    windowKey: typeof principal.sessionId === "string" && principal.sessionId ? principal.sessionId : "desktop-main",
  };
}

function requireNativeBridge(c, engine, requestContext): NativeBridgeState {
  const native = nativeBridgeStates.get(engine);
  const principal = requestContext?.authPrincipal;
  if (
    !native
    || c.get?.("transportConnectionKind") !== "local"
    || principal?.kind !== "local_user"
    || principal?.connectionKind !== "local"
    || principal?.credentialKind !== "loopback_token"
    || !knowledgeNativeCredentialMatches(native.token, c.req.header("x-hana-native-bridge"))
  ) {
    throw createKnowledgeWorkspaceError("knowledge_resource_out_of_scope", "knowledge native bridge request is not authorized");
  }
  return native;
}

function requireNativeSessionAdministrator(c, engine, requestContext): NativeBridgeState {
  const native = requireNativeBridge(c, engine, requestContext);
  if (requestContext?.authPrincipal?.sessionId || !native.authService) {
    throw createKnowledgeWorkspaceError("knowledge_resource_out_of_scope", "knowledge native window session administration is not authorized");
  }
  return native;
}

function sameVersion(left: unknown, right: unknown): boolean {
  if (!left || !right || typeof left !== "object" || typeof right !== "object") return false;
  const fields = ["mtimeMs", "size", "sha256", "etag", "sequence"];
  return fields.every(field => (left as Record<string, unknown>)[field] === (right as Record<string, unknown>)[field]);
}

function parseExternalCopyMetadata(input: unknown): {
  fileName: string;
  fileSize: number;
  mimeType: string;
  pageAddress: unknown;
  localDate: string;
} {
  if (typeof input !== "string" || input.length === 0 || input.length > 8192) {
    throw createKnowledgeWorkspaceError(
      "knowledge_operation_precondition_failed",
      "external copy metadata is invalid",
    );
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(input, "base64url").toString("utf8"));
  } catch {
    throw createKnowledgeWorkspaceError(
      "knowledge_operation_precondition_failed",
      "external copy metadata is invalid",
    );
  }
  if (
    typeof parsed !== "object"
    || parsed === null
    || Array.isArray(parsed)
    || Object.keys(parsed).some(field => ![
      "fileName",
      "fileSize",
      "mimeType",
      "pageAddress",
      "localDate",
    ].includes(field))
  ) {
    throw createKnowledgeWorkspaceError(
      "knowledge_operation_precondition_failed",
      "external copy metadata is invalid",
    );
  }
  const value = parsed as Record<string, unknown>;
  if (
    typeof value.fileName !== "string"
    || !Number.isSafeInteger(value.fileSize)
    || (value.fileSize as number) < 0
    || typeof value.mimeType !== "string"
    || value.mimeType.length > 255
    || typeof value.localDate !== "string"
  ) {
    throw createKnowledgeWorkspaceError(
      "knowledge_operation_precondition_failed",
      "external copy metadata is invalid",
    );
  }
  return {
    fileName: value.fileName,
    fileSize: value.fileSize as number,
    mimeType: value.mimeType,
    pageAddress: value.pageAddress,
    localDate: value.localDate,
  };
}

function errorStatus(error: unknown): number {
  if (
    typeof error === "object"
    && error !== null
    && "status" in error
    && Number.isInteger(error.status)
  ) {
    return error.status as number;
  }
  return 400;
}

function isAbortError(error: unknown): boolean {
  return typeof error === "object"
    && error !== null
    && "name" in error
    && error.name === "AbortError";
}
