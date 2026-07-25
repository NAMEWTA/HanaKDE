# Ticket 06: 补齐 ResourceIO HTTP 变更接缝

- **被阻塞于：** [`03-freeze-open-knowledge-contract.md`](./03-freeze-open-knowledge-contract.md)、[`04-define-errors-and-diagnostics.md`](./04-define-errors-and-diagnostics.md)、[`05-adapt-workspace-source-registry.md`](./05-adapt-workspace-source-registry.md)
- **状态：** 未开始

## 战略与背景

- **战略：** 在 Open route 中补齐 copy、mkdir、delete 与 provider-neutral transfer，统一认证身份、expected-version 与事件 correlation。
- **需求追踪：** KW-RULE-RESOURCE
- **当前现状：** ResourceIO 内部已有 mkdir/delete/copy，但 HTTP 未公开；copy 拒绝不同 ref kind，现有 local-file→mount 辅助路径不可用。ResourceIO route 仍接受 body principal/user/studio 并可能返回路径字段，需要在本 ticket 收口。
- **用户可验证结果：** 完成本 ticket 后，验收者能够通过公开 API、真实临时 workspace 或可交互 UI 验证本标题声明的单一能力。

## 范围边界

| IN | REUSE | OUT |
|---|---|---|
| 在 Open route 中补齐 copy、mkdir、delete、bounded-stream transfer，并统一认证身份、expected-version 与 correlation。 | `lib/resource-io/resource-io.ts`<br>`server/routes/resource-io.ts`<br>`lib/resource-io/providers/` | 暴露 server-local materialize/import 路径；在 Renderer 中转文件字节；修改生成 bundle；创建平行文件系统 |

## 交付物

> 以下仅列主要交付物，不构成文件白名单或完整清单；为满足本 ticket 验收而新增/修改的同范围实现、类型、schema、fixture、测试、i18n 与文档同属交付物。

- `server/routes/resource-io.ts`
- `lib/resource-io/types.ts`
- `lib/resource-io/resource-io.ts`
- `tests/resource-io-route.test.ts`
- `tests/resource-io-transfer.test.ts`

## 实施时需阅读的文件

> 以下列出本 ticket 的具体代码接缝；实施前还必须按 [`README.md`](../README.md) 的文档权威关系读取 accepted [`LOG.md`](../LOG.md)、[`ADR.md`](../ADR.md)、[`CONTEXT.md`](../CONTEXT.md)、[`spec.md`](../spec.md) 及本 ticket 的固定实施契约，不能因本节或交付物未逐项复写而遗漏已确认结论。

- `lib/resource-io/resource-io.ts`
- `server/routes/resource-io.ts`
- `lib/resource-io/providers/`

## 固定实施契约

- [`architecture.md`](../architecture.md)
- [`spec.md`](../spec.md)
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
5. principal 只来自 Hono auth context；客户端身份字段必须被 schema 拒绝。非 loopback/Knowledge DTO 不返回绝对路径。
6. transfer 实现 `exportTree`/`importTreeAtomically` SPI，跨 provider 固定 1 MiB chunk、4 个 file streams、8 MiB buffer 与 sibling staging；目录完整后一次发布，取消/失败不留下正式半成品。

## 自动化证据

**Primary ownership：** 无直接用户故事；按上列规则域交付

**必须创建或更新：**

- `tests/resource-io-route.test.ts`
- `tests/resource-io-transfer.test.ts`

**Playwright 用户流程：** 不适用；本 ticket 使用上述 Vitest 单元、组件、契约或集成测试，不运行 Playwright；下游或发布级用户流程可继续覆盖相关行为

## 验收标准

- [ ] HTTP 能力与 provider capability 一致；跨 provider transfer 覆盖大文件、目录、symlink no-follow/unsupported、1MiB/4/8MiB 上限、取消、staging 清理和 provider-pair matrix。
- [ ] 伪造 principal/user/studio 无法越权；LAN/Mobile/Knowledge response 不泄露绝对路径。
- [ ] `Primary ownership` 明确为无直接用户故事；本 ticket 不新增未分配的产品行为，也不替其他 ticket 兜底。
- [ ] 本 ticket 拥有的每个 `KW-RULE-*` 都满足对应契约文档，并有正常、取消/冲突、权限/不可用和故障注入覆盖。
- [ ] 相关既有回归、`npm run typecheck` 和 `npm run lint:boundary` 通过；涉及 composition、Renderer、preload/main 时运行相应 build。
- [ ] ticket 交付记录只填写实际执行命令、平台和结果；普通执行结果不写入 `LOG.md`。
- [ ] 交付物没有未决的“可能”“按需”“A 或 B”、未选框架、未选 schema 或未定义恢复语义。
