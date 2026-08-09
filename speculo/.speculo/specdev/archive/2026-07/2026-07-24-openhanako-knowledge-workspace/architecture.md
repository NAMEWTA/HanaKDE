# OpenHanako 知识工作区架构

本文件是 accepted `LOG.md`、`ADR.md`、`CONTEXT.md` 与 `spec.md` 的代码结构投影。它把最终设计映射到当前 HanaKDE/OpenHanako 模块、调用、持久化、并发和恢复，不创造、缩减或反向解释已确认的产品语义。

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
  capabilities: Array<
    'stat'|'read'|'write'|'list'|'watch'|'mkdir'|'copy'|'transfer'|
    'rename'|'move'|'delete'|'trash'|'restore'|'search'
  >;
  availability: 'available'|'unavailable'|'recovering';
};
```

Server 内 SourceRegistry 通过 `ProviderRootIdentityResolver` 与 `ProviderRootIdentityBroker` 把 address 映射到既有 ResourceRef。Renderer 不接收 resolvedPath、root identity 或 scope token。本地文件与本地 backing mount 共享 `local_fs` identity namespace；不同 providerId 本身不证明 disjoint。

注册流程：schema → owner/scope → provider capability → root identity → 与全部活动根比较 → sourceKey 冲突 → commit。任何 relation 不是 `disjoint` 都拒绝。

## 4. Public API

普通单资源操作继续走 `/api/resource-io/*`，补齐 provider 已支持但 HTTP 未暴露的 copy/mkdir/delete，并新增 provider-neutral transfer seam，同时保持 capability 语义。所有 principal/owner/scope 只从认证后的 Hono context 派生；客户端身份字段被 schema 拒绝。

```text
GET    /api/knowledge-workspace/sources
POST   /api/knowledge-workspace/sources
DELETE /api/knowledge-workspace/sources/:sourceKey

POST   /api/knowledge-workspace/operations/plan
POST   /api/knowledge-workspace/operations/:operationId/commit
POST   /api/knowledge-workspace/operations/:operationId/cancel
GET    /api/knowledge-workspace/operations/:operationId

GET    /api/knowledge-workspace/index/status
POST   /api/knowledge-workspace/index/:sourceKey/rebuild
POST   /api/knowledge-workspace/query
POST   /api/knowledge-workspace/search

GET    /api/knowledge-workspace/trash/:sourceKey
POST   /api/knowledge-workspace/trash/restore/plan
POST   /api/knowledge-workspace/trash/cleanup/plan

POST   /api/knowledge-workspace/native-grants
POST   /api/knowledge-workspace/native-grants/:grantId/consume  # Main only
POST   /api/knowledge-workspace/native-import                  # Main only
```

create、copy、import、move、rename、delete、restore 与 cleanup 的副作用均由 operation plan/commit 表达；上列 trash route 只提供查询或生成 plan，不形成第二套 mutation 协议。

Main-only route 必须验证 loopback、本地认证 principal 与独立 `X-Hana-Native-Bridge` credential；普通 Renderer server token 不能证明 Main 身份，LAN/Mobile 不可调用。

## 5. 复合操作与恢复

所有复合 mutation 通过 coordinator 与 DurableOperationJournal。operation 状态、幂等、prepare、commit、rollback、启动恢复严格遵守 `operation-journal-contract.md`。

地址锁 key 为 `sourceKey + relativePath`，按字节稳定排序获取。高风险操作在副作用前建立 checkpoint。ResourceEvent、watcher、index 和诊断携带同一 operationId。mutation route 在 recovery barrier 完成前不可用。

对 copy/import/delete/restore，批次允许资源级部分完成；每个目录必须通过 sibling staging 完整提交，正式目标不能出现半棵树。跨 provider copy/import 由 ResourceIO `transfer` 做有界流式传输，不经 Renderer 或全量内存 buffer 中转。

同源 rename/move 的回滚边界是主资源与全部已计划、已保存的链接写入。两者持久成功后 journal 进入 `COMMITTED`；ResourceEvent、Renderer session rebind、index invalidation/convergence 是可重试 post-commit 投影，失败只能产生降级与恢复任务，不得回滚已提交磁盘事实。

## 6. 文档状态与保存

DocumentSession 以 KnowledgeResourceAddress 为键，持有 buffer、baseline、diskVersion、history、dirty、conflict、orphan。DocumentView 以 view id 为键，持有 cursor、selection、scroll、mode 和 group。

Knowledge 手动 expected-version save；Preview 保留现有 600ms autosave。未保存 buffer 不进入 Server index。clean 外部变化自动重读；dirty 外部变化保留 baseline/local/disk 三方状态。关闭、退出和 workspace switch 使用同一逐文档流程。

## 7. Markdown 与 CM6

`lib/knowledge-workspace/markdown-knowledge-ir.ts` 是 Renderer/Server 共享文本语义；CM6 tree 只存在 Renderer。`MarkdownEditorSurface` 通过 policy 注入 save、attachment、link open 与 content gate，避免复制 PreviewEditor。

所有 command 产生单一 CM6 transaction；Wikilink、Markdown link、frontmatter、tags/tasks、Mermaid/math/footnote/HTML、find/replace 和 embed 使用同一 fixture/IR 边界。

## 8. 索引

每来源索引遵守 `index-store-contract.md`：better-sqlite3、schema v1、独立 generation、`current.json` 原子切换、单 writer、writer lock、query lease、rebuild replay，以及 `foldSearchText + trigram candidate + instr verification` 连续子串语义。

```text
saved disk
  -> Content Gate
  -> MarkdownExtractor | SafeTextExtractor | MetadataOnly
  -> active generation transaction

full rebuild
  -> build-<id>.sqlite
  -> WAL checkpoint/close + quick_check + scope revalidation
  -> generation-<id>.sqlite
  -> atomic current.json switch
```

ResourceEvent 是失效提示。Coordinator 按 sequence、operationId、100ms debounce、磁盘重读收敛；gap/burst 触发 reconcile。当前 outline/outbound 可以读 Renderer buffer；backlinks/tags/search 只读已保存 generation。

## 9. Native Bridge

现有 `window.hana` 新增两个方法，不新增任意 path API。Renderer 用 Server address 创建 grant，Main 消费 grant 后执行 open/reveal/trash。Picker/clipboard 由 Main 把本机路径直接提交本地 Server 导入 route。Open Server 明确返回 capability unavailable。

Native grant 与 owner、window、action、address、version 绑定，60 秒单次消费；不跨窗口。Desktop-owned Server 每次启动把 `nativeBridgeToken` 写入 owner-only `0o600` `server-info.json`，Main 随 readiness polling 读取；standalone 不生成。该字段不能进入 `get-server-token`、`server-restarted`、preload、Renderer 或日志。系统 trash 的成功/失败继续写 operation journal，只有 Main 确认成功后更新 `.trash` manifest。

## 10. 内部存储边界

```text
<HANA_HOME>/knowledge-workspace/index/v1/...
<HANA_HOME>/knowledge-workspace/operations/v1/...
<HANA_HOME>/knowledge-workspace/source-bindings/v1.json
```

这些目录不属于来源。来源内唯一内部区域是 `.trash/`，普通 list/search/index/link resolver 排除，trash service 专用访问。任何内部目录 identity 变化都 fail-closed。

## 11. 多 Renderer context 与生命周期

Server 是 SourceRegistry、journal 与 index 的唯一 owner。现有桌面生命周期、异常恢复或自动化产生的多个 Renderer context 通过 session/window context 获取投影；不得把 editor/session registry 放到无 owner/window 隔离的全局模块单例。相同资源的 expected-version 仍是最终并发保护；native grant 和 UI state 不跨 window。V1 不新增独立浮动知识窗口、标签脱离窗口或“新建知识窗口”产品入口。

## 12. 安全与诊断

所有外部 body 以 unknown 接收并 schema 校验。owner、scope、provider capability、root identity 和 path guard fail-closed；body 中的身份字段不能覆盖认证 context。打开、embed 与索引在 read 前 stat 并执行 10 MiB 内容门禁。HTML/SVG/Mermaid/URI 使用固定严格配置；Mermaid 丢弃交互绑定、消毒 SVG 并阻止 stale result。日志只允许 errorCode、operationId、sourceKey、脱敏 relativePath、sequence、generation/rollback state。

威胁—控制—测试—owner 完整矩阵见 `threat-model.md`。

## 13. 测试与发布

Vitest 与 Playwright 技术栈、Playwright 仅用于直接用户流程的选择规则、24 个发布级 E2E 场景、临时 HANA_HOME、native dialog stub 和平台矩阵见 `test-strategy.md`。每个用户故事的唯一 owner 与测试路径见 [`requirements-traceability.md`](./requirements-traceability.md)。

Ticket 57 只填 `release-evidence.md` 和 `release-checklist.md`，不得修改 `LOG.md` 记录普通执行结果，也不得首次实现功能。
