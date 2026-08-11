---
schema_version: 3
artifact: ticket
change: 2026-08-09-openhanako-v0-446-6-integration
id: T-16
title: 交付 Workspace History 用户界面
status: in_progress
planning_depth: deep
planning_depth_reason: "UI 串联 deleted files、timeline、diff、restore、health 与安全冲突，并跨 renderer/server contract 和真实用户流程。"
ready: true
risk: high
blocked_by: [T-13, T-15]
contract_ids: [AC-006, AC-007, AC-013, AC-015, AC-016, AC-017, AC-024]
owner: Worker-T-16 / Lead
expected_changes: ["<Path>desktop/src/react/App.tsx</Path>", "<Path>desktop/src/react/components/file-history/**</Path>", "<Path>desktop/src/react/components/right-workspace/RightWorkspacePanel.tsx</Path>", "<Path>desktop/src/react/components/right-workspace/RightWorkspacePanel.module.css</Path>", "<Path>desktop/src/react/stores/index.ts</Path>", "<Path>desktop/src/react/stores/file-history-slice.ts</Path>", "<Path>desktop/src/react/utils/file-history-api.ts</Path>", "<Path>desktop/src/react/utils/line-diff.ts</Path>", "<Path>desktop/src/react/__tests__/components/FileHistoryModal.test.tsx</Path>", "<Path>desktop/src/react/__tests__/components/RightWorkspacePanel.test.tsx</Path>", "<Path>desktop/src/react/__tests__/stores/file-history-slice.test.ts</Path>", "<Path>tests/file-history-production-boundary.test.ts</Path>"]
writable_paths: ["<Path>desktop/src/react/App.tsx</Path>", "<Path>desktop/src/react/components/file-history/**</Path>", "<Path>desktop/src/react/components/right-workspace/RightWorkspacePanel.tsx</Path>", "<Path>desktop/src/react/components/right-workspace/RightWorkspacePanel.module.css</Path>", "<Path>desktop/src/react/stores/index.ts</Path>", "<Path>desktop/src/react/stores/file-history-slice.ts</Path>", "<Path>desktop/src/react/utils/file-history-api.ts</Path>", "<Path>desktop/src/react/utils/line-diff.ts</Path>", "<Path>desktop/src/react/__tests__/components/FileHistoryModal.test.tsx</Path>", "<Path>desktop/src/react/__tests__/components/RightWorkspacePanel.test.tsx</Path>", "<Path>desktop/src/react/__tests__/stores/file-history-slice.test.ts</Path>", "<Path>tests/file-history-production-boundary.test.ts</Path>", "<Path>tests/knowledge-workspace-e2e/specs/file-history-workspace.spec.ts</Path>"]
read_only_paths: ["<Path>lib/file-history/**</Path>", "<Path>server/routes/file-history.ts</Path>", "<Path>desktop/src/react/components/knowledge-workspace/**</Path>", "<Path>desktop/src/react/services/resource-events.ts</Path>"]
shared_paths: []
shared_path_owners: []
---

# Ticket T-16: 交付 Workspace History 用户界面

- **Ticket 文件：** `<Path>{roots.state}/specdev/changes/{change}/ticket/16-deliver-workspace-history-ui.md</Path>`
- **总体 Map：** `<Path>{roots.state}/specdev/changes/{change}/tickets-map.md</Path>`
- **上游 Spec：** `<Path>{roots.state}/specdev/changes/{change}/spec.md</Path>`
- **完成 Evidence：** `<Path>{roots.state}/specdev/changes/{change}/evidence/T-16.md</Path>`

## 1. 战略与来源

- **目标：** 把上游 FileHistoryModal 行为融合进 HanaKDE Workbench，使用户可浏览 main 文件/删除项、版本、diff、策略状态并安全 restore，同时看到统一健康/冲突反馈。
- **可观察产出：** Workspace 入口提供可键盘访问的 History 流程；stale/root failure 不覆盖内容；restore 后编辑/预览/Search 状态刷新且无 shadow truth。
- **来源：** `US-003`、`US-009`、`AC-006`、`AC-007`、`AC-013`、`AC-015`—`AC-017`、`AC-024`、`DEC-015`。
- **当前事实：** 冻结上游已有 FileHistoryModal/store/API 先例；HanaKDE 有 Workbench、Knowledge editor、localization、keyboard/ARIA/theme/narrow layout contracts。
- **Planning Depth 原因：** restore 是高风险交互，UI 还必须正确处理异步 query、stale response、health 和多读面收敛。

## 2. 决策状态

### 已锁定决策

- Workspace History 入口只表示当前 `main`，不展示挂载 History、不接受 raw root。
- UI 请求 restore 时必须发送显示时的 expected current version，并明确呈现 conflict/security failure。
- query/loading/cancellation/stale response 使用上游修复后的单一 lifecycle；UI 不缓存第二份文件事实。
- 保持现有 zh/en 文案、键盘、ARIA、主题和窄布局合同；按钮使用现有 icon system。

### 已采用的低影响假设

- 入口在整合后现有 Workbench 文件/预览操作菜单中落位，具体组件挂点以 T-09 后 UI 结构为准。

### 未决问题

无。

## 3. 范围边界

| IN（本 Ticket 构建） | REUSE（复用且不改变契约） | OUT（明确不做） |
|---|---|---|
| Workspace History entry/modal, files/deleted/timeline/diff/restore/health states, component/E2E tests | T-13 query/diff、T-15 restore、Workbench design system | Agent conversation filtering、mount History、UI-side filesystem truth |

## 4. 要构建什么

用户从当前 main 文件或 Workbench 入口打开 History，切换现有/删除文件，选择版本并查看 line diff。restore 前 UI 携带 current version；成功后等待统一事件收敛，冲突或 health failure 显示可操作反馈与 retry。切换 main 或关闭 modal 会取消旧 query，旧响应不得覆盖新 scope。

## 5. 实现契约

- **入口或接缝：** Workbench command/menu、FileHistoryModal store/API、resource event refresh、localized error presenter。
- **输入与输出：** current main + selected resource/version + expected current version → timeline/diff/restore state and visible feedback。
- **公共接口变化：** 无新的 server 语义；renderer client 只包装 T-13/T-15 main-bound DTO。
- **不变量：** scope change cancels/invalidates requests；stale response ignored；restore never omits expected version；UI no shadow file truth。
- **状态或数据流：** open main-bound modal → query → select/diff → restore preflight → event-driven refresh/health。
- **错误与失败行为：** loading/cancel/empty/deleted/conflict/security/FAILED 均有稳定可访问状态；失败不乐观覆盖 preview。
- **兼容要求：** 保留 Workbench/Knowledge UI、localization、keyboard、ARIA、theme 和 narrow layout。
- **安全与隐私要求：** UI 不接收/显示 absolute root、store key 或 scope token；diff 仅在已授权请求后呈现。

## 6. 执行路线

1. 扩展上游组件测试，先覆盖 main scope、deleted/diff、stale query、restore conflict 和 health retry。
2. 将 File History client/store 绑定当前 main opaque contracts，并实现 cancellation/stale response guard。
3. 融合 modal 与 Workbench 入口，完成 timeline/diff/deleted/restore/loading/empty/error 状态。
4. 接入 event-driven refresh 和四态 health，不添加文件 shadow cache。
5. 验证 localization、keyboard、ARIA、theme 与窄布局，修复布局/焦点回归。
6. 由当前 Ticket 实现 owner 运行 Playwright 直接用户流程并保存 trace/screenshot Evidence。

## 7. 路径访问契约

- **预计修改点：** File History UI/store/API/diff 与定向测试。
- **可写范围：** 仅 frontmatter `writable_paths`；History domain、route 和 Knowledge UI 只读。
- **只读上下文：** backend contracts、Workbench/Knowledge patterns、resource events。
- **共享路径：** 无；Agent product entry 在 T-17 复用但不修改本 Ticket 路径。
- **保留或不动：** Agent filtering、mount behavior、server domain 和 UI-wide refactor。

## 8. 验证矩阵

| 行为或风险 | 验证接缝 | 命令或步骤 | 预期结果 | Evidence |
|---|---|---|---|---|
| 正常路径 | component integration | FileHistoryModal tests for file/deleted/timeline/diff/restore | 可观察状态与 backend contract 对齐 | `<Path>{roots.state}/specdev/changes/{change}/evidence/T-16.md</Path>` |
| 失败路径 | async/security UI | stale/cancel/conflict/root/FAILED/retry component tests | 旧响应不覆盖；失败清晰且不改内容 | `<Path>{roots.state}/specdev/changes/{change}/evidence/T-16.md</Path>` |
| 回归 | UI contract suite | localization/keyboard/ARIA/theme/narrow layout + typecheck | Workbench 相邻体验保持 | `<Path>{roots.state}/specdev/changes/{change}/evidence/T-16.md</Path>` |
| E2E（owner：当前 Ticket 实现 owner） | Playwright direct flow | 打开 History → diff → restore → 观察 Preview/Search | 真实用户流程一致收敛，无挂载 History | `<Path>{roots.state}/specdev/changes/{change}/evidence/T-16.md</Path>` |

## 9. 发布、迁移与恢复

- **迁移顺序：** client contract → component states → Workbench entry → E2E；无数据迁移。
- **兼容窗口：** 无旧 UI/legacy DTO 兼容壳。
- **监控信号：** query cancellation/stale discard、restore conflicts、health/retry、UI error presentation。
- **回滚或前向恢复：** UI Wave 可回退到无入口状态，但 backend owner 保持单一；不得启用第二 client/store。
- **不可逆操作与批准点：** restore 由用户明确确认且可反悔；Git integration 需批准。
- **收缩条件：** 旧 File History UI/API wrapper、raw-root 请求和 shadow cache 调用点为零。

## 10. 验收标准

- [ ] `AC-006`/`AC-007`：timeline/deleted/diff 与策略状态可正确查看。
- [ ] `AC-013`：四态 health 与 scoped retry 清晰可用。
- [ ] `AC-015`—`AC-017`：restore 携带 expected version，冲突安全，成功后读面一致。
- [ ] `AC-024`：Workspace 入口语义独立、异步 lifecycle 正确、无 UI shadow truth。
- [ ] Component/E2E/a11y Evidence 记录到 `<Path>{roots.state}/specdev/changes/{change}/evidence/T-16.md</Path>`。

## 11. 偏差 D-T16-01：全局 store 与 modal host 接入

- **等级：** ticket；`status=approved`。
- **触发事实：** 已交付的 `FileHistoryEntryButton` 调用全局 `useStore` 的 `openFileHistoryModal`，但 `<Path>desktop/src/react/stores/index.ts</Path>` 未组合 T-16 slice；同时生产 React 树没有挂载 `FileHistoryModal`。点击现有 Agent History 入口会调用缺失 action，且即使打开状态存在也没有 modal host。
- **受影响路径：** 新增授权 `<Path>desktop/src/react/App.tsx</Path>`、`<Path>desktop/src/react/stores/index.ts</Path>`、`<Path>desktop/src/react/__tests__/stores/file-history-slice.test.ts</Path>` 与 `<Path>tests/file-history-production-boundary.test.ts</Path>`；保留原 T-16 组件/API/E2E 路径。
- **选项：** 保持 fixed skip 会让 AC-006/AC-017/AC-024 无生产入口；插件化无法表达全局 store/顶层 modal 生命周期；推荐在 renderer 系统本体完成最小宿主接入。
- **批准：** Root Lead，2026-08-11T19:04:48+0800；仅组合既有 T-16 slice、挂载单一 main-only modal host、更新边界/store 回归并启用现有 E2E。禁止新增 server 语义、mount History、raw path、第二 store/cache 或修改 History/ResourceIO 内核。
- **处理结果：** 待实现与 Evidence 回写；完成前 T-16 状态恢复为 `in_progress`。

## 12. 偏差 D-T16-02：Workbench 可见入口接入

- **等级：** ticket；`status=approved`。
- **触发事实：** D-T16-01 已组合 store 并挂载全局 modal，但生产入口仍只存在于要求严格 Agent correlation envelope 的消息投影；普通 Workbench 没有可见入口，T-16 owner E2E 仍无法从用户界面打开 History。
- **受影响路径：** 新增授权 `<Path>desktop/src/react/components/right-workspace/RightWorkspacePanel.tsx</Path>`、`<Path>desktop/src/react/components/right-workspace/RightWorkspacePanel.module.css</Path>` 与 `<Path>desktop/src/react/__tests__/components/RightWorkspacePanel.test.tsx</Path>`；继续使用已授权的 File History 组件和 E2E 路径。
- **选项：** 依赖 Agent 投影会错误耦合 Workspace 与 conversation correlation；浮动全局按钮不符合现有 Workbench 信息架构；推荐在已有 workspace header 工具区挂载同一个 main-only entry。
- **批准：** Root Lead，2026-08-11T19:11:30+0800；仅增加 main-only、可访问、固定尺寸的 Workbench History 命令及交互回归。禁止新增 route、mount History、raw path、第二 store/cache 或修改 History/ResourceIO 内核。
- **处理结果：** 待实现与 E2E/Evidence 回写；完成前 T-16 保持 `in_progress`。
