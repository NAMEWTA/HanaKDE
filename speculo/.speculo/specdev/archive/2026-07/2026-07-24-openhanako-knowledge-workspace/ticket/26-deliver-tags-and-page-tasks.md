---
schema_version: 3
artifact: ticket
change: 2026-07-24-openhanako-knowledge-workspace
id: T-26
title: "交付标签与页面内任务"
status: done
planning_depth: standard
planning_depth_reason: "历史完成 Ticket 的 SpecDev v3 兼容迁移；保留既有实现、验证与验收记录。"
ready: false
risk: medium
blocked_by: ["T-11","T-12","T-19","T-25"]
contract_ids: ["KW-US-175","KW-US-176","KW-RULE-MARKDOWN"]
owner: historical-implementer
expected_changes: ["<Path>{roots.state}/specdev/changes/2026-07-24-openhanako-knowledge-workspace/ticket/26-deliver-tags-and-page-tasks.md</Path>"]
writable_paths: []
read_only_paths: []
shared_paths: []
shared_path_owners: []
---
# Ticket 26: 交付标签与页面内任务

- **被阻塞于：** [`11-define-markdown-semantic-ir.md`](./11-define-markdown-semantic-ir.md)、[`12-extract-policy-driven-cm6-surface.md`](./12-extract-policy-driven-cm6-surface.md)、[`19-deliver-manual-save-tracer.md`](./19-deliver-manual-save-tracer.md)、[`25-deliver-frontmatter-roundtrip.md`](./25-deliver-frontmatter-roundtrip.md)
- **状态：** 已完成

## 战略与背景

- **战略：** 解析 Frontmatter/body 标签和标准二态 Markdown 任务，并把交互写入同一 buffer/history。
- **需求追踪：** KW-US-175, KW-US-176, KW-RULE-MARKDOWN
- **当前现状：** 当前基座接缝是 `desktop/src/react/editor/markdown-commands.ts`；Markdown IR 由 Ticket 11 交付，开始本 ticket 前必须存在。
- **用户可验证结果：** 完成本 ticket 后，验收者能够通过公开 API、真实临时 workspace 或可交互 UI 验证本标题声明的单一能力。

## 范围边界

| IN | REUSE | OUT |
|---|---|---|
| 解析 Frontmatter/body 标签和标准二态 Markdown 任务，并把交互写入同一 buffer/history。 | `desktop/src/react/editor/markdown-commands.ts`<br>`lib/knowledge-workspace/markdown-knowledge-ir.ts` | 未列入本 ticket 的后续功能；修改生成 bundle；创建平行文件系统、编辑器内核或私有 route 捷径 |

## 交付物

> 以下仅列主要交付物，不构成文件白名单或完整清单；为满足本 ticket 验收而新增/修改的同范围实现、类型、schema、fixture、测试、i18n 与文档同属交付物。

- `lib/knowledge-workspace/knowledge-tags.ts`
- `desktop/src/react/editor/task-field.ts`
- `tests/knowledge-tags-tasks.test.ts`

## 实施时需阅读的文件

> 以下列出本 ticket 的具体代码接缝；实施前还必须按 [`README.md`](../README.md) 的文档权威关系读取 accepted [`LOG.md`](../LOG.md)、[`ADR.md`](../ADR.md)、[`CONTEXT.md`](../CONTEXT.md)、[`spec.md`](../spec.md) 及本 ticket 的固定实施契约，不能因本节或交付物未逐项复写而遗漏已确认结论。

- `desktop/src/react/editor/markdown-commands.ts`
- `lib/knowledge-workspace/markdown-knowledge-ir.ts`（由 Ticket 11 交付）

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
6. 标签值、正文 `#tag` 词法、NFC/大小写/去重和 GFM task toggle 必须直接复用 `implementation-contracts.md` 第 9 节，不得由 Renderer 与 Server 分别猜测。

## 自动化证据

**Primary ownership：** KW-US-175, KW-US-176

**必须创建或更新：**

- `tests/knowledge-tags-tasks.test.ts`

**Playwright 用户流程：** 不适用；本 ticket 使用上述 Vitest 单元、组件、契约或集成测试，不运行 Playwright；下游或发布级用户流程可继续覆盖相关行为

## 验收标准

- [x] 标签矩阵覆盖 Frontmatter string/string[]、NFC、大小写、重复值、控制字符、正文边界、heading、纯数字、代码、URL 和转义；任务只写 `[ ]`/`[x]`；未保存变化不进入 Server 索引。
- [x] KW-US-175/176 由标签来源隔离、Frontmatter/body 合并与单 transaction task toggle 测试直接证明。
- [x] 本 ticket 拥有的每个 `KW-RULE-*` 都满足对应契约文档，并有正常、取消/冲突、权限/不可用和故障注入覆盖。
- [x] 相关既有回归、`npm run typecheck` 和 `npm run lint:boundary` 通过；涉及 composition、Renderer、preload/main 时运行相应 build。
- [x] ticket 交付记录只填写实际执行命令、平台和结果；普通执行结果不写入 `LOG.md`。
- [x] 交付物没有未决的“可能”“按需”“A 或 B”、未选框架、未选 schema 或未定义恢复语义。

## 实施交付记录

- **实现提交：** `0c1ede97`
- **平台：** macOS Darwin 25.5.0 / Apple M5 arm64 / APFS；Node `v24.16.0` / npm `11.13.0`
- **唯一标签语义：** `extractKnowledgePageTags` 只消费 Ticket 11 共享 IR；Frontmatter `tags` 复用 Ticket 25 的同一 lossless projection 资格和已解析 token，不新增 YAML parser，也不对复杂 YAML 读取局部安全子集。
- **标签值边界：** 只接受 Frontmatter string 或一维 string array；值执行 NFC 与首尾空白去除，空值/控制字符丢弃，不按空格或逗号拆分。body `#tag` 完全服从共享 IR 的 heading、纯数字、代码、URL、link destination、转义和 Unicode 边界。
- **来源与 origin：** 页面投影固定携带 `sourceKey`，相同标签不跨来源聚合；Frontmatter/body 在同页按 NFC 后精确、大小写敏感值去重，并保留稳定的 `frontmatter`/`body` origins。
- **事实边界：** 提取器是当前文本的无副作用纯投影，不访问 ResourceIO、Server 或索引；Ticket 41 的已保存磁盘抽取管线必须在成功保存并重读后调用同一函数，当前未保存 buffer 不会因此进入 Server 索引。
- **Page Task：** shared Markdown Surface 的 `taskField` 只装饰 IR `task_marker`；点击原生 checkbox 只把准确三字符范围写成 `[ ]` 或 `[x]`，`[X]` 写回规范为小写 `[x]`，每次切换恰好一个 CM6 transaction/undo step。
- **拒绝与故障：** 普通段落、引用同形文本、inline/fenced code 不生成 task；陈旧 marker position 返回 `not_task`，只读/不可用编辑器返回 `read_only`，dispatch 故障向上暴露且在 transaction 前不改 buffer。标签解析支持 AbortSignal，并且取消不返回部分投影。
- **横切 UI：** 删除旧 Lezer 专用 checkbox handler，避免两套 task 语义；zh-CN、zh-TW、en、ja、ko、原生键盘复选框、ARIA label、focus-visible、亮暗 token 与 560px 窄布局同步交付。
- **精确自动化：** `npx vitest run tests/knowledge-tags-tasks.test.ts`（1 file、16/16）。
- **相关回归：** `npx vitest run tests/knowledge-tags-tasks.test.ts tests/frontmatter-roundtrip.test.ts tests/markdown-knowledge-ir.test.ts desktop/src/react/__tests__/editor/md-decorations.test.ts desktop/src/react/__tests__/components/MarkdownEditorSurface.test.tsx tests/i18n-locale-parity.test.ts tests/knowledge-i18n-a11y-contract.test.ts`（7 files、94/94）。
- **全仓回归：** `npx vitest run --exclude 'temp/**' --exclude 'teach/**' --silent`（1034 files passed、1 skipped；10403 tests passed、6 skipped）。
- **门禁与构建：** `npm run typecheck`、`npm run lint:boundary`、目标 ESLint、`git diff --check` 与 `npm run build:renderer` 通过；未改变 composition、preload/main 或 Server。
- **Playwright：** 按本 ticket 契约不适用，未运行；发布级 E2E-KW-013 由其完整用户入口具备后统一回填。
- **Handoff：** `speculo/.speculo/commands/handoff/2026-07-29-openhanako-knowledge-workspace-implementation-26.md`
