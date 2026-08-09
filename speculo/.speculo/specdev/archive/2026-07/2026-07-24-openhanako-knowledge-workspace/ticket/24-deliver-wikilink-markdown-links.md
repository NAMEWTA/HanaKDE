---
schema_version: 3
artifact: ticket
change: 2026-07-24-openhanako-knowledge-workspace
id: T-24
title: "交付 Wikilink 与 Markdown Link 解析渲染"
status: done
planning_depth: standard
planning_depth_reason: "历史完成 Ticket 的 SpecDev v3 兼容迁移；保留既有实现、验证与验收记录。"
ready: false
risk: medium
blocked_by: ["T-11","T-12","T-23"]
contract_ids: ["KW-US-114","KW-US-177","KW-RULE-MARKDOWN"]
owner: historical-implementer
expected_changes: ["<Path>{roots.state}/specdev/changes/2026-07-24-openhanako-knowledge-workspace/ticket/24-deliver-wikilink-markdown-links.md</Path>"]
writable_paths: []
read_only_paths: []
shared_paths: []
shared_path_owners: []
---
# Ticket 24: 交付 Wikilink 与 Markdown Link 解析渲染

- **被阻塞于：** [`11-define-markdown-semantic-ir.md`](./11-define-markdown-semantic-ir.md)、[`12-extract-policy-driven-cm6-surface.md`](./12-extract-policy-driven-cm6-surface.md)、[`23-define-knowledge-address-resolver.md`](./23-define-knowledge-address-resolver.md)
- **状态：** 已完成

## 战略与背景

- **战略：** 基于共享 IR 实现链接词法、转义、断裂状态、点击解析和同源渲染。
- **需求追踪：** KW-US-114, KW-US-177, KW-RULE-MARKDOWN
- **当前现状：** 当前实现接缝位于 `desktop/src/react/editor/md-decorations.ts`、`desktop/src/react/utils/link-open.ts`；本 ticket 只扩展这些公开边界。
- **用户可验证结果：** 完成本 ticket 后，验收者能够通过公开 API、真实临时 workspace 或可交互 UI 验证本标题声明的单一能力。

## 范围边界

| IN | REUSE | OUT |
|---|---|---|
| 基于共享 IR 实现链接词法、转义、断裂状态、点击解析和同源渲染。 | `desktop/src/react/editor/md-decorations.ts`<br>`desktop/src/react/utils/link-open.ts` | 未列入本 ticket 的后续功能；修改生成 bundle；创建平行文件系统、编辑器内核或私有 route 捷径 |

## 交付物

> 以下仅列主要交付物，不构成文件白名单或完整清单；为满足本 ticket 验收而新增/修改的同范围实现、类型、schema、fixture、测试、i18n 与文档同属交付物。

- `desktop/src/react/editor/knowledge-link-field.ts`
- `desktop/src/react/__tests__/editor/knowledge-link-field.test.ts`

## 实施时需阅读的文件

> 以下列出本 ticket 的具体代码接缝；实施前还必须按 [`README.md`](../README.md) 的文档权威关系读取 accepted [`LOG.md`](../LOG.md)、[`ADR.md`](../ADR.md)、[`CONTEXT.md`](../CONTEXT.md)、[`spec.md`](../spec.md) 及本 ticket 的固定实施契约，不能因本节或交付物未逐项复写而遗漏已确认结论。

- `desktop/src/react/editor/md-decorations.ts`
- `desktop/src/react/utils/link-open.ts`

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
6. 编辑器词法与点击结果必须复用 Ticket 23 的 LinkResolver 和 `implementation-contracts.md` 第 7 节；不得在 Renderer 另做 percent decode、dot-segment normalize 或外链分类。

## 自动化证据

**Primary ownership：** KW-US-114, KW-US-177

**必须创建或更新：**

- `desktop/src/react/__tests__/editor/knowledge-link-field.test.ts`

**Playwright 用户流程：** 适用；运行 E2E-KW-009

## 验收标准

- [x] 代码区和转义文本不产生链接；sourceKey 不写入 Markdown；页面相对 `../`、percent-encoded 名称、fragment、非法 scheme/编码和断裂链接均按共享 resolver 处理且不跨来源猜测。
- [x] 本 ticket 拥有的每个 `KW-US-*` 都由上列精确测试直接证明；不存在范围兜底或 Ticket 57 代实现。
- [x] 本 ticket 拥有的每个 `KW-RULE-*` 都满足对应契约文档，并有正常、取消/冲突、权限/不可用和故障注入覆盖。
- [x] 相关既有回归、`npm run typecheck` 和 `npm run lint:boundary` 通过；涉及 composition、Renderer、preload/main 时运行相应 build。
- [x] ticket 交付记录只填写实际执行命令、平台和结果；普通执行结果不写入 `LOG.md`。
- [x] 交付物没有未决的“可能”“按需”“A 或 B”、未选框架、未选 schema 或未定义恢复语义。

## 实施交付记录

- **实现提交：** `8a5a4f17`
- **平台：** macOS Darwin 25.5.0 / Apple M5 arm64 / APFS；Node `v24.16.0` / npm `11.13.0`
- **共享语义：** `knowledge-link-field` 只消费 Ticket 11 的共享 Markdown IR，并把 Wikilink 与标准 Markdown destination 原样交给 Ticket 23 `LinkResolver`；Renderer 不自行 percent-decode、normalize、分类 scheme 或搜索其他来源。代码块、行内代码、HTML 禁止区与反斜杠转义由共享 IR 排除。
- **同源插入：** `createKnowledgeWikilinkInsertion` 复用共享 formatter，只输出当前 Source 根相对 canonical path，保留 Page/Asset 真实扩展名与 Wikilink 结构转义，不写 `sourceKey:`；跨来源目标 fail-closed。
- **CM6 投影：** 策略驱动 Surface 在知识文档中注入单一 StateField/ViewPlugin；Wikilink conceal、Markdown label、外链视觉标识、checking/available/missing/unavailable/非法状态、普通单击、Enter/Space、ARIA/focus 均为派生装饰，不修改 Markdown、undo history 或保存基线。
- **存在性与故障：** 内部目标只以解析后的完整 `{sourceKey, relativePath}` 调用既有 Renderer Knowledge Resource client `stat`；不存在显示断裂状态，权限/服务异常显示 unavailable，文档变化和销毁会取消旧请求，同名其他来源不参与判断。
- **横切 UI：** zh-CN、zh-TW、en、ja、ko 链接 ARIA 文案同步；亮暗主题复用 token，外链/断裂/不可用状态与 `:focus-visible` 明确，窄布局维持可见下划线。
- **精确自动化：** `npx vitest run desktop/src/react/__tests__/editor/knowledge-link-field.test.ts`（1 file、7/7）。
- **相关回归：** `npx vitest run desktop/src/react/__tests__/editor/knowledge-link-field.test.ts desktop/src/react/__tests__/components/MarkdownEditorSurface.test.tsx desktop/src/react/__tests__/components/KnowledgeDocumentEditor.save.test.tsx tests/markdown-knowledge-ir.test.ts tests/knowledge-link-resolver.test.ts`（5 files、67/67）。
- **全仓回归：** `npx vitest run --exclude 'temp/**' --exclude 'teach/**' --silent`（1032 files passed、1 skipped；10363 tests passed、6 skipped）。
- **门禁与构建：** `npm run typecheck`、`npm run lint:boundary`、目标 ESLint、`git diff --check` 与 `npm run build:renderer` 通过；未改变 composition、preload/main 或 Server。
- **Playwright：** E2E-KW-009 的发布场景还要求 Ticket 37 补全/延迟建页、Ticket 39 embed/backlink 及 Ticket 48 真实资源打开入口；当前仓库只有 E2E-KW-001 spec，资源树不能通过公开产品入口打开页面。本票不创建私有 route 或缩减场景冒充 PASS，完整场景在上述入口交付后执行并回填。
- **Handoff：** `speculo/.speculo/commands/handoff/2026-07-29-openhanako-knowledge-workspace-implementation-24.md`
