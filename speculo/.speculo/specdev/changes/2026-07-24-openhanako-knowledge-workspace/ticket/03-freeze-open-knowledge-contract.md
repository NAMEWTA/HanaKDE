# Ticket 03: 冻结 Open 知识协议与资源地址命名

- **被阻塞于：** [`01-freeze-real-repository-baseline.md`](./01-freeze-real-repository-baseline.md)
- **状态：** 未开始

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

- `shared/knowledge-workspace-contract.ts`
- `tests/knowledge-contract-schema.test.ts`

## 需阅读的真实文件

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

## 自动化证据

**Primary ownership：** KW-US-004, KW-US-009, KW-US-163, KW-US-164, KW-US-172, KW-US-173

**必须创建或更新：**

- `tests/knowledge-contract-schema.test.ts`
- `tests/knowledge-open-full-composition.test.ts`

**对应端到端场景：** E2E-KW-002、E2E-KW-021

## 验收标准

- [ ] ResourceRef 不被重定义；DTO 不含绝对路径；open/full 只通过 composition 注入差异。
- [ ] 本 ticket 拥有的每个 `KW-US-*` 都由上列精确测试直接证明；不存在范围兜底或 Ticket 57 代实现。
- [ ] 本 ticket 拥有的每个 `KW-RULE-*` 都满足对应契约文档，并有正常、取消/冲突、权限/不可用和故障注入覆盖。
- [ ] 相关既有回归、`npm run typecheck` 和 `npm run lint:boundary` 通过；涉及 composition、Renderer、preload/main 时运行相应 build。
- [ ] ticket 交付记录只填写实际执行命令、平台和结果；普通执行结果不写入 `LOG.md`。
- [ ] 交付物没有未决的“可能”“按需”“A 或 B”、未选框架、未选 schema 或未定义恢复语义。
