# Finance Workbench 规范术语

本文件只保存跨 change 仍有效的金融领域契约；供应商调查、UI 方案和逐 ticket 实现事实保留在归档 change 中。

- Promoted: 2026-08-26
- Source: `<Path>{roots.state}/specdev/archive/2026-08/2026-08-13-personal-quant-finance-workbench/CONTEXT.md</Path>`

**ProviderCapability**：数据源针对特定市场、数据集和工作流，经必需字段、交易日窗口、排序及质量约束探测后得到的 `supported`、`partial` 或 `unsupported` 结构化结论。
_Avoid_: 把 HTTP 200、非空数组或供应商级总开关当作支持证明

**SourcePolicy**：市场、数据集与工作流组合上的来源选择规则，模式只能是允许语义等价回退的 `auto`，或只使用指定来源的 `pinned`。
_Avoid_: 未记录的隐式优先级、跨语义数据集回退

**SourceDecision**：一次交互查询对候选来源、能力结论、拒绝原因和最终选择的可审计记录。
_Avoid_: 只记录最终 provider、吞掉 partial 或 fallback 原因

**RunSourceManifest**：研究、回测或定时任务启动时冻结的来源事实，包含 provider、source kind、adapter/schema/lineage/policy version、时间窗口和质量摘要。
_Avoid_: 恢复运行时重新执行 auto 选择、lineage 变化后原地续跑

**EvidenceRef**：把结论或产物指向可重现数据快照、来源决定、时间范围与运行身份的结构化引用。
_Avoid_: 无来源的文本结论、把易变 URL 当作完整证据

**ConsentRecord**：对一次运行中的特定敏感能力、字段和目标授予的显式授权事实。
_Avoid_: 全局同意、跨运行复用、用模糊的“继续”授权所有私有数据

**Research-only finance boundary**：Finance Workbench 只读取、分析和导出研究信息，不连接交易执行链，也不变更订单、资金或券商持仓。
_Avoid_: 下单 tool、资金划转、把策略信号自动转成交易
