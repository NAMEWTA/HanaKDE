# Ticket 29: 交付 Tab 与 Shift+Tab 行级事务

- **被阻塞于：** [`27-deliver-live-preview-modes.md`](./27-deliver-live-preview-modes.md)
- **状态：** 已完成

## 战略与背景

- **战略：** 独立实现多行、列表、引用和普通文本的缩进/反缩进，不劫持可访问性焦点。
- **需求追踪：** KW-US-061, KW-US-062, KW-US-063, KW-RULE-MARKDOWN
- **当前现状：** 当前实现接缝位于 `desktop/src/react/editor/markdown-commands.ts`；本 ticket 只扩展这些公开边界。
- **用户可验证结果：** 完成本 ticket 后，验收者能够通过公开 API、真实临时 workspace 或可交互 UI 验证本标题声明的单一能力。

## 范围边界

| IN | REUSE | OUT |
|---|---|---|
| 独立实现多行、列表、引用和普通文本的缩进/反缩进，不劫持可访问性焦点。 | `desktop/src/react/editor/markdown-commands.ts` | 未列入本 ticket 的后续功能；修改生成 bundle；创建平行文件系统、编辑器内核或私有 route 捷径 |

## 交付物

> 以下仅列主要交付物，不构成文件白名单或完整清单；为满足本 ticket 验收而新增/修改的同范围实现、类型、schema、fixture、测试、i18n 与文档同属交付物。

- `desktop/src/react/editor/knowledge-indent-commands.ts`
- `desktop/src/react/__tests__/editor/knowledge-indent-commands.test.ts`

## 实施时需阅读的文件

> 以下列出本 ticket 的具体代码接缝；实施前还必须按 [`README.md`](../README.md) 的文档权威关系读取 accepted [`LOG.md`](../LOG.md)、[`ADR.md`](../ADR.md)、[`CONTEXT.md`](../CONTEXT.md)、[`spec.md`](../spec.md) 及本 ticket 的固定实施契约，不能因本节或交付物未逐项复写而遗漏已确认结论。

- `desktop/src/react/editor/markdown-commands.ts`

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

**Primary ownership：** KW-US-061, KW-US-062, KW-US-063

**必须创建或更新：**

- `desktop/src/react/__tests__/editor/knowledge-indent-commands.test.ts`

**Playwright 用户流程：** 不适用；本 ticket 使用上述 Vitest 单元、组件、契约或集成测试，不运行 Playwright；下游或发布级用户流程可继续覆盖相关行为

## 验收标准

- [x] 选区映射稳定；最小缩进不产生负层级；非编辑上下文 Tab 保留浏览器焦点语义。
- [x] 本 ticket 拥有的每个 `KW-US-*` 都由上列精确测试直接证明；不存在范围兜底或 Ticket 57 代实现。
- [x] 本 ticket 拥有的每个 `KW-RULE-*` 都满足对应契约文档，并有正常、取消/冲突、权限/不可用和故障注入覆盖。
- [x] 相关既有回归、`npm run typecheck` 和 `npm run lint:boundary` 通过；涉及 composition、Renderer、preload/main 时运行相应 build。
- [x] ticket 交付记录只填写实际执行命令、平台和结果；普通执行结果不写入 `LOG.md`。
- [x] 交付物没有未决的“可能”“按需”“A 或 B”、未选框架、未选 schema 或未定义恢复语义。

## 实施交付记录

- **实现提交：** `ee09a121`
- **平台：** macOS Darwin 25.5.0 / Apple M5 arm64 / APFS；Node `v24.16.0` / npm `11.13.0`
- **Surface 接入：** `knowledgeIndentCommand` / `knowledgeOutdentCommand` 以 Markdown-only、最高优先级 keymap 接入 Ticket 12 的单一 policy-driven Surface；只读 Markdown、text/code/csv 和非编辑上下文不接管 Tab，保留浏览器焦点语义。
- **空选区缩进：** 普通 Markdown 与任意语言 fenced code 的每个 caret 都只插入两个 ASCII spaces；不写 tab，不按语言改变宽度。
- **显式选区：** 非空单行选区按整行处理，多行与反向选区仅处理实际触及的行；选区末端恰在下一行行首时不包含该行，所有 selection/caret 通过同一 ChangeSet 稳定映射。
- **反缩进：** Shift+Tab 对每个当前/触及行最多删除行首两个 ASCII spaces；零空格不产生负层级，实际 tab 保持 byte-exact。
- **结构边界：** 不推断或联动列表后代、相邻行和未选中行，不修复 Markdown 结构，不重排已有有序列表编号；重复 Tab 可形成四个及以上前导空格。
- **事务与故障：** 多行、多 selection 每次只有一个 input transaction/undo step；无可删除空格时为已处理 no-op，dispatch 抛错前 EditorState 不变并原样上抛。
- **精确自动化：** `npx vitest run desktop/src/react/__tests__/editor/knowledge-indent-commands.test.ts`（1 file、18/18）。
- **相关回归：** `npx vitest run desktop/src/react/__tests__/editor/knowledge-indent-commands.test.ts desktop/src/react/__tests__/editor/knowledge-enter-commands.test.ts desktop/src/react/__tests__/editor/markdown-commands.test.ts desktop/src/react/__tests__/editor/knowledge-live-preview.test.ts desktop/src/react/__tests__/components/MarkdownEditorSurface.test.tsx tests/knowledge-tags-tasks.test.ts`（6 files、93/93）。
- **产品范围全仓：** `npm test -- --exclude 'temp/**'`（1037 files passed、1 skipped；10458 tests passed、6 skipped）。用户 ignored `temp/HanaKDE-TodoList-0.0.1` 未修改。
- **门禁与构建：** `npm run typecheck`、`npm run lint:boundary`、目标 ESLint、`git diff --check` 与 `npm run build:renderer` 通过；未改变 composition、preload/main 或 Server。
- **Playwright：** 按本 ticket 固定契约不适用，未运行。
- **Handoff：** `speculo/.speculo/commands/handoff/2026-07-29-openhanako-knowledge-workspace-implementation-29.md`
