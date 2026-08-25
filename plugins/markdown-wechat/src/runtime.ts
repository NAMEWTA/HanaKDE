import type { PluginContextLike } from "./contracts.ts";
import { PrivateDocumentStore } from "./store.ts";

export interface MarkdownWechatRuntime {
  ctx: PluginContextLike;
  store: PrivateDocumentStore;
}

const runtimes = new Map<string, { runtime: MarkdownWechatRuntime; refs: number }>();

export function acquireRuntime(ctx: PluginContextLike): MarkdownWechatRuntime {
  const current = runtimes.get(ctx.dataDir);
  if (current) {
    current.refs += 1;
    return current.runtime;
  }
  const runtime = { ctx, store: new PrivateDocumentStore(ctx.dataDir) };
  runtimes.set(ctx.dataDir, { runtime, refs: 1 });
  return runtime;
}

export function getRuntime(ctx: PluginContextLike): MarkdownWechatRuntime {
  const current = runtimes.get(ctx.dataDir);
  if (current) return current.runtime;
  const runtime = { ctx, store: new PrivateDocumentStore(ctx.dataDir) };
  runtimes.set(ctx.dataDir, { runtime, refs: 0 });
  return runtime;
}

export function releaseRuntime(ctx: PluginContextLike): void {
  const current = runtimes.get(ctx.dataDir);
  if (!current) return;
  current.refs -= 1;
  if (current.refs <= 0) runtimes.delete(ctx.dataDir);
}

export function disposeRuntime(ctx: PluginContextLike): void {
  runtimes.delete(ctx.dataDir);
}

export function runtimeCount(): number {
  return runtimes.size;
}
