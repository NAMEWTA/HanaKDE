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

## ADR-004: 同花顺官方 REST 作为 BYOK A 股优先 Provider

**Status:** accepted
**Source:** LOG-013 / LOG-015 / user decision 2026-08-23
**Supersedes:** none

### Context

现有多 provider 规格没有指定一个条款和契约相对清晰的 A 股优先来源。Financial-API 由同花顺官方维护并提供结构化 REST，但其能力按账号授权，公开范围不覆盖港股、分钟 K 和新闻/公告/研报原文，公开资料也没有赋予产品共享 Key 或数据再分发权。

### Decision

在 `<Path>plugins/finance-workbench/</Path>` 内置 `hithink-rest` adapter。用户以 BYOK 配置 API Key，逐 market/dataset capability probe 通过后，该 adapter 成为适用 A 股数据集的出厂优先 provider。未配置、未授权或质量门失败时显示 unavailable/partial/blocked，并保留其他 provider 与导入路径。首版不嵌入共享 Key、不建立产品代理，也不把同花顺设为港股或全域唯一来源。

### Trade-off

相较于零配置共享凭据，BYOK 增加一次用户配置；换取账号、配额和授权边界明确，并避免产品方承担未约定的数据代理与再分发责任。相较于普通可选 provider，出厂优先能减少 A 股默认路径的不确定性，但必须维护逐数据集能力矩阵。

### Consequences

- Key 只在插件敏感配置与 Node route 中读取，不进入前端、日志、快照、导出或 fixture。
- `fuyao.aicubes.cn` 通过 manifest network allowlist 和 `ctx.network.fetch()` 访问。
- 港股、分钟 K、PIT 历史、原文内容及其他缺失数据继续使用其他合法 provider 或用户导入。

### Verification / Migration

使用最小授权请求验证实际账号 capability、错误码、限流、schema、时间、单位和空值；未通过项不得标 supported。共享 Key 或代理服务只能由未来获得书面授权的新决定引入。

## ADR-005: 逐数据集 SourcePolicy 与运行来源冻结

**Status:** accepted
**Source:** LOG-014 / user decision 2026-08-23
**Supersedes:** none

### Context

A 股、港股和不同数据集的 provider 覆盖与质量不对称。全局数据源开关无法表达这种差异；研究和回测中途静默换源又会破坏可复现性、PIT、单位和快照 lineage。

### Decision

每个 market x dataset x workflow 使用 `auto | pinned` SourcePolicy。交互式 `auto` 只在身份、字段、单位、复权、日历、PIT 和质量语义等价时执行有记录的 fallback；`pinned` 只使用指定来源。ResearchRun 和 BacktestRun 启动后冻结 provider、adapter version、schema hash、snapshot lineage 和 SourcePolicy version，运行中来源失败时暂停或创建新 run，不静默切换。

### Trade-off

比全局开关和无条件 fallback 增加路由决策、UI 与审计复杂度；换取跨数据集正确表达、用户控制和确定性运行可复现性。

### Consequences

- DataSnapshot 记录 SourceDecision、候选排除原因和切换历史。
- 不同 provider 的行不得在未知 lineage 下合并成同一可信快照。
- 监控可切换等价实时源，但必须保存 source change；研究和回测需新建 run。

### Verification / Migration

fixture 覆盖 auto、pinned、等价/非等价 fallback、运行中失败、重启恢复和 source manifest 重放；旧快照缺来源清单时隔离或降级。

## ADR-006: Market Dumps 本地源须通过跨平台原型门

**Status:** accepted
**Source:** LOG-016 / user decision 2026-08-23
**Supersedes:** none

### Context

全市场、多标的和多年历史研究不适合逐股 REST。官方 Market Dumps 提供全 A 股日 K、增量和复权事件，但 Node DuckDB native dependency、数据体积、同步恢复、卸载和 Python 包许可证冲突尚未在 Hana 插件分发模型中验证。

### Decision

在 SourcePolicy 中定义 `hithink-market-dump` 插件私有本地 source kind，并以 Node DuckDB 为候选实现。它只有在 macOS、Windows、Linux 的打包加载、首次下载、断点续传、近十日增量、去重、复权、质量检查、磁盘预算、迁移和卸载原型全部通过后才能标 supported。不得复制或拉起 Python marketdb/CLI 子进程；原型失败时保持 unavailable/blocked，不修改宿主绕过。

### Trade-off

比直接绑定官方 CLI 或 Python 需要更多插件侧实现和跨平台验证；换取单一 Node 运行时、插件私有数据归属、可删除性与许可边界清晰。

### Consequences

- 本地历史源先进入 Prototype Work，再回到 Spec/Ticket 修订。
- 大规模价格型研究可优先本地；财务、指数历史成分和其他未进入 dump 的数据仍按各自 provider 能力处理。
- 数据目录必须有容量预估、同步状态、版本迁移和卸载/保留选择。

### Verification / Migration

原型必须提供三平台 artifact/loading 证据、损坏/中断恢复、重复增量幂等、复权 fixture、质量检查和删除插件后宿主可启动证据；任一门失败不得宣称 supported。
