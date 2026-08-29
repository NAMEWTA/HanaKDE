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
contract_ids: [AC-006, AC-007, AC-008, AC-009, AC-010, AC-011]
owner: root
expected_changes: ["<Path>desktop/src/react/components/knowledge-workspace/KnowledgeWorkspace.tsx</Path>", "<Path>desktop/src/react/components/knowledge-workspace/**</Path>", "<Path>desktop/src/react/components/PreviewPanel.tsx</Path>", "<Path>desktop/src/react/components/desk/DeskTree.tsx</Path>", "<Path>desktop/src/react/stores/desk-actions.ts</Path>", "<Path>desktop/src/react/stores/knowledge-*</Path>"]
writable_paths: ["<Path>desktop/src/react/components/knowledge-workspace/**</Path>", "<Path>desktop/src/react/components/PreviewPanel.tsx</Path>", "<Path>desktop/src/react/components/Preview.module.css</Path>", "<Path>desktop/src/react/components/desk/**</Path>", "<Path>desktop/src/react/stores/desk-actions.ts</Path>", "<Path>desktop/src/react/stores/knowledge-*</Path>", "<Path>core/mount-aware-file-service.ts</Path>", "<Path>core/knowledge-workspace/knowledge-trash-operation-coordinator.ts</Path>", "<Path>server/routes/desk.ts</Path>", "<Path>server/routes/mobile-workbench.ts</Path>", "<Path>desktop/src/locales/**</Path>", "<Path>desktop/src/react/__tests__/**</Path>", "<Path>tests/**</Path>"]
read_only_paths: ["<Path>desktop/src/react/components/right-workspace/**</Path>"]
shared_paths: ["<Path>desktop/src/react/components/knowledge-workspace/KnowledgeWorkspace.module.css</Path>"]
shared_path_owners: ["<Path>desktop/src/react/components/knowledge-workspace/KnowledgeWorkspace.module.css</Path> => T-02"]
---

# Ticket T-02: 交付 upstream 风格 Knowledge Explorer

## 1. 战略与来源

- **目标：** 复用 upstream Desk Explorer 的信息层级和密度，让 Knowledge 成为可持续操作的文件工作台。
- **来源：** `AC-006`—`AC-011`、用户提供的 upstream/当前实现截图和共享工作台复用要求。
- **可观察产出：** 左侧是搜索、图标工具栏、单列树；中央编辑区占满剩余空间；回收站/资源视图仅按需出现。

## 2. 决策状态

- 直接复用现有 DeskSection、DeskTree、PreviewPanel、store 与 actions。
- Knowledge index/search/trash 保留为后台增强，不再拥有第二套主文件管理 UI。
- 工具命令优先 lucide 图标和 tooltip，移动端不得横向溢出。
- 未决问题：无。

## 3. 范围边界

| IN | REUSE | OUT |
|---|---|---|
| 共享 Desk/Preview 壳、右键文件命令、恢复解锁、删除不可达的平行 Knowledge UI、视觉/E2E | DeskSection、DeskTree、PreviewPanel | 营销页、新编辑器、插件业务功能重写 |

## 4. 要构建什么

Knowledge shell 只组合共享 Desk Explorer 与 Preview editor 两个稳定区域。搜索、命令栏、资源树、标签和 Markdown/代码编辑全部沿用共享实现；Knowledge backend 继续提供索引和 ResourceIO 能力。

## 5. 实现契约

- **入口：** `KnowledgeWorkspace` 组合 `DeskSection` 与 `PreviewPanel`。
- **状态：** 文件选择、展开、编辑、拖拽和 mutation 全部由 shared Desk/Preview store 与 actions 管理。
- **UI 不变量：** 无独立 Sources 栏、无常驻空白右栏、无文字按钮墙；按钮尺寸稳定且有 accessible name/tooltip。
- **响应式：** desktop 两列；窄屏 Explorer 可收敛，drawer 不遮挡核心命令且无横向 overflow。
- **失败行为：** source/error 状态在 Explorer 内紧凑显示，editor 保持可预测空态。
- **删除约束：** 仅删除已被共享 Desk/Preview 替代且生产入口不可达的平行 UI/store；索引、搜索、知识地址与回收站后端保留。

## 6. 执行路线

1. 添加 DOM/layout 失败断言。
2. 将 KnowledgeWorkspace 收敛为 DeskSection + PreviewPanel。
3. 删除生产入口不可达的平行组件、测试与 E2E。
4. 回归 shared 文件命令、编辑保存、watch 和 Knowledge backend。
5. 启动真实 Electron fixture 验证 tree/open/edit/save/context menu。

## 7. 路径访问契约

- **可写范围：** frontmatter `writable_paths`。
- **只读参照：** upstream Desk/RightWorkspace 组件和 CSS。
- **共享路径：** Knowledge CSS 由本 Ticket 独占最终所有权。
- **保留：** T-01 selector/授权合同及 Knowledge backend API。

## 8. 验证矩阵

| 风险 | 接缝 | 命令/步骤 | 预期结果 |
|---|---|---|---|
| 结构回退 | component tests | focused Knowledge Vitest | 只组合 DeskSection + PreviewPanel |
| 操作回归 | shared component tests | Desk/Preview/resource event suites | shared 操作通过 |
| 真实工作流 | desktop E2E | E2E-KW-026 | tree/open/edit/save/context menu 通过 |
| 构建回归 | static/build | typecheck + renderer build | 通过 |

- **E2E disposition：** required。
- **E2E owner/environment：** Lead / current-workspace isolated Electron desktop fixture；以真实文件验证 shared tree、Preview editor 与 context menu。
- **Evidence：** `<Path>{roots.state}/specdev/changes/2026-08-28-knowledge-explorer-convergence/evidence/T-02.md</Path>`。

## 9. 发布、迁移与恢复

- **迁移：** 纯视图组合调整，无持久数据迁移。
- **监控：** 首屏 source load、tree render、panel toggle、viewport overflow。
- **恢复：** 回滚 layout/CSS 可恢复旧组合，不影响文件数据。
- **发布：** 本 Ticket 不授权 commit、push 或 release。

## 10. 验收标准

- [x] `AC-006`—`AC-008` 全部满足。
- [x] `AC-009`—`AC-011` 全部满足。
- [x] 默认界面无 Sources 独立栏和常驻 Current Resource Views 空栏。
- [x] Knowledge 直接复用 shared Desk/Preview owner。
- [x] 文件命令、编辑保存、watch 和 backend 回归通过。
- [x] Desktop/Web Open/Web Full E2E 与 typecheck/build 通过。
- [ ] 修改未超出 writable paths，未执行未授权 commit/push/release。
