# Personal Quant Finance Workbench

**首要市场**：当前 change 的首要市场范围是中国 A 股和港股；市场、数据集和工作流的能力必须分别标记，不得默认为同构支持。
_Avoid_: A/HK/US 全市场同等支持

**相对完整首版**：首版目标是可直接上线的相对完整内置插件，研究、量化、持仓、实时性和自动化能力进入同一产品路线；完整入口不代表未经质量/许可/PIT 验证的模块可以标记为 supported。
_Avoid_: 以最小证据切片冒充最终产品；把功能入口数量当作数据质量保证

**首版数据复用**：首板必须认真研究并尽可能复用四个参考项目的数据源获取、缓存、限流、失败和降级逻辑；复用行为不等于复制未经验证的端点或第三方条款。
_Avoid_: 整仓复制；HTTP 200 或空数组即视为可信数据

**个人资料与持仓范围**：个人资料和持仓进入首版产品范围；具体形态已确认是本地手工/文件导入账本、研究笔记和私有研报引用，不包含券商 credential、自动同步或下单。
_Avoid_: 把持仓账本等同于券商账户或下单权限

**实时与自动化范围**：首版支持交易时段 live quote、可配置刷新频率、stale 标识、可暂停/恢复监控和定时研究任务；不承诺 tick 级、后台永久运行或券商级告警送达。
_Avoid_: 把 live refresh 等同于 tick feed；把告警记录等同于送达保证

**AI 外发默认**：AI 默认关闭；确定性数据路径必须独立可用。公开证据、持仓、成本、笔记和私有研报按用户选定字段、目标模型和预算逐次预览与授权外发。
_Avoid_: 本地存储等于不会外发；模型完成等于金融事实

**A/HK 出厂数据源**：首版采用内置多源适配器和能力探测；通过条款、质量、单位、时点和语义门的 provider 才标记 supported，其他源以 experimental/unavailable/blocked 显示；用户可以配置合法 provider 或导入文件。
_Avoid_: 以仓库代码许可证推导第三方数据许可；以 HTTP 200 或空数组推导数据正确

**本地持仓账本**：首版支持手工/文件导入的持仓、成本、股数、P&L、笔记和私有研报引用；不接券商 credential、自动同步或下单。原始文件归 ResourceIO，派生索引归插件私有数据。
_Avoid_: 持仓账本等于券商账户；P&L 等于可交易能力

**市场时段自动化**：首版支持交易时段 live quote、可配置刷新频率、stale 标识、可暂停/恢复监控和定时研究任务；不承诺 tick 级、后台永久运行或券商级告警送达。
_Avoid_: UI abort 等于强取消；任务记录等于通知送达

**Agent 分层授权**：公开数据只读分析和一次性草稿可以自动化；创建长期任务、读取个人资料、模型外发、通知和写入用户文件必须用户确认；交易、仓位、券商和资金动作永久禁止。
_Avoid_: 自动分析等于自动执行；一次授权永久覆盖所有私有资料

**首版全模块上线**：首版必须包含 A/HK 行情与 K 线、资产/自选、财务/公告/研报/新闻、筛选/因子、回测、监控/告警、组合/持仓、Agent 研究和导入导出。每个模块必须有用户可见入口、正常/部分/失败/取消状态和替代路径；具体市场/数据集/provider 可以标记 `supported/partial/experimental/unavailable`，但不得隐藏模块或将不可用结果伪装成可信结论。
_Avoid_: 以分阶段路线删除首版模块；以“全部上线”取消质量、许可、PIT、成本和隐私门禁

**插件实现目录**：本 change 的生产实现严格限定在 `<Path>plugins/finance-workbench/</Path>`；manifest、UI、路由、工具、任务、数据适配器、私有数据和测试 fixture 均属于该插件目录。若需要宿主 SDK 之外的能力，另开 system change，不得把金融实现写入 HanaKDE 本体或其他插件。
_Avoid_: 使用 `quant-finance-workbench` 作为新实现目录；通过修改 core/server/shared 绕过插件边界

**同花顺官方 Provider**：`hithink-rest` 是首版内置的 BYOK A 股 provider adapter；用户配置 API Key 且逐数据集 capability probe 通过后，它成为适用 A 股数据集的出厂优先来源，不承担港股、分钟 K 或新闻/公告/研报原文能力。
_Avoid_: 全局同花顺数据源；把有效 API Key 等同于所有 capability 均获授权

**数据源策略**：每个 market x dataset x workflow 使用 `auto | pinned` 的 SourcePolicy。`auto` 只在身份、字段、单位、复权、日历、PIT 和质量语义等价时允许有记录的 fallback；`pinned` 只使用用户指定来源。
_Avoid_: 单一全局数据源开关；无记录的静默 fallback

**运行来源清单**：ResearchRun 和 BacktestRun 启动时冻结 provider、adapter version、schema hash、snapshot lineage 与 SourcePolicy version；运行中来源失败时暂停或新建 run，不静默换源。
_Avoid_: 用不同来源继续同一个研究或回测 run；混合未知 lineage

**同花顺本地历史源**：`hithink-market-dump` 是基于官方 Market Dumps 和插件私有 Node DuckDB 的候选本地 source kind；只有跨平台打包、同步、复权、质量、磁盘和卸载原型全部通过后才能标记 supported。
_Avoid_: 逐股 REST 拉取全市场历史；复制或拉起 Python marketdb/CLI 子进程
