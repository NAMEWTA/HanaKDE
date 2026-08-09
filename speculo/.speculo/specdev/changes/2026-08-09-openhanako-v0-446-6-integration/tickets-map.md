---
schema_version: 3
artifact: tickets-map
change: 2026-08-09-openhanako-v0-446-6-integration
status: in_progress
---

# Tickets Map: HanaKDE 跟随 openhanako v0.446.6 并收敛系统基础设施

- **Map：** `<Path>{roots.state}/specdev/changes/{change}/tickets-map.md</Path>`
- **Spec：** `<Path>{roots.state}/specdev/changes/{change}/spec.md</Path>`
- **Ticket 目录：** `<Path>{roots.state}/specdev/changes/{change}/ticket/</Path>`
- **Evidence 目录：** `<Path>{roots.state}/specdev/changes/{change}/evidence/</Path>`
- **下一阶段 Goal Plan：** `<Path>{roots.state}/specdev/changes/{change}/goal-plan.md</Path>`

## 1. 目标与拆分策略

本 Map 交付一个 umbrella change：把冻结 `v0.446.6` / `5f08a4f30203abb61dafac7dbb7ab92d11c23efa` 作为可审计 Git ancestor，完整接受正常上游迭代，并以 HanaKDE 当前架构把同用途 Resource、Workspace observation、History、Knowledge 与 Extraction primitive 收敛到唯一 owner。产品能力取并集，基础设施不双运行、不双写、不重复 baseline，也不为未发布基线设计迁移或 legacy 兼容。

拆分采用四种切片：

1. T-01 冻结真实 fixed point 与授权门；T-02 至 T-09 串行形成 release checkpoint，每一步可审计、可停止、可恢复。
2. T-10/T-11/T-12 先建立 Resource/Workspace 稳定接缝并完成 stop-then-start production cutover，它们是后续产品能力的 prefactor。
3. T-13 至 T-20 按用户可观察行为交付 main-only History、restore convergence、Workspace/Agent 两类入口、`@` lifecycle、Extraction 与 Office Knowledge ingestion；不按数据库/后端/前端做水平分层。
4. T-21 统一拥有 manifests/build/CI，T-22/T-23 分别形成 Windows/macOS 阻断 Evidence，T-24 发布架构/ledger，T-25 汇合 28 AC 与 15 项 DoD。

本 change 不采用 expand-contract：HanaKDE 未发布且用户要求一步到位；同用途 owner 的替换只允许 isolated proof 后 stop old/start new。已有外部 Resource/Knowledge/Workbench 合同作为回归保护，不等同于保留 fork 内部兼容壳。

## 2. 执行清单

| ID | Ticket | 可观察产出 | Blocked By | Depth | Risk | Ready | Owner | Contract IDs | Wave/Gate | Status |
|---|---|---|---|---|---|---|---|---|---|---|
| T-01 | `<Path>{roots.state}/specdev/changes/{change}/ticket/01-freeze-baseline-and-authorization-gates.md</Path>` | 实际 HEAD/target/merge-base/overlap 与 Git 授权边界冻结 | — | deep | high | yes | Worker-T-01 / Lead验收 | AC-001 | G0 | done |
| T-02 | `<Path>{roots.state}/specdev/changes/{change}/ticket/02-integrate-v0-421-24.md</Path>` | `v0.421.24` 可审计 checkpoint | T-01 | deep | high | yes | Worker-T-02 / Lead集成 | AC-001—AC-003 | W1.1/G1 | done |
| T-03 | `<Path>{roots.state}/specdev/changes/{change}/ticket/03-integrate-v0-433-1.md</Path>` | `v0.433.1` 可审计 checkpoint | T-02 | deep | high | yes | Worker-T-03 / Lead集成 | AC-001—AC-003 | W1.2/G1 | done |
| T-04 | `<Path>{roots.state}/specdev/changes/{change}/ticket/04-integrate-v0-441-3.md</Path>` | `v0.441.3` 可审计 checkpoint | T-03 | deep | high | yes | Worker-T-04 / Lead集成 | AC-001—AC-003 | W1.3/G1 | in_progress |
| T-05 | `<Path>{roots.state}/specdev/changes/{change}/ticket/05-integrate-v0-441-32.md</Path>` | `v0.441.32` checkpoint 与重复职责输入清单 | T-04 | deep | high | yes | Worker-T-05 / Lead集成 | AC-001—AC-003 | W1.4/G1 | ready |
| T-06 | `<Path>{roots.state}/specdev/changes/{change}/ticket/06-integrate-v0-442-0.md</Path>` | `v0.442.0` 高重叠 checkpoint 与 owner handoff | T-05 | deep | critical | yes | Worker-T-06 / Lead集成 | AC-001—AC-003 | W1.5/G1 | ready |
| T-07 | `<Path>{roots.state}/specdev/changes/{change}/ticket/07-integrate-v0-443-46.md</Path>` | `v0.443.46` checkpoint 与 History/Extraction 输入 | T-06 | deep | critical | yes | Worker-T-07 / Lead集成 | AC-001—AC-003 | W1.6/G1 | ready |
| T-08 | `<Path>{roots.state}/specdev/changes/{change}/ticket/08-integrate-v0-443-54-through-v0-444-1.md</Path>` | `v0.443.54`/`v0.444.1` 两个子 checkpoint | T-07 | deep | high | yes | Worker-T-08 / Lead集成 | AC-001—AC-003 | W1.7/G1 | ready |
| T-09 | `<Path>{roots.state}/specdev/changes/{change}/ticket/09-integrate-v0-446-6.md</Path>` | 冻结 target ancestry 与完整上游功能基线 | T-08 | deep | critical | yes | Worker-T-09 / Lead集成 | AC-001—AC-003 | W1.8/G1 | ready |
| T-10 | `<Path>{roots.state}/specdev/changes/{change}/ticket/10-converge-resource-kernel.md</Path>` | 唯一 Resource Kernel、Materialize/Transfer/Root/Event contracts | T-09 | deep | critical | yes | Worker-T-10 / Lead Gate | AC-011, AC-014, AC-020, AC-023, AC-026 | G2 | ready |
| T-11 | `<Path>{roots.state}/specdev/changes/{change}/ticket/11-establish-main-workspace-infrastructure.md</Path>` | 唯一 main lifecycle、watcher、baseline 与四态 health | T-10 | deep | critical | yes | Worker-T-11 / Lead集成 | AC-004, AC-005, AC-009, AC-012—AC-014, AC-025, AC-026 | W3 | ready |
| T-12 | `<Path>{roots.state}/specdev/changes/{change}/ticket/12-perform-single-owner-production-cutover.md</Path>` | stop-then-start production cutover，overlap 永远为 0 | T-10, T-11 | deep | critical | yes | Worker-T-12 / Lead集成 | AC-009—AC-013 | W4 | ready |
| T-13 | `<Path>{roots.state}/specdev/changes/{change}/ticket/13-deliver-main-only-file-history.md</Path>` | main-only capture/deleted/timeline/diff/retention/quota | T-10, T-11 | deep | critical | yes | Worker-T-13 / Lead集成 | AC-005—AC-007, AC-025, AC-026 | W4 | ready |
| T-14 | `<Path>{roots.state}/specdev/changes/{change}/ticket/14-converge-knowledge-events-and-repair.md</Path>` | Knowledge 只消费统一事件/shared baseline 并 scoped repair | T-10, T-11 | deep | critical | yes | Worker-T-14 / Lead集成 | AC-003, AC-011—AC-013, AC-017 | W4 | ready |
| T-15 | `<Path>{roots.state}/specdev/changes/{change}/ticket/15-deliver-secure-restore-convergence.md</Path>` | expected-version/TOCTOU 安全 restore 与六读面一致 | T-12, T-13, T-14 | deep | critical | yes | Worker-T-15 / Lead Gate | AC-015—AC-017, AC-026 | G5 | ready |
| T-16 | `<Path>{roots.state}/specdev/changes/{change}/ticket/16-deliver-workspace-history-ui.md</Path>` | Workbench History/deleted/diff/restore/health 用户流程 | T-13, T-15 | deep | high | yes | Worker-T-16 / Lead E2E | AC-006, AC-007, AC-013, AC-015—AC-017, AC-024 | W6 | ready |
| T-17 | `<Path>{roots.state}/specdev/changes/{change}/ticket/17-deliver-agent-file-change-projection.md</Path>` | 对话/操作过滤的 Agent 影响与 main 共享 History | T-15, T-16 | deep | high | yes | Worker-T-17 / Lead E2E | AC-008, AC-015—AC-017, AC-024 | W7 | ready |
| T-18 | `<Path>{roots.state}/specdev/changes/{change}/ticket/18-fuse-at-search-lifecycle.md</Path>` | `@` query/loading/cancel/stale-response lifecycle 正确 | T-09 | standard | medium | yes | Worker-T-18 / Lead E2E | AC-024 | W3 | ready |
| T-19 | `<Path>{roots.state}/specdev/changes/{change}/ticket/19-deliver-shared-document-extraction.md</Path>` | 共享多格式 Extraction、Materialize 与稳定失败 | T-10 | deep | critical | yes | Worker-T-19 / Lead集成 | AC-018—AC-020, AC-022, AC-023, AC-026 | W3 | ready |
| T-20 | `<Path>{roots.state}/specdev/changes/{change}/ticket/20-upgrade-office-to-knowledge-ingestion.md</Path>` | Office 经共享 Extraction 进入 IR/index/Search 并按版本重建 | T-14, T-15, T-19 | deep | critical | yes | Worker-T-20 / Lead E2E | AC-003, AC-017, AC-021, AC-022 | W6 | ready |
| T-21 | `<Path>{roots.state}/specdev/changes/{change}/ticket/21-converge-production-native-packaging.md</Path>` | clean install/build 与双平台 native/package inputs 就绪 | T-12, T-16, T-17, T-18, T-20 | deep | critical | yes | Worker-T-21 shared owner / Lead Gate | AC-002, AC-003, AC-018—AC-023, AC-027 | G8 | ready |
| T-22 | `<Path>{roots.state}/specdev/changes/{change}/ticket/22-windows-blocking-gate.md</Path>` | Windows native/security/restore/extraction/NSIS Gate 通过 | T-21 | deep | critical | yes | Worker-T-22 / Lead平台验收 | AC-009, AC-010, AC-014—AC-023, AC-027 | W9-WIN/G9 | ready |
| T-23 | `<Path>{roots.state}/specdev/changes/{change}/ticket/23-macos-blocking-gate.md</Path>` | macOS native/watch/restore/extraction/DMG Gate 通过 | T-21 | deep | critical | yes | Worker-T-23 / Lead平台验收 | AC-009, AC-010, AC-012—AC-023, AC-027 | W9-MAC/G9 | ready |
| T-24 | `<Path>{roots.state}/specdev/changes/{change}/ticket/24-architecture-and-upstream-sync-ledger.md</Path>` | 当前架构、恢复与 upstream sync ledger 进入项目 docs | T-21 | standard | medium | yes | Worker-T-24 / Lead审查 | AC-001, AC-028 | W9-DOCS | ready |
| T-25 | `<Path>{roots.state}/specdev/changes/{change}/ticket/25-final-umbrella-acceptance.md</Path>` | 28 AC、15 DoD、双平台与去冗余最终 verdict | T-22, T-23, T-24 | deep | critical | yes | Worker-T-25 / Lead final owner | AC-001—AC-028 | G10-FINAL | ready |

Ticket frontmatter 是状态、依赖、深度和路径访问契约的权威；本表的 Worker/Lead、Wave/Gate 是 `<Path>{roots.state}/specdev/changes/{change}/goal-plan.md</Path>` 的委派执行投影，不改变 Ticket 产品 owner 或路径合同，也不得独立修改出另一套真相。

## 3. 依赖 DAG

```text
T-01 [G0 fixed point / authorization]
  └─→ T-02 → T-03 → T-04 → T-05 → T-06 → T-07 → T-08 → T-09 [G1 target]
                                                                      ├─→ T-18
                                                                      └─→ T-10 [G2 Resource Kernel]
                                                                            ├─→ T-11
                                                                            │     ├─→ T-12 ─┐
                                                                            │     ├─→ T-13 ─┼─→ T-15 [G5 restore]
                                                                            │     └─→ T-14 ─┘       ├─→ T-16 → T-17 ─┐
                                                                            └─→ T-19 ────────────────└─→ T-20 ────────┤
                                                                                  T-18 ────────────────────────────────┤
                                                                                  T-12 ────────────────────────────────┤
                                                                                                                        ↓
                                                                                                                     T-21 [G8 package]
                                                                                                                        ├─→ T-22 [WIN]
                                                                                                                        ├─→ T-23 [MAC]
                                                                                                                        └─→ T-24 [DOCS]
                                                                                                                              └────┬────┘
                                                                                                                                   ↓
                                                                                                                              T-25 [FINAL]
```

真实边说明：

- T-02..T-09 的每条边都是 Git ancestry 与可恢复 checkpoint 的开始条件。
- T-10 是所有 Resource authority/event/materialize 消费者的 shared-contract prefactor；T-11 建立 physical observation/baseline 接缝。
- T-12、T-13、T-14 可在 T-11 后于互不相交路径并行；T-15 必须等待 production owner、History 与 Knowledge 三方汇合。
- T-19 可与 T-11/T-18 并行；T-20 必须等待 Extraction、Knowledge repair 和 restore event convergence。
- T-21 在最终产品切片后唯一修改 manifests/build/CI；T-22/T-23/T-24 随后并行，T-25 是最终收缩 Gate。

## 4. 合同覆盖矩阵

| Contract ID | 覆盖 Ticket | 验证接缝 | 状态 | 说明 |
|---|---|---|---|---|
| AC-001 | T-01—T-09, T-24, T-25 | Git fixed point、ancestry、sync ledger | covered | target 与 checkpoint 全链可审计 |
| AC-002 | T-02—T-09, T-21, T-25 | 上游 feature regressions、clean build | covered | 正常上游能力完整吸收 |
| AC-003 | T-02—T-09, T-14, T-20, T-21, T-25 | HanaKDE contract union | covered | 二开能力无回退 |
| AC-004 | T-11, T-25 | main lifecycle integration | covered | close-old/open-new，无 relocation |
| AC-005 | T-11, T-13, T-25 | mount/main scope tests | covered | mount 保持功能但无 Workspace History |
| AC-006 | T-13, T-16, T-25 | History store/service/UI | covered | capture/delete/rename/timeline/diff |
| AC-007 | T-13, T-16, T-25 | deterministic policy/UI | covered | 60s/5MiB/30d/500MiB/noise |
| AC-008 | T-17, T-25 | Agent projection + shared History | covered | 对话过滤且无第二事实源 |
| AC-009 | T-11, T-12, T-22, T-23, T-25 | watcher factory/descriptor | covered | N consumers, one physical watcher |
| AC-010 | T-12, T-22, T-23, T-25 | cutover state machine | covered | stop-before-start，overlap=0 |
| AC-011 | T-10, T-12, T-14, T-25 | ResourceEventBus contracts | covered | ordering/dedupe/isolation/since |
| AC-012 | T-11, T-12, T-14, T-23, T-25 | gap/reconcile + scan counter | covered | 一次 baseline，scoped repair |
| AC-013 | T-11, T-12, T-14, T-16, T-23, T-25 | health state/UI | covered | 四态与 retry |
| AC-014 | T-10, T-11, T-22, T-23, T-25 | Root Identity/malicious fixtures | covered | alias/symlink/junction/replacement fail closed |
| AC-015 | T-15—T-17, T-22, T-23, T-25 | restore domain/route/UI/native | covered | conditional ResourceIO write，可反悔 |
| AC-016 | T-15—T-17, T-22, T-23, T-25 | stale/TOCTOU security | covered | conflict/unsafe request不写盘 |
| AC-017 | T-14—T-17, T-20, T-22, T-23, T-25 | integrated convergence/E2E | covered | 六个读面一致 |
| AC-018 | T-19, T-21—T-23, T-25 | extraction fixtures/package/native | covered | 冻结格式与 File Tool |
| AC-019 | T-19, T-21—T-23, T-25 | failure matrix | covered | unsupported/too-large/scanned/parse |
| AC-020 | T-10, T-19, T-21—T-23, T-25 | ResourceIO/Materialize/extraction | covered | authorized remote/abstract resources 与 cleanup |
| AC-021 | T-20—T-23, T-25 | Office Knowledge integration/E2E | covered | versioned re-extract/re-index/Search |
| AC-022 | T-19—T-23, T-25 | filesystem/OCR/loop assertions | covered | 不落盘、不 OCR、不循环 |
| AC-023 | T-10, T-19, T-21—T-23, T-25 | copy/transfer/materialize | covered | 独立生命周期与 fixed budgets |
| AC-024 | T-16—T-18, T-25 | component + Playwright flows | covered | Workspace/Agent 分离、@ lifecycle、无 shadow truth |
| AC-025 | T-11, T-13, T-25 | new-store initialization | covered | 唯一新基线、FAILED/retry、无 migration |
| AC-026 | T-10, T-11, T-13, T-15, T-19, T-25 | route/event security | covered | no raw root/public workspaceId/path leak |
| AC-027 | T-21—T-23, T-25 | package/native Gates | covered | Windows/macOS blocking，Linux non-blocking |
| AC-028 | T-24, T-25 | structural scan + architecture/ledger review | covered | duplicates removed，current docs committed |

没有 `uncovered` 或 `deferred` contract。

## 5. 并行与路径所有权

- 最大并发来自 `<Path>{roots.state}/specdev/config.json</Path>`，当前为 3。
- 本次执行使用一个 persistent native Lead；所有代码 Ticket 使用独立 worktree，branch 为 `speculo/2026-08-09-openhanako-v0-446-6-integration/T-NN`，locator 为 `specdev-worktree/T-NN`。初始 planning checkpoint 固定为 `5f819b1233d6acdc0893363d4647bf1d53af8355`，每个并行 Wave 的全部 Ticket 必须共享 Lead 发布的同一个 immutable Gate SHA。
- 根 manifests、lockfile 和共享 CI 在 G1 后的唯一语义收敛 owner 是 T-21；T-02—T-09 只能随冻结上游 checkpoint 吸收原始 release 增量。其他 G1 后 Ticket 对这些路径只读。
- production assembly/cutover 的唯一 owner 是 T-12；Resource Kernel 是 T-10；Workspace infrastructure 是 T-11；History domain 是 T-13；Knowledge event/repair 是 T-14；Extraction core 是 T-19。
- 用户已授权 Lead 无需中间确认即可执行 Ticket local changes/commit、已验收候选到本地 integration line 的 merge，以及 integrated clean worktree/branch 的非强制清理；push、PR、deploy、release、archive、远程写入与真实用户数据操作仍未授权。

| Ticket A | Ticket B | Writable 交集 | 真实依赖 | 处理 |
|---|---|---|---|---|
| T-11 | T-18 | 无 | 否 | 可并行；Workspace runtime 与 input UI 分离 |
| T-11 | T-19 | 无 | 否 | 可并行；Workspace runtime 与 Extraction core 分离 |
| T-18 | T-19 | 无 | 否 | 可并行；input UI 与 Extraction core 分离 |
| T-12 | T-13 | 无 | 否 | 可并行；production assembly 与 History domain 分离 |
| T-12 | T-14 | 无 | 否 | 可并行；production assembly 与 Knowledge domain 分离 |
| T-13 | T-14 | 无 | 否 | 可并行；History 与 Knowledge stores/models 分离 |
| T-16 | T-20 | 无 | 否 | 可并行；History UI 与 Office/Knowledge ingestion 分离 |
| T-22 | T-23 | 无 | 否 | 可并行；Windows/macOS 专用 harness 分离 |
| T-22 | T-24 | 无 | 否 | 可并行；Windows harness 与 docs 分离 |
| T-23 | T-24 | 无 | 否 | 可并行；macOS harness 与 docs 分离 |

T-02 至 T-09 的 `<Path>**</Path>` 写范围有意严格串行；它们不能与任何后续 code Ticket 并行。T-15 跨 History/Knowledge 是显式 convergence owner，因此依赖 T-12/T-13/T-14 后才开始。任何执行时路径重命名或越界请求必须先修订 Ticket/Goal Plan，不以“解决 merge conflict”代替所有权。

## 6. Gate、Wave 与集成点

| Wave/Gate | Tickets | 进入条件 | 退出条件 |
|---|---|---|---|
| G0 Fixed Point | T-01 | 当前 change ready | 实际基线和所有 Git 副作用批准点冻结 |
| W1 Staged Upstream | T-02—T-09（严格串行） | 前一 checkpoint 绿色且当前 Git 动作获批 | 冻结 target ancestor、上游功能/HanaKDE contract union 绿色 |
| G2 Resource Contract | T-10 | T-09 完成 | Resource/Root/Event/Materialize/Transfer 唯一契约稳定 |
| W3 Shared Foundations | T-11, T-18, T-19 | T-10 完成且三者使用同一 Gate SHA | main infrastructure、@ lifecycle、Extraction 在隔离接缝绿色 |
| W4 Single-Owner Consumers | T-12, T-13, T-14 | T-11 完成 | production overlap=0；History/Knowledge 分离且共享事实 |
| G5 Restore Convergence | T-15 | T-12/T-13/T-14 完成 | secure restore 和六读面一致 |
| W6 Product/Office | T-16, T-20 | T-15、各自前置完成 | Workspace UI 与 Office Knowledge E2E 绿色 |
| W7 Agent Projection | T-17 | T-16 完成 | Agent/Workspace semantics 分离且共享 primitives |
| G8 Production Inputs | T-21 | T-12/T-16/T-17/T-18/T-20 完成 | clean build、native assets、package inputs 就绪 |
| W9 Blocking Platforms/Docs | T-22, T-23, T-24 | T-21 完成 | Windows/macOS blocking Evidence 与 current docs 完成 |
| G10 Final | T-25 | T-22/T-23/T-24 完成 | 28 AC、15 DoD、structure/package/Evidence 全部通过 |

需要正式 Goal Plan：Ticket 数量 25、Deep/critical 多、存在整仓 staged merge、shared manifests、单 owner cutover、双平台 Gate 和多个汇合点。下一 Work 必须是 `<Path>{roots.workflows}/specdev/P-goal-plan/P-goal-plan.md</Path>`，不能直接开始实现。

## 7. 横切契约与风险

- **Git 与 upstream：** T-01 Worker只读；G0 后 Lead 可按 Goal Plan 无需中间确认创建本地branch/worktree、提交候选、合并到本地integration line并非强制清理已集成worktree/branch。local tag、fetch、push、PR、deploy、release和archive仍未授权。target永远使用冻结SHA，final integration HEAD必须包含其ancestry。
- **Workspace identity：** `main` 唯一；工作目录切换为 close/open；mount 不是 Workspace；不新增 relocation 或 public/cross-feature `workspaceId`。
- **单一事实源：** ResourceIO 写入、ResourceEventBus fan-out、WorkspaceWatchCoordinator physical observation、shared baseline observation 各只有一个 production owner。
- **切换与恢复：** 只允许 isolated proof → stop old → prove release → start new；失败恢复同样先停新 owner。无 dual-run、dual-write、shadow watcher 或 dual baseline。
- **History 与 Knowledge：** 共享 observation/version/root/baseline facts，但 stores、retention、policy、models 和 recovery 独立；History 只覆盖 main。
- **Extraction：** system core，canonical derived Markdown；Office 保留真实差异 adapters；50 MiB；no OCR；no derived Workspace files。
- **安全：** ProviderRootIdentity 与 effect-time scope/version revalidation 覆盖 restore/transfer/materialize/extraction；unknown fail closed；external/LAN/renderer 不泄漏 root/token/content。
- **未发布基线：** 不设计 migration、旧 Profile、schema compatibility、marker、cleanup state 或 migration rollback。
- **平台：** Windows/macOS 均阻断且必须真实原生/package Evidence；Linux 只能附加，不进入 DAG 完成条件。

主要风险及控制：

| 风险 | 控制 Ticket/Gate |
|---|---|
| 错误 fixed point 或隔离 worktree 污染 merge | T-01 exact SHA + 每 checkpoint/worktree 前置复核；并发用户修改保留且不进入基线 |
| Git 冲突隐藏产品/安全回退 | T-02—T-09 contract union + semantic ledger |
| watcher/mutation/baseline 双 owner | T-10—T-12 + overlap state-machine/structure scan |
| History/Knowledge 数据分叉 | T-13—T-15 + final convergence E2E |
| restore 覆盖更新内容或越界 | T-15 + T-22/T-23 malicious native fixtures |
| parser 重复、临时文件泄漏或 indexing loop | T-19/T-20 + structural/filesystem assertions |
| 开发环境绿色但 production package 缺资产 | T-21 + Windows/macOS package Gates |
| docs 把计划误写为完成事实 | T-24 只消费实际 Evidence + T-25 final audit |

## 8. 同步规则

- Ticket 状态变化后同步本执行清单；frontmatter 是状态、依赖、局部路径和产品 owner 权威，本次 Worker/Lead 执行 owner 由 Goal Plan 投影。
- Ticket ID、路径、依赖或 frontmatter 不一致时，以具体 Ticket 文件为权威并修复本 Map。
- Goal Plan 存在后，Wave、Gate、执行 owner、worktree 与恢复顺序以 `<Path>{roots.state}/specdev/changes/{change}/goal-plan.md</Path>` 为编排权威；不得复制改写 Ticket 产品契约。
- 依赖、AC coverage、path ownership、shared owner 或 Gate 变化后运行 `<Path>{roots.workflows}/specdev/common/tools/validate-specdev.mjs</Path>` 的 tickets/goal-plan stage。
- implementation 发现代码事实与 Ticket 冲突时按 `<Path>{roots.workflows}/specdev/common/rules/deviation-control.md</Path>` 停止并修订 owning artifact，不静默扩大范围。
- 每个 done Ticket 必须有 `<Path>{roots.state}/specdev/changes/{change}/evidence/{ticket-id}.md</Path>`；无法运行关键验证、未批准偏差或 Evidence 不完整时不得标 done。
- 内部工件不使用相对 Markdown links；项目路径使用项目相对 Path 标签，SpecDev 工件使用完整根变量 Path 标签。
