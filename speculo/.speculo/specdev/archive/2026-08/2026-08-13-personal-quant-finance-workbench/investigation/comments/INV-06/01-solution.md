---
artifact: wayfinder-solution-comment
ticket: INV-06
sequence: 1
resolution: answered
---

# Solution: 金融正确性数据治理与用户安全契约

- **Ticket：** `<Path>{roots.state}/specdev/changes/2026-08-13-personal-quant-finance-workbench/investigation/INV-06-financial-correctness-governance.md</Path>`
- **答案：** 金融插件的“全能”必须先被约束为可审计的研究闭环：显式身份和时点的 `DataRequest` -> 不可变 `DataSnapshot` -> 确定性质量门 -> 因子/筛选/回测或研究底稿 -> 带证据引用的 `ResearchAssessment`。任何无法证明标的、交易日历、复权、单位、点时、费用、许可或数据新鲜度的结果都不得伪装成成功；要么 `blocked`，要么明确标注 `partial/stale/unknown`。插件可以拥有这些领域对象、provider adapter、质量检查、报告和审计；共享官方规则 Registry、通用回测内核、高频连接、sidecar、券商交易和跨插件快照若成为硬依赖，必须另立系统 change。
- **研究现场：** 四个仓库均固定在 Wayfinder 记录的 commit：`<Path>temp/finance-references/tickflow-stock-panel/</Path>`、`<Path>temp/finance-references/Vibe-Research/</Path>`、`<Path>temp/finance-references/a-stock-data/</Path>`、`<Path>temp/finance-references/TradingAgents-astock/</Path>`。本答案只把可复现的源码/文档事实作为证据，不把 README 的功能宣称当成质量合同。
- **Hana 约束：** 插件能力依据 `<Path>PLUGIN_SDK.md</Path>`、`<Path>PLUGINS.md</Path>`、`<Path>skills2set/hana-plugin-creator/SKILL.md</Path>` 和已完成的 `<Path>{roots.state}/specdev/changes/2026-08-13-personal-quant-finance-workbench/investigation/comments/INV-05/01-solution.md</Path>`。本 ticket 不实现生产插件。

## 1. 裁决总表

| 领域 | MUST | MUST NOT | UNKNOWN / 阻断条件 |
|---|---|---|---|
| 标的身份 | 每个请求携带 canonical id、exchange、asset type、币种和有效期；响应回显并校验身份 | 用裸六位码、名称模糊匹配或 fallback 到另一资产 | 代码迁移、退市、合并和供应商别名直到 instrument master 有证据 |
| 市场/时区/日历 | 保存 IANA timezone、UTC 时间、`calendarId`、`ruleSetVersion` 和有效区间 | 用服务器本地时间、周末判断或一个固定交易日历代表所有市场 | 官方假日、临时休市、板块规则变化未被版本化时，历史运行 `blocked` |
| 点时数据 | 历史请求必须有 `asOf`；字段有 `publishedAt/effectiveAt` 或声明 current-only | 把当前估值、预测、新闻缓存或事后修订数据放入过去 | provider 无 PIT 能力时只能 `current_context`，不可进入历史回测 |
| 价格/公司行动 | 明确 `raw/split_adjusted/back_adjusted/total_return`，保留因子和原始快照 | 混用复权口径、无因子地跨除权日比较或用供应商默认模式 | 因子定义、现金分红/配股/送转/停牌处理无来源时 `adjustment_unknown` |
| 停牌/ST/涨跌停/T+1/手数 | 规则按市场、板块、日期、证券状态、价格精度确定性计算并带来源 | 把 0 成交量当作陈旧、把名称字符串当规则唯一依据、假设可当日卖出 | 精确现行规则/历史变更/节假日须从官方快照核验；没有就不可声称可交易 |
| 成本/容量 | 佣金、印花税、过户费、最低收费、滑点、冲击、容量、成交量和舍入显式建模 | 缺字段默认为 0；把日线成交量当可成交容量；复用别的市场费率 | provider/市场没有合同费率或成交语义时 `cost_model_missing`/`capacity_unknown` |
| 偏差 | universe、特征、标签、训练/验证/测试均按 as-of 冻结；保留退市标的 | 未来函数、幸存者宇宙、用修订后报表回填过去、随机泄漏 | 供应商不能提供历史成员/发布时间时 `survivorship_uncontrolled` 或 `pit_unavailable` |
| 质量/血缘 | 每行快照有 provider/version/request hash/response hash/schema/unit/时间和 fallback trace | HTTP 200、TCP 握手、空数组、模型完成等同于有效数据 | 缺失、陈旧、冲突、schema 漂移必须保留为状态，不静默变空 |
| 许可 | provider/dataset 有条款 URL、访问基础、留存/再分发/归因和复核时间 | 用 Apache-2.0 代码许可推导第三方数据可分发 | 条款未知或不允许缓存/再分发即 `license_blocked` |
| 隐私/秘密 | 凭证进入 Hana sensitive config；持仓和笔记进入受控 ResourceIO/插件 data | 在 iframe、日志、prompt、仓库、URL query 暴露 secret 或未经同意外发持仓 | 外部模型、provider、缓存位置和删除策略须逐次显示/审计 |
| AI 输出 | 事实、推断、假设、未知、引用和置信/质量分开；每个 claim 有 evidence id | 将评级映射成买卖、补写缺失数据、把模型语气当事实 | 无引用、结构化失败或证据不足只能 `insufficient_evidence` |
| 预算/取消/审计 | data/model/egress/time budget、取消、幂等、费用和调用 trace 可见 | 失败后无限重试、取消后完成回写、重启重复收费 | provider 不支持中止或成本回报时必须显示估算和 `budget_unknown` |

**安全边界：** 任何用户可见的默认文案都应包含“研究/学习用途、非投资建议、不能保证收益；请独立核验”。中国证监会的风险宣传页面也明确强调高收益伴随高风险，作为监管风险提示证据：<Url>https://www.csrc.gov.cn/csrc/c106299/c7604802/content.shtml</Url>。这不是个性化建议，也不是合规意见。

## 2. 领域合同

### 2.1 输入与资产身份

首版不接受 `symbol: "000001"` 作为完整输入。推荐的可持久化结构如下：

```text
AssetRef {
  canonicalId, exchange, market, assetType,
  displayName, currency, timezone, vendorIds[], aliases[],
  validFrom, validTo, status, sourceRef
}

DataRequest {
  requestId, runId, assetRefs[] | universeRef,
  dataset, fields[], start, end, asOf, asOfMode,
  timezone, calendarId, ruleSetVersion,
  adjustment, currency, unitMap,
  pit: { required, providerVersioned, publishedAtCutoff },
  licenseUse, cachePolicy, budget
}
```

`canonicalId` 由 instrument master 分配；`vendorIds` 只能作映射，不得覆盖 canonical identity。请求和响应必须同时校验 exchange、asset type、currency、单位及有效期。代码迁移、证券退市、停牌、指数/ETF 与股票同码等情况要产生新 `AssetRef` 版本，而不是覆盖历史身份。

本地事实给出了必须写成回归测试的反例：`a-stock-data` 的文档指出 `000001` 在不同市场可能是股票或指数；北交所 43/83/87 老号段在 HTTP 200 下返回 0 篇或定格价格，336/342 在其 2026-07-31 实测已迁往 920xxx；`tencent_quote()` 才增加 `is_stale/stale_reason`，而不是把结果当正常报价。故 `identity_mismatch`、`stale_response`、`dead_code` 和 `halted` 必须分开。

### 2.2 时间、日历与 PIT

所有内部时间以 UTC 序列化，同时保留市场 IANA timezone。`asOf` 是历史研究的必填字段；`fetchedAt` 只说明本次取得时间，不等于数据可用于 `asOf`。`calendarId` 和 `ruleSetVersion` 说明哪一版交易会话、假日、临时休市、板块规则和价格精度被使用。

`publishedAt` 是信息首次公开时间，`effectiveAt` 是公司行动/规则生效时间，`periodEnd` 是会计期间结束时间，四者不能互换。PIT 数据门至少要求：

```text
publishedAt <= asOf
effectiveAt <= asOf (for rules/actions)
providerVersioned = true
```

只有 `current_context` 模式允许读取没有 PIT 的当前行情或当前分析师预测；UI、Agent 和导出的报告必须显示该模式。TradingAgents-astock 的 `stockstats_utils.py` 会过滤 `curr_date` 之后的行情/财报，`a_stock.py` 也会在历史模式排除当前分钟资金流；这些是有价值的第一道防线，但日期过滤本身不能证明供应商提供了历史发布版本。因此新闻、预测、财报修订、缓存快照还需 `publishedAt/effectiveAt`。

训练、验证和测试区间必须是时间有序、互不重叠的 `DataSlice`，并记录 universe membership 的 as-of。没有历史成分股、退市和换代码记录，结果必须是 `survivorship_uncontrolled`，而不是“回测完成”。

### 2.3 复权、公司行动与交易规则

价格请求必须选择一种调整模式：

```text
raw              # 可审计的原始成交价
split_adjusted   # 明确拆分/送转因子
back_adjusted    # 明确回溯方向和因子来源
total_return     # 明确现金分红再投资假设
```

保存 `adjustmentMode`、`factorSource`、`factorVersion`、公司行动事件和原始价格；禁止跨模式连接收益序列。`a-stock-data` 记录 mootdx bars 无 `adjust`、通常是未复权 raw，自动在 qfq/raw provider 间 fallback 会改变回测含义；这是 `adjustment_unknown` 的直接触发例。

停牌、未开盘、零成交、废码、数据缺失需分别编码。涨跌停价格和 ST/板块限制必须由版本化规则表按 `tradeDate + board + instrumentStatus + previousClose + tickSize` 计算，采用确定性的价格精度舍入。TickFlow 的 `price_limits.py` 和测试展示了日期感知、板块感知、整数分厘 half-up 舍入，以及“历史信号用 instrument as-of、实时信号用当前 instrument quote”的正确性模式；其代码中的具体日期和百分比只能作为代码事实，不能直接升级为本产品的现行官方规则。

T+1 不能只写在 Agent prompt：执行模型至少要有 `sellableQuantityAt`、`entryFillAt`、`matching=open_t+1|close_t`、涨跌停不可成交和 `lotSize`。TickFlow 的 `open_t+1` 只是在回测匹配上平移一根 bar；它不是涵盖所有 A 股证券、ETF、可转债和特殊交易品种的通用制度实现。精确规则/假日必须由官方快照导入；访问不到或版本缺失时返回 `calendar_unknown`/`invalid_rule_set`。

### 2.4 成本、滑点与容量

回测/模拟交易请求必须携带 `CostModel`，不得用省略字段代表免费：

```text
CostModel {
  currency, commissionRate, commissionMin,
  stampTaxRate, transferFeeRate, otherFees[],
  buySellScope, roundingRule, lotSize,
  slippageModel, impactModel, maxParticipation,
  capacityAssumption, effectiveFrom, sourceRef
}
```

`slippageModel` 至少区分固定 bps、spread、volume participation 和不可成交；`impactModel` 需要 ADV/盘口/参与率等输入，没有输入就为 `capacity_unknown`。成交额、成交量、换手率必须带 unit 和转换公式。`a-stock-data` 的腾讯分钟 K 第 7 字段是换手率基点而不是成交额；将其当金额会产生约三个数量级错误，必须有 schema/unit regression。TickFlow 使用 `fees_pct=.0002`、`slippage_bps=5` 的实现事实只说明它有可配置参数；不能把这些数值作为所有市场的默认费率。

成本/容量不完整时，研究可以生成“未计成本的观察”但不能生成可比较的净收益指标；回测结果质量为 `partial`，执行可行性为 `blocked`。费用、税和舍入规则的精确现行数值在官方/券商合同快照核验前保持 UNKNOWN。

## 3. 质量、血缘与错误语义

### 3.1 不可变快照与证据

```text
DataSnapshot {
  snapshotId, requestHash, providerId, providerVersion,
  retrievedAt, asOf, timezone, calendarId,
  adjustment, currency, schemaVersion,
  rowCount, byteCount, fields, unitMap,
  quality, missing[], conflicts[], fallbackTrace[],
  rawSnapshotHash, normalizedHash, evidenceRefs[], licenseStatus
}

EvidenceRef {
  evidenceId, dataset, sourceUrl, requestHash,
  rawSnapshotHash, fieldMap, unitMap, publishedAt,
  citation, licenseStatus, quality
}
```

原始响应和规范化结果均只追加不覆盖；缓存命中也必须更新 `retrievedAt`、原始快照身份和 freshness。报告引用 `evidenceId`，而非仅写 URL。fallback 记录 provider、理由、语义是否等价和丢失字段。

### 3.2 质量状态与错误码

质量状态：`fresh`、`stale`、`partial`、`blocked`、`unavailable`、`conflict`、`unknown`。至少实现以下稳定错误码：

```text
invalid_asset, identity_mismatch, calendar_unknown, timezone_missing,
asof_required, pit_unavailable, future_data, survivorship_uncontrolled,
adjustment_unknown, corporate_action_missing, unit_mismatch,
currency_mismatch, schema_drift, empty_response, stale_response,
provider_unreachable, rate_limited, license_blocked, auth_required,
budget_exhausted, cancelled, insufficient_history, invalid_rule_set,
cost_model_missing, capacity_unknown, model_output_unsubstantiated
```

错误响应必须包含 `retryable`、`provider`、`requestId`、`runId`、`evidenceRefs`（若有）和用户下一步。以下反例绝不许静默吞掉：

- a-stock-data 记录的 mootdx TCP 握手成功但真实 K 线只返回 2 bytes/空表；provider 必须执行真实取数验活，失败才切换或抛 `provider_unreachable`。
- mootdx 把错误参数 `category` 通过 `**kwargs` 吞掉，分钟请求静默退化为日线；每个 dataset 要做响应频率/粒度 oracle，失败为 `schema_drift`，不是成功的日线。
- HTTP 200 老北交所代码、空研报列表、停牌 0 量和正常无成交必须能区分；空数组只有在 provider 明确的“查询范围内确实为空”证据下才是 `empty_confirmed`。
- Vibe-Research 的缓存 TTL（如 900/1800 秒）不能单独代表 freshness；响应必须回传 `asOf/staleAt/providerVersion`。工具结果 6000 token cap 是成本护栏，不是数据截断无害的证明。

自动降级只允许 `semantic_equivalent`：同身份、时间粒度、复权、单位、币种、日历和字段定义全部相同。`lossy` 需用户批准并将质量降为 `partial`；`unknown`、`license_blocked`、`identity_mismatch`、`pit_unavailable` 直接阻断历史结论。

## 4. AI、隐私、许可和用户安全

### 4.1 事实、推断和不确定性

模型输入只能是已批准的 `DossierSnapshot` 投影。输出 `ResearchAssessment`：

```text
stance: supportive | mixed | cautious | insufficient_evidence
claims[]: { text, kind: fact | inference | hypothesis,
            evidenceIds[], confidence, asOf }
counterclaims[], consensus[], disagreements[]
unknowns[], verificationChecklist[]
quality: fresh | stale | partial | blocked
ruleSetVersion, modelRef, promptVersion, schemaVersion
```

`fact` 必须有可打开的证据和时点；`inference` 必须说明推理依据；缺引用、越过 `asOf`、规则未确认、成本未知或模型无法解析时，结论为 `insufficient_evidence`。Agent 可以生成研究 stance、风险摘要和人工核验清单，禁止输出个性化买卖、仓位、目标价、止损或自动下单动作。Vibe-Research 的“dossier first、缺失项不得臆测、Bull/Bear/neutral 不给 buy/sell”可采用并强化；TradingAgents 的角色评级、Trader/Portfolio Manager 交易语汇必须拒绝。

### 4.2 私密数据、秘密和外发

API key/cookie/bearer token 只存 Hana 配置 schema 的 `sensitive: true`；不进入 iframe bundle、HTML、日志、URL、`SessionFile`、prompt 或 Git。持仓、成本、交易记录、私人笔记和研究文件默认本地/插件私有；发送给 provider 或模型前必须显示 dataset、字段、目的、接收方、保留期和用户确认，脱敏后才允许。

Vibe-Research 将 watchlist、笔记、LLM 配置放在 `localStorage` 且标注本地不上传，这是隐私意图的好例子；Hana 应改用 `ctx.dataDir`/ResourceIO，以获得生命周期、备份和审计，而不是把 localStorage 当唯一持久层。浏览器存储失败、配额耗尽或删除失败必须可见。

### 4.3 许可证与访问条款

`a-stock-data` 和 TradingAgents-astock 的 Apache-2.0 只覆盖相应代码（TradingAgents 另有 `NOTICE`）；不覆盖腾讯、Sina、Eastmoney、THS、CLS、交易所、新闻或研报数据。每个 provider/dataset 建 `LicenseRecord`：

```text
providerId, dataset, termsUrl, accessBasis,
cacheRetention, redistribution, attribution,
commercialUse, egress, reviewedAt, reviewer, status
```

状态只有 `approved`、`restricted`、`unknown`、`blocked`。条款未知时可以让用户导入自己的快照并在本机分析，但不把源接入默认 manifest、自动缓存或分发产物。固定保存条款版本和复核时间；法律页面变化触发 provider 重新审核。

## 5. 运行预算、取消与审计

`ResearchRun` 在创建时冻结：`runId`、输入 hash、`DataRequest`、provider/model 版本、规则/日历/复权/成本版本、token/数据字节/请求数/时间预算、外发同意和重试策略。每个 stage 产生 `RunEvent`：`created/preparing/quality_check/blocked/ready/data_collection/perspective_a/perspective_b/synthesis/review/succeeded/partial/failed/cancelled`，并记录开始/结束、调用、字节、tokens、估算/实际费用、重试、错误和 evidence IDs。

取消是协作式且幂等：取消 TaskRegistry 任务、停止 AbortController、清理 watch/临时文件，禁止任何晚到响应把 `cancelled` 改回 `succeeded`。重启后按 `runId + stageId + inputHash` 恢复或明确失败；只恢复 checkpoint，不无条件重放已计费 provider/模型调用。预算耗尽返回 `budget_exhausted`，不是无限 fallback。Vibe-Research 的“每轮约三次模型调用、需先看成本”和 TradingAgents 的 quick/deep 模型分层只能作为体验启发，实际预算必须按 Hana provider 返回或明确标注估算。

## 6. 必须通过的测试矩阵

| ID | 场景 | 预期可观察证据 |
|---|---|---|
| F-01 | `000001` 无 exchange/assetType | `invalid_asset`，不发 provider 请求 |
| F-02 | 股票代码映射为指数/迁移前后代码 | `identity_mismatch`，返回候选 AssetRef，不自动替换 |
| F-03 | Asia/Shanghai 会话跨 UTC 日 | UTC、IANA timezone、calendarId 均保存，边界不跨日 |
| F-04 | 周末/临时休市/板块变更 | 使用版本化官方 calendar/rule snapshot；缺失则 `calendar_unknown` |
| F-05 | 历史请求缺 `asOf` 或 provider 无 publishedAt | `asof_required`/`pit_unavailable`，禁止回测/历史 Agent |
| F-06 | 财报发布日晚于 asOf、修订版晚于 asOf | 行被排除并记录 `future_data`；不靠 curr_date 字符串掩盖 |
| F-07 | raw 与 qfq 混用、除权日无因子 | `adjustment_unknown` 或 `corporate_action_missing` |
| F-08 | 停牌、未开盘、废码、0 量真实成交 | 四种状态可区分；不把空图当成功 |
| F-09 | ST/板块/精度/历史规则边界 | 规则版本、输入 previousClose、half-up 结果和 evidence 可复算 |
| F-10 | T+1 买入后当日卖出、不同 lotSize | `sellableQuantityAt` 阻止不可卖数量；零股/舍入有明确错误 |
| F-11 | commission/tax/min fee/slippage/capacity 缺一项 | `cost_model_missing` 或 `capacity_unknown`；净收益不标 fresh |
| F-12 | 腾讯分钟字段第 7 位当 amount | `unit_mismatch`，数量级 oracle 失败 |
| F-13 | mootdx TCP 握手成功、category 参数误传 | 真实 K 线/粒度验活失败为 provider/schema 错误，不返回假日线 |
| F-14 | fallback 改变复权、单位、频率或币种 | 不自动 fallback；`fallbackTrace` 和 `partial/blocked` 可见 |
| F-15 | 退市标的、历史 universe、训练/验证重叠 | `survivorship_uncontrolled`/时间分割失败，运行阻断 |
| F-16 | HTTP 200 僵尸报价、缓存 TTL 过期、冲突 provider | `stale_response`/`conflict`，raw hash 与 provider version 可追溯 |
| F-17 | license unknown、用户持仓和 API key | `license_blocked` 或外发确认；日志/HTML/prompt 无 secret |
| F-18 | 模型 claim 无 evidence、越过 asOf、缺失字段 | `model_output_unsubstantiated`，stance=`insufficient_evidence` |
| F-19 | token/byte/request/deadline budget 耗尽 | `budget_exhausted`，不无限重试，费用 trace 完整 |
| F-20 | 用户取消、宿主重启、provider 晚到响应 | 任务最终 `cancelled/recovering/failed`，不被晚到结果覆盖 |

验收不是“页面能显示一根线”：F-01..F-20 需有 fixture、输入 hash、预期错误码和可读审计记录；至少一条真实或官方固定快照证明每个启用 provider 的字段、时点、单位、许可和限流假设。

## 7. 采用、改造与拒绝清单

| 来源 | 采用 | 改造 | 拒绝 |
|---|---|---|---|
| TickFlow | 显式 Beijing 时区、会话、日期/板块规则、T+1 `open_t+1` 匹配、可配置费用/滑点、价格精度测试 | 规则表、日历、成本/容量、instrument as-of、Sharpe 年化频率全部版本化并有证据 | 直接复制具体费率、2026 日期/涨跌幅或把 `weekday` 当完整交易日历 |
| Vibe-Research | dossier-first、missing、正反视角、中立综合、live refresh 可暂停、成本提示、非投资建议 | cache 返回 freshness/provider；持仓/笔记用 Hana data/ResourceIO；输入校验和删除审计 | localStorage 作为唯一账本、负数成本等宽松校验、缓存命中等于新鲜 |
| a-stock-data | provider 清单、官方链接候选、真取数验活、stale 标志、字段单位与限流反例 | 每 provider 合同、snapshot、PIT、许可和等价 fallback | 抓站接口默认为稳定授权、空列表当正常、mootdx TCP 直接进入插件 |
| TradingAgents | 有限阶段、独立正反观察、结构化输出、curr_date 过滤、结果复盘 | dossier/evidence/quality hard gate、证据化 claim、预算和 Hana Task/Session | 7+角色自由图、评级到交易动作、固定 prompt 制度、自由文本 fallback |

## 8. 插件/系统放置裁决

依据 `<Path>.agents/skills/feature-placement/SKILL.md</Path>`，本 ticket 的 schema、provider adapter、快照、质量门、研究运行、报告和审计均可放在 `<Path>plugins/quant-finance-workbench/</Path>` 的 full-access 插件，使用 INV-05 已验证的 network/config/ResourceIO/dataDir/Session-Agent/TaskRegistry/进度取消能力。

下列任一项出现即停止插件扩张并另立 system change：

1. 所有插件共享且需宿主维护的官方日历/涨跌停/费率 Registry，且需要跨插件一致事务；
2. 通用回测引擎、列式存储、Python/Polars/DuckDB worker 或任意本地 sidecar 成为发布前提；
3. raw TCP/WebSocket、高频行情、重连/backpressure、行情再分发许可或持续进程；
4. broker credential、订单、持仓同步、资金或无人值守执行；
5. 其它插件必须消费同一 `DataSnapshot`/`ResearchRun`，要求宿主级跨插件 API、权限和迁移；
6. 全局数据/模型预算、成本计费或审计服务必须跨插件统一；
7. 需要宿主数据库 schema、启动顺序、权限模型或桌面原生金融图表 API 改动。

## 9. 尚存 UNKNOWN 与交付前门

以下不是可用默认值，必须在 Spec/实现阶段用证据填充：

- 当前及历史交易所日历、临时休市、ST/板块/新股阶段/涨跌停/T+1/最小手数/价格精度的完整官方规则和生效日期；当前部分交易所网页访问受限，不能以仓库常量代替官方快照。
- 佣金、印花税、过户费、最低收费和不同账户/市场的有效日期；需券商/官方费率记录。
- 每个行情、财务、新闻、研报、资金流 provider 的 PIT 覆盖、修订历史、实时保证、缓存和再分发条款。
- 公司行动因子方向、现金分红再投资、退市收益和停牌期间的具体计算口径。
- 日线/分钟数据的可成交容量、队列、涨跌停封单和市场冲击；没有盘口不可把成交量当 fill capacity。
- 外部模型是否留存 prompt/数据、区域、删除接口和费用回报；未知时默认不外发私有数据。

交付前门只有全部满足才可把某 dataset 标成 `supported`：官方/合同来源快照、版本和条款；AssetRef 映射；字段/单位/币种/时区；PIT/asOf；质量和错误 fixture；限流/缓存；许可证记录；至少一条回归测试和用户可见的 freshness/evidence。否则只可标 `experimental`、`current_context` 或 `blocked`。
