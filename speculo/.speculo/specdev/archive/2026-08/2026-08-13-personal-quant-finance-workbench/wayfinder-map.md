---
artifact: wayfinder-map
change: 2026-08-13-personal-quant-finance-workbench
status: active
---

# Wayfinder Map: 个人量化金融插件工作台寻路图

## 目的地

形成一条可移交给 Spec 的决策完备路线：明确 HanaKDE 内置个人量化金融插件工作台的目标用户与核心闭环、可验证的能力范围、数据与金融正确性契约、AI/Agent 研究范式、信息架构、插件/系统边界、分阶段交付顺序和验收证据，使实现者不再需要重新决定产品或架构问题。

## 说明

- 领域定位是“个人研究、量化实验与决策审计工作台”，首版纳入所有规划模块，但不是券商交易终端；“全能”表示完整工作流入口与透明能力状态，不表示所有 provider 或市场数据同质可用。
- 全程使用 `<Path>skills2set/hana-plugin-creator/SKILL.md</Path>`、`<Path>{roots.workflows}/specdev/common/skills/research/SKILL.md</Path>` 和 `<Path>.agents/skills/feature-placement/SKILL.md</Path>`；涉及插件契约时查阅 `<Path>PLUGIN_SDK.md</Path>`、`<Path>PLUGINS.md</Path>`、`<Path>packages/plugin-sdk/README.md</Path>` 与 `<Path>packages/plugin-components/README.md</Path>`。
- 四个参考仓库已获用户授权浅克隆到被 Git 忽略的研究现场，调查必须固定在以下 commit，不以 README 宣称替代代码事实：
  - tickflow-stock-panel：`ecfddb451e97f6fc9a7e43ac33e4ef0e69933b33`，`<Path>temp/finance-references/tickflow-stock-panel/</Path>`，<Url>https://github.com/shy3130/tickflow-stock-panel</Url>。
  - Vibe-Research：`d8c80d4ac60e43c1f096c0c486355b19800f16d7`，`<Path>temp/finance-references/Vibe-Research/</Path>`，<Url>https://github.com/simonlin1212/Vibe-Research</Url>。
  - a-stock-data：`3a3149dedbe30cda58b5c94387039d7e707cedcd`，`<Path>temp/finance-references/a-stock-data/</Path>`，<Url>https://github.com/simonlin1212/a-stock-data</Url>。
  - TradingAgents-astock：`0badc3340c70fa0eb16e8cb527c5c32efacc7966`，`<Path>temp/finance-references/TradingAgents-astock/</Path>`，<Url>https://github.com/simonlin1212/TradingAgents-astock</Url>。
- `<Path>{roots.state}/specdev/changes/2026-08-13-personal-quant-finance-workbench/placement-decision.md</Path>` 将当前落点裁定为 `<Path>plugins/quant-finance-workbench/</Path>` 内置 full-access 插件。后续若命中通用量化运行时、特权进程、共享 Registry 或系统迁移硬门，必须产出独立系统前置 change，不得静默扩张插件权限。
- 每个会话只领取并关闭一个 Investigation Ticket；本 change 的 Wayfinder 不实现目的地代码。Prototype Ticket 只回答界面问题，原型不得演变成生产插件。
- 研究结论必须区分上游事实、Hana 代码事实、推断和建议；关键结论使用一手源码/官方资料并记录版本、许可证、限制和未知项。

## 已做出的决策

<!-- 绘图会话不关闭 Ticket；后续每个答案在这里追加名称链接和一句概括。 -->

- **TickFlow 量化面板能力与工程边界：** `<Path>{roots.state}/specdev/changes/2026-08-13-personal-quant-finance-workbench/investigation/comments/INV-01/01-solution.md</Path>` —— 采用“能力探测与标准化数据 -> 策略/回测/监控 -> 可追溯复盘”的闭环和金融正确性纪律；动态 Python、独立全栈/AI/数据湖、隐式降级与抓站数据源不直接移植，按 Hana 宿主契约重构。
- **Vibe Research 个人投研闭环与知识沉淀：** `<Path>{roots.state}/specdev/changes/2026-08-13-personal-quant-finance-workbench/investigation/comments/INV-02/01-solution.md</Path>` —— 采用“发现 -> 同源事实底稿 -> 独立正反检验 -> 验证清单 -> 可追溯沉淀”的研究认知环，与 TickFlow 共享对象、快照、任务和知识库；本地数据外发、市场能力差异、证据血缘和失败状态必须显式，平行 AI/CLI/MCP/FastAPI 不移植。
- **A 股数据能力层与降级治理：** `<Path>{roots.state}/specdev/changes/2026-08-13-personal-quant-finance-workbench/investigation/comments/INV-03/01-solution.md</Path>` —— 将 a-stock-data 降为数据集库存而非产品合同；首版先做 AssetRef、许可登记、provider 隔离、不可变快照、PIT/单位/复权/日历和显式失败，HTTP 仅接入已验证且获授权的源，mootdx TCP、抓站指标和无语义等价的隐式降级延后。
- **TradingAgents A 股多 Agent 决策与审计边界：** `<Path>{roots.state}/specdev/changes/2026-08-13-personal-quant-finance-workbench/investigation/comments/INV-04/01-solution.md</Path>` —— 采用有限阶段的“底稿 -> 质量门 -> 独立正反视角 -> 中立综合 -> 可选复盘”协议；检查点、进度、结构化输出和 outcome review 改造到 Hana Task/Session/Agent，角色数量、评级到交易动作、独立 Python 图运行时、隐式 fallback 和本地路径写盘不移植。
- **Hana 插件能力契约与破盒边界：** `<Path>{roots.state}/specdev/changes/2026-08-13-personal-quant-finance-workbench/investigation/comments/INV-05/01-solution.md</Path>` —— 页面、路由、工具、配置/秘密、ResourceIO、插件私有存储、Session/Agent、模型采样、TaskRegistry、进度/取消与 dev loop 均可落在内置 full-access 插件；Python/Polars/DuckDB、mootdx TCP、任意本地进程和通用量化 sidecar 不属于当前通用插件合同，必须降级或另立系统 change。
- **金融正确性数据治理与用户安全契约：** `<Path>{roots.state}/specdev/changes/2026-08-13-personal-quant-finance-workbench/investigation/comments/INV-06/01-solution.md</Path>` —— 以显式 `AssetRef`/`DataRequest`/PIT/日历/复权/单位/成本和不可变 `DataSnapshot` 为金融语义底座；质量、血缘、许可、隐私、AI 证据与预算取消均 fail-closed，缺失/陈旧/冲突/未知不再静默成功；规则 Registry、高频/sidecar/通用回测和交易执行命中系统前置硬门。
- **跨项目能力模型与价值分层：** `<Path>{roots.state}/specdev/changes/2026-08-13-personal-quant-finance-workbench/investigation/comments/INV-07/01-solution.md</Path>` —— 将能力归并为 `AssetRef -> DataRequest -> DataSnapshot -> QualityGate -> EvidenceRef -> Run` 共同地基及研究/量化/Agent 消费层；原 V0-V5 现保留为能力依赖和质量成熟顺序，不再作为首版模块延后依据。
- **个人金融工作台产品边界共识：** `<Path>{roots.state}/specdev/changes/2026-08-13-personal-quant-finance-workbench/investigation/comments/INV-08/01-solution.md</Path>` —— 用户确认 A 股 + 港股、全规划模块首版上线、内置多源分级 provider、本地持仓/资料、交易时段 live refresh、可恢复自动化和 Agent 分层授权；交易/券商/资金永远排除，模块必须如实显示 supported/partial/experimental/unavailable/blocked。

## 尚未明确

- 在 UI 原型与运行时边界验证前，仍需确认完整首版模块如何在高密度桌面布局中组织，以及哪些交互应以页面、报告或 Agent 工具呈现；模块范围本身已由用户锁定。

## 超出范围

- 本 Wayfinder 会话及其 Investigation Ticket 不编写生产插件、不发布、不安装、不推送远程仓库。
- 不包含真实券商账户接入、实盘自动下单、资金托管或无人值守交易执行；若未来需要，必须独立建 change 并重新做安全、合规和 feature placement 裁决。
- 不承诺收益、不输出 AI 荐股或涨停预测，不把回测结果表述为未来表现。
- 不整仓复制四个参考项目；只提炼经过许可证、契约和产品价值审查的能力与设计原则。
