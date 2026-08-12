---
schema_version: 3
artifact: ticket
change: 2026-08-12-knowledge-workspace-resource-convergence
id: T-03
title: 复用工作台资源树右键动作与文件打开策略
status: done
planning_depth: standard
planning_depth_reason: "跨 Knowledge tree、通用 ContextMenu、Desk action、file-kind/remote preview 和 native capability 的 UI vertical slice；需保持 Web/remote 安全降级，但不改变文件协议。"
ready: true
risk: high
blocked_by: [T-01]
contract_ids: [AC-006, AC-007, AC-008, AC-013]
owner: current-implementer
expected_changes: ["<Path>desktop/src/react/components/knowledge-workspace/KnowledgeResourceTree.tsx</Path>", "<Path>desktop/src/react/components/knowledge-workspace/KnowledgeLayout.tsx</Path>", "<Path>desktop/src/react/components/knowledge-workspace/KnowledgeWorkspace.module.css</Path>", "<Path>desktop/src/react/components/desk/desk-types.ts</Path>", "<Path>desktop/src/react/ui/ContextMenu.tsx</Path>", "<Path>desktop/src/styles.css</Path>", "<Path>desktop/src/locales/en.json</Path>", "<Path>desktop/src/locales/zh.json</Path>", "<Path>desktop/src/locales/zh-TW.json</Path>", "<Path>desktop/src/locales/ja.json</Path>", "<Path>desktop/src/locales/ko.json</Path>", "<Path>desktop/src/react/services/knowledge-native-client.ts</Path>", "<Path>desktop/src/react/services/knowledge-workspace-client.ts</Path>", "<Path>desktop/main.cjs</Path>", "<Path>shared/knowledge-native-contract.ts</Path>", "<Path>core/knowledge-workspace/knowledge-native-grant-service.ts</Path>", "<Path>server/routes/knowledge-workspace.ts</Path>", "<Path>desktop/src/react/__tests__/components/KnowledgeResourceTree.test.tsx</Path>", "<Path>desktop/src/react/__tests__/components/KnowledgeWorkspace.test.tsx</Path>", "<Path>desktop/src/react/__tests__/services/knowledge-native-client.test.ts</Path>", "<Path>tests/knowledge-native-contract.test.ts</Path>", "<Path>tests/knowledge-native-grant.test.ts</Path>"]
writable_paths: ["<Path>desktop/src/react/components/knowledge-workspace/KnowledgeResourceTree.tsx</Path>", "<Path>desktop/src/react/components/knowledge-workspace/KnowledgeLayout.tsx</Path>", "<Path>desktop/src/react/components/knowledge-workspace/KnowledgeWorkspace.module.css</Path>", "<Path>desktop/src/react/components/desk/desk-types.ts</Path>", "<Path>desktop/src/react/ui/ContextMenu.tsx</Path>", "<Path>desktop/src/styles.css</Path>", "<Path>desktop/src/locales/en.json</Path>", "<Path>desktop/src/locales/zh.json</Path>", "<Path>desktop/src/locales/zh-TW.json</Path>", "<Path>desktop/src/locales/ja.json</Path>", "<Path>desktop/src/locales/ko.json</Path>", "<Path>desktop/src/react/services/knowledge-native-client.ts</Path>", "<Path>desktop/src/react/services/knowledge-workspace-client.ts</Path>", "<Path>desktop/main.cjs</Path>", "<Path>shared/knowledge-native-contract.ts</Path>", "<Path>core/knowledge-workspace/knowledge-native-grant-service.ts</Path>", "<Path>server/routes/knowledge-workspace.ts</Path>", "<Path>desktop/src/react/__tests__/components/KnowledgeResourceTree.test.tsx</Path>", "<Path>desktop/src/react/__tests__/components/KnowledgeWorkspace.test.tsx</Path>", "<Path>desktop/src/react/__tests__/services/knowledge-native-client.test.ts</Path>", "<Path>tests/knowledge-native-contract.test.ts</Path>", "<Path>tests/knowledge-native-grant.test.ts</Path>"]
read_only_paths: ["<Path>desktop/src/react/components/desk/DeskTree.tsx</Path>", "<Path>desktop/src/react/utils/file-kind.ts</Path>", "<Path>desktop/src/react/utils/remote-file-preview.ts</Path>", "<Path>tests/knowledge-native-route-security.test.ts</Path>"]
shared_paths: ["<Path>desktop/src/react/ui/ContextMenu.tsx</Path>"]
shared_path_owners: ["<Path>desktop/src/react/ui/ContextMenu.tsx</Path> => T-03"]
---

# Ticket T-03: 复用工作台资源树右键动作与文件打开策略

- **Ticket 文件：** `<Path>{roots.state}/specdev/changes/{change}/ticket/03-reuse-desk-resource-tree-actions.md</Path>`
- **总体 Map：** `<Path>{roots.state}/specdev/changes/{change}/tickets-map.md</Path>`
- **上游 Spec：** `<Path>{roots.state}/specdev/changes/{change}/spec.md</Path>`
- **完成 Evidence：** `<Path>{roots.state}/specdev/changes/{change}/evidence/T-03.md</Path>`

## 1. 战略与来源

- **目标：** 让 Knowledge resource tree 使用工作台已有 ContextMenu/action/open policy；文件与文件夹右键可执行适用的剪切、复制、删除、重命名、复制相对/绝对路径、打开文件夹和默认应用打开。
- **可观察产出：** 用户在 Knowledge 树右键单选/多选得到与 Desk 一致的动作集合；`.md/.markdown` 进入 Knowledge editor，`.pdf/.jpg/.html` 等按既有 `file-kind`/remote preview 打开；Web/远程无 native grant 时隐藏绝对路径、Finder/reveal、默认应用。
- **来源：** `US-003`、`US-004`、`AC-006`、`AC-007`、`AC-008`、`AC-013`、`ADR-002`、`DEC-004`、`USER-DECISION:2026-08-12-knowledge-resource-convergence`。
- **当前事实：** `<Path>desktop/src/react/components/knowledge-workspace/KnowledgeResourceTree.tsx</Path>` 目前只有 selection/drag/open 和 homemade SVG 文件/文件夹图标；`onContextMenu` 只更新 selection。Desk action 位于 `<Path>desktop/src/react/components/desk/DeskTree.tsx</Path>`，通用菜单 `<Path>desktop/src/react/ui/ContextMenu.tsx</Path>` 尚无 icon/aria 投影字段。
- **Planning Depth 原因：** 需跨 UI/能力适配和安全降级；共享 ContextMenu 是单一 owner，所有动作只能调用现有 client/native bridge，不可在 renderer 直读 FS。

## 2. 决策状态

### 已锁定决策

- 复用 Desk 的 action 语义、file-kind、remote preview、Native Grant 和现有 preview/open services；只增加 KnowledgeAddress→既有输入的最小 adapter。
- `ContextMenu` 可接受 icon/accessible name 投影；熟悉命令 icon-first，陌生/高风险动作保留短文字 label 和 tooltip/ARIA。
- `.md` 使用 Knowledge editor；其它扩展按既有 preview/file-info fallback；默认应用/reveal/absolute path 只有有效 native grant 和本地 runtime 才显示。
- 同源 cut/copy/delete/rename 委托既有 Knowledge client/coordinator；跨来源 cut 的 fail-closed 结果由 T-04 提供。

### 已采用的低影响假设

- 现有 UI icon 依赖若没有统一 lucide 包，则沿 repo 已有 SVG/icon primitive 适配 ContextMenu，不另建图标资源系统。
- Knowledge tree 的 source capability 字段足够判定 list/write/native；若需增加 capability projection，保持可选向后兼容。

### 未决问题

无。

## 3. 范围边界

| IN（本 Ticket 构建） | REUSE（复用且不改变契约） | OUT（明确不做） |
|---|---|---|
| tree context state、菜单动作投影、icon/ARIA、file-kind/open delegation、Web/remote capability hiding、相关 UI/utility tests | DeskTree action callbacks、ContextMenu portal/CSS、knowledge client/native grant、remote preview/open services | 另造文件树/parser/preview、renderer Node FS、修改 ResourceIO DTO、跨来源移动、永久删除 |

## 4. 要构建什么

用户在资源树的 file/folder 行上右键。树先将目标纳入既有 selection，再根据 source capabilities、runtime 和 Native Grant 可用性构建 ContextMenu。菜单动作调用 client 的 copy/cut/trash/operation 或现有 native grant，不把绝对路径传给 renderer 以外的非授权入口。选择打开文件时，Markdown 走 editor，PDF/图片/HTML/代码等走已有 preview/file-info；目录提供 open folder/reveal。菜单关闭后树和 editor 只接收一次 projection；不具备能力的动作隐藏或禁用并保持可解释名称。

## 5. 实现契约

- **入口或接缝：** KnowledgeResourceTree row `onContextMenu`/open；KnowledgeLayout action handlers；generic `ContextMenuItem` icon/aria extension；`file-kind.ts` 与 `remote-file-preview.ts` 既有 helper。
- **输入与输出：** selected KnowledgeResourceAddress[] + source capability/runtime → ContextMenuItem[]；action → existing client/native/preview side effect or stable capability failure。
- **公共接口变化：** 仅 ContextMenu item 的可选 icon/aria/tooltip projection（向后兼容）；不新增资源 DTO 或绝对路径字段。
- **不变量：** menu action 只消费 source-relative address；Web/remote 不显示 raw path/native action；同一 click 不重复 mutation；所有 unfamiliar icon 有 accessible name。
- **状态或数据流：** context event → selection normalization → capability projection → menu action → client/native/preview → existing event/tree/editor projection。
- **错误与失败行为：** capability 不足时隐藏/禁用；旧入口直接调用仍返回既有 precondition/capability error；错误不伪造成功、不绕过 grant。
- **兼容要求：** Desk menu 行为、Markdown editor、remote preview、native bridge、现有 ContextMenu 消费者不回归。
- **安全与隐私要求：** absolute path 只在受 Native Grant 的本地动作内部短暂使用；Web/remote 和无 grant 不泄露路径。

## 6. 执行路线

1. 为 ContextMenu item 与 Knowledge tree tests 固定 file/folder、native/remote、icon/ARIA 和 open policy 的红灯矩阵。
2. 抽取/适配 Desk action 的输入，不复制 Desk 的 provider、watcher 或 preview 逻辑；把 Knowledge source capability 映射为菜单能力。
3. 接入 tree context state、selection normalization 和现有 ContextMenu portal；为单选/多选、目录/文件和目标目录动作建立稳定 callback。
4. 复用 file-kind/remote preview/Knowledge editor open；按 Native Grant/runtime 隐藏或禁用 reveal/default-app/absolute path。
5. 运行组件、utility、native security 回归，检查文本溢出、tooltip/ARIA 与一次性 projection。

## 7. 路径访问契约

- **预计修改点：** frontmatter `expected_changes` 中的 tree/layout/menu/utilities/tests。
- **可写范围：** 仅 frontmatter `writable_paths`；ContextMenu 是本 Ticket 的唯一 shared owner。
- **只读上下文：** DeskTree、knowledge client/native client、永久安全 ADR、native route tests。
- **共享路径：** `<Path>desktop/src/react/ui/ContextMenu.tsx</Path>`。
- **shared path owner：** 仅 T-03 修改 ContextMenu；其它未来 Ticket 只读其新可选字段。
- **保留或不动：** 不改 DeskTree action source，不引入第二菜单或 icon registry。

## 8. 验证矩阵

| 行为或风险 | 验证接缝 | 命令或步骤 | 预期结果 | Evidence |
|---|---|---|---|---|
| 右键动作 | KnowledgeResourceTree component | `npm test -- --run desktop/src/react/__tests__/components/KnowledgeResourceTree.test.tsx` | file/folder 单选/多选显示适用 cut/copy/delete/rename/path/open actions | `<Path>{roots.state}/specdev/changes/{change}/evidence/T-03.md</Path>` |
| 打开策略 | tree + utility tests | `npm test -- --run desktop/src/react/__tests__/utils/file-kind.test.ts desktop/src/react/__tests__/utils/remote-file-preview.test.ts` | md→editor；pdf/jpg/html→既有 preview/file-info/default policy | `<Path>{roots.state}/specdev/changes/{change}/evidence/T-03.md</Path>` |
| native/privacy fallback | component + security tests | Knowledge tree capability tests；`npm test -- --run tests/knowledge-native-grant.test.ts tests/knowledge-native-route-security.test.ts` | Web/remote/no grant 隐藏 absolute/Finder/default-app，不泄漏路径 | `<Path>{roots.state}/specdev/changes/{change}/evidence/T-03.md</Path>` |
| icon/a11y | UI component/static inspection | menu item icon + tooltip/ARIA assertions，`git diff --check` | 熟悉命令 icon-first；陌生命令可读；无溢出 | `<Path>{roots.state}/specdev/changes/{change}/evidence/T-03.md</Path>` |
| 回归 | existing Desk/ContextMenu consumers | 运行相关 Desk/ContextMenu component tests | 既有工作台菜单行为保持 | `<Path>{roots.state}/specdev/changes/{change}/evidence/T-03.md</Path>` |

## 9. 发布、迁移与恢复

- **迁移顺序：** 先扩展 ContextMenu 可选投影，再迁移 Knowledge consumer；不删除旧 Desk item 形式，确认调用点后保留兼容。
- **兼容窗口：** icon/aria/tooltip 字段可选，旧消费者继续只提供 label/action。
- **监控信号：** 不新增服务指标；记录 capability projection、native grant rejection 和 preview fallback 的测试 Evidence。
- **回滚或前向恢复：** 可回退 Knowledge tree adapter 或仅关闭新菜单入口；文件事实由既有 client/coordinator 保持不变。
- **不可逆操作与批准点：** delete 继续受现有确认/Trash contract；无永久删除批准点。
- **收缩条件：** 无第二 Knowledge menu/parser/icon/preview owner；ContextMenu 的旧调用点保持可编译。

## 10. 验收标准

- [x] `AC-006`：资源树右键复用工作台动作，提供适用的文件/文件夹操作。
- [x] `AC-007`：md/pdf/jpg/html 等打开路径复用现有 file-kind、preview/editor/default-app policy。
- [x] `AC-008`：Web/remote/no-grant 隐藏 absolute/Finder/default-app，不能伪造成功。
- [x] `AC-013`：菜单 icon-first，tooltip/ARIA 完整且无文字溢出。
- [x] 正常、失败、回归和必要 E2E 证据记录到 `<Path>{roots.state}/specdev/changes/{change}/evidence/T-03.md</Path>`。
