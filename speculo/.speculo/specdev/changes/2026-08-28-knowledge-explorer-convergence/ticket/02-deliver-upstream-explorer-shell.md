---
schema_version: 3
artifact: ticket
change: 2026-08-28-knowledge-explorer-convergence
id: T-02
title: 交付 upstream 风格 Knowledge Explorer
status: ready
planning_depth: standard
planning_depth_reason: 多文件 Renderer 重组并需要真实桌面交互与视觉回归
ready: true
risk: medium
blocked_by: [T-01]
contract_ids: [AC-006, AC-007, AC-008, AC-009, AC-010, AC-011, AC-012]
owner: root
expected_changes: ["<Path>desktop/src/react/components/knowledge-workspace/KnowledgeWorkspace.tsx</Path>", "<Path>desktop/src/react/components/PreviewPanel.tsx</Path>", "<Path>desktop/src/react/components/desk/DeskTree.tsx</Path>", "<Path>desktop/src/react/stores/desk-actions.ts</Path>", "<Path>core/mount-aware-file-service.ts</Path>", "<Path>core/knowledge-workspace/knowledge-trash-operation-coordinator.ts</Path>", "<Path>desktop/src/react/hooks/use-plugin-iframe.ts</Path>", "<Path>server/http/plugin-assets.ts</Path>", "<Path>server/routes/plugins.ts</Path>"]
writable_paths: ["<Path>desktop/src/react/components/knowledge-workspace/**</Path>", "<Path>desktop/src/react/components/PreviewPanel.tsx</Path>", "<Path>desktop/src/react/components/Preview.module.css</Path>", "<Path>desktop/src/react/components/desk/**</Path>", "<Path>desktop/src/react/components/plugin/**</Path>", "<Path>desktop/src/react/components/chat/PluginCardBlock.tsx</Path>", "<Path>desktop/src/react/hooks/use-plugin-iframe.ts</Path>", "<Path>desktop/src/react/stores/desk-actions.ts</Path>", "<Path>core/mount-aware-file-service.ts</Path>", "<Path>core/knowledge-workspace/knowledge-trash-operation-coordinator.ts</Path>", "<Path>core/plugin-asset-session-service.ts</Path>", "<Path>server/http/plugin-assets.ts</Path>", "<Path>server/routes/desk.ts</Path>", "<Path>server/routes/mobile-workbench.ts</Path>", "<Path>server/routes/plugins.ts</Path>", "<Path>desktop/src/locales/**</Path>", "<Path>desktop/src/react/__tests__/**</Path>", "<Path>tests/**</Path>"]
read_only_paths: ["<Path>desktop/src/react/components/right-workspace/**</Path>"]
shared_paths: ["<Path>desktop/src/react/components/knowledge-workspace/KnowledgeWorkspace.module.css</Path>"]
shared_path_owners: ["<Path>desktop/src/react/components/knowledge-workspace/KnowledgeWorkspace.module.css</Path> => T-02"]
---

# Ticket T-02: 交付 upstream 风格 Knowledge Explorer

## 1. 战略与来源

- **目标：** 复用 upstream Desk Explorer 的信息层级和密度，让 Knowledge 成为可持续操作的文件工作台。
- **来源：** `AC-006`—`AC-012`、用户提供的 upstream/当前实现截图和三个插件无限转圈复现。
- **可观察产出：** 左侧是搜索、图标工具栏、单列树；中央编辑区占满剩余空间；回收站/资源视图仅按需出现。

## 2. 决策状态

- 复用现有 WorkspaceTreeRow、Knowledge selection/drag/mutation/editor 状态机。
- Current Resource Views 与 Trash 使用按需 panel/drawer，不常驻占宽。
- 工具命令优先 lucide 图标和 tooltip，移动端不得横向溢出。
- 未决问题：无。

## 3. 范围边界

| IN | REUSE | OUT |
|---|---|---|
| 共享 Desk/Preview 壳、右键文件命令、恢复解锁、插件资源加载、视觉/E2E | DeskSection、DeskTree、PreviewPanel、现有插件 surface session | 营销页、新编辑器、插件业务功能重写 |

## 4. 要构建什么

Knowledge shell 默认只保留 Explorer 与 editor 两个稳定区域。Explorer 内按 upstream 顺序放搜索、命令栏和资源树。附加状态/资源视图与回收站由显式按钮打开，并在关闭后完整归还编辑宽度。空态、错误态与长文件名不能导致布局跳动或重叠。

## 5. 实现契约

- **入口：** `KnowledgeLayout` 与现有 Knowledge child components。
- **状态：** layout 只新增面板可见性；文件选择、展开、编辑、拖拽和 mutation 仍由原 controller 管理。
- **UI 不变量：** 无独立 Sources 栏、无常驻空白右栏、无文字按钮墙；按钮尺寸稳定且有 accessible name/tooltip。
- **响应式：** desktop 两列；窄屏 Explorer 可收敛，drawer 不遮挡核心命令且无横向 overflow。
- **失败行为：** source/error 状态在 Explorer 内紧凑显示，editor 保持可预测空态。
- **插件行为：** iframe 不得以超时伪装 ready；桌面 `file://` 宿主通过现有签名 session 加载插件静态资源。

## 6. 执行路线

1. 添加 DOM/layout 失败断言。
2. 按 DeskSection 信息层级重组 KnowledgeLayout 与 toolbar。
3. 收敛 CSS grid、drawer、row density 和 responsive rules。
4. 回归键盘、拖拽、创建、删除、恢复与 editor。
5. 启动应用，以真实嵌套目录完成桌面/窄屏 Playwright 截图和 overflow 检查。

## 7. 路径访问契约

- **可写范围：** frontmatter `writable_paths`。
- **只读参照：** upstream Desk/RightWorkspace 组件和 CSS。
- **共享路径：** Knowledge CSS 由本 Ticket 独占最终所有权。
- **保留：** T-01 selector/授权合同及 Knowledge backend API。

## 8. 验证矩阵

| 风险 | 接缝 | 命令/步骤 | 预期结果 |
|---|---|---|---|
| 结构回退 | component tests | focused Knowledge Vitest | 搜索/工具栏/树同栏，附加面板默认关闭 |
| 操作回归 | tree/component tests | keyboard/drag/mutation suites | 既有操作通过 |
| 视觉溢出 | desktop E2E | Playwright desktop + narrow screenshots | 无重叠、横向溢出或常驻空栏 |
| 构建回归 | static/build | typecheck + renderer build | 通过 |

- **E2E disposition：** required。
- **E2E owner/environment：** Lead / current-workspace 本地 desktop dev server；以真实嵌套目录 fixture 验证加载、操作、面板与 desktop/narrow overflow。
- **Evidence：** `<Path>{roots.state}/specdev/changes/2026-08-28-knowledge-explorer-convergence/evidence/T-02.md</Path>`。

## 9. 发布、迁移与恢复

- **迁移：** 纯视图组合调整，无持久数据迁移。
- **监控：** 首屏 source load、tree render、panel toggle、viewport overflow。
- **恢复：** 回滚 layout/CSS 可恢复旧组合，不影响文件数据。
- **发布：** 本 Ticket 不授权 commit、push 或 release。

## 10. 验收标准

- [ ] `AC-006`—`AC-008` 全部满足。
- [ ] `AC-009`—`AC-012` 全部满足。
- [ ] 默认界面无 Sources 独立栏和常驻 Current Resource Views 空栏。
- [ ] 搜索、图标工具栏、树与 upstream Explorer 信息层级一致。
- [ ] 文件操作、键盘、拖拽、回收站和 editor 回归通过。
- [ ] desktop/narrow 截图无重叠或横向溢出，typecheck/build 通过。
- [ ] 修改未超出 writable paths，未执行未授权 commit/push/release。
