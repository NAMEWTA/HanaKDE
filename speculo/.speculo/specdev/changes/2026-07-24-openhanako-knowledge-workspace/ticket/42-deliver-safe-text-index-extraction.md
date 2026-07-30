# Ticket 42: 交付非 Markdown 安全文本抽取

- **被阻塞于：** [`17-deliver-open-policy-and-asset-viewer.md`](./17-deliver-open-policy-and-asset-viewer.md)、[`40-establish-index-store-schema.md`](./40-establish-index-store-schema.md)
- **状态：** 已完成

## 战略与背景

- **战略：** 按内容门禁抽取确定编码且不超限的安全文本；二进制、PDF 和主动内容只索引元数据。
- **需求追踪：** KW-US-157, KW-RULE-INDEX
- **当前现状：** 当前基座接缝是 `desktop/src/react/utils/file-kind.ts`；resource open policy 由 Ticket 17 交付，开始本 ticket 前必须存在。
- **用户可验证结果：** 完成本 ticket 后，验收者能够通过公开 API、真实临时 workspace 或可交互 UI 验证本标题声明的单一能力。

## 范围边界

| IN | REUSE | OUT |
|---|---|---|
| 按内容门禁抽取确定编码且不超限的安全文本；二进制、PDF 和主动内容只索引元数据。 | `lib/knowledge-workspace/resource-open-policy.ts`<br>`desktop/src/react/utils/file-kind.ts` | 未列入本 ticket 的后续功能；修改生成 bundle；创建平行文件系统、编辑器内核或私有 route 捷径 |

## 交付物

> 以下仅列主要交付物，不构成文件白名单或完整清单；为满足本 ticket 验收而新增/修改的同范围实现、类型、schema、fixture、测试、i18n 与文档同属交付物。

- `lib/knowledge-workspace/safe-text-index-extractor.ts`
- `tests/safe-text-index-extractor.test.ts`

## 实施时需阅读的文件

> 以下列出本 ticket 的具体代码接缝；实施前还必须按 [`README.md`](../README.md) 的文档权威关系读取 accepted [`LOG.md`](../LOG.md)、[`ADR.md`](../ADR.md)、[`CONTEXT.md`](../CONTEXT.md)、[`spec.md`](../spec.md) 及本 ticket 的固定实施契约，不能因本节或交付物未逐项复写而遗漏已确认结论。

- `lib/knowledge-workspace/resource-open-policy.ts`（由 Ticket 17 交付）
- `desktop/src/react/utils/file-kind.ts`

## 固定实施契约

- [`index-store-contract.md`](../index-store-contract.md)

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
5. extractor 必须先 stat/content-gate 后 read；10 MiB+1 byte 的 spy provider 测试必须证明未读取正文。
5. 本 ticket 新增 UI 同时交付 zh-CN、zh-TW、en、ja、ko、键盘、ARIA、focus、亮暗主题和窄布局。

## 自动化证据

**Primary ownership：** KW-US-157

**必须创建或更新：**

- `tests/safe-text-index-extractor.test.ts`

**Playwright 用户流程：** 不适用；本 ticket 使用上述 Vitest，不运行 Playwright。

**发布级关联场景：** E2E-KW-013（仅追踪，不作为本 ticket Playwright 门禁）

## 验收标准

- [x] PDF 无正文命中；编码/大小跨阈值时旧正文索引被移除；提取不执行内容。
- [x] 本 ticket 拥有的每个 `KW-US-*` 都由上列精确测试直接证明；不存在范围兜底或 Ticket 57 代实现。
- [x] 本 ticket 拥有的每个 `KW-RULE-*` 都满足对应契约文档，并有正常、取消/冲突、权限/不可用和故障注入覆盖。
- [x] 相关既有回归、`npm run typecheck` 和 `npm run lint:boundary` 通过；涉及 composition、Renderer、preload/main 时运行相应 build。
- [x] ticket 交付记录只填写实际执行命令、平台和结果；普通执行结果不写入 `LOG.md`。
- [x] 交付物没有未决的“可能”“按需”“A 或 B”、未选框架、未选 schema 或未定义恢复语义。

## 交付记录

- **实现提交：** `25e4ed0c`
- **平台：** macOS Darwin 25.5.0 / Apple M5 arm64 / APFS / Node v24.16.0
- **实现结果：** 交付仅经 ResourceIO `stat`、content gate、expected-version `openRead` 的非 Markdown 安全文本抽取器。无 BOM 内容只接受严格 UTF-8；UTF-8/UTF-16 LE/BE/UTF-32 LE/BE 仅按确定 BOM 解码。10 MiB+1、PDF、图片、音视频、二进制和主动 HTML/SVG/URL/Mermaid 均不读取正文，PDF 不做文本层抽取或 OCR，所有内容都不执行。安全文本以资源正文进入既有 FTS，跨越大小/编码门禁后事务替换会清除旧正文，只保留资源元数据。
- **精确测试：** `npx vitest run tests/safe-text-index-extractor.test.ts --exclude 'temp/**' --reporter=dot`，1 file、22/22 通过；真实 ResourceIO spy provider 覆盖全部允许编码、10 MiB+1 零 read、PDF/媒体/二进制/主动内容零 read、非法编码、版本/长度漂移、missing、权限拒绝、取消、旧正文清理与 Markdown 入口拒绝。
- **相关回归：** 安全文本/open policy/file kind/索引 Store/Schema/Markdown 抽取 6 files、102/102；索引与持久化专项 6 files、56/56。
- **全仓测试：** `npm test -- --exclude 'temp/**'`，1060 files（1059 passed、1 skipped），10684 tests（10678 passed、6 skipped）。
- **静态与构建：** `npm run typecheck`、`npm run lint:boundary`、目标 ESLint、`git diff --check`、`npm run build:server:open` 均通过；Open Server better-sqlite3 runtime smoke 通过。
- **持久化审查：** SQLite schema、ownership、checkpoint/restore policy 与 `DATA_EPOCH` 均不变；扩展既有 regenerable 事务 DTO 校验和脱敏计数后按 compatible addition 重钉指纹 `sha256:655391089631e5314ad218a5939089c1391ed29e5420efe3d69e2890c4ec2da2`。
- **UI/E2E：** 本 ticket 未新增 UI，五语言/键盘/ARIA/focus/主题/窄布局约束不适用；按 ticket 明确要求未运行 Playwright。E2E-KW-013 仅保留发布级关联，当前仓库不存在对应 spec，未记为通过。
