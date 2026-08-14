import { createHash, randomUUID } from "node:crypto";
import type { ResourceRef } from "../domain/model.ts";
import { stableJson } from "../domain/utils.ts";

export interface EventBusLike {
  request?<T = unknown>(type: string, payload?: unknown, options?: Record<string, unknown>): Promise<T>;
  emit?(event: Record<string, unknown>, sessionPath?: string | null): void;
  subscribe?(callback: (event: unknown, sessionPath?: string | null) => void, filter?: Record<string, unknown>): () => void;
}

export interface ResourceMaterializeResult {
  path?: string;
  filePath?: string;
  realPath?: string;
  localPath?: string;
  [key: string]: unknown;
}

export interface ResourcesLike {
  materialize?(ref: ResourceRef | Record<string, unknown>): Promise<ResourceMaterializeResult>;
}

export interface LoggerLike {
  debug?(...args: unknown[]): void;
  info?(...args: unknown[]): void;
  warn?(...args: unknown[]): void;
  error?(...args: unknown[]): void;
}

export interface PluginContextLike {
  pluginId?: string;
  pluginDir?: string;
  dataDir: string;
  serverId?: string;
  serverNodeId?: string;
  userId?: string;
  studioId?: string;
  sessionId?: string | null;
  sessionRef?: { sessionId?: string | null; sessionPath?: string | null } | null;
  sessionPath?: string | null;
  agentId?: string | null;
  bus?: EventBusLike;
  resources?: ResourcesLike;
  log?: LoggerLike;
  stageFile?: (input: Record<string, unknown>) => unknown;
  [key: string]: unknown;
}

export interface InvocationContext {
  pluginId: string;
  actorKey: string;
  sessionKey: string;
  correlationId: string;
  bus?: EventBusLike;
  resources?: ResourcesLike;
  log?: LoggerLike;
  stageFile?: (input: Record<string, unknown>) => unknown;
  agentId?: string;
}

function firstText(...values: unknown[]): string | undefined {
  return values.find((value): value is string => typeof value === "string" && Boolean(value.trim()))?.trim();
}

export function actorKeyFrom(value: unknown, fallback = "local-owner"): string {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    const direct = firstText(record.userId, record.platformAccountId, record.id, record.subject, record.actorId);
    if (direct) return direct;
    return `principal:${createHash("sha256").update(stableJson(record)).digest("hex").slice(0, 24)}`;
  }
  return fallback;
}

export function invocationFromPluginContext(ctx: PluginContextLike, overrides: Partial<InvocationContext> = {}): InvocationContext {
  const sessionKey = firstText(ctx.sessionId, ctx.sessionRef?.sessionId, ctx.sessionRef?.sessionPath, ctx.sessionPath) ?? "no-session";
  return {
    pluginId: firstText(ctx.pluginId) ?? "todolist",
    actorKey: firstText(ctx.userId) ?? "local-owner",
    sessionKey,
    correlationId: randomUUID(),
    bus: ctx.bus,
    resources: ctx.resources,
    log: ctx.log,
    stageFile: ctx.stageFile,
    agentId: firstText(ctx.agentId),
    ...overrides,
  };
}

export function requestContextFromHono(c: { get?: (key: string) => unknown }, root: PluginContextLike): InvocationContext {
  const pluginRequestContext = c.get?.("pluginRequestContext") as Record<string, unknown> | undefined;
  const principal = pluginRequestContext?.principal;
  const scopedBus = pluginRequestContext?.bus as EventBusLike | undefined;
  const session = pluginRequestContext?.session as Record<string, unknown> | undefined;
  const sessionKey = firstText(
    session?.sessionId,
    session?.sessionPath,
    (principal as Record<string, unknown> | undefined)?.sessionId,
    root.sessionId,
    root.sessionRef?.sessionId,
    root.sessionPath,
  ) ?? "route-session";
  return invocationFromPluginContext(root, {
    actorKey: actorKeyFrom(principal, firstText(root.userId) ?? "local-owner"),
    sessionKey,
    // HTTP side effects must use the host-provided, request-scoped capability
    // bus. Falling back to the lifecycle bus would bypass principal narrowing.
    bus: scopedBus,
  });
}

export function invocationFromToolContext(ctx: PluginContextLike): InvocationContext {
  const principal = (ctx as Record<string, unknown>).principal;
  return invocationFromPluginContext(ctx, {
    actorKey: actorKeyFrom(principal, firstText(ctx.userId) ?? "local-owner"),
  });
}
