# Ticket 39: 交付同源页面与章节嵌入

- **被阻塞于：** [`24-deliver-wikilink-markdown-links.md`](./24-deliver-wikilink-markdown-links.md)、[`33-deliver-mermaid-and-math.md`](./33-deliver-mermaid-and-math.md)、[`35-deliver-safe-html-and-external-links.md`](./35-deliver-safe-html-and-external-links.md)、[`37-deliver-wikilink-completion-navigation.md`](./37-deliver-wikilink-completion-navigation.md)
- **状态：** 已完成

## 战略与背景

- **战略：** 渲染只读整页/章节嵌入，保留源页面上下文，处理循环、深度、缺失和取消。
- **需求追踪：** KW-US-120, KW-RULE-MARKDOWN
- **当前现状：** 当前基座接缝是 `desktop/src/react/editor/`；LinkResolver 由 Ticket 23 交付，开始本 ticket 前必须存在。
- **用户可验证结果：** 完成本 ticket 后，验收者能够通过公开 API、真实临时 workspace 或可交互 UI 验证本标题声明的单一能力。

## 范围边界

| IN | REUSE | OUT |
|---|---|---|
| 渲染只读整页/章节嵌入，保留源页面上下文，处理循环、深度、缺失和取消。 | `desktop/src/react/editor/`<br>`lib/knowledge-workspace/link-resolver.ts` | 未列入本 ticket 的后续功能；修改生成 bundle；创建平行文件系统、编辑器内核或私有 route 捷径 |

## 交付物

> 以下仅列主要交付物，不构成文件白名单或完整清单；为满足本 ticket 验收而新增/修改的同范围实现、类型、schema、fixture、测试、i18n 与文档同属交付物。

- `desktop/src/react/editor/knowledge-embed-field.ts`
- `desktop/src/react/__tests__/editor/knowledge-embed-field.test.ts`

## 实施时需阅读的文件

> 以下列出本 ticket 的具体代码接缝；实施前还必须按 [`README.md`](../README.md) 的文档权威关系读取 accepted [`LOG.md`](../LOG.md)、[`ADR.md`](../ADR.md)、[`CONTEXT.md`](../CONTEXT.md)、[`spec.md`](../spec.md) 及本 ticket 的固定实施契约，不能因本节或交付物未逐项复写而遗漏已确认结论。

- `desktop/src/react/editor/`
- `lib/knowledge-workspace/link-resolver.ts`（由 Ticket 23 交付）

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

**Primary ownership：** KW-US-120

**必须创建或更新：**

- `desktop/src/react/__tests__/editor/knowledge-embed-field.test.ts`

**Playwright 用户流程：** 适用；运行 E2E-KW-009

## 验收标准

- [x] 循环 key 使用完整 KnowledgeResourceAddress；嵌入不重复进入宿主索引；内部链接按源页面解析。
- [x] 本 ticket 拥有的每个 `KW-US-*` 都由上列精确测试直接证明；不存在范围兜底或 Ticket 57 代实现。
- [x] 本 ticket 拥有的每个 `KW-RULE-*` 都满足对应契约文档，并有正常、取消/冲突、权限/不可用和故障注入覆盖。
- [x] 相关既有回归、`npm run typecheck` 和 `npm run lint:boundary` 通过；涉及 composition、Renderer、preload/main 时运行相应 build。
- [x] ticket 交付记录只填写实际执行命令、平台和结果；普通执行结果不写入 `LOG.md`。
- [x] 交付物没有未决的“可能”“按需”“A 或 B”、未选框架、未选 schema 或未定义恢复语义。

## 实施交付记录

- **实现提交：** `d80c3046`
- **平台：** macOS Darwin 25.5.0 / Apple arm64 / APFS；Node `v24.16.0` / npm `11.13.0`
- **嵌入边界：** Live Preview 只识别同来源整页 `![[Page.md]]` 与章节 `![[Page.md#Heading]]`；跨来源必须先复制。嵌入读取已保存磁盘快照，不读取源页面未保存 buffer，也不把派生内容写回宿主或源页面。
- **章节与递归：** heading 按大小写精确匹配首项；章节包含命中 heading 及其更深子标题，到下一个同级或更高级 heading 截止。循环键使用完整 `{sourceKey, relativePath}`，只终止循环分支并保留外层和兄弟分支；递归深度固定上限为 8。
- **安全与资源门禁：** 每次读取均先 stat，再按 10 MiB 与严格 UTF-8 门禁读取；缺失、不可用、取消、超限和非法内容均以独立非阻断状态收束。静态派生 DOM 复用共享 Markdown IR、LinkResolver、安全 HTML、Mermaid 与 math 接缝，不创建第二编辑器或第二 buffer，并移除主动元素和媒体来源。
- **交互与刷新：** 普通嵌入区域打开源 Page；显式内部链接、脚注、heading 与文本选择优先。源页面保存后只按同来源磁盘版本刷新当前宿主派生内容，宿主源码、cursor、scroll 与 undo history 保持不变；Source 模式保留原始语法。
- **索引与链接：** 嵌入内容不复制进入宿主索引；内部链接保持源页面所有权并相对源 Page 解析。缺失/循环/深度/读取错误互相隔离，取消的异步结果不能覆盖新状态。
- **UI：** 五语言错误、缺失、循环与深度消息已交付；静态只读容器显式 `contenteditable=false`，支持标准 OS 文本选择/复制、键盘激活、亮暗主题和窄布局。
- **精确自动化：** `npx vitest run desktop/src/react/__tests__/editor/knowledge-embed-field.test.ts desktop/src/react/__tests__/components/KnowledgeDocumentEditor.save.test.tsx desktop/src/react/__tests__/editor/knowledge-live-preview.test.ts --exclude 'temp/**' --reporter=dot`（3 files、30/30）；覆盖整页/章节、首个精确 heading、完整地址循环、深度、兄弟隔离、已保存磁盘读取、同大小版本刷新、selection/显式链接优先、Source literal 与强制同模式刷新状态保持。
- **相关回归：** embed、编辑器组合、同源链接、安全 HTML、Mermaid、math、脚注与共享安全渲染相关 11 files、93/93；最终产品范围全仓同时覆盖本票最终代码状态。
- **产品范围全仓：** `npm test -- --exclude 'temp/**'` 在实现提交前的同一代码状态真实退出 0（1056 files；1055 passed、1 skipped；10639 tests，10633 passed、6 skipped、0 failed）。
- **门禁与构建：** `npm run typecheck`、`npm run lint:boundary`、目标 ESLint 与 `git diff --check` 通过；Renderer production build 通过。
- **Playwright：** E2E-KW-009 当前未执行；仓库实际只有 `E2E-KW-001-shell.spec.ts`，不存在 E2E-KW-009 spec。未创建私有 route、测试捷径或缩减场景；Tickets 48/49 的真实资源树打开入口和 Ticket 46 backlinks 完成后必须补建并执行，最终发布前不得保留该缺口。
- **Handoff：** `speculo/.speculo/commands/handoff/2026-07-30-openhanako-knowledge-workspace-implementation-39.md`
