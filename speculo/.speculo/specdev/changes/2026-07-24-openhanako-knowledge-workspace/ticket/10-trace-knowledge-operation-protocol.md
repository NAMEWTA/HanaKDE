# Ticket 10: 贯通知识操作计划与提交曳光弹

- **被阻塞于：** [`04-define-errors-and-diagnostics.md`](./04-define-errors-and-diagnostics.md)、[`06-complete-resource-io-http-seams.md`](./06-complete-resource-io-http-seams.md)
- **状态：** 未开始

## 战略与背景

- **战略：** 以单文件同源 rename 贯通 preview、expected-version、commit、checkpoint、correlation、结构化结果和 UI 摘要。
- **需求追踪：** KW-US-143, KW-RULE-OBS, KW-RULE-OP, KW-RULE-RECOVERY
- **当前现状：** ResourceEvent 当前没有 operation correlation；附件、rename、delete tickets 会重复需要相同批次语义。
- **用户可验证结果：** 完成本 ticket 后，验收者能够通过公开 API、真实临时 workspace 或可交互 UI 验证本标题声明的单一能力。

## 范围边界

| IN | REUSE | OUT |
|---|---|---|
| 以单文件同源 rename 贯通 preview、expected-version、commit、checkpoint、correlation、结构化结果和 UI 摘要。 | `lib/resource-io/resource-io.ts`<br>`lib/resource-io/types.ts`<br>`server/resource-events-ws.ts` | 未列入本 ticket 的后续功能；修改生成 bundle；创建平行文件系统、编辑器内核或私有 route 捷径 |

## 交付物

> 以下仅列主要交付物，不构成文件白名单或完整清单；为满足本 ticket 验收而新增/修改的同范围实现、类型、schema、fixture、测试、i18n 与文档同属交付物。

- `lib/knowledge-workspace/knowledge-operation-plan.ts`
- `core/knowledge-workspace/knowledge-operation-coordinator.ts`
- `tests/knowledge-operation-tracer.test.ts`

## 实施时需阅读的文件

> 以下列出本 ticket 的具体代码接缝；实施前还必须按 [`README.md`](../README.md) 的文档权威关系读取 accepted [`LOG.md`](../LOG.md)、[`ADR.md`](../ADR.md)、[`CONTEXT.md`](../CONTEXT.md)、[`spec.md`](../spec.md) 及本 ticket 的固定实施契约，不能因本节或交付物未逐项复写而遗漏已确认结论。

- `lib/resource-io/resource-io.ts`
- `lib/resource-io/types.ts`
- `server/resource-events-ws.ts`

## 固定实施契约

- [`operation-journal-contract.md`](../operation-journal-contract.md)

## 实施顺序

1. 使用 `crypto.randomUUID()` 生成 UUIDv4 operationId；按契约实现递归排序 JSON 的 SHA-256 request hash 与 15 分钟 TTL。
2. 实现 journal 原子写、状态机、地址锁和幂等 commit。
3. 在 mutation route 注册前运行 recovery barrier。
4. 提供命名 failure injection，覆盖 rollback failure 与 RECOVERY_REQUIRED。

## 实现约束

1. 普通资源访问必须经现有 ResourceIO/provider；复合 mutation 必须经公开 coordinator 和 Operation Journal。
2. Renderer 不访问 Node 文件系统；远程 DTO、日志和 release evidence 不含绝对路径、正文或凭证。
3. 测试使用隔离临时 HANA_HOME、workspace、来源和端口，不依赖开发机固定路径或网络。
4. 实现不得引入未在 ADR/实施契约冻结的新存储引擎、IPC path surface、恢复状态或 E2E 框架。

## 自动化证据

**Primary ownership：** KW-US-143

**必须创建或更新：**

- `tests/knowledge-operation-tracer.test.ts`
- `tests/knowledge-operation-journal.test.ts`
- `tests/knowledge-operation-recovery.test.ts`

**Playwright 用户流程：** 不适用；本 ticket 使用上述 Vitest 单元、组件、契约或集成测试，不运行 Playwright；下游或发布级用户流程可继续覆盖相关行为

## 验收标准

- [ ] 过期计划拒绝提交；失败可回滚；watcher 能识别内部事务；结果逐项报告成功、失败和回滚。
- [ ] 本 ticket 拥有的每个 `KW-US-*` 都由上列精确测试直接证明；不存在范围兜底或 Ticket 57 代实现。
- [ ] 本 ticket 拥有的每个 `KW-RULE-*` 都满足对应契约文档，并有正常、取消/冲突、权限/不可用和故障注入覆盖。
- [ ] 相关既有回归、`npm run typecheck` 和 `npm run lint:boundary` 通过；涉及 composition、Renderer、preload/main 时运行相应 build。
- [ ] ticket 交付记录只填写实际执行命令、平台和结果；普通执行结果不写入 `LOG.md`。
- [ ] 交付物没有未决的“可能”“按需”“A 或 B”、未选框架、未选 schema 或未定义恢复语义。
