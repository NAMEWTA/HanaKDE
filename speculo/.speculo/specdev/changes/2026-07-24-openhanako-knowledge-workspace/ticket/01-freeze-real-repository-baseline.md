# Ticket 01: 冻结真实仓库基线与兼容契约

- **被阻塞于：** 无
- **状态：** 已完成

## 战略与背景

- **战略：** 把当前 hanakde、upstream、公开路由、ResourceIO、Desk、CM6 和构建接缝固化为可执行基线。
- **需求追踪：** KW-RULE-PREFLIGHT, KW-RULE-TEST
- **当前现状：** 2026-07-25 只读审计确认 HEAD `a7ff307c7627`、merge-base `ef8a6f700191` 与关键接缝存在；当时工作树已有 83 个非 clean 条目。审计 shell 是 Node `v22.22.3`，不满足仓库 Node 24 engine，且 `better-sqlite3` ABI 不匹配，因此当前没有可声称通过的 typecheck/build/test/FTS 证据。
- **用户可验证结果：** 完成本 ticket 后，验收者能够通过公开 API、真实临时 workspace 或可交互 UI 验证本标题声明的单一能力。

## 范围边界

| IN | REUSE | OUT |
|---|---|---|
| 把当前 hanakde、upstream、公开路由、ResourceIO、Desk、CM6 和构建接缝固化为可执行基线。 | `server/composition/open-root.ts`<br>`server/composition/full-root.ts`<br>`server/index.ts`<br>`tests/server-composition-boundary.test.ts` | 未列入本 ticket 的后续功能；修改生成 bundle；创建平行文件系统、编辑器内核或私有 route 捷径 |

## 交付物

> 以下仅列主要交付物，不构成文件白名单或完整清单；为满足本 ticket 验收而新增/修改的同范围实现、类型、schema、fixture、测试、i18n 与文档同属交付物。

- `implementation-baseline.md`
- `tests/knowledge-baseline-contract.test.ts`

## 实施时需阅读的文件

> 以下列出本 ticket 的具体代码接缝；实施前还必须按 [`README.md`](../README.md) 的文档权威关系读取 accepted [`LOG.md`](../LOG.md)、[`ADR.md`](../ADR.md)、[`CONTEXT.md`](../CONTEXT.md)、[`spec.md`](../spec.md) 及本 ticket 的固定实施契约，不能因本节或交付物未逐项复写而遗漏已确认结论。

- `server/composition/open-root.ts`
- `server/composition/full-root.ts`
- `server/index.ts`
- `tests/server-composition-boundary.test.ts`

## 固定实施契约

- [`implementation-baseline.md`](../implementation-baseline.md)
- [`test-strategy.md`](../test-strategy.md)

## 实施顺序

1. 按 `README.md` 与 `implementation-baseline.md` 在仓库根只读核对，记录分支、HEAD、dirty 明细数量与漂移；不得清理用户修改。
2. 切换到满足 `>=24.12.0 <25` 的 Node 24，并在该环境重新安装或重建 native dependencies；先证明 `better-sqlite3` 与 FTS5 可加载。
3. 确认 audited commit 为 HEAD 祖先；关键接缝漂移时先更新 change。
4. 安装并锁定 `@playwright/test@1.62.0`，增加固定 scripts/config skeleton。
5. 运行并只记录实际通过/失败的基线命令，建立 requirements ownership 与 release evidence contract tests。

## 实现约束

1. 普通资源访问必须经现有 ResourceIO/provider；复合 mutation 必须经公开 coordinator 和 Operation Journal。
2. Renderer 不访问 Node 文件系统；远程 DTO、日志和 release evidence 不含绝对路径、正文或凭证。
3. 测试使用隔离临时 HANA_HOME、workspace、来源和端口，不依赖开发机固定路径或网络。
4. 实现不得引入未在 ADR/实施契约冻结的新存储引擎、IPC path surface、恢复状态或 E2E 框架。

## 自动化证据

**Primary ownership：** 无直接用户故事；按上列规则域交付

**必须创建或更新：**

- `tests/knowledge-baseline-contract.test.ts`
- `tests/knowledge-preflight.test.ts`

**对应端到端场景：** 无独立 E2E；由契约/集成测试证明并被下游场景覆盖

## 验收标准

- [x] 基线文档记录 commit、调用图、现有能力和命令；公开行为测试不访问 Engine 私有状态。
- [x] `Primary ownership` 明确为无直接用户故事；本 ticket 不新增未分配的产品行为，也不替其他 ticket 兜底。
- [x] 本 ticket 拥有的每个 `KW-RULE-*` 都满足对应契约文档，并有正常、取消/冲突、权限/不可用和故障注入覆盖。
- [x] 相关既有回归、`npm run typecheck` 和 `npm run lint:boundary` 通过；涉及 composition、Renderer、preload/main 时运行相应 build。
- [x] ticket 交付记录只填写实际执行命令、平台和结果；普通执行结果不写入 `LOG.md`。
- [x] 交付物没有未决的“可能”“按需”“A 或 B”、未选框架、未选 schema 或未定义恢复语义。

## 实现交接摘要

- **实现提交：** `f5018010`（可执行基线、隔离 fixtures、Node 24 ZIP 回归与安全修复）
- **集成提交：** `ba45f55b9393`（`@playwright/test@1.62.0`、`yauzl@2.10.0`、scripts、lockfile 与确定性审计产物）
- **平台：** macOS Darwin 25.5.0 / Apple M5 arm64 / Node v24.16.0 / npm 11.13.0（Volta）
- **隔离：** 测试和 smoke 使用 `mkdtemp` 创建的临时 `HANA_HOME`、HOME、workspace 与临时端口；执行后清理。dirty 工作树仅告警，未执行 cleanup、reset 或 checkout。
- **依赖偏差：** `extract-zip@2.0.1` 在 Node 24 连续 STORE entry 上发生读取停滞；读取侧改为直接使用已锁定的 `yauzl@2.10.0` positional range stream。ZIP writer 保持标准 STORE/DEFLATE 格式；根依赖移除 `extract-zip`，其仅作为 Electron 的 dev-transitive dependency 保留。
- **审查：** Standards Review `APPROVE`；Spec Review 的实现部分 `APPROVE`，关闭记录缺口由本节、tickets map 与 release evidence 回写消除。

### 实际执行证据

| 命令 | 结果 |
|---|---|
| `SILVERBULLET_REFERENCE_ROOT=<repo-root> volta run npx vitest run tests/knowledge-baseline-contract.test.ts tests/knowledge-preflight.test.ts` | 2 files，17/17 tests 通过；dirty 仅 warning |
| `SILVERBULLET_REFERENCE_REQUIRED=1 SILVERBULLET_REFERENCE_ROOT=<repo-root> volta run npx vitest run tests/silverbullet-reference-integrity.test.ts` | 1 file，5/5 tests 通过，无 skip |
| `volta run npx vitest run tests/extract-zip-node24.test.ts tests/extract-zip-symlink-defense.test.ts` | 2 files，12/12 tests 通过 |
| `volta run npx vitest run tests/character-card-import.test.ts` | 1 file，14/14 tests 通过 |
| `volta run npm run typecheck` | 通过 |
| `volta run npm run lint:boundary` | 通过；无新增 open→closed 边界债务 |
| `volta run npm test` | 997 files 通过、1 个 Windows manual file 跳过；9812 tests 通过、6 个 Windows manual tests 跳过 |
| `volta run npm run build:server:open` | 通过；open whitelist、bundle、native runtime 与依赖裁剪完成 |
| `volta run npm run smoke:server:open` | 通过；正向 identity HTTP 200，负向缺失 runtime asset 可归因失败 |
| `volta run npm ci --ignore-scripts --dry-run` | 通过；lockfile 可重建 |
