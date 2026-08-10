---
schema_version: 3
artifact: ticket
change: 2026-08-09-openhanako-v0-446-6-integration
id: T-13
title: 交付仅覆盖 main 的 File History
status: in_progress
planning_depth: deep
planning_depth_reason: "新 SQLite 数据模型、retention/quota、rename/delete 版本语义和安全 scope 属于共享持久化与数据完整性能力。"
ready: true
risk: critical
blocked_by: [T-10, T-11]
contract_ids: [AC-005, AC-006, AC-007, AC-025, AC-026]
owner: Worker-T-13
expected_changes: ["<Path>lib/file-history/**</Path>", "<Path>server/routes/file-history.ts</Path>", "<Path>tests/file-history-*.test.ts</Path>"]
writable_paths: ["<Path>lib/file-history/**</Path>", "<Path>server/routes/file-history.ts</Path>", "<Path>tests/file-history-*.test.ts</Path>"]
read_only_paths: ["<Path>lib/resource-io/**</Path>", "<Path>core/workspace-runtime/**</Path>", "<Path>core/engine.ts</Path>", "<Path>core/knowledge-workspace/**</Path>", "<Path>desktop/src/react/**</Path>"]
shared_paths: []
shared_path_owners: []
---

# Ticket T-13: 交付仅覆盖 main 的 File History

- **Ticket 文件：** `<Path>{roots.state}/specdev/changes/{change}/ticket/13-deliver-main-only-file-history.md</Path>`
- **总体 Map：** `<Path>{roots.state}/specdev/changes/{change}/tickets-map.md</Path>`
- **上游 Spec：** `<Path>{roots.state}/specdev/changes/{change}/spec.md</Path>`
- **完成 Evidence：** `<Path>{roots.state}/specdev/changes/{change}/evidence/T-13.md</Path>`

## 1. 战略与来源

- **目标：** 将冻结上游 File History store/policy/timeline/diff 适配到 HanaKDE 的 `main`、ResourceEvent 和 shared baseline contracts，建立唯一新 File History 数据基线。
- **可观察产出：** 用户可查询 `main` 内文本文件的版本、删除项、origin、rename timeline 和 line diff；挂载不捕获、不建 store；retention/quota 精确生效。
- **来源：** `US-002`、`US-003`、`US-010`、`AC-005`—`AC-007`、`AC-025`、`AC-026`、`ADR-002`、`ADR-003`、`ADR-005`、`ADR-011`。
- **当前事实：** 冻结上游提供 `<Path>lib/file-history/</Path>` 与测试先例；HanaKDE 当前没有该 store，但有更强 Resource/Root Identity/Workspace contracts。
- **Planning Depth 原因：** 私有 SQLite、版本 identity、rename/delete、quota 和新 store failure 都直接影响用户数据恢复能力。

## 2. 决策状态

### 已锁定决策

- Workspace File History 只覆盖当前 `main`；挂载和 remote/non-local provider 不捕获、不建 store。
- store 位于 Workspace 外，由私有 `historyStoreKey` 定位；不公开路径 hash 或 workspaceId，不被 watcher/Knowledge 捕获。
- 默认策略：60 秒 merge window、单快照 5 MiB、最大年龄 30 天、总存储 500 MiB，并排除噪音目录/文件。
- 同内容/同版本不重复；main 内 rename 延续 timeline；移出 main 只记录 main delete。
- 未发布产品直接建立唯一新 schema，无 migration、旧 Profile 或旧 store discovery。

### 已采用的低影响假设

- SQLite schema/table 名称沿用上游 store 惯例，但只要本 Ticket 的数据与安全不变量保持即可调整内部命名。

### 未决问题

无。

## 3. 范围边界

| IN（本 Ticket 构建） | REUSE（复用且不改变契约） | OUT（明确不做） |
|---|---|---|
| History store/policy/capture/timeline/diff/deleted/retention/quota/query route | ResourceEvent、main scope、baseline observation、upstream fixtures | restore write path/UI/Agent projection、mount/remote History、legacy migration |

## 4. 要构建什么

当 `main` 中符合策略的文本资源发生内部、外部或 reconciliation observation 时，History 读取规范物理版本并保存有界快照。用户查询 timeline/diff/deleted files 会得到相对/opaque identity、origin 和版本，不泄漏 root。相同内容不重复，rename 延续，超限/噪音跳过。初始化失败进入 `FAILED` 并可 retry，但普通 Workspace 仍工作。

## 5. 实现契约

- **入口或接缝：** FileHistoryService logical subscriber、HistoryStore、HistoryCapturePolicy、main-bound query/diff route。
- **输入与输出：** normalized ResourceEvent/baseline diff + main authority → version snapshot/tombstone/timeline/diff 或 policy skip。
- **公共接口变化：** main-bound history query/diff 使用 ResourceRef/relative or opaque key；不接受 raw root/public workspaceId。
- **不变量：** store outside workspace；main only；DB 与 Knowledge 独立；no-content change 不重复；policy budgets deterministic。
- **状态或数据流：** Resource observation → scope/policy → content/version read → private store → query/diff projection。
- **错误与失败行为：** store init/capture/quota failure 进入派生 health，不伪装 Resource mutation 失败；可 scoped retry。
- **兼容要求：** 吸收上游可观察 History 行为；无旧 schema、profile 或 path-hash compatibility。
- **安全与隐私要求：** route authorization、main scope 和 opaque output；runtime DB 不在 Workspace，外部不见绝对路径/正文除授权 diff。

## 6. 执行路线

1. 用上游 store/service/policy tests 加 main/mount/new-store failure cases 建立行为基线。
2. 建立唯一新 HistoryStore schema、private store key 与 deterministic retention/quota。
3. 将 capture 改为 ResourceEvent/shared baseline logical consumer，删除上游 private watcher/baseline ownership。
4. 实现 create/modify/delete/rename/origin/dedupe/timeline/line diff 和 main-only scope。
5. 建立授权 query/diff route 与稳定 init/capture failure/health/retry。
6. 扫描 runtime path、watcher 和 migration code，证明 DB 不被工作区捕获且无 legacy 状态。

## 7. 路径访问契约

- **预计修改点：** History domain、route 和定向 tests。
- **可写范围：** 仅 frontmatter `writable_paths`；production assembly 由 T-12，UI 由 T-16。
- **只读上下文：** Resource/Workspace contracts、Engine、Knowledge、Desktop。
- **共享路径：** 无；本 Ticket 是 File History store/policy/query 唯一 owner。
- **保留或不动：** Knowledge DB/policy、mount providers、Agent correlation、restore effect。

## 8. 验证矩阵

| 行为或风险 | 验证接缝 | 命令或步骤 | 预期结果 | Evidence |
|---|---|---|---|---|
| 正常路径 | store/service integration | capture/create/modify/delete/rename/diff + retention/quota fixtures | main timeline 正确，策略精确生效 | `<Path>{roots.state}/specdev/changes/{change}/evidence/T-13.md</Path>` |
| 失败路径 | scope/init matrix | mount/remote/oversize/noise/store-init failure/retry tests | 不捕获越界；FAILED 可 retry；Workspace 不破坏 | `<Path>{roots.state}/specdev/changes/{change}/evidence/T-13.md</Path>` |
| 回归 | structural/security | private watcher/migration scan + route security tests | 无第二 watcher/store owner，外部无 raw path | `<Path>{roots.state}/specdev/changes/{change}/evidence/T-13.md</Path>` |

## 9. 发布、迁移与恢复

- **迁移顺序：** 新 schema/store → isolated capture → production subscription；无旧数据迁移。
- **兼容窗口：** 无：HanaKDE 未发布，旧 schema/Profile/marker 一律不引入。
- **监控信号：** capture/skip/dedupe counts、store bytes/age、init/capture failures、retry health。
- **回滚或前向恢复：** 失败 store 保持隔离并 scoped retry；代码 Wave 可回退，禁止发现/导入旧数据。
- **不可逆操作与批准点：** retention 删除只按策略且需测试 Evidence；Git integration 仍需授权。
- **收缩条件：** private watcher、legacy schema、mount store 和 duplicate capture 调用点为零。

## 10. 验收标准

- [ ] `AC-005`：挂载功能保持但不捕获、不建 History store。
- [ ] `AC-006`：main create/modify/delete/rename/origin/timeline/diff/dedupe 全部正确。
- [ ] `AC-007`：60 秒、5 MiB、30 天、500 MiB 和 noise policy 可判定通过。
- [ ] `AC-025`：唯一新 store baseline、FAILED/retry 和无 migration 合同通过。
- [ ] `AC-026`：route 绑定授权 main 且不泄漏 raw root。
- [ ] 验证记录到 `<Path>{roots.state}/specdev/changes/{change}/evidence/T-13.md</Path>`。
