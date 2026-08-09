---
schema_version: 3
artifact: ticket
change: 2026-08-09-openhanako-v0-446-6-integration
id: T-09
title: 整合冻结目标 v0.446.6
status: in_progress
planning_depth: deep
planning_depth_reason: "最终上游 checkpoint 约含 11 个提交、51 个文件和 18 个 overlap，并决定目标 SHA ancestry 与完整上游功能基线。"
ready: true
risk: critical
blocked_by: [T-08]
contract_ids: [AC-001, AC-002, AC-003]
owner: Worker-T-09 / Lead
expected_changes: ["<Path>**</Path>"]
writable_paths: ["<Path>**</Path>"]
read_only_paths: []
shared_paths: []
shared_path_owners: []
---

# Ticket T-09: 整合冻结目标 v0.446.6

- **Ticket 文件：** `<Path>{roots.state}/specdev/changes/{change}/ticket/09-integrate-v0-446-6.md</Path>`
- **总体 Map：** `<Path>{roots.state}/specdev/changes/{change}/tickets-map.md</Path>`
- **上游 Spec：** `<Path>{roots.state}/specdev/changes/{change}/spec.md</Path>`
- **完成 Evidence：** `<Path>{roots.state}/specdev/changes/{change}/evidence/T-09.md</Path>`

## 1. 战略与来源

- **目标：** 从 `v0.444.1` 达到冻结 target `v0.446.6` / `5f08a4f30203abb61dafac7dbb7ab92d11c23efa`，完整建立后续架构收敛的上游代码基线。
- **可观察产出：** target commit 是 checkpoint HEAD ancestor；Memory Dream、compaction menu、Markdown bare URL 及关联 settings/persistence/build 正常，HanaKDE 核心合同保持。
- **来源：** `US-001`、`US-012`、`AC-001`—`AC-003`、`ADR-001`、`DEC-001`、`DEC-011`。
- **当前事实：** 规划增量约 11 commits、51 files、18 overlaps；本地 target object 已解析到冻结 SHA。
- **Planning Depth 原因：** 最终 target ancestry、关键上游功能和整仓共享路径在此汇合，是后续所有产品 Ticket 的硬前置。

## 2. 决策状态

### 已锁定决策

- 只使用冻结 SHA，不追浮动分支。
- Memory Dream、compaction、Markdown、settings、persistence、runtime、安全和 build 的正常迭代全盘接受。
- HanaKDE Knowledge/Resource/Transfer/Workbench 保留；同用途基础设施在 T-10 以后一次性收敛，不保留长期兼容壳。
- T-09 是删除未发布 legacy migration production owner 的唯一 owner：在 target merge 后移除 session-manifest legacy scan/startup migration、其 marker/ledger/retry/checkpoint/rollback 支撑面、Win32 legacy sandbox migration/cleanup queue 以及只服务这些 owner 的脚本、export/closure 条目和测试；当前 SessionManifest store/resolver、Resource 与 Win32 安全运行时仅在不承担 legacy migration 时保留。

### 已采用的低影响假设

- 上游功能的具体定向测试以合并后存在的脚本和测试文件为准，Map 中的行为合同不因文件重命名变化。

### 未决问题

无。

## 3. 范围边界

| IN（本 Ticket 构建） | REUSE（复用且不改变契约） | OUT（明确不做） |
|---|---|---|
| `v0.444.1..5f08a4f` merge、上游功能回归、target audit、最小语义适配、未发布 legacy migration owner 删除 | T-08 checkpoint、现有 HanaKDE 合同 | T-10 以后架构收敛、最终平台/umbrella Gate、push/release、任何 legacy migration/compat 保留 |

## 4. 要构建什么

用户和维护者获得冻结 `v0.446.6` 的完整功能基线，而不是只得到一个“冲突已解”的仓库。每项上游正常变化有行为证据，HanaKDE 二开合同继续成立，后续 Ticket 可直接在该 ancestry 上完成去冗余融合。

## 5. 实现契约

- **入口或接缝：** 经授权 staged merge、target ancestry、上游 feature tests、HanaKDE contract union。
- **输入与输出：** T-08 checkpoint + 冻结 SHA → target-integrated checkpoint。
- **公共接口变化：** 接受冻结 target 的正常上游接口；Spec 锁定的 Resource/Workspace/Knowledge 外部语义不变。
- **不变量：** target SHA 精确；无浮动分支；无生产双 owner；无 legacy migration/marker/ledger/retry/checkpoint/rollback production owner；不删除 HanaKDE 产品/安全合同。
- **状态或数据流：** verify target → merge → classify/adapt → regenerate → feature regression → target audit。
- **错误与失败行为：** SHA/tag 不匹配、上游关键功能失败或 HanaKDE 回归时停止，不开放 T-10。
- **兼容要求：** 不保留旧内部实现兼容壳；上游正常外部行为完整吸收。
- **安全与隐私要求：** 安全修复默认吸收，Resource authority/Root Identity 边界不得降级。

## 6. 执行路线

1. 复核 T-08 checkpoint 与 frozen target SHA，确认最终 merge 授权。
2. staged merge target，冻结 overlap、generated、dependency 和 semantic conflict 清单。
3. 按权威分类裁决，完整吸收正常上游功能并保护 HanaKDE 合同。
4. 在 target 代码已吸收后，删除未发布 legacy migration production owner 和仅服务其的 marker/ledger/retry/checkpoint/rollback、Win32 cleanup queue、脚本/manifest/closure 条目与测试；保留当前非迁移 SessionManifest/Resource/Win32 安全职责，并添加 retained-owner/marker 反向扫描。
5. 先解决 `<Path>package.json</Path>` 等源配置，再重建 lock/generated 输出并执行 clean install 验证。
6. 运行 Memory Dream、compaction、Markdown、settings/persistence/build、legacy-owner reverse scan 与 HanaKDE 核心合同。
7. 经 commit 授权形成 checkpoint，证明 target ancestry 并发布后续收敛输入 inventory。

## 7. 路径访问契约

- **预计修改点：** `<Path>**</Path>`，由 target merge index 固定。
- **可写范围：** `<Path>**</Path>`，限最终 release 增量和最小适配。
- **只读上下文：** 无额外范围。
- **共享路径：** 无；与 staged chain 串行，后续均依赖 T-09。
- **保留或不动：** 用户未提交修改、远程 refs、未获批 push/release。

## 8. 验证矩阵

| 行为或风险 | 验证接缝 | 命令或步骤 | 预期结果 | Evidence |
|---|---|---|---|---|
| 正常路径 | frozen ancestry/features | `git merge-base --is-ancestor 5f08a4f30203abb61dafac7dbb7ab92d11c23efa HEAD` 加上游定向测试 | target ancestor 且关键功能可用 | `<Path>{roots.state}/specdev/changes/{change}/evidence/T-09.md</Path>` |
| 失败路径 | target/feature gate | 检查 SHA mismatch、未裁决冲突、关键功能失败 | 任一存在即停止 | `<Path>{roots.state}/specdev/changes/{change}/evidence/T-09.md</Path>` |
| 失败路径 | legacy-owner reverse scan | 注入或保留 legacy migration import、marker、ledger、retry、checkpoint/rollback 或 Win32 cleanup queue | 任一 retained owner 必须失败 | `<Path>{roots.state}/specdev/changes/{change}/evidence/T-09.md</Path>` |
| 回归 | HanaKDE contract union | Resource、Knowledge、Transfer、安全、Workbench 与 open boundary gates | 二开能力无回退 | `<Path>{roots.state}/specdev/changes/{change}/evidence/T-09.md</Path>` |

## 9. 发布、迁移与恢复

- **迁移顺序：** staged chain 的最终 Git checkpoint；无用户数据迁移。
- **兼容窗口：** 无：未发布产品直接建立新基线。
- **监控信号：** frozen ancestry、feature test、contract union、clean install/build 和 audit completeness。
- **回滚或前向恢复：** commit 前 abort；commit 后经授权回到 T-08 或前向修复；不得临时双运行。
- **不可逆操作与批准点：** merge/commit/tag/push/release 分别需用户明确授权。
- **收缩条件：** target ancestry 成立、冲突为零、关键上游行为和 HanaKDE 合同均有 Evidence。

## 10. 验收标准

- [ ] `AC-001`：冻结 target 是 checkpoint HEAD ancestor，staged audit 完整。
- [ ] `AC-002`：Memory Dream、compaction、Markdown 与关联上游行为通过。
- [ ] `AC-003`：HanaKDE Knowledge、Resource、Transfer、安全和 Workbench 无回退。
- [ ] 未发布 legacy migration production owner、marker/ledger/retry/checkpoint/rollback 与 Win32 legacy cleanup queue 已删除，反向扫描为绿。
- [ ] 验证矩阵记录到 `<Path>{roots.state}/specdev/changes/{change}/evidence/T-09.md</Path>`。
- [ ] 没有浮动 target、未批准 Git 副作用或长期兼容壳。
