# Ticket 21: 交付外部变化与显式三方冲突

- **被阻塞于：** [`04-define-errors-and-diagnostics.md`](./04-define-errors-and-diagnostics.md)、[`06-complete-resource-io-http-seams.md`](./06-complete-resource-io-http-seams.md)、[`19-deliver-manual-save-tracer.md`](./19-deliver-manual-save-tracer.md)
- **状态：** 已完成

## 战略与背景

- **战略：** 用 baseline/local/disk 三方模型处理 watcher 变化、无脏自动重载和有脏保存阻断。
- **需求追踪：** KW-US-133, KW-US-134, KW-US-135
- **当前现状：** 当前实现接缝位于 `desktop/src/react/utils/preview-document-refresh.ts`、`desktop/src/react/components/PreviewEditor.tsx`、`lib/resource-io/types.ts`；本 ticket 只扩展这些公开边界。
- **用户可验证结果：** 完成本 ticket 后，验收者能够通过公开 API、真实临时 workspace 或可交互 UI 验证本标题声明的单一能力。

## 范围边界

| IN | REUSE | OUT |
|---|---|---|
| 用 baseline/local/disk 三方模型处理 watcher 变化、无脏自动重载和有脏保存阻断。 | `desktop/src/react/utils/preview-document-refresh.ts`<br>`desktop/src/react/components/PreviewEditor.tsx`<br>`lib/resource-io/types.ts` | 未列入本 ticket 的后续功能；修改生成 bundle；创建平行文件系统、编辑器内核或私有 route 捷径 |

## 交付物

> 以下仅列主要交付物，不构成文件白名单或完整清单；为满足本 ticket 验收而新增/修改的同范围实现、类型、schema、fixture、测试、i18n 与文档同属交付物。

- `desktop/src/react/components/knowledge-workspace/KnowledgeConflictResolver.tsx`
- `desktop/src/react/__tests__/components/KnowledgeConflictResolver.test.tsx`

## 实施时需阅读的文件

> 以下列出本 ticket 的具体代码接缝；实施前还必须按 [`README.md`](../README.md) 的文档权威关系读取 accepted [`LOG.md`](../LOG.md)、[`ADR.md`](../ADR.md)、[`CONTEXT.md`](../CONTEXT.md)、[`spec.md`](../spec.md) 及本 ticket 的固定实施契约，不能因本节或交付物未逐项复写而遗漏已确认结论。

- `desktop/src/react/utils/preview-document-refresh.ts`
- `desktop/src/react/components/PreviewEditor.tsx`
- `lib/resource-io/types.ts`

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

**Primary ownership：** KW-US-133, KW-US-134, KW-US-135

**必须创建或更新：**

- `desktop/src/react/__tests__/components/KnowledgeConflictResolver.test.tsx`

**Playwright 用户流程：** 适用；运行 E2E-KW-007

## 验收标准

- [x] 不得静默覆盖或自动合并；保留三个版本；每个解决动作进入同一手动保存流程。
- [x] 本 ticket 拥有的每个 `KW-US-*` 都由上列精确测试直接证明；不存在范围兜底或 Ticket 57 代实现。
- [x] 本 ticket 拥有的每个 `KW-RULE-*` 都满足对应契约文档，并有正常、取消/冲突、权限/不可用和故障注入覆盖。
- [x] 相关既有回归、`npm run typecheck` 和 `npm run lint:boundary` 通过；涉及 composition、Renderer、preload/main 时运行相应 build。
- [x] ticket 交付记录只填写实际执行命令、平台和结果；普通执行结果不写入 `LOG.md`。
- [x] 交付物没有未决的“可能”“按需”“A 或 B”、未选框架、未选 schema 或未定义恢复语义。

## 实施交付记录

- **实现提交：** `64b3d9c4`
- **平台：** macOS Darwin 25.5.0 / Apple M5 arm64 / APFS；Node `v24.16.0` / npm `11.13.0`
- **监听与收敛：** `KnowledgeConflictResolver` 在 groups 组合层只挂载一次，按打开 session 的唯一来源复用既有 ResourceIO source watch 和已校验资源事件链；来源首次纳入时执行一次 stat-first catch-up。每个 session 的旧请求会被 abort，迟到响应不能覆盖较新磁盘事实，卸载释放来源租约、timer 与 controller。
- **clean reload：** 无本地保存意图时，外部正文或 BOM/换行格式变化自动更新 buffer、baseline、diskVersion 与格式，并把所有共享 view 位置映射到新正文；来源级广播若复核发现磁盘仍等于 baseline，不制造假冲突。
- **dirty conflict：** 本地有未保存修改且磁盘正文或字节格式偏离 baseline 时，registry 原子保留 baseline/local/disk、最新 diskVersion 与 diskFormat；后续本地编辑、undo/redo 只更新 local，直接 Ctrl/Cmd+S 被阻断。expected-version 写入明确返回 conflict 时即使正文相同也强制建立三方状态。
- **显式解决：** UI 同时显示 baseline/local/disk 及 LF/CRLF、BOM、mixed 格式摘要，并提供可编辑 merged result；“使用合并结果”“使用本地”“使用磁盘”三条路径均先原子应用选择，再调用 Ticket 19 抽出的同一 `saveKnowledgeDocument` 手动保存执行器。系统不自动合并、不静默覆盖或重载 dirty buffer。
- **编辑器同步：** `MarkdownEditorSurface` 新增默认关闭的 registry-authoritative controlled-content 模式；Knowledge registry 已完成冲突决策后可把明确选择同步到 CodeMirror，而 Preview 默认的本地草稿保护保持不变。
- **错误与可访问性：** 外部复核失败保留本地 buffer/baseline 并显示非模态 retry；保存失败保留所选 buffer 和持久通知。五语言、region/label、只读三版文本区、可编辑合并区、键盘按钮、可见 focus、亮暗主题与两级窄布局均已交付。
- **精确自动化：** `npx vitest run desktop/src/react/__tests__/components/KnowledgeConflictResolver.test.tsx`（1 file、10/10）。
- **相关回归：** `npx vitest run desktop/src/react/__tests__/components/KnowledgeConflictResolver.test.tsx desktop/src/react/__tests__/components/MarkdownEditorSurface.test.tsx desktop/src/react/__tests__/components/KnowledgeDocumentEditor.save.test.tsx desktop/src/react/__tests__/components/KnowledgeEditorGroups.test.tsx desktop/src/react/__tests__/components/KnowledgeAssetViewer.test.tsx desktop/src/react/__tests__/components/KnowledgeResourceTree.test.tsx desktop/src/react/__tests__/components/KnowledgeWorkspace.test.tsx desktop/src/react/__tests__/services/knowledge-workspace-client.test.ts desktop/src/react/__tests__/services/resource-events.test.ts desktop/src/react/__tests__/stores/knowledge-document-registry.test.ts tests/knowledge-contract-schema.test.ts tests/knowledge-i18n-a11y-contract.test.ts`（12 files、202/202）。
- **全仓回归：** `npx vitest run --exclude 'temp/**' --exclude 'teach/**' --silent`（1026 files passed、1 skipped；10288 tests passed、6 skipped）。
- **门禁与复审：** `npm run typecheck`、`npm run lint:boundary`、目标 ESLint、`npm run build:renderer` 与 `git diff --check` 通过；固定点 `07200ec8` 到实现提交 `64b3d9c4` 的规范轴与标准轴本地复审均无未决 blocker。
- **Playwright：** E2E-KW-007 尚未执行；当前仓库仍只有 E2E-KW-001 spec，真实资源树单击/双击/Space/Enter 打开 Markdown 的产品入口由 Tickets 48/49 交付。为避免私有 route/test shortcut，本票保留 E2E 行“未执行”，待真实入口完成后回填。
- **Handoff：** `speculo/.speculo/commands/handoff/2026-07-28-openhanako-knowledge-workspace-implementation-21.md`
