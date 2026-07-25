# Ticket 40: 建立来源分区索引 Store 与 Schema

- **被阻塞于：** [`01-freeze-real-repository-baseline.md`](./01-freeze-real-repository-baseline.md)、[`04-define-errors-and-diagnostics.md`](./04-define-errors-and-diagnostics.md)、[`05-adapt-workspace-source-registry.md`](./05-adapt-workspace-source-registry.md)、[`10-trace-knowledge-operation-protocol.md`](./10-trace-knowledge-operation-protocol.md)、[`13-establish-performance-fixtures.md`](./13-establish-performance-fixtures.md)、[`14-establish-malicious-workspace-tests.md`](./14-establish-malicious-workspace-tests.md)
- **状态：** 未开始

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

**对应端到端场景：** E2E-KW-013、E2E-KW-014

## 验收标准

- [ ] 每来源独立损坏/重建；磁盘内容是唯一事实；取消重建不破坏旧可用分区。
- [ ] KW-US-187 由 per-source generation、磁盘重建与来源隔离测试直接证明。
- [ ] FTS 使用 folded trigram 候选列；发布前 WAL checkpoint/close，不能遗漏 sidecar 内容。
- [ ] 本 ticket 拥有的每个 `KW-RULE-*` 都满足对应契约文档，并有正常、取消/冲突、权限/不可用和故障注入覆盖。
- [ ] 相关既有回归、`npm run typecheck` 和 `npm run lint:boundary` 通过；涉及 composition、Renderer、preload/main 时运行相应 build。
- [ ] ticket 交付记录只填写实际执行命令、平台和结果；普通执行结果不写入 `LOG.md`。
- [ ] 交付物没有未决的“可能”“按需”“A 或 B”、未选框架、未选 schema 或未定义恢复语义。
