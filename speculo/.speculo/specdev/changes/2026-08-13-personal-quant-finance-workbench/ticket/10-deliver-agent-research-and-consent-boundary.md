---
schema_version: 3
artifact: ticket
change: 2026-08-13-personal-quant-finance-workbench
id: T-10
title: 交付证据约束 Agent 研究与分层授权
status: ready
planning_depth: deep
planning_depth_reason: 涉及模型外发、私有金融资料、长期任务、通知、用户文件写入和永久交易禁令，是本 change 的最高隐私与副作用风险。
ready: true
risk: critical
blocked_by: [T-09, T-06]
contract_ids: [AC-025, AC-026, AC-027, AC-028, AC-029]
owner: root
expected_changes: ["<Path>plugins/finance-workbench/src/agent/**</Path>", "<Path>plugins/finance-workbench/routes/agent.*</Path>", "<Path>plugins/finance-workbench/tools/**</Path>", "<Path>plugins/finance-workbench/tests/agent-security.integration.test.ts</Path>", "<Path>plugins/finance-workbench/tests/agent.e2e.spec.ts</Path>"]
writable_paths: ["<Path>plugins/finance-workbench/src/agent/**</Path>", "<Path>plugins/finance-workbench/routes/agent.*</Path>", "<Path>plugins/finance-workbench/tools/**</Path>", "<Path>plugins/finance-workbench/tests/agent-security.integration.test.ts</Path>", "<Path>plugins/finance-workbench/tests/agent.e2e.spec.ts</Path>"]
read_only_paths: ["<Path>plugins/finance-workbench/manifest.json</Path>", "<Path>plugins/finance-workbench/src/domain/**</Path>", "<Path>plugins/finance-workbench/src/data/**</Path>", "<Path>plugins/finance-workbench/src/research-data/**</Path>", "<Path>plugins/finance-workbench/src/portfolio/**</Path>", "<Path>plugins/finance-workbench/src/automation/**</Path>", "<Path>temp/finance-references/Vibe-Research/**</Path>", "<Path>temp/finance-references/TradingAgents-astock/**</Path>"]
shared_paths: []
shared_path_owners: []
---

# Ticket T-10: 交付证据约束 Agent 研究与分层授权

- **Ticket 文件：** `<Path>{roots.state}/specdev/changes/{change}/ticket/10-deliver-agent-research-and-consent-boundary.md</Path>`
- **总体 Map：** `<Path>{roots.state}/specdev/changes/{change}/tickets-map.md</Path>`
- **上游 Spec：** `<Path>{roots.state}/specdev/changes/{change}/spec.md</Path>`
- **完成 Evidence：** `<Path>{roots.state}/specdev/changes/{change}/evidence/T-10.md</Path>`

## 1. 战略与来源

- **目标：** 提供默认关闭、证据绑定、预算受控、非交易的 Agent 研究入口，并把公开/私有/外发/长期副作用分层授权。
- **可观察产出：** 用户可以运行公开证据一次性分析；访问持仓、成本、笔记、私有研报、外部模型、通知、长期任务或用户文件写入前看到字段预览和确认；拒绝后无副作用。
- **来源：** `US-015`～`US-017`、`AC-025`～`AC-029`、`ADR-002`、`INV-04`、`INV-06`。
- **当前事实：** TradingAgents 有有限研究阶段和结构化输出经验，但取消/副作用语义弱；Hana 提供 `sampleText`、Session/Agent、sessionPermission 和 ResourceIO。
- **Planning Depth 原因：** Agent 可造成隐私外发和长期副作用，必须有 allowlist、审计、撤销、预算和安全回滚。

## 2. 决策状态

### 已锁定决策

- AI 默认关闭；确定性数据/筛选/账本/回测不依赖 AI。
- 公开数据只读一次性分析在 allowlist/预算内自动运行；私有字段、模型外发、长期任务、通知和文件写入逐次 `ConsentRecord` 确认。
- Agent 工具永远不包含交易、仓位、券商、资金、订单或撤单；模型不能改变 QualityGate、StrategyDefinition 或 P&L。

### 已采用的低影响假设

- Agent 首版优先使用 `sampleText()` 或插件私有 session，不自动切换主聊天焦点；每条事实必须绑定 EvidenceRef。

### 未决问题

无。

## 3. 范围边界

| IN（本 Ticket 构建） | REUSE（复用且不改变契约） | OUT（明确不做） |
|---|---|---|
| agent routes/tools、allowlist、ConsentRecord、field preview、budget/evidence、拒绝/审计 UI | T-05 EvidenceRef、T-06 private refs、T-09 task states、Hana Agent/session/model helpers | 交易工具、永久全局授权、自动投资建议、broker/funds |

## 4. 要构建什么

用户点击 Agent 研究并选择公开数据或自己的资料范围。公开一次性研究在预算内直接运行并返回有证据的结构化草稿；私有字段或模型外发先显示字段摘要、目标和成本，用户批准后才发送。创建长期任务、通知或写文件再次确认。任何拒绝、预算耗尽或无证据输出都返回可见状态，不产生隐藏写入。

## 5. 实现契约

- **入口或接缝：** Agent route/tool catalog、sessionPermission resolver、consent service、evidence checker、audit store 和 research page。
- **输入与输出：** 输入 run intent、dataset/field scope、model target、budget、consent；输出 ResearchRun、EvidenceRef citations、cost/audit、confirmation_required 或稳定 permission/budget/unsubstantiated 错误。
- **公共接口变化：** 插件内 Agent tools/routes；不改变宿主模型/Session API。
- **不变量：** default off、allowlist、field-level consent、一次性 consent、证据绑定、无交易工具、secret/私有正文不进普通日志。
- **状态或数据流：** draft -> preview -> approved/rejected -> running -> completed/failed/cancelled；public/private/external/write side effect 分类审计。
- **错误与失败行为：** permission_denied、consent_expired、budget_exhausted、model_unavailable、unsubstantiated_output 明确且无外发。
- **兼容要求：** 适配 Hana `sampleText`/session helpers 和 sessionPermission；宿主不提供能力时显示 unavailable。
- **安全与隐私要求：** deny by default，外部模型只收到批准字段和证据摘要；工具静态/运行时拒绝交易意图。

## 6. 执行路线

1. 建立公开/私有/外发/长期/通知/写入和交易意图的安全红灯测试。
2. 实现 allowlist tool schema、sessionPermission invocation resolver、ConsentRecord 和 field preview。
3. 接入 EvidenceRef 校验、budget/cost、sampleText/session private run 和审计。
4. 实现研究页确认/拒绝/过期/预算耗尽和结果证据展示。
5. 运行 privacy/static scan、T-05/T-06/T-09 回归和无交易工具检查。

## 7. 路径访问契约

- **预计修改点：** `<Path>plugins/finance-workbench/src/agent/**</Path>`、`<Path>plugins/finance-workbench/routes/agent.*</Path>`、`<Path>plugins/finance-workbench/tools/**</Path>`、`<Path>plugins/finance-workbench/tests/agent-security.integration.test.ts</Path>`、`<Path>plugins/finance-workbench/tests/agent.e2e.spec.ts</Path>`。
- **可写范围：** 上述插件子路径。
- **只读上下文：** `<Path>plugins/finance-workbench/manifest.json</Path>`、`<Path>plugins/finance-workbench/src/domain/**</Path>`、`<Path>plugins/finance-workbench/src/data/**</Path>`、`<Path>plugins/finance-workbench/src/research-data/**</Path>`、`<Path>plugins/finance-workbench/src/portfolio/**</Path>`、`<Path>plugins/finance-workbench/src/automation/**</Path>`、`<Path>temp/finance-references/Vibe-Research/**</Path>`、`<Path>temp/finance-references/TradingAgents-astock/**</Path>`。
- **共享路径：** 无。
- **保留或不动：** 宿主 Agent/Session 实现和全局 permission policy。

## 8. 验证矩阵

| 行为或风险 | 验证接缝 | 命令或步骤 | 预期结果 | Evidence |
|---|---|---|---|---|
| 正常路径 | Agent tool/session harness | AI 关闭时走确定性路径，开启后运行公开证据一次性研究 | 预算内完成，事实均有 EvidenceRef | `<Path>{roots.state}/specdev/changes/{change}/evidence/T-10.md</Path>` |
| 失败路径 | permission/egress fault injection | 请求私有字段、外发、长期任务、通知、写文件、交易意图并拒绝/超预算 | confirmation_required/permission_denied，无网络/写入/工具副作用 | `<Path>{roots.state}/specdev/changes/{change}/evidence/T-10.md</Path>` |
| 回归 | T-05/T-06/T-09 contract | 运行 evidence/private/task tests | consent 只作用当前 run/字段，任务取消语义不回归 | `<Path>{roots.state}/specdev/changes/{change}/evidence/T-10.md</Path>` |
| UI E2E（owner：Lead） | agent research page | 桌面/窄屏执行预览、批准、拒绝、过期和查看证据 | 字段目标预算清晰、状态不重叠 | `<Path>{roots.state}/specdev/changes/{change}/evidence/T-10.md</Path>` |

- **Workspace checks（current-workspace）：** implementation owner 在 current workspace 运行 Agent tool allowlist、ConsentRecord、预算/过期、egress 拒绝、无交易静态与运行时扫描、类型检查和插件构建，不创建 source worktree。
- **E2E disposition：** required：Agent session、模型外发、私有字段确认、长期任务/通知/文件写入和无交易边界跨越模型、网络、权限与用户副作用，属于安全与隐私关键路径。
- **E2E owner/environment：** Lead / current-workspace；在 direct-parent 状态验证 AI-off 确定性路径、公开研究、逐字段批准/拒绝/过期、超预算及交易意图，预期拒绝时无网络/写入/任务副作用，批准结果逐事实绑定 EvidenceRef。
- **Integration evidence（direct-parent）：** 记录 implementation commit、parent before SHA、脱敏模型/工具 harness、网络与写入负断言、E2E 结果、父分支 result SHA 及包含关系。

## 9. 发布、迁移与恢复

- **迁移顺序：** 先 tool allowlist/consent/evidence gate，再连接模型/session，最后开放 UI actions。
- **兼容窗口：** consent/audit/run schema 版本化；旧授权不迁移为永久授权。
- **监控信号：** model/provider/cost、consent approve/reject/expire、egress fields、budget exhaustion、unsubstantiated outputs、forbidden intent blocks。
- **回滚或前向恢复：** 模型不可用时确定性路径继续；外发失败不重试未批准字段；运行失败保留审计并可取消。
- **不可逆操作与批准点：** 每次私有/外发/长期/通知/文件写入是人工批准点；交易意图永远拒绝。
- **收缩条件：** tool catalog 无交易能力，所有 private/external/write paths 经过 ConsentRecord，静态和运行时扫描均通过。

## 10. 验收标准

- [ ] `AC-025`～`AC-029`：AI 默认、证据、分层授权、无交易工具和 secret 审计成立。
- [ ] 验证矩阵记录到 `<Path>{roots.state}/specdev/changes/{change}/evidence/T-10.md</Path>`。
