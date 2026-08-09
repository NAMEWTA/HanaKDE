---
schema_version: 3
artifact: goal-plan
change: 2026-08-09-internalize-todolist-plugin
status: ready
modes: [coordination, migration, high-assurance, reference-conformance]
ready_for_execution: true
---

# Goal Plan: Hana Todo 内置插件

- **Goal Plan：** `<Path>{roots.state}/specdev/changes/2026-08-09-internalize-todolist-plugin/goal-plan.md</Path>`
- **Spec：** `<Path>{roots.state}/specdev/changes/2026-08-09-internalize-todolist-plugin/spec.md</Path>`
- **Tickets Map：** `<Path>{roots.state}/specdev/changes/2026-08-09-internalize-todolist-plugin/tickets-map.md</Path>`
- **Ticket 目录：** `<Path>{roots.state}/specdev/changes/2026-08-09-internalize-todolist-plugin/ticket/</Path>`
- **Evidence 目录：** `<Path>{roots.state}/specdev/changes/2026-08-09-internalize-todolist-plugin/evidence/</Path>`

## 1. Outcome and Authority

### Outcome

在不修改 HanaKDE 宿主、公共测试、根构建配置或其它插件的前提下，把参考 TodoList 的有效领域意图重建为 `<Path>plugins/todolist/</Path>` 中可整块删除的 builtin Hana Todo。最终产品提供同源持久 CRUD、捕获组织、类型化时间、周期、安全删除、桌面提醒交接、隔离 Agent Run、Automation 运营、Review 与版本化导入导出，并由现有 build/seed 流程形成可加载产物。

全部产品实现、测试、fixture、Playwright 配置、构建资产和依赖声明都归 `<Path>plugins/todolist/</Path>`。SpecDev 工件只记录合同和 Evidence，不是产品写入例外。

### Success and False Completion

成功必须同时具备用户行为、数据安全、后台可靠性、隐私、视觉交互、构建分发和可移除证据。以下任何情况都属于伪完成：

- Page 与 tools 使用不同状态副本，或只在开发 workspace 可运行；
- 用 Todo due scanner、无限 retry 或第二 timer 掩盖 TaskRegistry readiness 问题；
- 把 `handed_off` 命名或展示为操作系统 delivered；
- Agent Run 自动完成 Todo、跨 Todo 共享 Session、乐观取消或复制完整 transcript；
- 旧 SQLite 被打开/修改，或没有真实样本却声称 0.0.5 兼容；
- 本地化、键盘、ARIA、主题或窄布局留到 T-10 首次补做；
- 修改根脚本、公共测试、宿主或其它插件来使验证通过；
- 测试被跳过、断言被弱化、基线失败未分类，或 Evidence 只写“已通过”而没有命令与结果。

### Non-goals

- 不替换、迁移或同步 `todo_write` 与 Session Todo UI。
- 不新增宿主 capability、通知 transport、Bridge、TaskRegistry 启动重排或 Todo Core 数据结构。
- 不实现团队协作、嵌套项目、看板、复杂依赖、原生移动 surface 或外部日历同步。
- 不部署、不发布、不操作真实用户数据库，不执行真实永久删除、真实 import commit、真实 Agent 副作用或远程仓库动作。

### Measured Baseline

- **Git：** 分支 `hanakde`，计划冻结点 `5c281aae27eed87a0954c93b553ea7b2b255eef4`；规划时工作树路径 `<Path>plugins/todolist/</Path>` 不存在且无该路径 diff。
- **Creator preflight：** `node <Path>skills2set/hana-plugin-creator/scripts/check_env.mjs</Path> --capability scaffold` 返回 `ok`，Python 3.12.10，必需包为空。
- **命令：** `<Path>package.json</Path>` 已声明 `test`、`typecheck`、`lint`、`build:client`、`build:server`、`build:renderer`、`verify:seed-kit`；Vitest 4.0.18 与 Playwright 1.62.0 可解析。
- **宿主接缝：** 规划时运行 Spec 指定的 9 个 Vitest 文件，89 项测试全部通过；这只证明 PluginManager/TaskRegistry/EventBus/Session/Agent/TodoWrite 基线，不证明 Todo 产品行为。
- **基线前进规则：** 实施可以从该 SHA 的后继提交开始，但每次启动必须证明该 SHA 仍为祖先、`<Path>plugins/todolist/</Path>` 未被无关工作占用、关键宿主接缝未漂移，并重跑 G0 preflight。任一不成立即暂停并按偏差控制处理。

### Authoritative Inputs

| 优先级 | 来源 | 负责内容 | 冲突处理 |
|---|---|---|---|
| 1 | USER-DECISION：产品实现只在 `<Path>plugins/todolist/</Path>` | 物理范围与批准 | 只有用户新决定可改变；否则立即停止 |
| 2 | `<Path>{roots.state}/specdev/changes/2026-08-09-internalize-todolist-plugin/ADR.md</Path>` | 当前 change 架构、调度、通知、Session、迁移 | 返回设计工作流形成替代 ADR |
| 3 | `<Path>{roots.state}/specdev/adr/0016-fail-closed-security-boundary.md</Path>`、`<Path>{roots.state}/specdev/adr/0018-vertical-slices-own-cross-cutting-quality.md</Path>`、`<Path>{roots.state}/specdev/adr/0021-executable-implementation-preflight.md</Path>`、`<Path>{roots.state}/specdev/adr/0024-vitest-default-playwright-user-flows.md</Path>` | 安全、横切质量、preflight、验证分层 | 冲突时暂停 Gate 并升级 |
| 4 | `<Path>{roots.state}/specdev/changes/2026-08-09-internalize-todolist-plugin/spec.md</Path>` | 外部行为、范围、AC-001～AC-033、NFR | 下游不得改写；变化返回 S-spec |
| 5 | `<Path>{roots.state}/specdev/changes/2026-08-09-internalize-todolist-plugin/ticket/{ticket-file}.md</Path>` | 单 Ticket 行为、路径、验证和恢复 | 修改 Ticket 并获批准后继续 |
| 6 | `<Path>{roots.state}/specdev/changes/2026-08-09-internalize-todolist-plugin/tickets-map.md</Path>` 与本 Plan | DAG/覆盖投影与跨 Ticket 编排 | Ticket frontmatter 决定依赖，本 Plan 决定 Gate |
| 7 | 当前 HanaKDE SDK/代码与可执行结果 | 实际可行性 | 只能触发偏差，不能静默改写上游 |
| 8 | `<Path>temp/HanaKDE-TodoList-0.0.5-workbench-source-audited-final/</Path>` | 候选纯算法、测试意图和失败教训 | 与当前合同冲突时舍弃参考实现 |

## 2. Execution Graph

### DAG and Critical Path

```text
G0 baseline/plugin-box/preflight
  ↓
W1 T-01 builtin persistent CRUD
  ↓
W2 T-02 safe lifecycle ── closes G1
  ↓
W3 T-03 capture/organization
  ↓
W4 T-04 typed time/focus views
  ↓
W5 T-05 recurrence/history ── closes G2
  ↓
W6 T-06 scheduler readiness/reminder
  ↓
W7 T-07 isolated Agent runs
  ↓
W8 T-08 Automation surface ── closes G3
  ↓
W9 T-09 import/export/Review ── closes G4
  ↓
W10 T-10 product artifact/release ── closes G5
```

全部 T-01～T-10 构成关键路径。配置最大并发为 3，但有效产品并发为 1：每张票写同一插件根，且前序 schema/identity/runtime 是后序真实开始条件。只读检查可以与实现者本地分析交错，不能形成第二个产品写 owner。

### Waves and Ownership

| Wave | Ticket | 前置条件 | 项目写路径 | Shared owner | 集成点 |
|---|---|---|---|---|---|
| W1 | T-01 | G0 closed、Deep 批准 | `<Path>plugins/todolist/**</Path>` | 无 | 建立 v1/store/route/tool/Page 根契约 |
| W2 | T-02 | T-01 done + Evidence、Deep 批准 | `<Path>plugins/todolist/**</Path>` | 无 | 关闭 G1 数据安全 |
| W3 | T-03 | G1 closed、Deep 批准 | `<Path>plugins/todolist/**</Path>` | 无 | 组织关系与安全 mutation 汇合 |
| W4 | T-04 | T-03 done + Evidence、Deep 批准 | `<Path>plugins/todolist/**</Path>` | 无 | typed time 成为后序权威 |
| W5 | T-05 | T-04 done + Evidence、Deep 批准 | `<Path>plugins/todolist/**</Path>` | 无 | 关闭 G2 occurrence identity |
| W6 | T-06 | G2 closed、Deep 批准 | `<Path>plugins/todolist/**</Path>` | 无 | TaskRegistry/readiness/handoff 稳定 |
| W7 | T-07 | T-06 done + Evidence、Deep 批准 | `<Path>plugins/todolist/**</Path>` | 无 | Agent Run/Session/cancel 协议稳定 |
| W8 | T-08 | T-07 done + Evidence | `<Path>plugins/todolist/**</Path>` | 无 | 关闭 G3 Automation 运营闭环 |
| W9 | T-09 | G3 closed、Deep 批准 | `<Path>plugins/todolist/**</Path>` | 无 | 关闭 G4 exchange v1/Review |
| W10 | T-10 | G4 closed、发布 Gate 批准 | `<Path>plugins/todolist/**</Path>` | 无 | 关闭 G5 产品发布就绪 |

`implementation-owner` 顺序拥有 T-01～T-09；`release-owner` 在 T-09 Evidence 完整、G4 关闭后接管 T-10。两者可以是不同恢复会话中的当前实现者，但同一时刻只允许一个 owner 写插件根。

### Ticket Quick Reference

| ID | Ticket | 行为产出 | Depth/Risk | Dependencies | Wave/Gate | Owner | Evidence |
|---|---|---|---|---|---|---|---|
| T-01 | `<Path>{roots.state}/specdev/changes/2026-08-09-internalize-todolist-plugin/ticket/01-establish-builtin-persistent-crud.md</Path>` | builtin 同源 CRUD | deep/high | — | W1/G0,G1 | implementation-owner | `<Path>{roots.state}/specdev/changes/2026-08-09-internalize-todolist-plugin/evidence/T-01.md</Path>` |
| T-02 | `<Path>{roots.state}/specdev/changes/2026-08-09-internalize-todolist-plugin/ticket/02-deliver-safe-deletion-lifecycle.md</Path>` | Trash/restore/confirm | deep/high | T-01 | W2/G1 | implementation-owner | `<Path>{roots.state}/specdev/changes/2026-08-09-internalize-todolist-plugin/evidence/T-02.md</Path>` |
| T-03 | `<Path>{roots.state}/specdev/changes/2026-08-09-internalize-todolist-plugin/ticket/03-deliver-capture-and-organization.md</Path>` | capture/Project/tags | deep/medium | T-02 | W3/G2 | implementation-owner | `<Path>{roots.state}/specdev/changes/2026-08-09-internalize-todolist-plugin/evidence/T-03.md</Path>` |
| T-04 | `<Path>{roots.state}/specdev/changes/2026-08-09-internalize-todolist-plugin/ticket/04-deliver-typed-time-and-focus-views.md</Path>` | typed time/Today/Upcoming/Calendar | deep/high | T-03 | W4/G2 | implementation-owner | `<Path>{roots.state}/specdev/changes/2026-08-09-internalize-todolist-plugin/evidence/T-04.md</Path>` |
| T-05 | `<Path>{roots.state}/specdev/changes/2026-08-09-internalize-todolist-plugin/ticket/05-deliver-recurrence-history.md</Path>` | recurrence/history | deep/high | T-04 | W5/G2 | implementation-owner | `<Path>{roots.state}/specdev/changes/2026-08-09-internalize-todolist-plugin/evidence/T-05.md</Path>` |
| T-06 | `<Path>{roots.state}/specdev/changes/2026-08-09-internalize-todolist-plugin/ticket/06-deliver-scheduler-readiness-and-reminders.md</Path>` | readiness/reminder handoff | deep/high | T-05 | W6/G3 | implementation-owner | `<Path>{roots.state}/specdev/changes/2026-08-09-internalize-todolist-plugin/evidence/T-06.md</Path>` |
| T-07 | `<Path>{roots.state}/specdev/changes/2026-08-09-internalize-todolist-plugin/ticket/07-deliver-isolated-agent-runs.md</Path>` | Run/Attempt/Session/cancel | deep/high | T-06 | W7/G3 | implementation-owner | `<Path>{roots.state}/specdev/changes/2026-08-09-internalize-todolist-plugin/evidence/T-07.md</Path>` |
| T-08 | `<Path>{roots.state}/specdev/changes/2026-08-09-internalize-todolist-plugin/ticket/08-deliver-automation-operations-surface.md</Path>` | Automation 运营 UI | standard/medium | T-07 | W8/G3 | implementation-owner | `<Path>{roots.state}/specdev/changes/2026-08-09-internalize-todolist-plugin/evidence/T-08.md</Path>` |
| T-09 | `<Path>{roots.state}/specdev/changes/2026-08-09-internalize-todolist-plugin/ticket/09-deliver-import-export-review.md</Path>` | exchange v1/Review | deep/high | T-08 | W9/G4 | implementation-owner | `<Path>{roots.state}/specdev/changes/2026-08-09-internalize-todolist-plugin/evidence/T-09.md</Path>` |
| T-10 | `<Path>{roots.state}/specdev/changes/2026-08-09-internalize-todolist-plugin/ticket/10-release-complete-builtin-todo.md</Path>` | build/seed/E2E/path/removal | standard/high | T-09 | W10/G5 | release-owner | `<Path>{roots.state}/specdev/changes/2026-08-09-internalize-todolist-plugin/evidence/T-10.md</Path>` |

## 3. Gates and Completion Evidence

### Overall Definition of Done

- T-01～T-10 全部 `done`，每张票都有符合 Evidence 规范的 `<Path>{roots.state}/specdev/changes/2026-08-09-internalize-todolist-plugin/evidence/T-NN.md</Path>`；任何 cancelled 项都有用户批准且不留下 uncovered AC。
- AC-001～AC-033 与 NFR-001～NFR-006 都可定位到实际命令、代码/产物状态、截图或人工批准；不能以 Ticket 完成数量代替行为证据。
- 插件全量 Vitest、适用 E2E、`npm run typecheck`、`npm run lint`、`npm run build:server`、`npm run build:renderer`、`npm run build:client`、`npm run verify:seed-kit` 和适用 `npm test` 已运行；失败均分类且没有未经批准退化。
- 产品实现 diff 只包含 `<Path>plugins/todolist/</Path>`；根脚本、公共测试、宿主和其它插件与实施基线相比没有 Todo 产品改动。
- 私有 migration 事务/回滚、TaskRegistry at-least-once、提醒 handoff、Agent 取消、Session 隐私、JSON import/export 和整块删除 smoke 均有正向及适用反向证据。
- 五语言、桌面/窄布局、键盘、焦点、ARIA、主题与截图检查通过；T-10 没有首次补造前序 Ticket 应交付的核心 UI 质量。
- G0～G5 全部关闭，无未批准偏差、blocker、真实用户数据动作或发布动作；Ticket、Map、Plan、Evidence、源码与状态一致。

### Gates

| Gate | 开启条件 | 关闭证据 | 阻塞范围 | Owner/批准人 | 失败恢复 |
|---|---|---|---|---|---|
| G0 基线与插件盒门 | Goal Plan Ready；用户调用 I-implement | baseline SHA/ancestor、clean path、creator preflight、命令存在、9 文件/89 测试写入 `<Path>{roots.state}/specdev/changes/2026-08-09-internalize-todolist-plugin/evidence/T-01.md</Path>`；T-01 Deep 批准 | 全部产品实现 | implementation-owner / 用户 | 保留未修改工作树；事实漂移返回相应 Ticket/Spec/ADR |
| G1 持久根与数据安全 | G0 closed，T-01/T-02 依次获批 | `<Path>{roots.state}/specdev/changes/2026-08-09-internalize-todolist-plugin/evidence/T-01.md</Path>`、`<Path>{roots.state}/specdev/changes/2026-08-09-internalize-todolist-plugin/evidence/T-02.md</Path>`；同源 CRUD、version/transaction、Trash/confirm fault tests、TodoWrite/tool catalog 回归 | W3～W10 | implementation-owner / 用户 | 禁止后序 schema；回退到最后绿色 migration 或前向修复 |
| G2 任务语义与 occurrence | G1 closed，T-03～T-05 依次获批 | `<Path>{roots.state}/specdev/changes/2026-08-09-internalize-todolist-plugin/evidence/</Path>` 中 T-03～T-05 的 capture、DST、recurrence、历史不可变与适用 UI 证据 | W6～W10 | implementation-owner / 用户 | 暂停 scheduler；恢复至 G1 数据基线并修订失败 Ticket |
| G3 后台与自动化安全 | G2 closed，T-06/T-07 获批，T-08 可开始 | `<Path>{roots.state}/specdev/changes/2026-08-09-internalize-todolist-plugin/evidence/</Path>` 中 T-06～T-08 的 readiness、handoff、Run/Session/cancel、Automation UI 证据；due scanner/messages/hidden tools 扫描为零 | W9～W10 | implementation-owner / 用户 | 关闭后台开关、取消 future/queued、保留真实 running/unknown 状态并前向恢复 |
| G4 数据交换与隐私 | G3 closed，T-09 获批 | `<Path>{roots.state}/specdev/changes/2026-08-09-internalize-todolist-plugin/evidence/T-09.md</Path>` 包含 exchange v1、preview 零写、commit rollback/幂等、SQLite 拒绝、redaction、Review/download | W10 | implementation-owner / 用户 | 禁止 commit/export 发布；保持源和原 store，修复后重跑 dry-run |
| G5 产品发布就绪 | G4 closed，用户批准进入发布 Gate | `<Path>{roots.state}/specdev/changes/2026-08-09-internalize-todolist-plugin/evidence/T-10.md</Path>` 包含全部 AC、build/seed/产物加载、五语言 E2E/截图、path allowlist、临时隔离 removal smoke、全量回归分类 | change completion | release-owner / 用户 | 不发布；保留插件数据，关闭后台副作用，按最后关闭 Gate 前向修复或整块撤出候选 |

### Contract and Reference Coverage

| 合同或参考要求 | 覆盖 Ticket | 验证接缝 | Evidence | 状态 |
|---|---|---|---|---|
| builtin、同源 CRUD、TodoWrite、数据安全（AC-001～004、013、014、029、033） | T-01、T-02、T-10 | PluginManager/route/tool/store/confirmation/build | `<Path>{roots.state}/specdev/changes/2026-08-09-internalize-todolist-plugin/evidence/</Path>` | planned |
| 捕获、组织、时间、周期与视图（AC-005～009、015、016、030、031） | T-03～T-05、T-09、T-10 | domain/query/component/Desktop | `<Path>{roots.state}/specdev/changes/2026-08-09-internalize-todolist-plugin/evidence/</Path>` | planned |
| reminder、TaskRegistry 与 Agent automation（AC-010～012、017～024、026） | T-06～T-08、T-10 | fake clock/EventBus/Session/Agent/ResourceIO/E2E | `<Path>{roots.state}/specdev/changes/2026-08-09-internalize-todolist-plugin/evidence/</Path>` | planned |
| import/export/Review（AC-022、027～030） | T-09 | schema fixture/dry-run/rollback/download | `<Path>{roots.state}/specdev/changes/2026-08-09-internalize-todolist-plugin/evidence/T-09.md</Path>` | planned |
| 单目录、产物和完整交互（AC-025、031、032） | T-03、T-04、T-08～T-10 | Git allowlist/build/seed/a11y/screenshots/removal smoke | `<Path>{roots.state}/specdev/changes/2026-08-09-internalize-todolist-plugin/evidence/</Path>` | planned |
| 当前 Hana SDK 与 creator scaffold | T-01、T-10 | creator preflight、SDK/builtin harness、产物 smoke | `<Path>{roots.state}/specdev/changes/2026-08-09-internalize-todolist-plugin/evidence/T-01.md</Path>`、`<Path>{roots.state}/specdev/changes/2026-08-09-internalize-todolist-plugin/evidence/T-10.md</Path>` | baseline verified |
| 参考 0.0.5 的可采纳内容 | T-04、T-05、T-09 | 逐项复用清单 + 等价/更严格测试；HostAdapter/timer/UI 禁用扫描 | `<Path>{roots.state}/specdev/changes/2026-08-09-internalize-todolist-plugin/evidence/</Path>` | planned |

完整逐 AC 映射以 `<Path>{roots.state}/specdev/changes/2026-08-09-internalize-todolist-plugin/tickets-map.md</Path>` 为权威，不在本 Plan 复制第二套状态。

## 4. Execution and Integration Protocol

### Ticket Execution Order

| Ticket | 开始条件 | 执行 owner | 必跑验证 | Evidence | 集成条件 |
|---|---|---|---|---|---|
| T-01 | G0 closed；Deep 批准；插件路径未被占用 | implementation-owner | creator preflight、CRUD/tool/store、TodoWrite、最小 Page E2E、path audit | `<Path>{roots.state}/specdev/changes/2026-08-09-internalize-todolist-plugin/evidence/T-01.md</Path>` | store/DTO/error/tool catalog 稳定后 T-02 |
| T-02 | T-01 done/Evidence；Deep 批准 | implementation-owner | lifecycle/confirmation fault、Trash E2E、CRUD 回归 | `<Path>{roots.state}/specdev/changes/2026-08-09-internalize-todolist-plugin/evidence/T-02.md</Path>` | G1 关闭后 T-03 |
| T-03 | G1 closed；Deep 批准 | implementation-owner | capture/organization、Project rollback、五语言/键盘/narrow E2E、lifecycle 回归 | `<Path>{roots.state}/specdev/changes/2026-08-09-internalize-todolist-plugin/evidence/T-03.md</Path>` | organization DTO 稳定后 T-04 |
| T-04 | T-03 done/Evidence；Deep 批准 | implementation-owner | 多 IANA zone/DST/time projection、planning E2E、capture 回归 | `<Path>{roots.state}/specdev/changes/2026-08-09-internalize-todolist-plugin/evidence/T-04.md</Path>` | typed time 稳定后 T-05 |
| T-05 | T-04 done/Evidence；Deep 批准 | implementation-owner | recurrence unit/integration、重复/事务/历史反向验证、time 回归 | `<Path>{roots.state}/specdev/changes/2026-08-09-internalize-todolist-plugin/evidence/T-05.md</Path>` | G2 关闭后 T-06 |
| T-06 | G2 closed；Deep 批准 | implementation-owner | late/exhausted readiness、wake/restart/cancel/handoff fault、宿主回归、scanner audit | `<Path>{roots.state}/specdev/changes/2026-08-09-internalize-todolist-plugin/evidence/T-06.md</Path>` | scheduler/handoff 稳定后 T-07 |
| T-07 | T-06 done/Evidence；Deep 批准 | implementation-owner | Run/Attempt/Session/cancel fault、privacy/path/tool catalog、capability 回归 | `<Path>{roots.state}/specdev/changes/2026-08-09-internalize-todolist-plugin/evidence/T-07.md</Path>` | Run action/state 稳定后 T-08 |
| T-08 | T-07 done/Evidence | implementation-owner | route/component、illegal action/Session missing、Automation Desktop/narrow E2E、Run 回归 | `<Path>{roots.state}/specdev/changes/2026-08-09-internalize-todolist-plugin/evidence/T-08.md</Path>` | G3 关闭后 T-09 |
| T-09 | G3 closed；Deep 批准 | implementation-owner | fixture/preview/commit/rollback/roundtrip/redaction、Review E2E、插件全量回归 | `<Path>{roots.state}/specdev/changes/2026-08-09-internalize-todolist-plugin/evidence/T-09.md</Path>` | G4 关闭后 T-10 |
| T-10 | G4 closed；发布 Gate 批准 | release-owner | 插件全量、type/lint/build/seed、产物加载、五语言 E2E/截图、allowlist、隔离 removal、全量回归 | `<Path>{roots.state}/specdev/changes/2026-08-09-internalize-todolist-plugin/evidence/T-10.md</Path>` | G5 关闭并按完成规则收口 change |

`deep_ticket_human_approval: true` 是硬门：用户可逐 Ticket 批准，也可在进入 I-implement 时明确一次性批准所列 Deep Ticket；没有覆盖到的 Deep Ticket 仍需在对应 Wave 前暂停。Plan Ready 不等于任何产品实现、真实数据动作或发布动作已获授权。

### Authorization Matrix

| 动作 | 状态 | 目标与条件 |
|---|---|---|
| SpecDev planning/status writes | allowed | 仅当前 change 的 Goal Plan、Ticket/Map 投影、Evidence 与状态同步 |
| Local product changes | conditionally allowed | 仅用户进入 I-implement 后、当前 Ticket active 且只写 `<Path>plugins/todolist/**</Path>` |
| Local tests/build/dev server | conditionally allowed | I-implement 内按 Ticket/Plan 运行；不得改根命令；进程结束或交接时清理 |
| Temporary removal smoke | conditionally allowed | 只在新建并校验的临时隔离目录/worktree 删除 `<Path>plugins/todolist/</Path>`；禁止删除当前工作区目录 |
| Commit | not-authorized | `<Path>{roots.state}/specdev/config.json</Path>` 为 `auto_commit: false`，需用户另行明确授权 |
| Push / PR / Merge | not-authorized | 无远程写授权 |
| Deploy / Publish | not-authorized | G5 只证明发布就绪，不执行部署或发布 |
| Fixture/local temporary migration | conditionally allowed | 仅插件内测试 fixture 或隔离临时 store，必须可回滚并记录 Evidence |
| Real user data import/purge/migration | not-authorized | preview 代码与测试可实现；真实 commit、永久删除或迁移需逐动作批准 |
| Real notification or Agent side effect | not-authorized | 只用 fake/harness/隔离测试；不得向真实用户发通知或执行真实 Agent 副作用 |

### Evidence Return and Integration

1. 每个 Ticket 开始时把状态切为 `in_progress`，记录实际 baseline、工作区状态、批准范围和依赖 Evidence；结束时写 `<Path>{roots.state}/specdev/changes/2026-08-09-internalize-todolist-plugin/evidence/T-NN.md</Path>`。
2. Evidence 至少包含基线、实际项目路径、每条命令/exit/result、AC 映射、未运行项、失败分类、双轴审查、路径审计、偏差、残余风险和最终结论。
3. Ticket 只有在验证与 Evidence 完整后才能 `done`；同步 Ticket、Map、Plan 和 change 状态，再运行 `node <Path>{roots.workflows}/specdev/common/tools/validate-specdev.mjs</Path> --stage implement <Path>{roots.state}/specdev/changes/2026-08-09-internalize-todolist-plugin/</Path>`。
4. 后序 owner 必须重读前序 Ticket/Evidence、确认 Gate 与 `<Path>plugins/todolist/**</Path>` 当前事实，再获得写入权；不得依据口头“完成”接管。
5. 里程碑 Gate 关闭时运行该 Gate 累积回归和适用 E2E，并做静默风险的受控反向验证；失败则 Gate 保持 open，下游 Wave 不开始。
6. release-owner 在 T-10 汇总所有 Evidence 与合同，不重新决定产品行为；G5 关闭后由最后一个 I-implement 按完成规则决定 change 是否可转为 completed。

## 5. Constraints, Risk and Recovery

### Non-negotiable Constraints

- **单目录（USER-DECISION、ADR-014）：** 产品 diff 只能在 `<Path>plugins/todolist/</Path>`；越界即停止全部受影响 Wave，不能通过扩大 Ticket paths 修补。
- **插件只消费宿主（ADR-014）：** 不新增 capability、不改 TaskRegistry 启动顺序、不改 NotificationService/desktop/server/core/SDK；缺 capability 时 fail closed 并可诊断。
- **数据原子性（Spec NFR-003）：** versioned mutation、系列变更和 import 必须事务或可回滚；任何未声明部分成功阻止 Gate 关闭。
- **副作用授权（ADR-003、ADR-013）：** 默认 manual；reminder/agent_execute 显式；cancel_requested 只有宿主确认后才 cancelled；重新启用不复活旧 Run。
- **单一调度与诚实通知（ADR-014）：** TaskRegistry 唯一 due authority；readiness retry 不扫描 Todo；`handed_off` 不等于 delivered；无 Bridge/自动重发。
- **Session/资源隐私（ADR-007、ADR-0004）：** Session 是 transcript 权威；store/DTO/log/export 无完整消息、secret 或绝对路径；ResourceRef 不扩大 workspace。
- **时间与历史（ADR-005、ADR-011、ADR-012）：** date/exact 分型，DST 不猜测；recurrence 有界幂等；历史/完成 occurrence 不可变。
- **迁移边界（ADR-009）：** 旧 SQLite 始终拒绝且零写；无真实脱敏样本不声称 0.0.5 兼容。
- **横切质量（ADR-0018）：** 每个 UI Ticket 同步交付五语言、键盘、ARIA、主题和窄布局；T-10 只汇总和修复集成缺口。
- **验证分层（ADR-0024）：** Vitest 为逻辑/存储/API/组件默认门；Playwright 只用于直接用户流程和发布汇合。

实现者可以在插件根内按仓库惯例选择文件布局、私有抽象和测试组织，只要不改变 Ticket 行为、公共 wire、数据不变量、路径或 Gate 证据。参考实现只允许逐项提炼纯算法/fixture/test intent，并在 Evidence 记录来源与重验证；HostAdapter、双 timer、大型内联 UI 和旧数据库生命周期不得复制。

### Verification Integrity

- 判卷接缝固定为 Ticket 验证矩阵、Gates 表和 `<Path>package.json</Path>` 现有命令；不得删除测试、降低断言、扩大 timeout 掩盖竞态、把命令移出计划或修改根脚本制造绿色。
- 基线 9 文件/89 测试必须无新退化；其它全量失败分为本 Ticket 新失败、基线已有失败、环境失败或验证无效，附命令和复现。
- 路径 allowlist 使用实施 baseline/提交集或受控文件清单，不把用户既有改动归因于本 change，也不覆盖/清理它们。
- 受控反向验证仅在隔离 harness/临时 workspace 执行：Task handler 永不就绪、EventBus emit 崩溃、重复 wake、Session 取消失败、import commit 中断时，测试必须证明 degraded/unknown/cancel_requested/rollback，而不是假绿。
- G5 在隔离环境故意移除必要插件 asset/dependency 或注入插件外 sentinel 到待审计清单时，产物/allowlist Gate 必须失败；恢复隔离环境后重跑为绿，不改当前工作区根文件。
- 无法执行的关键验证不能替换为代码阅读并标绿；记录 `unverified` 会阻止 Ticket/Gate 完成，直到有批准的替代证据。

### Migration or Release Sequence

| 顺序 | 数据或发布动作 | 关闭条件 | 失败恢复 |
|---|---|---|---|
| T-01 | 创建私有 store v1 与 migration journal | 空库初始化、重复启动、事务失败测试通过 | 初始化失败零业务写；移除插件候选或前向修复 |
| T-02～T-07 | 每 Ticket 以单调版本事务扩展 lifecycle、organization、typed time、recurrence、schedule/handoff、Run/Attempt | 前一版本 fixture 可升级；失败保持原版本/数据；新不变量测试通过 | 停止后序 Ticket，保留原 store，回滚事务或前向 migration |
| T-08 | 只消费稳定 Run projection | 无核心 schema 首次变化；UI action 与服务端状态一致 | 回滚插件内 UI/routes，保留 Run 数据 |
| T-09 | 冻结独立 exchange schema v1，preview 后 commit | fixture roundtrip、stale/duplicate、rollback、redaction、SQLite 零写 | 禁止真实 commit；源与原 store 保持，修复后重跑 dry-run |
| T-10 | 构建发布候选、产物/视觉/路径/删除 smoke | G5 全部 Evidence 和用户批准 | 不部署；关闭后台开关，按最后绿色 Gate 前向修复或撤出候选 |

私有 store schema 与 exchange schema 分离：后续 store migration 不得静默改变已发布 exchange v1。没有 expand-contract 宿主兼容层，也没有旧 SQLite contract 阶段。

### Risks, Monitoring and Recovery

| 风险 | 触发/检测 | 事故半径 | 预防 | 恢复 | Owner/批准点 |
|---|---|---|---|---|---|
| 插件外写入 | Git/path audit 出现非插件产品文件 | 破坏用户硬边界和宿主回归 | 每 Ticket path audit、只读宿主 | 停止全部 Wave，撤销本 Ticket 越界变更并返回上游 | 当前 owner / 用户 |
| schema/mutation 部分成功 | fault test、version/计数不一致 | Todo 私有数据损坏 | 事务、expectedVersion、migration fixture | 保持旧数据，回滚事务或前向 migration | implementation-owner / Deep 批准 |
| DST/recurrence 重复或漏项 | 多 zone fixture、duplicate identity | 时间视图和后台副作用 | typed time、bounded materialization、stable identity | 暂停 G2/G3，suppress/前向修复且不改历史 | implementation-owner / 用户 |
| readiness 耗尽或第二 scheduler | startup diagnostics、scanner audit | 提醒/Agent 漏跑或重复 | 有界 handshake、TaskRegistry 唯一权威 | 后台 degraded，CRUD 保持；修复 handshake，不加 timer | implementation-owner / 用户 |
| reminder 重发/伪送达 | handoff state 与故障测试不符 | 用户重复或误判提醒 | 先 claim、stable identity、显式 retry | unknown/failed 可见，不自动重发 | implementation-owner / 用户副作用批准 |
| Agent 未授权执行或取消失败 | capability/Session fault、cancel age | 外部副作用和隐私 | explicit mode、fail closed、每 Todo Session | 停新 Run、cancel_requested、保留诊断人工处置 | implementation-owner / 用户副作用批准 |
| transcript/path 泄漏 | store/DTO/export/redaction 扫描 | 隐私和 workspace 边界 | sessionRef/ResourceRef、最小摘要 | 阻止 G3/G4，清除未发布 fixture/产物并前向修复 | implementation-owner / 用户 |
| UI 质量积压 | locale/a11y/narrow tests 或截图失败 | 核心流程不可用 | 每 UI Ticket 同步交付质量 | 不进入后序 Gate；在当前 Ticket 插件内修复 | 当前 owner |
| build/seed workspace 假通过 | 精确产物缺依赖或需 symlink | 发布产物不可运行 | 从产物加载、依赖清单、removal smoke | G5 保持 open；只在插件根修复依赖/资产 | release-owner / 发布 Gate 批准 |

### Deviation Control

- local 偏差只在不改变行为、wire、schema contract、路径或验证时记录到当前 Evidence 后继续。
- ticket 偏差暂停当前 Ticket 及全部后序 Wave，更新 Ticket/Map/Plan 并获得用户批准；已受影响 Gate 重新打开。
- spec 偏差返回 `<Path>{roots.workflows}/specdev/S-spec/S-spec.md</Path>`；architecture 偏差返回 `<Path>{roots.workflows}/specdev/G-grill-with-docs/G-grill-with-docs.md</Path>`；release 偏差停止 G5 并取得明确批准。
- 任一需要写出 `<Path>plugins/todolist/**</Path>` 的实现发现直接视为用户边界冲突，不得仅扩大 `writable_paths`；G0 及所有后续 Gate 失效。
- capability/SDK/基线漂移使 Ticket 核心行为不可执行时，保留已通过 Evidence，标记失效范围和恢复条件，不以 fallback 或宿主补丁继续。

## 6. Progress and Decisions

### Current Status

```text
WAVE_STATUS wave=W1 ready=T-01 active=none done=none blocked=none
GATE_STATUS gate=G0 state=open evidence=plan-time-preflight-and-89-baseline-tests risks=implementation-authorization-and-start-time-recheck
TICKET_STATUS id=T-01..T-10 state=ready evidence=none deviation=none
```

Plan-time 验证已完成：feature-placement 仍裁决 builtin `<Path>plugins/todolist/</Path>`；tickets stage 为 0 error/0 warning；creator preflight 通过；当前 package scripts/dependencies 可用；9 个宿主接缝文件、89 项测试通过。产品实现和所有 AC 行为仍未验证，G0 只有在 I-implement 开始时把重检结果写入 T-01 Evidence 后才能关闭。

### Pending Decisions and Blockers

- **执行授权：** 等待用户明确进入 `<Path>{roots.workflows}/specdev/I-implement/I-implement.md</Path>`；这不阻止 Plan Ready，但阻止任何产品写入。
- **Deep 批准：** 尚未授予实现批准；进入 I 时可明确逐票或一次性覆盖 T-01～T-07、T-09。
- **发布/真实数据/外部动作：** 均未授权；G5 只产生发布就绪证据。
- **产品 blocker：** 无。没有高影响产品未知项，当前没有 deviation。

### Resume Protocol

1. 读取本 Plan、当前 Ticket、前序最新 Evidence、Tickets Map 和 change 状态。
2. 确认 Git 当前 HEAD 是计划冻结点的后继、当前工作树用户改动受保护、插件路径 ownership 未变化；重跑 creator preflight、tickets/goal-plan validator 和适用宿主基线。
3. 解析第一个非 done Ticket、适用 Wave/Gate、owner 和批准范围；未获批准则停在 Gate，不创建产品文件。
4. 从最后一个有实际命令和代码事实的 Evidence 继续；不重复已确认产品决定，不用状态摘要替代 Evidence。
5. T-10/G5 关闭后，最后一个 I-implement 按 `<Path>{roots.workflows}/specdev/common/rules/change-completion.md</Path>` 汇总并决定 completed；未经授权不提交、推送、合并、部署或发布。

### Reporting Format

```text
WAVE_STATUS wave=<Wn> ready=<ids> active=<ids> done=<ids> blocked=<ids>
GATE_STATUS gate=<Gn> state=open|closed evidence=<paths> risks=<summary>
TICKET_STATUS id=<T-NN> state=<state> evidence=<path> deviation=<none|id>
BLOCKER id=<id> owner=<owner> needed=<decision-or-input> impact=<scope>
DECISION id=<id> owner=<owner> status=pending|approved|rejected impact=<scope>
```

## Assumptions

- 实施开始时可以位于计划冻结 SHA 的后继提交；仅当关键宿主接缝与插件路径未漂移并重跑 G0 为绿时成立。
- `implementation-owner` 与 `release-owner` 可以由同一当前实现者在不同 Wave 承担，但 ownership 只能在前序 Evidence 完整后串行转移。
- 当前没有真实脱敏 0.0.5 样本；T-09 只交付当前 versioned JSON 与旧 SQLite/未知格式拒绝合同。
- 没有固定部署窗口或远程交付要求；G5 关闭只表示本地产品实现达到发布就绪，不授权发布。
