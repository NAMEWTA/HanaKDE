---
schema_version: 3
artifact: ticket
change: 2026-07-24-openhanako-knowledge-workspace
id: T-23
title: "建立知识地址与同源 LinkResolver"
status: done
planning_depth: standard
planning_depth_reason: "历史完成 Ticket 的 SpecDev v3 兼容迁移；保留既有实现、验证与验收记录。"
ready: false
risk: medium
blocked_by: ["T-05","T-11"]
contract_ids: ["KW-US-003","KW-US-119","KW-RULE-MARKDOWN"]
owner: historical-implementer
expected_changes: ["<Path>{roots.state}/specdev/changes/2026-07-24-openhanako-knowledge-workspace/ticket/23-define-knowledge-address-resolver.md</Path>"]
writable_paths: []
read_only_paths: []
shared_paths: []
shared_path_owners: []
---
# Ticket 23: 建立知识地址与同源 LinkResolver

- **被阻塞于：** [`05-adapt-workspace-source-registry.md`](./05-adapt-workspace-source-registry.md)、[`11-define-markdown-semantic-ir.md`](./11-define-markdown-semantic-ir.md)
- **状态：** 已完成

## 战略与背景

- **战略：** 定义规范来源内地址、Wikilink 根相对语义、Markdown 链接页面相对语义和同源 fail-closed。
- **需求追踪：** KW-US-003, KW-US-119, KW-RULE-MARKDOWN
- **当前现状：** 当前实现接缝位于 `lib/resource-io/resource-refs.ts`、`lib/resource-io/providers/mount-provider.ts`；本 ticket 只扩展这些公开边界。
- **用户可验证结果：** 完成本 ticket 后，验收者能够通过公开 API、真实临时 workspace 或可交互 UI 验证本标题声明的单一能力。

## 范围边界

| IN | REUSE | OUT |
|---|---|---|
| 定义规范来源内地址、Wikilink 根相对语义、Markdown 链接页面相对语义和同源 fail-closed。 | `lib/resource-io/resource-refs.ts`<br>`lib/resource-io/providers/mount-provider.ts` | 未列入本 ticket 的后续功能；修改生成 bundle；创建平行文件系统、编辑器内核或私有 route 捷径 |

## 交付物

> 以下仅列主要交付物，不构成文件白名单或完整清单；为满足本 ticket 验收而新增/修改的同范围实现、类型、schema、fixture、测试、i18n 与文档同属交付物。

- `lib/knowledge-workspace/knowledge-address.ts`
- `lib/knowledge-workspace/link-resolver.ts`
- `tests/knowledge-link-resolver.test.ts`

## 实施时需阅读的文件

> 以下列出本 ticket 的具体代码接缝；实施前还必须按 [`README.md`](../README.md) 的文档权威关系读取 accepted [`LOG.md`](../LOG.md)、[`ADR.md`](../ADR.md)、[`CONTEXT.md`](../CONTEXT.md)、[`spec.md`](../spec.md) 及本 ticket 的固定实施契约，不能因本节或交付物未逐项复写而遗漏已确认结论。

- `lib/resource-io/resource-refs.ts`
- `lib/resource-io/providers/mount-provider.ts`

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
5. canonical address、Wikilink、页面目录相对 Markdown destination、percent-decode、fragment 与重构输出必须直接实现 `implementation-contracts.md` 第 7 节，不使用平台 cwd/path 猜测。

## 自动化证据

**Primary ownership：** KW-US-003, KW-US-119

**必须创建或更新：**

- `tests/knowledge-link-resolver.test.ts`

**Playwright 用户流程：** 不适用；本 ticket 使用上述 Vitest，不运行 Playwright。

**发布级关联场景：** E2E-KW-009（仅追踪，不作为本 ticket Playwright 门禁）

## 验收标准

- [x] canonical address/Wikilink 拒绝 dot 段；标准 Markdown link 允许安全的 `.`/`..` 页面相对输入，但 normalize 后越出 Source 必须拒绝。矩阵覆盖绝对路径、UNC、盘符、无效 percent 编码、只解码一次、编码分隔符、fragment、真实大小写、Unicode 与扩展名。
- [x] 本 ticket 拥有的每个 `KW-US-*` 都由上列精确测试直接证明；不存在范围兜底或 Ticket 57 代实现。
- [x] 本 ticket 拥有的每个 `KW-RULE-*` 都满足对应契约文档，并有正常、取消/冲突、权限/不可用和故障注入覆盖。
- [x] 相关既有回归、`npm run typecheck` 和 `npm run lint:boundary` 通过；涉及 composition、Renderer、preload/main 时运行相应 build。
- [x] ticket 交付记录只填写实际执行命令、平台和结果；普通执行结果不写入 `LOG.md`。
- [x] 交付物没有未决的“可能”“按需”“A 或 B”、未选框架、未选 schema 或未定义恢复语义。

## 实施交付记录

- **实现提交：** `35a27e0d`
- **平台：** macOS Darwin 25.5.0 / Apple M5 arm64 / APFS；Node `v24.16.0` / npm `11.13.0`
- **canonical address：** 新领域层校验 Source 根相对 `/` 协议路径，拒绝空值、绝对/UNC/盘符、空段、dot 段与控制字符；大小写、Unicode 序列、扩展名及 `%` 字面拼写保持原样。字面反斜杠默认 fail-closed，只有 provider 对精确地址给出验证时可接受。
- **Wikilink：** 直接消费 Ticket 11 共享词法已经反转义的 address/fragment/display 字段；地址按当前 Source 根解析，不做 percent-decode，不接受 `sourceKey:`、绝对路径、dot 段或跨来源回退。空地址加 fragment 明确指向当前页面。
- **Markdown destination：** 直接消费 CommonMark 已反转义 destination；只把 `http:`/`https:` 分类为外链，拒绝其他 scheme、protocol-relative、rooted、盘符/UNC、query 与反斜杠。内部 path 逐段严格 UTF-8 percent-decode 一次，拒绝无效编码、编码 `/`/`\`/控制字符，并以页面目录为基准词法 normalize；越出 Source 立即返回 out-of-scope。
- **同源重构输出：** Wikilink 输出 Source 根相对真实 canonical path 并转义结构字符；标准 Markdown 输出等价 `path.posix.relative(dirname(page), target)` 的页面相对路径，逐真实名称段按 RFC 3986 编码，同目录不加 `./`，fragment 保留。实现不读取 cwd、不使用平台分隔符、不查询全局文件名。
- **精确自动化：** `npx vitest run tests/knowledge-link-resolver.test.ts`（1 file、22/22）。
- **相关回归：** `npx vitest run tests/knowledge-link-resolver.test.ts tests/markdown-knowledge-ir.test.ts tests/knowledge-contract-schema.test.ts tests/knowledge-malicious-workspace.test.ts tests/resource-io-mount-provider.test.ts`（5 files、142/142）。
- **全仓回归：** `npx vitest run --exclude 'temp/**' --exclude 'teach/**' --silent`（1031 files passed、1 skipped；10356 tests passed、6 skipped）。
- **门禁与复审：** `npm run typecheck`、`npm run lint:boundary`、目标 ESLint 与 `git diff --check` 通过；本票未改变 composition、Renderer、preload/main，故不触发额外 build。固定点 `7ff84472` 到实现提交 `35a27e0d` 的规范轴与标准轴本地复审无未决 blocker。
- **Playwright：** 本 ticket 按契约不运行 Playwright；E2E-KW-009 仅作为 Tickets 24/37 完成真实编辑/导航入口后的发布级关联场景。
- **Handoff：** `speculo/.speculo/commands/handoff/2026-07-29-openhanako-knowledge-workspace-implementation-23.md`
