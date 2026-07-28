import { isOperationCorrelationId } from "../shared/knowledge-diagnostics.ts";

const EVENT_TYPES = new Set(["resource.changed", "resource.deleted", "resource.renamed"]);
const CHANGE_TYPES = new Set(["created", "modified"]);
const SOURCES = new Set(["agent_tool", "provider_watch", "api", "plugin", "bash_reconcile", "mount", "session_file", "unknown"]);

export function toResourceEventWsMessage(
  input,
  _sessionPath = null,
  suppliedOperationId = null,
  suppliedStudioId = null,
) {
  const event = ownDataRecord(input, 20);
  if (!event || typeof event.type !== "string" || !EVENT_TYPES.has(event.type)) return null;
  if (!Number.isSafeInteger(event.sequence) || event.sequence < 0) return null;
  if (typeof event.occurredAt !== "string" || event.occurredAt.length > 64 || Number.isNaN(Date.parse(event.occurredAt))) return null;
  if (typeof event.source !== "string" || !SOURCES.has(event.source)) return null;

  const base = {
    type: "resource.resync_required",
    ...(typeof suppliedStudioId === "string"
      && suppliedStudioId.length > 0
      && suppliedStudioId.length <= 256
      && !/[\/\\\p{Cc}]/u.test(suppliedStudioId)
      ? { studioId: suppliedStudioId }
      : {}),
    stale: true,
    resync: "resource-stat-required",
    source: event.source,
    sequence: event.sequence,
    occurredAt: event.occurredAt,
  };
  const correlation = isOperationCorrelationId(event.operationId)
    ? { operationId: event.operationId }
    : {};
  const sourceIdentity = isOperationCorrelationId(event.sourceId)
    ? { sourceId: event.sourceId }
    : {};
  if (suppliedOperationId !== null && suppliedOperationId !== correlation.operationId) return null;
  if (event.type === "resource.changed") {
    if (typeof event.changeType !== "string" || !CHANGE_TYPES.has(event.changeType)) return null;
    return { ...base, ...sourceIdentity, ...correlation };
  }
  return { ...base, ...sourceIdentity, ...correlation };
}

function ownDataRecord(value, maxFields) {
  try {
    if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) return null;
    const keys = Reflect.ownKeys(value);
    if (keys.length > maxFields || keys.some((key) => typeof key === "symbol")) return null;
    const output = Object.create(null);
    for (const key of keys) {
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (!descriptor || !("value" in descriptor)) return null;
      output[key] = descriptor.value;
    }
    return output;
  } catch {
    return null;
  }
}
