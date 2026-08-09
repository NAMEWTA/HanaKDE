---
schema_version: 3
artifact: ticket
change: 2026-07-24-openhanako-knowledge-workspace
id: T-08
title: "迁移 Renderer 资源客户端与 Desk 兼容状态"
status: done
planning_depth: standard
planning_depth_reason: "历史完成 Ticket 的 SpecDev v3 兼容迁移；保留既有实现、验证与验收记录。"
ready: false
risk: medium
blocked_by: ["T-05","T-06","T-07"]
contract_ids: ["KW-RULE-RESOURCE"]
owner: historical-implementer
expected_changes: ["<Path>{roots.state}/specdev/changes/2026-07-24-openhanako-knowledge-workspace/ticket/08-migrate-renderer-resource-client.md</Path>"]
writable_paths: []
read_only_paths: []
shared_paths: []
shared_path_owners: []
---
# Ticket 08: 迁移 Renderer 资源客户端与 Desk 兼容状态

- **被阻塞于：** [`05-adapt-workspace-source-registry.md`](./05-adapt-workspace-source-registry.md)、[`06-complete-resource-io-http-seams.md`](./06-complete-resource-io-http-seams.md)、[`07-migrate-server-desk-workbench.md`](./07-migrate-server-desk-workbench.md)
- **状态：** 已完成

## 战略与背景

- **战略：** 建立唯一 Renderer knowledge client；旧 Desk 持久状态保留，新 Knowledge 状态使用独立空白命名空间。
- **需求追踪：** KW-RULE-RESOURCE
- **当前现状：** Desk 已按 workspace root 保存树、tabs 和 reading position；Knowledge V1 明确不恢复这些状态。
- **用户可验证结果：** 完成本 ticket 后，验收者能够通过公开 API、真实临时 workspace 或可交互 UI 验证本标题声明的单一能力。

## 范围边界

| IN | REUSE | OUT |
|---|---|---|
| 建立唯一 Renderer knowledge client；旧 Desk 持久状态保留，新 Knowledge 状态使用独立空白命名空间。 | `desktop/src/react/stores/desk-actions.ts`<br>`desktop/src/react/stores/workspace-ui-state-actions.ts`<br>`desktop/src/react/services/resource-access.ts` | 未列入本 ticket 的后续功能；修改生成 bundle；创建平行文件系统、编辑器内核或私有 route 捷径 |

## 交付物

> 以下仅列主要交付物，不构成文件白名单或完整清单；为满足本 ticket 验收而新增/修改的同范围实现、类型、schema、fixture、测试、i18n 与文档同属交付物。

- `desktop/src/react/services/knowledge-workspace-client.ts`
- `desktop/src/react/stores/knowledge-workspace-slice.ts`
- `desktop/src/react/__tests__/services/knowledge-workspace-client.test.ts`

## 实施时需阅读的文件

> 以下列出本 ticket 的具体代码接缝；实施前还必须按 [`README.md`](../README.md) 的文档权威关系读取 accepted [`LOG.md`](../LOG.md)、[`ADR.md`](../ADR.md)、[`CONTEXT.md`](../CONTEXT.md)、[`spec.md`](../spec.md) 及本 ticket 的固定实施契约，不能因本节或交付物未逐项复写而遗漏已确认结论。

- `desktop/src/react/stores/desk-actions.ts`
- `desktop/src/react/stores/workspace-ui-state-actions.ts`
- `desktop/src/react/services/resource-access.ts`

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
5. 本 ticket 新增 UI 同时交付 zh-CN、zh-TW、en、ja、ko、键盘、ARIA、focus、亮暗主题和窄布局。

## 自动化证据

**Primary ownership：** 无直接用户故事；按上列规则域交付

**必须创建或更新：**

- `desktop/src/react/__tests__/services/knowledge-workspace-client.test.ts`

**Playwright 用户流程：** 不适用；本 ticket 使用上述 Vitest 单元、组件、契约或集成测试，不运行 Playwright；下游或发布级用户流程可继续覆盖相关行为

## 验收标准

- [x] Renderer 不使用 Node API；Knowledge 启动不恢复 Desk tabs、树状态或挂载。
- [x] `Primary ownership` 明确为无直接用户故事；本 ticket 不新增未分配的产品行为，也不替其他 ticket 兜底。
- [x] 本 ticket 拥有的每个 `KW-RULE-*` 都满足对应契约文档，并有正常、取消/冲突、权限/不可用和故障注入覆盖。
- [x] 相关既有回归、`npm run typecheck` 和 `npm run lint:boundary` 通过；涉及 composition、Renderer、preload/main 时运行相应 build。
- [x] ticket 交付记录只填写实际执行命令、平台和结果；普通执行结果不写入 `LOG.md`。
- [x] 交付物没有未决的“可能”“按需”“A 或 B”、未选框架、未选 schema 或未定义恢复语义。

## 交付记录

- **实现提交：** `1783fbeb`
- 建立唯一生产级 `knowledgeWorkspaceClient`，Renderer 只通过共享 `KnowledgeResourceAddress`、Knowledge/ResourceIO HTTP 与资源事件协议访问来源，不读取 Node 文件系统、provider identity 或本机路径。
- 建立独立、仅会话态的 Knowledge workspace slice；每次启动从空白来源、展开项、打开项与活动项开始，旧 Desk 的 tabs、树状态、挂载与持久化逻辑保持不变。
- 资源事件由唯一客户端串行执行 catch-up/live、严格 DTO 校验、gap/epoch 恢复、成功后 cursor 提交和权威重查；取消、版本冲突、权限/不可用、畸形事件、symlink/分隔符越界与 mount 换根均 fail-closed。
- `npm exec -- vitest run` 定向 11 files、193/193；干净全仓 `npm test -- --run --exclude 'temp/**' --exclude 'teach/**'` 为 1009 files passed、1 skipped，10130 tests passed、6 skipped。
- `npm run typecheck`、`npm run lint:boundary`、目标 ESLint、`npm run build:renderer`、`npm run build:packages`、`npm run build:server` 与 `git diff --check` 均通过。
- 规范轴与标准轴复审均为 0 个阻塞项；Ticket 16 在接入资源树前须补充显式的 source-root listing 接缝，不能用空 `relativePath` 绕过冻结地址契约。
