---
schema_version: 3
artifact: tickets-map
change: 2026-08-09-internalize-todolist-plugin
status: ready
---

# Tickets Map: Hana Todo 内置插件

- **Map：** `<Path>{roots.state}/specdev/changes/2026-08-09-internalize-todolist-plugin/tickets-map.md</Path>`
- **Spec：** `<Path>{roots.state}/specdev/changes/2026-08-09-internalize-todolist-plugin/spec.md</Path>`
- **Ticket 目录：** `<Path>{roots.state}/specdev/changes/2026-08-09-internalize-todolist-plugin/ticket/</Path>`
- **Evidence 目录：** `<Path>{roots.state}/specdev/changes/2026-08-09-internalize-todolist-plugin/evidence/</Path>`
- **可选 Goal Plan：** `<Path>{roots.state}/specdev/changes/2026-08-09-internalize-todolist-plugin/goal-plan.md</Path>`

## 1. 目标与拆分策略

本 Map 把 US-001～US-011 与 AC-001～AC-033 拆成十个从稳定入口到可观察结果的纵向 Ticket。根切片先交付可用的 builtin CRUD；后续依次扩展安全生命周期、捕获组织、类型化时间、周期、TaskRegistry 提醒、Agent Run、Automation 运营、数据交换，最后以真实产品构建和桌面流程收口。

严格执行 ADR-014 与 USER-DECISION：所有产品实现、测试、fixture、Playwright 配置、构建资产和依赖声明只可写 `<Path>plugins/todolist/</Path>`。宿主、根构建脚本、公共测试与其它插件只读。十张票都会演进同一私有 store/application/Page/runtime；依赖边同时代表真实数据/接口前置，因此采用串行 DAG，不用 shared path 或“最后合并冲突”表达所有权。

没有独立 host prefactor，也没有 expand-contract：当前 PluginManager/EventBus/TaskRegistry/Session/Agent/ResourceIO 接缝足以被内置插件消费。旧 0.0.5 SQLite 不进入兼容窗口；只有版本化 JSON preview/commit，且没有真实脱敏样本时不声称旧数据兼容。

## 2. 执行清单

| ID | Ticket | 可观察产出 | Blocked By | Depth | Risk | Ready | Owner | Contract IDs | Wave/Gate | Status |
|---|---|---|---|---|---|---|---|---|---|---|
| T-01 | `<Path>{roots.state}/specdev/changes/2026-08-09-internalize-todolist-plugin/ticket/01-establish-builtin-persistent-crud.md</Path>` | builtin Page 与 `todo_*` tools 同源持久 CRUD | — | deep | high | yes | implementation-owner | AC-001～004、029、033 | W1 / G1 根契约 | ready |
| T-02 | `<Path>{roots.state}/specdev/changes/2026-08-09-internalize-todolist-plugin/ticket/02-deliver-safe-deletion-lifecycle.md</Path>` | soft delete、Undo、Trash 与安全 confirm | T-01 | deep | high | yes | implementation-owner | AC-013、014、029 | W2 / G1 数据安全 | ready |
| T-03 | `<Path>{roots.state}/specdev/changes/2026-08-09-internalize-todolist-plugin/ticket/03-deliver-capture-and-organization.md</Path>` | Inbox/Project/tags 与可见继承 chip | T-02 | deep | medium | yes | implementation-owner | AC-006、007、029、031 | W3 / G2 日常任务 | ready |
| T-04 | `<Path>{roots.state}/specdev/changes/2026-08-09-internalize-todolist-plugin/ticket/04-deliver-typed-time-and-focus-views.md</Path>` | typed time、DST、Today/Upcoming/Calendar | T-03 | deep | high | yes | implementation-owner | AC-005、008、009、030、031 | W4 / G2 时间意图 | ready |
| T-05 | `<Path>{roots.state}/specdev/changes/2026-08-09-internalize-todolist-plugin/ticket/05-deliver-recurrence-history.md</Path>` | 两类周期、系列编辑与历史不可变 | T-04 | deep | high | yes | implementation-owner | AC-014～016、029 | W5 / G2 周期 | ready |
| T-06 | `<Path>{roots.state}/specdev/changes/2026-08-09-internalize-todolist-plugin/ticket/06-deliver-scheduler-readiness-and-reminders.md</Path>` | 有界 readiness、唯一 schedule 与提醒 handoff | T-05 | deep | high | yes | implementation-owner | AC-009～012、023、024、029 | W6 / G3 后台就绪 | ready |
| T-07 | `<Path>{roots.state}/specdev/changes/2026-08-09-internalize-todolist-plugin/ticket/07-deliver-isolated-agent-runs.md</Path>` | 每 Todo×occurrence 隔离 Run/Session/Attempt 与安全取消 | T-06 | deep | high | yes | implementation-owner | AC-009、012、017～020、022、026、029、033 | W7 / G3 自动化协议 | ready |
| T-08 | `<Path>{roots.state}/specdev/changes/2026-08-09-internalize-todolist-plugin/ticket/08-deliver-automation-operations-surface.md</Path>` | 可筛选、可诊断、可行动的 Automation Page | T-07 | standard | medium | yes | implementation-owner | AC-020～022、029、031 | W8 / G3 运营面 | ready |
| T-09 | `<Path>{roots.state}/specdev/changes/2026-08-09-internalize-todolist-plugin/ticket/09-deliver-import-export-review.md</Path>` | JSON preview/commit、显式导出与 Review | T-08 | deep | high | yes | implementation-owner | AC-022、027～031 | W9 / G4 数据交换 | ready |
| T-10 | `<Path>{roots.state}/specdev/changes/2026-08-09-internalize-todolist-plugin/ticket/10-release-complete-builtin-todo.md</Path>` | 构建/seed/视觉/a11y/路径/可移除发布证据 | T-09 | standard | high | yes | release-owner | AC-001、003、023、025、029、031～033 | W10 / G5 发布 | ready |

Ticket frontmatter 是状态、依赖、深度和路径访问契约的权威；本表是同步投影，不得独立修改出另一套真相。W1～W10 是顺序候选 Wave，不表示并行；正式 Gate、owner 和发布编排由 Goal Plan 决定。

## 3. 依赖 DAG

```text
T-01 [READY, root CRUD contract]
  └─→ T-02 [safe mutation/confirmation]
        └─→ T-03 [capture/organization]
              └─→ T-04 [typed time/projections]
                    └─→ T-05 [recurrence identity/history]
                          └─→ T-06 [TaskRegistry readiness/reminder claim]
                                └─→ T-07 [Agent Run/Session protocol]
                                      └─→ T-08 [Automation operations UI]
                                            └─→ T-09 [full-model exchange/Review]
                                                  └─→ T-10 [product artifact/release gate]
```

每条边均是真实开始条件：T-02 依赖稳定 version/store；T-03 依赖安全 mutation；T-04 依赖捕获和组织 DTO；T-05 依赖 typed time；T-06 依赖 occurrence/trigger identity；T-07 依赖唯一 scheduler/readiness；T-08 依赖 Run action/state；T-09 依赖最终持久模型和运营投影；T-10 依赖完整产品行为。DAG 没有为人员交接或“更方便”添加边。

## 4. 合同覆盖矩阵

| Contract ID | 覆盖 Ticket | 验证接缝 | 状态 | 说明 |
|---|---|---|---|---|
| AC-001 | T-01、T-10 | PluginManager harness + Desktop/build | covered | builtin loaded、Page/CRUD、产物加载 |
| AC-002 | T-01 | route/tool/store 集成 | covered | Page 与 tools 同源 |
| AC-003 | T-01、T-10 | tool catalog + TodoWrite 回归 | covered | 不覆盖 `todo_write` |
| AC-004 | T-01 | CRUD application/route/tool | covered | id/version/status/pagination |
| AC-005 | T-04 | time query/domain/UI | covered | attentionDate 与聚焦成员 |
| AC-006 | T-03 | capture component/E2E | covered | 可见继承 chips |
| AC-007 | T-03 | organization store/service | covered | Project/List/tags 与回 Inbox |
| AC-008 | T-04 | 多时区/DST fixture | covered | date/exact 与 gap/overlap |
| AC-009 | T-04、T-06、T-07 | domain + scheduler + automation | covered | 默认 manual、无隐式副作用 |
| AC-010 | T-06 | EventBus/handoff store | covered | 先 claim 后 notification handoff |
| AC-011 | T-06 | 崩溃/重复故障注入 | covered | stable identity 与显式 retry |
| AC-012 | T-06、T-07 | 配置/TaskRegistry/Run 集成 | covered | reminder/automation 独立开关 |
| AC-013 | T-02 | lifecycle service + E2E | covered | soft delete/undo/Trash |
| AC-014 | T-02、T-05 | confirmation/series transaction | covered | session/version/token 与危险批量 |
| AC-015 | T-05 | recurrence unit/integration | covered | calendar/after-completion 幂等 |
| AC-016 | T-05 | override/version/suppression | covered | 历史不可变与事务回滚 |
| AC-017 | T-07 | Task/Session harness | covered | 唯一 Run/private Session |
| AC-018 | T-07 | retry/Attempt 集成 | covered | 同 Run 增 Attempt |
| AC-019 | T-07 | result protocol/store | covered | 最小结果且不自动完成 Todo |
| AC-020 | T-07、T-08 | cancel fault + UI action | covered | cancel_requested 到宿主确认 |
| AC-021 | T-08 | route/component/Playwright | covered | Automation 筛选、动作、跳转 |
| AC-022 | T-07、T-08、T-09 | store/Session/export 扫描 | covered | Session 对话权威、无消息副本 |
| AC-023 | T-06、T-10 | 启动时序 harness + release | covered | 晚就绪有限 retry、无 due timer |
| AC-024 | T-06 | TaskRegistry 假时钟/重启 | covered | 补偿、重复收敛、取消有效 |
| AC-025 | T-10 | Git path allowlist | covered | 产品 diff 仅插件根 |
| AC-026 | T-07 | ResourceIO/Session 安全集成 | covered | ResourceRef、不扩大 workspace |
| AC-027 | T-09 | migration dry-run/rollback | covered | JSON preview/commit、SQLite 拒绝 |
| AC-028 | T-09 | export/download 集成 | covered | 显式 JSON/Markdown、无工作区写入 |
| AC-029 | T-01～T-10 | schema/故障注入/发布回归 | covered | 稳定错误、无 fallback/隐藏部分成功 |
| AC-030 | T-04、T-09 | projection/UI | covered | Calendar/Completed/Review 同源 |
| AC-031 | T-03、T-04、T-08、T-09、T-10 | component/a11y/Desktop+narrow | covered | 五语言、键盘、主题、无重叠 |
| AC-032 | T-10 | build/seed/artifact/removal smoke | covered | 自动收录、自包含、可整块删除 |
| AC-033 | T-01、T-07、T-10 | tool catalog | covered | 仅用户级 namespaced tools |

无 `uncovered` 或 `deferred` 合同。

## 5. 并行与路径所有权

- 最大并发来自 `<Path>{roots.state}/specdev/config.json</Path>`，但本 change 不以可用并发上限覆盖真实数据和接口依赖。
- 所有 Ticket 的唯一产品写入授权均为 `<Path>plugins/todolist/**</Path>`，且 DAG 中任意两票均存在传递依赖，因此不会形成 concurrent Ready writable overlap。
- `shared_paths` 与 `shared_path_owners` 全部为空；每个阶段仅当前 Ticket 是插件根写入 owner。
- T-01～T-09 的正式 owner 为 `implementation-owner`；T-10 的正式 owner 为 `release-owner`。owner 只能在前序 Evidence 完整并同步状态后接管插件根。
- 宿主、公共测试、构建脚本和参考插件均为只读；不存在“由最后一票修宿主”或“最终解决合并冲突”的授权。

| Ticket A | Ticket B | Writable 交集 | 真实依赖 | 处理 |
|---|---|---|---|---|
| 任意 T-N | 任意后续 T-M | `<Path>plugins/todolist/**</Path>` | 是，DAG 传递依赖 | 串行；后续票开始前读取前序 Evidence/契约 |

## 6. Gate、Wave 与集成点

- **G0 基线与插件盒门：** 实施前冻结 Git/命令/SDK 接缝，运行 creator preflight 和宿主基线，并获得适用 Deep Ticket 人工批准。
- **G1 根契约/数据安全：** T-01～T-02；CRUD、version、store、Trash 与 confirmation 成为后续 mutation 基线。
- **G2 日常任务/时间/周期：** T-03～T-05；完成用户可见任务管理和 stable occurrence identity。
- **G3 后台与自动化：** T-06～T-08；先证明 TaskRegistry readiness/提醒，再开放 Agent Run 和运营 UI。
- **G4 数据交换：** T-09；在完整 schema 后冻结 exchange v1、Review 与隐私红线。
- **G5 产品发布：** T-10；构建、seed、产物、E2E、路径和可移除性汇合。

正式编排由 `<Path>{roots.state}/specdev/changes/2026-08-09-internalize-todolist-plugin/goal-plan.md</Path>` 负责；其基线、开始条件、Gate 证据、授权和恢复规则是本 Map 的执行权威。

## 7. 横切契约与风险

- **唯一写入边界：** 产品文件只能在 `<Path>plugins/todolist/</Path>`；SpecDev planning/evidence 工件不属于产品实现。
- **数据与错误：** 全部 mutation versioned/transactional；失败使用稳定、脱敏类别，不吞错、不 fallback、不隐藏部分成功。
- **副作用：** 默认 manual；reminder/agent_execute 显式授权且开关独立；TaskRegistry 唯一 due authority。
- **通知语义：** `handed_off` 不是 delivered；无 Bridge、无新 notification capability、无自动外部重发。
- **Session/资源隐私：** Session 是 transcript 权威；store/export 无完整 messages、secret 或绝对路径；ResourceRef 不扩大 workspace。
- **UI 质量：** 每个 UI Ticket 同时实现五语言、键盘、焦点、ARIA、主题和窄布局；T-10 只做整体验证/插件内修复，不延后质量债。
- **迁移与恢复：** 私有 schema 逐 Ticket 事务演进；旧 SQLite fail closed；导入 preview 后 commit；已有副作用或历史 occurrence 使用前向恢复，不伪造回滚。
- **发布：** 复用既有通配 build/seed；不得修改根命令；在临时隔离环境做整块删除 smoke，保护当前工作区和用户改动。

## 8. 同步规则

- Ticket 状态变化后同步本执行清单；Ticket frontmatter 是状态、依赖、深度和路径合同的权威。
- Ticket ID、路径、依赖或合同覆盖变化后重新运行 `<Path>{roots.workflows}/specdev/common/tools/validate-specdev.mjs</Path>`。
- Goal Plan 存在后，Wave、Gate、owner、基线、发布和恢复以 `<Path>{roots.state}/specdev/changes/2026-08-09-internalize-todolist-plugin/goal-plan.md</Path>` 为编排权威并投影回本 Map。
- 每张完成票必须生成 `<Path>{roots.state}/specdev/changes/2026-08-09-internalize-todolist-plugin/evidence/T-NN.md</Path>`；Evidence 不完整、验证未运行或偏差未批准时不得标 `done`。
- 任何需要写出 `<Path>plugins/todolist/**</Path>` 的实现发现必须停止，并按偏差控制回到 Spec/ADR/Ticket；不得先修改后报告。
