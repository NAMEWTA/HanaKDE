# Ticket 43: 交付 watcher 增量协调与 rebuild

- **被阻塞于：** [`06-complete-resource-io-http-seams.md`](./06-complete-resource-io-http-seams.md)、[`10-trace-knowledge-operation-protocol.md`](./10-trace-knowledge-operation-protocol.md)、[`40-establish-index-store-schema.md`](./40-establish-index-store-schema.md)、[`41-deliver-markdown-index-extraction.md`](./41-deliver-markdown-index-extraction.md)、[`42-deliver-safe-text-index-extraction.md`](./42-deliver-safe-text-index-extraction.md)
- **状态：** 未开始

## 战略与背景

- **战略：** 把 ResourceEvent 当提示，以磁盘重读、sequence、correlation 和 debounce 驱动最终一致索引。
- **需求追踪：** KW-RULE-OBS, KW-RULE-INDEX, KW-RULE-RECOVERY
- **当前现状：** 当前实现接缝位于 `lib/resource-io/resource-watch-registry.ts`、`server/resource-events-ws.ts`、`core/knowledge-workspace/knowledge-index-coordinator.ts`；本 ticket 只扩展这些公开边界。
- **用户可验证结果：** 完成本 ticket 后，验收者能够通过公开 API、真实临时 workspace 或可交互 UI 验证本标题声明的单一能力。

## 范围边界

| IN | REUSE | OUT |
|---|---|---|
| 把 ResourceEvent 当提示，以磁盘重读、sequence、correlation 和 debounce 驱动最终一致索引。 | `lib/resource-io/resource-watch-registry.ts`<br>`server/resource-events-ws.ts`<br>`core/knowledge-workspace/knowledge-index-coordinator.ts` | 未列入本 ticket 的后续功能；修改生成 bundle；创建平行文件系统、编辑器内核或私有 route 捷径 |

## 交付物

- `core/knowledge-workspace/knowledge-index-event-coordinator.ts`
- `tests/knowledge-index-rebuild.test.ts`

## 需阅读的真实文件

- `lib/resource-io/resource-watch-registry.ts`
- `server/resource-events-ws.ts`
- `core/knowledge-workspace/knowledge-index-coordinator.ts`

## 固定实施契约

- [`index-store-contract.md`](../index-store-contract.md)
- [`operation-journal-contract.md`](../operation-journal-contract.md)

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

## 自动化证据

**Primary ownership：** 无直接用户故事；按上列规则域交付

**必须创建或更新：**

- `tests/knowledge-index-rebuild.test.ts`
- `tests/knowledge-index-event-coordinator.test.ts`

**对应端到端场景：** E2E-KW-013、E2E-KW-014

## 验收标准

- [ ] 处理 burst、断线回放 stale、删除、移动、来源不可用和内部事务；可取消全量重建。
- [ ] `Primary ownership` 明确为无直接用户故事；本 ticket 不新增未分配的产品行为，也不替其他 ticket 兜底。
- [ ] 本 ticket 拥有的每个 `KW-RULE-*` 都满足对应契约文档，并有正常、取消/冲突、权限/不可用和故障注入覆盖。
- [ ] 相关既有回归、`npm run typecheck` 和 `npm run lint:boundary` 通过；涉及 composition、Renderer、preload/main 时运行相应 build。
- [ ] ticket 交付记录只填写实际执行命令、平台和结果；普通执行结果不写入 `LOG.md`。
- [ ] 交付物没有未决的“可能”“按需”“A 或 B”、未选框架、未选 schema 或未定义恢复语义。
