---
schema_version: 3
artifact: ticket
change: 2026-08-09-openhanako-v0-446-6-integration
id: T-15
title: 交付安全 restore 与全读面收敛
status: ready
planning_depth: deep
planning_depth_reason: "restore 会覆盖用户文件，跨 ResourceIO、History、Knowledge、Preview、Search 与 Agent Read，涉及 TOCTOU 和数据完整性。"
ready: true
risk: critical
blocked_by: [T-12, T-13, T-14]
contract_ids: [AC-015, AC-016, AC-017, AC-026]
owner: unassigned
expected_changes: ["<Path>lib/file-history/**</Path>", "<Path>server/routes/file-history.ts</Path>", "<Path>core/knowledge-workspace/**</Path>", "<Path>desktop/src/react/utils/preview-document-refresh.ts</Path>", "<Path>tests/file-history-*.test.ts</Path>", "<Path>tests/knowledge-*.test.ts</Path>"]
writable_paths: ["<Path>lib/file-history/**</Path>", "<Path>server/routes/file-history.ts</Path>", "<Path>core/knowledge-workspace/**</Path>", "<Path>desktop/src/react/utils/preview-document-refresh.ts</Path>", "<Path>tests/file-history-*.test.ts</Path>", "<Path>tests/knowledge-*.test.ts</Path>"]
read_only_paths: ["<Path>lib/resource-io/**</Path>", "<Path>core/workspace-runtime/**</Path>", "<Path>core/engine.ts</Path>", "<Path>desktop/src/react/components/**</Path>"]
shared_paths: []
shared_path_owners: []
---

# Ticket T-15: 交付安全 restore 与全读面收敛

- **Ticket 文件：** `<Path>{roots.state}/specdev/changes/{change}/ticket/15-deliver-secure-restore-convergence.md</Path>`
- **总体 Map：** `<Path>{roots.state}/specdev/changes/{change}/tickets-map.md</Path>`
- **上游 Spec：** `<Path>{roots.state}/specdev/changes/{change}/spec.md</Path>`
- **完成 Evidence：** `<Path>{roots.state}/specdev/changes/{change}/evidence/T-15.md</Path>`

## 1. 战略与来源

- **目标：** 通过唯一 ResourceIO write path 实现带 expected-current-version 与 effect 前 scope proof 的 restore，并让 Disk、Preview、History、Knowledge、Search 和 Agent Read 收敛。
- **可观察产出：** 合法 restore 可反悔；过期版本、root replacement 或越界请求稳定拒绝且磁盘不变；成功后所有读取面显示同一内容。
- **来源：** `US-003`、`US-005`、`US-006`、`US-011`、`AC-015`—`AC-017`、`AC-026`、`ADR-003`、`ADR-005`、`ADR-007`。
- **当前事实：** 上游有 History restore route/service 先例；HanaKDE ResourceIO/Root Identity/Knowledge/Preview/Agent Read 提供更完整 authority 与收敛链。
- **Planning Depth 原因：** 覆盖用户文件是高事故操作，且 TOCTOU 和跨 read model convergence 必须端到端验证。

## 2. 决策状态

### 已锁定决策

- restore 必须携带 expected current version，并在 effect 前重新证明 main root、resource scope 和 current version。
- 写盘只经 ResourceIO，origin/correlation 为 `history_restore`；restore 生成一个可再次恢复的新版本。
- stale/root replacement/unknown/越界时拒绝且当前磁盘内容不变。
- 成功 mutation 通过 ResourceEventBus 驱动所有 read models；不得从 route 逐个直接刷新或维护 shadow truth。

### 已采用的低影响假设

- 版本 token 的具体编码沿用 History/Resource 当前 opaque version contract，外部只比较不解释。

### 未决问题

无。

## 3. 范围边界

| IN（本 Ticket 构建） | REUSE（复用且不改变契约） | OUT（明确不做） |
|---|---|---|
| restore domain/route、expected version、TOCTOU revalidation、EventBus convergence、recoverable restore snapshot | T-10 ResourceIO/Root Identity、T-13 History、T-14 Knowledge repair | UI modal、mount/remote History、direct DB writes、legacy migration |

## 4. 要构建什么

用户从 timeline 选择旧版本并提交当时看到的 current version。服务在写入前重查 authority、root identity、scope 和 version；任一变化都返回可识别冲突/安全失败且不写盘。合法请求经 ResourceIO 提交一条 `history_restore` mutation，新 History current version可反悔，并最终让 Preview、Knowledge、Search 与 Agent Read 一致。

## 5. 实现契约

- **入口或接缝：** main-bound History restore route/domain、ResourceIO conditional write、ResourceEventBus convergence tests。
- **输入与输出：** authorized resource key + target history version + expected current version → restored version/correlation or typed conflict/security failure。
- **公共接口变化：** restore request/response 使用 opaque resource/version，不接受 raw root/public workspaceId。
- **不变量：** effect preflight immediately precedes write；single write path；restore snapshot recoverable；read models derive from event not route callbacks。
- **状态或数据流：** select version → reauthorize/revalidate → conditional ResourceIO write → event → History/Knowledge/UI/Agent projections。
- **错误与失败行为：** stale/TOCTOU/scope/root fail without disk change；post-write subscriber failure 保留成功 mutation并进入 DEGRADED/repair。
- **兼容要求：** 不支持旧无 expected-version restore 或 path-root payload；未发布基线直接使用最终 contract。
- **安全与隐私要求：** authorization/effect-time proof、防 symlink/junction swap、external response 无 absolute path/content leak。

## 6. 执行路线

1. 用 stale version、root replacement、symlink/junction swap 和 success round-trip 建立红色合同。
2. 定义 main-bound opaque restore DTO 与 typed conflict/security failures。
3. 将 restore 实现为 ResourceIO conditional write + `history_restore` correlation，删除 direct fs/DB write。
4. 确保 mutation 先形成可恢复 History version，再由统一事件驱动 Knowledge/Preview/Search/Agent convergence。
5. 注入 subscriber failure/gap，验证 DEGRADED → RECONCILING → HEALTHY/FAILED 与 scoped retry。
6. 运行端到端一致性断言和 direct-refresh/shadow-truth 结构 scan。

## 7. 路径访问契约

- **预计修改点：** restore History domain/route、Knowledge convergence bridge、Preview refresh 与 tests。
- **可写范围：** 仅 frontmatter `writable_paths`；Resource Kernel 和 workspace owner 只读。
- **只读上下文：** Kernel、workspace runtime、Engine 与 UI components。
- **共享路径：** 无；依赖 T-12/T-13/T-14 后串行汇合。
- **保留或不动：** History UI、Agent filter UI、Office/Extraction、mount resources。

## 8. 验证矩阵

| 行为或风险 | 验证接缝 | 命令或步骤 | 预期结果 | Evidence |
|---|---|---|---|---|
| 正常路径 | restore E2E integration | B → restore A → wait convergence | disk/preview/history/knowledge/search/agent read = A；restore 可反悔 | `<Path>{roots.state}/specdev/changes/{change}/evidence/T-15.md</Path>` |
| 失败路径 | TOCTOU/security matrix | stale version、root replace、scope escape、subscriber failure | pre-write failures磁盘不变；post-write failure可见且repair | `<Path>{roots.state}/specdev/changes/{change}/evidence/T-15.md</Path>` |
| 回归 | route/structural suite | History/Resource/Knowledge tests + direct fs/direct refresh scan | 既有合同绿色，唯一写入/事件路径 | `<Path>{roots.state}/specdev/changes/{change}/evidence/T-15.md</Path>` |

## 9. 发布、迁移与恢复

- **迁移顺序：** route/domain contract → isolated conditional write → production event convergence；无 legacy restore migration。
- **兼容窗口：** 无：旧无 version/raw path request 不支持。
- **监控信号：** restore conflicts/security rejects、correlation ids、consumer lag/gap、health transitions。
- **回滚或前向恢复：** 每次成功 restore 本身创建可反悔版本；代码恢复遵守 stop-then-start，不双写。
- **不可逆操作与批准点：** restore 是用户明确动作且可反悔；任何破坏性 cleanup 不在范围，Git integration 需授权。
- **收缩条件：** direct filesystem restore、route fan-out refresh 和无 expected-version 调用点为零。

## 10. 验收标准

- [ ] `AC-015`：合法 restore 只经 ResourceIO，带 correlation 且产生可反悔版本。
- [ ] `AC-016`：stale/root/scope/TOCTOU 请求拒绝且磁盘不变。
- [ ] `AC-017`：所有六个读取面最终一致。
- [ ] `AC-026`：restore route 不接受 raw root/public workspaceId 且不泄漏绝对路径。
- [ ] 验证与结构 scan 记录到 `<Path>{roots.state}/specdev/changes/{change}/evidence/T-15.md</Path>`。
