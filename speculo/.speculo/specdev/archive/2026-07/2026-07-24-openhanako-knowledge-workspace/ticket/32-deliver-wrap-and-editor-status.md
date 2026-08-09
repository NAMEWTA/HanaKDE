---
schema_version: 3
artifact: ticket
change: 2026-07-24-openhanako-knowledge-workspace
id: T-32
title: "交付软换行与编辑器状态栏"
status: done
planning_depth: standard
planning_depth_reason: "历史完成 Ticket 的 SpecDev v3 兼容迁移；保留既有实现、验证与验收记录。"
ready: false
risk: medium
blocked_by: ["T-20","T-27"]
contract_ids: ["KW-US-077","KW-US-078","KW-US-079","KW-US-080","KW-US-081","KW-US-082","KW-US-083","KW-RULE-MARKDOWN"]
owner: historical-implementer
expected_changes: ["<Path>{roots.state}/specdev/changes/2026-07-24-openhanako-knowledge-workspace/ticket/32-deliver-wrap-and-editor-status.md</Path>"]
writable_paths: []
read_only_paths: []
shared_paths: []
shared_path_owners: []
---
# Ticket 32: 交付软换行与编辑器状态栏

- **被阻塞于：** [`20-deliver-groups-tabs-breadcrumbs.md`](./20-deliver-groups-tabs-breadcrumbs.md)、[`27-deliver-live-preview-modes.md`](./27-deliver-live-preview-modes.md)
- **状态：** 已完成

## 战略与背景

- **战略：** 实现每视图软换行和行列、编码、换行、mode、dirty、冲突状态投影。
- **需求追踪：** KW-US-077, KW-US-078, KW-US-079, KW-US-080, KW-US-081, KW-US-082, KW-US-083, KW-RULE-MARKDOWN
- **当前现状：** 当前实现接缝位于 `desktop/src/react/components/StatusBar.tsx`、`desktop/src/react/components/PreviewEditor.tsx`；本 ticket 只扩展这些公开边界。
- **用户可验证结果：** 完成本 ticket 后，验收者能够通过公开 API、真实临时 workspace 或可交互 UI 验证本标题声明的单一能力。

## 范围边界

| IN | REUSE | OUT |
|---|---|---|
| 实现每视图软换行和行列、编码、换行、mode、dirty、冲突状态投影。 | `desktop/src/react/components/StatusBar.tsx`<br>`desktop/src/react/components/PreviewEditor.tsx` | 未列入本 ticket 的后续功能；修改生成 bundle；创建平行文件系统、编辑器内核或私有 route 捷径 |

## 交付物

> 以下仅列主要交付物，不构成文件白名单或完整清单；为满足本 ticket 验收而新增/修改的同范围实现、类型、schema、fixture、测试、i18n 与文档同属交付物。

- `desktop/src/react/components/knowledge-workspace/KnowledgeEditorStatusBar.tsx`

## 实施时需阅读的文件

> 以下列出本 ticket 的具体代码接缝；实施前还必须按 [`README.md`](../README.md) 的文档权威关系读取 accepted [`LOG.md`](../LOG.md)、[`ADR.md`](../ADR.md)、[`CONTEXT.md`](../CONTEXT.md)、[`spec.md`](../spec.md) 及本 ticket 的固定实施契约，不能因本节或交付物未逐项复写而遗漏已确认结论。

- `desktop/src/react/components/StatusBar.tsx`
- `desktop/src/react/components/PreviewEditor.tsx`

## 固定实施契约

- [`architecture.md`](../architecture.md)
- [`spec.md`](../spec.md)

## 实施顺序

1. 先以当前真实文件和公开契约建立失败测试，不访问 Engine 私有字段。
2. 实现本 ticket 的最小垂直切片，复用 ResourceIO、共享 IR、coordinator 或既有 UI 接缝。
3. 补齐取消、冲突、权限/不可用、外部变化和清理路径。
4. 运行精确自动化、相关回归、typecheck 与 boundary 检查并记录实际结果。

## 实现约束

1. 普通资源访问必须经现有 ResourceIO/provider；复合 mutation 必须经公开 coordinator 和 Operation Journal。
2. Renderer 不访问 Node 文件系统；远程 DTO、日志和 release evidence 不含绝对路径、正文或凭证。
3. 测试使用隔离临时 HANA_HOME、workspace、来源和端口，不依赖开发机固定路径或网络。
4. 实现不得引入未在 ADR/实施契约冻结的新存储引擎、IPC path surface、恢复状态或 E2E 框架。
5. 本 ticket 新增 UI 同时交付 zh-CN、zh-TW、en、ja、ko、键盘、ARIA、focus、亮暗主题和窄布局。

## 自动化证据

**Primary ownership：** KW-US-077, KW-US-078, KW-US-079, KW-US-080, KW-US-081, KW-US-082, KW-US-083

**必须创建或更新：**

- `desktop/src/react/__tests__/components/KnowledgeEditorStatusBar.test.tsx`

**Playwright 用户流程：** 不适用；本 ticket 使用上述 Vitest 单元、组件、契约或集成测试，不运行 Playwright；下游或发布级用户流程可继续覆盖相关行为

## 验收标准

- [x] 不混用网络 StatusBar；状态来自 session/view 投影；窄布局可访问且不遮挡编辑器。
- [x] 本 ticket 拥有的每个 `KW-US-*` 都由上列精确测试直接证明；不存在范围兜底或 Ticket 57 代实现。
- [x] 本 ticket 拥有的每个 `KW-RULE-*` 都满足对应契约文档，并有正常、取消/冲突、权限/不可用和故障注入覆盖。
- [x] 相关既有回归、`npm run typecheck` 和 `npm run lint:boundary` 通过；涉及 composition、Renderer、preload/main 时运行相应 build。
- [x] ticket 交付记录只填写实际执行命令、平台和结果；普通执行结果不写入 `LOG.md`。
- [x] 交付物没有未决的“可能”“按需”“A 或 B”、未选框架、未选 schema 或未定义恢复语义。

## 实施交付记录

- **实现提交：** `972e4fa0`
- **平台：** macOS Darwin 25.5.0 / Apple M5 arm64 / APFS；Node `v24.16.0` / npm `11.13.0`
- **视觉软换行：** Knowledge Markdown 的同一 CM6 Surface 继续使用 `EditorView.lineWrapping`；Live Preview 与 Source 共享同一源码文档、selection 和 history，不增加 wrap 开关、固定折行列、硬换行或持久化状态。
- **真实源码导航：** Markdown 最高优先级 keymap 将 `↑/↓`、`Home/End` 及四种 Shift 组合固定映射到真实逻辑行和 1-based UTF-16 源码位置；短目标行落在真实行尾，不建立视觉行状态机。左右移动继续使用 CM6 唯一源码坐标。
- **无常驻行号：** Markdown 两种显示模式继续将 gutter compartment 配置为空；软换行不会派生视觉行号。
- **全局状态投影：** 新 `KnowledgeEditorStatusBar` 独立于网络 `StatusBar`，只订阅活动 Knowledge `view/session`；显示 selection 活动端的真实行、列和当前未保存 buffer 的 Unicode code point 总数，不显示 save/dirty/conflict/offline 等状态，也没有按钮、菜单或跳转。
- **多组与焦点：** `KnowledgeEditorGroups` 只在活动组/标签变化时上报目标；资源树或其他侧栏取得焦点不会清空最后活动 Markdown，切换到资产则隐藏整组 Markdown 文本。
- **稳定布局：** Knowledge workspace 保留一个跨三栏的固定 `1.75rem` 单行底栏；非 Markdown、加载失败、missing/source-unavailable 均保留空栏。CSS container query 在 22rem 以下整组 `display:none`，不截断、不换行、不出现省略号或横向滚动。
- **投影性能：** 行起点和 Unicode 字符总数按当前 buffer 缓存；仅移动光标时以二分查找投影行列，不重复扫描整份文档，不创建 `ResizeObserver` 或持久化状态。
- **五语言与可访问性：** zh-CN、zh-TW、en、ja、ko 均提供固定右侧自然语言格式；底栏为只读 `role=status`/`aria-live=polite` 文本，无 tabindex 或交互控件。
- **精确自动化：** `npm test -- --exclude 'temp/**' desktop/src/react/__tests__/components/KnowledgeEditorStatusBar.test.tsx desktop/src/react/__tests__/editor/knowledge-source-navigation.test.ts`（2 files、11/11；强制交付文件自身 8/8）。
- **相关回归：** `npm test -- --exclude 'temp/**' desktop/src/react/__tests__/components/KnowledgeEditorStatusBar.test.tsx desktop/src/react/__tests__/editor/knowledge-source-navigation.test.ts desktop/src/react/__tests__/components/KnowledgeEditorGroups.test.tsx desktop/src/react/__tests__/components/KnowledgeWorkspace.test.tsx desktop/src/react/__tests__/editor/knowledge-live-preview.test.ts desktop/src/react/__tests__/editor/knowledge-enter-commands.test.ts desktop/src/react/__tests__/editor/knowledge-command-registry.test.ts desktop/src/react/__tests__/lib/i18n-flat-keys.test.ts`（8 files、82/82）。
- **产品范围全仓：** 最终实现提交后执行 `npm test -- --exclude 'temp/**'`（1043 files passed、1 skipped；10517 tests passed、6 skipped）。用户 ignored `temp/HanaKDE-TodoList-0.0.1` 未修改。
- **门禁与构建：** `npm run typecheck`、`npm run lint:boundary`、目标 ESLint、`git diff --check` 与 `npm run build:renderer` 通过；未改变 preload/main 或 Server。
- **IO/故障边界：** 本 ticket 是纯 Renderer projection，不发起 ResourceIO、保存、权限或复合 mutation；反向 selection、未保存内容、缺失 view/session、missing/source-unavailable 与资产切换均 fail-safe，底栏无 observer/计时器清理路径。
- **Playwright：** 按本 ticket 固定契约不适用，未运行。
- **Handoff：** `speculo/.speculo/commands/handoff/2026-07-29-openhanako-knowledge-workspace-implementation-32.md`
