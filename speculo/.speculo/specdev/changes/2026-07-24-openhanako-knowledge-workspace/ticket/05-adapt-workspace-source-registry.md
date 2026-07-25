# Ticket 05: 适配 main 与会话级来源注册表

- **被阻塞于：** [`03-freeze-open-knowledge-contract.md`](./03-freeze-open-knowledge-contract.md)、[`04-define-errors-and-diagnostics.md`](./04-define-errors-and-diagnostics.md)
- **状态：** 未开始

## 战略与背景

- **战略：** 把 cwd 或活动 workspaceMountId 映射为逻辑 main，并在 Studio mount 之上维护不自动恢复的会话来源。
- **需求追踪：** KW-US-001, KW-US-002, KW-US-007, KW-US-008, KW-RULE-RESOURCE
- **当前现状：** 当前实现接缝位于 `core/studio-mounts.ts`、`core/mount-aware-file-service.ts`、`server/routes/studio-workspaces.ts`；本 ticket 只扩展这些公开边界。
- **用户可验证结果：** 完成本 ticket 后，验收者能够通过公开 API、真实临时 workspace 或可交互 UI 验证本标题声明的单一能力。

## 范围边界

| IN | REUSE | OUT |
|---|---|---|
| 把 cwd 或活动 workspaceMountId 映射为逻辑 main，并在 Studio mount 之上维护不自动恢复的会话来源。 | `core/studio-mounts.ts`<br>`core/mount-aware-file-service.ts`<br>`server/routes/studio-workspaces.ts` | 未列入本 ticket 的后续功能；修改生成 bundle；创建平行文件系统、编辑器内核或私有 route 捷径 |

## 交付物

> 以下仅列主要交付物，不构成文件白名单或完整清单；为满足本 ticket 验收而新增/修改的同范围实现、类型、schema、fixture、测试、i18n 与文档同属交付物。

- `core/knowledge-workspace/source-registry.ts`
- `server/routes/knowledge-workspace.ts`
- `tests/knowledge-source-registry.test.ts`

## 实施时需阅读的文件

> 以下列出本 ticket 的具体代码接缝；实施前还必须按 [`README.md`](../README.md) 的文档权威关系读取 accepted [`LOG.md`](../LOG.md)、[`ADR.md`](../ADR.md)、[`CONTEXT.md`](../CONTEXT.md)、[`spec.md`](../spec.md) 及本 ticket 的固定实施契约，不能因本节或交付物未逐项复写而遗漏已确认结论。

- `core/studio-mounts.ts`
- `core/mount-aware-file-service.ts`
- `server/routes/studio-workspaces.ts`

## 固定实施契约

- [`implementation-contracts.md`](../implementation-contracts.md)

## 实施顺序

1. 为 LocalFsProvider 与 MountProvider 增加 root identity resolver。
2. 在 SourceRegistry 注册和每次高风险重验中使用 RootRelation。
3. 拒绝 unknown/same/ancestor/descendant 并返回稳定错误。
4. 验证历史 key 只对相同 opaqueRootId 复用。

## 实现约束

1. 普通资源访问必须经现有 ResourceIO/provider；复合 mutation 必须经公开 coordinator 和 Operation Journal。
2. Renderer 不访问 Node 文件系统；远程 DTO、日志和 release evidence 不含绝对路径、正文或凭证。
3. 测试使用隔离临时 HANA_HOME、workspace、来源和端口，不依赖开发机固定路径或网络。
4. 实现不得引入未在 ADR/实施契约冻结的新存储引擎、IPC path surface、恢复状态或 E2E 框架。
5. identity broker 按 identityNamespace 比较；local-file 与本地 backing mount 共享 `local_fs` namespace，不得因 providerId 不同直接判为 disjoint。跨 namespace 只有 composition 注册双向静态证明才可放行。

## 自动化证据

**Primary ownership：** KW-US-001, KW-US-002, KW-US-007, KW-US-008

**必须创建或更新：**

- `tests/knowledge-source-registry.test.ts`
- `tests/provider-root-identity.test.ts`

**Playwright 用户流程：** 不适用；本 ticket 使用上述 Vitest，不运行 Playwright。

**发布级关联场景：** E2E-KW-003（仅追踪，不作为本 ticket Playwright 门禁）

## 验收标准

- [ ] main 始终存在；来源根由 provider 证明不重叠；历史 key 可复用但活动挂载不自动恢复。
- [ ] 本 ticket 拥有的每个 `KW-US-*` 都由上列精确测试直接证明；不存在范围兜底或 Ticket 57 代实现。
- [ ] 本 ticket 拥有的每个 `KW-RULE-*` 都满足对应契约文档，并有正常、取消/冲突、权限/不可用和故障注入覆盖。
- [ ] 相关既有回归、`npm run typecheck` 和 `npm run lint:boundary` 通过；涉及 composition、Renderer、preload/main 时运行相应 build。
- [ ] ticket 交付记录只填写实际执行命令、平台和结果；普通执行结果不写入 `LOG.md`。
- [ ] 交付物没有未决的“可能”“按需”“A 或 B”、未选框架、未选 schema 或未定义恢复语义。
