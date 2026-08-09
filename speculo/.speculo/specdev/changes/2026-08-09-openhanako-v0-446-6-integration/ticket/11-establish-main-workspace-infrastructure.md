---
schema_version: 3
artifact: ticket
change: 2026-08-09-openhanako-v0-446-6-integration
id: T-11
title: 建立 main Workspace 基础设施
status: in_progress
planning_depth: deep
planning_depth_reason: "唯一 main 生命周期、physical watcher、baseline observation、健康状态与 root authority 是跨消费者共享核心状态机。"
ready: true
risk: critical
blocked_by: [T-10]
contract_ids: [AC-004, AC-005, AC-009, AC-012, AC-013, AC-014, AC-025, AC-026]
owner: Worker-T-18 / Lead
expected_changes: ["<Path>core/workspace-runtime/**</Path>", "<Path>shared/workspace-*.ts</Path>", "<Path>desktop/workspace-watch-registry.cjs</Path>", "<Path>desktop/main.cjs</Path>", "<Path>tests/workspace-*.test.ts</Path>"]
writable_paths: ["<Path>core/workspace-runtime/**</Path>", "<Path>shared/workspace-*.ts</Path>", "<Path>desktop/workspace-watch-registry.cjs</Path>", "<Path>desktop/main.cjs</Path>", "<Path>tests/workspace-*.test.ts</Path>"]
read_only_paths: ["<Path>lib/resource-io/**</Path>", "<Path>core/engine.ts</Path>", "<Path>core/knowledge-workspace/**</Path>", "<Path>lib/file-history/**</Path>"]
shared_paths: []
shared_path_owners: []
---

# Ticket T-11: 建立 main Workspace 基础设施

- **Ticket 文件：** `<Path>{roots.state}/specdev/changes/{change}/ticket/11-establish-main-workspace-infrastructure.md</Path>`
- **总体 Map：** `<Path>{roots.state}/specdev/changes/{change}/tickets-map.md</Path>`
- **上游 Spec：** `<Path>{roots.state}/specdev/changes/{change}/spec.md</Path>`
- **完成 Evidence：** `<Path>{roots.state}/specdev/changes/{change}/evidence/T-11.md</Path>`

## 1. 战略与来源

- **目标：** 建立唯一 `main` lifecycle、WorkspaceWatchCoordinator、共享 baseline observation、四态健康和 scoped retry，为 History、Knowledge 与 UI 提供逻辑订阅。
- **可观察产出：** 切换工作目录关闭旧 `main` 并打开全新 `main`；N 个消费者只产生一个 physical watcher 和一次 baseline walk；挂载保持额外目录而非 Workspace。
- **来源：** `US-002`、`US-005`、`US-009`—`US-011`、`AC-004`、`AC-005`、`AC-009`、`AC-012`—`AC-014`、`AC-025`、`AC-026`、`ADR-002`、`ADR-007`、`ADR-010`、`ADR-011`。
- **当前事实：** 当前有 `<Path>desktop/workspace-watch-registry.cjs</Path>`、ResourceWatchRegistry、renderer resource watch 和 Knowledge event runtime；尚无统一 `main` observation owner。
- **Planning Depth 原因：** root identity、watch descriptor、baseline、health 和 lifecycle 均为共享核心并影响跨平台资源安全。

## 2. 决策状态

### 已锁定决策

- `main` 是唯一 Workspace；换工作目录是 close-old/open-new，不是 relocation；旧 History identity、tabs、mounts 和 UI state 不继承。
- 挂载只是额外目录，不进入 Workspace History，也不拥有 workspace lifecycle。
- 同一 canonical root 最多一个 physical watcher；同一 `main` 只有一次完整 baseline observation。
- 健康只使用 `HEALTHY | DEGRADED | RECONCILING | FAILED`；初始化/repair 可 scoped retry。
- 不新增公共 `workspaceId`；`sourceKey=main`、ResourceRef、Root Identity 和 private store key 分工不混淆。

### 已采用的低影响假设

- coordinator 的具体类/DTO 名称遵循整合后 workspace 与 resource 命名；contract tests 锁定行为而非类名。

### 未决问题

无。

## 3. 范围边界

| IN（本 Ticket 构建） | REUSE（复用且不改变契约） | OUT（明确不做） |
|---|---|---|
| main lifecycle、watch coordinator、baseline observation、health/retry、mount exclusion | Resource Kernel、现有 workspace UI persistence/close contracts | 生产 owner 切换、History DB、Knowledge DB、relocation/legacy migration |

## 4. 要构建什么

用户选择目录后，系统先证明 ResourceRef 与 root authority，再关闭旧 `main` 的观察和派生生命周期，打开一个全新的 `main`。逻辑消费者共享一个 watcher 与 baseline observation。watcher error/gap 进入统一健康状态，repair 成功收敛，失败可对当前 scope retry；History 初始化失败不能破坏普通文件管理。

## 5. 实现契约

- **入口或接缝：** main open/close/switch lifecycle、coordinator subscribe/release、baseline/reconcile 与 health/retry API。
- **输入与输出：** authorized main ResourceRef + consumer subscription → normalized observations, cursor/health and release handle。
- **公共接口变化：** 增加内部 workspace observation/health contract；外部只绑定授权 main/opaque resource，不接受 raw root 或 workspaceId。
- **不变量：** watchers ≤ physical roots；baseline walk = 1 per main repair cycle；last consumer release closes watcher；mount 不升级为 Workspace。
- **状态或数据流：** authorize/prove → close old → open new → observe baseline → publish facts → scoped repair/health。
- **错误与失败行为：** root unknown/replaced、watch failure、gap、baseline failure 进入稳定状态；普通 Workspace 能力保持，敏感操作 fail closed。
- **兼容要求：** 保留现有 main/sourceKey 与 mount semantics；无 relocation、旧 profile 或 legacy watcher compatibility。
- **安全与隐私要求：** canonical identity 只在系统内部；外部事件不泄漏绝对 root；symlink/junction 按 provider proof。

## 6. 执行路线

1. 用 main switch、N-consumer、descriptor、gap 和 failure tests 固定红色行为与健康状态机。
2. 建立 `main` lifecycle 与 WorkspaceWatchCoordinator 的 logical subscription/physical owner contract。
3. 建立唯一 baseline observation 与 cursor/gap/scoped reconciliation，不嵌入 History/Knowledge policy。
4. 接入 Root Identity、mount exclusion 和四态 health/scoped retry。
5. 在未连接现有生产 owner 的隔离 harness 中运行 50k synthetic tree、release/cleanup 与 root replacement tests。
6. 输出 cutover descriptor 与 stop/start assertions 给 T-12；不在本 Ticket 切生产 owner。

## 7. 路径访问契约

- **预计修改点：** frontmatter 中 workspace runtime、desktop registry、shared contract 和测试。
- **继任修正（round 1 / 3）：** 保留原候选 checkpoint `c40b65c3590c5d81fb9f927d8ea7159f03cd82e0`，由 `Worker-T-18 / Lead` 在同一 `<Path>specdev-worktree/T-11</Path>`、同一 W3 base 上修正；不得 rebase 或重置候选。必须证明 last-release 后重新订阅会重新验证 root/scope 并执行一次 baseline、baseline 异步期间的 watcher 事件不会交错覆盖或重放 stale facts、以及每个普通 watcher change 在发布前都会重验证 root identity/scope 并在 replacement/unavailable 时 fail closed。
- **可写范围：** 仅 `writable_paths`；`<Path>core/engine.ts</Path>` 为 T-12 唯一生产 wiring owner。
- **只读上下文：** Resource Kernel、Knowledge、History 与 engine。
- **共享路径：** 无；本 Ticket 拥有 workspace infrastructure contract。
- **保留或不动：** Knowledge/History stores、Office、Agent projection、公共 workspaceId。

## 8. 验证矩阵

| 行为或风险 | 验证接缝 | 命令或步骤 | 预期结果 | Evidence |
|---|---|---|---|---|
| 正常路径 | lifecycle/coordinator contract | main switch、N consumer、unsubscribe、baseline tests | 新 main 独立；1 watcher/1 baseline；last release closes | `<Path>{roots.state}/specdev/changes/{change}/evidence/T-11.md</Path>` |
| 失败路径 | health/security state machine | watcher error、gap、retry fail/success、root replacement、mount scope tests | 四态转换正确，unknown fail closed，普通文件能力保持 | `<Path>{roots.state}/specdev/changes/{change}/evidence/T-11.md</Path>` |
| 回归 | descriptor/performance | synthetic large tree + existing workspace/resource watch suites | watcher factory O(roots)，无 descriptor leak | `<Path>{roots.state}/specdev/changes/{change}/evidence/T-11.md</Path>` |

## 9. 发布、迁移与恢复

- **迁移顺序：** 隔离 contract/harness 完成后交给 T-12 cutover；本 Ticket 不连接同一真实 root。
- **兼容窗口：** 无：不保留 relocation、旧 workspace identity 或双 watcher compatibility。
- **监控信号：** physical watcher count、logical subscriptions、baseline scan count、cursor gap、health transitions、cleanup descriptors。
- **回滚或前向恢复：** 隔离实现可前向修正；生产失败恢复由 T-12 先停新 owner 再恢复前一代码 Wave。
- **不可逆操作与批准点：** 无数据迁移；Git 和生产 wiring 按各自 Ticket 授权。
- **收缩条件：** workspace watcher/baseline 只有一个可生产 owner，旧 identity/migration 分支不存在。

## 10. 验收标准

- [ ] `AC-004`/`AC-005`：main switch 为新 lifecycle，挂载不继承/不升级且不进入 Workspace History scope。
- [ ] `AC-009`/`AC-012`：N consumers 仍为一个 watcher、一次 baseline，gap 执行 scoped repair。
- [ ] `AC-013`：四态 health 和 scoped retry contract 通过。
- [ ] `AC-014`/`AC-026`：root authority fail closed，外部接口不泄漏 raw root。
- [ ] `AC-025`：新 main 初始化失败可 retry 且普通 Workspace 能力不破坏。
- [ ] 验证记录到 `<Path>{roots.state}/specdev/changes/{change}/evidence/T-11.md</Path>`。
