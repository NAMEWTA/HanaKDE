---
schema_version: 3
artifact: ticket
change: 2026-07-24-openhanako-knowledge-workspace
id: T-04
title: "建立稳定错误与诊断契约"
status: done
planning_depth: standard
planning_depth_reason: "历史完成 Ticket 的 SpecDev v3 兼容迁移；保留既有实现、验证与验收记录。"
ready: false
risk: medium
blocked_by: ["T-01","T-03"]
contract_ids: ["KW-US-170","KW-RULE-OBS"]
owner: historical-implementer
expected_changes: ["<Path>{roots.state}/specdev/changes/2026-07-24-openhanako-knowledge-workspace/ticket/04-define-errors-and-diagnostics.md</Path>"]
writable_paths: []
read_only_paths: []
shared_paths: []
shared_path_owners: []
---
# Ticket 04: 建立稳定错误与诊断契约

- **被阻塞于：** [`01-freeze-real-repository-baseline.md`](./01-freeze-real-repository-baseline.md)、[`03-freeze-open-knowledge-contract.md`](./03-freeze-open-knowledge-contract.md)
- **状态：** 已完成

## 战略与背景

- **战略：** 定义错误码、operationId、脱敏资源地址、watch sequence、rebuild reason 和可导出诊断摘要。
- **需求追踪：** KW-US-170, KW-RULE-OBS
- **当前现状：** 当前实现接缝位于 `lib/resource-io/errors.ts`、`lib/resource-io/types.ts`、`server/resource-events-ws.ts`；本 ticket 只扩展这些公开边界。
- **用户可验证结果：** 完成本 ticket 后，验收者能够通过公开 API、真实临时 workspace 或可交互 UI 验证本标题声明的单一能力。

## 范围边界

| IN | REUSE | OUT |
|---|---|---|
| 定义错误码、operationId、脱敏资源地址、watch sequence、rebuild reason 和可导出诊断摘要。 | `lib/resource-io/errors.ts`<br>`lib/resource-io/types.ts`<br>`server/resource-events-ws.ts` | 未列入本 ticket 的后续功能；修改生成 bundle；创建平行文件系统、编辑器内核或私有 route 捷径 |

## 交付物

> 以下仅列主要交付物，不构成文件白名单或完整清单；为满足本 ticket 验收而新增/修改的同范围实现、类型、schema、fixture、测试、i18n 与文档同属交付物。

- `shared/knowledge-workspace-errors.ts`
- `shared/knowledge-diagnostics.ts`
- `tests/knowledge-diagnostics.test.ts`

## 实施时需阅读的文件

> 以下列出本 ticket 的具体代码接缝；实施前还必须按 [`README.md`](../README.md) 的文档权威关系读取 accepted [`LOG.md`](../LOG.md)、[`ADR.md`](../ADR.md)、[`CONTEXT.md`](../CONTEXT.md)、[`spec.md`](../spec.md) 及本 ticket 的固定实施契约，不能因本节或交付物未逐项复写而遗漏已确认结论。

- `lib/resource-io/errors.ts`
- `lib/resource-io/types.ts`
- `server/resource-events-ws.ts`

## 固定实施契约

- [`implementation-contracts.md`](../implementation-contracts.md)
- [`threat-model.md`](../threat-model.md)

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
5. 新 Knowledge 错误码统一 lowercase snake_case，并由共享表固定 HTTP status 与 retryable；message 不参与客户端控制流。

## 自动化证据

**Primary ownership：** KW-US-170

**必须创建或更新：**

- `tests/knowledge-diagnostics.test.ts`

**Playwright 用户流程：** 不适用；本 ticket 使用上述 Vitest 单元、组件、契约或集成测试，不运行 Playwright；下游或发布级用户流程可继续覆盖相关行为

## 验收标准

- [x] 日志不记录正文、凭证或绝对路径；相同失败跨 Desktop/Server 返回同一稳定错误码。
- [x] 本 ticket 拥有的每个 `KW-US-*` 都由上列精确测试直接证明；不存在范围兜底或 Ticket 57 代实现。
- [x] 本 ticket 拥有的每个 `KW-RULE-*` 都满足对应契约文档，并有正常、取消/冲突、权限/不可用和故障注入覆盖。
- [x] 相关既有回归、`npm run typecheck` 和 `npm run lint:boundary` 通过；涉及 composition、Renderer、preload/main 时运行相应 build。
- [x] ticket 交付记录只填写实际执行命令、平台和结果；普通执行结果不写入 `LOG.md`。
- [x] 交付物没有未决的“可能”“按需”“A 或 B”、未选框架、未选 schema 或未定义恢复语义。

## 实现交接摘要

- **主线实现提交：** `71c900d6`（隔离 worktree 原始提交 `64563da8`）。
- **平台：** macOS 26.5（Darwin 25.5.0，arm64）、Node `v24.16.0`、npm `11.13.0`。
- **实现范围：** 冻结 18 个知识错误码的 HTTP status/retryable 表与 legacy 映射；建立只导出安全标量的诊断摘要；ResourceIO 事件贯通 operation correlation；远程 WebSocket 只投影无路径 `resource.resync_required`，Renderer 推进 cursor 并失效根与全部展开树节点、刷新全部打开预览。
- **安全回归：** unknown code/status、非法 details、accessor/Proxy/symbol、原型链键、绝对路径和正文均 fail-closed；plain `Error` legacy catch-up 映射为稳定 `knowledge_resource_unavailable`；真实 ResourceIO → bus → WS → Renderer 恢复链有契约/组件回归。
- **自动化：** 22 files、249/249 相关 Vitest 通过；target ESLint 0 error（21 条既存 warning）；`volta run npm run typecheck`、`volta run npm run lint:boundary`、`git diff --check` 通过。
- **构建：** `volta run npm run build:renderer` 通过。首次 `build:server:open` 因网络无法下载 Node v24.15.0 失败；复用主工作树同版本只读缓存后 Vite/CLI bundle 成功。隔离产物依赖安装因网络长期无响应被中止；复用主工作树相同 `package.json` 的已缓存依赖后，`smoke:server:open` 正向 200 与缺失必需资源的负向失败均通过；脚本打印全部通过后存在既有悬挂句柄，Lead 手动结束进程。
- **质量与规格检查：** 两轴均无未决问题。先前攻击式检查发现的任意 status/code、unknown 降级、plain Error、Proxy/getter、原型污染、unsafe details 二次抛出、嵌套树漏刷和 cursor 不推进均已修复并补回归。
- **Playwright：** 本票明确不适用；未把 Vitest 证据登记为发布级 E2E。
- **交接：** `speculo/.speculo/commands/handoff/2026-07-26-openhanako-knowledge-workspace-implementation-02.md`。
