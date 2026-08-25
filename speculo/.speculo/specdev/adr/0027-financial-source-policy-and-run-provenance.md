# ADR-0027: 金融数据源策略与研究运行来源必须可冻结和追溯

- Status: Accepted
- Date: 2026-08-26
- Source: `<Path>{roots.state}/specdev/archive/2026-08/2026-08-13-personal-quant-finance-workbench/ADR.md</Path>` (`ADR-005`)

## 决策上下文

金融工作流会同时面对数据源缺失、字段不完整、交易日覆盖不足和供应商语义差异。只记录最终数据，或把任意 HTTP 200 当作可用，会使研究与回测无法解释、复现和审计。

## 决策

每个市场、数据集与工作流组合都必须使用显式 `auto` 或 `pinned` 来源策略。数据源只有通过该数据集的完整能力探测，包括必需字段、交易日窗口、排序和质量约束，才可声明支持；不完整的成功响应仍是 partial，不得升级为 supported。

交互查询的 `auto` 策略只可在语义等价的数据源间回退，并记录每次候选、拒绝原因与最终选择。研究、回测和定时任务在启动时冻结 `RunSourceManifest`，至少包含 provider、source kind、adapter/schema/lineage/policy version、时间窗口与质量摘要。恢复或重试发现 lineage 不一致时必须停止当前运行，并要求创建新运行，不得静默换源继续。

## 后果

数据源适配器需要提供结构化能力探测和决策记录；运行结果会携带更多来源元数据。换源成本更显式，但研究结果可以复现、比较和审计，供应商语义漂移不会被隐藏。
