# Ticket 56: 交付回收站恢复、清理与系统废纸篓

- **被阻塞于：** [`04-define-errors-and-diagnostics.md`](./04-define-errors-and-diagnostics.md)、[`10-trace-knowledge-operation-protocol.md`](./10-trace-knowledge-operation-protocol.md)、[`14-establish-malicious-workspace-tests.md`](./14-establish-malicious-workspace-tests.md)、[`23-define-knowledge-address-resolver.md`](./23-define-knowledge-address-resolver.md)、[`44-deliver-knowledge-query-apis.md`](./44-deliver-knowledge-query-apis.md)、[`51-deliver-import-native-picker.md`](./51-deliver-import-native-picker.md)、[`55-deliver-workspace-trash-delete.md`](./55-deliver-workspace-trash-delete.md)
- **状态：** 未开始

## 战略与背景

- **战略：** 列出批次、恢复原路径、确定冲突后缀、调整同批内部链接，并把到期内容移入系统废纸篓。
- **需求追踪：** KW-US-149, KW-US-150, KW-US-151, KW-US-152, KW-US-153, KW-US-154, KW-US-155, KW-RULE-OP, KW-RULE-SEC, KW-RULE-NATIVE, KW-RULE-RECOVERY
- **当前现状：** 当前基座接缝是 `desktop/main.cjs` 与 `desktop/preload.cjs`；`knowledge-trash-service.ts` 由 Ticket 55 交付，开始本 ticket 前必须存在。
- **用户可验证结果：** 完成本 ticket 后，验收者能够通过公开 API、真实临时 workspace 或可交互 UI 验证本标题声明的单一能力。

## 范围边界

| IN | REUSE | OUT |
|---|---|---|
| 列出批次、恢复原路径、确定冲突后缀、调整同批内部链接，并把到期内容移入系统废纸篓。 | `desktop/main.cjs`<br>`desktop/preload.cjs`<br>`core/knowledge-workspace/knowledge-trash-service.ts` | 未列入本 ticket 的后续功能；修改生成 bundle；创建平行文件系统、编辑器内核或私有 route 捷径 |

## 交付物

> 以下仅列主要交付物，不构成文件白名单或完整清单；为满足本 ticket 验收而新增/修改的同范围实现、类型、schema、fixture、测试、i18n 与文档同属交付物。

- `desktop/src/react/components/knowledge-workspace/KnowledgeTrashView.tsx`
- `shared/knowledge-native-contract.ts`
- `tests/knowledge-trash-restore.test.ts`

## 实施时需阅读的文件

> 以下列出本 ticket 的具体代码接缝；实施前还必须按 [`README.md`](../README.md) 的文档权威关系读取 accepted [`LOG.md`](../LOG.md)、[`ADR.md`](../ADR.md)、[`CONTEXT.md`](../CONTEXT.md)、[`spec.md`](../spec.md) 及本 ticket 的固定实施契约，不能因本节或交付物未逐项复写而遗漏已确认结论。

- `desktop/main.cjs`
- `desktop/preload.cjs`
- `core/knowledge-workspace/knowledge-trash-service.ts`（由 Ticket 55 交付）

## 固定实施契约

- [`implementation-contracts.md`](../implementation-contracts.md)
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
5. 本 ticket 新增 UI 同时交付 zh-CN、zh-TW、en、ja、ko、键盘、ARIA、focus、亮暗主题和窄布局。

## 自动化证据

**Primary ownership：** KW-US-149, KW-US-150, KW-US-151, KW-US-152, KW-US-153, KW-US-154, KW-US-155

**必须创建或更新：**

- `tests/knowledge-trash-restore.test.ts`
- `tests/knowledge-native-trash.test.ts`

**Playwright 用户流程：** 适用；运行 E2E-KW-020

## 验收标准

- [ ] 目录冲突整体改名；只改同批双方恢复的引用；系统废纸篓失败保留工作区副本和 manifest。
- [ ] 本 ticket 拥有的每个 `KW-US-*` 都由上列精确测试直接证明；不存在范围兜底或 Ticket 57 代实现。
- [ ] 本 ticket 拥有的每个 `KW-RULE-*` 都满足对应契约文档，并有正常、取消/冲突、权限/不可用和故障注入覆盖。
- [ ] 相关既有回归、`npm run typecheck` 和 `npm run lint:boundary` 通过；涉及 composition、Renderer、preload/main 时运行相应 build。
- [ ] ticket 交付记录只填写实际执行命令、平台和结果；普通执行结果不写入 `LOG.md`。
- [ ] 交付物没有未决的“可能”“按需”“A 或 B”、未选框架、未选 schema 或未定义恢复语义。
