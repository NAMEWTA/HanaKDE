# Ticket 12: 抽取策略驱动的共享 CM6 表面

- **被阻塞于：** [`01-freeze-real-repository-baseline.md`](./01-freeze-real-repository-baseline.md)、[`02-audit-silverbullet-reference.md`](./02-audit-silverbullet-reference.md)、[`11-define-markdown-semantic-ir.md`](./11-define-markdown-semantic-ir.md)
- **状态：** 已完成

## 战略与背景

- **战略：** 从 PreviewEditor 抽取共享表面，并注入 save、attachment、open-link 和 content-gate 策略。
- **需求追踪：** KW-US-057, KW-RULE-MARKDOWN
- **当前现状：** PreviewEditor 已有 CM6、600ms autosave、expected-version、checkpoint、表格、数学和 Mermaid。
- **用户可验证结果：** 完成本 ticket 后，验收者能够通过公开 API、真实临时 workspace 或可交互 UI 验证本标题声明的单一能力。

## 范围边界

| IN | REUSE | OUT |
|---|---|---|
| 从 PreviewEditor 抽取共享表面，并注入 save、attachment、open-link 和 content-gate 策略。 | `desktop/src/react/components/PreviewEditor.tsx`<br>`desktop/src/react/editor/`<br>`desktop/src/react/utils/markdown-attachments.ts` | 未列入本 ticket 的后续功能；修改生成 bundle；创建平行文件系统、编辑器内核或私有 route 捷径 |

## 交付物

> 以下仅列主要交付物，不构成文件白名单或完整清单；为满足本 ticket 验收而新增/修改的同范围实现、类型、schema、fixture、测试、i18n 与文档同属交付物。

- `desktop/src/react/components/preview/MarkdownEditorSurface.tsx`
- `desktop/src/react/editor/create-markdown-editor-extensions.ts`
- `desktop/src/react/__tests__/components/MarkdownEditorSurface.test.tsx`

## 实施时需阅读的文件

> 以下列出本 ticket 的具体代码接缝；实施前还必须按 [`README.md`](../README.md) 的文档权威关系读取 accepted [`LOG.md`](../LOG.md)、[`ADR.md`](../ADR.md)、[`CONTEXT.md`](../CONTEXT.md)、[`spec.md`](../spec.md) 及本 ticket 的固定实施契约，不能因本节或交付物未逐项复写而遗漏已确认结论。

- `desktop/src/react/components/PreviewEditor.tsx`
- `desktop/src/react/editor/`
- `desktop/src/react/utils/markdown-attachments.ts`

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

**Primary ownership：** KW-US-057

**必须创建或更新：**

- `desktop/src/react/__tests__/components/MarkdownEditorSurface.test.tsx`

**Playwright 用户流程：** 不适用；本 ticket 使用上述 Vitest 单元、组件、契约或集成测试，不运行 Playwright；下游或发布级用户流程可继续覆盖相关行为

## 验收标准

- [x] Preview 继续 600ms autosave 和原附件语义；Knowledge 手动保存；撤销历史与现有 decorations 无回归。
- [x] 本 ticket 拥有的每个 `KW-US-*` 都由上列精确测试直接证明；不存在范围兜底或 Ticket 57 代实现。
- [x] 本 ticket 拥有的每个 `KW-RULE-*` 都满足对应契约文档，并有正常、取消/冲突、权限/不可用和故障注入覆盖。
- [x] 相关既有回归、`npm run typecheck` 和 `npm run lint:boundary` 通过；涉及 composition、Renderer、preload/main 时运行相应 build。
- [x] ticket 交付记录只填写实际执行命令、平台和结果；普通执行结果不写入 `LOG.md`。
- [x] 交付物没有未决的“可能”“按需”“A 或 B”、未选框架、未选 schema 或未定义恢复语义。

## 交付记录

- 实现提交：`7618d296`。
- `MarkdownEditorSurface` 成为共享 CM6 生命周期内核，`create-markdown-editor-extensions.ts` 集中组装 history、Markdown language/highlight、既有 decorations、表格、数学、Mermaid、主题与 link handler；save、attachment、open-link 和 content-gate 均通过公开策略注入。
- `PreviewEditor` 收敛为薄适配器，继续使用 600ms autosave、expected-version、checkpoint 和原附件语义；Knowledge 策略使用显式手动保存，二者共享同一 undo/decorations 扩展集合。
- Knowledge Markdown content gate 以 fatal UTF-8 解码并在分配编辑缓冲前拒绝大于 10 MiB 的输入；BOM 被识别并从编辑正文移除，编码前拒绝非法 surrogate。scope binding 同时阻止切换文档时旧 autosave 草稿写入新目标。
- 精确验收：`npx vitest run desktop/src/react/__tests__/components/MarkdownEditorSurface.test.tsx`，8/8 通过；覆盖 autosave/manual save、策略注入、目标切换、strict UTF-8、10 MiB 边界和 BOM。
- 相关回归：`npx vitest run desktop/src/react/__tests__/components/MarkdownEditorSurface.test.tsx desktop/src/react/__tests__/components/PreviewEditor.file-sync.test.tsx desktop/src/react/__tests__/components/PreviewEditor.cover-drop.test.tsx desktop/src/react/__tests__/editor desktop/src/react/__tests__/utils/markdown-attachments.test.ts desktop/src/react/__tests__/utils/markdown-cover-drop.test.ts tests/markdown-knowledge-ir.test.ts tests/knowledge-baseline-contract.test.ts`，15 files、151/151 通过。
- 全仓回归：`npx vitest run --exclude '**/.claude/**' --exclude '**/.cache/**' --exclude '**/dist/**' --exclude '**/dist-server/**' --exclude '**/dist-computer-use/**' --exclude '**/dist-sandbox/**' --exclude 'temp/**'`，1014 files passed、1 skipped，10198 tests passed、6 skipped。
- `npm run typecheck`、`npm run lint:boundary`、目标文件 ESLint、`npm run build:renderer` 与 `git diff --check` 均通过；Renderer build 仅有既有 Vite 提示。
- 标准轴与规范轴复审均通过，0 blocker、0 nonblocker。
