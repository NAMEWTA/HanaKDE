---
schema_version: 3
artifact: ticket
change: 2026-07-24-openhanako-knowledge-workspace
id: T-44
title: "交付标签与引用查询 API"
status: done
planning_depth: standard
planning_depth_reason: "历史完成 Ticket 的 SpecDev v3 兼容迁移；保留既有实现、验证与验收记录。"
ready: false
risk: medium
blocked_by: ["T-23","T-41","T-43"]
contract_ids: ["KW-RULE-QUERY"]
owner: historical-implementer
expected_changes: ["<Path>{roots.state}/specdev/changes/2026-07-24-openhanako-knowledge-workspace/ticket/44-deliver-knowledge-query-apis.md</Path>"]
writable_paths: []
read_only_paths: []
shared_paths: []
shared_path_owners: []
---
# Ticket 44: 交付标签与引用查询 API

- **被阻塞于：** [`23-define-knowledge-address-resolver.md`](./23-define-knowledge-address-resolver.md)、[`41-deliver-markdown-index-extraction.md`](./41-deliver-markdown-index-extraction.md)、[`43-deliver-watcher-index-rebuild.md`](./43-deliver-watcher-index-rebuild.md)
- **状态：** 已完成

## 战略与背景

- **战略：** 提供来源内标签、出站、反向引用、outline 和 index health 查询，不建立跨来源边。
- **需求追踪：** KW-RULE-QUERY
- **当前现状：** `core/knowledge-workspace/knowledge-index-coordinator.ts` 由 Ticket 40 交付；Knowledge route 由本 ticket 在 Ticket 03 的共享协议和 Open composition 接缝上创建或扩展。
- **用户可验证结果：** 完成本 ticket 后，验收者能够通过公开 API、真实临时 workspace 或可交互 UI 验证本标题声明的单一能力。

## 范围边界

| IN | REUSE | OUT |
|---|---|---|
| 提供来源内标签、出站、反向引用、outline 和 index health 查询，不建立跨来源边。 | `server/routes/knowledge-workspace.ts`<br>`core/knowledge-workspace/knowledge-index-coordinator.ts` | 未列入本 ticket 的后续功能；修改生成 bundle；创建平行文件系统、编辑器内核或私有 route 捷径 |

## 交付物

> 以下仅列主要交付物，不构成文件白名单或完整清单；为满足本 ticket 验收而新增/修改的同范围实现、类型、schema、fixture、测试、i18n 与文档同属交付物。

- `lib/knowledge-workspace/knowledge-query.ts`
- `server/routes/knowledge-workspace.ts`
- `tests/knowledge-query-api.test.ts`

## 实施时需阅读的文件

> 以下列出本 ticket 的具体代码接缝；实施前还必须按 [`README.md`](../README.md) 的文档权威关系读取 accepted [`LOG.md`](../LOG.md)、[`ADR.md`](../ADR.md)、[`CONTEXT.md`](../CONTEXT.md)、[`spec.md`](../spec.md) 及本 ticket 的固定实施契约，不能因本节或交付物未逐项复写而遗漏已确认结论。

- `server/routes/knowledge-workspace.ts`（本 ticket 创建或更新）
- `core/knowledge-workspace/knowledge-index-coordinator.ts`（由 Ticket 40 交付）

## 固定实施契约

- [`index-store-contract.md`](../index-store-contract.md)

## 实施顺序

1. 先以当前真实文件和公开契约建立失败测试，不访问 Engine 私有字段。
2. 实现本 ticket 的最小垂直切片，复用 ResourceIO、共享 IR、coordinator 或既有 UI 接缝。
3. 补齐取消、冲突、权限/不可用、外部变化和清理路径。
4. 运行精确自动化、相关回归、typecheck 与 boundary 检查并记录实际结果。

## 实现约束

1. 普通资源访问必须经现有 ResourceIO/provider；复合 mutation 必须经公开 coordinator 和 Operation Journal。
2. Renderer 不访问 Node 文件系统；远程 DTO、日志和 release evidence 不含绝对路径、正文或凭证。
3. 测试使用隔离临时 HANA_HOME、workspace、来源和端口，不依赖开发机固定路径或网络。
4. 实现不得引入未在 ADR/实施契约冻结的新存储引擎、IPC path surface、恢复状态或 E2E 框架。

## 自动化证据

**Primary ownership：** 无直接用户故事；按上列规则域交付

**必须创建或更新：**

- `tests/knowledge-query-api.test.ts`

**Playwright 用户流程：** 不适用；本 ticket 使用上述 Vitest，不运行 Playwright。

**发布级关联场景：** E2E-KW-013（仅追踪，不作为本 ticket Playwright 门禁）

## 验收标准

- [x] 查询按 sourceKey 分区；反向引用只读已保存索引；outline 可由当前 buffer 另行计算。
- [x] `Primary ownership` 明确为无直接用户故事；本 ticket 不新增未分配的产品行为，也不替其他 ticket 兜底。
- [x] 本 ticket 拥有的每个 `KW-RULE-*` 都满足对应契约文档，并有正常、取消/冲突、权限/不可用和故障注入覆盖。
- [x] 相关既有回归、`npm run typecheck` 和 `npm run lint:boundary` 通过；涉及 composition、Renderer、preload/main 时运行相应 build。
- [x] ticket 交付记录只填写实际执行命令、平台和结果；普通执行结果不写入 `LOG.md`。
- [x] 交付物没有未决的“可能”“按需”“A 或 B”、未选框架、未选 schema 或未定义恢复语义。

## 交付记录

- **实现提交：** `59f03eca`
- **平台：** macOS Darwin 25.5.0 / Apple M5 arm64 / APFS / Node v24.16.0
- **实现结果：** 新增严格解析的 `queryKnowledgeIndex` 与公开 `POST /api/knowledge-workspace/query`、`GET /api/knowledge-workspace/index/status`；支持来源内标签、已保存出站、已保存反向引用、已保存 outline 与完整 index health。查询只经 `KnowledgeIndexCoordinator.acquireQueryLease` 的类型化方法读取，不向 route/Renderer 暴露 Database。
- **隔离与事实来源：** 每个请求只打开一个 sourceKey 的 current generation，不执行跨来源 join；标签与 backlinks 只读已保存 SQLite generation。结果携带 generationId，调用方传入旧 generation 时明确返回 `knowledge_version_conflict/stale_generation`；outline/outbound 的当前 buffer 实时投影仍由 Ticket 46 独立计算。
- **安全与生命周期：** 输入拒绝非 canonical 地址、未知字段、非法 generation/tag 与超出 1–100 的 limit；默认 50、最大 100，并以额外一行计算 `hasMore`。AbortSignal、权限拒绝、索引不可用、查询故障与 lease 释放均有覆盖；公开 DTO 不返回绝对路径、数据库位置、正文、原始链接文本或 SQLite/provider 原始错误。
- **精确测试：** `npx vitest run tests/knowledge-query-api.test.ts --exclude 'temp/**'`，1 file、6/6；覆盖正常查询、双来源同名隔离、取消、generation 冲突、权限、不可用、SQL 故障脱敏和 lease 清理。
- **相关回归：** `npx vitest run tests/knowledge-query-api.test.ts tests/knowledge-workspace-route.test.ts tests/knowledge-index-store.test.ts tests/knowledge-index-schema-migration.test.ts tests/knowledge-index-rebuild.test.ts tests/knowledge-index-event-coordinator.test.ts tests/markdown-index-extractor.test.ts tests/safe-text-index-extractor.test.ts --exclude 'temp/**'`，8 files、90/90；持久化/Composition 3 files、26/26；CLI closure census 19/19。
- **全仓测试：** `npm test -- --exclude 'temp/**' --maxWorkers=8`，1063 files（1062 passed、1 skipped），10713 tests（10707 passed、6 skipped）。
- **静态与构建：** `npm run typecheck`、`npm run lint:boundary`、目标 ESLint、`git diff --check` 与 `npm run build:server:open` 均通过；Open Server better-sqlite3 runtime smoke 通过。
- **持久化审查：** SQLite schema、持久化字节、ownership、checkpoint/restore policy、`DATA_EPOCH` 与用户事实不变；Store registry 加入只读 query protocol module，按 compatible addition 重钉指纹 `sha256:69afabc257caa46498145d054631595bffe3b907e95a393d5229c99bc3a348bf`。
- **UI/E2E：** 本 ticket 未新增 UI；按 ticket 明确要求未运行 Playwright。E2E-KW-013 仅保留发布级关联，当前仓库不存在对应 spec，未记为通过。
