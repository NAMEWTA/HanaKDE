---
artifact: wayfinder-solution-comment
ticket: INV-03
sequence: 1
resolution: answered
---

# Solution: A 股数据能力层与降级治理

- **Ticket：** `<Path>{roots.state}/specdev/changes/2026-08-13-personal-quant-finance-workbench/investigation/INV-03-a-stock-data.md</Path>`
- **答案：** `a-stock-data` 是一个把多家公开网页接口、HTTP JSON、HTML 表格和 mootdx TCP 拼成单文件 SKILL 的能力清单，不是可直接采用的数据产品契约。它可以提供数据集盘点、DTO 命名和研究工作台的启发，但不能把端点、字段、空数组或备用源自动升级成稳定承诺。Hana 首版应先建立保留市场身份和时点语义的 `AssetRef`、provider 能力矩阵、来源/许可登记、不可变快照、质量状态和显式降级；在取得合法且可持续的 provider 合同前，宁可支持用户导入和 fixtures，也不把未经验证的网页接口作为默认数据源。
- **事实与来源：** 调查固定在 `<Path>temp/finance-references/a-stock-data/</Path>` 的 commit `3a3149dedbe30cda58b5c94387039d7e707cedcd`，主要证据是该仓库的 `SKILL.md`、`README.md`、`CHANGELOG.md`、`LICENSE`；协议和 Hana 映射以 `<Path>skills2set/hana-plugin-creator/SKILL.md</Path>`、`<Path>PLUGIN_SDK.md</Path>`、`<Path>PLUGINS.md</Path>`、`<Path>packages/plugin-sdk/README.md</Path>` 与 `<Path>packages/plugin-components/README.md</Path>` 为依据。
- **资产：** `<Path>temp/finance-references/a-stock-data/</Path>`，<Url>https://github.com/simonlin1212/a-stock-data</Url>；上游依赖 mootdx 的代码许可参考 <Url>https://github.com/mootdx/mootdx</Url>；数据服务条款必须逐 provider 另行登记。
- **后续 Ticket 所依赖的事实：** INV-05 需要按 Hana host-first 权限重做 HTTP/TCP 与任务/缓存边界；INV-06 需要固化点时、复权、交易日历、单位和质量 oracle；INV-07 需要把数据集、provider 能力和失败分类接入统一能力模型；INV-10 需要实现 provider isolation、快照和恢复协议。
- **新浮现的 Tickets：** 无；身份、PIT、provider 许可和 TCP 外置已经由 INV-05/06/07/10 覆盖。
- **升级的战争迷雾：** 已命名并归入既有 Ticket：原“数据质量或运行时断层”具体收敛为“标的身份/点时/来源许可/TCP 能力边界/隐式降级”五项，不再作为不可命名迷雾。
- **对现有 Tickets 的影响：** update INV-05、INV-06、INV-07、INV-10；INV-09 的 UI 必须展示来源、时点、质量和降级状态；不改变 `<Path>plugins/quant-finance-workbench/</Path>` 的内置 full-access 插件落点。

## 决策摘要

### 可采用、必须改造、明确拒绝

| 上游能力 | 裁决 | 原因 |
|---|---|---|
| 数据集盘点、请求参数说明、研究 DTO 命名 | adopt as inventory | 可用于能力模型和 fixture 目录，不代表端点稳定或有再分发权 |
| HTTP provider adapter 思路、Session 复用、串行访问 | adapt | 每个 provider 独立实现；请求必须经 `ctx.network.fetch`，由宿主统一超时、限流、审计 |
| 腾讯报价/日线、Sina 财务、CNINFO 公告的结构化映射 | adapt after contract | 需要校验标的、单位、时点、分页、条款；只保存规范化结果和来源引用 |
| Eastmoney/THS/CLS 热榜、资金流、涨停池、研报搜索 | experimental/defer | 私有网页接口、字段方法论和结构经常漂移；不能作为研究或交易结论的默认证据 |
| mootdx 行情、盘口、逐笔、财务/F10 | defer to external adapter | TCP 7709 不是 `ctx.network.fetch` 可表达的 HTTP 能力；旧协议和海外网络时延也不适合插件首版 |
| 原始报告 PDF、网页 HTML、公告全文批量归档 | defer/ResourceIO opt-in | 内容权利、体积、留存和再分发不清楚；首版保存 `ResourceRef`/官方链接与元数据 |
| `[]` 作为失败、自动切换源、换域名/换网络绕 WAF | reject | 会把阻断、空集、解析错和源语义改变伪装成正常结果，破坏回测和审计 |

**硬规则：** 未经一次实际请求、响应 fixture、字段/单位验证、失败分类和许可登记的网页接口，禁止写入首版 provider contract、manifest `allowedHosts` 或用户可见的“稳定支持”列表。README 中的“47 endpoints/15 sources/3 fallbacks”只作为能力库存，不能作为质量、覆盖或授权承诺。

## Research Findings

### R-001：仓库形态决定了移植方式

- **Claim：** 固定 commit 不是标准 Python package，而是约 3,000 行单文件 SKILL 加 README/CHANGELOG；用户按需复制代码片段，依赖 `requests`、`pandas`、`mootdx`、`stockstats`。`stockstats` 在代码中基本没有实际数据路径贡献，显示依赖与实现存在漂移；仓库没有可供我们直接运行的常规测试套件。
- **Type：** source fact + recommendation
- **Source：** `<Path>temp/finance-references/a-stock-data/SKILL.md</Path>`、`README.md`、`CHANGELOG.md`、`LICENSE`。
- **Confidence：** high
- **Limits：** 不能据此断言所有上游片段都不可用；只能断言它们需要重新封装、固定 schema 和独立验证。
- **Hana impact：** 不复制 SKILL 的 Python/requests 运行时；把每个数据集做成 provider adapter + normalized validator，必要的源代码若复制须保留 Apache-2.0 attribution、变更说明和许可证副本，第三方数据权利另审。

### R-002：请求协议和源优先级是异构的，不存在一条“万能行情 API”

| 数据类型 | 上游主源 | 备用/补充 | 协议与依赖 | Hana 结论 |
|---|---|---|---|---|
| K 线、盘口、成交、部分 F10 | mootdx TCP | 腾讯/Sina/Baidu HTTP | TCP 7709，mootdx；无 API key | 不进 HTTP route；需独立、受限 adapter 或系统前置 change |
| 实时报价、PE/PB、市值、换手、指数/ETF、部分涨跌停 | 腾讯 HTTP | Sina/Baidu/Eastmoney | JSON/文本 HTTP；无显式 auth | 只在合法条款和 fixture 通过后接入，保存 `asOf`/stale |
| 财务报表、股东、分红 | mootdx/Sina | Eastmoney/THS | TCP 或 JSON/HTML | current profile 可选；历史研究必须有 publish date/PIT |
| 公告 | CNINFO | SZSE/SSE 官方页面、Eastmoney | JSON/文本 HTTP | 优先合同化 CNINFO API；首版链接/元数据，不批量复制全文 |
| 研报/行业报告 | Eastmoney | THS、iwencai（带 key） | JSON/HTML/PDF；iwencai bearer key | 仅配置的授权 provider；PDF 交给 ResourceIO |
| 新闻 | Eastmoney/CLS | THS/Sina | JSON/HTML/RSS-like | 需授权、去重、引用和留存策略；不做无来源摘要 |
| 资金流/北向/筹码 | Eastmoney/Sina/THS | HKEX 官方日数据仅可作思路 | 私有 JSON/静态文件 | 研究观察而非交易信号；北向 realtime 不承诺 |
| 涨停/连板/龙头 | Eastmoney/THS | 无语义等价备用 | 私有网页 JSON | defer；若接入必须标注供应商方法论与降级 |
| ETF 期权/Greeks/IV | Sina | 无独立备用 | `hq.sinajs.cn` GBK 文本、位置解析 | defer；先要合约主数据、到期日、乘数、结算和时点契约 |
| 热度/情绪/概念 | Eastmoney/THS/CLS | 官方 IRM/公告可作事实源 | 私有榜单/网页 | 只做带方法论的实验指标；不能叫“预测” |

上游 README 所称“全免费、免 key”描述的是访问路径，不是使用、缓存、复制或商业/内置分发许可。只有 iwencai 路径显式使用用户 API key；腾讯、Sina、THS、CLS 的许可在本票中保持 `unknown`，不得默认启用。

### R-003：标的规范化会造成静默错配，必须先解决身份模型

- `get_prefix` 以首位数字和少量指数白名单推断沪/深/北；多个函数仍以 `startswith("6")` 分流，BSE `920`、旧 `43/83/87`、ETF/指数和显式前缀会被误路由。
- `norm_ticker` 只返回六位数字并丢弃市场/交易所/资产类型；例如 `sh000001` 归一化后被腾讯裸码路径当成 `sz000001`，指数可能变成平安股票。报告和 THS EPS 使用了该函数，其余约 25 个入口并未统一使用。
- changelog 已记录 920 -> 上海、000016 误转成其它股票、前缀报告为空、批量结果覆盖和 BSE 市场标记错误；这些不是理论边角，而是上游维护中已经出现的回归类别。

Hana 的最小身份合同：

```text
AssetRef {
  market, exchange, assetType, symbol, currency, timezone,
  vendorIds, aliases, validFrom, validTo, status
}
```

请求必须带 `AssetRef` 或明确的 `UniverseRef`，响应必须回显并校验 exchange/symbol/name/assetType；不能用裸六位码代替身份。证券代码迁移、停牌、退市、BSE 旧码和指数/ETF 要由 instrument master 管理，并记录生效区间。一个 provider 返回“同码不同资产”时应为 `identity_mismatch`，绝不能 fallback 成另一只资产。

### R-004：时点、复权、日历和单位缺口会污染回测

- mootdx K 线是未复权原始行情，当前没有复权因子；腾讯 fallback 使用 qfq、Sina fallback 多为 raw，自动 fallback 会改变价格语义。
- 报价 DTO 丢弃了服务端时间/来源标识；`amount_wan == 0 && price == last_close` 把暂停、未开盘、老代码和陈旧响应混成一个 stale 判断。
- 财务/Sina 原始响应有 `publish_date`、`update_time`、币种、合并/审计状态，但上游 DTO 丢掉这些元数据，只剩报告期和中文标题；不能用于点时回测。股东接口有 `HOLD_NOTICE_DATE`，代码只保存期末日期，并读取不存在的 `AVG_FREE_SHARES`，平均持股永远可能为 0。
- 分红字段 `PRETAX_BONUS_RMB` 与 `10 派 ...` 文案是每十股口径，上游注释却称每股；锁定/解禁的股数和比例单位也没有统一 contract。单位必须和原字段、转换因子一起保存。
- 资金流分钟数据的 `main_net` 是累计快照，直接 `sum()` 会重复累计；腾讯分钟 K 的 fallback 字段 7 是成交额/基点类口径，不可当作金额。
- 没有交易日历：多处使用机器本地 `date.today()`/`datetime.now()`，北京时区只在个别 monitor 路径固定；龙头榜“今日空”同时可能表示非交易日、尚未发布、被限流或解析失败。锁定期把自然日和交易日混为一谈。

因此 `DataEnvelope` 必须保留 `asOf`、`fetchedAt`、`timezone`、`calendarId`、`adjustment`、`unitMap`、`currency`、`publishDate/effectiveDate`、`revision`、`isAudited`、`consolidation` 和完整性状态。缺少 PIT 的财务/持有人数据只能标为 current snapshot，不能进入历史回测。

### R-005：备用源不是“另一个 URL”，而是语义兼容性问题

上游的备用主要是按异常返回另一个供应商，并未比较字段、单位、市场、时点或完整性：

- K 线 fallback 可能从 raw 改为 qfq；
- Sina/腾讯的成交额、量、价格字段量纲不同；
- CNINFO 的结构化公告与 SSE 文本公告不是同形数据；
- 深圳龙虎榜响应有 `pagecount=3`/`recordcount=25`，上游只读第 1 页；
- Eastmoney datacenter 固定 `pageNumber=1` 且丢掉 `total`/`hasMore`；
- `em_hot_rank`、`em_hot_concept` 绕过统一 `em_get()`，直接请求不同子域；
- 许多函数把 HTTP 403、空响应、schema drift、解析异常都捕获为 `[]`；
- 北向接口在 2024-08 后停止完整披露，`~/.tradingagents/cache/northbound_daily.csv` 的本地历史不能伪装为权威历史。

降级须先分类：`equivalent`（同字段/同调整/同时间）、`lossy`（明确丢字段或改变口径）、`unavailable`。只有 equivalent 自动降级；lossy 需要用户或研究运行显式允许，并在结果中显示损失和 fallback trace；unavailable/blocked/parse_error 保留错误，不产出空数据。

### R-006：限流、缓存和错误必须由 provider 边界治理

上游 Eastmoney helper 使用全局 Session、GET 重试 3 次、429/5xx backoff 0.6 秒和 1 秒间隔，但 `_em_last_call` 没有锁；并发任务会同时读到旧时间而越过间隔。不同 Eastmoney 子域也有不同 WAF，改域名或换热点不是合法的产品降级策略。

Hana provider 应提供：

```text
ProviderResult<T> =
  ok(data, envelope)
  | empty_confirmed(envelope)
  | partial(data, completeness, envelope)
  | stale(data, freshness, envelope)
  | error(kind, retryable, provider, requestId, fallbackTrace)
```

错误枚举至少包括 `invalid_asset`、`unsupported_capability`、`auth_required`、`permission_denied`、`rate_limited`、`source_unavailable`、`schema_changed`、`parse_error`、`empty_confirmed`、`stale`、`partial`、`license_blocked`。

每个 host/credential 维护互斥队列或 token bucket、并发上限、`Retry-After`、指数退避和 circuit breaker；不以更换 IP、UA 或子域规避限制。缓存保存 raw snapshot + normalized snapshot、schema hash、provider version、TTL、as-of 和来源；失败响应不覆盖最后一个成功快照，stale-while-revalidate 必须标红。空集只有在 provider 明确确认且带查询范围时才进入短期 negative cache。

### R-007：十个数据层的产品化矩阵

| 层 | 主源 | 备用源 | 稳定性/典型失败 | 合规与许可 | 规范化要求 | Hana 首版 |
|---|---|---|---|---|---|---|
| 行情/市场 | 合法授权 HTTP quote/bar provider；上游是腾讯/mootdx | 合同允许的同语义 provider；官方交易所仅作校验 | HTTP 中；TCP/私有端点低；停牌、陈旧、分页易漏 | 未知/需合同；交易所数据不可默认再分发 | AssetRef、时区、复权、OHLCV、asOf、日历 | **必需但限日线/报价**；盘口/TCP 延后 |
| 研报/报告 | 合同化 iwencai 或报告 provider | THS/Eastmoney 合法授权 | HTML/PDF/列位置漂移、页数截断、动态日期 | 文章/PDF 版权独立于 Apache；未知默认拒绝 | reportId、发布日期、作者、页码、引用、版权状态 | **元数据/链接**；全文和批量 PDF 延后 |
| 信号/研究指标 | 由标准化原始数据计算 | 供应商指标仅作为观察 | vendor 方法论不透明，热度/榜单漂移 | 私有网页条款未知 | 区分 observation/derived/interpretation，保存公式版本 | **只做可复算指标**；供应商信号实验 |
| 资金/筹码 | 合同 provider；上游 Eastmoney/Sina | 同口径 provider | 累计/日值混淆、单位和分页问题 | Eastmoney 明确限制复制/分发，需许可 | flowMethod、unit、cumulative/asOf、scope | 研究观察可选；不作为交易信号 |
| 新闻 | 授权新闻/RSS provider | 其它授权 provider | 去重、撤稿、时间区、全文截断 | CLS/THS/Eastmoney 条款未知 | storyId、publishedAt、source、canonicalUrl、引用 | 只做引用和用户选择的摘要 |
| 财务/基本面 | 合同化带发布日/修订的 provider | Sina/mootdx 仅 current fallback | 无 PIT、合并/审计/币种丢失、指标命名漂移 | 数据库/研报权利独立 | periodEnd、publishDate、effectiveDate、revision、unit、currency | current profile 可选；历史回测延后 |
| 公告/披露 | CNINFO 合同 API/官方链接 | SSE/SZSE 官方、经许可镜像 | 分页、组织机构映射、附件和文本格式差异 | CNINFO 提供正式 API/数据市场；页面免责声明仍存在 | announcementId、exchange、publishAt、title、url、attachmentRefs | **首版必需元数据+链接**；全文归档 opt-in |
| 涨停/连板 | 无合约的 Eastmoney/THS 私有池 | 无语义等价备用 | 接口死亡、字段缩放、空集伪装失败 | 未知且可能限制抓取 | boardRuleVersion、reason、priceUnit、market | 延后/实验，不进入核心策略 |
| 期权/Greeks | 授权期权行情与合约主数据 | 无 | Sina 位置解析、GBK、到期/乘数/IV 缺失 | 未知；交易所合约数据需授权 | contractId、underlying AssetRef、expiry、strike、multiplier、style、asOf | 延后 |
| 舆情/情绪 | 公告/IRM/授权文本可复算指标 | THS/Eastmoney/CLS 热榜实验 | 分类和热度无统一方法，BSE 映射错误 | 未知；不默认再分发榜单 | methodology、window、universe、raw evidence | 公告事实可用；热榜/情绪延后 |

“主源/备用”必须以 dataset capability 为键，而不是以函数名或 URL 为键。信号、资金、情绪应同时标注 `raw observation`、`derived metric` 或 `model interpretation`，避免把供应商派生值包装成事实。

### R-008：来源条款是启用条件，不是文档尾注

- `a-stock-data` 仓库代码为 Apache-2.0；该许可只覆盖仓库代码，不覆盖 Eastmoney、SSE、CNINFO、腾讯、Sina、THS、CLS 或交易所数据。复制代码仍需保留 license/attribution/changed-file notice。
- Eastmoney 官方法律声明和服务协议明确：内容/行情不保证准确及时，避免不合理负载；未经书面许可不得复制、修改、转载、传播或基于交易所行情开发衍生产品。个人工作台的“自用”不自动等于 Hana 分发包获得再分发权。
  - `<Url>http://about.eastmoney.com/home/legal</Url>`
  - `<Url>http://about.eastmoney.com/home/protocol</Url>`
- SSE 官方法律页允许一般非商业浏览/下载，但商业电子抓取、存储、分发需书面许可，且不保证信息准确及时。
  - `<Url>https://www.sse.com.cn/home/legal/</Url>`
- CNINFO 是法定披露入口，并提供独立的 API/数据市场/定制服务入口；这支持“签约 API 或官方链接优先”，不等于公共网页接口可无限抓取。
  - `<Url>https://www.cninfo.com.cn/new/index</Url>`
  - `<Url>https://webapi.cninfo.com.cn/</Url>`
- THS、Sina、腾讯、CLS 的数据使用/再分发条款本次未取得足够一手文本，登记为 `unknown`，默认 `license_blocked`，不在 manifest 中预授权。

插件内维护每个 provider/dataset 的 license registry：

```text
providerId, dataset, termsUrl, accessBasis, redistribution,
cacheRetention, attribution, commercialUse, region,
reviewedAt, reviewer, enabled
```

默认拒绝未知条款；只把实际启用 provider 的最小 HTTPS host 写进 manifest `network.fetch.allowedHosts`。这不是法律意见，发布或向他人分发前必须做项目级条款审查。

### R-009：Hana 接入必须从请求边界开始

| 上游做法 | Hana 适配 |
|---|---|
| `requests.get/session`、HTML/JSON、文件下载 | 页面不能直连外网；由 route/tool 调 `ctx.network.fetch`，声明 HTTPS host、method、timeout、response bytes，并在 adapter 侧做 schema/size 校验 |
| bearer/API key（iwencai） | `ctx.config`/secret 配置；不进 iframe、日志、快照或模型 prompt；每 provider 独立凭据 |
| `~/.tradingagents/cache`、`./reports` | 使用插件 `ctx.dataDir`；用户文件通过 ResourceIO，导出用 `stageFile()`/SessionFile；原子写入并有 schema/version |
| mootdx 7709 TCP、Python/pandas | 当前网络能力不能表达 TCP；不得在 iframe/Node 中偷偷开 socket。若价值成立，另立受限本地 runner/系统前置 change，并提供 HTTP adapter/健康检查 |
| 隐式重试/备用、长循环刷新 | TaskRegistry/可恢复任务；记录 requestId、状态、取消、成本、fallbackTrace；不建立第二 scheduler |
| 原始网页接口 | 不承诺为 stable API；以 provider version + fixture + canary + terms gate 发布 |

推荐的 provider contract：

```text
DataRequest { dataset, asset/universe, asOf, range, frequency,
              adjustment, fields, cursor, purpose }
ProviderCapability { dataset, markets, historyDepth, latency,
                     auth, rateBudget, licenseStatus }
DataEnvelope { request, providerId/version, sourceUrl, fetchedAt,
               asOf, timezone, schemaVersion, unitMap, adjustment,
               currency, rows, pagination, completeness, qualityFlags,
               sourceStatus, fallbackTrace, rawSnapshotHash }
```

Provider adapter 负责源格式和错误翻译；normalized dataset validator 负责跨源语义；fallback policy 只在 capability、单位、时点和许可都兼容时选择备用。数据、分析、模型解释三层不可混写。

### R-010：首版垂直切片与延后清单

**首版必须证明：**

1. 配置一个有权利基础的 HTTP provider，显示 capabilities、terms、限流预算和健康状态；没有该 provider 时仍可导入用户 CSV/Parquet/JSON Resource 运行。
2. 建立带代码迁移和交易所的 instrument master；覆盖受控 universe 的日线/报价，产出带 `asOf`、复权、单位、来源和质量的 immutable snapshot。
3. 接入 CNINFO 合同 API 或官方公告链接，提供可分页的公告元数据、发布时间、标的关联和 `ResourceRef`，不把全文复制成默认缓存。
4. 对每次查询展示 `fresh / stale / partial / unavailable / license-blocked`，把 provider、原始快照 hash、fallback 和失败原因写入运行记录。
5. 让研究/筛选/报告只消费统一 snapshot，拒绝没有 PIT 或身份校验的 financial/holder 数据进入回测。

**明确延后：** mootdx TCP/盘口逐笔、全市场分钟湖、抓站热榜/涨停/连板、北向 realtime、资金信号、期权 Greeks/IV、HTML 研报全文、供应商一致预期、无交易日历的历史财务和自动化交易。它们分别等待系统前置、合同、PIT/日历、合约主数据或方法论验证，不是用一个备用 URL 解决。

### R-011：验证计划必须测试语义和灾难路径

每个已启用 provider 至少有：固定响应 fixtures（正常/空/403/429/5xx/schema drift/分页/重复/错误单位）、contract tests、标的回显校验、OHLC/金额/单位/时间单调性校验、跨源 canary 和条款状态测试。live canary 只证明“当前能请求”，不能替代历史正确性。

发布门槛：

- schema hash 或 provider version 变化 -> `schema_changed`，停用自动 fallback，等待人工审阅；
- 资产、市场、币种或复权不匹配 -> `identity_mismatch`/`semantic_mismatch`，禁止发布；
- 分页未完成 -> `partial`，禁止被标记为完整 universe；
- 403/证书/TLS/条款问题 -> `permission_denied`/`license_blocked`，不重试绕过；
- 解析异常和真实空集分离；UI 与 Agent 均能看到相同状态。

## 推荐路线

```text
Provider license registry + capability probe
  -> AssetRef/instrument master
  -> licensed quote/bar + announcement metadata
  -> immutable DataEnvelope + quality/freshness UI
  -> research/screen/report consume one snapshot
  -> only then evaluate PIT fundamentals and backtest
```

这条路线保留了 a-stock-data 的广度作为未来 provider inventory，却把“能抓到”与“能相信、能复现、能分发”分成不同门槛。任何未经验证的网页 endpoint、未标注单位的 fallback、TCP 直连或 `[]` 静默降级都不属于 Hana 的稳定产品契约。

