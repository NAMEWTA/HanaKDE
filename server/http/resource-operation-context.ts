import { normalizePrincipal } from "../../core/security-principal.ts";
import {
  hasStudioOwnerScope,
  scopeSetAllows,
} from "../../shared/access-scope-profiles.ts";

export function createApiResourceOperationContext({
  requestContext = null,
  requestId = null,
  sessionId = null,
  sessionPath = null,
  reason = null,
  principal = null,
} = {}) {
  const authPrincipal = principal && typeof principal === "object"
    ? principal
    : requestContext?.authPrincipal || {};
  const resolvedSessionId = stringOrNull(sessionId ?? authPrincipal.sessionId);
  const resolvedSessionPath = stringOrNull(sessionPath ?? authPrincipal.sessionPath);
  const resolvedRequestId = stringOrNull(requestId ?? authPrincipal.requestId);
  return {
    source: "api",
    ...(reason ? { reason } : {}),
    sessionId: resolvedSessionId,
    sessionPath: resolvedSessionPath,
    requestId: resolvedRequestId,
    principal: {
      kind: "api",
      principalId: stringOrNull(authPrincipal.principalId),
      scopes: Array.isArray(authPrincipal.scopes)
        ? [...authPrincipal.scopes]
        : [],
      userId: stringOrNull(requestContext?.userId ?? authPrincipal.userId),
      studioId: stringOrNull(requestContext?.studioId ?? authPrincipal.studioId),
      sessionId: resolvedSessionId,
      sessionPath: resolvedSessionPath,
      connectionKind: stringOrNull(requestContext?.connectionKind ?? authPrincipal.connectionKind),
      credentialKind: stringOrNull(requestContext?.credentialKind ?? authPrincipal.credentialKind),
      requestId: resolvedRequestId,
    },
  };
}

export function createHonoResourceOperationContext(c, {
  reason = null,
  allowScopedKnowledgeMutation = false,
} = {}) {
  const rawAuthPrincipal = honoContextValue(c, "authPrincipal");
  const authPrincipal = authorizedResourcePrincipal(
    rawAuthPrincipal,
    allowScopedKnowledgeMutation,
  );
  const transportConnectionKind = honoContextValue(
    c,
    "transportConnectionKind",
  );
  const requestContext = {
    authPrincipal,
    userId: authPrincipal?.userId,
    studioId: authPrincipal?.studioId,
    connectionKind:
      authPrincipal?.connectionKind ?? transportConnectionKind,
    credentialKind: authPrincipal?.credentialKind,
  };

  return createApiResourceOperationContext({
    requestContext,
    requestId: requestIdFromHono(c),
    reason,
  });
}

export function requestIdFromHono(c) {
  return stringOrNull(c?.req?.header?.("x-request-id")) || stringOrNull(c?.req?.header?.("x-correlation-id"));
}

function honoContextValue(c, key) {
  if (typeof c?.get !== "function") return null;
  try {
    return c.get(key) ?? null;
  } catch {
    return null;
  }
}

function authorizedResourcePrincipal(
  rawPrincipal,
  allowScopedKnowledgeMutation = false,
) {
  if (
    !rawPrincipal
    || typeof rawPrincipal !== "object"
    || Array.isArray(rawPrincipal)
  ) {
    throw invalidResourceAuthContext();
  }
  const principal = normalizePrincipal(rawPrincipal);
  const isLocalOwner =
    principal.kind === "local_user"
    && principal.connectionKind === "local"
    && principal.credentialKind === "loopback_token";
  if (
    principal.kind === "unknown"
    || typeof principal.principalId !== "string"
    || principal.principalId.length === 0
  ) {
    throw invalidResourceAuthContext();
  }
  if (isLocalOwner) {
    if (!Array.isArray(principal.scopes) || principal.scopes.length === 0) {
      throw invalidResourceAuthContext();
    }
    return principal;
  }
  if (
    typeof principal.studioId !== "string"
    || principal.studioId.length === 0
    || !scopeSetAllows(principal.scopes, "files.write")
    || (
      !allowScopedKnowledgeMutation
      && !hasStudioOwnerScope(principal.scopes)
    )
  ) {
    throw invalidResourceAuthContext();
  }
  return principal;
}

function invalidResourceAuthContext() {
  return Object.assign(
    new Error("Authenticated resource owner and scope required"),
    {
      code: "resource_auth_context_invalid",
      status: 403,
      safeMessage: "Authenticated resource owner and scope required",
    },
  );
}

function stringOrNull(value) {
  return typeof value === "string" && value ? value : null;
}
