---
schema_version: 3
artifact: ticket
change: 2026-08-09-openhanako-v0-446-6-integration
id: T-17
title: 交付 Agent 对话文件变化投影
status: in_progress
planning_depth: deep
planning_depth_reason: "对话/操作相关性、main 共享版本与挂载边界跨 Agent runtime、renderer 与安全 restore，同时必须避免第二历史事实源。"
ready: true
risk: high
blocked_by: [T-15, T-16]
contract_ids: [AC-008, AC-015, AC-016, AC-017, AC-024]
owner: Worker-T-17
expected_changes: ["<Path>shared/workspace-history.ts</Path>", "<Path>desktop/src/react/services/file-change-events.ts</Path>", "<Path>desktop/src/react/utils/history-builder.ts</Path>", "<Path>desktop/src/react/components/chat/**</Path>", "<Path>desktop/src/react/stores/agent-activity-slice.ts</Path>"]
writable_paths: ["<Path>shared/workspace-history.ts</Path>", "<Path>desktop/src/react/services/file-change-events.ts</Path>", "<Path>desktop/src/react/utils/history-builder.ts</Path>", "<Path>desktop/src/react/components/chat/**</Path>", "<Path>desktop/src/react/stores/agent-activity-slice.ts</Path>", "<Path>desktop/src/react/__tests__/utils/history-builder*.test.ts</Path>", "<Path>tests/agent-file-change-projection.test.ts</Path>", "<Path>tests/knowledge-workspace-e2e/specs/agent-file-changes.spec.ts</Path>"]
read_only_paths: ["<Path>lib/file-history/**</Path>", "<Path>server/routes/file-history.ts</Path>", "<Path>desktop/src/react/components/file-history/**</Path>", "<Path>lib/resource-io/**</Path>"]
shared_paths: []
shared_path_owners: []
---

# Ticket T-17: 交付 Agent 对话文件变化投影

- **Ticket 文件：** `<Path>{roots.state}/specdev/changes/{change}/ticket/17-deliver-agent-file-change-projection.md</Path>`
- **总体 Map：** `<Path>{roots.state}/specdev/changes/{change}/tickets-map.md</Path>`
- **上游 Spec：** `<Path>{roots.state}/specdev/changes/{change}/spec.md</Path>`
- **完成 Evidence：** `<Path>{roots.state}/specdev/changes/{change}/evidence/T-17.md</Path>`

## 1. 战略与来源

- **目标：** 保留 Agent 对话/操作相关文件变化的产品入口，并对 `main` 内资源复用唯一 File History timeline/diff/restore；挂载只显示 Agent 影响，不扩大 Workspace History capture。
- **可观察产出：** 用户在当前 conversation/operation 中只看到相关文件影响，能对 main 项查看共享 diff/restore，且系统没有 session store、watcher 或第二写入通道。
- **来源：** `US-004`、`US-006`、`AC-008`、`AC-015`—`AC-017`、`AC-024`、`ADR-003`、`ADR-006`。
- **当前事实：** HanaKDE 已有 workspace/agent history projection 与 file change event service；上游提供 Workspace File History UI/service。
- **Planning Depth 原因：** 两种历史产品 scope 必须精确分离，同时共享敏感 restore/diff primitive 且不扩展 capture authority。

## 2. 决策状态

### 已锁定决策

- Agent 入口按 conversation/operation correlation 过滤文件影响；Workspace 入口按 main resource timeline。
- main 内可关联到共享 History version/diff/restore；挂载/remote 只保留既有 Agent operation record，不建物理 History。
- projection 不拥有 watcher、store、baseline 或写入；只消费 Agent activity/correlation 与 Resource/History facts。
- restore 使用 T-15 同一 expected-version 和 security contract，不创建 Agent 专用 restore route。

### 已采用的低影响假设

- 现有 activity origin/correlation 可 additive 关联 opaque History version；没有 version 时只呈现操作影响。

### 未决问题

无。

## 3. 范围边界

| IN（本 Ticket 构建） | REUSE（复用且不改变契约） | OUT（明确不做） |
|---|---|---|
| conversation/operation filter、main history link、shared diff/restore entry、mount fallback、UI tests | T-15 restore、T-16 History components/client、Agent activity events | session history store、mount capture、Agent watcher/direct write |

## 4. 要构建什么

用户打开某次 Agent 对话的文件变化，projection 从对话/操作 correlation 构建影响列表。main 内项目解析到共享 History version，可打开同一 diff/restore；挂载项仍可识别为 Agent 操作影响但没有 Workspace History action。切换会话或 main 后旧 projection 失效，不泄漏其他 scope。

## 5. 实现契约

- **入口或接缝：** Agent activity projection、file-change-events、history-builder、shared History modal/client。
- **输入与输出：** conversation/operation ids + correlated ResourceRefs/events → filtered impact items + optional main History link。
- **公共接口变化：** additive opaque history linkage only；不新增 Agent restore route、raw root 或 workspaceId。
- **不变量：** correlation filter first；main scope proof required for History link；mount never captured；no watcher/store/write owner。
- **状态或数据流：** Agent activity + Resource correlation → projection → optional History query/diff/restore → event convergence。
- **错误与失败行为：** missing/stale correlation 显示无共享版本而非猜测；scope change invalidates results；restore failure沿用统一反馈。
- **兼容要求：** 保留既有 Agent operation record semantics；不把 Workspace timeline 强制投影到所有 Agent items。
- **安全与隐私要求：** conversation scope isolation；opaque refs；挂载/其他 main 不泄漏版本、路径或内容。

## 6. 执行路线

1. 用 main/mount/multi-conversation/stale-main fixtures 固定 projection 红色合同。
2. 扩展 activity correlation 与 history-builder，生成 optional opaque main History link。
3. 在 Agent chat entry 中复用 T-16 diff/restore UI，不复制 client/store/domain。
4. 对 mount/remote/无版本项保留 operation impact 视图并禁用 Workspace History action。
5. 覆盖 scope invalidation、restore conflict、event convergence 和 no-duplicate-owner structure scan。
6. 由当前 Ticket 实现 owner 运行 Agent direct-flow E2E 并记录 trace。

## 7. 路径访问契约

- **预计修改点：** Agent history projection/service/chat UI 与定向 tests。
- **可写范围：** 仅 frontmatter `writable_paths`；History domain/components 和 Resource Kernel 只读复用。
- **只读上下文：** shared History、restore、Resource authority。
- **共享路径：** 无；依赖 T-16 后消费，不修改其 owner 路径。
- **保留或不动：** Workspace History scope、mount provider、Agent execution core。

## 8. 验证矩阵

| 行为或风险 | 验证接缝 | 命令或步骤 | 预期结果 | Evidence |
|---|---|---|---|---|
| 正常路径 | projection/component tests | main correlated changes + shared diff/restore | 只显示当前对话影响并复用 History | `<Path>{roots.state}/specdev/changes/{change}/evidence/T-17.md</Path>` |
| 失败路径 | scope/security matrix | mount、other conversation、stale main、missing version | 不扩大 capture/不泄漏；无猜测 restore | `<Path>{roots.state}/specdev/changes/{change}/evidence/T-17.md</Path>` |
| 回归 | structural/Agent suite | watcher/store/route duplication scan + activity tests | 既有 Agent records 保持，duplicate owner 为零 | `<Path>{roots.state}/specdev/changes/{change}/evidence/T-17.md</Path>` |
| E2E（owner：当前 Ticket 实现 owner） | Playwright Agent flow | 运行一次 Agent 修改 → 打开 changes → diff/restore | correlation 正确，restore 后读面一致 | `<Path>{roots.state}/specdev/changes/{change}/evidence/T-17.md</Path>` |

## 9. 发布、迁移与恢复

- **迁移顺序：** projection contract → main linkage → UI reuse → E2E；不迁移对话数据。
- **兼容窗口：** additive correlation 可被旧 consumer 忽略；无第二 History 兼容期。
- **监控信号：** projection item/link counts、scope invalidation、restore conflicts、missing-version rate。
- **回滚或前向恢复：** 可移除 Agent shared History entry 而不改变唯一 backend；禁止恢复 session store/watcher。
- **不可逆操作与批准点：** restore 仍由用户明确动作且可反悔；Git integration 需批准。
- **收缩条件：** Agent 专用 store/watcher/restore route/direct write 调用点为零。

## 10. 验收标准

- [ ] `AC-008`：按 conversation/operation 过滤，main 复用版本，mount 不扩大 History。
- [ ] `AC-015`—`AC-017`：复用统一安全 restore 并最终一致。
- [ ] `AC-024`：Agent 与 Workspace 入口语义分离、底层共享、无 shadow truth。
- [ ] Component/E2E/structure Evidence 记录到 `<Path>{roots.state}/specdev/changes/{change}/evidence/T-17.md</Path>`。
- [ ] 修改范围未越过 `writable_paths`。
