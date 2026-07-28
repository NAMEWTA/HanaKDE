# Ticket 18: 建立共享文档会话与视图状态

- **被阻塞于：** [`08-migrate-renderer-resource-client.md`](./08-migrate-renderer-resource-client.md)、[`12-extract-policy-driven-cm6-surface.md`](./12-extract-policy-driven-cm6-surface.md)、[`17-deliver-open-policy-and-asset-viewer.md`](./17-deliver-open-policy-and-asset-viewer.md)
- **状态：** 已完成

## 战略与背景

- **战略：** 按 KnowledgeResourceAddress 分离共享 buffer/version/history/dirty 状态与每视图 cursor/scroll/mode。
- **需求追踪：** KW-US-041, KW-US-042, KW-US-043, KW-US-044, KW-US-166
- **当前现状：** 当前实现接缝位于 `desktop/src/react/stores/preview-slice.ts`、`desktop/src/react/components/PreviewEditor.tsx`；本 ticket 只扩展这些公开边界。
- **用户可验证结果：** 完成本 ticket 后，验收者能够通过公开 API、真实临时 workspace 或可交互 UI 验证本标题声明的单一能力。

## 范围边界

| IN | REUSE | OUT |
|---|---|---|
| 按 KnowledgeResourceAddress 分离共享 buffer/version/history/dirty 状态与每视图 cursor/scroll/mode。 | `desktop/src/react/stores/preview-slice.ts`<br>`desktop/src/react/components/PreviewEditor.tsx` | 未列入本 ticket 的后续功能；修改生成 bundle；创建平行文件系统、编辑器内核或私有 route 捷径 |

## 交付物

> 以下仅列主要交付物，不构成文件白名单或完整清单；为满足本 ticket 验收而新增/修改的同范围实现、类型、schema、fixture、测试、i18n 与文档同属交付物。

- `desktop/src/react/stores/knowledge-document-registry.ts`
- `desktop/src/react/__tests__/stores/knowledge-document-registry.test.ts`

## 实施时需阅读的文件

> 以下列出本 ticket 的具体代码接缝；实施前还必须按 [`README.md`](../README.md) 的文档权威关系读取 accepted [`LOG.md`](../LOG.md)、[`ADR.md`](../ADR.md)、[`CONTEXT.md`](../CONTEXT.md)、[`spec.md`](../spec.md) 及本 ticket 的固定实施契约，不能因本节或交付物未逐项复写而遗漏已确认结论。

- `desktop/src/react/stores/preview-slice.ts`
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

**Primary ownership：** KW-US-041, KW-US-042, KW-US-043, KW-US-044, KW-US-166

**必须创建或更新：**

- `desktop/src/react/__tests__/stores/knowledge-document-registry.test.ts`

**Playwright 用户流程：** 适用；运行 E2E-KW-004、E2E-KW-024

## 验收标准

- [x] 同页多视图共享文本和保存状态但不共享光标；Registry 不保存 DOM、EditorView 或文件句柄。
- [x] 本 ticket 拥有的每个 `KW-US-*` 都由上列精确测试直接证明；不存在范围兜底或 Ticket 57 代实现。
- [x] 本 ticket 拥有的每个 `KW-RULE-*` 都满足对应契约文档，并有正常、取消/冲突、权限/不可用和故障注入覆盖。
- [x] 相关既有回归、`npm run typecheck` 和 `npm run lint:boundary` 通过；涉及 composition、Renderer、preload/main 时运行相应 build。
- [x] ticket 交付记录只填写实际执行命令、平台和结果；普通执行结果不写入 `LOG.md`。
- [x] 交付物没有未决的“可能”“按需”“A 或 B”、未选框架、未选 schema 或未定义恢复语义。

## 实施交付记录

- **实现提交：** `72feaeff`
- **平台：** macOS Darwin 25.5.0 / Apple M5 arm64 / APFS；Node `v24.16.0` / npm `11.13.0`
- **隔离 registry：** `createKnowledgeDocumentRegistry({ ownerId, windowId })` 为每个 Renderer context 创建独立 Zustand vanilla store；模块不导出全局实例，同一地址在不同 owner/window 中没有共享引用或状态。
- **共享 DocumentSession：** collision-free `KnowledgeResourceAddress` key 下共享 buffer、baseline、diskVersion、可逆文本 edit history、dirty、conflict 和 orphan；任一视图编辑、undo 或 redo 以单次原子 mutation 通知全部订阅者。
- **独立 DocumentView：** view id 下独立保存 group、cursor、selection、scroll、viewport、Live Preview/Source mode 与语法显隐范围；共享 edit 映射各自位置但不令视图状态相等。
- **生命周期：** 已存在 view 再打开返回原状态；关闭后不缓存 view，重开从文档开头、零滚动和默认 Live Preview 开始；显式 cleanup 拒绝删除仍有 view 的 session，并支持 context 整体 dispose。
- **竞态与保存：** 同地址迟到/重复 load 不覆盖现有共享 session；保存成功提交的是实际保存快照及其新 version，若保存期间又有编辑则只推进 baseline/version，保留新 buffer 与 dirty。
- **数据边界：** 地址继续使用公开 schema 校验；无绝对路径、Renderer Node API、DOM、EditorView、文件句柄或富文本模型进入 registry，外来同名附加字段也不会被保存。
- **TDD 证据：** 首次 `npx vitest run desktop/src/react/__tests__/stores/knowledge-document-registry.test.ts` 因交付模块尚不存在而红；实现后 1 file、10/10 通过。
- **相关回归：** `npx vitest run desktop/src/react/__tests__/stores/knowledge-document-registry.test.ts desktop/src/react/__tests__/stores/knowledge-workspace-slice.test.ts desktop/src/react/__tests__/stores/preview-slice.test.ts desktop/src/react/__tests__/components/MarkdownEditorSurface.test.tsx tests/knowledge-baseline-contract.test.ts`（5 files、67/67）。
- **全仓回归：** `npx vitest run --exclude 'temp/**' --exclude 'teach/**'`（1022 files passed、1 skipped；10258 tests passed、6 skipped）。
- **门禁：** `npm run typecheck`、`npm run lint:boundary`、目标 ESLint、`npm run build:renderer` 与 `git diff --check` 通过；标准轴与规范轴复审均无未决 blocker。
- **Playwright：** E2E-KW-004 与 E2E-KW-024 尚未执行；仓库当前只有 E2E-KW-001 spec。E2E-KW-004 的真实 tabs/groups 用户入口由 Ticket 20 交付，E2E-KW-024 还需 Ticket 19/21/51 的保存、冲突与 native grant 链路；场景保持未执行，待这些 owner ticket 完成后运行，不创建私有测试入口或提前实现后续功能。
- **Handoff：** `speculo/.speculo/commands/handoff/2026-07-28-openhanako-knowledge-workspace-implementation-18.md`
