---
schema_version: 3
artifact: ticket
change: 2026-08-29-todolist-backend-reliability
id: T-02
title: Todo 对齐系统 UI 并锁定 AI 工具目录
status: done
risk: medium
planning_depth: standard
planning_depth_reason: 视觉收敛覆盖完整插件页面、响应式和真实桌面验证，同时锁定 AI 工具目录，但不改变领域模型或公共接口
ready: true
owner: root
blocked_by: [T-01]
contract_ids: [AC-007, AC-008]
expected_changes: ["<Path>plugins/todolist/src/ui/browser-app.ts</Path>", "<Path>plugins/todolist/src/ui/page.tsx</Path>", "<Path>plugins/todolist/assets/page.css</Path>", "<Path>plugins/todolist/assets/page.js</Path>", "<Path>plugins/todolist/tests/contract.test.ts</Path>"]
writable_paths: ["<Path>plugins/todolist/**</Path>", "<Path>speculo/.speculo/specdev/changes/2026-08-29-todolist-backend-reliability/**</Path>"]
read_only_paths: ["<Path>core/**</Path>", "<Path>server/**</Path>", "<Path>desktop/**</Path>", "<Path>speculo/.speculo/specdev/archive/**</Path>", "<Path>pnpm-lock.yaml</Path>", "<Path>pnpm-workspace.yaml</Path>"]
shared_paths: []
shared_path_owners: []
---

# Ticket T-02: Todo 对齐系统 UI 并锁定 AI 工具目录

## 1. 战略与来源

- **目标：** Todo 页面回归 Hana 系统设计语言，并确保 AI 可继续使用完整 Todo 能力。
- **来源：** 用户指出当前 Todo 颜色、排版、按钮和交互与系统不一致，要求严格复用宿主插件合同并完善 AI 工具。
- **可观察产出：** 真实桌面页面继承当前主题；无私有紫色、超大圆角或负字距；16 个 AI 工具精确可加载。

## 2. 决策状态

- Feature placement 裁决为 builtin plugin：页面、routes、tools、Lifecycle 和 TaskRegistry 足以完整交付。
- 宿主已有主题 token 和 `@hana/plugin-components` 设计合同，不新增 Todo 专属 core UI。
- 本仓未启用图标库；清晰命令使用文本按钮，熟悉的关闭/添加动作使用系统同类符号，不引入新依赖。
- commit、push、版本提升和 release 未授权。

## 3. 范围边界

| IN | REUSE | OUT |
|---|---|---|
| Todo 页面布局、CSS token、响应式、UI/AI 合同测试 | Hana host theme、plugin-components 4/8px 合同、既有 application/routes/tools | 新设计系统、Todo 专属 core 能力、Store/schema/API 改造、发布 |

## 4. 要构建什么

将 Todo 页面收敛为 Hana 工作台一致的侧栏、平面列表和详情检查器；控件、颜色、边框、圆角、密度和选中态从宿主主题继承。保留现有 Todo/Project/Reminder/Recurrence/Automation/Exchange 工具，并用精确工具目录测试锁定 AI 能力。

## 5. 实现契约

- 只修改 builtin `plugins/todolist/`，不新增 Todo 专属 core 能力。
- 页面消费 `--bg`、`--bg-card`、`--accent`、`--text`、`--border` 等宿主 token。
- 页面骨架保持文件/工作台式平面层级，不使用营销式大标题、嵌套卡片或装饰色。
- 不改变 Store v2、HTTP envelope、TaskRegistry 或工具参数兼容性。
- AI tools 必须继续使用既有权限 resolver 和 application service。

## 6. 执行路线

1. 审计宿主主题与 plugin-components 稳定设计 token。
2. 重构 Todo 页面层级、控件尺寸、圆角与响应式样式。
3. 增加 CSS 设计合同与精确 AI 工具目录回归。
4. 重建页面并执行插件、仓库静态门禁。
5. 在 current-workspace macOS Electron Desktop 的 authenticated plugin surface 完成截图和 CRUD。

## 7. 路径访问契约

- **可写：** frontmatter `writable_paths` 中的 Todo 和本 change 工件。
- **只读：** core/server/desktop、Speculo archive 和用户未跟踪 pnpm 文件。
- **共享：** 无；root 在 current workspace 串行执行。
- **保护：** 不读取或删除用户 Todo 数据；E2E 仅创建并永久清理带唯一标记的测试项。

## 8. 验证矩阵

| 风险 | 接缝 | 命令/步骤 | 预期结果 |
|---|---|---|---|
| 视觉再次漂移 | CSS static contract | plugin tests | host tokens、4/8px 合同存在；私有紫色/负字距/超大圆角不存在 |
| AI 能力缺失 | tool catalog contract | plugin tests/package smoke | 16 个工具具备 name/description/schema/execute/permission |
| 页面行为退化 | plugin regression | `npm run verify` | typecheck、35 tests、build、19 entrypoints 全通过 |
| 主题或响应式失配 | Desktop E2E | macOS Electron at `http://127.0.0.1:37453`, authenticated plugin surface, 1440x900 + 600x800 | 当前主题 token 生效、0 横向溢出、0 console/auth errors |
| CRUD 被 UI 改坏 | Desktop E2E | 新建、编辑、完成、重开、删除、永久删除 | 全流程通过且测试项已清理 |
| 跨仓静态回归 | repository | root typecheck + scoped ESLint | 0 errors |

- **E2E disposition：** required。
- **E2E owner/environment：** root；current-workspace macOS Electron Desktop，本地真实 Server 和 authenticated plugin surface session。
- **Evidence：** `<Path>{roots.state}/specdev/changes/2026-08-29-todolist-backend-reliability/evidence/T-02.md</Path>`。

## 9. 发布、迁移与恢复

无数据迁移或公共接口变化。回滚仅恢复 Todo UI source/CSS 并重建 `assets/page.js`；Store v2 与 AI tools 保持兼容。未授权 commit/push/release。

## 10. 验收标准

- [x] 页面只消费宿主主题和公共插件设计 token。
- [x] 控件/面板遵循 4/8px 上限合同，无私有紫色、超大圆角或负字距。
- [x] 16 个 AI 工具目录及其 AI 合同通过精确测试。
- [x] Todo plugin verify 全通过。
- [x] 真实 Desktop 主题、响应式和 CRUD 验证通过，测试项已清理。
- [x] 后续独立授权已取得，implementation/direct-parent result 为 `b0c74282`。
