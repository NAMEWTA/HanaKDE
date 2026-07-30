# Ticket 45: 交付超级搜索

- **被阻塞于：** [`20-deliver-groups-tabs-breadcrumbs.md`](./20-deliver-groups-tabs-breadcrumbs.md)、[`40-establish-index-store-schema.md`](./40-establish-index-store-schema.md)、[`43-deliver-watcher-index-rebuild.md`](./43-deliver-watcher-index-rebuild.md)、[`44-deliver-knowledge-query-apis.md`](./44-deliver-knowledge-query-apis.md)
- **状态：** 已完成

## 战略与背景

- **战略：** 实现宽容查询词法、来源分组、资源聚合、组内排序、取消和结果打开。
- **需求追踪：** KW-US-188, KW-US-189, KW-US-190, KW-RULE-SEARCH
- **当前现状：** 当前实现接缝位于 `lib/resource-io/resource-io.ts`（及 provider 内既有 list/search 能力）与 `desktop/src/react/components/` 导航/结果打开模式；本 ticket 新建知识超级搜索词法与 UI，而非依赖不存在的 `lib/resource-io/search.ts`。
- **用户可验证结果：** 完成本 ticket 后，验收者能够通过公开 API、真实临时 workspace 或可交互 UI 验证本标题声明的单一能力。

## 范围边界

| IN | REUSE | OUT |
|---|---|---|
| 实现宽容查询词法、来源分组、资源聚合、组内排序、取消和结果打开。 | `lib/resource-io/resource-io.ts`<br>`lib/resource-io/types.ts`<br>`desktop/src/react/components/` | 未列入本 ticket 的后续功能；修改生成 bundle；创建平行文件系统、编辑器内核或私有 route 捷径 |

## 交付物

> 以下仅列主要交付物，不构成文件白名单或完整清单；为满足本 ticket 验收而新增/修改的同范围实现、类型、schema、fixture、测试、i18n 与文档同属交付物。

- `lib/knowledge-workspace/knowledge-search-query.ts`
- `desktop/src/react/components/knowledge-workspace/KnowledgeSearch.tsx`

## 实施时需阅读的文件

> 以下列出本 ticket 的具体代码接缝；实施前还必须按 [`README.md`](../README.md) 的文档权威关系读取 accepted [`LOG.md`](../LOG.md)、[`ADR.md`](../ADR.md)、[`CONTEXT.md`](../CONTEXT.md)、[`spec.md`](../spec.md) 及本 ticket 的固定实施契约，不能因本节或交付物未逐项复写而遗漏已确认结论。

- `lib/resource-io/resource-io.ts`
- `lib/resource-io/types.ts`
- `desktop/src/react/components/`

## 固定实施契约

- [`index-store-contract.md`](../index-store-contract.md)
- [`performance-budget.md`](../performance-budget.md)

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

**Primary ownership：** KW-US-188, KW-US-189, KW-US-190

**必须创建或更新：**

- `tests/knowledge-search-query.test.ts`
- `desktop/src/react/__tests__/components/KnowledgeSearch.test.tsx`

**Playwright 用户流程：** 适用；运行 E2E-KW-013

## 验收标准

- [x] main 首组、挂载按会话顺序；不跨来源统一排名；搜索不用于 LinkResolver 回退。
- [x] NFC+locale-neutral lowercase 后执行连续子串：3+ code points 用 trigram 候选加 `instr` 确认，1—2 code points 用有界可取消扫描；短查询不能漏结果。
- [x] 每来源 default/max limit 50/100，query ≤512 code points，片段 ≤3×240 code points，cursor 绑定 generation。
- [x] KW-US-188/189/190 由搜索 API、Unicode/短查询和标签导航 UI 测试直接证明。
- [x] 本 ticket 拥有的每个 `KW-RULE-*` 都满足对应契约文档，并有正常、取消/冲突、权限/不可用和故障注入覆盖。
- [x] 相关既有回归、`npm run typecheck` 和 `npm run lint:boundary` 通过；涉及 composition、Renderer、preload/main 时运行相应 build。
- [x] ticket 交付记录只填写实际执行命令、平台和结果；普通执行结果不写入 `LOG.md`。
- [x] 交付物没有未决的“可能”“按需”“A 或 B”、未选框架、未选 schema 或未定义恢复语义。

## 交付记录

- **实现提交：** `60a9047b`；游标与响应式契约收口提交：`3581ad93`
- **平台：** macOS Darwin 25.5.0 / Apple M5 arm64 / APFS / Node v24.16.0
- **实现结果：** 新增严格解析的超级搜索核心、公开 `POST /api/knowledge-workspace/search`、Renderer client 与真实 Knowledge shell 搜索 UI。宽容词法支持短语、资源内 AND 和独立大写 `OR`；NFC 与 locale-neutral lowercase 后做连续子串确认，main 首组、挂载按会话顺序分组，各来源独立评分和分页，不进入 LinkResolver 回退。
- **候选、边界与游标：** 3+ code points 经 trigram FTS 候选后以连续子串二次确认，1–2 code points 使用每批 256 行的有界可取消扫描。每来源默认/最大 50/100，query 最大 512 code points，结果最多 3 个、每个 240 code points 的片段。游标绑定 sourceKey、generationId、规范化查询、标签筛选域、固定排序键与 offset；代际变化明确返回 `knowledge_version_conflict/stale_generation`。
- **UI 与故障隔离：** 搜索结果可直接打开已有编辑组；正文/metadata 标签可进入可见且可清除的单来源范围。Arrow/Escape、ARIA live/focus、zh-CN/zh-TW/en/ja/ko、亮暗主题和两档窄布局均已交付。来源不可用、查询故障与陈旧游标按来源独立显示且已脱敏，一个来源失败不吞掉其他来源结果。
- **精确与相关测试：** `npx vitest run tests/knowledge-search-query.test.ts tests/knowledge-i18n-a11y-contract.test.ts tests/style-discipline.test.ts desktop/src/react/__tests__/components/KnowledgeSearch.test.tsx desktop/src/react/__tests__/services/knowledge-workspace-client.test.ts --maxWorkers=8`（5 files、59/59）；`npx vitest run tests/knowledge-workspace-route.test.ts --maxWorkers=8`（1 file、16/16）。覆盖正常/Unicode/短查询、取消、generation/筛选域冲突、权限/不可用、来源故障脱敏、lease 清理、键盘/ARIA/i18n/样式棘轮与公开 route。
- **持久化与边界：** persistence registry/schema tripwire 3 files、21/21；CLI closure census 19/19。只读搜索协议不改变 SQLite schema、持久化字节、ownership、checkpoint/restore policy、`DATA_EPOCH` 或用户事实，compatible 指纹为 `sha256:bb339f753e04f2034c41c7d16d2e3e37fe5be889be8509b3178949adcf429fc7`。
- **全仓测试：** `npm test -- --exclude 'temp/**' --maxWorkers=8`，1065 files（1064 passed、1 skipped），10727 tests（10721 passed、6 skipped、0 failed）。
- **静态与构建：** `npm run typecheck`、`npm run lint:boundary`、目标 ESLint、`git diff --check`、`npm run build:renderer` 与 `npm run build:server:open` 均通过；Open Server better-sqlite3/jieba runtime smoke 通过。
- **E2E：** E2E-KW-013 当前仓库不存在，故未运行 Playwright、未记为通过；Ticket 46 完成真实当前资源视图后由发布流程补建并执行。
