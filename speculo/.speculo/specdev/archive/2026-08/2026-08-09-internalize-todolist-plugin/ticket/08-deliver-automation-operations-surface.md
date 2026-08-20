---
schema_version: 3
artifact: ticket
change: 2026-08-09-internalize-todolist-plugin
id: T-08
title: 交付 Automation 运营界面
status: done
planning_depth: standard
planning_depth_reason: 基于已锁定 Run 协议新增跨 route 与 React Page 的运营工作流，不再改变公共宿主接口或核心持久 schema。
ready: true
risk: medium
blocked_by: [T-07]
contract_ids: [AC-020, AC-021, AC-022, AC-029, AC-031]
owner: implementation-owner
expected_changes: ["<Path>plugins/todolist/src/**</Path>", "<Path>plugins/todolist/assets/**</Path>", "<Path>plugins/todolist/tests/automation-page.integration.test.ts</Path>", "<Path>plugins/todolist/tests/e2e/automation-operations.spec.ts</Path>"]
writable_paths: ["<Path>plugins/todolist/**</Path>"]
read_only_paths: ["<Path>core/plugin-context.ts</Path>", "<Path>tests/plugin-ui-capabilities.test.ts</Path>", "<Path>temp/HanaKDE-TodoList-0.0.5-workbench-source-audited-final/src/ui/**</Path>"]
shared_paths: []
shared_path_owners: []
---

# Ticket T-08: 交付 Automation 运营界面

- **Ticket 文件：** `<Path>{roots.state}/specdev/changes/2026-08-09-internalize-todolist-plugin/ticket/08-deliver-automation-operations-surface.md</Path>`
- **总体 Map：** `<Path>{roots.state}/specdev/changes/2026-08-09-internalize-todolist-plugin/tickets-map.md</Path>`
- **上游 Spec：** `<Path>{roots.state}/specdev/changes/2026-08-09-internalize-todolist-plugin/spec.md</Path>`
- **完成 Evidence：** `<Path>{roots.state}/specdev/changes/2026-08-09-internalize-todolist-plugin/evidence/T-08.md</Path>`

## 1. 战略与来源

- **目标：** 把 T-07 的运行与取消协议做成可扫描、可行动、不会误导用户的 Automation 运营表面。
- **可观察产出：** 用户可按运行状态筛选，查看最小诊断，执行合法 retry/cancel，并在宿主具备打开能力时导航到权威 Hana Session；当前能力不足时显示稳定 sessionRef/sessionId、复制入口和最近结果。Todo 详情只显示最近摘要。
- **来源：** US-008、US-009，AC-020～022、AC-029、AC-031，D-023、D-025，NFR-004。
- **当前事实：** T-07 提供稳定 Run actions/projections，但尚无完整运营页面；参考实现的大型内联 DOM/CSS 和日志堆叠存在交互问题，不得复制。
- **Planning Depth 原因：** 这是跨 route、query、React 状态和桌面交互的标准纵向切片，安全协议已由 T-07 决定。

## 2. 决策状态

### 已锁定决策

- Automation 视图筛选 scheduled、running、needs_action、failed、succeeded、cancel_requested、cancelled，使用有界分页。
- 行操作仅在状态允许时显示/启用；retry 只适用于 failed/needs_action，cancel 遵循 T-07 状态机。
- Session 关联只通过宿主稳定 ref；完整 transcript 不复制到 Todo Page。当前没有 `session.open` 时不得渲染假导航按钮，改为显示/复制 ref、最小结果和可行动诊断；未来宿主提供能力后再增加导航。
- Todo 详情只显示最近 Run 摘要和跳转，不嵌入 Automation 全日志。
- 页面保持安静、密集、可扫描；使用图标工具按钮与 tooltip、明确状态文本、可恢复焦点和无重叠窄布局。

### 已采用的低影响假设

- 默认筛选聚焦 active/problem states，用户选择保存在 Page 本地偏好，不成为持久业务状态。

### 未决问题

无。

## 3. 范围边界

| IN（本 Ticket 构建） | REUSE（复用且不改变契约） | OUT（明确不做） |
|---|---|---|
| Automation query/action routes、状态筛选、表格/列表、详情、retry/cancel、SessionRef/copy fallback、Todo 最近摘要 | T-07 Run/Attempt/cancel/SessionRef，Hana plugin components 与 surface session | 新 Run 状态、对话副本、自动报告、日志无限加载、外部监控平台、`session.open`/rich native card 或其它未提供宿主能力 |

## 4. 要构建什么

用户打开 Automation 视图即可扫描正在运行、需要处理和失败的 Todo 自动化，按状态筛选并打开详情。详情给出 Todo、occurrence、attempt、时间、最小结果与脱敏诊断；合法动作才可执行。retry/cancel 立即以服务器返回状态更新，cancel_requested 不显示为 cancelled。当前宿主没有 `session.open` 时显示/复制 SessionRef 和最小结果；只有宿主明确提供打开能力时才导航，否则不崩溃并保留诊断。桌面和窄窗口下筛选、列表、详情和动作不遮挡。

## 5. 实现契约

- **入口或接缝：** Automation Page、run query/detail/action routes、T-07 application service、已提供的 SessionRef 投影；不依赖或伪造 `session.open`。
- **输入与输出：** filters/cursor/limit、run id/version 与 action；输出 bounded projection、allowedActions、latestAttempt、sessionRef 或稳定错误。
- **公共接口变化：** 只扩展插件内 Page/routes；不新增宿主或 Run 状态。
- **不变量：** UI action availability 由服务端状态合同决定；cancel_requested 不乐观收敛；完整消息不进入 DTO；Todo 详情最多最近摘要。
- **状态或数据流：** filter -> route projection -> list/detail -> versioned action -> service state -> refresh；Session 关联只传 stable ref，当前无打开能力时走 copy/result fallback。
- **错误与失败行为：** stale_run、action_not_allowed、session_unavailable、cancel_failed 和 retry_failed 保持 T-07 类别，UI 可恢复且不吞错。
- **兼容要求：** Todo 主视图基础 CRUD 不因 Automation 加载失败而阻塞；Page 不预加载完整 Session。
- **安全与隐私要求：** route 使用 surface context；错误和摘要脱敏，不显示 workspace 绝对路径或消息正文。

## 6. 执行路线

1. 用 route/component 测试固定状态过滤、allowed actions、错误恢复和 transcript 禁止规则。
2. 实现 bounded query/detail projection 与 action adapter，完全复用 T-07 service。
3. 构建 Automation 列表、详情与 Todo 最近摘要，完成五语言、ARIA、焦点、主题和窄布局。
4. 接入 SessionRef 展示/复制、宿主已有打开能力时的条件导航、retry/cancel，并对并发更新执行 version refresh/错误反馈。
5. 运行组件/route、桌面/窄 E2E 与 T-07 cancellation 回归。

## 7. 路径访问契约

- **预计修改点：** 插件内 automation projection/routes/UI/assets/tests。
- **可写范围：** `<Path>plugins/todolist/**</Path>`。
- **只读上下文：** plugin UI capability 先例与参考 UI 信息，仅用于识别问题，不复制结构。
- **共享路径：** 无；T-08 在 T-07 后顺序修改插件根。
- **保留或不动：** 宿主 Session UI、公共组件、桌面导航和插件根外产品文件；`session.open` 等缺失能力留待后续基础 change。

## 8. 验证矩阵

| 行为或风险 | 验证接缝 | 命令或步骤 | 预期结果 | Evidence |
|---|---|---|---|---|
| 正常路径 | route/component 集成 | `npx vitest run <Path>plugins/todolist/tests/automation-page.integration.test.ts</Path>` | 状态筛选、详情、合法动作、SessionRef/copy fallback 和最近摘要正确 | `<Path>{roots.state}/specdev/changes/2026-08-09-internalize-todolist-plugin/evidence/T-08.md</Path>` |
| 失败路径 | action/session fault | 同一测试执行 stale、illegal action、Session missing、cancel/retry failure | UI 状态不伪造、不崩溃、诊断可行动且脱敏 | `<Path>{roots.state}/specdev/changes/2026-08-09-internalize-todolist-plugin/evidence/T-08.md</Path>` |
| UI E2E（owner：当前执行 owner） | Automation Desktop/narrow | `npx playwright test --config=<Path>plugins/todolist/tests/e2e/playwright.config.ts</Path> <Path>plugins/todolist/tests/e2e/automation-operations.spec.ts</Path>` | 五语言、键盘、筛选、详情、retry/cancel/ref 复制或条件导航无裁切遮挡 | `<Path>{roots.state}/specdev/changes/2026-08-09-internalize-todolist-plugin/evidence/T-08.md</Path>` |
| 回归 | Run protocol + CRUD | `npx vitest run <Path>plugins/todolist/tests/automation-run.integration.test.ts</Path> <Path>plugins/todolist/tests/plugin-crud.integration.test.ts</Path>` | Run 状态机与基础 Todo Page 保持 | `<Path>{roots.state}/specdev/changes/2026-08-09-internalize-todolist-plugin/evidence/T-08.md</Path>` |

## 9. 发布、迁移与恢复

- **迁移顺序：** 不适用：消费 T-07 既有 projection，不新增核心 schema；先发布 query/detail，再开放 actions。
- **兼容窗口：** 不适用：旧 Page 不依赖 Automation 视图；缺能力时显示后台不可用诊断。
- **监控信号：** action_not_allowed、stale_run、Session unavailable、分页失败和 UI error boundary。
- **回滚或前向恢复：** 可回滚 UI/routes 而保留 T-07 Run 数据；任何 action 已产生的副作用按 T-07 状态机前向恢复。
- **不可逆操作与批准点：** cancel/retry 使用明确用户命令及宿主权限；界面不得自动触发。
- **收缩条件：** 不适用：无临时兼容层。

## 10. 验收标准

- [x] AC-021：全部规定状态可筛选，合法 retry/cancel 可用；SessionRef 在当前宿主能力下可查看/复制，存在宿主打开能力时才提供条件导航，详情信息层级正确。
- [x] AC-020、AC-022：取消状态真实，完整对话只在 Session，Session 缺失仍显示最小诊断。
- [x] AC-029、AC-031：失败不吞错，五语言/键盘/ARIA/主题/窄布局无裁切遮挡。
- [x] Evidence 完整且产品 diff 仅位于 `<Path>plugins/todolist/</Path>`。
