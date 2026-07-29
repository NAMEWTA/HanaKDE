# Ticket 30: 交付格式快捷键与斜杠命令

- **被阻塞于：** [`27-deliver-live-preview-modes.md`](./27-deliver-live-preview-modes.md)
- **状态：** 已完成

## 战略与背景

- **战略：** 建立 Knowledge 命令注册表，交付冻结的格式命令、键位冲突策略和斜杠菜单。
- **需求追踪：** KW-US-064, KW-US-065, KW-US-066, KW-US-067, KW-US-068, KW-US-069, KW-US-070, KW-US-071, KW-US-072, KW-RULE-MARKDOWN
- **当前现状：** 当前实现接缝位于 `desktop/src/react/editor/markdown-commands.ts`、`desktop/src/react/hooks/use-slash-items.ts`；本 ticket 在其上扩展 Knowledge 命令注册表与斜杠菜单（非 chat `components/slash/` 目录，该目录不存在）。
- **用户可验证结果：** 完成本 ticket 后，验收者能够通过公开 API、真实临时 workspace 或可交互 UI 验证本标题声明的单一能力。

## 范围边界

| IN | REUSE | OUT |
|---|---|---|
| 建立 Knowledge 命令注册表，交付冻结的格式命令、键位冲突策略和斜杠菜单。 | `desktop/src/react/editor/markdown-commands.ts`<br>`desktop/src/react/hooks/use-slash-items.ts` | 未列入本 ticket 的后续功能；修改生成 bundle；创建平行文件系统、编辑器内核或私有 route 捷径 |

## 交付物

> 以下仅列主要交付物，不构成文件白名单或完整清单；为满足本 ticket 验收而新增/修改的同范围实现、类型、schema、fixture、测试、i18n 与文档同属交付物。

- `desktop/src/react/editor/knowledge-command-registry.ts`
- `desktop/src/react/components/knowledge-workspace/KnowledgeSlashMenu.tsx`

## 实施时需阅读的文件

> 以下列出本 ticket 的具体代码接缝；实施前还必须按 [`README.md`](../README.md) 的文档权威关系读取 accepted [`LOG.md`](../LOG.md)、[`ADR.md`](../ADR.md)、[`CONTEXT.md`](../CONTEXT.md)、[`spec.md`](../spec.md) 及本 ticket 的固定实施契约，不能因本节或交付物未逐项复写而遗漏已确认结论。

- `desktop/src/react/editor/markdown-commands.ts`
- `desktop/src/react/hooks/use-slash-items.ts`

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

**Primary ownership：** KW-US-064, KW-US-065, KW-US-066, KW-US-067, KW-US-068, KW-US-069, KW-US-070, KW-US-071, KW-US-072

**必须创建或更新：**

- `desktop/src/react/__tests__/editor/knowledge-command-registry.test.ts`
- `desktop/src/react/__tests__/components/KnowledgeSlashMenu.test.tsx`

**Playwright 用户流程：** 不适用；本 ticket 使用上述 Vitest 单元、组件、契约或集成测试，不运行 Playwright；下游或发布级用户流程可继续覆盖相关行为

## 验收标准

- [x] 命令作用于同一 transaction/history；IME、只读和多光标场景不误触；菜单可全键盘操作。
- [x] 本 ticket 拥有的每个 `KW-US-*` 都由上列精确测试直接证明；不存在范围兜底或 Ticket 57 代实现。
- [x] 本 ticket 拥有的每个 `KW-RULE-*` 都满足对应契约文档，并有正常、取消/冲突、权限/不可用和故障注入覆盖。
- [x] 相关既有回归、`npm run typecheck` 和 `npm run lint:boundary` 通过；涉及 composition、Renderer、preload/main 时运行相应 build。
- [x] ticket 交付记录只填写实际执行命令、平台和结果；普通执行结果不写入 `LOG.md`。
- [x] 交付物没有未决的“可能”“按需”“A 或 B”、未选框架、未选 schema 或未定义恢复语义。

## 实施交付记录

- **实现提交：** `2f2827f8`
- **平台：** macOS Darwin 25.5.0 / Apple M5 arm64 / APFS；Node `v24.16.0` / npm `11.13.0`
- **固定注册表：** 单层 V1 集合精确包含粗体、斜体、行内代码、Markdown Link、Wikilink、H1–H6、无序/有序列表、任务、引用、围栏代码块和分隔线共 17 项；每项仅声明固定 id、名称/说明键、别名、图标、inline/block、模板、唯一 cursor 与可选快捷键，运行时深冻结。
- **格式快捷键：** writable Knowledge Markdown 以最高优先级接入 `Mod-B`、`Mod-I`、`Mod-K`、`Mod-\``；只处理显式单 selection 或 caret，不扩词，readonly、IME composition、多 cursor 和非 Knowledge Surface fail-closed，每次只有一个 input transaction/undo step。
- **任意位置触发：** 可写 Knowledge Markdown 的普通段落、fenced code、正文中间和 selection 替换均在实际键入 `/` 后开启；触发位置稳定映射，首个 Unicode whitespace、Esc、删除 `/`、selection/focus 离开或 composition 都关闭且不吞源码。
- **筛选与键盘：** Unicode 大小写不敏感连续子串仅匹配名称和固定别名；前缀优先、同类注册顺序稳定、空查询全量、无结果 Enter no-op；Arrow/Home/End/Enter/Esc 全键盘操作仅在菜单 active 时接管。
- **统一模板：** inline 命令原位替换本次 `/query`；block 命令仅在触发点非逻辑行首时前置一个换行。删除查询、必要换行、固定模板和唯一 cursor 始终是一个 transaction，所有 17 模板逐项验证单步 undo。
- **Link 与结构边界：** 斜杠 Markdown Link 固定插入 `[]()` 并把 cursor 放在 `[]` 内，不读取旧 selection、剪贴板或协议；不建立 Tab 占位、表单、动态参数或命令专用状态机。
- **菜单 UI：** `KnowledgeSlashMenu` 以当前 `/` 坐标锚定，按上下空间翻转并严格裁剪到当前编辑器组；单层 listbox 显示固定图标、五语言名称/单行说明和平台快捷键，当前项整行高亮、内部滚动、鼠标与窄布局可用。
- **精确自动化：** `npx vitest run desktop/src/react/__tests__/editor/knowledge-command-registry.test.ts desktop/src/react/__tests__/components/KnowledgeSlashMenu.test.tsx`（2 files、23/23）。
- **相关回归：** `npx vitest run desktop/src/react/__tests__/editor/knowledge-command-registry.test.ts desktop/src/react/__tests__/components/KnowledgeSlashMenu.test.tsx desktop/src/react/__tests__/editor/markdown-commands.test.ts desktop/src/react/__tests__/editor/knowledge-enter-commands.test.ts desktop/src/react/__tests__/editor/knowledge-indent-commands.test.ts desktop/src/react/__tests__/editor/knowledge-live-preview.test.ts desktop/src/react/__tests__/components/MarkdownEditorSurface.test.tsx desktop/src/react/__tests__/components/KnowledgeDocumentEditor.save.test.tsx tests/knowledge-i18n-a11y-contract.test.ts tests/knowledge-tags-tasks.test.ts`（10 files、129/129）。
- **产品范围全仓：** `npm test -- --exclude 'temp/**'`（1039 files passed、1 skipped；10481 tests passed、6 skipped）。用户 ignored `temp/HanaKDE-TodoList-0.0.1` 未修改。
- **门禁与构建：** `npm run typecheck`、`npm run lint:boundary`、目标 ESLint、`git diff --check` 与 `npm run build:renderer` 通过；未改变 preload/main 或 Server。
- **Playwright：** 按本 ticket 固定契约不适用，未运行。
- **Handoff：** `speculo/.speculo/commands/handoff/2026-07-29-openhanako-knowledge-workspace-implementation-30.md`
