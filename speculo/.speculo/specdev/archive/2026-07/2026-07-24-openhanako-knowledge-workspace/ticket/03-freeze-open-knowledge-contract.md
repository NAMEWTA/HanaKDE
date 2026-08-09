---
schema_version: 3
artifact: ticket
change: 2026-07-24-openhanako-knowledge-workspace
id: T-03
title: "冻结 Open 知识协议与资源地址命名"
status: done
planning_depth: standard
planning_depth_reason: "历史完成 Ticket 的 SpecDev v3 兼容迁移；保留既有实现、验证与验收记录。"
ready: false
risk: medium
blocked_by: ["T-01"]
contract_ids: ["KW-US-004","KW-US-009","KW-US-163","KW-US-164","KW-US-172","KW-US-173","KW-RULE-RESOURCE"]
owner: historical-implementer
expected_changes: ["<Path>{roots.state}/specdev/changes/2026-07-24-openhanako-knowledge-workspace/ticket/03-freeze-open-knowledge-contract.md</Path>"]
writable_paths: []
read_only_paths: []
shared_paths: []
shared_path_owners: []
---
# Ticket 03: 冻结 Open 知识协议与资源地址命名

- **被阻塞于：** [`01-freeze-real-repository-baseline.md`](./01-freeze-real-repository-baseline.md)
- **状态：** 已完成

## 战略与背景

- **战略：** 保留既有 ResourceRef，定义 KnowledgeResourceAddress 和 Open 共享协议边界。
- **需求追踪：** KW-US-004, KW-US-009, KW-US-163, KW-US-164, KW-US-172, KW-US-173, KW-RULE-RESOURCE
- **当前现状：** lib/resource-io/types.ts 已定义 ResourceRef 联合类型；现有文档把另一种地址误命名为 ResourceRef。
- **用户可验证结果：** 完成本 ticket 后，验收者能够通过公开 API、真实临时 workspace 或可交互 UI 验证本标题声明的单一能力。

## 范围边界

| IN | REUSE | OUT |
|---|---|---|
| 保留既有 ResourceRef，定义 KnowledgeResourceAddress 和 Open 共享协议边界。 | `lib/resource-io/types.ts`<br>`server/composition/open-root.ts`<br>`server/composition/full-root.ts`<br>`shared/` | 未列入本 ticket 的后续功能；修改生成 bundle；创建平行文件系统、编辑器内核或私有 route 捷径 |

## 交付物

> 以下仅列主要交付物，不构成文件白名单或完整清单；为满足本 ticket 验收而新增/修改的同范围实现、类型、schema、fixture、测试、i18n 与文档同属交付物。

- `shared/knowledge-workspace-contract.ts`
- `tests/knowledge-contract-schema.test.ts`

## 实施时需阅读的文件

> 以下列出本 ticket 的具体代码接缝；实施前还必须按 [`README.md`](../README.md) 的文档权威关系读取 accepted [`LOG.md`](../LOG.md)、[`ADR.md`](../ADR.md)、[`CONTEXT.md`](../CONTEXT.md)、[`spec.md`](../spec.md) 及本 ticket 的固定实施契约，不能因本节或交付物未逐项复写而遗漏已确认结论。

- `lib/resource-io/types.ts`
- `server/composition/open-root.ts`
- `server/composition/full-root.ts`
- `shared/`

## 固定实施契约

- [`implementation-contracts.md`](../implementation-contracts.md)

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
5. principal/owner/scope 只来自认证后的 Hono context；共享 schema 拒绝客户端身份字段，错误码采用 lowercase snake_case。
6. native Main-only route 的 credential 类型属于共享契约，但 token 值绝不进入 preload、Renderer、DTO 或日志。

## 自动化证据

**Primary ownership：** KW-US-004, KW-US-009, KW-US-163, KW-US-164, KW-US-172, KW-US-173

**必须创建或更新：**

- `tests/knowledge-contract-schema.test.ts`
- `tests/knowledge-open-full-composition.test.ts`

**Playwright 用户流程：** 不适用；本 ticket 使用上述 Vitest，不运行 Playwright。

**发布级关联场景：** E2E-KW-002、E2E-KW-021（仅追踪，不作为本 ticket Playwright 门禁）

## 验收标准

- [x] ResourceRef 不被重定义；DTO 不含绝对路径；伪造 principal 字段不能覆盖认证 context；open/full 只通过 composition 注入差异。
- [x] 本 ticket 拥有的每个 `KW-US-*` 都由上列精确测试直接证明；不存在范围兜底或 Ticket 57 代实现。
- [x] 本 ticket 拥有的每个 `KW-RULE-*` 都满足对应契约文档，并有正常、取消/冲突、权限/不可用和故障注入覆盖。
- [x] 相关既有回归、`npm run typecheck` 和 `npm run lint:boundary` 通过；涉及 composition、Renderer、preload/main 时运行相应 build。
- [x] ticket 交付记录只填写实际执行命令、平台和结果；普通执行结果不写入 `LOG.md`。
- [x] 交付物没有未决的“可能”“按需”“A 或 B”、未选框架、未选 schema 或未定义恢复语义。

## 实现交接摘要

- **主线实现提交：** `93de5ecf`（隔离 worktree 原始提交 `75686fe5`）。
- **平台：** macOS 26.5（Darwin 25.5.0，arm64）、Node `v24.16.0`、npm `11.13.0`。
- **实现范围：** 新增 Open 共享知识协议、地址与 schema；强化 ResourceIO 认证上下文、owner/scope、远程本地路径和事件投影的 fail-closed 边界；把共享契约纳入 Open export manifest。
- **精确自动化：** `volta run npx vitest run tests/knowledge-contract-schema.test.ts tests/knowledge-open-full-composition.test.ts tests/resource-io-route.test.ts`，3 files、135/135 通过。
- **分发回归：** `volta run npx vitest run tests/open-boundary-lint.test.ts tests/build-server-open.test.ts tests/export-open-tree.test.ts`，3 files、52/52 通过。
- **静态与构建门禁：** target ESLint 0 error（仅保留 `lib/resource-io/types.ts:218` 的既存 warning）；`volta run npm run typecheck`、`volta run npm run lint:boundary`、`volta run npm run build:renderer`、`volta run npm run build:server:open`、`volta run npm run smoke:server:open` 均通过。
- **Full 构建：** 首次因缺少 Renderer 产物失败；补建 Renderer 后因缺少 `HANA_SIGN_KEY` 失败；使用一次性临时 Ed25519 测试签名材料重跑 `volta run npm run build:server` 后通过。临时私钥与 keyset 已删除且未进入仓库或日志。
- **审查：** Standards Review 与 Spec Review 最终均 `APPROVED`；无设计偏差。`HANA_ROOT` 是只读产品运行时根，不是 workspace/source 根，隔离测试继续使用独立临时 `HANA_HOME`、workspace、来源与端口。
- **发布边界：** E2E-KW-002、E2E-KW-021 仍仅追踪，留待其 owner ticket/发布 Gate 执行；本票不把 Vitest 契约证据登记成最终 E2E。
- **交接：** `speculo/.speculo/commands/handoff/2026-07-26-openhanako-knowledge-workspace-implementation-01.md`。
