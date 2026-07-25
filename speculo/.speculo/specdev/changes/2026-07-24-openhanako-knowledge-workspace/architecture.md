# OpenHanako 知识工作区架构

本文件是 `ADR.md`、`CONTEXT.md`、`LOG.md` 的代码结构投影。它把最终设计映射到当前 HanaKDE/OpenHanako 模块、调用、持久化、并发和恢复，不创造平行产品语义。

## 1. 事实基线与约束

实现位于当前仓库根目录，复用现有：

- Open/Full composition：`server/composition/open-root.ts`、`full-root.ts`。
- ResourceIO/provider/event：`lib/resource-io/`、`server/routes/resource-io.ts`、ResourceEventBus。
- 编辑器：`desktop/src/react/components/PreviewEditor.tsx` 与 `desktop/src/react/editor/`。
- Electron：`desktop/preload.cjs`、`desktop/main.cjs`、现有 `window.hana`。
- 测试与构建：Vitest、Vite、open server build/smoke。

实施前按 [`implementation-baseline.md`](./implementation-baseline.md) 与 [`README.md`](./README.md) 完成仓库 preflight 核对。

## 2. 目标组件

```text
Desktop / LAN / Mobile Renderer
  ├─ knowledge-workspace-client ───────────────┐
  └─ window.hana knowledgeNative* (Desktop)    │
                                                ▼
Open composition
  /api/resource-io/*
  /api/knowledge-workspace/*
       └─ Engine public facade
            ├─ SourceRegistry
            ├─ KnowledgeOperationCoordinator
            │    └─ DurableOperationJournal
            ├─ KnowledgeIndexCoordinator
            │    └─ per-source SQLite generations
            ├─ NativeGrantService
            └─ ResourceIO / ResourceEventBus

Full composition
  └─ Desk compatibility facade + full UI injection
```

Knowledge 不是新顶级应用、第二个 server 或第二套文件系统。Open 中核心协议可独立成立；Full 只注入产品差异。

## 3. 地址与来源根身份

跨端 DTO：

```ts
type KnowledgeResourceAddress = { sourceKey: string; relativePath: string };
type KnowledgeSourceDto = {
  sourceKey: string;
  displayName: string;
  role: 'main' | 'mounted';
  capabilities: Array<'read'|'write'|'list'|'watch'>;
  availability: 'available'|'unavailable'|'recovering';
};
```

Server 内 SourceRegistry 通过 `ProviderRootIdentityResolver` 把 address 映射到既有 ResourceRef。Renderer 不接收 resolvedPath、root identity 或 scope token。

注册流程：schema → owner/scope → provider capability → root identity → 与全部活动根比较 → sourceKey 冲突 → commit。任何 relation 不是 `disjoint` 都拒绝。

## 4. Public API

普通单资源操作继续走 `/api/resource-io/*`，补齐 provider 已支持但 HTTP 未暴露的 copy/mkdir/delete，同时保持 capability 语义。

```text
GET    /api/knowledge-workspace/sources
POST   /api/knowledge-workspace/sources
DELETE /api/knowledge-workspace/sources/:sourceKey

POST   /api/knowledge-workspace/operations/plan
POST   /api/knowledge-workspace/operations/:operationId/commit
POST   /api/knowledge-workspace/operations/:operationId/cancel
GET    /api/knowledge-workspace/operations/:operationId

GET    /api/knowledge-workspace/index/status
POST   /api/knowledge-workspace/index/rebuild
POST   /api/knowledge-workspace/query
POST   /api/knowledge-workspace/search

POST   /api/knowledge-workspace/native-grants
POST   /api/knowledge-workspace/native-grants/:grantId/consume  # Main only
POST   /api/knowledge-workspace/native-import                  # Main only
```

Main-only route 必须验证 loopback、server token、desktop process identity 与一次性 nonce；LAN/Mobile 不可调用。

## 5. 复合操作与恢复

所有复合 mutation 通过 coordinator 与 DurableOperationJournal。operation 状态、幂等、prepare、commit、rollback、启动恢复严格遵守 `operation-journal-contract.md`。

地址锁 key 为 `sourceKey + relativePath`，按字节稳定排序获取。高风险操作在副作用前建立 checkpoint。ResourceEvent、watcher、index 和诊断携带同一 operationId。mutation route 在 recovery barrier 完成前不可用。

对 copy/import/delete/restore，批次允许资源级部分完成；每个目录必须通过 sibling staging 完整提交，正式目标不能出现半棵树。同源 rename/move 的文件、链接写入、session identity 与 index convergence 是一个可恢复用户操作。

## 6. 文档状态与保存

DocumentSession 以 KnowledgeResourceAddress 为键，持有 buffer、baseline、diskVersion、history、dirty、conflict、orphan。DocumentView 以 view id 为键，持有 cursor、selection、scroll、mode 和 group。

Knowledge 手动 expected-version save；Preview 保留现有 600ms autosave。未保存 buffer 不进入 Server index。clean 外部变化自动重读；dirty 外部变化保留 baseline/local/disk 三方状态。关闭、退出和 workspace switch 使用同一逐文档流程。

## 7. Markdown 与 CM6

`lib/knowledge-workspace/markdown-knowledge-ir.ts` 是 Renderer/Server 共享文本语义；CM6 tree 只存在 Renderer。`MarkdownEditorSurface` 通过 policy 注入 save、attachment、link open 与 content gate，避免复制 PreviewEditor。

所有 command 产生单一 CM6 transaction；Wikilink、Markdown link、frontmatter、tags/tasks、Mermaid/math/footnote/HTML、find/replace 和 embed 使用同一 fixture/IR 边界。

## 8. 索引

每来源索引遵守 `index-store-contract.md`：better-sqlite3、schema v1、独立 generation、`current.json` 原子切换、单 writer、writer lock、query lease、rebuild replay。

```text
saved disk
  -> Content Gate
  -> MarkdownExtractor | SafeTextExtractor | MetadataOnly
  -> active generation transaction

full rebuild
  -> build-<id>.sqlite
  -> quick_check + scope revalidation
  -> generation-<id>.sqlite
  -> atomic current.json switch
```

ResourceEvent 是失效提示。Coordinator 按 sequence、operationId、100ms debounce、磁盘重读收敛；gap/burst 触发 reconcile。当前 outline/outbound 可以读 Renderer buffer；backlinks/tags/search 只读已保存 generation。

## 9. Native Bridge

现有 `window.hana` 新增两个方法，不新增任意 path API。Renderer 用 Server address 创建 grant，Main 消费 grant 后执行 open/reveal/trash。Picker/clipboard 由 Main 把本机路径直接提交本地 Server 导入 route。Open Server 明确返回 capability unavailable。

Native grant 与 owner、window、action、address、version 绑定，60 秒单次消费；不跨窗口。系统 trash 的成功/失败继续写 operation journal，只有 Main 确认成功后更新 `.trash` manifest。

## 10. 内部存储边界

```text
<HANA_HOME>/knowledge-workspace/index/v1/...
<HANA_HOME>/knowledge-workspace/operations/v1/...
<HANA_HOME>/knowledge-workspace/source-bindings/v1.json
```

这些目录不属于来源。来源内唯一内部区域是 `.trash/`，普通 list/search/index/link resolver 排除，trash service 专用访问。任何内部目录 identity 变化都 fail-closed。

## 11. 多窗口与生命周期

Server 是 SourceRegistry、journal 与 index 的唯一 owner。多个 Renderer 通过 session/window context 获取投影；不得把 editor/session registry 放到全局模块单例而忽略窗口生命周期。相同资源的 expected-version 仍是最终并发保护；native grant 和 UI state 不跨 window。

## 12. 安全与诊断

所有外部 body 以 unknown 接收并 schema 校验。owner、scope、provider capability、root identity 和 path guard fail-closed。HTML/SVG/Mermaid/URI 按内容门禁；日志只允许 errorCode、operationId、sourceKey、脱敏 relativePath、sequence、generation/rollback state。

威胁—控制—测试—owner 完整矩阵见 `threat-model.md`。

## 13. 测试与发布

Vitest 与 Playwright 技术栈、24 个 E2E 场景、临时 HANA_HOME、native dialog stub 和平台矩阵见 `test-strategy.md`。每个用户故事的唯一 owner 与测试路径见 [`requirements-traceability.md`](./requirements-traceability.md)。

Ticket 57 只填 `release-evidence.md` 和 `release-checklist.md`，不得修改 `LOG.md` 记录普通执行结果，也不得首次实现功能。
