# Ticket 54: 交付同源原子重命名与移动

- **被阻塞于：** [`10-trace-knowledge-operation-protocol.md`](./10-trace-knowledge-operation-protocol.md)、[`18-establish-document-session-registry.md`](./18-establish-document-session-registry.md)、[`21-deliver-external-change-conflicts.md`](./21-deliver-external-change-conflicts.md)、[`23-define-knowledge-address-resolver.md`](./23-define-knowledge-address-resolver.md)、[`43-deliver-watcher-index-rebuild.md`](./43-deliver-watcher-index-rebuild.md)、[`48-deliver-tree-keyboard-range-selection.md`](./48-deliver-tree-keyboard-range-selection.md)
- **状态：** 未开始

## 战略与背景

- **战略：** 扩展操作协调器，预览目录后代、同源引用、打开会话和索引变更并原子提交/回滚。
- **需求追踪：** KW-US-026, KW-US-027, KW-RULE-OP, KW-RULE-SEC, KW-RULE-REFACTOR, KW-RULE-RECOVERY
- **当前现状：** 当前实现接缝位于 `lib/resource-io/resource-io.ts`、`core/knowledge-workspace/knowledge-operation-coordinator.ts`、`lib/knowledge-workspace/markdown-knowledge-ir.ts`；本 ticket 只扩展这些公开边界。
- **用户可验证结果：** 完成本 ticket 后，验收者能够通过公开 API、真实临时 workspace 或可交互 UI 验证本标题声明的单一能力。

## 范围边界

| IN | REUSE | OUT |
|---|---|---|
| 扩展操作协调器，预览目录后代、同源引用、打开会话和索引变更并原子提交/回滚。 | `lib/resource-io/resource-io.ts`<br>`core/knowledge-workspace/knowledge-operation-coordinator.ts`<br>`lib/knowledge-workspace/markdown-knowledge-ir.ts` | 未列入本 ticket 的后续功能；修改生成 bundle；创建平行文件系统、编辑器内核或私有 route 捷径 |

## 交付物

- `lib/knowledge-workspace/markdown-link-rewriter.ts`
- `core/knowledge-workspace/knowledge-refactor-service.ts`
- `tests/knowledge-refactor-rollback.test.ts`

## 需阅读的真实文件

- `lib/resource-io/resource-io.ts`
- `core/knowledge-workspace/knowledge-operation-coordinator.ts`
- `lib/knowledge-workspace/markdown-knowledge-ir.ts`

## 固定实施契约

- [`operation-journal-contract.md`](../operation-journal-contract.md)

## 实施顺序

1. 从 journal PREPARED 状态执行主资源、链接、session、event、index 步骤。
2. 每个副作用前后持久化 intent/outcome，并支持重启探测。
3. rollback 逆序执行且不覆盖外部新修改。
4. 所有 named crash points 在重启后证明 committed/rolled-back/recovery-required。

## 实现约束

1. 普通资源访问必须经现有 ResourceIO/provider；复合 mutation 必须经公开 coordinator 和 Operation Journal。
2. Renderer 不访问 Node 文件系统；远程 DTO、日志和 release evidence 不含绝对路径、正文或凭证。
3. 测试使用隔离临时 HANA_HOME、workspace、来源和端口，不依赖开发机固定路径或网络。
4. 实现不得引入未在 ADR/实施契约冻结的新存储引擎、IPC path surface、恢复状态或 E2E 框架。

## 自动化证据

**Primary ownership：** KW-US-026, KW-US-027

**必须创建或更新：**

- `tests/knowledge-refactor-rollback.test.ts`
- `tests/knowledge-refactor-crash-recovery.test.ts`

**对应端到端场景：** E2E-KW-019

## 验收标准

- [ ] 计划带版本戳；dirty session 先解决；内部 watcher 关联；失败恢复文件、链接、session identity 和索引。
- [ ] 本 ticket 拥有的每个 `KW-US-*` 都由上列精确测试直接证明；不存在范围兜底或 Ticket 57 代实现。
- [ ] 本 ticket 拥有的每个 `KW-RULE-*` 都满足对应契约文档，并有正常、取消/冲突、权限/不可用和故障注入覆盖。
- [ ] 相关既有回归、`npm run typecheck` 和 `npm run lint:boundary` 通过；涉及 composition、Renderer、preload/main 时运行相应 build。
- [ ] ticket 交付记录只填写实际执行命令、平台和结果；普通执行结果不写入 `LOG.md`。
- [ ] 交付物没有未决的“可能”“按需”“A 或 B”、未选框架、未选 schema 或未定义恢复语义。
