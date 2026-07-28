import { Hono } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import {
  parseRegisterSourceRequest,
  SourceRegistry,
} from "../../core/knowledge-workspace/source-registry.ts";
import { createSandboxResourceIO } from "../../lib/resource-io/sandbox-resource-io.ts";
import {
  parseKnowledgeResourceAddress,
} from "../../shared/knowledge-workspace-contract.ts";
import {
  createKnowledgeWorkspaceError,
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

export function createKnowledgeWorkspaceRoute(engine) {
  const route = new Hono();
  const registryState = registryStateFor(engine);

  route.get("/knowledge-workspace/sources", async (c) => {
    try {
      const auth = authorize(c, engine, "files.read");
      if (auth.response) return auth.response;
      const registry = await registryFor(c, engine, auth.requestContext, registryState);
      return c.json({ sources: registry.list() });
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
      return c.json({ source }, 201);
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
      return c.json({ ok: true, sourceKey: source.sourceKey });
    } catch (error) {
      return knowledgeRouteError(c, error);
    }
  });

  return route;
}

export async function resolveKnowledgeResourceAddressForRequest(
  c,
  engine,
  input: unknown,
  capability: "files.read" | "files.write",
) {
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
  const defaultRoot = mainRoot.kind === "local-file"
    ? mainRoot.path
    : engine.defaultDeskCwd || engine.homeCwd || engine.deskCwd;
  const resourceIO = createSandboxResourceIO({
    cwd: defaultRoot,
    agentDir: defaultRoot,
    workspace: defaultRoot,
    workspaceFolders: defaultRoot ? [defaultRoot] : [],
    authorizedFolders: defaultRoot ? [defaultRoot] : [],
    hanakoHome: engine.hanakoHome,
    getSandboxEnabled: () => false,
    getSessionPath: () => requestContext?.sessionPath || null,
    emitEvent: () => {},
    studioId,
  });
  return {
    workspaceKey,
    signature,
    registry: await SourceRegistry.create({
      mainRoot,
      mainDisplayName,
      resourceIO,
      hanakoHome: engine.hanakoHome,
      context: createApiResourceOperationContext({
        requestContext,
        requestId: requestIdFromHono(c),
      }) as ResourceOperationContext,
    }),
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

function routeError(message: string, status: number): Error {
  return Object.assign(new Error(message), { status });
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
