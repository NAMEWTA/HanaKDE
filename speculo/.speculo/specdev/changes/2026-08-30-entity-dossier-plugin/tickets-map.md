---
schema_version: 3
artifact: tickets-map
change: 2026-08-30-entity-dossier-plugin
status: completed
---

# Tickets Map: Hana Dossiers 档案插件

- **Map：** `<Path>{roots.state}/specdev/changes/2026-08-30-entity-dossier-plugin/tickets-map.md</Path>`
- **Spec：** `<Path>{roots.state}/specdev/changes/2026-08-30-entity-dossier-plugin/spec.md</Path>`
- **Ticket 目录：** `<Path>{roots.state}/specdev/changes/2026-08-30-entity-dossier-plugin/ticket/</Path>`
- **Evidence 目录：** `<Path>{roots.state}/specdev/changes/2026-08-30-entity-dossier-plugin/evidence/</Path>`
- **Goal Plan：** `<Path>{roots.state}/specdev/changes/2026-08-30-entity-dossier-plugin/goal-plan.md</Path>`

## 1. 目标与拆分策略

11 个纵向 Ticket 共同交付一个完全位于 `<Path>plugins/dossiers/**</Path>` 的 Hana Dossiers 插件：工作区 `Dossiers/` 是可迁移权威，档案可管理属性、联系人与受管资料，Agent 只获得相对引用并按需读取。拆分先以 T-01 prefactor 锁定身份、路径、原子写入和共享 runtime，再按目录、资料、Agent、生命周期、交换、索引与迁移形成独立行为切片；UI 组件与业务切片并行，最终由 T-11 expand/contract 装配公开插件入口并执行真实主机 Gate。

本 Change 无旧插件调用点需要 contract 删除。兼容策略是 expand 新的版本化工作区格式，T-08 负责旧 schema 迁移和 future-version fail closed，T-11 只在兼容 Gate 后开放写入。由于 Ticket 数量为 11 且存在多条汇合边，后续建议运行 Goal Plan 确定 workspace、candidate 和 Lead 集成顺序。

## 2. 执行清单

| ID | Ticket | 可观察产出 | Blocked By | Depth | Risk | Ready | Owner | Contract IDs | Wave/Gate | Status |
|---|---|---|---|---|---|---|---|---|---|---|
| T-01 | `<Path>{roots.state}/specdev/changes/2026-08-30-entity-dossier-plugin/ticket/01-workspace-authority-foundation.md</Path>` | 幂等创建兼容 `Dossiers/`，提供路径/身份/原子写入基础 | — | deep | high | yes | root | AC-003, AC-004 | S01 / G1 | done |
| T-02 | `<Path>{roots.state}/specdev/changes/2026-08-30-entity-dossier-plugin/ticket/02-catalog-contacts-search.md</Path>` | 多类型档案、模板字段、独立联系人和元数据目录 CRUD | T-01 | deep | high | yes | root | AC-006–AC-009 | W2 authority | done |
| T-03 | `<Path>{roots.state}/specdev/changes/2026-08-30-entity-dossier-plugin/ticket/03-managed-document-intake.md</Path>` | 文件复制/同目录引用、哈希去重、分类事务 | T-01, T-02 | deep | high | yes | root | AC-010–AC-014 | W3 documents | done |
| T-04 | `<Path>{roots.state}/specdev/changes/2026-08-30-entity-dossier-plugin/ticket/04-agent-tools-and-model-boundary.md</Path>` | 相对引用 Agent tools、模型开关和确认建议 | T-02, T-03 | deep | high | yes | root | AC-018–AC-023, AC-031 | W4 agent | done |
| T-05 | `<Path>{roots.state}/specdev/changes/2026-08-30-entity-dossier-plugin/ticket/05-trash-audit-retention.md</Path>` | 30 天回收站、恢复及分级审计保留 | T-02, T-03 | deep | high | yes | root | AC-009, AC-024, AC-025, AC-030, AC-031 | W4 lifecycle | done |
| T-06 | `<Path>{roots.state}/specdev/changes/2026-08-30-entity-dossier-plugin/ticket/06-portable-zip-exchange.md</Path>` | 安全单档案 ZIP 往返及整库迁移入口 | T-02, T-03 | deep | high | yes | root | AC-026, AC-027 | W4 exchange | done |
| T-07 | `<Path>{roots.state}/specdev/changes/2026-08-30-entity-dossier-plugin/ticket/07-rebuildable-metadata-index.md</Path>` | 可删除重建的元数据索引与规模基准 | T-01, T-02 | deep | medium | yes | root | AC-015, AC-016, AC-029 | W3 index | done |
| T-08 | `<Path>{roots.state}/specdev/changes/2026-08-30-entity-dossier-plugin/ticket/08-schema-migration-and-recovery.md</Path>` | 权威 schema 迁移、journal、恢复和兼容 Gate | T-02, T-03, T-05, T-06, T-07 | deep | high | yes | root | AC-005, AC-007, AC-028 | W5 migrate gate | done |
| T-09 | `<Path>{roots.state}/specdev/changes/2026-08-30-entity-dossier-plugin/ticket/09-catalog-ui-components.md</Path>` | 档案目录、搜索、创建和详情编辑组件 | T-02, T-07 | standard | medium | yes | root | AC-006, AC-008, AC-015, AC-016 | W4 UI catalog | done |
| T-10 | `<Path>{roots.state}/specdev/changes/2026-08-30-entity-dossier-plugin/ticket/10-operations-ui-components.md</Path>` | 资料、联系人、确认、回收站、交换和迁移 UI | T-03, T-04, T-05, T-06, T-08 | standard | medium | yes | root | AC-010, AC-013, AC-020, AC-021, AC-024–AC-027 | W6 UI operations | done |
| T-11 | `<Path>{roots.state}/specdev/changes/2026-08-30-entity-dossier-plugin/ticket/11-plugin-composition-and-e2e.md</Path>` | 可发现的完整插件、独立生产包和真实主机 E2E | T-04, T-08, T-09, T-10 | deep | high | yes | root | AC-001, AC-002, AC-017, AC-032 | W7 release gate | done |

Ticket frontmatter 是状态、依赖、深度和路径访问契约的权威；本表是同步投影，不得独立修改出另一套真相。

## 3. 依赖 DAG

```text
T-01 [PREFACTOR: workspace authority owner]
  └─→ T-02 [catalog/contact authority]
        ├─→ T-03 [managed documents]
        │     ├─→ T-04 [Agent boundary]
        │     ├─→ T-05 [lifecycle/audit]
        │     └─→ T-06 [ZIP exchange]
        └─→ T-07 [rebuildable index]
              └─→ T-09 [catalog UI]

T-02 + T-03 + T-05 + T-06 + T-07
  └─→ T-08 [MIGRATE/COMPATIBILITY GATE]

T-03 + T-04 + T-05 + T-06 + T-08
  └─→ T-10 [operations UI]

T-04 + T-08 + T-09 + T-10
  └─→ T-11 [EXPAND/INTEGRATION/RELEASE GATE]
```

结构 DAG 中 T-03/T-07 与 T-04/T-05/T-06/T-09 具备并行条件；本 Goal Plan 已选择 `current` 工作区策略，因此实际执行固定为 T-01 → T-02 → T-03 → T-07 → T-04 → T-05 → T-06 → T-09 → T-08 → T-10 → T-11，任何时刻仅一个 implementation writer。T-08 等待所有权威 schema writer，T-11 是唯一插件入口和最终主机集成点。

## 4. 合同覆盖矩阵

| Contract ID | 覆盖 Ticket | 验证接缝 | 状态 | 说明 |
|---|---|---|---|---|
| AC-001 | T-11 | Git diff allowlist | covered | 产品变更仅在插件目录 |
| AC-002 | T-11 | PluginManager/route discovery | covered | manifest、Page、tools 可发现 |
| AC-003 | T-01 | workspace init integration | covered | 空工作区幂等初始化 |
| AC-004 | T-01 | incompatible directory fixture | covered | 非空未知目录零写入 |
| AC-005 | T-08 | copied-library migration | covered | 复制整库后恢复权威事实 |
| AC-006 | T-02, T-09 | domain CRUD + component | covered | 多类型统一身份与创建 UI |
| AC-007 | T-02, T-08 | schema preview/migration | covered | 模板变化不静默丢值 |
| AC-008 | T-02, T-09 | contact relation + component | covered | 独立联系人多角色复用 |
| AC-009 | T-02, T-05 | reference/delete lifecycle | covered | 解除关系不删联系人 |
| AC-010 | T-03, T-10 | ResourceIO copy + preview UI | covered | 外部资料复制入受管目录 |
| AC-011 | T-03 | same-target reference | covered | 同目录只登记引用 |
| AC-012 | T-03 | hash/naming property tests | covered | 去重、稳定后缀、不覆盖 |
| AC-013 | T-03, T-10 | fault injection + progress UI | covered | 中断不发布半成品 |
| AC-014 | T-03 | classification transaction | covered | 主分类移动、标签不移动 |
| AC-015 | T-07, T-09 | metadata query + UI | covered | 分页可复现元数据搜索 |
| AC-016 | T-07, T-09 | content sentinel negative test | covered | 正文词不命中 |
| AC-017 | T-11 | real-host Playwright | covered | 全页面/窄屏且无关系视图 |
| AC-018 | T-04 | Agent tool contract | covered | 初始上下文仅元数据/相对引用 |
| AC-019 | T-04 | controlled-read observation | covered | 仅实际读取资料进入上下文 |
| AC-020 | T-04, T-10 | suggestion confirmation | covered | 未确认不改权威 |
| AC-021 | T-04, T-10 | model toggle | covered | 关闭内容入口、保留元数据 |
| AC-022 | T-04 | model-call spy | covered | 零后台模型调用/扫描 |
| AC-023 | T-04 | reviewer-bound side effects | covered | 未确认批量/删除/覆盖拒绝 |
| AC-024 | T-05, T-10 | fake-clock lifecycle + UI | covered | 30 天删除恢复与确认清理 |
| AC-025 | T-05, T-10 | restore conflict | covered | 恢复不覆盖当前内容 |
| AC-026 | T-06, T-10 | ZIP round-trip + UI | covered | 自包含单档案包 |
| AC-027 | T-06, T-10 | hostile ZIP preview | covered | 权威写入前拒绝不可信包 |
| AC-028 | T-08 | migration fault injection | covered | 备份、中断恢复和非 ready 状态 |
| AC-029 | T-07 | corrupt-index rebuild | covered | 从 JSON 重建相同投影 |
| AC-030 | T-05 | fake-clock audit cleanup | covered | 1 年普通/永久特殊保留 |
| AC-031 | T-04, T-05 | log/audit redaction scan | covered | 无正文、敏感值、凭据和绝对路径 |
| AC-032 | T-11 | standalone package smoke | covered | 精确发布目录独立加载 |

无 `uncovered` 或 `deferred` 合同。

## 5. 并行与路径所有权

- config 的实现 agent 上限为 3；本 Goal Plan 因 `current` 模式主动降低为 1，不含 Lead，所有 Ticket 严格串行。
- review/research/test-observation agent 保持只读；Lead 是 SpecDev 状态与父分支 integration owner。
- T-01 是 `<Path>plugins/dossiers/src/domain/**</Path>`、`<Path>plugins/dossiers/src/infrastructure/workspace/**</Path>` 和 `<Path>plugins/dossiers/src/runtime.ts</Path>` 的唯一 shared owner；T-02–T-11 只能读取。
- T-11 是 manifest、entry、Page shell、build、assets 和真实 E2E 的唯一 owner；不得借集成修改上游切片路径。
- T-05 在 T-02 checkpoint 后接管 `<Path>plugins/dossiers/routes/catalog.ts</Path>` 与 `<Path>plugins/dossiers/tools/catalog-contact.ts</Path>` 的联系人删除薄分支，使所有删除入口检查 restorable Trash references；T-02 domain/schema 所有权不变。
- 所有 Ticket 的项目 writable paths 均限制在 `<Path>plugins/dossiers/**</Path>`；任何产品核心/根依赖需求触发停止与范围偏差门。

| Ticket A | Ticket B | Writable 交集 | 真实依赖 | 处理 |
|---|---|---|---|---|
| T-03 | T-07 | 无 | 否 | W3 可并行 |
| T-04 | T-05 | 无 | 否 | W4 可并行 |
| T-04 | T-06 | 无 | 否 | W4 可并行 |
| T-05 | T-06 | 无 | 否 | W4 可并行 |
| T-04/T-05/T-06 | T-09 | 无 | 否 | W4 可并行 |
| T-08 | T-10 | 无 | 是 | T-10 等待 migration state contract |
| T-09 | T-10 | 无 | 否 | 路径可并行，但当前 DAG 中 T-10 较晚 |
| T-01 | T-02–T-11 | shared path 只读交集 | 是/共享合同 | 仅 T-01 写，消费者不得修改 |
| T-02 | T-05 | catalog contact route/tool 两个薄 adapter | 是/AC-009 删除预检 | T-02 checkpoint 后由 T-05 串行接管删除分支并重跑 catalog 回归 |

## 6. Gate、Wave 与集成点

| Wave/Gate | Ticket | 行为里程碑 | 集成条件 |
|---|---|---|---|
| S01 / G1 | T-01 | 工作区权威与原子基础 | init/incompatible/fault tests 通过 |
| S02 / G2 | T-02 | 档案/模板/联系人合同 | CRUD、引用和 schema tests 通过 |
| S03–S04 / G3 | T-03, T-07 | 资料事务与可重建索引 | 两个 direct-parent checkpoint 独立验证 |
| S05–S08 / G4 | T-04, T-05, T-06, T-09 | Agent、生命周期、交换和目录 UI | 串行形成四个 result SHA，失败路径完整 |
| S09 / G5 | T-08 | 权威格式兼容与恢复 | migration rehearsal 通过后开放下游 |
| S10 / G6 | T-10 | 全部高风险动作有预检/确认/恢复 UI | component contracts 与上游状态一致 |
| S11 / G7 | T-11 | 完整插件、真实宿主 E2E、独立包 | allowlist、build、E2E、recovery、smoke 全通过 |

workspace 固定为 `current`，集成门为 `direct-parent`；不得创建 source/candidate worktree。required E2E 由 Lead 在 current workspace 的真实 Hana 主机执行，不能由 implementation owner 自报通过。

## 7. 横切契约与风险

- **权威边界：** `Dossiers/` 内版本化 JSON 和 managed files 是全部可迁移权威；`catalog.sqlite` 与 plugin-private state 均可删除重建。
- **复制语义：** 目标受管目录外的文件复制入内；已在目标目录的文件只登记规范引用；哈希重复合并、同名异内容稳定改名，永不静默覆盖。
- **Agent/模型：** 初次仅给元数据和相对 ResourceRef；插件不主动调用模型、不后台扫描；全局开关关闭时 fail closed。
- **安全：** 所有路径 canonicalize 后限制在工作区根；ZIP、恢复、批量、覆盖、删除和迁移具有预检/确认门；日志与审计不含正文和敏感值。
- **兼容/恢复：** 原子暂存、journal、版本探测、future-version 只读诊断；卸载或回退插件不删除用户 `Dossiers/`。
- **发布边界：** 只允许 `<Path>plugins/dossiers/**</Path>` 产品 diff，不修改 core/server/desktop/shared/packages/root build/root dependencies；生产包不得依赖仓库源码解析。

## 8. 同步规则

- Ticket 状态变化后同步执行清单；
- Ticket ID、路径、依赖或 frontmatter 不一致时，以 Ticket 文件为权威并修复本 Map；
- Goal Plan 存在时，Wave、Gate 和 owner 以 `<Path>{roots.state}/specdev/changes/2026-08-30-entity-dossier-plugin/goal-plan.md</Path>` 为编排权威；
- 依赖、合同覆盖或路径所有权变化后运行 `<Path>{roots.workflows}/specdev/common/tools/validate-specdev.mjs</Path>`；
- 内部工件不得使用相对 Markdown 链接；
- 用户已批准继续激活 Goal Plan；Map 和全部 Ticket 保持 `ready` / `ready: true`，状态变化后再次验证。
