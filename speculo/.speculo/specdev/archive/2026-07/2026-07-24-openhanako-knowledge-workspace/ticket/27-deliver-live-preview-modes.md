---
schema_version: 3
artifact: ticket
change: 2026-07-24-openhanako-knowledge-workspace
id: T-27
title: "交付 Live Preview 与源码模式状态"
status: done
planning_depth: standard
planning_depth_reason: "历史完成 Ticket 的 SpecDev v3 兼容迁移；保留既有实现、验证与验收记录。"
ready: false
risk: medium
blocked_by: ["T-12","T-18","T-24"]
contract_ids: ["KW-US-055","KW-US-056","KW-RULE-MARKDOWN"]
owner: historical-implementer
expected_changes: ["<Path>{roots.state}/specdev/changes/2026-07-24-openhanako-knowledge-workspace/ticket/27-deliver-live-preview-modes.md</Path>"]
writable_paths: []
read_only_paths: []
shared_paths: []
shared_path_owners: []
---
# Ticket 27: 交付 Live Preview 与源码模式状态

- **被阻塞于：** [`12-extract-policy-driven-cm6-surface.md`](./12-extract-policy-driven-cm6-surface.md)、[`18-establish-document-session-registry.md`](./18-establish-document-session-registry.md)、[`24-deliver-wikilink-markdown-links.md`](./24-deliver-wikilink-markdown-links.md)
- **状态：** 已完成

## 战略与背景

- **战略：** 复用现有 decorations，实现光标所在语法暴露、源码模式切换和每视图 mode/scroll 保持。
- **需求追踪：** KW-US-055, KW-US-056, KW-RULE-MARKDOWN
- **当前现状：** 当前实现接缝位于 `desktop/src/react/editor/md-decorations.ts`、`desktop/src/react/__tests__/editor/md-decorations.test.ts`；本 ticket 只扩展这些公开边界。
- **用户可验证结果：** 完成本 ticket 后，验收者能够通过公开 API、真实临时 workspace 或可交互 UI 验证本标题声明的单一能力。

## 范围边界

| IN | REUSE | OUT |
|---|---|---|
| 复用现有 decorations，实现光标所在语法暴露、源码模式切换和每视图 mode/scroll 保持。 | `desktop/src/react/editor/md-decorations.ts`<br>`desktop/src/react/__tests__/editor/md-decorations.test.ts` | 未列入本 ticket 的后续功能；修改生成 bundle；创建平行文件系统、编辑器内核或私有 route 捷径 |

## 交付物

> 以下仅列主要交付物，不构成文件白名单或完整清单；为满足本 ticket 验收而新增/修改的同范围实现、类型、schema、fixture、测试、i18n 与文档同属交付物。

- `desktop/src/react/editor/knowledge-live-preview.ts`
- `desktop/src/react/__tests__/editor/knowledge-live-preview.test.ts`

## 实施时需阅读的文件

> 以下列出本 ticket 的具体代码接缝；实施前还必须按 [`README.md`](../README.md) 的文档权威关系读取 accepted [`LOG.md`](../LOG.md)、[`ADR.md`](../ADR.md)、[`CONTEXT.md`](../CONTEXT.md)、[`spec.md`](../spec.md) 及本 ticket 的固定实施契约，不能因本节或交付物未逐项复写而遗漏已确认结论。

- `desktop/src/react/editor/md-decorations.ts`
- `desktop/src/react/__tests__/editor/md-decorations.test.ts`

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

**Primary ownership：** KW-US-055, KW-US-056

**必须创建或更新：**

- `desktop/src/react/__tests__/editor/knowledge-live-preview.test.ts`

**Playwright 用户流程：** 适用；运行 E2E-KW-005

## 验收标准

- [x] 两种模式共享 buffer/history；切换不保存文件；同页不同视图可使用不同 mode。
- [x] 本 ticket 拥有的每个 `KW-US-*` 都由上列精确测试直接证明；不存在范围兜底或 Ticket 57 代实现。
- [x] 本 ticket 拥有的每个 `KW-RULE-*` 都满足对应契约文档，并有正常、取消/冲突、权限/不可用和故障注入覆盖。
- [x] 相关既有回归、`npm run typecheck` 和 `npm run lint:boundary` 通过；涉及 composition、Renderer、preload/main 时运行相应 build。
- [x] ticket 交付记录只填写实际执行命令、平台和结果；普通执行结果不写入 `LOG.md`。
- [x] 交付物没有未决的“可能”“按需”“A 或 B”、未选框架、未选 schema 或未定义恢复语义。

## 实施交付记录

- **实现提交：** `510687bf`
- **平台：** macOS Darwin 25.5.0 / Apple M5 arm64 / APFS；Node `v24.16.0` / npm `11.13.0`
- **同一编辑器状态：** Live Preview/Source 通过现有 conceal `Compartment` 在同一个 `EditorView` 上原子 reconfigure；不重建 document、selection 或 undo history，也不触发 ResourceIO/save。
- **切换结果：** 公开 API 返回 `changed`、`unchanged`、`unavailable` 或 `failed`；只有成功/幂等结果才写回当前 view 的 mode。dispatch 故障保持旧 mode，并恢复切换前 scroll。
- **每视图保持：** mode 与 scroll 继续由 Ticket 18 的 document view registry 按 `viewId` 保存；同一 session 的不同 view 可独立选择模式，重新挂载时按该 view 状态恢复。
- **Live Preview reveal：** 行内标记、链接、图片、行内数学、高亮和背景色只在 selection/caret 接触该元素时显露；heading/list/task/quote 只在活动行显露 marker；fenced code、Mermaid 与块数学在活动行落入块内时显露整个块。
- **Source mode：** 所有 conceal、widget 与 Live Preview 专属字段都统一位于 conceal compartment，源码模式卸载 Markdown/link/task/frontmatter/cover/math/Mermaid/table 装饰，仅保留可编辑源码。
- **UI 与可访问性：** Knowledge 文档工具栏提供互斥 `aria-pressed` 模式按钮；zh-CN、zh-TW、en、ja、ko、键盘 focus、亮暗 token 和既有 38rem 窄布局同步交付。
- **精确自动化：** `npx vitest run desktop/src/react/__tests__/editor/knowledge-live-preview.test.ts`（1 file、4/4）。
- **相关回归：** Live Preview、Markdown decorations、knowledge link、Mermaid 与文档 UI 定向共 46/46；Surface、block handles 与 tags/tasks 定向共 58/58；最终相关集合共 104/104。
- **产品范围全仓：** `npm test -- --exclude 'temp/**'`（1035 files passed、1 skipped；10408 tests passed、6 skipped）。原始 `npm test` 还会收集用户 ignored `temp/HanaKDE-TodoList-0.0.1/tests/*.test.ts` 的 Node test-runner 文件并产生 21 个非产品失败；未修改或删除该用户目录。
- **门禁与构建：** `npm run typecheck`、`npm run lint:boundary`、目标 ESLint、`git diff --check` 与 `npm run build:renderer` 通过；未改变 composition、preload/main 或 Server。
- **Playwright：** 仓库当前只有 E2E-KW-001 spec，不存在契约所列 E2E-KW-005 可执行文件，因此未伪造执行结果；该发布级场景继续在完整公开入口具备后回填。
- **Handoff：** `speculo/.speculo/commands/handoff/2026-07-29-openhanako-knowledge-workspace-implementation-27.md`
