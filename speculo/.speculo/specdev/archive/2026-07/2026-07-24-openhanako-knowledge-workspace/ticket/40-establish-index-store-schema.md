---
schema_version: 3
artifact: ticket
change: 2026-07-24-openhanako-knowledge-workspace
id: T-40
title: "建立来源分区索引 Store 与 Schema"
status: done
planning_depth: standard
planning_depth_reason: "历史完成 Ticket 的 SpecDev v3 兼容迁移；保留既有实现、验证与验收记录。"
ready: false
risk: medium
blocked_by: ["T-01","T-04","T-05","T-10","T-13","T-14"]
contract_ids: ["KW-US-187","KW-RULE-INDEX"]
owner: historical-implementer
expected_changes: ["<Path>{roots.state}/specdev/changes/2026-07-24-openhanako-knowledge-workspace/ticket/40-establish-index-store-schema.md</Path>"]
writable_paths: []
read_only_paths: []
shared_paths: []
shared_path_owners: []
---
# Ticket 40: 建立来源分区索引 Store 与 Schema

- **被阻塞于：** [`01-freeze-real-repository-baseline.md`](./01-freeze-real-repository-baseline.md)、[`04-define-errors-and-diagnostics.md`](./04-define-errors-and-diagnostics.md)、[`05-adapt-workspace-source-registry.md`](./05-adapt-workspace-source-registry.md)、[`10-trace-knowledge-operation-protocol.md`](./10-trace-knowledge-operation-protocol.md)、[`13-establish-performance-fixtures.md`](./13-establish-performance-fixtures.md)、[`14-establish-malicious-workspace-tests.md`](./14-establish-malicious-workspace-tests.md)
- **状态：** 已完成

## 战略与背景

- **战略：** 建立可丢弃、版本化、来源分区的索引存储、健康状态、迁移和原子重建交换。
- **需求追踪：** KW-US-187, KW-RULE-INDEX
- **当前现状：** 当前不存在来源分区的知识索引；ResourceIO search 不是标签/引用/结构索引。
- **用户可验证结果：** 完成本 ticket 后，验收者能够通过公开 API、真实临时 workspace 或可交互 UI 验证本标题声明的单一能力。

## 范围边界

| IN | REUSE | OUT |
|---|---|---|
| 建立可丢弃、版本化、来源分区的索引存储、健康状态、迁移和原子重建交换。 | `package.json`<br>`core/`<br>`lib/` | 未列入本 ticket 的后续功能；修改生成 bundle；创建平行文件系统、编辑器内核或私有 route 捷径 |

## 交付物

> 以下仅列主要交付物，不构成文件白名单或完整清单；为满足本 ticket 验收而新增/修改的同范围实现、类型、schema、fixture、测试、i18n 与文档同属交付物。

- `lib/knowledge-workspace/knowledge-index-store.ts`
- `core/knowledge-workspace/knowledge-index-coordinator.ts`
- `tests/knowledge-index-store.test.ts`

## 实施时需阅读的文件

> 以下列出本 ticket 的具体代码接缝；实施前还必须按 [`README.md`](../README.md) 的文档权威关系读取 accepted [`LOG.md`](../LOG.md)、[`ADR.md`](../ADR.md)、[`CONTEXT.md`](../CONTEXT.md)、[`spec.md`](../spec.md) 及本 ticket 的固定实施契约，不能因本节或交付物未逐项复写而遗漏已确认结论。

- `package.json`
- `core/`
- `lib/`

## 固定实施契约

- [`index-store-contract.md`](../index-store-contract.md)

## 实施顺序

1. 实现 index-store-contract.md 的 schema v1 与 PRAGMA。
2. 实现 per-source generation、current manifest、query lease 和 writer lock。
3. 实现 schema/extractor mismatch rebuild，禁止 in-place migration。
4. 覆盖 corruption、cancel、disk-full、Windows handle 和 lock 故障。

## 实现约束

1. 普通资源访问必须经现有 ResourceIO/provider；复合 mutation 必须经公开 coordinator 和 Operation Journal。
2. Renderer 不访问 Node 文件系统；远程 DTO、日志和 release evidence 不含绝对路径、正文或凭证。
3. 测试使用隔离临时 HANA_HOME、workspace、来源和端口，不依赖开发机固定路径或网络。
4. 实现不得引入未在 ADR/实施契约冻结的新存储引擎、IPC path surface、恢复状态或 E2E 框架。

## 自动化证据

**Primary ownership：** KW-US-187

**必须创建或更新：**

- `tests/knowledge-index-store.test.ts`
- `tests/knowledge-index-schema-migration.test.ts`

**Playwright 用户流程：** 不适用；本 ticket 使用上述 Vitest，不运行 Playwright。

**发布级关联场景：** E2E-KW-013、E2E-KW-014（仅追踪，不作为本 ticket Playwright 门禁）

## 验收标准

- [x] 每来源独立损坏/重建；磁盘内容是唯一事实；取消重建不破坏旧可用分区。
- [x] KW-US-187 由 per-source generation、磁盘重建与来源隔离测试直接证明。
- [x] FTS 使用 folded trigram 候选列；发布前 WAL checkpoint/close，不能遗漏 sidecar 内容。
- [x] 本 ticket 拥有的每个 `KW-RULE-*` 都满足对应契约文档，并有正常、取消/冲突、权限/不可用和故障注入覆盖。
- [x] 相关既有回归、`npm run typecheck` 和 `npm run lint:boundary` 通过；涉及 composition、Renderer、preload/main 时运行相应 build。
- [x] ticket 交付记录只填写实际执行命令、平台和结果；普通执行结果不写入 `LOG.md`。
- [x] 交付物没有未决的“可能”“按需”“A 或 B”、未选框架、未选 schema 或未定义恢复语义。

## 交付记录

- **实现提交：** `7fe54ac1`
- **平台：** macOS Darwin 25.5.0 / Apple M5 arm64 / APFS / Node v24.16.0
- **实现结果：** 交付 schema v1、严格 meta、FTS5 folded trigram、每来源 generation/current manifest、query lease、单 writer lock、原子 publish、保留策略、健康状态、schema/extractor drift 重建语义、损坏与 symlink fail-closed，以及基于 SourceRegistry root identity 的来源隔离 coordinator；索引登记为可丢弃且仅由 rebuild 恢复的 regenerable persistence store，`DATA_EPOCH` 不变。
- **精确测试：** `npx vitest run tests/knowledge-index-store.test.ts tests/knowledge-index-schema-migration.test.ts --exclude 'temp/**' --reporter=dot`，2 files、13/13 通过。
- **全仓测试：** `npm test -- --exclude 'temp/**'`，1058 files（1057 passed、1 skipped），10652 tests（10646 passed、6 skipped）。
- **静态与构建：** `npm run typecheck`、`npm run lint:boundary`、目标 ESLint、`git diff --check`、`npm run build:server:open` 均通过；Open Server 构建中的 better-sqlite3 runtime smoke 通过。
- **E2E：** 本 ticket 明确不运行 Playwright；E2E-KW-013、E2E-KW-014 仅保留发布级关联，当前仓库仍不存在对应 spec，未记为通过。
