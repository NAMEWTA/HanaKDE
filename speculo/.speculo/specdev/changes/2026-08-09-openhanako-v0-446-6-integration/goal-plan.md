---
schema_version: 3
artifact: goal-plan
change: 2026-08-09-openhanako-v0-446-6-integration
status: in_progress
modes: [coordination, high-assurance, reference-conformance, release-coordination]
ready_for_execution: true
---

# Goal Plan: openhanako v0.446.6 跟随整合与基础设施收敛

- **Goal Plan：** `<Path>{roots.state}/specdev/changes/{change}/goal-plan.md</Path>`
- **Spec：** `<Path>{roots.state}/specdev/changes/{change}/spec.md</Path>`
- **Tickets Map：** `<Path>{roots.state}/specdev/changes/{change}/tickets-map.md</Path>`
- **Ticket 目录：** `<Path>{roots.state}/specdev/changes/{change}/ticket/</Path>`
- **Evidence 目录：** `<Path>{roots.state}/specdev/changes/{change}/evidence/</Path>`

## 1. Outcome and Authority

### Outcome

以干净且已同步的 HanaKDE `hanakde@5f819b1233d6acdc0893363d4647bf1d53af8355` 为初始规划固定点，在本地隔离 integration line 上分阶段吸收冻结的 openhanako `v0.446.6@5f08a4f30203abb61dafac7dbb7ab92d11c23efa`。最终结果必须同时保留正常上游迭代和 HanaKDE 二开合同，并把 Resource、Workspace observation、File History、Knowledge 与 Document Extraction 的同用途底层职责收敛到唯一生产 owner。

### Success and False Completion

成功必须同时满足：冻结上游 SHA 是最终集成 HEAD 的 ancestor；28 项 AC 和 15 项 umbrella DoD 均有 final-SHA Evidence；Windows 与 macOS 原生和 production package Gate 均通过；重复 watcher、mutation owner、baseline walk、history store、root helper 和 parser 为零；所有 Ticket、Map、Goal Plan、Evidence、worktree 状态与源码 checkpoint 一致。

以下均是假完成：仅解决 Git 冲突、仅通过单平台或开发构建、保留临时双运行/双写/影子 watcher、把 Worker 自报或模拟结果当成 Lead 验收、跳过 Windows/macOS 阻断项、把 `unverified` 改写为通过，或在没有 Evidence 时把计划描述成已实现。

### Non-goals

- 不引入 relocation、公共或跨功能 `workspaceId`、挂载 Workspace History、OCR、legacy migration、旧 Profile 导入、旧 schema 兼容、migration rollback 或临时双运行。
- 不合并 File History 与 Knowledge 的数据库、模型、retention、policy 或恢复语义。
- 不把 derived Markdown 写入 Workspace，不把 materialize 变成 copy/transfer。
- 本计划不授权 push、PR、deploy、release、archive、远程写入、签名/notarize、生产配置、生产功能开关或真实用户数据操作。

### Authoritative Inputs

| 优先级 | 来源 | 负责内容 | 冲突处理 |
|---|---|---|---|
| 1 | 用户截至 2026-08-09 的明确决定 | 产品取舍、执行授权和完成交付方式 | 只更新真正 owning artifact；最新授权覆盖旧的逐动作确认措辞 |
| 2 | `<Path>{roots.state}/specdev/changes/{change}/ADR.md</Path>` | 当前 change 架构决定 | 架构偏差停止受影响 Wave 并返回 G Work |
| 3 | `<Path>{roots.state}/specdev/changes/{change}/spec.md</Path>` | 外部行为、范围、AC 与非目标 | 下游不得改写；Spec 偏差停止 |
| 4 | `<Path>{roots.state}/specdev/changes/{change}/ticket/{ticket-file}.md</Path>` | 单 Ticket 局部合同、依赖和路径边界 | Goal Plan 只编排；路径或局部合同变化走 ticket deviation |
| 5 | 本 Goal Plan | Wave、Gate、Lead/Worker、checkpoint、授权、集成和恢复 | 只在不改写上游产品合同的前提下调整执行投影 |
| 6 | 当前代码与 Git 固定点 | 可行性、实际路径、命令和结果 | 不一致时记录 Evidence 并按偏差等级处理 |

冲突优先级固定为：安全与数据完整性 > Spec/ADR 合同完整性 > 单 owner 与可恢复性 > 上游正常功能完整吸收 > 速度。最新用户授权允许 Lead 在本地自动创建/提交/合并/非强制清理，但不改变任何产品合同，也不扩大远程与生产权限。

## 2. Execution Graph

### DAG and Critical Path

```text
T-01 [G0]
  -> T-02 -> T-03 -> T-04 -> T-05 -> T-06 -> T-07 -> T-08 -> T-09
                                                                    -> T-10 [G2]
                                                                       |-> T-11 -+-> T-12 -+
                                                                       |          |-> T-13 -+-> T-15 [G5] -> T-16 -> T-17 -+
                                                                       |          +-> T-14 -+                 |              |
                                                                       |-> T-19 ------------------------------+-> T-20 ------+-> T-21 [G8]
                                                                       +-> T-18 --------------------------------------------+
                                                                                                                             |-> T-22
                                                                                                                             |-> T-23
                                                                                                                             +-> T-24
                                                                                                                                  +-> T-25 [G10]
```

关键路径按 Gate 固定为 `T-01 -> T-02 -> ... -> T-10 -> T-11 -> T-12/T-13/T-14 -> T-15 -> T-16 -> T-17 -> T-21 -> T-22/T-23/T-24 -> T-25`。T-19/T-20 和 T-18 不是可遗漏旁路；它们在 G8 前必须汇合。

### Waves and Ownership

| Wave/Gate | Tickets | Gate `base_sha` | 最大并发 | 执行 owner | Lead 集成点 |
|---|---|---|---|---|---|
| G0 Fixed Point | T-01 | `5f819b1233d6acdc0893363d4647bf1d53af8355` | 1 | native Worker | Lead 复核只读审计并从同 SHA 创建 integration line |
| W1 Staged Upstream | T-02—T-09 严格串行 | 首项为 G0 SHA，后续为前一 Ticket 的 integrated SHA | 1 | 每 Ticket 独立 native Worker | 每个 release checkpoint 验证、提交、合并后才发布下一 SHA |
| G2 Resource Contract | T-10 | T-09 integrated SHA | 1 | native Worker | 关闭 Resource/Root/Event/Materialize/Transfer Gate |
| W3 Shared Foundations | T-11, T-18, T-19 | T-10 integrated SHA | 3 | 三个独立 native Worker | 三个候选均验证后合并，发布唯一 W3 SHA |
| W4 Single-Owner Consumers | T-12, T-13, T-14 | W3 integrated SHA | 3 | 三个独立 native Worker | overlap=0 且 History/Knowledge 分离后发布 W4 SHA |
| G5 Restore Convergence | T-15 | W4 integrated SHA | 1 | native Worker | secure restore 与六读面收敛 Gate |
| W6 Product/Office | T-16, T-20 | T-15 integrated SHA | 2 | 两个独立 native Worker | Lead 执行适用 UI/Office E2E 后发布 W6 SHA |
| W7 Agent Projection | T-17 | W6 integrated SHA | 1 | native Worker | Agent/Workspace 入口分离且共享 primitive |
| G8 Production Inputs | T-21 | T-17 integrated SHA | 1 | native Worker；T-21 为 shared path owner | clean build/native/package input Gate |
| W9 Platforms/Docs | T-22, T-23, T-24 | T-21 integrated SHA | 3 | 三个独立 native Worker | Windows/macOS 原生阻断和 current docs 汇合 |
| G10 Final | T-25 | W9 integrated SHA | 1 | native Worker；Lead 为最终批准人 | Lead 独立验收并拥有 change completion 转换 |

每个并行 Wave 的全部 Worker 必须从表中同一个不可变完整 SHA 创建分支；不得从兄弟分支、浮动 integration HEAD 或工作目录当前内容取基线。Lead 按 Ticket ID 顺序合并同一 Wave 的已验收候选；后合并候选必须在 Lead integration line 上复跑受影响回归。

### Ticket Quick Reference

| ID | 行为产出 | Dependencies | Wave/Gate | Execution owner | Evidence |
|---|---|---|---|---|---|
| T-01 | 实际 fixed point 与权限审计 | — | G0 | Worker-T-01；Lead 验收 | `<Path>{roots.state}/specdev/changes/{change}/evidence/T-01.md</Path>` |
| T-02 | `v0.421.24` checkpoint | T-01 | W1.1 | Worker-T-02；Lead 集成 | `<Path>{roots.state}/specdev/changes/{change}/evidence/T-02.md</Path>` |
| T-03 | `v0.433.1` checkpoint | T-02 | W1.2 | Worker-T-03；Lead 集成 | `<Path>{roots.state}/specdev/changes/{change}/evidence/T-03.md</Path>` |
| T-04 | `v0.441.3` checkpoint | T-03 | W1.3 | Worker-T-04；Lead 集成 | `<Path>{roots.state}/specdev/changes/{change}/evidence/T-04.md</Path>` |
| T-05 | `v0.441.32` checkpoint | T-04 | W1.4 | Worker-T-05；Lead 集成 | `<Path>{roots.state}/specdev/changes/{change}/evidence/T-05.md</Path>` |
| T-06 | `v0.442.0` high-overlap checkpoint | T-05 | W1.5 | Worker-T-06；Lead 集成 | `<Path>{roots.state}/specdev/changes/{change}/evidence/T-06.md</Path>` |
| T-07 | `v0.443.46` core-feature checkpoint | T-06 | W1.6 | Worker-T-07；Lead 集成 | `<Path>{roots.state}/specdev/changes/{change}/evidence/T-07.md</Path>` |
| T-08 | `v0.443.54`/`v0.444.1` checkpoints | T-07 | W1.7 | Worker-T-08；Lead 集成 | `<Path>{roots.state}/specdev/changes/{change}/evidence/T-08.md</Path>` |
| T-09 | frozen `v0.446.6` ancestry | T-08 | W1.8/G1 | Worker-T-09；Lead 集成 | `<Path>{roots.state}/specdev/changes/{change}/evidence/T-09.md</Path>` |
| T-10 | Resource Kernel convergence | T-09 | G2 | Worker-T-10；Lead Gate owner | `<Path>{roots.state}/specdev/changes/{change}/evidence/T-10.md</Path>` |
| T-11 | main Workspace infrastructure | T-10 | W3 | Worker-T-11 | `<Path>{roots.state}/specdev/changes/{change}/evidence/T-11.md</Path>` |
| T-12 | single-owner production cutover | T-10,T-11 | W4 | Worker-T-12 | `<Path>{roots.state}/specdev/changes/{change}/evidence/T-12.md</Path>` |
| T-13 | main-only File History | T-10,T-11 | W4 | Worker-T-13 | `<Path>{roots.state}/specdev/changes/{change}/evidence/T-13.md</Path>` |
| T-14 | Knowledge events/scoped repair | T-10,T-11 | W4 | Worker-T-14 | `<Path>{roots.state}/specdev/changes/{change}/evidence/T-14.md</Path>` |
| T-15 | secure restore convergence | T-12,T-13,T-14 | G5 | Worker-T-15；Lead Gate owner | `<Path>{roots.state}/specdev/changes/{change}/evidence/T-15.md</Path>` |
| T-16 | Workspace History UI | T-13,T-15 | W6 | Worker-T-16 | `<Path>{roots.state}/specdev/changes/{change}/evidence/T-16.md</Path>` |
| T-17 | Agent file-change projection | T-15,T-16 | W7 | Worker-T-17 | `<Path>{roots.state}/specdev/changes/{change}/evidence/T-17.md</Path>` |
| T-18 | `@` search lifecycle | T-09 | W3 | Worker-T-18 | `<Path>{roots.state}/specdev/changes/{change}/evidence/T-18.md</Path>` |
| T-19 | shared Document Extraction | T-10 | W3 | Worker-T-19 | `<Path>{roots.state}/specdev/changes/{change}/evidence/T-19.md</Path>` |
| T-20 | Office Knowledge ingestion | T-14,T-15,T-19 | W6 | Worker-T-20 | `<Path>{roots.state}/specdev/changes/{change}/evidence/T-20.md</Path>` |
| T-21 | production/native packaging | T-12,T-16,T-17,T-18,T-20 | G8 | Worker-T-21；shared owner | `<Path>{roots.state}/specdev/changes/{change}/evidence/T-21.md</Path>` |
| T-22 | Windows blocking Gate | T-21 | W9-WIN | Worker-T-22 | `<Path>{roots.state}/specdev/changes/{change}/evidence/T-22.md</Path>` |
| T-23 | macOS blocking Gate | T-21 | W9-MAC | Worker-T-23 | `<Path>{roots.state}/specdev/changes/{change}/evidence/T-23.md</Path>` |
| T-24 | architecture and sync ledger | T-21 | W9-DOCS | Worker-T-24 | `<Path>{roots.state}/specdev/changes/{change}/evidence/T-24.md</Path>` |
| T-25 | final umbrella acceptance | T-22,T-23,T-24 | G10 | Worker-T-25；Lead final owner | `<Path>{roots.state}/specdev/changes/{change}/evidence/T-25.md</Path>` |

## 3. Gates and Completion Evidence

### Overall Definition of Done

1. T-01 至 T-25 均为 `done`；无未批准 cancelled/deferred、偏差或 blocker。
2. `5f08a4f30203abb61dafac7dbb7ab92d11c23efa` 是最终 integration HEAD 的 ancestor，staged checkpoint 与五类冲突裁决可追踪。
3. AC-001..AC-028 和 15 项 umbrella DoD 均映射到 final-SHA Evidence、实际命令和结果。
4. `npm ci`、test、typecheck、lint、client/server build、适用组件/E2E 与 production package 验证通过；既有失败已分类且没有掩盖本 change 回归。
5. Windows 与 macOS 的真实原生、安全、watcher、restore、Extraction、Office Knowledge 与 package smoke 均无 blocking skip；Linux 仅附加。
6. 单一 ResourceIO/EventBus/watcher/baseline owner、main-only History、独立 History/Knowledge store、共享 Extraction 和 stop-then-start 由行为测试与结构扫描同时证明。
7. 所有静默失败风险至少完成一次受控反向验证并恢复绿色；没有删除测试、放宽断言、吞错或静态推断伪造 pass。
8. Lead 合并所有候选、清理已集成 Ticket worktree/branch（仅非强制）、同步 Evidence/Map/Goal Plan/change 状态，并按 change completion 规则完成本地 change。

### Gates

| Gate | 开启条件 | 关闭证据 | 阻塞范围 | Owner/批准人 | 失败恢复 |
|---|---|---|---|---|---|
| G0 Fixed Point | `5f819b1233d6acdc0893363d4647bf1d53af8355` 已在冻结时验证为干净且与 origin/hanakde 同步；此后用户工作树变化不进入实施基线 | T-01 核对 exact SHA/object、target/merge-base/overlap、并发用户修改保护、授权矩阵和 Lead 复核 | 全部实施 | Lead | 不触碰当前用户工作树；修复固定点事实后从 exact SHA 重跑 T-01 |
| G1 Upstream Target | T-02..T-09 每个 checkpoint 已逐个集成 | target ancestry、上游回归、HanaKDE contract union、semantic ledger | T-10 及以后 | Lead | 保留最后绿色 checkpoint，修正 owning staged Ticket |
| G2 Resource Contract | G1 closed | Root Identity、EventBus、Materialize/Transfer、安全和重复 owner scan | W3/W4 消费者 | Lead | 回到 T-10，同一基线最多三轮修正 |
| G5 Restore Convergence | W4 三候选均已集成并验证 overlap=0 | expected-version/TOCTOU、可反悔 restore、六读面一致和 reverse test | W6/W7/G8 | Lead | 停止受影响消费者，回 T-12/T-13/T-14/T-15 owner |
| G8 Production Inputs | T-12/T-16/T-17/T-18/T-20 已集成 | clean install/build、manifest-lock一致、native/runtime closure、missing-asset reverse test | W9 | Lead | 整体回退 T-21 package Wave，不混用 manifest/lock |
| G9 Windows | G8 closed | 真实 Windows native matrix、`dist:win`、NSIS install/start/E2E，无 skip | G10 | Lead；平台 Evidence 必须真实 | 回 owning product Ticket 修复并整套重跑 |
| G9 macOS | G8 closed | 真实 macOS native matrix、`dist`、app/DMG start/E2E，无 skip | G10 | Lead；平台 Evidence 必须真实 | 回 owning product Ticket修复并整套重跑 |
| G10 Final | T-22/T-23/T-24 integrated | ancestry、28 AC、15 DoD、quality、structure、platform/package 和 Evidence freshness | change completion | Lead | fail verdict；回 owning Ticket，重开受影响 Gate |

### Contract and Reference Coverage

| 合同或参考要求 | 覆盖 Ticket | 验证接缝 | Evidence | 状态 |
|---|---|---|---|---|
| AC-001—AC-003 upstream ancestry/feature union/HanaKDE protection | T-01—T-10,T-14,T-20,T-21,T-24,T-25 | Git fixed points、contract union、clean build、ledger | 对应 T-xx Evidence | covered |
| AC-004—AC-014 main/History/observation/event/health/root | T-10—T-14,T-16,T-22,T-23,T-25 | lifecycle、store、single-owner counters、malicious fixtures | 对应 T-xx Evidence | covered |
| AC-015—AC-017 secure restore and convergence | T-15—T-17,T-20,T-22,T-23,T-25 | conditional write、TOCTOU、六读面/E2E | 对应 T-xx Evidence | covered |
| AC-018—AC-023 Extraction/Office/Materialize/Transfer | T-10,T-19—T-23,T-25 | fixtures、failure matrix、cleanup、native package | 对应 T-xx Evidence | covered |
| AC-024—AC-028 UI lifecycle/new baseline/security/platform/docs | T-10—T-25 的 Map 映射 | component/E2E、no-migration scan、platform Gates、ledger | 对应 T-xx Evidence | covered |

## 4. Execution and Integration Protocol

### Ticket Execution Order

Lead 按 `G0 -> W1 -> G2 -> W3 -> W4 -> G5 -> W6 -> W7 -> G8 -> W9 -> G10` 推进。每个 Worker 先执行 preflight receipt，再按 `<Path>{roots.workflows}/specdev/I-implement/I-implement.md</Path>` 做设计检查、TDD、双轴自审和 Evidence。Worker 只把候选推进到 `review`；不得自行合并 integration line 或标记 Gate/change 完成。

### Checkpoint and Worktree Protocol

- 初始 planning checkpoint：`5f819b1233d6acdc0893363d4647bf1d53af8355`；冻结 upstream target：`5f08a4f30203abb61dafac7dbb7ab92d11c23efa`。
- 该 checkpoint 已跟踪实施所需代码、Spec 和 Tickets，但本 Goal Plan 在 checkpoint 之后生成。persistent Lead 从 authority workspace out-of-band 提供本 Goal Plan/Dispatch Packet，并在 T-01 preflight 记录读取路径、frontmatter identity 和外部计算的内容摘要；摘要不写回本文件，避免自引用 hash。本地 Git code source 的 package hash 仍为 `n/a-local-git`。
- G0 通过后，Lead 从初始 checkpoint 创建本地 branch `speculo/2026-08-09-openhanako-v0-446-6-integration/integration`，integration workspace locator 为 `specdev-worktree/integration`。不得在用户当前 `hanakde` 工作区实施或合并。
- 每 Ticket branch 为 `speculo/2026-08-09-openhanako-v0-446-6-integration/T-NN`，workspace locator 为 `specdev-worktree/T-NN`。
- 每个 Dispatch 的 `base_sha` 是表中 Gate 发布的完整不可变 SHA；并行 Wave 全部使用同一 SHA。Lead 在 `<Path>{roots.state}/specdev/changes/{change}/.status.json</Path>#worktrees` 和 Gate Evidence 写入 exact SHA 后才能创建 worktree。
- Candidate commit 通过 Lead 标准轴、规范轴、定向回归和适用 E2E 后，Lead 可直接本地 merge 到 integration line，无需再次询问用户。合并后 Lead 更新状态/Evidence，再按 dev-worktree Skill 非强制移除已集成 worktree 和分支。
- 任何路径/分支/基线记录不一致、未提交 Worker 内容或清理失败都停止该 worktree；不使用 force、reset、stash、checkout 覆盖或删除未知内容。

### Authorization Matrix

| 动作 | 状态 | 目标与条件 |
|---|---|---|
| Local changes | allowed | 仅 Dispatch `writable_paths`、对应 Evidence 和必要状态投影；隔离 worktree 内执行 |
| Commit | allowed | Worker candidate commit、Lead integration/Evidence/status commit；可自动执行，无需中间确认 |
| Local merge | allowed | 仅 Lead 将已独立验收候选合并到本地 integration line；可自动执行 |
| Worktree/branch cleanup | allowed | 仅已 integrated、clean 且记录匹配的 Ticket；非强制删除，可自动执行 |
| Push / PR | not-authorized | 之前完成的 checkpoint push 不构成后续授权；不得创建或更新远程引用 |
| Deploy / Release / Sign / Notarize | not-authorized | package build/smoke 允许；对外发布、签名和上传不允许 |
| Migration / legacy import / archive | not-authorized | 本产品未发布且 Spec 明确不引入 migration；不得归档 change |
| Production configuration / feature / real user data | not-authorized | 仅临时 fixtures/隔离 harness；不得触碰真实用户数据或生产系统 |

### Evidence Return and Integration

Lead 接收每个候选时必须读取 Dispatch、Ticket、Evidence、实际 diff 和 commit；检查 exact base、依赖 Evidence、路径范围、敏感信息和 shared owner；在独立 integration baseline 复跑定向验证与受影响回归。UI 交互或 production package 行为受影响时由 Lead 运行最小真实 E2E；Worker 只返回场景、预期和候选日志。Lead 验收通过后合并、同步 Ticket/Map/Goal Plan/Evidence/status并判断 Gate；失败则沿用同一 Worker最多修正三轮。

## 5. Constraints, Risk and Recovery

### Non-negotiable Constraints

- `main` 是唯一 Workspace；切换工作目录为 close-old/open-new；额外目录仅为 mount；File History 只覆盖 `main`。
- ResourceIO 是内部 mutation/restore 唯一写入源，ResourceEventBus 是 fan-out/catch-up 唯一事实源，WorkspaceWatchCoordinator 是 physical observation 唯一 owner，共享 baseline observation 每 repair cycle 只完整 walk 一次。
- 同用途 owner 的生产切换和失败恢复都必须 `isolated proof -> stop old -> prove release -> start new`；无 dual-run、dual-write、shadow watcher、dual baseline 或兼容开关。
- Workspace History 与 Agent 文件变化是独立产品入口，但共享版本/diff/restore/事件 primitive；Agent 不拥有第二 store、watcher、baseline 或写入 route。
- History 和 Knowledge 只共享 observation/version/root/baseline facts；DB、policy、retention、model 与 recovery 独立。
- Document Extraction 属于 system core；50 MiB 前置限制，稳定四类失败，无 OCR、无 derived Workspace Markdown；Office 只保留真实差异 adapter。
- ProviderRootIdentity 与 effect-time version/scope revalidation 覆盖 restore、transfer、materialize 和 extraction；`unknown`/越界/root replacement fail closed，外部不泄漏 raw root/token/content。
- 健康状态只使用 `HEALTHY | DEGRADED | RECONCILING | FAILED`。
- 新基线不包含 migration、legacy compatibility、旧 Profile/import、schema marker、cleanup state 或 migration rollback。
- Windows 与 macOS 均为真实阻断 Gate；Linux 不参与完成判定。
- T-21 独占 `<Path>package.json</Path>`、`<Path>package-lock.json</Path>`、`<Path>.github/workflows/build.yml</Path>` 和 `<Path>.github/workflows/ci.yml</Path>`；Lead 只集成，不替代 shared owner 修改内容。

### Verification Integrity

反向验证只在隔离 fixture 上进行：删除或错配 native asset 必须让 package Gate 变红；注入 watcher gap/重复 subscription 必须触发 reconciliation/owner count 失败；stale expected version/root replacement 必须拒绝 restore 且磁盘不变；生成 Workspace Markdown/OCR/duplicate parser/legacy branch 必须让结构扫描失败。每次反向验证后恢复原 fixture 与绿色基线。禁止修改判卷测试、跳过平台场景、降低断言或把环境失败无条件归类为通过。

### Migration or Release Sequence

本 change 没有数据迁移、兼容窗口、部署或发布序列。代码 owner 替换是一步到位的 stop-then-start；production package 只构建、安装到隔离环境并 smoke，不签名、不 notarize、不上传、不发布。

### Risks, Monitoring and Recovery

| 风险 | 触发信号 | 预防/检测 | 恢复 owner 与动作 |
|---|---|---|---|
| 错误基线或隔离 worktree 污染 | worktree base/branch/registry 与 Gate SHA 不匹配，或候选含未授权路径 | T-01 固定 exact SHA；每 Ticket preflight 与 path audit | Lead 停止受影响 Wave，保留用户当前工作树，从最后可信 Gate 重建隔离 worktree |
| staged merge 隐藏回退 | ancestry/contract/ledger 不一致 | 每 release checkpoint 独立验证 | owning W1 Worker 修正，Lead 不发布下一 SHA |
| 重复生产 owner | watcher/mutation/baseline count > 1 | state-machine + structure scan | T-12 停新 owner、证明释放，再前向修复 |
| History/Knowledge 分叉 | event cursor/generation/read model 不一致 | scoped repair counters + restore E2E | T-13/T-14/T-15 owner 修正并重开 G5 |
| restore 越权或覆盖新版本 | stale/root/scope fixture 未拒绝 | effect-time proof + malicious tests | 阻断 W6 以后，回 T-15；不可 waive |
| parser/staging/index loop | duplicate parser/temp/derived file/loop count | filesystem and structural assertions | T-19/T-20 停 converter/queue、清理 staging 后修正 |
| production package 缺 native 资源 | clean/package smoke失败 | T-21 closure + missing-asset reverse test | 整体回退 package Wave，重建 lock/closure |
| 平台 Evidence 缺失 | Windows/macOS skip或非真实 runner | G9 independent blocking Gates | owning product Ticket 修正后平台整套重跑 |

### Deviation Control

遵循 `<Path>{roots.workflows}/specdev/common/rules/deviation-control.md</Path>`。local deviation 可在 Evidence 内收敛；ticket deviation 暂停当前 Ticket 和相交候选，由 Lead 修订 Ticket/Plan 后重发同 Gate baseline；spec/architecture/security/release deviation 暂停全部受影响 Wave，并且只有确实无法在已批准合同内收敛时才升级用户。普通实现选择、修正轮次、候选 merge、状态同步和非强制清理由 Lead 自主处理，不向用户请求例行确认。

## 6. Progress and Decisions

### Current Status

```text
WAVE_STATUS wave=W1.2 ready=T-03 active=none done=T-01,T-02 blocked=none
GATE_STATUS gate=G0 state=closed evidence=<Path>{roots.state}/specdev/changes/{change}/evidence/T-01.md</Path> checkpoint=fabe31dd8f36313f05ec635a4ce30d890bb91bd3 risks=50-semantic-overlap-paths-for-W1
GATE_STATUS gate=G1 state=open evidence=<Path>{roots.state}/specdev/changes/{change}/evidence/T-02.md</Path> checkpoint=7fe6d623660f7f8c603dcd9ce897a66b45967a3c risks=seven-staged-checkpoints-remain
```

规划阶段已验证：Spec Ready；25 个 Ticket 全部 Ready；DAG 无环；AC-001..AC-028 全覆盖；最大并发 3；initial planning HEAD 与 `origin/hanakde` 在冻结时均为 `5f819b1233d6acdc0893363d4647bf1d53af8355` 且工作树当时干净；冻结 target 对象为 `5f08a4f30203abb61dafac7dbb7ab92d11c23efa`。此后出现的其他 change/用户修改属于并发工作，只保留、不读取为实施输入；实施尚未启动，所有 Ticket Evidence 仍待创建。

### Pending Decisions and Blockers

无未决产品决定或启动 blocker。未来只有超出本计划授权边界、或无法在三轮修正和 owning artifact 内收敛的 Spec/architecture/security/release 偏差才需要用户裁决。

### Resume Protocol

恢复时依次读取本 Goal Plan、`<Path>{roots.state}/specdev/changes/{change}/.status.json</Path>#worktrees`、当前 Wave 的 Gate Evidence、当前 Ticket 与最新 Ticket Evidence；核对 integration branch、exact base SHA、branch、workspace locator 和 Git worktree registry。匹配则从最后已验证 checkpoint 继续；不匹配则只暂停该 Ticket，保留现场并由 Lead恢复，不重新询问已锁定事项。

### Reporting Format

```text
WAVE_STATUS wave=<id> ready=<ids> active=<ids> done=<ids> blocked=<ids>
GATE_STATUS gate=<id> state=open|closed evidence=<paths> checkpoint=<sha> risks=<summary>
DELIVERY ticket=<id> state=review|integrated|blocked workspace=<ref> checkpoint=<sha> evidence=<path>
BLOCKER id=<id> owner=<owner> needed=<decision-or-input> impact=<scope>
DEVIATION id=<id> level=local|ticket|spec|architecture|release paused=<scope> recovery=<condition>
```

## Assumptions

- integration line 与 Ticket worktree 使用 Git provider；若平台原生 provider 给出等价可迁移 locator，Lead 可按 dev-worktree Skill替换 provider，但 branch、base SHA、权限和持久化 owner 不变。
- 实际路径因 staged merge 发生无语义的目录移动时，Lead 可在不改变 writable scope 含义的前提下更新导航路径；任何扩大权限必须走 deviation。
- 这些假设低影响、可逆且由 preflight/worktree registry/路径审计验证；不存在其他未决假设。

## Delegated Execution Addendum

### Delivery Contract

| 字段 | 值 |
|---|---|
| Execution model enum / selected | `native-subagent / external-web-subagent`；selected=`native-subagent` |
| execution_model | `native-subagent` |
| Lead / Provider | 一个贯穿全部 Wave 的 persistent native Lead / native subagents |
| Repository / Branch | local HanaKDE repository / `speculo/2026-08-09-openhanako-v0-446-6-integration/integration` |
| Initial checkpoint / target | `5f819b1233d6acdc0893363d4647bf1d53af8355` / `5f08a4f30203abb61dafac7dbb7ab92d11c23efa` |
| Checkpoint policy | 每 Wave/Gate 使用 Lead 发布的 immutable full SHA；并行 Ticket共享同一 SHA |
| Source delivery | code/Spec/Tickets：已跟踪 local repository + isolated Git worktrees，Git SHA为内容身份；Goal Plan/Dispatch：authority workspace out-of-band交付并在T-01记录外部内容摘要 |
| Lead locator | `specdev-worktree/integration` |
| Max concurrency / max_correction_rounds | `3` / `3` |
| Review | standards axis + spec axis + Lead independent verification + conditional Lead E2E |
| Local authorization | local changes、candidate/integration commits、Lead local merge、non-force integrated worktree/branch cleanup 均 authorized，无需中间用户确认 |
| Unauthorized | push、PR、deploy、release、archive、remote writes、sign/notarize、migration、production config/feature、real user data |
| Completion owner | persistent Lead 在 G10 独立验收后按 change completion 规则完成 change；不自动 archive |

Lead 在整个执行链中唯一拥有 integration line、Gate checkpoint、worktree lifecycle、shared owner enforcement、候选验收、状态同步和 change completion。Worker 只拥有对应 Ticket 的 `writable_paths` 与候选实现，不得扩大权限、直接集成、关闭 Gate 或修改兄弟 worktree。

### Per-Ticket Dispatch Packets

#### Dispatch: T-01

- **Goal / observable result：** 只读冻结实际 HEAD/origin、target、merge-base、patch equivalence、overlap、工作树和动作授权；审计前后仓库状态一致。
- **Priority on conflict：** repository integrity > exact checkpoint > completeness > speed。
- **Implement / Ticket：** `<Path>{roots.workflows}/specdev/I-implement/I-implement.md</Path>`；`<Path>{roots.state}/specdev/changes/{change}/ticket/01-freeze-baseline-and-authorization-gates.md</Path>`。
- **Authority / dependencies：** AC-001、ADR-001；无依赖 Evidence；Worker-T-01 本身只读，G0 后 Lead 仍完整保有 Delivery Contract 已授权的本地 commit/merge/non-force cleanup 权限。
- **Wave / Gate / hard constraints：** G0；项目代码、index、refs、remotes 和用户内容不得改变；target 必须精确为冻结 SHA。
- **Writable / read-only / shared owner：** 项目 writable=`none`；read-only=`<Path>**</Path>`；shared=`none`；仅 Evidence/状态可由工作流写入。
- **Baseline / branch / workspace or session locator / package hash：** base_sha=`5f819b1233d6acdc0893363d4647bf1d53af8355`；branch=`hanakde` read-only；workspace_ref=`project-root-readonly`；package hash=`n/a-local-git`。
- **Preflight receipt：** 在 `<Path>{roots.state}/specdev/changes/{change}/evidence/T-01.md</Path>` 用不超过 10 行记录目标、命令顺序、最大风险、base/origin/target差异，以及out-of-band Goal Plan的路径/frontmatter identity/外部内容摘要。
- **Verification / baseline / reverse check：** 运行 Ticket fixed-point 命令，比较审计前后 HEAD/status/refs；故意检查错误 target/未知 dirty item 必须产生 blocker 而非写入。
- **Authorization / deviation / correction limit：** Worker-T-01只读；Lead在G0通过后可按Delivery Contract自动创建integration line、执行后续local commit/merge/non-force cleanup；不得push/PR/deploy/release/archive；3轮，事实不符按release/checkpoint deviation暂停。
- **Return：** `review`/`blocked`、Evidence、`project-root-readonly`、最终 checkpoint、commit=`none`、未验证项、待 Lead fixed-point 复核。

#### Dispatch: T-02

- **Goal / observable result：** 吸收至 `v0.421.24`，形成首个可审计 merge checkpoint 与五类语义裁决，保持上游和 HanaKDE 合同绿色。
- **Priority on conflict：** safety/data > Spec/ADR > contract union > upstream normal change > speed。
- **Implement / Ticket：** `<Path>{roots.workflows}/specdev/I-implement/I-implement.md</Path>`；`<Path>{roots.state}/specdev/changes/{change}/ticket/02-integrate-v0-421-24.md</Path>`。
- **Authority / dependencies：** AC-001—AC-003、ADR-001、T-01 Evidence；仅处理该 release 增量与最小适配。
- **Wave / Gate / hard constraints：** W1.1/G1；严格串行，无后续架构重构、兼容壳、双 owner 或未审计 generated output。
- **Writable / read-only / shared owner：** writable=`<Path>**</Path>` 仅本 checkpoint；read-only=`none`；shared=`none`，因 W1 串行。
- **Baseline / branch / workspace or session locator / package hash：** base_sha=`G0_INTEGRATION_SHA`（Lead 在 T-01 Evidence 记录 exact SHA）；branch=`speculo/2026-08-09-openhanako-v0-446-6-integration/T-02`；workspace_ref=`specdev-worktree/T-02`；package hash=`n/a-local-git`。
- **Preflight receipt：** `<Path>{roots.state}/specdev/changes/{change}/evidence/T-02.md</Path>` 不超过 10 行，核对 base、target、增量、冲突分类和最大回退风险。
- **Verification / baseline / reverse check：** ancestry、checkpoint upstream regressions、HanaKDE contract union、typecheck/test/build；错误 conflict category 或 contract regression 必须使候选失败。
- **Authorization / deviation / correction limit：** Worker 可 local changes/commit；Lead 可独立验证、local merge、非强制清理，无用户提示；push/PR/deploy/release/archive 禁止；3 轮。
- **Return：** 状态、Evidence、workspace_ref、candidate SHA/commit、裁决清单、未验证项、待 Lead 回归/E2E。

#### Dispatch: T-03

- **Goal / observable result：** 从已集成 T-02 checkpoint 吸收至 `v0.433.1`，保留 release 行为并形成可恢复 checkpoint。
- **Priority on conflict：** safety/data > Spec/ADR > contract union > upstream normal change > speed。
- **Implement / Ticket：** `<Path>{roots.workflows}/specdev/I-implement/I-implement.md</Path>`；`<Path>{roots.state}/specdev/changes/{change}/ticket/03-integrate-v0-433-1.md</Path>`。
- **Authority / dependencies：** AC-001—AC-003、ADR-001、T-02 Evidence/semantic ledger。
- **Wave / Gate / hard constraints：** W1.2/G1；不得跳过 T-02、引入后续 checkpoint、双 owner、migration 或兼容壳。
- **Writable / read-only / shared owner：** writable=`<Path>**</Path>` 仅 release增量/最小适配；read-only=`none`；shared=`none`，串行。
- **Baseline / branch / workspace or session locator / package hash：** base_sha=`T-02_INTEGRATED_SHA`；branch=`speculo/2026-08-09-openhanako-v0-446-6-integration/T-03`；workspace_ref=`specdev-worktree/T-03`；package hash=`n/a-local-git`。
- **Preflight receipt：** `<Path>{roots.state}/specdev/changes/{change}/evidence/T-03.md</Path>` 不超过 10 行，记录 exact base、release target、依赖 Evidence 和最大冲突风险。
- **Verification / baseline / reverse check：** ancestry、上游定向回归、HanaKDE Resource/Knowledge/Workbench 回归和基础质量；故意遗漏 release commit 的 ancestry检查必须失败。
- **Authorization / deviation / correction limit：** local changes/commit 与 Lead local merge/non-force cleanup 自动授权；push/PR/deploy/release/archive 禁止；3 轮，语义冲突回 owning artifact。
- **Return：** 状态、Evidence、workspace、candidate SHA/commit、裁决/残余项、待 Lead 回归/E2E。

#### Dispatch: T-04

- **Goal / observable result：** 从 T-03 checkpoint 吸收至 `v0.441.3`，完整接受正常迭代并保护 HanaKDE 合同。
- **Priority on conflict：** safety/data > Spec/ADR > contract union > upstream normal change > speed。
- **Implement / Ticket：** `<Path>{roots.workflows}/specdev/I-implement/I-implement.md</Path>`；`<Path>{roots.state}/specdev/changes/{change}/ticket/04-integrate-v0-441-3.md</Path>`。
- **Authority / dependencies：** AC-001—AC-003、ADR-001、T-03 Evidence。
- **Wave / Gate / hard constraints：** W1.3/G1；严格 release 边界，无提前基础设施 cutover、双写或旧接口壳。
- **Writable / read-only / shared owner：** writable=`<Path>**</Path>` 仅 checkpoint/最小适配；read-only=`none`；shared=`none`，串行。
- **Baseline / branch / workspace or session locator / package hash：** base_sha=`T-03_INTEGRATED_SHA`；branch=`speculo/2026-08-09-openhanako-v0-446-6-integration/T-04`；workspace_ref=`specdev-worktree/T-04`；package hash=`n/a-local-git`。
- **Preflight receipt：** `<Path>{roots.state}/specdev/changes/{change}/evidence/T-04.md</Path>` 不超过 10 行，核对 exact base/target、依赖、overlap 和最大行为回退风险。
- **Verification / baseline / reverse check：** ancestry、release定向测试、contract union、typecheck/test/build；对错误 ours/theirs 选择的结构/行为断言必须变红。
- **Authorization / deviation / correction limit：** local changes/commit 与 Lead local merge/non-force cleanup 自动授权；远程/生产/发布/归档禁止；3 轮。
- **Return：** 状态、Evidence、workspace、candidate SHA/commit、semantic ledger、未验证项、Lead验收请求。

#### Dispatch: T-05

- **Goal / observable result：** 吸收至 `v0.441.32`，输出 checkpoint 和重复基础设施后续 owner inventory。
- **Priority on conflict：** safety/data > Spec/ADR > single owner > contract union > speed。
- **Implement / Ticket：** `<Path>{roots.workflows}/specdev/I-implement/I-implement.md</Path>`；`<Path>{roots.state}/specdev/changes/{change}/ticket/05-integrate-v0-441-32.md</Path>`。
- **Authority / dependencies：** AC-001—AC-003、ADR-001、T-04 Evidence；后续收敛 owner 由 T-10..T-20 承担。
- **Wave / Gate / hard constraints：** W1.4/G1；可记录 inventory，不得接入重复 production watcher/parser/write path。
- **Writable / read-only / shared owner：** writable=`<Path>**</Path>` 仅 release/最小适配；read-only=`none`；shared=`none`，串行。
- **Baseline / branch / workspace or session locator / package hash：** base_sha=`T-04_INTEGRATED_SHA`；branch=`speculo/2026-08-09-openhanako-v0-446-6-integration/T-05`；workspace_ref=`specdev-worktree/T-05`；package hash=`n/a-local-git`。
- **Preflight receipt：** `<Path>{roots.state}/specdev/changes/{change}/evidence/T-05.md</Path>` 不超过 10 行，记录 release delta、owner overlap 风险和依赖 checkpoint。
- **Verification / baseline / reverse check：** ancestry、feature/HanaKDE suites、owner inventory scan；临时连接第二生产 owner 必须使 overlap检查失败。
- **Authorization / deviation / correction limit：** local changes/commit 与 Lead local merge/non-force cleanup 自动授权；push/PR/deploy/release/archive 禁止；3 轮。
- **Return：** 状态、Evidence、workspace、candidate commit、owner inventory/ledger、未验证项、Lead验收。

#### Dispatch: T-06

- **Goal / observable result：** 吸收高重叠 `v0.442.0` checkpoint，生产 watcher/mutation/baseline overlap 保持 0。
- **Priority on conflict：** safety/data > Spec/ADR > single owner > contract union > upstream normal change。
- **Implement / Ticket：** `<Path>{roots.workflows}/specdev/I-implement/I-implement.md</Path>`；`<Path>{roots.state}/specdev/changes/{change}/ticket/06-integrate-v0-442-0.md</Path>`。
- **Authority / dependencies：** AC-001—AC-003、ADR-001、T-05 Evidence/owner inventory。
- **Wave / Gate / hard constraints：** W1.5/G1；ResourceIO/Knowledge/root security不可简单 ours/theirs；绝不临时双运行。
- **Writable / read-only / shared owner：** writable=`<Path>**</Path>` 仅 checkpoint/最小适配；read-only=`none`；shared=`none`，串行。
- **Baseline / branch / workspace or session locator / package hash：** base_sha=`T-05_INTEGRATED_SHA`；branch=`speculo/2026-08-09-openhanako-v0-446-6-integration/T-06`；workspace_ref=`specdev-worktree/T-06`；package hash=`n/a-local-git`。
- **Preflight receipt：** `<Path>{roots.state}/specdev/changes/{change}/evidence/T-06.md</Path>` 不超过 10 行，核对 high-overlap、owner inventory 和最大安全风险。
- **Verification / baseline / reverse check：** ancestry、Resource/Knowledge/Workbench、安全/开放边界、owner overlap scan；连接重复 factory 必须失败。
- **Authorization / deviation / correction limit：** local changes/commit 与 Lead local merge/non-force cleanup 自动授权；所有 remote/release/deploy/archive 禁止；3 轮。
- **Return：** 状态、Evidence、workspace、candidate commit、semantic/owner handoff ledger、未验证项、Lead验收。

#### Dispatch: T-07

- **Goal / observable result：** 吸收至 `v0.443.46`，保留 History/Extraction/Materialize 能力输入且不产生第二生产 owner/parser。
- **Priority on conflict：** safety/data > Spec/ADR > feature union + primitive single owner > speed。
- **Implement / Ticket：** `<Path>{roots.workflows}/specdev/I-implement/I-implement.md</Path>`；`<Path>{roots.state}/specdev/changes/{change}/ticket/07-integrate-v0-443-46.md</Path>`。
- **Authority / dependencies：** AC-001—AC-003、ADR-001/004/005/006、T-06 Evidence。
- **Wave / Gate / hard constraints：** W1.6/G1；上游模块可隔离未接线，禁止 production 双 owner、双 parser 或直接写路径。
- **Writable / read-only / shared owner：** writable=`<Path>**</Path>` 仅 release/最小适配；read-only=`none`；shared=`none`，串行。
- **Baseline / branch / workspace or session locator / package hash：** base_sha=`T-06_INTEGRATED_SHA`；branch=`speculo/2026-08-09-openhanako-v0-446-6-integration/T-07`；workspace_ref=`specdev-worktree/T-07`；package hash=`n/a-local-git`。
- **Preflight receipt：** `<Path>{roots.state}/specdev/changes/{change}/evidence/T-07.md</Path>` 不超过 10 行，记录能力输入、重叠模块和 production wiring 风险。
- **Verification / baseline / reverse check：** ancestry、上游模块单测、HanaKDE contract union、duplicate owner/parser scan；接入第二 watcher/parser 必须失败。
- **Authorization / deviation / correction limit：** local changes/commit 与 Lead local merge/non-force cleanup 自动授权；push/PR/deploy/release/archive 禁止；3 轮。
- **Return：** 状态、Evidence、workspace、candidate commit、module inventory、未验证项、Lead验收。

#### Dispatch: T-08

- **Goal / observable result：** 严格顺序形成 `v0.443.54` 与 `v0.444.1` 两个子 checkpoint，吸收修复且合同无回退。
- **Priority on conflict：** safety/data > Spec/ADR > checkpoint auditability > contract union > speed。
- **Implement / Ticket：** `<Path>{roots.workflows}/specdev/I-implement/I-implement.md</Path>`；`<Path>{roots.state}/specdev/changes/{change}/ticket/08-integrate-v0-443-54-through-v0-444-1.md</Path>`。
- **Authority / dependencies：** AC-001—AC-003、ADR-001、T-07 Evidence；两个子 checkpoint 都必须有独立结果。
- **Wave / Gate / hard constraints：** W1.7/G1；不得合并成不可审计单步，不做 T-09 以后产品收敛或兼容层。
- **Writable / read-only / shared owner：** writable=`<Path>**</Path>` 仅两个 release增量/最小适配；read-only=`none`；shared=`none`。
- **Baseline / branch / workspace or session locator / package hash：** base_sha=`T-07_INTEGRATED_SHA`；branch=`speculo/2026-08-09-openhanako-v0-446-6-integration/T-08`；workspace_ref=`specdev-worktree/T-08`；package hash=`n/a-local-git`。
- **Preflight receipt：** `<Path>{roots.state}/specdev/changes/{change}/evidence/T-08.md</Path>` 不超过 10 行，记录两个 release boundary、依赖和最大回退风险。
- **Verification / baseline / reverse check：** 每个子 checkpoint ancestry/回归/contract union，最终基础质量；缺任一子 checkpoint Evidence 必须阻断。
- **Authorization / deviation / correction limit：** local changes/commit 与 Lead local merge/non-force cleanup 自动授权；push/PR/deploy/release/archive 禁止；3 轮。
- **Return：** 状态、Evidence、workspace、两个 checkpoint 与最终 candidate commit、裁决、未验证项、Lead验收。

#### Dispatch: T-09

- **Goal / observable result：** 从 T-08 到冻结 `v0.446.6@5f08a4f30203abb61dafac7dbb7ab92d11c23efa`，证明 target ancestry、上游关键功能和 HanaKDE contract union。
- **Priority on conflict：** safety/data > Spec/ADR > frozen ancestry > contract union > speed。
- **Implement / Ticket：** `<Path>{roots.workflows}/specdev/I-implement/I-implement.md</Path>`；`<Path>{roots.state}/specdev/changes/{change}/ticket/09-integrate-v0-446-6.md</Path>`。
- **Authority / dependencies：** AC-001—AC-003、ADR-001、T-08 Evidence；只使用冻结 SHA，不跟随浮动分支。
- **Wave / Gate / hard constraints：** W1.8/G1；Memory Dream/compaction/Markdown/settings/persistence/build 全盘吸收，HanaKDE Resource/Knowledge/Transfer/Workbench 不回退，无长期兼容壳。
- **Writable / read-only / shared owner：** writable=`<Path>**</Path>` 仅 target release与最小适配；read-only=`none`；W1 可吸收上游 manifest原始增量，G1 后 package语义收敛由 T-21 独占。
- **Baseline / branch / workspace or session locator / package hash：** base_sha=`T-08_INTEGRATED_SHA`；branch=`speculo/2026-08-09-openhanako-v0-446-6-integration/T-09`；workspace_ref=`specdev-worktree/T-09`；package hash=`n/a-local-git`。
- **Preflight receipt：** `<Path>{roots.state}/specdev/changes/{change}/evidence/T-09.md</Path>` 不超过 10 行，记录 exact base/target、关键功能、overlap和最大安全风险。
- **Verification / baseline / reverse check：** frozen ancestry、上游关键功能、HanaKDE核心合同、clean quality；错误 SHA、浮动 ref 或任一关键功能失败必须阻断 G1。
- **Authorization / deviation / correction limit：** local changes/commit 与 Lead local merge/non-force cleanup 自动授权；未来 push/PR/deploy/release/archive 禁止；3 轮。
- **Return：** 状态、Evidence、workspace、candidate commit、target/inventory/ledger、未验证项、Lead G1验收。

#### Dispatch: T-10

- **Goal / observable result：** 以现有 ResourceIO/EventBus/Root Identity/Transfer 为权威吸收 Materialize，形成唯一 Resource Kernel 和安全事件合同。
- **Priority on conflict：** safety/data > ADR/Spec > single Resource owner > compatibility > speed。
- **Implement / Ticket：** `<Path>{roots.workflows}/specdev/I-implement/I-implement.md</Path>`；`<Path>{roots.state}/specdev/changes/{change}/ticket/10-converge-resource-kernel.md</Path>`。
- **Authority / dependencies：** AC-011/014/020/023/026、ADR-001/004/007、T-09 Evidence和G1 inventory。
- **Wave / Gate / hard constraints：** G2；ResourceIO唯一写入，EventBus有序/去重/isolation，Root Identity fail closed，copy/transfer/materialize不合并；无 raw root/public workspaceId。
- **Writable / read-only / shared owner：** writable=`<Path>lib/resource-io/**</Path>`, `<Path>lib/file-ref/resource-io.ts</Path>`, `<Path>server/routes/resource-io.ts</Path>`, `<Path>server/http/resource-operation-context.ts</Path>`, `<Path>tests/resource-*.test.ts</Path>`；read-only=engine/Knowledge/History/Extraction Ticket 声明范围；shared owner=T-10 Resource Kernel。
- **Baseline / branch / workspace or session locator / package hash：** base_sha=`T-09_INTEGRATED_SHA`；branch=`speculo/2026-08-09-openhanako-v0-446-6-integration/T-10`；workspace_ref=`specdev-worktree/T-10`；package hash=`n/a-local-git`。
- **Preflight receipt：** `<Path>{roots.state}/specdev/changes/{change}/evidence/T-10.md</Path>` 不超过 10 行，核对 G1、路径、authority接口、最大 TOCTOU/staging 风险。
- **Verification / baseline / reverse check：** EventBus/Root/Materialize/Transfer tests、malicious authority matrix、typecheck；unknown/root replacement/symlink/oversize/cancel 必须 effect前失败，duplicate owner scan必须红。
- **Authorization / deviation / correction limit：** local changes/commit与Lead local merge/non-force cleanup自动授权；remote/release/deploy/archive/真实数据禁止；3轮，公共契约变化升级。
- **Return：** 状态、Evidence、workspace、candidate commit、接口/结构scan、未验证项、Lead G2验收。

#### Dispatch: T-11

- **Goal / observable result：** 建立唯一 `main` lifecycle、WorkspaceWatchCoordinator、共享 baseline observation、四态 health/scoped retry；N consumers仍为1 watcher/1 baseline。
- **Priority on conflict：** root safety > main/mount Spec > single observer > performance > speed。
- **Implement / Ticket：** `<Path>{roots.workflows}/specdev/I-implement/I-implement.md</Path>`；`<Path>{roots.state}/specdev/changes/{change}/ticket/11-establish-main-workspace-infrastructure.md</Path>`。
- **Authority / dependencies：** AC-004/005/009/012/013/014/025/026、ADR-002/007/010/011、T-10 Evidence。
- **Wave / Gate / hard constraints：** W3；main切换close/open，mount不升级，≤1 physical watcher，每repair cycle 1 full baseline；仅隔离证明，不做production cutover。
- **Writable / read-only / shared owner：** writable=`<Path>core/workspace-runtime/**</Path>`, `<Path>shared/workspace-*.ts</Path>`, `<Path>desktop/workspace-watch-registry.cjs</Path>`, `<Path>desktop/main.cjs</Path>`, `<Path>tests/workspace-*.test.ts</Path>`；read-only=Kernel/engine/Knowledge/History；shared owner=T-11 workspace infrastructure。
- **Baseline / branch / workspace or session locator / package hash：** base_sha=`T-10_INTEGRATED_SHA`；branch=`speculo/2026-08-09-openhanako-v0-446-6-integration/T-11`；workspace_ref=`specdev-worktree/T-11`；package hash=`n/a-local-git`。
- **Preflight receipt：** `<Path>{roots.state}/specdev/changes/{change}/evidence/T-11.md</Path>` 不超过10行，核对 G2、并行W3 base、watch descriptor/root risk。
- **Verification / baseline / reverse check：** main switch/N-consumer/unsubscribe/baseline/health/security、50k synthetic tree；重复订阅不得增加 watcher，注入gap必须进入reconcile并恢复。
- **Authorization / deviation / correction limit：** local changes/commit与Lead local merge/non-force cleanup自动授权；push/PR/deploy/release/archive禁止；3轮。
- **Return：** 状态、Evidence、workspace、candidate commit、cutover descriptor/scan、未验证项、Lead验收。

#### Dispatch: T-12

- **Goal / observable result：** 生产 assembly 一步到位 stop-old/prove-release/start-new，Engine/Server/Desktop只连接唯一 Resource/Workspace owner，overlap始终为0。
- **Priority on conflict：** no-overlap safety > lifecycle correctness > availability > speed。
- **Implement / Ticket：** `<Path>{roots.workflows}/specdev/I-implement/I-implement.md</Path>`；`<Path>{roots.state}/specdev/changes/{change}/ticket/12-perform-single-owner-production-cutover.md</Path>`。
- **Authority / dependencies：** AC-009—AC-013、ADR-005/006、T-10/T-11 Evidence和W3 Gate SHA。
- **Wave / Gate / hard constraints：** W4；isolated proof→stop old→prove release→start new；失败时stop new后恢复；无shadow watcher/dual write/dual baseline/compat flag。
- **Writable / read-only / shared owner：** writable=`<Path>core/engine.ts</Path>`, `<Path>server/composition/**</Path>`, `<Path>server/resource-events-ws.ts</Path>`, `<Path>desktop/src/react/services/resource-events.ts</Path>`, Ticket tests；read-only=Kernel/workspace/desktop main/consumers；shared owner=T-12 production assembly。
- **Baseline / branch / workspace or session locator / package hash：** base_sha=`W3_INTEGRATED_SHA`；branch=`speculo/2026-08-09-openhanako-v0-446-6-integration/T-12`；workspace_ref=`specdev-worktree/T-12`；package hash=`n/a-local-git`。
- **Preflight receipt：** `<Path>{roots.state}/specdev/changes/{change}/evidence/T-12.md</Path>` 不超过10行，核对 W3、cutover descriptor、并行paths和最大双owner风险。
- **Verification / baseline / reverse check：** lifecycle state machine、stop/start/release failure injection、subscriber churn、structure scan；任何 owner overlap或旧factory调用必须失败。
- **Authorization / deviation / correction limit：** local changes/commit与Lead local merge/non-force cleanup自动授权；不执行真实生产切换/远程/发布；3轮，no-overlap不可waive。
- **Return：** 状态、Evidence、workspace、candidate commit、时序/overlap scan、未验证项、Lead验收。

#### Dispatch: T-13

- **Goal / observable result：** 交付仅覆盖 `main` 的 File History capture/deleted/timeline/diff/rename/retention/quota，新私有store失败可retry且不破坏Workspace。
- **Priority on conflict：** user data integrity > main-only scope > deterministic policy > speed。
- **Implement / Ticket：** `<Path>{roots.workflows}/specdev/I-implement/I-implement.md</Path>`；`<Path>{roots.state}/specdev/changes/{change}/ticket/13-deliver-main-only-file-history.md</Path>`。
- **Authority / dependencies：** AC-005—007/025/026、ADR-002/003/005/011、T-10/T-11 Evidence。
- **Wave / Gate / hard constraints：** W4；store在Workspace外，mount/remote不捕获；60s/5MiB/30d/500MiB；无migration/old profile/private watcher。
- **Writable / read-only / shared owner：** writable=`<Path>lib/file-history/**</Path>`, `<Path>server/routes/file-history.ts</Path>`, `<Path>tests/file-history-*.test.ts</Path>`；read-only=Kernel/workspace/engine/Knowledge/Desktop；shared owner=T-13 History domain。
- **Baseline / branch / workspace or session locator / package hash：** base_sha=`W3_INTEGRATED_SHA`；branch=`speculo/2026-08-09-openhanako-v0-446-6-integration/T-13`；workspace_ref=`specdev-worktree/T-13`；package hash=`n/a-local-git`。
- **Preflight receipt：** `<Path>{roots.state}/specdev/changes/{change}/evidence/T-13.md</Path>` 不超过10行，核对 main/mount scope、store路径、并行W4和最大数据风险。
- **Verification / baseline / reverse check：** capture/rename/delete/diff/retention/quota、mount/remote/oversize/noise/init failure、route security；把store置于Workspace或启用private watcher必须失败。
- **Authorization / deviation / correction limit：** local changes/commit与Lead local merge/non-force cleanup自动授权；真实用户数据/remote/release/archive禁止；3轮。
- **Return：** 状态、Evidence、workspace、candidate commit、schema/policy/scan、未验证项、Lead验收。

#### Dispatch: T-14

- **Goal / observable result：** Knowledge只消费统一事件/shared baseline differences，按source/resource scoped repair，保留独立DB/IR/Registry/Search并删除私有watch/full walk。
- **Priority on conflict：** index correctness > single observation owner > existing Knowledge contract > speed。
- **Implement / Ticket：** `<Path>{roots.workflows}/specdev/I-implement/I-implement.md</Path>`；`<Path>{roots.state}/specdev/changes/{change}/ticket/14-converge-knowledge-events-and-repair.md</Path>`。
- **Authority / dependencies：** AC-003/011/012/013/017、ADR-005/006/010、T-10/T-11 Evidence。
- **Wave / Gate / hard constraints：** W4；saved disk为事实，generation atomic；无private root watcher/full walk、无History模型合并、无direct Engine mutation fan-out。
- **Writable / read-only / shared owner：** writable=`<Path>core/knowledge-workspace/**</Path>`, `<Path>lib/knowledge-workspace/**</Path>`, `<Path>server/routes/knowledge-workspace.ts</Path>`, `<Path>tests/knowledge-*.test.ts</Path>`；read-only=Kernel/workspace/engine/History/Desktop；shared owner=T-14 Knowledge event/repair。
- **Baseline / branch / workspace or session locator / package hash：** base_sha=`W3_INTEGRATED_SHA`；branch=`speculo/2026-08-09-openhanako-v0-446-6-integration/T-14`；workspace_ref=`specdev-worktree/T-14`；package hash=`n/a-local-git`。
- **Preflight receipt：** `<Path>{roots.state}/specdev/changes/{change}/evidence/T-14.md</Path>` 不超过10行，核对 source/cursor/generation、并行paths和最大静默分叉风险。
- **Verification / baseline / reverse check：** create/modify/rename/delete、drop/stale cursor、reader/index failure、scan counters、Knowledge E2E subset；drop event必须触发一次shared baseline + scoped repair。
- **Authorization / deviation / correction limit：** local changes/commit与Lead local merge/non-force cleanup自动授权；remote/release/archive/真实数据禁止；3轮。
- **Return：** 状态、Evidence、workspace、candidate commit、cursor/generation/scan、未验证项、Lead验收。

#### Dispatch: T-15

- **Goal / observable result：** restore携带expected-current-version并effect前重证root/scope/version，仅经ResourceIO写盘；成功可反悔且Disk/Preview/History/Knowledge/Search/Agent Read收敛。
- **Priority on conflict：** user data and TOCTOU safety > convergence > usability > speed。
- **Implement / Ticket：** `<Path>{roots.workflows}/specdev/I-implement/I-implement.md</Path>`；`<Path>{roots.state}/specdev/changes/{change}/ticket/15-deliver-secure-restore-convergence.md</Path>`。
- **Authority / dependencies：** AC-015—017/026、ADR-003/005/007、T-12/T-13/T-14 Evidence和W4 Gate。
- **Wave / Gate / hard constraints：** G5；preflight紧邻write，origin=`history_restore`；stale/root replacement/escape磁盘不变；无direct fs/DB write或route逐面刷新。
- **Writable / read-only / shared owner：** writable=`<Path>lib/file-history/**</Path>`, `<Path>server/routes/file-history.ts</Path>`, `<Path>core/knowledge-workspace/**</Path>`, `<Path>desktop/src/react/utils/preview-document-refresh.ts</Path>`, Ticket tests；read-only=Kernel/workspace/engine/UI；convergence owner=T-15，串行汇合。
- **Baseline / branch / workspace or session locator / package hash：** base_sha=`W4_INTEGRATED_SHA`；branch=`speculo/2026-08-09-openhanako-v0-446-6-integration/T-15`；workspace_ref=`specdev-worktree/T-15`；package hash=`n/a-local-git`。
- **Preflight receipt：** `<Path>{roots.state}/specdev/changes/{change}/evidence/T-15.md</Path>` 不超过10行，核对三依赖、version token、effect seam和最大覆盖风险。
- **Verification / baseline / reverse check：** B→restore A→六读面=A且可反悔；stale/root/symlink/scope/subscriber failure matrix；pre-write失败磁盘不变，post-write失败进入repair。
- **Authorization / deviation / correction limit：** local fixtures/changes/commit与Lead local merge/non-force cleanup自动授权；不得对真实用户数据执行restore；remote/release/archive禁止；3轮，安全失败不可waive。
- **Return：** 状态、Evidence、workspace、candidate commit、restore/TOCTOU/convergence结果、未验证项、Lead G5 E2E。

#### Dispatch: T-16

- **Goal / observable result：** Workbench提供main History files/deleted/timeline/diff/restore/health流程，expected version与异步scope正确，a11y/窄布局不回退。
- **Priority on conflict：** restore safety > stale-scope correctness > accessibility > visual polish > speed。
- **Implement / Ticket：** `<Path>{roots.workflows}/specdev/I-implement/I-implement.md</Path>`；`<Path>{roots.state}/specdev/changes/{change}/ticket/16-deliver-workspace-history-ui.md</Path>`。
- **Authority / dependencies：** AC-006/007/013/015—017/024、T-13/T-15 Evidence；backend合同只读。
- **Wave / Gate / hard constraints：** W6；只表示current main；scope change取消/失效旧请求；无raw root、shadow file truth、mount History或旧DTO壳。
- **Writable / read-only / shared owner：** writable=Ticket声明的 `<Path>desktop/src/react/components/file-history/**</Path>`、store/API/diff/tests/E2E；read-only=History domain/route/Knowledge UI/resource events；shared=`none`。
- **Baseline / branch / workspace or session locator / package hash：** base_sha=`T-15_INTEGRATED_SHA`；branch=`speculo/2026-08-09-openhanako-v0-446-6-integration/T-16`；workspace_ref=`specdev-worktree/T-16`；package hash=`n/a-local-git`。
- **Preflight receipt：** `<Path>{roots.state}/specdev/changes/{change}/evidence/T-16.md</Path>` 不超过10行，核对backend DTO、scope、并行W6和最大stale restore风险。
- **Verification / baseline / reverse check：** component loading/cancel/deleted/diff/conflict/health、keyboard/ARIA/i18n/theme/narrow；Worker返回E2E场景，Lead运行History→diff→restore→Preview/Search；stale response fixture必须被丢弃。
- **Authorization / deviation / correction limit：** local changes/commit与Lead local merge/non-force cleanup自动授权；真实用户restore、push/PR/deploy/release/archive禁止；3轮。
- **Return：** 状态、Evidence、workspace、candidate commit、component/a11y结果、E2E场景/未验证项、Lead E2E。

#### Dispatch: T-17

- **Goal / observable result：** Agent入口按conversation/operation过滤；main资源复用同一History diff/restore，mount只显示操作影响且不扩大capture。
- **Priority on conflict：** conversation isolation > main/mount scope > primitive reuse > UX > speed。
- **Implement / Ticket：** `<Path>{roots.workflows}/specdev/I-implement/I-implement.md</Path>`；`<Path>{roots.state}/specdev/changes/{change}/ticket/17-deliver-agent-file-change-projection.md</Path>`。
- **Authority / dependencies：** AC-008/015—017/024、ADR-003/006、T-15/T-16 Evidence和W6 Gate。
- **Wave / Gate / hard constraints：** W7；filter first、main scope proof required；无Agent专用store/watcher/baseline/restore route/write path，无跨conversation泄漏。
- **Writable / read-only / shared owner：** writable=Ticket声明的 shared history projection、file-change-events/history-builder/chat/activity tests/E2E；read-only=History domain/route/components/Kernel；shared=`none`。
- **Baseline / branch / workspace or session locator / package hash：** base_sha=`W6_INTEGRATED_SHA`；branch=`speculo/2026-08-09-openhanako-v0-446-6-integration/T-17`；workspace_ref=`specdev-worktree/T-17`；package hash=`n/a-local-git`。
- **Preflight receipt：** `<Path>{roots.state}/specdev/changes/{change}/evidence/T-17.md</Path>` 不超过10行，核对correlation、main/mount scope、History复用和最大隐私风险。
- **Verification / baseline / reverse check：** main/mount/multi-conversation/stale-main projection、duplicate-owner scan；Worker返回Agent flow，Lead运行一次修改→changes→diff/restore；other-conversation fixture必须不可见。
- **Authorization / deviation / correction limit：** local changes/commit与Lead local merge/non-force cleanup自动授权；真实Agent/用户数据、remote/release/archive禁止；3轮。
- **Return：** 状态、Evidence、workspace、candidate commit、projection/scan、E2E场景/未验证项、Lead验收。

#### Dispatch: T-18

- **Goal / observable result：** 融合上游 `@` query/loading/cancel/stale-response生命周期到HanaKDE main/mount/Knowledge providers，latest query wins。
- **Priority on conflict：** active-scope correctness > provider reuse > accessibility > speed。
- **Implement / Ticket：** `<Path>{roots.workflows}/specdev/I-implement/I-implement.md</Path>`；`<Path>{roots.state}/specdev/changes/{change}/ticket/18-fuse-at-search-lifecycle.md</Path>`。
- **Authority / dependencies：** AC-024、T-09 Evidence；Search/Knowledge/Resource backend只读复用。
- **Wave / Gate / hard constraints：** W3；query identity/abort固定，close/unmount清理；无backend重写、History capture或scope扩大。
- **Writable / read-only / shared owner：** writable=Ticket声明的 input components/mention utilities/component tests/E2E；read-only=`<Path>lib/search/**</Path>`, `<Path>lib/knowledge-workspace/**</Path>`, Knowledge UI；shared=`none`。
- **Baseline / branch / workspace or session locator / package hash：** base_sha=`T-10_INTEGRATED_SHA`；branch=`speculo/2026-08-09-openhanako-v0-446-6-integration/T-18`；workspace_ref=`specdev-worktree/T-18`；package hash=`n/a-local-git`。
- **Preflight receipt：** `<Path>{roots.state}/specdev/changes/{change}/evidence/T-18.md</Path>` 不超过10行，核对provider接口、并行W3路径和最大async race风险。
- **Verification / baseline / reverse check：** rapid query/cancel/scope switch/reject/unmount、keyboard/ARIA/i18n/theme/typecheck；Worker返回direct flow，Lead运行连续@查询切换/选择；旧promise结果不得闪回。
- **Authorization / deviation / correction limit：** local changes/commit与Lead local merge/non-force cleanup自动授权；remote/release/archive禁止；3轮。
- **Return：** 状态、Evidence、workspace、candidate commit、component结果、E2E场景/未验证项、Lead验收。

#### Dispatch: T-19

- **Goal / observable result：** 交付system-core共享Document Extraction，经授权bounded read/Materialize输出derived Markdown/format/warnings，稳定四类失败且staging必清理。
- **Priority on conflict：** authorization/input safety > deterministic extraction > shared ownership > format coverage > speed。
- **Implement / Ticket：** `<Path>{roots.workflows}/specdev/I-implement/I-implement.md</Path>`；`<Path>{roots.state}/specdev/changes/{change}/ticket/19-deliver-shared-document-extraction.md</Path>`。
- **Authority / dependencies：** AC-018—020/022/023/026、ADR-004、T-10 Evidence。
- **Wave / Gate / hard constraints：** W3；50MiB在converter前；`unsupported|parse-failed|scanned-pdf|too-large`；无OCR、derived file、raw-path bypass或重叠parser。
- **Writable / read-only / shared owner：** writable=`<Path>lib/document-extract/**</Path>`, `<Path>lib/tools/file-tool.ts</Path>`, extraction tests/fixtures；read-only=Kernel/Office/Knowledge/manifests；shared owner=T-19 extraction core。
- **Baseline / branch / workspace or session locator / package hash：** base_sha=`T-10_INTEGRATED_SHA`；branch=`speculo/2026-08-09-openhanako-v0-446-6-integration/T-19`；workspace_ref=`specdev-worktree/T-19`；package hash=`n/a-local-git`。
- **Preflight receipt：** `<Path>{roots.state}/specdev/changes/{change}/evidence/T-19.md</Path>` 不超过10行，核对format inventory、Materialize、并行W3和最大native/temp风险。
- **Verification / baseline / reverse check：** 所有冻结fixtures、failure/security/cancel/cleanup、Workspace before/after、parser/raw-path scan；oversize必须在converter调用计数0时失败，scanned PDF不得spawn OCR。
- **Authorization / deviation / correction limit：** local fixtures/changes/commit与Lead local merge/non-force cleanup自动授权；不得修改manifests、真实文档、remote/release/archive；3轮。
- **Return：** 状态、Evidence、workspace、candidate commit、format/dependency/packaging inventory、未验证项、Lead验收。

#### Dispatch: T-20

- **Goal / observable result：** Office与Knowledge共同消费T-19 Extraction，按resource/extractor version重抽取/重索引，保留真实adapter且无派生文件/parser/watcher loop。
- **Priority on conflict：** index correctness > canonical extraction > Office real behavior > speed。
- **Implement / Ticket：** `<Path>{roots.workflows}/specdev/I-implement/I-implement.md</Path>`；`<Path>{roots.state}/specdev/changes/{change}/ticket/20-upgrade-office-to-knowledge-ingestion.md</Path>`。
- **Authority / dependencies：** AC-003/017/021/022、ADR-004/005、T-14/T-15/T-19 Evidence。
- **Wave / Gate / hard constraints：** W6；one canonical parser per overlap；derived Markdown直入IR/index不落盘；History DB独立；restore只经Event驱动；scanned no OCR。
- **Writable / read-only / shared owner：** writable=`<Path>plugins/office/**</Path>`, Knowledge core/lib, office/knowledge tests和Office E2E；read-only=Extraction/Kernel/History/manifests；shared owner=T-20 Office/Knowledge ingestion。
- **Baseline / branch / workspace or session locator / package hash：** base_sha=`T-15_INTEGRATED_SHA`；branch=`speculo/2026-08-09-openhanako-v0-446-6-integration/T-20`；workspace_ref=`specdev-worktree/T-20`；package hash=`n/a-local-git`。
- **Preflight receipt：** `<Path>{roots.state}/specdev/changes/{change}/evidence/T-20.md</Path>` 不超过10行，核对三依赖、version cache、并行W6和最大generation/loop风险。
- **Verification / baseline / reverse check：** Office create/modify/restore/search、scanned/corrupt/index failure/retry、parser/loop scan；Worker返回Office flow，Lead运行add→Search→modify/restore→Search；extractor version变化必须失效缓存。
- **Authorization / deviation / correction limit：** local fixtures/changes/commit与Lead local merge/non-force cleanup自动授权；不得修改manifests、真实文档、remote/release/archive；3轮。
- **Return：** 状态、Evidence、workspace、candidate commit、adapter/parser scan、E2E场景/未验证项、Lead验收。

#### Dispatch: T-21

- **Goal / observable result：** 收敛root manifests/lock/shared build/CI，确保Extraction native/runtime assets与全部产品能力进入clean server/Electron Windows/macOS package inputs。
- **Priority on conflict：** reproducible supply chain > runtime completeness > upstream/HanaKDE dependency union > speed。
- **Implement / Ticket：** `<Path>{roots.workflows}/specdev/I-implement/I-implement.md</Path>`；`<Path>{roots.state}/specdev/changes/{change}/ticket/21-converge-production-native-packaging.md</Path>`。
- **Authority / dependencies：** AC-002/003/018—023/027、ADR-001/008、T-12/T-16/T-17/T-18/T-20 Evidence及T-19 inventory。
- **Wave / Gate / hard constraints：** G8；source manifest先于lock重建；clean install可复现；dev-only依赖不掩盖prod缺失；Windows/macOS能力对齐，Linux非阻断。
- **Writable / read-only / shared owner：** writable=`<Path>package.json</Path>`, `<Path>package-lock.json</Path>`, `<Path>scripts/build-*.mjs</Path>`, `<Path>scripts/compute-cli-closure.mjs</Path>`, shared CI和native rebuild test；read-only=product/native sources；这些shared paths唯一owner=T-21。
- **Baseline / branch / workspace or session locator / package hash：** base_sha=`T-17_INTEGRATED_SHA`（必须同时含W6/T-18/T-20 integrated ancestry）；branch=`speculo/2026-08-09-openhanako-v0-446-6-integration/T-21`；workspace_ref=`specdev-worktree/T-21`；package hash=`n/a-local-git`。
- **Preflight receipt：** `<Path>{roots.state}/specdev/changes/{change}/evidence/T-21.md</Path>` 不超过10行，核对全部依赖、native inventory、shared ownership和最大供应链风险。
- **Verification / baseline / reverse check：** `npm ci`、typecheck/lint/test/client/server builds、closure/package dry smoke；暂缺/错配asset fixture必须早期非零并有诊断，恢复后全绿。
- **Authorization / deviation / correction limit：** local manifest/lock/build changes/commit与Lead local merge/non-force cleanup自动授权；不得触发外部CI写、push/PR/sign/notarize/release；3轮。
- **Return：** 状态、Evidence、workspace、candidate commit、dependency/closure/package inventory、未验证项、Lead G8验收。

#### Dispatch: T-22

- **Goal / observable result：** 在真实Windows执行case/junction/locked/rename/watch/cutover/reconcile/restore/extraction/Office Knowledge并通过`dist:win`、NSIS install/start direct-flow Gate。
- **Priority on conflict：** real-platform security > no blocking skip > package/runtime completeness > speed。
- **Implement / Ticket：** `<Path>{roots.workflows}/specdev/I-implement/I-implement.md</Path>`；`<Path>{roots.state}/specdev/changes/{change}/ticket/22-windows-blocking-gate.md</Path>`。
- **Authority / dependencies：** AC-009/010/014—023/027、ADR-008、T-21 Evidence和G8 package inventory。
- **Wave / Gate / hard constraints：** W9-WIN/G9；必须真实Windows；无mock替代、blocking skip、产品修复越界、签名或发布；symlink权限不足只可用junction补足并明确分类。
- **Writable / read-only / shared owner：** writable=`<Path>scripts/platform/windows/**</Path>`, `<Path>tests/platform/windows/**</Path>`；read-only=manifests/product code；shared=`none`，T-21仍拥有shared package路径。
- **Baseline / branch / workspace or session locator / package hash：** base_sha=`T-21_INTEGRATED_SHA`；branch=`speculo/2026-08-09-openhanako-v0-446-6-integration/T-22`；workspace_ref=`specdev-worktree/T-22`；package hash=`n/a-local-git`。
- **Preflight receipt：** `<Path>{roots.state}/specdev/changes/{change}/evidence/T-22.md</Path>` 不超过10行，核对真实runner、G8 artifacts、fixture cleanup和最大junction/native风险。
- **Verification / baseline / reverse check：** native security/watch/restore/extraction matrix、`npm run dist:win`、NSIS install/start/Electron flow；恶意junction/root replace/locked/converter失败必须fail closed且cleanup。
- **Authorization / deviation / correction limit：** local platform harness/commit与Lead local merge/non-force cleanup自动授权；外部runner写入需已有执行环境授权，否则保持未验证；push/PR/sign/release/archive禁止；3轮后回owning product Ticket。
- **Return：** 状态、Evidence、workspace、candidate commit、runner/OS/package SHA/inventory、blocking skips=`none`、Lead E2E验收。

#### Dispatch: T-23

- **Goal / observable result：** 在真实macOS执行recursive watcher/sleep-resume/gap/case/symlink/restore/extraction/Office Knowledge并通过`dist`、app/DMG start direct-flow Gate。
- **Priority on conflict：** real-platform security > no blocking skip > package/runtime completeness > speed。
- **Implement / Ticket：** `<Path>{roots.workflows}/specdev/I-implement/I-implement.md</Path>`；`<Path>{roots.state}/specdev/changes/{change}/ticket/23-macos-blocking-gate.md</Path>`。
- **Authority / dependencies：** AC-009/010/012—023/027、ADR-008、T-21 Evidence和G8 package inventory。
- **Wave / Gate / hard constraints：** W9-MAC/G9；必须真实macOS；无其他平台替代/blocking skip/产品越界；允许unsigned local package但必须真实bundle/start，无notarize/release。
- **Writable / read-only / shared owner：** writable=`<Path>scripts/platform/macos/**</Path>`, `<Path>tests/platform/macos/**</Path>`；read-only=manifests/product code；shared=`none`，T-21拥有shared package路径。
- **Baseline / branch / workspace or session locator / package hash：** base_sha=`T-21_INTEGRATED_SHA`；branch=`speculo/2026-08-09-openhanako-v0-446-6-integration/T-23`；workspace_ref=`specdev-worktree/T-23`；package hash=`n/a-local-git`。
- **Preflight receipt：** `<Path>{roots.state}/specdev/changes/{change}/evidence/T-23.md</Path>` 不超过10行，核对真实runner、G8 artifacts、descriptor/process cleanup和最大sleep-gap/native风险。
- **Verification / baseline / reverse check：** native watcher/gap/security/restore/extraction、`npm run dist`、app/DMG inventory/start/Electron flow；注入event loss必须reconcile，symlink/root replace必须fail closed。
- **Authorization / deviation / correction limit：** local platform harness/commit与Lead local merge/non-force cleanup自动授权；外部runner写入需已有环境授权，否则未验证；push/PR/sign/notarize/release/archive禁止；3轮。
- **Return：** 状态、Evidence、workspace、candidate commit、runner/OS/package SHA/inventory、blocking skips=`none`、Lead E2E验收。

#### Dispatch: T-24

- **Goal / observable result：** 依据实际Evidence发布当前架构、stop-then-start恢复、upstream五类裁决ledger和troubleshooting，不把计划写成完成事实。
- **Priority on conflict：** code/Evidence truth > Spec/ADR consistency > documentation completeness > speed。
- **Implement / Ticket：** `<Path>{roots.workflows}/specdev/I-implement/I-implement.md</Path>`；`<Path>{roots.state}/specdev/changes/{change}/ticket/24-architecture-and-upstream-sync-ledger.md</Path>`。
- **Authority / dependencies：** AC-001/028、ADR-001—011、T-01..T-21 actual Evidence；规划文本不能替代实施事实。
- **Wave / Gate / hard constraints：** W9-DOCS；必须记录main-only、single owner、separate DB、shared Extraction、no OCR/migration/dual-run和真实checkpoint/Gates；无marketing/release notes或永久Speculo promotion。
- **Writable / read-only / shared owner：** writable=`<Path>docs/**</Path>`；read-only=全部实现/测试/manifests；shared=`none`，T-24为本次architecture/sync docs owner。
- **Baseline / branch / workspace or session locator / package hash：** base_sha=`T-21_INTEGRATED_SHA`；branch=`speculo/2026-08-09-openhanako-v0-446-6-integration/T-24`；workspace_ref=`specdev-worktree/T-24`；package hash=`n/a-local-git`。
- **Preflight receipt：** `<Path>{roots.state}/specdev/changes/{change}/evidence/T-24.md</Path>` 不超过10行，核对Evidence completeness、actual SHA、并行W9和最大stale-claim风险。
- **Verification / baseline / reverse check：** Evidence trace、stale planned/TODO/old-target/dual-run/migration搜索、docs links/paths/terms；删除一条owner或SHA trace应使review失败，恢复后通过。
- **Authorization / deviation / correction limit：** local docs/commit与Lead local merge/non-force cleanup自动授权；产品代码、push/PR/release/archive禁止；3轮，Evidence缺失回owning Ticket。
- **Return：** 状态、Evidence、workspace、candidate commit、docs/ledger trace matrix、未验证项、Lead审查。

#### Dispatch: T-25

- **Goal / observable result：** 在W9最终集成SHA上只读判定target ancestry、28 AC、15 DoD、全质量、双平台package、安全/去冗余和Evidence freshness；只允许pass或明确fail。
- **Priority on conflict：** verification integrity > security/data > complete blocking coverage > completion speed。
- **Implement / Ticket：** `<Path>{roots.workflows}/specdev/I-implement/I-implement.md</Path>`；`<Path>{roots.state}/specdev/changes/{change}/ticket/25-final-umbrella-acceptance.md</Path>`。
- **Authority / dependencies：** AC-001—028、全部ADR/DEC、T-01..T-24 Evidence；T-22/T-23/T-24必须integrated。
- **Wave / Gate / hard constraints：** G10；项目代码只读，无blocking skip/deferred/unverified；Windows/macOS都阻断，Linux仅附加；禁止compat/duplicate/OCR/raw-root/public workspaceId。
- **Writable / read-only / shared owner：** 项目 writable=`none`；read-only=`<Path>**</Path>`；仅T-25 Evidence/状态由工作流写入；Lead为最终Gate和completion owner。
- **Baseline / branch / workspace or session locator / package hash：** base_sha=`W9_INTEGRATED_SHA`；branch=`speculo/2026-08-09-openhanako-v0-446-6-integration/T-25`；workspace_ref=`specdev-worktree/T-25`；package hash=`n/a-local-git`。
- **Preflight receipt：** `<Path>{roots.state}/specdev/changes/{change}/evidence/T-25.md</Path>` 不超过10行，核对final SHA、三依赖Evidence、命令矩阵和最大误放行风险。
- **Verification / baseline / reverse check：** ancestry、clean quality、关键integrated E2E trace、platform/package Evidence、duplicate/migration/OCR/security scans；识别任一stale/mismatched/skipped Evidence必须产生fail且不改代码。
- **Authorization / deviation / correction limit：** Worker只读验收；Lead可提交Evidence/status、完成local change并非强制清理；不得push/PR/deploy/release/archive；失败回owning Ticket，单项最多3轮。
- **Return：** `review`/`blocked`、T-25 Evidence、workspace、final checkpoint、commit仅Evidence、完整AC/DoD verdict、残余风险、待Lead final acceptance。

### Candidate Delivery Return and Lead Integration

Worker 完成时必须先把 Ticket 推进到 `review`，并返回：Ticket ID、Evidence 路径、workspace_ref、exact base/final checkpoint、candidate commit、修改路径、验证命令/退出状态、未验证项、建议 Lead E2E 和任何 deviation。禁止 Worker 自报 `done`、自行合并 integration line、删除分支/worktree或关闭 Gate。

Lead 对每个候选执行以下独立控制：

1. 核对 Dispatch、Ticket、依赖 Evidence、Gate SHA、Git worktree registry、commit parent、diff path 与敏感信息边界。
2. 执行标准轴审查：正确性、架构、错误处理、安全、依赖、测试质量、清理和非回归。
3. 执行规范轴审查：Spec/ADR/Ticket/Goal Plan、single owner、main/mount scope、无migration/dual-run/OCR及AC映射。
4. 在 integration baseline 复跑定向测试和受影响回归；涉及 UI、真实platform或package行为时由 Lead运行对应最小E2E/原生Gate。
5. 失败时向同一Worker返回失败标准、命令/退出码、最小错误、文件位置、正确约束、当前checkpoint和必须保留的绿色行为；同一验收项最多3轮。
6. 通过后Lead可无需用户确认直接local merge、更新Ticket/Map/Goal Plan/Evidence/status、发布新Gate SHA，并对已integrated clean worktree/branch做非强制清理。
7. 清理失败、路径不匹配、候选含未提交内容或合并冲突时保留现场并标记`blocked`；绝不force remove/reset/覆盖。达到修正上限后记录最后可信checkpoint、失败命令、已通过行为、owner和恢复条件。

Lead 在 G10 全部通过后拥有唯一 change completion 转换权；完成仅限本地 SpecDev change 状态与 integration line。push、PR、deploy、release、archive和任何远程/真实用户数据动作仍保持 `not-authorized`。
