---
schema_version: 3
artifact: ticket
change: 2026-07-24-openhanako-knowledge-workspace
id: T-19
title: "交付单 Markdown 打开编辑保存曳光弹"
status: done
planning_depth: standard
planning_depth_reason: "历史完成 Ticket 的 SpecDev v3 兼容迁移；保留既有实现、验证与验收记录。"
ready: false
risk: medium
blocked_by: ["T-06","T-12","T-18"]
contract_ids: ["KW-US-058","KW-US-123","KW-US-124","KW-US-125","KW-US-126","KW-US-127","KW-US-128","KW-US-129","KW-US-130","KW-US-131","KW-US-132"]
owner: historical-implementer
expected_changes: ["<Path>{roots.state}/specdev/changes/2026-07-24-openhanako-knowledge-workspace/ticket/19-deliver-manual-save-tracer.md</Path>"]
writable_paths: []
read_only_paths: []
shared_paths: []
shared_path_owners: []
---
# Ticket 19: 交付单 Markdown 打开编辑保存曳光弹

- **被阻塞于：** [`06-complete-resource-io-http-seams.md`](./06-complete-resource-io-http-seams.md)、[`12-extract-policy-driven-cm6-surface.md`](./12-extract-policy-driven-cm6-surface.md)、[`18-establish-document-session-registry.md`](./18-establish-document-session-registry.md)
- **状态：** 已完成

## 战略与背景

- **战略：** 完成读取、编辑、dirty、手动保存、expected-version、换行/BOM 保持和失败通知。
- **需求追踪：** KW-US-058, KW-US-123, KW-US-124, KW-US-125, KW-US-126, KW-US-127, KW-US-128, KW-US-129, KW-US-130, KW-US-131, KW-US-132
- **当前现状：** 当前实现接缝位于 `server/routes/resource-io.ts`、`desktop/src/react/components/PreviewEditor.tsx`、`desktop/src/react/utils/checkpoints.ts`；本 ticket 只扩展这些公开边界。
- **用户可验证结果：** 完成本 ticket 后，验收者能够通过公开 API、真实临时 workspace 或可交互 UI 验证本标题声明的单一能力。

## 范围边界

| IN | REUSE | OUT |
|---|---|---|
| 完成读取、编辑、dirty、手动保存、expected-version、换行/BOM 保持和失败通知。 | `server/routes/resource-io.ts`<br>`desktop/src/react/components/PreviewEditor.tsx`<br>`desktop/src/react/utils/checkpoints.ts` | 未列入本 ticket 的后续功能；修改生成 bundle；创建平行文件系统、编辑器内核或私有 route 捷径 |

## 交付物

> 以下仅列主要交付物，不构成文件白名单或完整清单；为满足本 ticket 验收而新增/修改的同范围实现、类型、schema、fixture、测试、i18n 与文档同属交付物。

- `desktop/src/react/components/knowledge-workspace/KnowledgeDocumentEditor.tsx`
- `desktop/src/react/__tests__/components/KnowledgeDocumentEditor.save.test.tsx`

## 实施时需阅读的文件

> 以下列出本 ticket 的具体代码接缝；实施前还必须按 [`README.md`](../README.md) 的文档权威关系读取 accepted [`LOG.md`](../LOG.md)、[`ADR.md`](../ADR.md)、[`CONTEXT.md`](../CONTEXT.md)、[`spec.md`](../spec.md) 及本 ticket 的固定实施契约，不能因本节或交付物未逐项复写而遗漏已确认结论。

- `server/routes/resource-io.ts`
- `desktop/src/react/components/PreviewEditor.tsx`
- `desktop/src/react/utils/checkpoints.ts`

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
6. Markdown 打开先 stat/content-gate 后 read；超过 10 MiB 不创建 DocumentSession 或 EditorView，也不得先整体读取正文。

## 自动化证据

**Primary ownership：** KW-US-058, KW-US-123, KW-US-124, KW-US-125, KW-US-126, KW-US-127, KW-US-128, KW-US-129, KW-US-130, KW-US-131, KW-US-132

**必须创建或更新：**

- `desktop/src/react/__tests__/components/KnowledgeDocumentEditor.save.test.tsx`

**Playwright 用户流程：** 适用；运行 E2E-KW-005

## 验收标准

- [x] 无 autosave；保存成功后才更新 baseline/version/index 信号；失败保留 buffer 和 dirty。
- [x] 本 ticket 拥有的每个 `KW-US-*` 都由上列精确测试直接证明；不存在范围兜底或 Ticket 57 代实现。
- [x] 本 ticket 拥有的每个 `KW-RULE-*` 都满足对应契约文档，并有正常、取消/冲突、权限/不可用和故障注入覆盖。
- [x] 相关既有回归、`npm run typecheck` 和 `npm run lint:boundary` 通过；涉及 composition、Renderer、preload/main 时运行相应 build。
- [x] ticket 交付记录只填写实际执行命令、平台和结果；普通执行结果不写入 `LOG.md`。
- [x] 交付物没有未决的“可能”“按需”“A 或 B”、未选框架、未选 schema 或未定义恢复语义。

## 实施交付记录

- **实现提交：** `84c66f04`
- **平台：** macOS Darwin 25.5.0 / Apple M5 arm64 / APFS；Node `v24.16.0` / npm `11.13.0`
- **打开门禁：** `KnowledgeDocumentEditor` 先经公开 Knowledge Resource client 执行 `stat`，只有存在、非目录、版本 size 可用且不超过 10 MiB 时才读取 base64；实际字节数、严格 UTF-8 与请求身份再次验证后才建立 DocumentSession/EditorView。取消、迟到结果、非法 base64/UTF-8、大小漂移及服务不可用均不会建立半成品 session/view。
- **共享手动保存：** `Ctrl/Cmd+S` 由共享 CM6 表面的 `Mod-s` keymap 进入 `mode: manual` 保存策略；失焦、空闲、标签/组重渲染和时间经过均不写盘，也没有 Save All。任一 view 保存时从共享 registry 捕获最新 buffer 与最近成功 diskVersion，经 `writeExpectedVersion` 写入；成功才提交实际保存快照的 baseline/version 并发出 `onSaved` 信号。
- **编码与换行：** 编辑器逻辑文本统一使用 LF；已有纯 LF/CRLF 保持原样，混合换行按多数规范化、平票为 LF，首次保存前显示非阻断说明；已有 UTF-8 BOM 保留、无 BOM 不添加。字节转换复用 Asset Viewer 与 Markdown 打开链共同的严格 base64 utility。
- **成功/失败语义：** 成功静默并保留 CM6 与 registry undo history；保存期间继续编辑只推进已写入快照的 baseline/version，较新 buffer 仍 dirty。冲突、权限/不可用和抛错不回滚共享源码或视图位置，所有 view 继续共享 dirty。
- **通知：** 保存失败按文档在 registry 中只保存一条带文件名与原因的通知；重复失败更新原条目，通知不超时、不抢焦点、可手动关闭，后续成功只清除对应文档的旧失败。`KnowledgeDocumentNotices` 独立于单个 view，供 Ticket 20 的 workspace 组合层挂载一次。
- **精确自动化：** `npx vitest run desktop/src/react/__tests__/components/KnowledgeDocumentEditor.save.test.tsx`（1 file、10/10）；覆盖 stat-first/10 MiB、严格 UTF-8、取消、无 autosave/Save All、快捷键与 expected-version、BOM/换行、双 view、重复冲突、不可用与 focus。
- **相关回归：** 最终共享 base64 收敛后，`npx vitest run desktop/src/react/__tests__/components/KnowledgeDocumentEditor.save.test.tsx desktop/src/react/__tests__/components/KnowledgeAssetViewer.test.tsx desktop/src/react/__tests__/components/MarkdownEditorSurface.test.tsx desktop/src/react/__tests__/stores/knowledge-document-registry.test.ts`（4 files、38/38）；ResourceIO route、Renderer client、Preview file sync、i18n/a11y 与 contract 定向回归另有 8 files、237/237 通过。
- **全仓回归：** `npx vitest run --exclude 'temp/**' --exclude 'teach/**'`（1023 files passed、1 skipped；10269 tests passed、6 skipped）。
- **门禁与复审：** `npm run typecheck`、`npm run lint:boundary`、目标 ESLint、`npm run build:renderer` 与 `git diff --check` 通过。标准轴首次发现重复 base64 转换这一判断性异味并已用共享 utility 消除；最终标准轴与规范轴均无未决 blocker。
- **Playwright：** E2E-KW-005 尚未执行；仓库当前只有 E2E-KW-001 spec，真实 Markdown 打开/活动标签入口由 Tickets 20/49 交付。为避免私有 route/test shortcut 或提前实现后续 owner 范围，本票保留 E2E 行“未执行”，待真实产品入口完成后回填。
- **Handoff：** `speculo/.speculo/commands/handoff/2026-07-28-openhanako-knowledge-workspace-implementation-19.md`
