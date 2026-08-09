---
schema_version: 3
artifact: ticket
change: 2026-08-09-openhanako-v0-446-6-integration
id: T-18
title: 融合 @ 搜索交互生命周期
status: review
planning_depth: standard
planning_depth_reason: "跨 input menu、query provider 与 renderer state 的多文件 UI 切片，但不改变共享持久化、安全 authority 或数据 schema。"
ready: true
risk: medium
blocked_by: [T-09]
contract_ids: [AC-024]
owner: unassigned
expected_changes: ["<Path>desktop/src/react/components/input/**</Path>", "<Path>desktop/src/react/utils/file-mention-items.ts</Path>", "<Path>desktop/src/react/utils/mention-items.ts</Path>", "<Path>desktop/src/react/__tests__/components/FileMentionMenu.test.tsx</Path>", "<Path>desktop/src/react/__tests__/components/InputArea.file-mention.test.tsx</Path>"]
writable_paths: ["<Path>desktop/src/react/components/input/**</Path>", "<Path>desktop/src/react/utils/file-mention-items.ts</Path>", "<Path>desktop/src/react/utils/mention-items.ts</Path>", "<Path>desktop/src/react/__tests__/components/FileMentionMenu.test.tsx</Path>", "<Path>desktop/src/react/__tests__/components/InputArea.file-mention.test.tsx</Path>", "<Path>desktop/src/react/__tests__/utils/file-mention-items.test.ts</Path>", "<Path>desktop/src/react/__tests__/utils/mention-items.test.ts</Path>", "<Path>tests/knowledge-workspace-e2e/specs/at-search-lifecycle.spec.ts</Path>"]
read_only_paths: ["<Path>lib/search/**</Path>", "<Path>lib/knowledge-workspace/**</Path>", "<Path>desktop/src/react/components/knowledge-workspace/**</Path>"]
shared_paths: []
shared_path_owners: []
---

# Ticket T-18: 融合 @ 搜索交互生命周期

- **Ticket 文件：** `<Path>{roots.state}/specdev/changes/{change}/ticket/18-fuse-at-search-lifecycle.md</Path>`
- **总体 Map：** `<Path>{roots.state}/specdev/changes/{change}/tickets-map.md</Path>`
- **上游 Spec：** `<Path>{roots.state}/specdev/changes/{change}/spec.md</Path>`
- **完成 Evidence：** `<Path>{roots.state}/specdev/changes/{change}/evidence/T-18.md</Path>`

## 1. 战略与来源

- **目标：** 吸收上游 `@` query/loading/cancellation/stale-response 修复，并融合 HanaKDE main/mount/Knowledge 可用资源 provider，不重写 Search backend。
- **可观察产出：** 用户连续输入、清空、切换 scope 或关闭菜单时只看到当前 query 的结果，loading/empty/error 稳定，选中资源保持 HanaKDE 既有 ResourceRef 语义。
- **来源：** `US-004`、`AC-024`、`DEC-001`、`DEC-015`。
- **当前事实：** 冻结上游修改 FileMentionMenu/InputArea/mention utilities；HanaKDE 已有 Knowledge 与 mount 搜索/资源语义。
- **Planning Depth 原因：** 是跨组件/provider/state 的完整 UI 行为，但接口和数据模型可沿用既有模式。

## 2. 决策状态

### 已锁定决策

- 复用现有 Search/Knowledge/Resource providers，只统一 query lifecycle，不合并后端。
- 每次 query 有可取消 identity；旧 response 不得覆盖新 query/scope。
- 保持 keyboard/ARIA/localization/theme/narrow layout 和 ResourceRef selection contracts。

### 已采用的低影响假设

- debounce/limit 数值沿用整合后现有上游默认，除非已有 HanaKDE 性能测试要求更严格值。

### 未决问题

无。

## 3. 范围边界

| IN（本 Ticket 构建） | REUSE（复用且不改变契约） | OUT（明确不做） |
|---|---|---|
| @ menu query/loading/cancel/stale/selection lifecycle and UI tests | existing search providers、Knowledge query、ResourceRef | Search backend rewrite、History capture、global input redesign |

## 4. 要构建什么

用户键入 `@` 后异步查询当前可用 provider；继续输入或 scope 改变会取消/失效旧查询。菜单只展示最新结果，键盘可浏览并选择 ResourceRef，关闭/清空会清理 loading 和 pending request，不让 stale response 重新打开菜单。

## 5. 实现契约

- **入口或接缝：** InputArea/FileMentionMenu、mention item provider adapter、query abort/identity state。
- **输入与输出：** query text + active scope/providers → latest result items/loading/error/selected ResourceRef。
- **公共接口变化：** 无；沿用既有 provider 与 ResourceRef contracts。
- **不变量：** latest query wins；close/unmount aborts；selection belongs to active scope；no backend duplication。
- **状态或数据流：** input → issue query id/abort → providers → discard stale → render/select。
- **错误与失败行为：** provider failure 隔离并显示稳定 empty/error；不会保留 stale loading 或选择。
- **兼容要求：** main/mount/Knowledge item rendering 与输入序列保持；上游 lifecycle bugfix 完整吸收。
- **安全与隐私要求：** 只呈现已授权 provider 结果，不显示 raw root 或隐式扩大 scope。

## 6. 执行路线

1. 加入 rapid query、cancel、scope switch、close/unmount 和 stale response 红色组件测试。
2. 融合上游 query identity/abort/loading lifecycle 到现有 FileMentionMenu。
3. 适配 HanaKDE providers 与 ResourceRef selection，不改变后端。
4. 完善 loading/empty/error/keyboard/ARIA/localization/narrow layout states。
5. 运行 component tests、typecheck 和当前 Ticket owner 的 direct user E2E。

## 7. 路径访问契约

- **预计修改点：** input components、mention utilities 与定向 tests。
- **可写范围：** 仅 frontmatter `writable_paths`；Search/Knowledge backend 只读。
- **只读上下文：** search providers、Knowledge query 和 Resource contracts。
- **共享路径：** 无；与 Workspace/Extraction Tickets 可并行。
- **保留或不动：** Search backend、History、Agent execution 和 workspace lifecycle。

## 8. 验证矩阵

| 行为或风险 | 验证接缝 | 命令或步骤 | 预期结果 | Evidence |
|---|---|---|---|---|
| 正常路径 | component tests | type/search/navigate/select main/mount/Knowledge items | latest results 可选择且 ResourceRef 正确 | `<Path>{roots.state}/specdev/changes/{change}/evidence/T-18.md</Path>` |
| 失败路径 | async race tests | rapid type、cancel、scope switch、provider reject、unmount | stale response 被丢弃，状态清理 | `<Path>{roots.state}/specdev/changes/{change}/evidence/T-18.md</Path>` |
| 回归 | UI contract | keyboard/ARIA/localization/theme/typecheck | 既有输入体验保持 | `<Path>{roots.state}/specdev/changes/{change}/evidence/T-18.md</Path>` |
| E2E（owner：当前 Ticket 实现 owner） | Playwright direct flow | 连续输入 @ 查询并切换/选择 | 无 stale 闪回，选中资源正确 | `<Path>{roots.state}/specdev/changes/{change}/evidence/T-18.md</Path>` |

## 9. 发布、迁移与恢复

- **迁移顺序：** 不适用：沿用现有 renderer state，无数据迁移。
- **兼容窗口：** 不适用：直接替换旧 query lifecycle，不并列运行。
- **监控信号：** 不适用：前端 race 由 query ids/abort 和测试观察，无生产迁移指标。
- **回滚或前向恢复：** 回退 UI Wave；不改变 providers/backend 数据。
- **不可逆操作与批准点：** 无；Git integration 仍需授权。
- **收缩条件：** 旧 request lifecycle/stale response path 调用点为零。

## 10. 验收标准

- [ ] `AC-024`：`@` query/loading/cancel/stale response 修复在 HanaKDE providers 上成立。
- [ ] keyboard、ARIA、localization、theme 与窄布局回归通过。
- [ ] 不引入 Search backend 或 Resource truth duplication。
- [ ] 验证记录到 `<Path>{roots.state}/specdev/changes/{change}/evidence/T-18.md</Path>`。
- [ ] 修改范围未超出 `writable_paths`。
