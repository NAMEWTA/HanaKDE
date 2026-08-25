---
schema_version: 3
artifact: ticket
change: 2026-08-13-personal-quant-finance-workbench
id: T-04
title: 交付 A/HK 行情、K 线与交易时段 live refresh
status: ready
planning_depth: deep
planning_depth_reason: 涉及实时性、交易日历、单位、陈旧数据和 provider 失败降级，错误可直接误导持仓和监控。
ready: true
risk: critical
blocked_by: [T-03]
contract_ids: [AC-007, AC-008, AC-035]
owner: root
expected_changes: ["<Path>plugins/finance-workbench/src/quotes/**</Path>", "<Path>plugins/finance-workbench/src/market-calendar/**</Path>", "<Path>plugins/finance-workbench/routes/quotes.*</Path>", "<Path>plugins/finance-workbench/tests/quotes.integration.test.ts</Path>", "<Path>plugins/finance-workbench/tests/quotes.e2e.spec.ts</Path>"]
writable_paths: ["<Path>plugins/finance-workbench/src/quotes/**</Path>", "<Path>plugins/finance-workbench/src/market-calendar/**</Path>", "<Path>plugins/finance-workbench/routes/quotes.*</Path>", "<Path>plugins/finance-workbench/tests/quotes.integration.test.ts</Path>", "<Path>plugins/finance-workbench/tests/quotes.e2e.spec.ts</Path>"]
read_only_paths: ["<Path>plugins/finance-workbench/src/domain/**</Path>", "<Path>plugins/finance-workbench/src/data/**</Path>", "<Path>plugins/finance-workbench/src/assets/**</Path>", "<Path>temp/finance-references/tickflow-stock-panel/**</Path>", "<Path>temp/finance-references/a-stock-data/**</Path>"]
shared_paths: []
shared_path_owners: []
---

# Ticket T-04: 交付 A/HK 行情、K 线与交易时段 live refresh

- **Ticket 文件：** `<Path>{roots.state}/specdev/changes/{change}/ticket/04-deliver-quotes-kline-and-live-refresh.md</Path>`
- **总体 Map：** `<Path>{roots.state}/specdev/changes/{change}/tickets-map.md</Path>`
- **上游 Spec：** `<Path>{roots.state}/specdev/changes/{change}/spec.md</Path>`
- **完成 Evidence：** `<Path>{roots.state}/specdev/changes/{change}/evidence/T-04.md</Path>`

## 1. 战略与来源

- **目标：** 在 confirmed AssetRef 上提供 A/HK 报价、日/分钟 K 线和交易时段 live refresh。
- **可观察产出：** 页面显示现价、观测时间、成交量/额单位、复权、交易状态、刷新频率和 staleAt；网络/限流时保留最后可信快照。
- **来源：** `US-003`、`US-019`、`AC-007`、`AC-008`、`AC-035`、`DEC-007`、`DEC-011`、`INV-01`、`INV-02`、`INV-03`。
- **当前事实：** TickFlow 提供 session/price-limit/T+1 思路；Vibe Research 使用交易时段刷新并暂停隐藏标签页；a-stock-data 证明连接成功不足以证明 K 线有效。
- **Planning Depth 原因：** 实时和市场规则是高事故半径，需深度失败注入、恢复和可观察性。

## 2. 决策状态

### 已锁定决策

- 刷新仅发生在市场日历允许的时段；频率可配置，隐藏标签页/睡眠后暂停或恢复行为显式显示。
- 不承诺 tick 级 SLA、后台永久运行或券商级送达；每个值都有 `observedAt`、`staleAt`、provider 和 quality gate。
- 成交量与成交额单位不能互换；复权和分钟粒度由 DataRequest 明确，错误 category/字段必须拒绝。
- 行情页显示 SourceDecision；`auto` 仅允许语义等价实时源切换并记录原因，`pinned` 失败只显示 stale/blocked，不换源。`hithink-rest` 不承担分钟 K。

### 已采用的低影响假设

- 初始默认刷新沿用 provider capability 的安全下限，用户可降低频率；不在未探测容量时强制 3 秒。

### 未决问题

无。

## 3. 范围边界

| IN（本 Ticket 构建） | REUSE（复用且不改变契约） | OUT（明确不做） |
|---|---|---|
| quote/K-line route、market calendar、live polling、stale/fallback UI | T-02 DataSnapshot/provider、T-03 AssetRef、TickFlow/Vibe 行为证据 | 交易执行、tick feed、监控告警动作、券商连接 |

## 4. 要构建什么

用户从资产或自选进入行情页，选择日线/分钟线、复权方式和 `auto | pinned` 来源后看到可解释的快照与 SourceDecision。交易时段内页面按配置刷新；非交易时段显示 closed。请求失败时最后可信值保留并标 stale/partial/blocked，重试不会把空响应替换成零值；`hithink-rest` 的空顶层时间不能证明新鲜度，也不承接分钟 K。A/HK 日历、时区、午间休市和币种在快照中可见。

## 5. 实现契约

- **入口或接缝：** quote/K-line routes、polling controller、market calendar、chart/table page。
- **输入与输出：** 输入 confirmed AssetRef、dataset、interval、adjustment、refresh config；输出 quote/K-line DataSnapshot 或 `stale_data`/`partial_data`/`calendar_unknown`/`unit_mismatch`。
- **公共接口变化：** 仅插件内 routes/tools/page；不新增宿主实时服务。
- **不变量：** 观测时间单调校验；旧快照不被失败覆盖；成交量/成交额、币种和复权字段显式；非交易时段不伪造 live。
- **状态或数据流：** calendar probe -> closed/open -> poll -> validate -> render; hidden/sleep -> paused -> resume -> re-probe。
- **错误与失败行为：** provider 错误、限流、空 200、时间倒退、单位不符都可诊断，重试有上限。
- **兼容要求：** 现有 snapshot schema 不破坏；下游读取 stale/quality，不直接读取 chart raw rows。
- **安全与隐私要求：** 只读公开数据和 confirmed AssetRef，无用户文件写入或交易副作用。

## 6. 执行路线

1. 先写 A/HK timezone/session/holiday、空 200、限流、stale 和隐藏页 fixture。
2. 实现日历与刷新控制器，将 T-02 snapshot 适配为 quote/K-line view model。
3. 接通 route 和 page，显示单位、复权、时间、状态、刷新设置和最后可信值。
4. 注入 sleep、非交易时段、观测倒退和 provider 切换故障，验证恢复和语义不变。
5. 运行 UI/数据回归并生成 Evidence。

## 7. 路径访问契约

- **预计修改点：** `<Path>plugins/finance-workbench/src/quotes/**</Path>`、`<Path>plugins/finance-workbench/src/market-calendar/**</Path>`、`<Path>plugins/finance-workbench/routes/quotes.*</Path>`、`<Path>plugins/finance-workbench/tests/quotes.integration.test.ts</Path>`、`<Path>plugins/finance-workbench/tests/quotes.e2e.spec.ts</Path>`。
- **可写范围：** 上述插件子路径。
- **只读上下文：** `<Path>plugins/finance-workbench/src/domain/**</Path>`、`<Path>plugins/finance-workbench/src/data/**</Path>`、`<Path>plugins/finance-workbench/src/assets/**</Path>`、`<Path>temp/finance-references/tickflow-stock-panel/**</Path>`、`<Path>temp/finance-references/a-stock-data/**</Path>`。
- **共享路径：** 无。
- **保留或不动：** T-02 adapter、T-03 identity 和宿主 scheduler。

## 8. 验证矩阵

| 行为或风险 | 验证接缝 | 命令或步骤 | 预期结果 | Evidence |
|---|---|---|---|---|
| 正常路径 | quote/K-line integration + UI | 用 fixture 打开 A/HK 日/分钟线并刷新 | 单位、复权、时间和状态正确 | `<Path>{roots.state}/specdev/changes/{change}/evidence/T-04.md</Path>` |
| 失败路径 | clock/network/source fault injection | 注入闭市、隐藏标签页、sleep、空 200/空观测时间、限流、时间倒退、非等价 auto 候选和 pinned 失败 | 暂停/陈旧/部分/阻断状态可见，最后可信快照不丢，无 silent fallback | `<Path>{roots.state}/specdev/changes/{change}/evidence/T-04.md</Path>` |
| 回归 | T-02/T-03 integration | 运行 provider 和 identity 测试 | 只接受 confirmed AssetRef，snapshot 语义无回归 | `<Path>{roots.state}/specdev/changes/{change}/evidence/T-04.md</Path>` |
| UI E2E（owner：Lead） | quote page | 桌面/窄屏读取表格和图表状态 | 文本、图表、按钮不重叠且可恢复 | `<Path>{roots.state}/specdev/changes/{change}/evidence/T-04.md</Path>` |

- **Workspace checks（current-workspace）：** implementation owner 在 current workspace 运行 quote/K-line、市场时钟、刷新调度、stale/fallback fault fixture、类型检查和插件构建，不创建 source worktree。
- **E2E disposition：** required：行情 route、页面计时器、tab visibility、市场日历和图表渲染跨越网络、时钟与浏览器边界，错误会把陈旧或错单位数据显示为实时事实。
- **E2E owner/environment：** Lead / current-workspace；在 direct-parent 状态用可控时钟和 provider fixture 于桌面/窄屏验证开闭市、隐藏/恢复、空 200、限流及日/分钟线，预期时间、单位、复权和 stale 状态准确且最后可信快照保留。
- **Integration evidence（direct-parent）：** 记录 implementation commit、parent before SHA、可控时钟/浏览器场景及退出状态、E2E 结果、父分支 result SHA 及包含关系。

## 9. 发布、迁移与恢复

- **迁移顺序：** 先日历/刷新状态，再 route/view；旧缓存只有在 key、单位、复权和时间语义一致时复用。
- **兼容窗口：** live config 新字段有默认值；未知 interval/adjustment 不执行。
- **监控信号：** stale duration、poll error、rate limit、calendar mismatch、clock skew、provider switch 和 UI pause/resume。
- **回滚或前向恢复：** provider 失效返回最后可信快照；刷新控制器异常可关闭 live 而保留手动查询。
- **不可逆操作与批准点：** 无。
- **收缩条件：** 所有行情消费者以 DataSnapshot/view model 为入口，禁止直接读 provider raw rows。

## 10. 验收标准

- [ ] `AC-007`、`AC-008`、`AC-035`：A/HK 行情、K 线、live/stale、SourceDecision、auto/pinned fallback 语义和 UI 成立。
- [ ] 验证矩阵记录到 `<Path>{roots.state}/specdev/changes/{change}/evidence/T-04.md</Path>`。
- [ ] 修改严格位于授权插件路径。
