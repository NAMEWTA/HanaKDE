---
schema_version: 3
artifact: ticket
change: 2026-07-24-openhanako-knowledge-workspace
id: T-31
title: "交付表格与代码块编辑预览"
status: done
planning_depth: standard
planning_depth_reason: "历史完成 Ticket 的 SpecDev v3 兼容迁移；保留既有实现、验证与验收记录。"
ready: false
risk: medium
blocked_by: ["T-27"]
contract_ids: ["KW-US-073","KW-US-074","KW-US-075","KW-US-076","KW-RULE-MARKDOWN"]
owner: historical-implementer
expected_changes: ["<Path>{roots.state}/specdev/changes/2026-07-24-openhanako-knowledge-workspace/ticket/31-deliver-tables-and-code-blocks.md</Path>"]
writable_paths: []
read_only_paths: []
shared_paths: []
shared_path_owners: []
---
# Ticket 31: 交付表格与代码块编辑预览

- **被阻塞于：** [`27-deliver-live-preview-modes.md`](./27-deliver-live-preview-modes.md)
- **状态：** 已完成

## 战略与背景

- **战略：** 复用 table field 和现有代码围栏语义，提供安全编辑、源码暴露和错误隔离。
- **需求追踪：** KW-US-073, KW-US-074, KW-US-075, KW-US-076, KW-RULE-MARKDOWN
- **当前现状：** 当前实现接缝位于 `desktop/src/react/editor/table-field.ts`、`desktop/src/react/editor/md-decorations.ts`；本 ticket 只扩展这些公开边界。
- **用户可验证结果：** 完成本 ticket 后，验收者能够通过公开 API、真实临时 workspace 或可交互 UI 验证本标题声明的单一能力。

## 范围边界

| IN | REUSE | OUT |
|---|---|---|
| 复用 table field 和现有代码围栏语义，提供安全编辑、源码暴露和错误隔离。 | `desktop/src/react/editor/table-field.ts`<br>`desktop/src/react/editor/md-decorations.ts` | 未列入本 ticket 的后续功能；修改生成 bundle；创建平行文件系统、编辑器内核或私有 route 捷径 |

## 交付物

> 以下仅列主要交付物，不构成文件白名单或完整清单；为满足本 ticket 验收而新增/修改的同范围实现、类型、schema、fixture、测试、i18n 与文档同属交付物。

- `desktop/src/react/editor/knowledge-table-field.ts`
- `desktop/src/react/__tests__/editor/knowledge-table-field.test.ts`

## 实施时需阅读的文件

> 以下列出本 ticket 的具体代码接缝；实施前还必须按 [`README.md`](../README.md) 的文档权威关系读取 accepted [`LOG.md`](../LOG.md)、[`ADR.md`](../ADR.md)、[`CONTEXT.md`](../CONTEXT.md)、[`spec.md`](../spec.md) 及本 ticket 的固定实施契约，不能因本节或交付物未逐项复写而遗漏已确认结论。

- `desktop/src/react/editor/table-field.ts`
- `desktop/src/react/editor/md-decorations.ts`

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

**Primary ownership：** KW-US-073, KW-US-074, KW-US-075, KW-US-076

**必须创建或更新：**

- `desktop/src/react/__tests__/editor/knowledge-table-field.test.ts`
- `desktop/src/react/__tests__/editor/knowledge-code-block-field.test.ts`

**Playwright 用户流程：** 不适用；本 ticket 使用上述 Vitest 单元、组件、契约或集成测试，不运行 Playwright；下游或发布级用户流程可继续覆盖相关行为

## 验收标准

- [x] 光标进入时可编辑源码；非法表格/围栏保持文本；widget 销毁不泄漏 observer。
- [x] 本 ticket 拥有的每个 `KW-US-*` 都由上列精确测试直接证明；不存在范围兜底或 Ticket 57 代实现。
- [x] 本 ticket 拥有的每个 `KW-RULE-*` 都满足对应契约文档，并有正常、取消/冲突、权限/不可用和故障注入覆盖。
- [x] 相关既有回归、`npm run typecheck` 和 `npm run lint:boundary` 通过；涉及 composition、Renderer、preload/main 时运行相应 build。
- [x] ticket 交付记录只填写实际执行命令、平台和结果；普通执行结果不写入 `LOG.md`。
- [x] 交付物没有未决的“可能”“按需”“A 或 B”、未选框架、未选 schema 或未定义恢复语义。

## 实施交付记录

- **实现提交：** `b99576ce`
- **平台：** macOS Darwin 25.5.0 / Apple M5 arm64 / APFS；Node `v24.16.0` / npm `11.13.0`
- **GFM 表格：** `knowledgeTableField` 只在 inactive Live Preview 中以整块 replacement widget 派生静态 `<table>`；任意 header、delimiter、body caret/selection 触达都恢复同一 Markdown 源码缓冲区，Source 模式始终显示源码。
- **表格边界：** 删除旧 `contentEditable` cell、回写和自动重排实现；没有 spreadsheet/cell editor、toolbar、结构化持久层或隐式格式化。非法 delimiter/列定义保持文本，点击或 Enter/Space 仅移动 selection，不改变 document/history。
- **GFM 对齐：** `:---`、`:---:`、`---:`、`---` 分别只派生 left、center、right、default 展示；源码、冒号、空格和 inline Markdown 原样保留，预览单元格使用禁用 HTML 的共享 Markdown renderer。
- **普通围栏代码：** `knowledgeCodeBlockField` 在 inactive 时隐藏 opening/closing fence、保留静态 code body 与语言 parser 高亮；任意 fence/info/body/closing 触达时整块源码同时显露。未知/无语言退化为纯 monospaced text。
- **零执行：** JavaScript、Lua、query、template 与未知语言都没有 run/copy/output/line-number/toolbar DOM 或执行回调；普通字段显式跳过 Mermaid，继续由既有专用静态字段拥有。非法、错配或未闭合 fence 保持源码。
- **语言配置修复：** Markdown parser 以 CommonMark 基线同时配置 GFM、Subscript、Superscript、Emoji 与 `language-data`，修复旧 `base: markdownLanguage` 组合没有真正挂载 fenced-code nested parser 的问题；Markdown highlight 增加 code token 色彩。
- **软换行与清理：** 普通 code line 使用 mono font、`pre-wrap`、`overflow-wrap:anywhere` 与 `word-break:break-word`，容器变窄只改变视觉布局，不增加文档行或 undo history。新 table/code 字段不创建 observer；销毁时只有 CodeMirror 自身 observer 且由 EditorView disconnect。
- **五语言与可访问性：** zh-CN、zh-TW、en、ja、ko 均提供表格源码动作名称；widget 具备 focus ring、button role、ARIA label，并支持指针、Enter 与 Space。
- **精确自动化：** `npm test -- --exclude 'temp/**' desktop/src/react/__tests__/editor/knowledge-table-field.test.ts desktop/src/react/__tests__/editor/knowledge-code-block-field.test.ts`（2 files、25/25）。
- **相关回归：** `npm test -- --exclude 'temp/**' desktop/src/react/__tests__/editor/md-decorations.test.ts desktop/src/react/__tests__/components/PreviewEditor.block-handles.test.tsx desktop/src/react/__tests__/editor/typography.test.ts desktop/src/react/__tests__/editor/knowledge-live-preview.test.ts desktop/src/react/__tests__/lib/i18n-flat-keys.test.ts`（5 files、74/74）。
- **产品范围全仓：** `npm test -- --exclude 'temp/**'`（1041 files passed、1 skipped；10506 tests passed、6 skipped）。用户 ignored `temp/HanaKDE-TodoList-0.0.1` 未修改。
- **门禁与构建：** `npm run typecheck`、`npm run lint:boundary`、目标 ESLint、`git diff --check` 与 `npm run build:renderer` 通过；未改变 preload/main 或 Server。
- **IO/故障边界：** 本 ticket 是纯 Renderer projection，不发起 ResourceIO、保存、权限或复合 mutation，因此没有可伪造的取消/冲突/权限分支；Source 切换、非法 GFM/fence、未知语言、错配 closing fence 与销毁路径均 fail-safe 且零文档 mutation。
- **Playwright：** 按本 ticket 固定契约不适用，未运行。
- **Handoff：** `speculo/.speculo/commands/handoff/2026-07-29-openhanako-knowledge-workspace-implementation-31.md`
