---
schema_version: 3
artifact: ticket
change: 2026-07-24-openhanako-knowledge-workspace
id: T-13
title: "建立性能预算与基准夹具"
status: done
planning_depth: standard
planning_depth_reason: "历史完成 Ticket 的 SpecDev v3 兼容迁移；保留既有实现、验证与验收记录。"
ready: false
risk: medium
blocked_by: ["T-01","T-03"]
contract_ids: ["KW-RULE-PERF","KW-RULE-TEST"]
owner: historical-implementer
expected_changes: ["<Path>{roots.state}/specdev/changes/2026-07-24-openhanako-knowledge-workspace/ticket/13-establish-performance-fixtures.md</Path>"]
writable_paths: []
read_only_paths: []
shared_paths: []
shared_path_owners: []
---
# Ticket 13: 建立性能预算与基准夹具

- **被阻塞于：** [`01-freeze-real-repository-baseline.md`](./01-freeze-real-repository-baseline.md)、[`03-freeze-open-knowledge-contract.md`](./03-freeze-open-knowledge-contract.md)
- **状态：** 已完成

## 战略与背景

- **战略：** 建立 10k/100k 树、10 MiB 文档、密集链接、watch burst、多来源同名和 100 tabs 夹具及预算。
- **需求追踪：** KW-RULE-PERF, KW-RULE-TEST
- **当前现状：** 当前实现接缝位于 `package.json`、`tests/`、`desktop/src/react/__tests__/`；本 ticket 只扩展这些公开边界。
- **用户可验证结果：** 完成本 ticket 后，验收者能够通过公开 API、真实临时 workspace 或可交互 UI 验证本标题声明的单一能力。

## 范围边界

| IN | REUSE | OUT |
|---|---|---|
| 建立 10k/100k 树、10 MiB 文档、密集链接、watch burst、多来源同名和 100 tabs 夹具及预算。 | `package.json`<br>`tests/`<br>`desktop/src/react/__tests__/` | 未列入本 ticket 的后续功能；修改生成 bundle；创建平行文件系统、编辑器内核或私有 route 捷径 |

## 交付物

> 以下仅列主要交付物，不构成文件白名单或完整清单；为满足本 ticket 验收而新增/修改的同范围实现、类型、schema、fixture、测试、i18n 与文档同属交付物。

- `tests/fixtures/knowledge-workspace/`
- `tests/knowledge-performance-budget.test.ts`
- `performance-budget.md`

## 实施时需阅读的文件

> 以下列出本 ticket 的具体代码接缝；实施前还必须按 [`README.md`](../README.md) 的文档权威关系读取 accepted [`LOG.md`](../LOG.md)、[`ADR.md`](../ADR.md)、[`CONTEXT.md`](../CONTEXT.md)、[`spec.md`](../spec.md) 及本 ticket 的固定实施契约，不能因本节或交付物未逐项复写而遗漏已确认结论。

- `package.json`
- `tests/`
- `desktop/src/react/__tests__/`

## 固定实施契约

- [`performance-budget.md`](../performance-budget.md)
- [`test-strategy.md`](../test-strategy.md)

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
5. 本 ticket 新增 UI 同时交付 zh-CN、zh-TW、en、ja、ko、键盘、ARIA、focus、亮暗主题和窄布局。

## 自动化证据

**Primary ownership：** 无直接用户故事；按上列规则域交付

**必须创建或更新：**

- `tests/knowledge-performance-budget.test.ts`
- `tests/knowledge-performance-fixtures.test.ts`

**Playwright 用户流程：** 不适用；本 ticket 使用上述 Vitest 单元、组件、契约或集成测试，不运行 Playwright；下游或发布级用户流程可继续覆盖相关行为

## 验收标准

- [x] 预算包含测量环境、p50/p95、取消上限和回归阈值；CI 使用缩小夹具，完整基准可独立运行。
- [x] `Primary ownership` 明确为无直接用户故事；本 ticket 不新增未分配的产品行为，也不替其他 ticket 兜底。
- [x] 本 ticket 拥有的每个 `KW-RULE-*` 都满足对应契约文档，并有正常、取消/冲突、权限/不可用和故障注入覆盖。
- [x] 相关既有回归、`npm run typecheck` 和 `npm run lint:boundary` 通过；涉及 composition、Renderer、preload/main 时运行相应 build。
- [x] ticket 交付记录只填写实际执行命令、平台和结果；普通执行结果不写入 `LOG.md`。
- [x] 交付物没有未决的“可能”“按需”“A 或 B”、未选框架、未选 schema 或未定义恢复语义。

## 实现交接摘要

- **主线实现提交：** `424088c4`（隔离 worktree 原始提交 `3f1b97f1`）。
- **平台：** macOS 26.5（Darwin 25.5.0，arm64）、Node `v24.16.0`、npm `11.13.0`。
- **实现范围：** 建立固定 seed `20260725` 的 full/smoke 数据集、12 场景 reference runner、预算评估、baseline 比较、闭合 evidence schema 与原子证据写入。smoke 对可缩放维度严格为 full 的 `0.1`。
- **真实夹具：** 惰性资源流精确覆盖 10k/100k、4 来源 `Shared/SameName.md`、深度 1–12、10 MiB/+1、50k Wikilinks、10k broken links、20k tags、20k tasks、5k headings-heavy、5k/500 watch burst、100 tabs 与 1k recovery records；物化 smoke 实测 10,000 个不覆盖文件。
- **预算与安全：** Node 24、最低 CPU/RAM、production/devtools/debug 在任何 adapter/目录写入前闭合校验；baseline 必须为相同 dataset identity 的 latest passing same-runner 结果；never-resolving adapter 通过 `AbortSignal` race 受控取消；accessor/Proxy/symbol/路径泄漏/NaN/Infinity/额外字段均拒绝；mkdir/write/rename 故障清理 `.tmp`。
- **自动化：** `volta run npx vitest run tests/knowledge-performance-fixtures.test.ts tests/knowledge-performance-budget.test.ts tests/knowledge-baseline-contract.test.ts`，3 files、42/42；target ESLint 0 warning；`volta run npm run typecheck`、`volta run npm run lint:boundary`、`git diff --check` 通过。
- **质量与规格检查：** 两轴均无未决问题；已修复 manifest-only 数据、错误 smoke 比例、无效 UUID/时间窗口、证据缺字段、不可取消 adapter、stream 外同名文件、路径碰撞、不同 fixture baseline 和生产者/validator schema 不一致。
- **证据边界：** 本票只证明预算、夹具与 runner 契约，没有运行真实产品性能基准，也没有把 harness 测试登记为产品性能通过或发布级 E2E。
- **Playwright：** 本票明确不适用。
- **交接：** `speculo/.speculo/commands/handoff/2026-07-26-openhanako-knowledge-workspace-implementation-04.md`。
