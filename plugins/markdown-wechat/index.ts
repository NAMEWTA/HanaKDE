import type { PluginContextLike } from "./src/contracts.ts";
import { acquireRuntime, releaseRuntime, type MarkdownWechatRuntime } from "./src/runtime.ts";

export default class MarkdownWechatPlugin {
  ctx!: PluginContextLike;
  private runtime?: MarkdownWechatRuntime;

  onload(): void {
    this.runtime = acquireRuntime(this.ctx);
    const recovery = this.runtime.store.load().recovery;
    if (recovery) this.ctx.log?.warn?.(`markdown-wechat private state recovery required: ${recovery.code}`);
    this.ctx.log?.info?.("markdown-wechat plugin ready");
  }

  onunload(): void {
    if (this.runtime) releaseRuntime(this.ctx);
    this.runtime = undefined;
    this.ctx.log?.info?.("markdown-wechat plugin unloaded");
  }
}
