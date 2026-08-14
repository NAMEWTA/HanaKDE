# 当前 Change 架构决策

## ADR-001: 全模块首版与能力状态分离

**Status:** accepted
**Source:** LOG-011 / user decision 2026-08-13
**Supersedes:** none

### Context

四个参考项目分别覆盖数据获取、研究底稿、量化回测、监控和 Agent 编排；先前 INV-07 建议把模块按 V0-V5 延后。用户明确要求第一个版本全部上线，并要求 A 股与港股、个人持仓、实时性和自动化同时成为首版产品能力。

### Decision

首版必须包含所有规划模块及其用户可操作入口：A/HK 行情/K 线、资产/自选、财务/公告/研报/新闻、筛选/因子、回测、监控/告警、组合/持仓、Agent 研究、导入导出。每个模块和每个 market x dataset x workflow 必须独立报告 `supported/partial/experimental/unavailable/blocked`；状态、原因、替代路径和质量证据是模块合同的一部分。

### Trade-off

相较于只交付证据级切片，首版范围更大、provider/任务/UI/隐私集成成本更高；换取用户可以直接使用完整工作台，且通过能力状态分离“模块存在”和“数据足够可信”。不采用“所有模块默认 supported”，因为会把许可未知、PIT 缺失、空响应或规则不完整包装成金融事实。

### Consequences

- Spec、UI 和实现计划不能删除首版模块；必须为每个模块设计正常/空/陈旧/部分/不可用/阻断/取消/恢复状态。
- V0-V5 不再是模块发布顺序，而是共享地基、质量门和高级能力的依赖/成熟度顺序。
- 首版工作量和验证面显著增加；需要先验证插件边界，破盒能力另立 system change。
- 金融工作台仍不是交易终端；所有交易、资金和券商能力保持 out of scope。

### Verification / Migration

Spec 阶段建立全模块 capability matrix 和 acceptance matrix；实现阶段以 provider fixtures、金融正确性测试、ResourceIO/egress 审计、TaskRegistry cancel/recovery、UI 状态和无交易副作用测试证明。旧的 INV-07 分阶段建议只作为能力依赖参考，不作为模块范围权威。

## ADR-002: 分层授权与非交易 Agent

**Status:** accepted
**Source:** LOG-010 / user decision 2026-08-13
**Supersedes:** none

### Context

用户希望首版包含 Agent、个人持仓/资料和自动化，但这些能力会触发模型外发、长期任务、用户文件写入和潜在交易误用风险。参考项目包含本地持仓、AI 工具循环、监控和报告写盘，但没有 Hana 的统一 ResourceIO/Task/secret 审计边界。

### Decision

公开数据只读与一次性分析可在预算、数据集和工具 allowlist 内自动运行；创建长期监控/定时任务、读取持仓/成本/笔记/私有研报、模型外发、通知和写入用户文件必须逐次确认。交易、仓位、券商和资金动作永远禁止。

### Trade-off

比统一预授权少一些自动化流畅性，但能把长期副作用和个人资料外发变成用户可见授权，且保留日常公开数据研究效率。授权按 run/字段/目标生效，不提供永久全局豁免。

### Consequences

Agent 工具 schema 必须表达 `requiresConfirmation`、数据范围、外发目的、预算和副作用；UI 必须有确认预览和拒绝路径；所有结论仍需 EvidenceRef，模型不能改变 QualityGate 或金融规则。

### Verification / Migration

测试公开数据自动运行、私有字段阻断、确认后外发、长期任务确认、用户文件写入确认和交易工具不存在；审计记录保存 runId、字段摘要、provider/model、成本和结果。

## ADR-003: 内置插件实现目录边界

**Status:** accepted
**Source:** user decision 2026-08-13 / S-spec request
**Supersedes:** 本 change 既有 placement decision 中对插件目录的暂定命名

### Context

用户明确要求金融工作台作为 HanaKDE 的内置插件实现，并将本次插件实现收敛到名为 `finance-workbench` 的内置插件目录。此前探索阶段的 `quant-finance-workbench` 只是能力放置建议，不是当前实现路径的最终命名。

### Decision

本 change 的生产实现只允许位于 `<Path>plugins/finance-workbench/</Path>`，包括 manifest、页面、组件、路由、工具、任务、数据适配器、私有存储、测试 fixture 和插件资源。不得在 `core/`、`server/`、`shared/`、宿主数据库迁移、全局插件注册表或其他插件目录新增金融工作台实现。若实现所需能力不属于现有插件 SDK，必须另开 system change 先扩展宿主，再回到本插件实现。

### Trade-off

插件边界清晰、可卸载且不把金融语义焊入宿主；代价是插件必须严格服从现有 SDK、ResourceIO、TaskRegistry、Capability 与 Agent 授权契约，不能通过修改宿主绕过限制。

### Consequences

- Spec 和 tickets 的实现路径统一使用 `plugins/finance-workbench/`，旧目录名不得继续出现在新实现任务中。
- 插件 manifest 申请最小必要 capability；全 access 只表示插件形态，不表示绕过隐私、数据质量或交易禁令。
- 删除或停用该目录时 HanaKDE 核心仍应能启动；任何宿主缺口必须显式记录为外部依赖。

### Verification / Migration

静态扫描、插件发现/卸载测试、manifest capability 校验和无金融插件宿主启动测试必须证明实现没有越界。无需从旧 `quant-finance-workbench` 目录迁移生产代码；该名称只保留在历史研究和决策记录中。
