---
schema_version: 3
artifact: ticket
change: 2026-07-24-openhanako-knowledge-workspace
id: T-54
title: "交付同源原子重命名与移动"
status: done
planning_depth: standard
planning_depth_reason: "历史完成 Ticket 的 SpecDev v3 兼容迁移；保留既有实现、验证与验收记录。"
ready: false
risk: medium
blocked_by: ["T-10","T-18","T-21","T-23","T-43","T-48"]
contract_ids: ["KW-US-026","KW-US-027","KW-US-186","KW-RULE-OP","KW-RULE-SEC","KW-RULE-REFACTOR","KW-RULE-RECOVERY"]
owner: historical-implementer
expected_changes: ["<Path>{roots.state}/specdev/changes/2026-07-24-openhanako-knowledge-workspace/ticket/54-deliver-atomic-rename-move.md</Path>"]
writable_paths: []
read_only_paths: []
shared_paths: []
shared_path_owners: []
---
# Ticket 54: 交付同源原子重命名与移动

- **被阻塞于：** [`10-trace-knowledge-operation-protocol.md`](./10-trace-knowledge-operation-protocol.md)、[`18-establish-document-session-registry.md`](./18-establish-document-session-registry.md)、[`21-deliver-external-change-conflicts.md`](./21-deliver-external-change-conflicts.md)、[`23-define-knowledge-address-resolver.md`](./23-define-knowledge-address-resolver.md)、[`43-deliver-watcher-index-rebuild.md`](./43-deliver-watcher-index-rebuild.md)、[`48-deliver-tree-keyboard-range-selection.md`](./48-deliver-tree-keyboard-range-selection.md)
- **状态：** 已完成

## 战略与背景

- **战略：** 扩展操作协调器，预览目录后代、同源引用、打开会话和索引影响；原子提交/回滚持久文件事实，并在 COMMITTED 后幂等收敛会话与索引投影。
- **需求追踪：** KW-US-026, KW-US-027, KW-US-186, KW-RULE-OP, KW-RULE-SEC, KW-RULE-REFACTOR, KW-RULE-RECOVERY
- **当前现状：** 当前基座接缝是 `lib/resource-io/resource-io.ts`；operation coordinator 由 Ticket 10、Markdown IR 由 Ticket 11 交付，开始本 ticket 前必须存在。
- **用户可验证结果：** 完成本 ticket 后，验收者能够通过公开 API、真实临时 workspace 或可交互 UI 验证本标题声明的单一能力。

## 范围边界

| IN | REUSE | OUT |
|---|---|---|
| 扩展操作协调器，预览目录后代、同源引用、打开会话和索引影响；原子提交/回滚持久文件事实，并在 COMMITTED 后幂等收敛会话与索引投影。 | `lib/resource-io/resource-io.ts`<br>`core/knowledge-workspace/knowledge-operation-coordinator.ts`<br>`lib/knowledge-workspace/markdown-knowledge-ir.ts` | 未列入本 ticket 的后续功能；修改生成 bundle；创建平行文件系统、编辑器内核或私有 route 捷径 |

## 交付物

> 以下仅列主要交付物，不构成文件白名单或完整清单；为满足本 ticket 验收而新增/修改的同范围实现、类型、schema、fixture、测试、i18n 与文档同属交付物。

- `lib/knowledge-workspace/markdown-link-rewriter.ts`
- `core/knowledge-workspace/knowledge-refactor-service.ts`
- `tests/knowledge-refactor-rollback.test.ts`

## 实施时需阅读的文件

> 以下列出本 ticket 的具体代码接缝；实施前还必须按 [`README.md`](../README.md) 的文档权威关系读取 accepted [`LOG.md`](../LOG.md)、[`ADR.md`](../ADR.md)、[`CONTEXT.md`](../CONTEXT.md)、[`spec.md`](../spec.md) 及本 ticket 的固定实施契约，不能因本节或交付物未逐项复写而遗漏已确认结论。

- `lib/resource-io/resource-io.ts`
- `core/knowledge-workspace/knowledge-operation-coordinator.ts`（由 Ticket 10 交付）
- `lib/knowledge-workspace/markdown-knowledge-ir.ts`（由 Ticket 11 交付）

## 固定实施契约

- [`operation-journal-contract.md`](../operation-journal-contract.md)

## 实施顺序

1. 从 PREPARED 执行主资源与已保存链接写入；每个文件事实副作用前后持久化 intent/outcome。
2. 文件事实全部成功后写 COMMITTED，再幂等执行 session rebind、event 与 index invalidation/convergence。
3. COMMITTED 前 rollback 逆序执行且不覆盖外部新修改；COMMITTED 后投影失败只重试/降级，绝不回滚用户文件。
4. 所有 named crash points 在重启后证明 committed/rolled-back/recovery-required，并验证 post-commit 投影失败边界。

## 实现约束

1. 普通资源访问必须经现有 ResourceIO/provider；复合 mutation 必须经公开 coordinator 和 Operation Journal。
2. Renderer 不访问 Node 文件系统；远程 DTO、日志和 release evidence 不含绝对路径、正文或凭证。
3. 测试使用隔离临时 HANA_HOME、workspace、来源和端口，不依赖开发机固定路径或网络。
4. 实现不得引入未在 ADR/实施契约冻结的新存储引擎、IPC path surface、恢复状态或 E2E 框架。

## 自动化证据

**Primary ownership：** KW-US-026, KW-US-027, KW-US-186

**必须创建或更新：**

- `tests/knowledge-refactor-rollback.test.ts`
- `tests/knowledge-refactor-crash-recovery.test.ts`

**Playwright 用户流程：** 适用；运行 E2E-KW-019

## 验收标准

- [x] 计划带版本戳；dirty session 先解决；文件/链接失败可回滚；COMMITTED 后 session/event/index 失败不回滚磁盘事实且可恢复收敛。
- [x] 本 ticket 拥有的每个 `KW-US-*` 都由上列精确测试直接证明；不存在范围兜底或 Ticket 57 代实现。
- [x] 本 ticket 拥有的每个 `KW-RULE-*` 都满足对应契约文档，并有正常、取消/冲突、权限/不可用和故障注入覆盖。
- [x] 相关既有回归、`npm run typecheck` 和 `npm run lint:boundary` 通过；涉及 composition、Renderer、preload/main 时运行相应 build。
- [x] ticket 交付记录只填写实际执行命令、平台和结果；普通执行结果不写入 `LOG.md`。
- [x] 交付物没有未决的“可能”“按需”“A 或 B”、未选框架、未选 schema 或未定义恢复语义。

## 实现交接摘要

- **实现结果：** 同源 rename/move、保存链接重写、版本锁、逆序 rollback、named crash recovery 与 post-commit 收敛已交付。
- **精确自动化：** `knowledge-refactor rollback/crash recovery` 相关测试包含于最终聚合命令，23 files、65/65 tests 通过；E2E-KW-019 已在 macOS arm64 的实际 Playwright project 中通过。
- **仓库门禁：** `npm run lint`（0 errors）、`npm run typecheck`、`npm run lint:boundary`、Open/Full/Renderer/preload/main/server build 与本机 E2E 矩阵通过；完整 `npm test` 的最终复跑由 Ticket 57 汇总。
- **提交与偏差：** 实现位于当前工作树（基于 HEAD `442ef4f4`，本次未创建提交）；无产品或架构偏差，未使用内置插件。
