# Ticket 33: 交付 Mermaid 与数学静态渲染

- **被阻塞于：** [`14-establish-malicious-workspace-tests.md`](./14-establish-malicious-workspace-tests.md)、[`27-deliver-live-preview-modes.md`](./27-deliver-live-preview-modes.md)、[`31-deliver-tables-and-code-blocks.md`](./31-deliver-tables-and-code-blocks.md)
- **状态：** 已完成

## 战略与背景

- **战略：** 复用现有 Mermaid/KaTeX，加入任务取消、缓存、错误隔离和安全配置。
- **需求追踪：** KW-US-084, KW-US-085, KW-US-086, KW-US-087, KW-RULE-MARKDOWN
- **当前现状：** 当前实现接缝位于 `desktop/src/react/editor/mermaid-field.ts`、`desktop/src/react/utils/mermaid-renderer.ts`、`desktop/src/react/editor/md-decorations.ts`；本 ticket 只扩展这些公开边界。
- **用户可验证结果：** 完成本 ticket 后，验收者能够通过公开 API、真实临时 workspace 或可交互 UI 验证本标题声明的单一能力。

## 范围边界

| IN | REUSE | OUT |
|---|---|---|
| 复用现有 Mermaid/KaTeX，加入任务取消、缓存、错误隔离和安全配置。 | `desktop/src/react/editor/mermaid-field.ts`<br>`desktop/src/react/utils/mermaid-renderer.ts`<br>`desktop/src/react/editor/md-decorations.ts` | 未列入本 ticket 的后续功能；修改生成 bundle；创建平行文件系统、编辑器内核或私有 route 捷径 |

## 交付物

> 以下仅列主要交付物，不构成文件白名单或完整清单；为满足本 ticket 验收而新增/修改的同范围实现、类型、schema、fixture、测试、i18n 与文档同属交付物。

- `desktop/src/react/editor/knowledge-mermaid-field.ts`
- `desktop/src/react/editor/knowledge-math-field.ts`

## 实施时需阅读的文件

> 以下列出本 ticket 的具体代码接缝；实施前还必须按 [`README.md`](../README.md) 的文档权威关系读取 accepted [`LOG.md`](../LOG.md)、[`ADR.md`](../ADR.md)、[`CONTEXT.md`](../CONTEXT.md)、[`spec.md`](../spec.md) 及本 ticket 的固定实施契约，不能因本节或交付物未逐项复写而遗漏已确认结论。

- `desktop/src/react/editor/mermaid-field.ts`
- `desktop/src/react/utils/mermaid-renderer.ts`
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
6. 复用现有 Mermaid renderer 的固定 strict 配置，但丢弃 `bindFunctions`，对返回 SVG 再消毒，并用 cancellation/stale-result guard 阻止旧任务覆盖；不假设不存在的 worker 隔离。

## 自动化证据

**Primary ownership：** KW-US-084, KW-US-085, KW-US-086, KW-US-087

**必须创建或更新：**

- `desktop/src/react/__tests__/editor/knowledge-mermaid-field.test.ts`
- `desktop/src/react/__tests__/editor/knowledge-math-field.test.ts`

**Playwright 用户流程：** 适用；运行 E2E-KW-011

## 验收标准

- [x] 恶意 Mermaid 配置、事件绑定与 SVG 不执行；过期渲染不能覆盖新结果；单块错误不破坏文档。
- [x] 本 ticket 拥有的每个 `KW-US-*` 都由上列精确测试直接证明；不存在范围兜底或 Ticket 57 代实现。
- [x] 本 ticket 拥有的每个 `KW-RULE-*` 都满足对应契约文档，并有正常、取消/冲突、权限/不可用和故障注入覆盖。
- [x] 相关既有回归、`npm run typecheck` 和 `npm run lint:boundary` 通过；涉及 composition、Renderer、preload/main 时运行相应 build。
- [x] ticket 交付记录只填写实际执行命令、平台和结果；普通执行结果不写入 `LOG.md`。
- [x] 交付物没有未决的“可能”“按需”“A 或 B”、未选框架、未选 schema 或未定义恢复语义。

## 实施交付记录

- **实现提交：** `c5383a20`
- **平台：** macOS Darwin 25.5.0 / Apple M5 arm64 / APFS；Node `v24.16.0` / npm `11.13.0`
- **单一 Live Preview 所有权：** `knowledge-mermaid-field.ts` 与 `knowledge-math-field.ts` 分别成为 Mermaid/数学唯一 CM6 decoration owner；旧 `mermaid-field.ts`、`md-decorations.ts` 只保留兼容导出，不建立第二份文档、selection、history 或派生持久化状态。
- **Mermaid 方言与刷新：** 识别标准 `````mermaid````` 围栏并尊重 opening fence 长度；任一 cursor 或非空 selection 与整个围栏相交时保留原始 Markdown，全部离开后才创建静态 widget，因此输入期间不逐键重绘，Source 模式始终不安装字段。
- **Mermaid 取消与缓存：** exact-source Promise LRU 上限 64，重复 source 去重；widget 销毁即以 `AbortSignal` 停止结果交付，Mermaid 公共 API 本身不可中断的事实保持显式，旧 task 只可填充安全缓存，不能回写已销毁或新版 DOM。
- **Mermaid 安全边界：** 固定 `securityLevel=strict`、顶层/flowchart `htmlLabels=false` 与 secure config keys；返回对象只读取 `svg`，从不调用 `bindFunctions`。SVG 经过元素/属性/fragment URL allowlist；CSS 只保留以生成 root ID 开头的 scoped rules 和安全声明，丢弃全局 selector、at-rule、动画、active URL、event、script、foreignObject 与 resource-bearing element，同时保留真实 Mermaid 文字和主题样式。
- **Mermaid 故障隔离：** 解析或消毒失败只在该 block 原位显示本地化非阻断错误；错误不含正文详情、不写源码、不进入 undo history，点击或 Enter/Space 回到围栏源码。
- **数学方言与刷新：** 支持行内 `$...$` 和独立 `$$...$$` block，忽略 escaped dollar、inline code 与 fenced code；任一 selection range 触碰元素即显示源码，全部离开后只调用一次 KaTeX。
- **KaTeX 安全与错误：** bundled KaTeX 使用 `throwOnError:true`、`strict:'error'`、`trust:false`；不可信命令不产生 active link/script。行内与块级失败均为可聚焦、可点击、可用 Enter/Space 返回源码的本地错误，不改变正文或历史，单个失败不影响同页有效公式。
- **五语言与布局：** zh-CN、zh-TW、en、ja、ko 提供 loading/error/edit-source 文案；Mermaid/math widget 均有 button role、ARIA、focus-visible、键盘回源、亮暗 token 与 560px 窄布局约束。
- **精确自动化：** `npx vitest run desktop/src/react/__tests__/editor/knowledge-mermaid-field.test.ts desktop/src/react/__tests__/editor/knowledge-math-field.test.ts --exclude 'temp/**'`（2 files、13/13），直接覆盖 KW-US-084–087、恶意 config/binding/SVG/CSS、缓存、取消/stale、错误隔离、多选区、Source 模式、KaTeX trust 与键盘/ARIA。
- **相关回归：** `npx vitest run desktop/src/react/__tests__/components/KnowledgeEditorStatusBar.test.tsx desktop/src/react/__tests__/editor/knowledge-code-block-field.test.ts desktop/src/react/__tests__/editor/knowledge-command-registry.test.ts desktop/src/react/__tests__/editor/knowledge-enter-commands.test.ts desktop/src/react/__tests__/editor/knowledge-indent-commands.test.ts desktop/src/react/__tests__/editor/knowledge-live-preview.test.ts desktop/src/react/__tests__/editor/knowledge-math-field.test.ts desktop/src/react/__tests__/editor/knowledge-mermaid-field.test.ts desktop/src/react/__tests__/editor/knowledge-table-field.test.ts desktop/src/react/__tests__/editor/md-decorations.test.ts desktop/src/react/__tests__/editor/mermaid-field.test.ts desktop/src/react/__tests__/utils/mermaid-renderer.test.ts --exclude 'temp/**'`（12 files、152/152）。
- **产品范围全仓：** 最终实现提交后执行 `npm test -- --exclude 'temp/**' --silent=passed-only`（1045 files passed、1 skipped；10530 tests passed、6 skipped）。用户 ignored `temp/HanaKDE-TodoList-0.0.1` 未修改。
- **门禁与构建：** `npm run typecheck`、`npm run lint:boundary`、目标 ESLint、`git diff --check` 与 `npm run build:renderer` 通过；未改变 preload/main、Server、ResourceIO 或 IPC。
- **IO/权限边界：** 本 ticket 只做 Renderer 内存派生，不读取资源、不发起网络/文件系统/权限请求或 mutation；取消、stale、非法语法与消毒失败 fail-safe，清理只有 widget `AbortController`。
- **Playwright：** E2E-KW-011 当前未执行；仓库尚无该 spec，真实资源树单击/双击/Enter/Space 打开 Markdown 的公开产品入口由 Tickets 48/49 交付。未创建私有 route、测试捷径或缩减场景；48/49 完成后必须补建并执行，最终发布前不得保留该缺口。
- **Handoff：** `speculo/.speculo/commands/handoff/2026-07-29-openhanako-knowledge-workspace-implementation-33.md`
