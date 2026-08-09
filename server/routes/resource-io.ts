import crypto from "crypto";
import { TextDecoder } from "util";
import { Hono } from "hono";
import {
  normalizePrincipal,
  principalOwnsLocalConnection,
} from "../../core/security-principal.ts";
import { isOperationCorrelationId } from "../../shared/knowledge-diagnostics.ts";
import {
  KNOWLEDGE_MARKDOWN_MAX_BYTES,
  parseKnowledgeResourceAddress,
} from "../../shared/knowledge-workspace-contract.ts";
import { RESOURCE_READ_PROOF } from "../../lib/resource-io/types.ts";
import { KnowledgeWorkspaceError, snapshotOwnData, toKnowledgeErrorEnvelope, toPublicKnowledgeErrorEnvelope } from "../../shared/knowledge-workspace-errors.ts";
import { safeJson } from "../hono-helpers.ts";
import { createHonoResourceOperationContext } from "../http/resource-operation-context.ts";
import {
  resolveKnowledgeResourceAddressForRequest,
  resolveKnowledgeSourceRootForRequest,
} from "./knowledge-workspace.ts";

const UTF8_DECODER = new TextDecoder("utf-8", { fatal: true });
const BASE64_PATTERN = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;
const DEFAULT_REMOTE_RESOURCE_WATCH_LEASE_MS = 30_000;
const MUTATION_AUTHORITY_FIELDS = new Set([
  "principal",
  "principalId",
  "userId",
  "studioId",
  "owner",
  "ownerId",
  "workspaceId",
  "scope",
  "scopes",
  "scopeToken",
  "sessionId",
  "sessionPath",
  "connectionKind",
  "credentialKind",
  "resolvedPath",
  "filePath",
  "file_path",
  "rootPath",
  "absolutePath",
  "rootIdentity",
  "providerRootIdentity",
  "identityNamespace",
  "opaqueRootId",
  "nativeCredential",
  "nativeBridgeCredential",
  "nativeToken",
  "nativeBridgeToken",
  "token",
  "credential",
  "credentials",
  "windowId",
]);

const RESOURCE_REF_FIELDS = Object.freeze({
  "local-file": new Set(["kind", "path"]),
  mount: new Set(["kind", "mountId", "path"]),
  resource: new Set(["kind", "resourceId"]),
  "session-file": new Set(["kind", "fileId"]),
  url: new Set(["kind", "url"]),
});

const MUTATION_ROUTE_FIELDS = Object.freeze({
  mkdir: new Set(["resource", "ref", "target", "reason", "operationId", "expectedVersion"]),
  delete: new Set(["resource", "ref", "target", "reason", "operationId", "expectedVersion"]),
  copy: new Set(["from", "to", "oldResource", "newResource", "reason", "operationId", "expectedVersion"]),
  transfer: new Set([
    "source",
    "targetDirectory",
    "sourceAddress",
    "targetDirectoryAddress",
    "targetName",
    "reason",
    "operationId",
    "expectedTargetVersion",
  ]),
});

const KNOWLEDGE_ADDRESS_ROUTE_FIELDS = Object.freeze({
  stat: new Set(["address"]),
  read: new Set(["address", "encoding", "responseEncoding"]),
  list: new Set(["address"]),
  search: new Set(["address", "query"]),
  writeExpectedVersion: new Set([
    "address",
    "content",
    "encoding",
    "contentEncoding",
    "expectedVersion",
    "reason",
    "operationId",
  ]),
});

export function createResourceIoRoute(engine, {
  remoteWatchLeaseMs = DEFAULT_REMOTE_RESOURCE_WATCH_LEASE_MS,
  setLeaseTimeout = setTimeout,
  clearLeaseTimeout = clearTimeout,
  now = Date.now,
} = {}) {
  const route = new Hono();
  const releases = new Map();
  const remoteSubscriptionOwners = new Map();
  const leaseDurationMs = Math.max(
    1_000,
    Math.floor(Number(remoteWatchLeaseMs) || DEFAULT_REMOTE_RESOURCE_WATCH_LEASE_MS),
  );

  const retainReleasedSubscriptionTombstone = (subscriptionId, record) => {
    clearLeaseTimeout(record.timer);
    record.active = false;
    record.expiresAt = now() + leaseDurationMs;
    record.timer = setLeaseTimeout(() => {
      if (remoteSubscriptionOwners.get(subscriptionId) === record) {
        remoteSubscriptionOwners.delete(subscriptionId);
      }
    }, leaseDurationMs);
    record.timer?.unref?.();
  };

  const releaseRemoteSubscription = (subscriptionId, record) => {
    if (remoteSubscriptionOwners.get(subscriptionId) !== record) return false;
    if (record.active) {
      clearLeaseTimeout(record.timer);
      try {
        engine.unsubscribeResourceWatch?.(subscriptionId);
      } catch {
        const retryMs = Math.max(250, Math.min(1_000, leaseDurationMs));
        record.expiresAt = now() + retryMs;
        record.timer = setLeaseTimeout(() => {
          releaseRemoteSubscription(subscriptionId, record);
        }, retryMs);
        record.timer?.unref?.();
        return false;
      }
      retainReleasedSubscriptionTombstone(subscriptionId, record);
    }
    return true;
  };

  const armRemoteSubscriptionLease = (subscriptionId, ownerKey) => {
    const previous = remoteSubscriptionOwners.get(subscriptionId);
    if (previous) clearLeaseTimeout(previous.timer);
    const expiresAt = now() + leaseDurationMs;
    const record = {
      ownerKey,
      expiresAt,
      timer: null,
      active: true,
    };
    record.timer = setLeaseTimeout(() => {
      releaseRemoteSubscription(subscriptionId, record);
    }, leaseDurationMs);
    record.timer?.unref?.();
    remoteSubscriptionOwners.set(subscriptionId, record);
    return record;
  };

  route.post("/resource-io/subscribe", async (c) => {
    try {
      const body = await safeJson(c);
      const subscription = await resolveSubscriptionRequest(c, engine, body);
      if (!isLocalLoopbackRequest(c) && !subscription.ownerKey) {
        return c.json({ error: "resource watch owner unavailable" }, 403);
      }
      const subscribe = engine.subscribeResourceWatch?.(subscription.input);
      if (!subscribe?.subscriptionId) {
        return c.json({ error: "resource watch unavailable" }, 500);
      }
      let remoteLease = null;
      if (subscription.ownerKey) {
        remoteLease = armRemoteSubscriptionLease(
          subscribe.subscriptionId,
          subscription.ownerKey,
        );
      }
      const result = { ok: true, ...subscribe };
      return c.json(
        isLocalLoopbackRequest(c)
          ? result
          : {
              ok: true,
              subscriptionId: subscribe.subscriptionId,
              leaseDurationMs,
              leaseExpiresAt: new Date(remoteLease.expiresAt).toISOString(),
            },
      );
    } catch (err) {
      return errorJson(c, err);
    }
  });

  route.delete("/resource-io/subscriptions/:subscriptionId", (c) => {
    const subscriptionId = c.req.param("subscriptionId");
    if (!isLocalLoopbackRequest(c)) {
      const ownerKey = remoteResourceSubscriptionOwnerKey(c);
      const record = remoteSubscriptionOwners.get(subscriptionId);
      if (
        !ownerKey
        || !record
        || record.ownerKey !== ownerKey
      ) {
        return c.json({ ok: true, released: false });
      }
      return c.json({
        ok: true,
        released: releaseRemoteSubscription(subscriptionId, record),
      });
    }
    try {
      engine.unsubscribeResourceWatch?.(subscriptionId);
      // Local owner deletion is idempotent. A false engine result means that a
      // previous Server epoch or lost response already removed the watch.
      return c.json({ ok: true, released: true });
    } catch {
      return c.json({ ok: true, released: false }, 500);
    }
  });

  route.post("/resource-io/subscriptions/:subscriptionId/renew", (c) => {
    const subscriptionId = c.req.param("subscriptionId");
    if (isLocalLoopbackRequest(c)) {
      return c.json({ ok: true, renewed: false });
    }
    const ownerKey = remoteResourceSubscriptionOwnerKey(c);
    const record = remoteSubscriptionOwners.get(subscriptionId);
    if (!ownerKey || !record || !record.active || record.ownerKey !== ownerKey) {
      return c.json({ ok: true, renewed: false });
    }
    const renewed = armRemoteSubscriptionLease(subscriptionId, ownerKey);
    return c.json({
      ok: true,
      renewed: true,
      leaseDurationMs,
      leaseExpiresAt: new Date(renewed.expiresAt).toISOString(),
    });
  });

  route.get("/resource-io/watch-diagnostics", (c) => {
    const diagnostics = engine.resourceWatchDiagnostics?.()
      || { subscriptions: 0, watches: [] };
    return c.json(
      isLocalLoopbackRequest(c)
        ? { ok: true, diagnostics }
        : {
            ok: true,
            diagnostics: {
              subscriptions:
                finiteNumberOrUndefined(diagnostics?.subscriptions) ?? 0,
            },
          },
    );
  });

  route.get("/resource-io/events", (c) => {
    try {
      const since = numericCursor(c.req.query("since"));
      const result = resourceEventsSince(engine, since);
      const response = result?.stale
        ? {
            ...result,
            resync: "resource-stat-required",
          }
        : result;
      return c.json(
        isLocalLoopbackRequest(c)
          ? response
          : projectRemoteResourceEvents(response),
      );
    } catch (err) {
      return errorJson(c, err, 500);
    }
  });

  route.post("/resource-io/watch", async (c) => {
    try {
      const body = await safeJson(c);
      const resource = body?.resource || body?.ref || body?.target || body;
      validateWatchRequest(c, body);
      const release = engine.retainResourceWatch?.(resource);
      if (typeof release !== "function") {
        return c.json({ error: "resource watch unavailable" }, 500);
      }
      const watchId = crypto.randomUUID();
      releases.set(watchId, release);
      return c.json({ ok: true, watchId });
    } catch (err) {
      return errorJson(c, err);
    }
  });

  route.delete("/resource-io/watch/:watchId", (c) => {
    const watchId = c.req.param("watchId");
    const release = releases.get(watchId);
    if (!release) return c.json({ ok: true, released: false });
    try {
      release();
      releases.delete(watchId);
      return c.json({ ok: true, released: true });
    } catch {
      return c.json({ ok: true, released: false }, 500);
    }
  });

  route.post("/resource-io/stat", async (c) => resourceJson(c, engine, async (resourceIO, body) => {
    const resource = await readResourceRef(c, engine, body, {
      capability: "files.read",
      allowedAddressFields: KNOWLEDGE_ADDRESS_ROUTE_FIELDS.stat,
    });
    return resourceIO.stat(resource);
  }, { responseKind: "stat" }));

  route.post("/resource-io/read", async (c) => resourceJson(c, engine, async (resourceIO, body) => {
    const resource = await readResourceRef(c, engine, body, {
      capability: "files.read",
      allowedAddressFields: KNOWLEDGE_ADDRESS_ROUTE_FIELDS.read,
    });
    if (body?.address !== undefined) {
      return encodeReadResult(
        await readKnowledgeContentWithGate(
          resourceIO,
          resource,
          c.req.raw?.signal,
        ),
        body,
      );
    }
    const result = await resourceIO.read(resource);
    return encodeReadResult(result, body);
  }, { responseKind: "read" }));

  route.post("/resource-io/list", async (c) => resourceJson(c, engine, async (resourceIO, body) => {
    const resource = await readResourceRef(c, engine, body, {
      capability: "files.read",
      allowedAddressFields: KNOWLEDGE_ADDRESS_ROUTE_FIELDS.list,
      allowSourceRoot: true,
    });
    return resourceIO.list(resource);
  }, { responseKind: "list" }));

  route.post("/resource-io/search", async (c) => resourceJson(c, engine, async (resourceIO, body) => {
    const resource = await readResourceRef(c, engine, body, {
      capability: "files.read",
      allowedAddressFields: KNOWLEDGE_ADDRESS_ROUTE_FIELDS.search,
    });
    return resourceIO.search(resource, { query: body?.query });
  }, { responseKind: "search" }));

  route.post("/resource-io/write", async (c) => resourceJson(c, engine, async (resourceIO, body) => {
    const resource = body?.resource || body?.ref || body?.target;
    return resourceIO.write(resource, decodeWriteContent(body), operationContextFromBody(body, c));
  }, { rejectMutationAuthority: true, responseKind: "mutation" }));

  route.post("/resource-io/write-expected-version", async (c) => resourceJson(c, engine, async (resourceIO, body) => {
    const resource = await readResourceRef(c, engine, body, {
      capability: "files.write",
      allowedAddressFields: KNOWLEDGE_ADDRESS_ROUTE_FIELDS.writeExpectedVersion,
    });
    return resourceIO.writeExpectedVersion(
      resource,
      decodeWriteContent(body),
      body?.expectedVersion,
      operationContextFromBody(body, c, {
        allowScopedKnowledgeMutation: body?.address !== undefined,
      }),
    );
  }, {
    rejectMutationAuthority: true,
    allowScopedKnowledgeMutation: true,
    responseKind: "mutation",
  }));

  route.post("/resource-io/rename", async (c) => resourceJson(c, engine, async (resourceIO, body) => {
    return resourceIO.rename(body?.from || body?.oldResource, body?.to || body?.newResource, operationContextFromBody(body, c));
  }, { rejectMutationAuthority: true, responseKind: "move" }));

  route.post("/resource-io/move", async (c) => resourceJson(c, engine, async (resourceIO, body) => {
    return resourceIO.move(body?.from || body?.oldResource, body?.to || body?.newResource, operationContextFromBody(body, c));
  }, { rejectMutationAuthority: true, responseKind: "move" }));

  route.post("/resource-io/trash", async (c) => resourceJson(c, engine, async (resourceIO, body) => {
    const resource = body?.resource || body?.ref || body?.target;
    return resourceIO.trash(resource, body?.trash || {}, operationContextFromBody(body, c));
  }, { rejectMutationAuthority: true, responseKind: "trash" }));

  route.post("/resource-io/mkdir", async (c) => resourceJson(c, engine, async (resourceIO, body) => {
    const resource = strictMutationResourceRef(body?.resource || body?.ref || body?.target, "resource");
    return resourceIO.mkdir(resource, operationContextFromBody(body, c));
  }, { rejectMutationAuthority: true, responseKind: "mutation", allowedFields: MUTATION_ROUTE_FIELDS.mkdir }));

  route.post("/resource-io/delete", async (c) => resourceJson(c, engine, async (resourceIO, body) => {
    const resource = strictMutationResourceRef(body?.resource || body?.ref || body?.target, "resource");
    return resourceIO.delete(resource, operationContextFromBody(body, c));
  }, { rejectMutationAuthority: true, responseKind: "mutation", allowedFields: MUTATION_ROUTE_FIELDS.delete }));

  route.post("/resource-io/copy", async (c) => resourceJson(c, engine, async (resourceIO, body) => {
    return resourceIO.copy(
      strictMutationResourceRef(body?.from || body?.oldResource, "from"),
      strictMutationResourceRef(body?.to || body?.newResource, "to"),
      operationContextFromBody(body, c),
    );
  }, { rejectMutationAuthority: true, responseKind: "mutation", allowedFields: MUTATION_ROUTE_FIELDS.copy }));

  route.post("/resource-io/transfer", async (c) => resourceJson(c, engine, async (resourceIO, body) => {
    const context = operationContextFromBody(body, c, {
      allowScopedKnowledgeMutation:
        body?.sourceAddress !== undefined
        || body?.targetDirectoryAddress !== undefined,
    });
    const transferInput = await readTransferInput(c, engine, body);
    const result = await resourceIO.transfer({
      source: transferInput.source,
      targetDirectory: transferInput.targetDirectory,
      targetName: body?.targetName,
      expectedTargetVersion: body?.expectedTargetVersion,
      operationId: body?.operationId,
      signal: c.req.raw?.signal,
    }, context);
    return {
      ...result,
      ...(transferInput.targetAddress
        ? { knowledgeTargetAddress: transferInput.targetAddress }
        : {}),
    };
  }, {
    rejectMutationAuthority: true,
    allowScopedKnowledgeMutation: true,
    responseKind: "transfer",
    allowedFields: MUTATION_ROUTE_FIELDS.transfer,
  }));

  return route;
}

async function readResourceRef(c, engine, body, {
  capability,
  allowedAddressFields,
  allowSourceRoot = false,
}) {
  if (body?.address !== undefined) {
    rejectUnexpectedFields(body, allowedAddressFields);
    if (
      body?.resource !== undefined
      || body?.ref !== undefined
      || body?.target !== undefined
      || typeof body?.kind === "string"
    ) {
      throw new KnowledgeWorkspaceError(
        "knowledge_operation_precondition_failed",
        "Knowledge resource request cannot mix address and ResourceRef",
        { field: "address" },
      );
    }
    return resolveKnowledgeResourceAddressForRequest(
      c,
      engine,
      body.address,
      capability,
      { allowSourceRoot },
    );
  }
  return body?.resource || body?.ref || body?.target || body;
}

async function readTransferInput(c, engine, body) {
  const usesKnowledgeAddress = body?.sourceAddress !== undefined
    || body?.targetDirectoryAddress !== undefined;
  if (!usesKnowledgeAddress) {
    return {
      source: strictMutationResourceRef(body?.source, "source"),
      targetDirectory: strictMutationResourceRef(
        body?.targetDirectory,
        "targetDirectory",
      ),
      targetAddress: null,
    };
  }
  if (
    body?.sourceAddress === undefined
    || body?.targetDirectoryAddress === undefined
    || body?.source !== undefined
    || body?.targetDirectory !== undefined
  ) {
    throw new KnowledgeWorkspaceError(
      "knowledge_operation_precondition_failed",
      "Resource transfer must use either Knowledge addresses or ResourceRefs",
      { field: "sourceAddress" },
    );
  }
  const sourceAddress = parseKnowledgeAddressOrThrow(
    body.sourceAddress,
    "sourceAddress",
  );
  const targetDirectoryAddress = parseKnowledgeAddressOrThrow(
    body.targetDirectoryAddress,
    "targetDirectoryAddress",
  );
  const targetAddress = parseKnowledgeAddressOrThrow({
    sourceKey: targetDirectoryAddress.sourceKey,
    relativePath: [
      targetDirectoryAddress.relativePath,
      body?.targetName,
    ].filter(Boolean).join("/"),
  }, "targetName");
  const [source, targetDirectory] = await Promise.all([
    resolveKnowledgeResourceAddressForRequest(
      c,
      engine,
      sourceAddress,
      "files.read",
    ),
    resolveKnowledgeResourceAddressForRequest(
      c,
      engine,
      targetDirectoryAddress,
      "files.write",
    ),
  ]);
  return { source, targetDirectory, targetAddress };
}

function parseKnowledgeAddressOrThrow(input, field) {
  const parsed = parseKnowledgeResourceAddress(input);
  if (parsed.ok === false) {
    throw Object.assign(new Error("Knowledge resource address is invalid"), {
      ...parsed.error,
      details: { field },
    });
  }
  return parsed.value;
}

function operationContextFromBody(
  body,
  c,
  { allowScopedKnowledgeMutation = false } = {},
) {
  const context = createHonoResourceOperationContext(c, {
    reason: body?.reason || "resource_io_route",
    allowScopedKnowledgeMutation,
  });
  const operationId = mutationOperationId(body);
  const expectedVersion = mutationExpectedVersion(body);
  return {
    ...context,
    ...(operationId ? { operationId } : {}),
    ...(expectedVersion.present ? { expectedVersion: expectedVersion.value } : {}),
  };
}

function mutationOperationId(body) {
  if (body?.operationId === undefined) return null;
  if (!isOperationCorrelationId(body.operationId)) {
    throw new KnowledgeWorkspaceError(
      "knowledge_operation_precondition_failed",
      "Resource mutation operationId must be a UUIDv4 correlation id",
      { field: "operationId" },
    );
  }
  return body.operationId;
}

function encodeReadResult(result, body) {
  const encoding = encodingFromBody(body, ["encoding", "responseEncoding"]);
  const content = bufferFromResourceContent(result?.content);
  return {
    ...result,
    content: encodeBufferForJson(content, encoding),
    encoding,
  };
}

function decodeWriteContent(body) {
  const encoding = encodingFromBody(body, ["encoding", "contentEncoding"]);
  if (encoding === "base64") {
    return decodeBase64Content(body?.content);
  }
  return String(body?.content ?? "");
}

function encodingFromBody(body, fields) {
  for (const field of fields) {
    if (body?.[field] !== undefined) return normalizeContentEncoding(body[field]);
  }
  return "utf-8";
}

function normalizeContentEncoding(value) {
  const raw = String(value ?? "utf-8").trim().toLowerCase();
  if (raw === "utf-8" || raw === "utf8") return "utf-8";
  if (raw === "base64") return "base64";
  throw resourceContentEncodingError(`Unsupported resource content encoding: ${String(value)}`);
}

function bufferFromResourceContent(content) {
  if (Buffer.isBuffer(content)) return content;
  if (content instanceof ArrayBuffer) return Buffer.from(content);
  if (ArrayBuffer.isView(content)) {
    return Buffer.from(content.buffer, content.byteOffset, content.byteLength);
  }
  if (typeof content === "string") return Buffer.from(content, "utf-8");
  if (content == null) return Buffer.alloc(0);
  return Buffer.from(String(content), "utf-8");
}

function encodeBufferForJson(content, encoding) {
  if (encoding === "base64") return content.toString("base64");
  try {
    return UTF8_DECODER.decode(content);
  } catch {
    throw resourceContentEncodingError("Resource content is not valid UTF-8; request encoding \"base64\" for binary content");
  }
}

function decodeBase64Content(content) {
  if (typeof content !== "string") {
    throw resourceContentEncodingError("Resource base64 content must be a string");
  }
  const compact = content.replace(/\s+/g, "");
  if (!BASE64_PATTERN.test(compact)) {
    throw resourceContentEncodingError("Resource content is not valid base64");
  }
  return Buffer.from(compact, "base64");
}

async function readKnowledgeContentWithGate(
  resourceIO,
  resource,
  signal,
) {
  throwIfKnowledgeReadAborted(signal);
  const stat = await resourceIO.stat(resource);
  const size = stat?.version?.size;
  if (stat?.exists !== true) {
    throw new KnowledgeWorkspaceError(
      "knowledge_resource_not_found",
      "Knowledge content is unavailable",
    );
  }
  if (
    stat?.isDirectory
    || !Number.isSafeInteger(size)
    || size < 0
    || !hasKnowledgeReadVersion(stat?.version)
  ) {
    throw new KnowledgeWorkspaceError(
      "knowledge_operation_precondition_failed",
      "Knowledge content size is unavailable",
      {
        state: stat?.isDirectory
          ? "not_a_file"
          : !Number.isSafeInteger(size) || size < 0
            ? "content_size_unavailable"
            : "content_version_unavailable",
      },
    );
  }
  assertKnowledgeContentSize(size);

  throwIfKnowledgeReadAborted(signal);
  const opened = await resourceIO.openRead(resource, {
    expectedVersion: stat.version,
    [RESOURCE_READ_PROOF]: stat[RESOURCE_READ_PROOF],
  });
  assertKnowledgeContentSize(opened?.size);
  if (opened.size !== size) {
    throw new KnowledgeWorkspaceError(
      "knowledge_version_conflict",
      "Knowledge content changed after stat",
      { state: "content_size_changed" },
    );
  }

  const chunks = [];
  let byteLength = 0;
  for await (const chunk of opened.body) {
    throwIfKnowledgeReadAborted(signal);
    if (!Buffer.isBuffer(chunk) && !(chunk instanceof Uint8Array)) {
      throw new KnowledgeWorkspaceError(
        "knowledge_resource_unavailable",
        "Knowledge content stream is invalid",
        { state: "invalid_content_chunk" },
      );
    }
    byteLength += chunk.byteLength;
    if (byteLength > size) {
      throw new KnowledgeWorkspaceError(
        "knowledge_transfer_limit_exceeded",
        "Knowledge content exceeds the stat-first hard limit",
        { limit: size, actual: byteLength },
      );
    }
    chunks.push(
      Buffer.from(chunk.buffer, chunk.byteOffset, chunk.byteLength),
    );
  }
  if (byteLength !== size) {
    throw new KnowledgeWorkspaceError(
      "knowledge_version_conflict",
      "Knowledge content changed during read",
      { state: "content_size_changed" },
    );
  }
  return {
    resourceKey: opened.resourceKey,
    resource: opened.resource,
    content: Buffer.concat(chunks, byteLength),
    version: opened.version,
    ...(opened.filePath ? { filePath: opened.filePath } : {}),
  };
}

function hasKnowledgeReadVersion(version) {
  if (!version || typeof version !== "object") return false;
  return (
    Number.isFinite(version.mtimeMs)
    || Number.isFinite(version.sequence)
    || (
      typeof version.sha256 === "string"
      && version.sha256.length > 0
    )
    || (
      typeof version.etag === "string"
      && version.etag.length > 0
    )
  );
}

function assertKnowledgeContentSize(size) {
  if (
    !Number.isSafeInteger(size)
    || size < 0
    || size > KNOWLEDGE_MARKDOWN_MAX_BYTES
  ) {
    throw new KnowledgeWorkspaceError(
      "knowledge_transfer_limit_exceeded",
      "Knowledge content exceeds the V1 hard limit",
      {
        limit: KNOWLEDGE_MARKDOWN_MAX_BYTES,
        actual: Number.isFinite(size)
          ? Math.max(0, size)
          : KNOWLEDGE_MARKDOWN_MAX_BYTES + 1,
      },
    );
  }
}

function throwIfKnowledgeReadAborted(signal) {
  if (!signal?.aborted) return;
  const error = new Error("knowledge content read aborted");
  error.name = "AbortError";
  throw error;
}

async function resourceJson(c, engine, handler, {
  rejectMutationAuthority = false,
  allowScopedKnowledgeMutation = false,
  responseKind = null,
  allowedFields = null,
} = {}) {
  try {
    const body = await safeJson(c);
    // Knowledge-address routes already apply their stricter schema first and
    // retain the stable knowledge_operation_precondition_failed envelope.
    // Legacy ResourceRef routes have no equivalent top-level schema, so they
    // must reject authority fields here for both reads and mutations.
    if (body?.address === undefined || rejectMutationAuthority) {
      rejectMutationAuthorityFields(body, { recursive: true });
    }
    if (rejectMutationAuthority) {
      createHonoResourceOperationContext(c, {
        reason: body?.reason || "resource_io_route",
        allowScopedKnowledgeMutation:
          allowScopedKnowledgeMutation
          && (
            body?.address !== undefined
            || body?.sourceAddress !== undefined
            || body?.targetDirectoryAddress !== undefined
          ),
      });
    }
    if (allowedFields) rejectUnexpectedFields(body, allowedFields);
    rejectUnsafeRemoteResourceRefs(c, body);
    const resourceIO = engine.resourceIO || engine.getResourceIO?.();
    if (!resourceIO) return c.json({ error: "resource io unavailable" }, 500);
    const result = await handler(resourceIO, body);
    if (isConflictResult(result)) {
      return c.json(projectResourceResponse(c, {
        ...result,
        safeMessage: result.safeMessage || "Resource write conflict",
      }, responseKind), 409);
    }
    return c.json(projectResourceResponse(c, result, responseKind));
  } catch (err) {
    return errorJson(c, err, 500);
  }
}

function rejectUnexpectedFields(body, allowedFields) {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new KnowledgeWorkspaceError(
      "knowledge_operation_precondition_failed",
      "Resource request body must be an object",
      { field: "body" },
    );
  }
  for (const field of Object.keys(body)) {
    if (!allowedFields.has(field)) {
      throw new KnowledgeWorkspaceError(
        "knowledge_operation_precondition_failed",
        "Resource request body contains an unexpected field",
        { field },
      );
    }
  }
}

function strictMutationResourceRef(value, field) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new KnowledgeWorkspaceError(
      "knowledge_operation_precondition_failed",
      "Resource mutation requires a resource reference",
      { field },
    );
  }
  const kind = value.kind;
  const allowed = typeof kind === "string"
    && Object.prototype.hasOwnProperty.call(RESOURCE_REF_FIELDS, kind)
    ? RESOURCE_REF_FIELDS[kind]
    : null;
  if (!allowed) {
    throw new KnowledgeWorkspaceError(
      "knowledge_operation_precondition_failed",
      "Resource mutation reference kind is unsupported",
      { field },
    );
  }
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) {
      throw new KnowledgeWorkspaceError(
        "knowledge_operation_precondition_failed",
        "Resource mutation reference contains an unexpected field",
        { field: `${field}.${key}` },
      );
    }
  }
  const valid = kind === "local-file"
    ? nonEmptyString(value.path)
    : kind === "mount"
      ? nonEmptyString(value.mountId) && typeof value.path === "string"
      : kind === "resource"
        ? nonEmptyString(value.resourceId)
        : kind === "session-file"
          ? nonEmptyString(value.fileId)
          : nonEmptyString(value.url);
  if (!valid) {
    throw new KnowledgeWorkspaceError(
      "knowledge_operation_precondition_failed",
      "Resource mutation reference is incomplete",
      { field },
    );
  }
  return value;
}

function mutationExpectedVersion(body) {
  const present = body?.expectedVersion !== undefined;
  if (!present) return { present: false, value: undefined };
  const value = body?.expectedVersion;
  if (value === null) return { present: true, value: null };
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new KnowledgeWorkspaceError(
      "knowledge_operation_precondition_failed",
      "Resource expected version must be an object",
      { field: "expectedVersion" },
    );
  }
  const allowed = new Set(["mtimeMs", "size", "sha256", "etag", "sequence"]);
  const keys = Object.keys(value);
  if (keys.length === 0) {
    throw new KnowledgeWorkspaceError(
      "knowledge_operation_precondition_failed",
      "Resource expected version must not be empty",
      { field: "expectedVersion" },
    );
  }
  for (const key of keys) {
    if (!allowed.has(key)) {
      throw new KnowledgeWorkspaceError(
        "knowledge_operation_precondition_failed",
        "Resource expected version contains an unexpected field",
        { field: `expectedVersion.${key}` },
      );
    }
  }
  if (
    ("mtimeMs" in value && !finiteNumber(value.mtimeMs))
    || (
      "size" in value
      && value.size !== null
      && (!finiteNumber(value.size) || value.size < 0)
    )
    || ("sequence" in value && (!finiteNumber(value.sequence) || value.sequence < 0))
    || ("sha256" in value && !nonEmptyString(value.sha256))
    || ("etag" in value && !nonEmptyString(value.etag))
  ) {
    throw new KnowledgeWorkspaceError(
      "knowledge_operation_precondition_failed",
      "Resource expected version is invalid",
      { field: "expectedVersion" },
    );
  }
  return { present: true, value };
}

function nonEmptyString(value) {
  return typeof value === "string" && value.length > 0;
}

function finiteNumber(value) {
  return typeof value === "number" && Number.isFinite(value);
}

function isConflictResult(result) {
  return Boolean(result?.ok === false && result?.conflict === true);
}

function numericCursor(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.floor(n);
}

function resourceEventsSince(engine, sequence) {
  if (typeof engine?.resourceEventsSince === "function") {
    return engine.resourceEventsSince(sequence);
  }
  const bus = engine?.resourceEventBus || engine?.getResourceIO?.()?.eventBus || engine?.resourceIO?.eventBus;
  if (bus && typeof bus.since === "function") {
    return bus.since(sequence);
  }
  throw Object.assign(
    new Error("resource event catch-up unavailable"),
    { code: "resource_event_catch_up_unavailable" },
  );
}

function errorJson(c, err, _fallbackStatus = 500) {
  const envelope = toKnowledgeErrorEnvelope(err);
  if (envelope) {
    return c.json({
      error: "Knowledge resource operation failed",
      ...envelope,
    }, envelope.httpStatus);
  }
  const publicContractError = toPublicKnowledgeErrorEnvelope(err);
  if (publicContractError) {
    return c.json({
      error: "Invalid knowledge contract value",
      ...publicContractError,
    }, publicContractError.httpStatus);
  }
  const snapshot = snapshotOwnData(err, 20);
  const compatibility = compatibilityRouteError(snapshot);
  if (compatibility) return c.json(compatibility.body, compatibility.status);
  return c.json({
    error: "Resource operation failed",
    code: "resource_operation_failed",
    safeMessage: "Resource operation failed",
  }, 500);
}

function compatibilityRouteError(snapshot) {
  const definitions = new Map([
    ["forbidden_resource_authority_field", [400, "Resource mutation authority must come from authenticated context"]],
    ["resource_path_not_remote_safe", [403, "Remote resource request is not allowed"]],
    ["invalid_resource_encoding", [400, "Resource content encoding is invalid"]],
    ["resource_auth_context_invalid", [403, "Authenticated resource owner and scope required"]],
  ]);
  const definition = snapshot && typeof snapshot.code === "string" ? definitions.get(snapshot.code) : null;
  if (!definition) return null;
  const details = safeErrorDetails(snapshot.details);
  return {
    status: definition[0],
    body: {
      error: definition[1],
      code: snapshot.code,
      safeMessage: definition[1],
      ...(details ? { details } : {}),
    },
  };
}

function projectResourceResponse(c, result, responseKind) {
  const authPrincipal = honoAuthPrincipal(c);
  if (authPrincipal && principalOwnsLocalConnection(authPrincipal)) {
    return responseKind === "transfer" ? { ok: true, ...result } : result;
  }
  const version = safeResourceVersion(result?.version);
  switch (responseKind) {
    case "stat":
      return compactObject({
        exists: Boolean(result?.exists),
        isDirectory: Boolean(result?.isDirectory),
        version,
      });
    case "read":
      return compactObject({
        content: result?.content,
        encoding: result?.encoding,
        version,
      });
    case "list":
      return {
        items: Array.isArray(result?.items)
          ? result.items.map(safeListItem)
          : [],
      };
    case "search":
      return {
        matches: Array.isArray(result?.matches)
          ? result.matches.map(safeSearchMatch)
          : [],
      };
    case "mutation":
      if (isConflictResult(result)) {
        return compactObject({
          ok: false,
          conflict: true,
          version,
          safeMessage: "Resource write conflict",
        });
      }
      return compactObject({
        ok: true,
        changeType:
          result?.changeType === "created" || result?.changeType === "modified"
            ? result.changeType
            : undefined,
        version,
      });
    case "move":
      return { ok: true };
    case "trash":
      return compactObject({
        ok: true,
        trashId:
          typeof result?.trashId === "string" ? result.trashId : undefined,
      });
    case "transfer":
      return compactObject({
        ok: true,
        target:
          result?.knowledgeTargetAddress
          || safeRemoteTransferTarget(result?.target),
        version:
          typeof result?.version === "string" ? result.version : undefined,
        bytesTransferred: finiteNumberOrUndefined(result?.bytesTransferred),
      });
    default:
      return {};
  }
}

function safeRemoteTransferTarget(target) {
  if (!isRemoteSafeResourceRef(target)) return undefined;
  if (target.kind === "mount") {
    return { kind: "mount", mountId: target.mountId, path: target.path };
  }
  return { kind: "resource", resourceId: target.resourceId };
}

function honoAuthPrincipal(c) {
  if (typeof c?.get !== "function") return null;
  try {
    return c.get("authPrincipal") ?? null;
  } catch {
    return null;
  }
}

function isLocalLoopbackRequest(c) {
  const authPrincipal = honoAuthPrincipal(c);
  return Boolean(
    authPrincipal && principalOwnsLocalConnection(authPrincipal),
  );
}

function projectRemoteResourceEvents(result) {
  const events = Array.isArray(result?.events) ? result.events : [];
  const requiresResync = result?.stale === true || events.length > 0;
  return compactObject({
    stale: requiresResync,
    latestSequence: finiteNumberOrUndefined(result?.latestSequence),
    events: [],
    resync:
      requiresResync
        ? "resource-stat-required"
        : undefined,
  });
}

function safeResourceVersion(version) {
  if (!version || typeof version !== "object" || Array.isArray(version)) {
    return undefined;
  }
  return compactObject({
    mtimeMs: finiteNumberOrUndefined(version.mtimeMs),
    size:
      version.size === null
        ? null
        : finiteNumberOrUndefined(version.size),
    sha256: stringOrUndefined(version.sha256),
    etag: stringOrUndefined(version.etag),
    sequence: finiteNumberOrUndefined(version.sequence),
  });
}

function safeListItem(item) {
  return compactObject({
    name: stringOrUndefined(item?.name),
    isDirectory:
      typeof item?.isDirectory === "boolean" ? item.isDirectory : undefined,
    size:
      item?.size === null ? null : finiteNumberOrUndefined(item?.size),
    mtimeMs: finiteNumberOrUndefined(item?.mtimeMs),
  });
}

function safeSearchMatch(match) {
  return compactObject({
    line: finiteNumberOrUndefined(match?.line),
    text: stringOrUndefined(match?.text),
    name: stringOrUndefined(match?.name),
    relativePath: safeRelativePathOrUndefined(match?.relativePath),
    parentSubdir: safeRelativePathOrUndefined(match?.parentSubdir),
    isDirectory:
      typeof match?.isDirectory === "boolean"
        ? match.isDirectory
        : undefined,
    size:
      match?.size === null ? null : finiteNumberOrUndefined(match?.size),
    mtimeMs: finiteNumberOrUndefined(match?.mtimeMs),
  });
}

function safeRelativePathOrUndefined(value) {
  const parsed = parseKnowledgeResourceAddress({
    sourceKey: "validation",
    relativePath: value,
  });
  return parsed.ok ? parsed.value.relativePath : undefined;
}

function finiteNumberOrUndefined(value) {
  return typeof value === "number" && Number.isFinite(value)
    ? value
    : undefined;
}

function stringOrUndefined(value) {
  return typeof value === "string" ? value : undefined;
}

function compactObject(value) {
  return Object.fromEntries(
    Object.entries(value).filter(([, entry]) => entry !== undefined),
  );
}

function rejectMutationAuthorityFields(body, { recursive = false } = {}) {
  if (!body || typeof body !== "object" || Array.isArray(body)) return;
  for (const field of Object.keys(body)) {
    if (MUTATION_AUTHORITY_FIELDS.has(field)) {
      throw forbiddenResourceAuthorityField(field);
    }
    if (recursive) {
      rejectNestedMutationAuthorityFields(body[field]);
    }
  }
}

function rejectNestedMutationAuthorityFields(value) {
  if (!value || typeof value !== "object") return;
  if (Array.isArray(value)) {
    for (const item of value) rejectNestedMutationAuthorityFields(item);
    return;
  }
  rejectMutationAuthorityFields(value, { recursive: true });
}

function forbiddenResourceAuthorityField(field) {
  return Object.assign(
    new Error(
      "Resource mutation authority must come from authenticated context",
    ),
    {
      code: "forbidden_resource_authority_field",
      status: 400,
      safeMessage:
        "Resource mutation authority must come from authenticated context",
      details: { field },
    },
  );
}

function validateWatchRequest(c, body, { subscription = false } = {}) {
  rejectMutationAuthorityFields(body, { recursive: true });
  createHonoResourceOperationContext(c, {
    reason: subscription
      ? "resource_io_subscribe"
      : "resource_io_watch",
  });
  rejectUnsafeRemoteResourceRefs(c, body, { subscription });
}

async function resolveSubscriptionRequest(c, engine, body) {
  rejectMutationAuthorityFields(body, { recursive: true });
  const sourceKeys = body?.sourceKeys;
  if (sourceKeys !== undefined) {
    rejectUnexpectedFields(
      body,
      new Set(["purpose", "sourceKeys"]),
    );
    if (
      !Array.isArray(sourceKeys)
      || sourceKeys.length === 0
      || sourceKeys.length > 64
      || new Set(sourceKeys).size !== sourceKeys.length
    ) {
      throw new KnowledgeWorkspaceError(
        "knowledge_operation_precondition_failed",
        "Knowledge source watch requires unique source keys",
        { field: "sourceKeys" },
      );
    }
    const resources = await Promise.all(sourceKeys.map((sourceKey) =>
      resolveKnowledgeSourceRootForRequest(
        c,
        engine,
        sourceKey,
        "files.read",
      )));
    return {
      input: {
        ...(typeof body?.purpose === "string"
          ? { purpose: body.purpose }
          : {}),
        resources,
      },
      ownerKey: isLocalLoopbackRequest(c)
        ? null
        : remoteResourceSubscriptionOwnerKey(c),
    };
  }

  if (!isLocalLoopbackRequest(c)) {
    throw Object.assign(
      new Error("Remote resource watches require Knowledge source keys"),
      {
        code: "resource_path_not_remote_safe",
        status: 403,
        safeMessage:
          "Remote resource watches require Knowledge source keys",
      },
    );
  }
  validateWatchRequest(c, body, { subscription: true });
  return { input: body, ownerKey: null };
}

function remoteResourceSubscriptionOwnerKey(c) {
  const raw = honoAuthPrincipal(c);
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const principal = normalizePrincipal(raw);
  if (
    principal.kind === "unknown"
    || !principal.principalId
    || !principal.studioId
  ) {
    return null;
  }
  return `${principal.studioId}\0${principal.principalId}`;
}

function rejectUnsafeRemoteResourceRefs(c, body, {
  subscription = false,
} = {}) {
  const authPrincipal = honoAuthPrincipal(c);
  if (authPrincipal && principalOwnsLocalConnection(authPrincipal)) return;
  const candidates = [
    typeof body?.kind === "string" ? body : null,
    body?.resource,
    body?.ref,
    body?.target,
    body?.from,
    body?.to,
    body?.oldResource,
    body?.newResource,
    body?.source,
    body?.targetDirectory,
  ];
  if (subscription && Array.isArray(body?.resources)) {
    candidates.push(...body.resources);
  }
  const unsafe = candidates.find(
    (candidate) => candidate && !isRemoteSafeResourceRef(candidate),
  );
  if (!unsafe) return;
  const isLocalFile = unsafe?.kind === "local-file";
  const safeMessage = isLocalFile
    ? "Remote resource requests cannot use local-file references"
    : "Remote resource reference is not safe";
  throw Object.assign(
    new Error(safeMessage),
    {
      code: "resource_path_not_remote_safe",
      status: 403,
      safeMessage,
    },
  );
}

function isRemoteSafeResourceRef(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }
  if (value.kind === "resource") {
    return typeof value.resourceId === "string" && value.resourceId.length > 0;
  }
  if (value.kind === "mount") {
    return typeof value.mountId === "string"
      && value.mountId.length > 0
      && typeof value.path === "string"
      && !value.path.includes("\\")
      && safeRelativePathOrUndefined(value.path) !== undefined;
  }
  return false;
}

function safeErrorDetails(details) {
  const snapshot = snapshotOwnData(details, 1);
  return snapshot
    && Object.keys(snapshot).length === 1
    && typeof snapshot.field === "string"
    && MUTATION_AUTHORITY_FIELDS.has(snapshot.field)
    ? { field: snapshot.field }
    : undefined;
}

function resourceContentEncodingError(message) {
  return Object.assign(new Error(message), {
    code: "invalid_resource_encoding",
    status: 400,
    safeMessage: message,
  });
}
