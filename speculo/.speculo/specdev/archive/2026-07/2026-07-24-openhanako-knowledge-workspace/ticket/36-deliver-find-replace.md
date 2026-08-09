---
schema_version: 3
artifact: ticket
change: 2026-07-24-openhanako-knowledge-workspace
id: T-36
title: "交付当前 Markdown 文档查找替换"
status: done
planning_depth: standard
planning_depth_reason: "历史完成 Ticket 的 SpecDev v3 兼容迁移；保留既有实现、验证与验收记录。"
ready: false
risk: medium
blocked_by: ["T-20","T-27"]
contract_ids: ["KW-US-095","KW-US-096","KW-US-097","KW-US-098","KW-US-099","KW-US-100","KW-US-101","KW-US-102","KW-US-103","KW-US-104","KW-US-105","KW-US-106","KW-US-107","KW-US-108","KW-US-109","KW-US-110","KW-US-111","KW-US-112","KW-RULE-MARKDOWN"]
owner: historical-implementer
expected_changes: ["<Path>{roots.state}/specdev/changes/2026-07-24-openhanako-knowledge-workspace/ticket/36-deliver-find-replace.md</Path>"]
writable_paths: []
read_only_paths: []
shared_paths: []
shared_path_owners: []
---
# Ticket 36: 交付当前 Markdown 文档查找替换

- **被阻塞于：** [`20-deliver-groups-tabs-breadcrumbs.md`](./20-deliver-groups-tabs-breadcrumbs.md)、[`27-deliver-live-preview-modes.md`](./27-deliver-live-preview-modes.md)
- **状态：** 已完成

## 战略与背景

- **战略：** 实现当前 buffer 内查找、大小写/全词/正则冻结语义、替换、选区与零宽匹配处理。
- **需求追踪：** KW-US-095, KW-US-096, KW-US-097, KW-US-098, KW-US-099, KW-US-100, KW-US-101, KW-US-102, KW-US-103, KW-US-104, KW-US-105, KW-US-106, KW-US-107, KW-US-108, KW-US-109, KW-US-110, KW-US-111, KW-US-112, KW-RULE-MARKDOWN
- **当前现状：** 当前实现接缝位于 `desktop/src/react/utils/find-marks.ts`、`desktop/src/react/components/chat/ChatFindBar.tsx`；本 ticket 只扩展这些公开边界。
- **用户可验证结果：** 完成本 ticket 后，验收者能够通过公开 API、真实临时 workspace 或可交互 UI 验证本标题声明的单一能力。

## 范围边界

| IN | REUSE | OUT |
|---|---|---|
| 实现当前 buffer 内查找、大小写/全词/正则冻结语义、替换、选区与零宽匹配处理。 | `desktop/src/react/utils/find-marks.ts`<br>`desktop/src/react/components/chat/ChatFindBar.tsx` | 未列入本 ticket 的后续功能；修改生成 bundle；创建平行文件系统、编辑器内核或私有 route 捷径 |

## 交付物

> 以下仅列主要交付物，不构成文件白名单或完整清单；为满足本 ticket 验收而新增/修改的同范围实现、类型、schema、fixture、测试、i18n 与文档同属交付物。

- `desktop/src/react/components/knowledge-workspace/KnowledgeFindBar.tsx`
- `desktop/src/react/__tests__/components/KnowledgeFindBar.test.tsx`

## 实施时需阅读的文件

> 以下列出本 ticket 的具体代码接缝；实施前还必须按 [`README.md`](../README.md) 的文档权威关系读取 accepted [`LOG.md`](../LOG.md)、[`ADR.md`](../ADR.md)、[`CONTEXT.md`](../CONTEXT.md)、[`spec.md`](../spec.md) 及本 ticket 的固定实施契约，不能因本节或交付物未逐项复写而遗漏已确认结论。

- `desktop/src/react/utils/find-marks.ts`
- `desktop/src/react/components/chat/ChatFindBar.tsx`

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

**Primary ownership：** KW-US-095, KW-US-096, KW-US-097, KW-US-098, KW-US-099, KW-US-100, KW-US-101, KW-US-102, KW-US-103, KW-US-104, KW-US-105, KW-US-106, KW-US-107, KW-US-108, KW-US-109, KW-US-110, KW-US-111, KW-US-112

**必须创建或更新：**

- `desktop/src/react/__tests__/components/KnowledgeFindBar.test.tsx`

**Playwright 用户流程：** 适用；运行 E2E-KW-012

## 验收标准

- [x] 只作用当前 view/session；替换进入单一历史；无效正则不修改文档。
- [x] 本 ticket 拥有的每个 `KW-US-*` 都由上列精确测试直接证明；不存在范围兜底或 Ticket 57 代实现。
- [x] 本 ticket 拥有的每个 `KW-RULE-*` 都满足对应契约文档，并有正常、取消/冲突、权限/不可用和故障注入覆盖。
- [x] 相关既有回归、`npm run typecheck` 和 `npm run lint:boundary` 通过；涉及 composition、Renderer、preload/main 时运行相应 build。
- [x] ticket 交付记录只填写实际执行命令、平台和结果；普通执行结果不写入 `LOG.md`。
- [x] 交付物没有未决的“可能”“按需”“A 或 B”、未选框架、未选 schema 或未定义恢复语义。

## 实施交付记录

- **实现提交：** `ec2531cc`
- **平台：** macOS Darwin 25.5.0 / Apple arm64 / APFS；Node `v24.16.0` / npm `11.13.0`
- **当前源码与字面查询：** CM6 `SearchQuery` 固定 `literal: true`、`regexp: false`，默认 Unicode 不区分大小写，并提供显式大小写与 Unicode whole-word 切换。查找直接读取活动 Markdown `EditorState`，因此覆盖未提交 buffer 和 Live Preview 隐藏语法；单行真实源码 selection 初始化查询，多行 selection 回退为空查询并从当前 cursor 激活。
- **导航与事务：** 上一项/下一项首尾循环并显示当前/总数；单次替换使用一个 CM6 transaction，按替换后范围之后的 match start 激活下一项；全部替换冻结执行前匹配集合，在一个 transaction 内完成并形成单一 undo 步骤。查询、替换与正则元字符均按字面处理；空查询、无匹配、唯一匹配和只读状态保持启用但安全空操作。
- **唯一会话 owner：** `KnowledgeEditorGroups` 持有唯一 find session 与各组 EditorView 注册表。相同组切换 Markdown tab 保留查询、替换和 toggles，并从新文档自身 cursor 重算；切换组、Asset、文档不可用或 workspace 会关闭旧会话。Viewer 继续拥有自己的 find 能力，不共享 Markdown 状态。
- **非模态 UI：** `KnowledgeFindBar` 是编辑组右上角 absolute overlay，不改变布局；全部匹配与当前匹配使用 CM6 decorations 区分，文档变化实时重算，并用 overlay 高度作为 `scrollIntoView` margin。Mod-F/Mod-H 重入只聚焦对应输入且保留状态；未注册 F3。
- **键盘、隐私与国际化：** Esc 与关闭按钮都保留当前 match selection/scroll、清除专用 highlights 并将焦点还给 editor；可见 controls 形成固定封闭 focus loop。状态只存在于 React/CM6 会话内，关闭即销毁，不建立历史、建议、持久化或日志。zh-CN、zh-TW、en、ja、ko、ARIA、focus-visible、亮暗 token 与窄布局已交付。
- **精确自动化：** `npx vitest run desktop/src/react/__tests__/components/KnowledgeFindBar.test.tsx --exclude 'temp/**' --reporter=dot`（17/17）；覆盖真实源码/selection、Unicode 大小写与全词、字面 metacharacter、wrap/count、单次/全部替换、undo、只读/边界空操作、实时 highlights、焦点循环、状态隐私、同组/跨组/Asset/不可用组合入口。
- **相关回归：** Ticket 精确测试加 groups、document save、Markdown surface/status、Live Preview、Enter/indent/source navigation、link/footnote/safe HTML 与五语言 key 共 `13 files、135/135`。
- **产品范围全仓：** `npm test -- --exclude 'temp/**' --reporter=json --outputFile=/tmp/hana-ticket36-vitest-rerun.json` 在实现提交前的同一代码状态真实退出 0（2778 suites；10587 tests，10581 passed、6 skipped、0 failed）。
- **门禁与构建：** `npm run typecheck`、`npm run lint:boundary`、目标 ESLint、`git diff --check`、锁文件 offline dry-run、baseline/preflight、style discipline 与 `npm run build:renderer` 通过。
- **Playwright：** E2E-KW-012 当前未执行；仓库尚无该 spec，真实资源树单击/双击/Enter/Space 打开 Markdown 的公开入口由 Tickets 48/49 交付。未创建私有 route、测试捷径或缩减场景；48/49 完成后必须补建并执行，最终发布前不得保留该缺口。
- **Handoff：** `speculo/.speculo/commands/handoff/2026-07-29-openhanako-knowledge-workspace-implementation-36.md`
