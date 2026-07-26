import crypto from "crypto";
import { TextDecoder } from "util";
import { Hono } from "hono";
import { principalOwnsLocalConnection } from "../../core/security-principal.ts";
import { parseKnowledgeResourceAddress } from "../../shared/knowledge-workspace-contract.ts";
import { snapshotOwnData, toKnowledgeErrorEnvelope, toPublicKnowledgeErrorEnvelope } from "../../shared/knowledge-workspace-errors.ts";
import { safeJson } from "../hono-helpers.ts";
import { createHonoResourceOperationContext } from "../http/resource-operation-context.ts";

const UTF8_DECODER = new TextDecoder("utf-8", { fatal: true });
const BASE64_PATTERN = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;
const MUTATION_AUTHORITY_FIELDS = new Set([
  "principal",
  "principalId",
  "userId",
  "studioId",
  "owner",
  "ownerId",
  "scope",
  "scopes",
  "scopeToken",
  "sessionId",
  "sessionPath",
  "connectionKind",
  "credentialKind",
]);

export function createResourceIoRoute(engine) {
  const route = new Hono();
  const releases = new Map();

  route.post("/resource-io/subscribe", async (c) => {
    try {
      const body = await safeJson(c);
      validateWatchRequest(c, body, { subscription: true });
      const subscribe = engine.subscribeResourceWatch?.(body);
      if (!subscribe?.subscriptionId) {
        return c.json({ error: "resource watch unavailable" }, 500);
      }
      const result = { ok: true, ...subscribe };
      return c.json(
        isLocalLoopbackRequest(c)
          ? result
          : {
              ok: true,
              subscriptionId: subscribe.subscriptionId,
            },
      );
    } catch (err) {
      return errorJson(c, err);
    }
  });

  route.delete("/resource-io/subscriptions/:subscriptionId", (c) => {
    const subscriptionId = c.req.param("subscriptionId");
    const released = Boolean(engine.unsubscribeResourceWatch?.(subscriptionId));
    return c.json({ ok: true, released });
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
    releases.delete(watchId);
    release();
    return c.json({ ok: true, released: true });
  });

  route.post("/resource-io/stat", async (c) => resourceJson(c, engine, async (resourceIO, body) => {
    const resource = body?.resource || body?.ref || body?.target || body;
    return resourceIO.stat(resource);
  }, { responseKind: "stat" }));

  route.post("/resource-io/read", async (c) => resourceJson(c, engine, async (resourceIO, body) => {
    const resource = body?.resource || body?.ref || body?.target || body;
    const result = await resourceIO.read(resource);
    return encodeReadResult(result, body);
  }, { responseKind: "read" }));

  route.post("/resource-io/list", async (c) => resourceJson(c, engine, async (resourceIO, body) => {
    const resource = body?.resource || body?.ref || body?.target || body;
    return resourceIO.list(resource);
  }, { responseKind: "list" }));

  route.post("/resource-io/search", async (c) => resourceJson(c, engine, async (resourceIO, body) => {
    const resource = body?.resource || body?.ref || body?.target || body;
    return resourceIO.search(resource, { query: body?.query });
  }, { responseKind: "search" }));

  route.post("/resource-io/write", async (c) => resourceJson(c, engine, async (resourceIO, body) => {
    const resource = body?.resource || body?.ref || body?.target;
    return resourceIO.write(resource, decodeWriteContent(body), operationContextFromBody(body, c));
  }, { rejectMutationAuthority: true, responseKind: "mutation" }));

  route.post("/resource-io/write-expected-version", async (c) => resourceJson(c, engine, async (resourceIO, body) => {
    const resource = body?.resource || body?.ref || body?.target;
    return resourceIO.writeExpectedVersion(
      resource,
      decodeWriteContent(body),
      body?.expectedVersion,
      operationContextFromBody(body, c),
    );
  }, { rejectMutationAuthority: true, responseKind: "mutation" }));

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

  return route;
}

function operationContextFromBody(body, c) {
  return createHonoResourceOperationContext(c, {
    reason: body?.reason || "resource_io_route",
  });
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

async function resourceJson(c, engine, handler, {
  rejectMutationAuthority = false,
  responseKind = null,
} = {}) {
  try {
    const body = await safeJson(c);
    if (rejectMutationAuthority) {
      rejectMutationAuthorityFields(body);
      createHonoResourceOperationContext(c, {
        reason: body?.reason || "resource_io_route",
      });
    }
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
    return result;
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
    default:
      return {};
  }
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
