---
schema_version: 3
artifact: ticket
change: 2026-07-24-openhanako-knowledge-workspace
id: T-17
title: "交付内容门禁与基础 Asset Viewer"
status: done
planning_depth: standard
planning_depth_reason: "历史完成 Ticket 的 SpecDev v3 兼容迁移；保留既有实现、验证与验收记录。"
ready: false
risk: medium
blocked_by: ["T-06","T-14","T-15"]
contract_ids: ["KW-US-156","KW-US-158","KW-US-159","KW-US-160","KW-US-161","KW-US-162","KW-RULE-SEC","KW-RULE-NATIVE"]
owner: historical-implementer
expected_changes: ["<Path>{roots.state}/specdev/changes/2026-07-24-openhanako-knowledge-workspace/ticket/17-deliver-open-policy-and-asset-viewer.md</Path>"]
writable_paths: []
read_only_paths: []
shared_paths: []
shared_path_owners: []
---
# Ticket 17: 交付内容门禁与基础 Asset Viewer

- **被阻塞于：** [`06-complete-resource-io-http-seams.md`](./06-complete-resource-io-http-seams.md)、[`14-establish-malicious-workspace-tests.md`](./14-establish-malicious-workspace-tests.md)、[`15-deliver-knowledge-shell.md`](./15-deliver-knowledge-shell.md)
- **状态：** 已完成

## 战略与背景

- **战略：** 复用现有 MediaViewer、PDF/文本预览和 sanitizer，先交付资产打开、文件信息、默认应用与安全门禁。
- **需求追踪：** KW-US-156, KW-US-158, KW-US-159, KW-US-160, KW-US-161, KW-US-162, KW-RULE-SEC, KW-RULE-NATIVE
- **当前现状：** 现有 MediaViewer、file-preview 和 markdown-html-sanitizer 已覆盖多数基础资产预览能力。
- **用户可验证结果：** 完成本 ticket 后，验收者能够通过公开 API、真实临时 workspace 或可交互 UI 验证本标题声明的单一能力。

## 范围边界

| IN | REUSE | OUT |
|---|---|---|
| 复用现有 MediaViewer、PDF/文本预览和 sanitizer，先交付资产打开、文件信息、默认应用与安全门禁。 | `desktop/src/react/components/shared/MediaViewer/`<br>`desktop/src/react/utils/file-preview.ts`<br>`desktop/src/react/utils/markdown-html-sanitizer.ts` | 未列入本 ticket 的后续功能；修改生成 bundle；创建平行文件系统、编辑器内核或私有 route 捷径 |

## 交付物

> 以下仅列主要交付物，不构成文件白名单或完整清单；为满足本 ticket 验收而新增/修改的同范围实现、类型、schema、fixture、测试、i18n 与文档同属交付物。

- `desktop/src/react/components/knowledge-workspace/KnowledgeAssetViewer.tsx`
- `lib/knowledge-workspace/resource-open-policy.ts`

## 实施时需阅读的文件

> 以下列出本 ticket 的具体代码接缝；实施前还必须按 [`README.md`](../README.md) 的文档权威关系读取 accepted [`LOG.md`](../LOG.md)、[`ADR.md`](../ADR.md)、[`CONTEXT.md`](../CONTEXT.md)、[`spec.md`](../spec.md) 及本 ticket 的固定实施契约，不能因本节或交付物未逐项复写而遗漏已确认结论。

- `desktop/src/react/components/shared/MediaViewer/`
- `desktop/src/react/utils/file-preview.ts`
- `desktop/src/react/utils/markdown-html-sanitizer.ts`

## 固定实施契约

- [`implementation-contracts.md`](../implementation-contracts.md)
- [`threat-model.md`](../threat-model.md)

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
6. 打开任何正文前先 stat；超过 10 MiB、不可安全解码或不允许的类型不得先整体 read 再拒绝。

## 自动化证据

**Primary ownership：** KW-US-156, KW-US-158, KW-US-159, KW-US-160, KW-US-161, KW-US-162

**必须创建或更新：**

- `desktop/src/react/__tests__/components/KnowledgeAssetViewer.test.tsx`
- `tests/resource-open-policy.test.ts`

**Playwright 用户流程：** 适用；运行 E2E-KW-006、E2E-KW-017

## 验收标准

- [x] spy provider 证明超限或不安全内容在 stat 后不发生正文 read；允许的图片/PDF/安全文本无需等待索引即可打开。
- [x] 本 ticket 拥有的每个 `KW-US-*` 都由上列精确测试直接证明；不存在范围兜底或 Ticket 57 代实现。
- [x] 本 ticket 拥有的每个 `KW-RULE-*` 都满足对应契约文档，并有正常、取消/冲突、权限/不可用和故障注入覆盖。
- [x] 相关既有回归、`npm run typecheck` 和 `npm run lint:boundary` 通过；涉及 composition、Renderer、preload/main 时运行相应 build。
- [x] ticket 交付记录只填写实际执行命令、平台和结果；普通执行结果不写入 `LOG.md`。
- [x] 交付物没有未决的“可能”“按需”“A 或 B”、未选框架、未选 schema 或未定义恢复语义。

## 实施交付记录

- **实现提交：** `185949d3`
- **平台：** macOS Darwin 25.5.0 / Apple M5 arm64 / APFS；Node `v24.16.0` / npm `11.13.0`
- **内容门禁：** `resource-open-policy.ts` 以 stat 的 `exists/isDirectory/version.size` 决定是否读取；10 MiB 边界内才允许正文，HTML/SVG/Mermaid/URI 与已知不支持二进制类型零读取并降级文件信息，未知后缀只作为有界文本候选。
- **确定性解码：** Renderer 只请求有界 base64，并严格支持无 BOM UTF-8、UTF-8 BOM、带 BOM UTF-16 LE/BE 与 UTF-32 LE/BE；传统编码、错误序列、版本/大小漂移均 fail-closed，不使用替换字符、猜测代码页或截断正文。
- **只读查看器：** 安全文本、图片、PDF、音频与视频使用只读表面；PDF 不调用索引、OCR、正文命中或高亮 API；未知/超限/不安全编码显示完整文件名、来源、知识地址、大小和默认应用入口。
- **外部变化：** 复用现有来源 watcher 与 ResourceEvent signal；自动刷新会取消旧请求并阻止 stale result，保留滚动和媒体播放位置；读取/解码失败保留查看器并提供重新加载，外部删除显示资源不存在且不创建或猜测资源。
- **Native 边界：** 查看器只向注入动作传递 `KnowledgeResourceAddress`；不接收或暴露绝对路径。未提供动作或 Open/Web 无能力时明确显示 `knowledge_native_capability_unavailable` 降级；grant、Main-only credential 与实际系统动作仍由 Ticket 51 的冻结边界交付。
- **i18n/A11y/UI：** zh-CN、zh-TW、en、ja、ko 同步；region/status/alert、只读语义、键盘 focus、亮暗主题变量和窄布局已覆盖。
- **TDD 证据：** 首次精确测试因两个交付物尚不存在而 2 suites 红；实现后 `npx vitest run tests/resource-open-policy.test.ts desktop/src/react/__tests__/components/KnowledgeAssetViewer.test.tsx`（2 files、23/23）。
- **相关回归：** 11 files、115/115；干净全仓 1021 files passed、1 skipped，10249 tests passed、6 skipped。
- **门禁：** `npm run typecheck`、`npm run lint:boundary`、目标 ESLint、`npm run build:client` 与 `git diff --check` 通过；标准轴与规范轴复审均无未决 blocker。
- **Playwright：** E2E-KW-006 与 E2E-KW-017 尚未执行；当前 ticket 不抢占 Ticket 20/49 的编辑组/树打开入口或 Ticket 51 的 native bridge。场景保留在发布证据中，待这些显式 blocker 完成后以真实产品入口执行，不将未执行写成通过。
- **Handoff：** `speculo/.speculo/commands/handoff/2026-07-28-openhanako-knowledge-workspace-implementation-17.md`
