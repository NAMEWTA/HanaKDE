---
schema_version: 3
artifact: spec
change: 2026-08-24-knowledge-multi-root-explorer-redesign
status: ready
ready_for_tickets: false
sources:
  - USER-DECISION:2026-08-24-knowledge-multi-root-explorer-plan-approved
  - <Path>{roots.state}/specdev/changes/2026-08-24-knowledge-multi-root-explorer-redesign/prototypes/PROTO-001/record.md</Path>
  - <Path>{roots.state}/specdev/archive/2026-08/2026-08-12-knowledge-workspace-resource-convergence/ADR.md</Path>
---

# Spec: Knowledge 多根 Explorer 与工作台树行统一

- **Spec：** `<Path>{roots.state}/specdev/changes/2026-08-24-knowledge-multi-root-explorer-redesign/spec.md</Path>`
- **原型答案：** `<Path>{roots.state}/specdev/changes/2026-08-24-knowledge-multi-root-explorer-redesign/prototypes/PROTO-001/record.md</Path>`

## 1. 问题与目标

### 问题陈述

Knowledge shell 使用独立 Sources 栏和 Resource Tree 重复表达来源，导致额外挂载目录与主目录在视觉上分裂；窄屏还会把 Sources 和 Tree 变成两个连续区块。Knowledge 树行另有一套间距、换行和选择样式，没有复用当前聊天工作台 DeskTree 的紧凑渲染。主来源名称还被 Renderer 强制覆盖为通用“工作目录”，无法呈现真实根名。

### 目标用户与场景

- 同时浏览当前主工作目录与 Knowledge 额外挂载目录的桌面用户。
- 依赖工作台文件图标、树缩进、完整名称提示、键盘选择、拖拽和右键操作的用户。
- 在窄窗口中使用 Knowledge 编辑器的用户。

### 成功标准

- `main` 和 mounted sources 在同一个 Explorer 中作为一级兄弟根呈现，主根固定在首位。
- 主根使用后端 `displayName`；只有 main DTO 暂时缺失时才使用现有本地化兜底名称。
- Desk 与 Knowledge 通过同一个纯 Renderer tree-row Module 获得一致行高、缩进、disclosure、文件图标和截断行为。
- 独立 Sources 栏删除，桌面和窄屏布局无重复来源、横向溢出或控件重叠。
- 既有 Knowledge 地址、选择、键盘、懒加载、watch、拖拽、打开和 mutation 行为不变。

### 非目标

- 不修改 SourceRegistry、KnowledgeSourceDto、ResourceIO、挂载注册、持久化或 Server route。
- 不统一 Desk 与 Knowledge 的 store、选择 reducer、加载缓存、拖拽 payload 或 mutation client。
- 不重设计搜索、编辑器、Current Resource Views 或 ContextMenu 命令集合。

## 2. 解决方案与外部行为

### 解决方案摘要

删除 Knowledge 独立 Sources 栏，把来源状态投影到已有 Explorer 区域；复用 SourceRegistry 已提供的来源顺序和显示名。提取只拥有树行 DOM 与视觉状态的共享 Module，DeskTree 与 KnowledgeResourceTree 分别作为适配器提供 depth、selection、expanded、icon、name 和事件。共享 Module 不读取 store、不执行 I/O，也不拥有交互状态机。

### 主要流程

1. 用户打开 Knowledge 后，只看到一个左侧 Explorer。
2. Explorer 第一层先显示 `main`，随后按来源列表顺序显示 mounted sources。
3. 展开任一来源时，继续通过现有 Knowledge client 按 `{sourceKey, relativePath}` 懒加载。
4. 根、目录和文件使用与当前聊天工作台一致的行结构与 `ICONS/getFileIcon` 图标。
5. 窄屏按 Search、Explorer、Editor、Current Views、Status 的单列顺序呈现。

### 边界、失败与稳定错误行为

- Sources loading/error 仍在 Explorer 内可见；错误保留现有 retry 行为。
- 单一来源 unavailable 或 list error 只影响该根，其他根和旧投影保持可用。
- 长名称使用单行省略，并在整行和名称上保留完整 `title`。
- 根节点不可用时保持现有 disabled/展开语义，不伪造空目录。

### 状态转换与不变量

- `main` 的 identity 仍为 `sourceKey: main`；显示名变化不改变资源 identity。
- 来源根始终是 `aria-level=1`；子目录层级从 2 递增。
- 共享树行只渲染 props；所有状态转换仍由调用方拥有。
- 跨来源 cut、同源 move、copy、trash 和 native grant 规则不变。

## 3. 用户故事

- **US-001**：作为多目录用户，我希望主目录与额外挂载目录在同一个树中并列，以便像 VS Code workspace 一样扫描和展开。
- **US-002**：作为工作台用户，我希望 Knowledge 使用相同的树行和文件图标，以便不学习第二套视觉语义。
- **US-003**：作为窄窗口用户，我希望只出现一个来源/目录区块，以便为编辑器保留足够空间。
- **US-004**：作为键盘和辅助技术用户，我希望重设计后保持现有 treeitem 层级、焦点和选择语义。

## 4. 验收合同

| ID | 前置条件 | 动作或事件 | 可观察结果 | 验证接缝 |
|---|---|---|---|---|
| AC-001 | 返回 main 与两个 mounted sources | 打开 Knowledge | 只存在一个 Resource Tree；三个来源均为一级兄弟根，main 位于首位 | KnowledgeWorkspace / KnowledgeResourceTree 组件测试 |
| AC-002 | main DTO 含真实 displayName | 渲染根节点 | 显示 DTO 名称而非强制“工作目录” | KnowledgeWorkspace 组件测试 |
| AC-003 | Desk 与 Knowledge 分别渲染目录和文件 | 检查树行 | 两者消费同一共享树行，并保持 28px 行结构与原有文件类型图标 | 共享 Module 与 Desk/Knowledge 回归测试 |
| AC-004 | 来源 loading/error/unavailable | 打开或重试 | 状态位于 Explorer 内；其他来源不消失；retry 仍调用原 onRetry | KnowledgeWorkspace / Tree 测试 |
| AC-005 | 600x720 窄窗口 | 打开 Knowledge | Search、Explorer、Editor、Views 顺序清晰且无重叠/横向溢出 | E2E-KW-023 + Playwright 截图 |
| AC-006 | 已展开、多选、键盘、拖拽和打开场景 | 执行既有操作 | 行为、地址 payload 和选择状态与改造前一致 | Knowledge tree 定向回归与 E2E-KW-015 |

## 5. 范围

### IN

- Knowledge shell 来源/树布局收敛。
- Desk 与 Knowledge 共用的纯树行 Renderer Module。
- 主根显示名修复、树行视觉统一和响应式调整。
- 受影响组件、E2E 和视觉验证。

### REUSE

- <Path>desktop/src/react/components/desk/DeskTree.tsx</Path> 的树行结构和交互布局。
- <Path>desktop/src/react/components/desk/desk-types.ts</Path> 的 `ICONS/getFileIcon`。
- <Path>desktop/src/react/components/knowledge-workspace/resource-tree-selection.ts</Path> 的选择状态机。
- 现有 Knowledge client、watch、drag controller、ContextMenu 和 Editor Groups。

### OUT

- **OOS-001**：不修改 core/server/shared Knowledge 合同；现有来源 DTO 已足够表达多根。
- **OOS-002**：不把 DeskTree 与 KnowledgeResourceTree 合并成一个有状态 Module；两者操作语义不同。
- **OOS-003**：不引入新的 icon 包、Tree library、存储字段或迁移。

## 6. 已锁定实现约束

- **DEC-001**：共享树行 Interface 只接受显示与事件 props，不读取 Zustand 或调用 client。来源：用户复用要求与原型答案。
- **DEC-002**：生产实现只保留 `multi-root-explorer` 赢家；不得带入 `?variant=`、switcher 或落选布局。来源：PROTO-001。
- **DEC-003**：使用 HanaKDE 现有 `ICONS/getFileIcon`，不自创文件 logo。来源：USER-DECISION:2026-08-24。
- **DEC-004**：KnowledgeSourceDto、地址和错误语义保持兼容。来源：既有 Resource Convergence ADR。

## 7. 数据、接口与兼容

- **公共接口变化：** 无；只新增 Renderer 内部 tree-row props。
- **数据模型与持久化：** 无。
- **兼容要求：** 保持所有 Knowledge HTTP DTO、store namespace 和 DOM data attributes；移除仅属于重复 Sources 栏的 region。
- **迁移要求：** 无。
- **发布或运维影响：** 无。

## 8. 非功能要求

- **NFR-001 安全与隐私：** Renderer 不获取新绝对路径或权限；原生动作继续经过现有 grant。
- **NFR-002 性能与容量：** 不增加来源 list、目录 list、watch 或渲染缓存；共享行不引入额外 effect。
- **NFR-003 可用性与可靠性：** 保持 roving focus、ARIA tree、完整名称 tooltip、亮暗主题和 600px 窄屏。
- **NFR-004 可观测性与运营：** 不适用；不新增运行时状态或远程操作。

## 9. 验证策略

| 接缝 | 层级 | 覆盖合同 | 现有先例或命令 | Evidence 类型 |
|---|---|---|---|---|
| Shared WorkspaceTreeRow | Renderer 单元 | AC-003 | 新增共享树行组件测试 | Vitest |
| KnowledgeWorkspace / ResourceTree | Renderer 组件 | AC-001/002/004/006 | `<Path>desktop/src/react/__tests__/components/KnowledgeWorkspace.test.tsx</Path>` 与 KnowledgeResourceTree tests | Vitest |
| DeskSection / DeskTree | Renderer 回归 | AC-003/006 | `<Path>desktop/src/react/__tests__/components/DeskSection.test.tsx</Path>` | Vitest |
| Knowledge shell desktop/narrow | E2E | AC-001/005/006 | `npm run test:knowledge:e2e:desktop -- E2E-KW-001-shell.spec.ts` | Playwright + screenshot |
| Repository gates | 静态/构建 | 全部 | `npm run typecheck`、目标 ESLint、`npm run lint:boundary`、`npm run build:client` | 命令结果 |

## 10. 风险、假设与未决问题

### 风险

- 共享树行若拥有交互状态，会耦合 Desk 与 Knowledge；通过纯 props Interface 控制。
- 删除 Sources region 会使旧 E2E 的 region 顺序断言失效；更新为单 Explorer 外部行为。

### 已采用的低影响假设

- SourceRegistry 列表继续保持 main 先于 mounted；Renderer 同时显式排序 main 以抵抗输入顺序变化。
- 当前 56rem/38rem breakpoint 继续使用，仅收敛 grid areas。

### 未决问题

无。用户已批准计划与实施；该局部 Ready Spec 直接进入 I-implement，不创建 Ticket/Map/Goal Plan。
