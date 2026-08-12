---
schema_version: 3
artifact: ticket
change: 2026-08-12-knowledge-workspace-resource-convergence
id: T-02
title: 收敛创建对话框提交生命周期
status: done
planning_depth: standard
planning_depth_reason: "局部 React 交互缺陷，沿用现有 Knowledge client/dialog 回调，无公共协议或数据迁移；但需覆盖重复提交、卸载顺序和稳定失败重试。"
ready: true
risk: medium
blocked_by: [T-01]
contract_ids: [AC-004, AC-005]
owner: current-implementer
expected_changes: ["<Path>desktop/src/react/components/knowledge-workspace/CreateResourceDialog.tsx</Path>", "<Path>desktop/src/react/__tests__/components/CreateResourceDialog.test.tsx</Path>"]
writable_paths: ["<Path>desktop/src/react/components/knowledge-workspace/CreateResourceDialog.tsx</Path>", "<Path>desktop/src/react/__tests__/components/CreateResourceDialog.test.tsx</Path>"]
read_only_paths: ["<Path>desktop/src/react/components/knowledge-workspace/KnowledgeLayout.tsx</Path>", "<Path>desktop/src/react/services/knowledge-workspace-client.ts</Path>", "<Path>tests/knowledge-workspace-route.test.ts</Path>"]
shared_paths: []
shared_path_owners: []
---

# Ticket T-02: 收敛创建对话框提交生命周期

- **Ticket 文件：** `<Path>{roots.state}/specdev/changes/{change}/ticket/02-close-create-dialog-submit.md</Path>`
- **总体 Map：** `<Path>{roots.state}/specdev/changes/{change}/tickets-map.md</Path>`
- **上游 Spec：** `<Path>{roots.state}/specdev/changes/{change}/spec.md</Path>`
- **完成 Evidence：** `<Path>{roots.state}/specdev/changes/{change}/evidence/T-02.md</Path>`

## 1. 战略与来源

- **目标：** 让创建页面/文件夹第一次提交立即不可重入；成功先卸载 dialog，再执行一次资源树定位和页面 open/focus；失败只显示一次错误并保留输入。
- **可观察产出：** 连续点击或重复键盘 submit 只产生一次 `client.createResource`；成功弹窗不可再交互且页面创建只定位/打开一次；409/503 失败不自动重试，用户显式重试前输入仍在。
- **来源：** `US-002`、`AC-004`、`AC-005`、`ADR-003`、`DIAG-001`。
- **当前事实：** `<Path>desktop/src/react/components/knowledge-workspace/CreateResourceDialog.tsx</Path>` 目前 finally 会恢复 submitting，成功回调与 `onClose` 在异步 continuation 中存在可重入/可观察顺序缺口；现有测试未断言 unmount 和请求次数。
- **Planning Depth 原因：** 多文件局部 UI vertical slice，需同时修改稳定 seam 与组件测试，但不改变公共接口。

## 2. 决策状态

### 已锁定决策

- 第一次 submit 设置不可重入屏障，按钮和等价键盘提交均受屏障保护。
- 成功 continuation 先调用 close/unmount，再由父级执行 canonical locate；page 才执行一次 editor open/focus。
- 失败保留 name/source/directory context，显示稳定错误；只有用户重新 submit 才能重试。
- 取消、来源切换和 workspace 卸载清理 dialog 状态，不恢复已成功请求的交互。

### 已采用的低影响假设

- 父组件继续拥有 `onCreated` 的 locate/open 投影；本 Ticket 不把导航逻辑搬入 dialog。
- 现有 i18n 错误键和 `KnowledgeWorkspaceClientError` code 可继续复用。

### 未决问题

无。

## 3. 范围边界

| IN（本 Ticket 构建） | REUSE（复用且不改变契约） | OUT（明确不做） |
|---|---|---|
| submit barrier、success close ordering、failure/retry state、unmount/duplicate-submit tests | `KnowledgeWorkspaceClient.createResource`、父级 `onCreated/onClose`、现有 modal CSS/i18n | 后端 create service、名称校验、owner composition、资源树右键和 clipboard |

## 4. 要构建什么

用户打开“新建页面/文件夹”后输入合法名称并点击创建。第一次事件马上锁定提交；后续 click/Enter 被忽略。请求成功时 dialog 关闭并卸载，父级用返回的 canonical address 定位一次；页面额外打开并聚焦一次。请求返回 conflict/unavailable 时，dialog 仍显示且输入不丢失，错误只出现一次，不产生后台重放；用户修改或保留输入后再次显式提交才发起新请求。取消或 workspace 切换不会在已完成请求之后重新打开旧 modal。

## 5. 实现契约

- **入口或接缝：** `<Path>desktop/src/react/components/knowledge-workspace/CreateResourceDialog.tsx</Path>` form submit/unmount；`<Path>desktop/src/react/__tests__/components/CreateResourceDialog.test.tsx</Path>` React testing seam。
- **输入与输出：** kind/sourceKey/directoryPath/name → exactly one create request per explicit submit attempt; success callback with canonical address, failure rendered as stable code/translation.
- **公共接口变化：** 无；props 和 client method 保持不变。
- **不变量：** `submitting` 从首次 submit 到 settle 不可重入；成功后不得再执行 failure/finally interactive reset；失败不清除 name；close 后不调用 callback 第二次。
- **状态或数据流：** idle → submitting → success(close/unmount then parent projection) 或 failure(error + idle for explicit retry)；cancel/unmount → idle cleanup。
- **错误与失败行为：** 409 conflict 与 503 unavailable 分别保留 code/retryability 语义；不自动 retry，不吞掉不可用信息；重复事件无第二 mutation。
- **兼容要求：** 父级继续决定 locate/open；folder 不打开 editor，page 使用既有 markdown editor。
- **安全与隐私要求：** 不接触文件系统或绝对路径，仅透传现有 source-relative create input。

## 6. 执行路线

1. 在组件测试中先固定双击/双 Enter 单请求、成功卸载和失败保留输入的红灯断言。
2. 将 submit guard 置于 async continuation 之前，并把成功关闭顺序固定为 close 后才允许父级 projection。
3. 对 conflict/unavailable 映射现有稳定错误，确保 `finally` 不重新开放已成功 dialog。
4. 运行组件测试和相关 Knowledge layout 回归，形成 UI lifecycle Evidence。

## 7. 路径访问契约

- **预计修改点：** dialog 组件与对应测试。
- **可写范围：** 仅 frontmatter `writable_paths`。
- **只读上下文：** KnowledgeLayout、client、route tests、Knowledge editor groups。
- **共享路径：** 无。
- **保留或不动：** 不修改父级 toolbar 文案、client DTO、server create service。

## 8. 验证矩阵

| 行为或风险 | 验证接缝 | 命令或步骤 | 预期结果 | Evidence |
|---|---|---|---|---|
| 正常创建 | React component | `npm test -- --run desktop/src/react/__tests__/components/CreateResourceDialog.test.tsx` | 合法提交成功，dialog 卸载，父级 callback 只一次 | `<Path>{roots.state}/specdev/changes/{change}/evidence/T-02.md</Path>` |
| 重复提交 | React component | 同步触发 click/Enter 两次并 mock pending promise | createResource 调用次数为 1；按钮/键盘被锁定 | `<Path>{roots.state}/specdev/changes/{change}/evidence/T-02.md</Path>` |
| 失败重试 | React component + route error fixture | 返回 409/503，检查输入/错误，再显式重试 | 错误一次、输入保留、无后台第二请求；显式重试才新增一次 | `<Path>{roots.state}/specdev/changes/{change}/evidence/T-02.md</Path>` |
| 回归 | component/layout tests | 运行相邻 Knowledge layout/editor tests | folder 不误开 editor，page 仍按 canonical address 打开 | `<Path>{roots.state}/specdev/changes/{change}/evidence/T-02.md</Path>` |

## 9. 发布、迁移与恢复

- **迁移顺序：** 无数据/协议迁移；先组件 seam，再接现有父级 projection。
- **兼容窗口：** 无；props/client method 保持旧调用方可用。
- **监控信号：** 不新增运行时指标；Evidence 记录请求次数、卸载和错误 code。
- **回滚或前向恢复：** 可回退组件实现；失败请求不产生额外 mutation，用户可显式重试。
- **不可逆操作与批准点：** 无。
- **收缩条件：** 不适用：本 Ticket 不引入旧/新双协议。

## 10. 验收标准

- [x] `AC-004`：首次 submit 后不可重入，成功先卸载 dialog，locate/open 投影各至多一次。
- [x] `AC-005`：409/503 保持稳定错误与输入，显式重试前无自动第二请求。
- [x] 正常、失败、回归验证均记录到 `<Path>{roots.state}/specdev/changes/{change}/evidence/T-02.md</Path>`。
- [x] 只修改授权路径，无未批准 UI/协议偏差。
