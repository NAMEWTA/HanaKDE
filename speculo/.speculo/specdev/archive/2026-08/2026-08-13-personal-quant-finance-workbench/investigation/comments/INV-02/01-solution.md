---
artifact: wayfinder-solution-comment
ticket: INV-02
sequence: 1
resolution: answered
---

# Solution: Vibe Research 个人投研闭环与知识沉淀

- **Ticket：** `<Path>{roots.state}/specdev/changes/2026-08-13-personal-quant-finance-workbench/investigation/INV-02-vibe-research.md</Path>`
- **答案：** Vibe-Research 最值得 Hana 采用的是一条“发现异动/资讯 -> 建立同源事实底稿 -> 从相反视角检验解释 -> 形成验证清单 -> 保存并反思”的个人投研认知闭环。它与 TickFlow 的“数据/信号 -> 策略 -> 回测 -> 监控 -> 复盘”不是两个重复产品：前者回答“我为什么相信、还缺什么证据”，后者回答“这个规则在明确假设下是否成立、如何持续验证”。Hana 应让二者共享标的身份、数据快照、研究运行和知识库，而不是复制两套行情、自选、持仓、AI 与导航。Vibe 的证据优先、缺口显式、非荐股主持、运行前成本提示和页面内上下文对话可以采用；市场能力不对称、文本笔记无血缘、私有研报仅归档不检索、浏览器保存密钥、自建 CLI/MCP/FastAPI、假取消和静默失败必须改造或拒绝。
- **事实与来源：** 调查固定在 `d8c80d4ac60e43c1f096c0c486355b19800f16d7`；以 `<Path>temp/finance-references/Vibe-Research/</Path>` 的源码、测试、`README.md`、`VISION.md`、`ROADMAP.md` 和 `LICENSE` 为一手证据。Hana 映射以 `<Path>skills2set/hana-plugin-creator/SKILL.md</Path>`、`<Path>PLUGIN_SDK.md</Path>`、`<Path>PLUGINS.md</Path>`、`<Path>packages/plugin-sdk/README.md</Path>` 与 `<Path>packages/plugin-components/README.md</Path>` 为依据。
- **资产：** `<Path>temp/finance-references/Vibe-Research/</Path>`，<Url>https://github.com/simonlin1212/Vibe-Research</Url>
- **后续 Ticket 所依赖的事实：** INV-03 可复用市场能力矩阵、刷新与失败事实；INV-04 可复用事实底稿、辩论不对称和审计记录要求；INV-05 可复用 host-first 的 Session/Agent/Task/ResourceIO 映射；INV-06 可把来源、时点、缺口与非荐股边界固化为安全契约；INV-07 可直接使用本文与 TickFlow 的互补模型。
- **新浮现的 Tickets：** 无；发现的问题均已被现有 INV-03、INV-04、INV-05、INV-06、INV-07 和 INV-10 覆盖。
- **升级的战争迷雾：** 无；“私有研报 RAG”“多 Agent 拓扑”“任务取消”“数据源许可”分别保留给既有 Ticket，不在本票越权定案。
- **对现有 Tickets 的影响：** update INV-03、INV-04、INV-05、INV-06、INV-07、INV-10；不改变 `<Path>plugins/quant-finance-workbench/</Path>` 的内置 full-access 插件落点。

## 决策摘要

Vibe-Research 证明的是一种有价值的研究纪律，而不是一个应整仓嵌入 Hana 的应用：

```text
每日市场/资讯/自选/持仓触发问题
  -> 选择研究对象与问题
  -> 冻结可追溯的事实底稿，明确数据缺口
  -> 形成独立正反解释，再交叉反驳
  -> 中立汇总共识、分歧、未知项和验证清单
  -> 保存为有父子关系的研究记录
  -> 后续新数据、回测或事件触发复查/反思
```

“AI 给出的结论属于用户模型”不能替代产品安全。系统仍要控制送入模型的数据、保留证据血缘、显示能力缺口、记录成本和失败，并禁止把观点包装成事实或交易指令。

## Research: Vibe Research 的闭环、隐私与 Hana 映射

- **Decision / target：** 决定 Vibe-Research 的旅程、信息架构、隐私与 Agent 交互中哪些应采用、改造或拒绝，并说明它如何与 TickFlow 共用一个 Hana 金融工作台。
- **Scope / version：** Vibe-Research commit `d8c80d4ac60e43c1f096c0c486355b19800f16d7`；Hana 当前工作区公开插件契约。未跟随上游未来提交。
- **Stop condition：** 所有主要页面、核心数据所有权、AI 触发点与关键运行路径有源码证据；市场覆盖、刷新、成本、失败和许可证已记录；形成 adopt/adapt/reject 与互补边界。

### R-001：产品价值是“证据约束的个人研究循环”，不是另一套量化系统

- **Claim：** 上游明确把自己定位为研究框架和客观数据工具，不做回测、因子、策略打分、自动交易、荐股、涨跌预测、目标价或评级；其核心增量是把分散的市场信息变成问题、事实、相反解释和待验证事项。
- **Type：** doc fact + code fact + recommendation
- **Source：** `<Path>temp/finance-references/Vibe-Research/README.md</Path>` 与 `<Path>temp/finance-references/Vibe-Research/VISION.md</Path>` 的定位和边界；`<Path>temp/finance-references/Vibe-Research/backend/chat.py</Path>`、`<Path>temp/finance-references/Vibe-Research/backend/debate.py</Path>`、`<Path>temp/finance-references/Vibe-Research/backend/reflection.py</Path>` 的系统提示和流程约束。
- **Confidence：** high
- **Limits：** 提示词能降低但不能消灭模型越界；页面中展示个股榜单和持仓分析仍可能影响用户决策。
- **Artifact impact：** Hana 将 qualitative research 与 quantitative validation 作为同一工作台的两个模式，禁止各自建立平行数据层和 AI 运行时。

两类闭环的职责应固定为：

| 闭环 | 回答的问题 | 核心产物 | 不负责 |
|---|---|---|---|
| Vibe 式研究认知环 | 我观察到了什么？为什么可能成立？反方证据是什么？还缺什么？ | `ResearchRecord`、事实底稿、观点分歧、验证清单 | 收益证明、策略执行、自动下单 |
| TickFlow 式量化验证环 | 一个明确定义的规则在什么数据和成交假设下表现如何？ | `StrategyVersion`、`BacktestRun`、监控规则、触发记录 | 替用户选择立场、把历史表现当未来承诺 |
| 共享层 | 研究对象和证据如何保持一致？ | `AssetRef`、`UniverseRef`、`DataSnapshot`、`EvidenceRef` | 重复抓取、重复自选、重复持仓 |

双向桥梁应是“研究对象和证据引用”：筛选/回测候选可一键创建研究底稿；研究验证清单可提升为数据刷新、事件或策略监控。研究文本不能直接变成交易动作，量化结果也不能自动变成荐股结论。

### R-002：现有页面串起了高频旅程，但十个一级入口不是 Hana 的目标信息架构

- **Claim：** 上游有每日复盘、资讯雷达、板块、个股、自选、持仓、研报、研究记录、多空辩论和 AI 设置十个一级导航；它覆盖了个人研究素材，但按功能页切割导致上下文频繁丢失，硬编码的热门板块也把 A 股当成默认世界。
- **Type：** code fact + inference + recommendation
- **Source：** `<Path>temp/finance-references/Vibe-Research/frontend/src/router.tsx</Path>`；`<Path>temp/finance-references/Vibe-Research/frontend/src/components/layout/Layout.tsx</Path>`；`<Path>temp/finance-references/Vibe-Research/frontend/src/data/sectors.json</Path>`。
- **Confidence：** high
- **Limits：** 本票没有做用户可用性测试；“上下文丢失”是从路由与存储模型推断，不代表所有用户都会感到困难。
- **Artifact impact：** Hana 页面以“今日 / 研究对象 / 研究运行 / 资料库”四个上下文视图组织，设置进入宿主设置贡献面，不复刻独立 SPA 侧栏。

主要页面与真实能力如下：

| 页面 | 代码事实 | AI 触发 | Hana 结论 |
|---|---|---|---|
| 每日复盘 | 指数、全球指数、自选、市场宽度、短线情绪、成交额榜和板块资金并列展示 | 问 AI、生成当日复盘、保存记录 | adopt 概览；adapt 为可点击证据与同一快照 |
| 资讯雷达 | RSS 按 12 个赛道聚合，支持强制刷新和按赛道/全局生成今日要点 | 用户显式生成摘要并可保存 | adopt 发现入口；adapt 来源健康与去重/引用 |
| 板块中心/详情 | 当前内容来自前端静态 `sectors.json`；路线图承认后端行业 API 尚未接入 | 详情页把静态板块上下文交给 AI | reject 硬编码目录；adapt 为动态主题/行业研究对象 |
| 个股数据 | A 股页面拉取大量行情、估值、资金、股东、公告、新闻等数据；美港韩走精简分支 | 页面作用域问 AI | adopt 对象工作区；必须展示市场能力差异和来源 |
| 自选股 | 只识别六位 A 股代码；可选择 3 秒实时刷新并在页面隐藏时暂停、失败退避 | 无独立研究运行 | merge 到共享 Universe/Watchlist，不做第二份名单 |
| 我的持仓 | 本地 JSON 账本、30 分钟轮询行情，A 股六位代码 | 可把股数、成本、现价、盈亏和汇总发送给 AI | adapt 为“研究上下文账本”；默认不发送敏感字段 |
| 我的研报 | base64 上传、扩展名白名单、25 MB 上限、本地归档、按文件名关键词分类 | 无解析、检索或 RAG | adapt 为 ResourceIO 资料库；不能宣称已有私有知识问答 |
| 研究记录 | localStorage 最多 200 条，仅 id/kind/title/content/ts，可删除/清空 | 对单条文本做反思，再存成新记录 | reject 文本盒子作为权威库；重建血缘化研究记录 |
| 多空辩论 | A 股六位代码；13 项数据底稿；1/2 轮角色流程 | 3/5 次模型调用 | adopt “同源底稿 + 中立清单”；adapt 角色独立性与审计 |
| 接入 AI | 浏览器保存模型、Base URL、API Key 和后端访问密钥 | 全站配置 | reject；使用 Hana 宿主模型、配置、权限与用量 |

推荐的 Hana 页面不是十页缩减版，而是一个上下文工作台：

```text
今日 Today
  市场快照 / 资讯 / 我的观察对象 / 待复查事项

研究对象 Object Workspace
  标的、板块、主题或组合的证据时间线 / 数据缺口 / 研究动作

研究运行 Research Runs
  问答、底稿、观点检验、反思、成本、状态和可取消任务

资料库 Library
  研究记录 / 用户资源 / 导入研报 / 数据快照 / 导出报告
```

### R-003：“A/HK/US”是品牌覆盖，不是同构能力；必须显示市场 x 数据集 x 工作流矩阵

- **Claim：** A 股获得完整数据、工具、持仓、自选和辩论流程；美股/港股主要是个股行情与关键财务，港股另有现金流；韩股只有行情。自选、持仓和辩论仍只接受六位 A 股代码。
- **Type：** code fact
- **Source：** `<Path>temp/finance-references/Vibe-Research/frontend/src/pages/StockData.tsx</Path>`、`Watchlist.tsx`、`Portfolio.tsx`、`Debate.tsx`；`<Path>temp/finance-references/Vibe-Research/backend/gstock.py</Path>`；`<Path>temp/finance-references/Vibe-Research/backend/tools.py</Path>`。
- **Confidence：** high
- **Limits：** 覆盖描述只针对固定提交；不评价上游引用的独立 global-stock-data 项目全部能力。
- **Artifact impact：** Hana 不显示一个笼统的“支持 A/HK/US”开关，而按每个动作做 capability check。

当前能力矩阵：

| 能力 | A 股 | 港股 | 美股 | 韩股 |
|---|---:|---:|---:|---:|
| 主要指数概览 | 完整本地市场概览 | 恒指/恒生科技 | 道指/标普/纳指 | 无 |
| 个股行情 | 是 | 是 | 是 | 是 |
| 关键财务 | 是，多类接口 | 是，另有现金流 | 是，精简指标 | 否 |
| 资金/股东/公告/研报/估值分位等 | 是 | 大多否 | 大多否 | 否 |
| 自选与实时刷新 | 是 | 否 | 否 | 否 |
| 持仓账本 | 是 | 否 | 否 | 否 |
| 多空事实底稿 | 是 | 否 | 否 | 否 |

Hana 的 `AssetRef` 至少要包含 `market/exchange/symbol/asset_type/currency/timezone`，不能再用“六位数字”推断身份。动作按钮在运行前显示 `available / partial / unavailable / stale`，并列出缺少的数据集；禁止把精简全球行情悄悄包装成与 A 股同等研究能力。

### R-004：“只存在本地”和“会不会送入模型”是两套权限，必须分别说明

- **Claim：** 上游把持仓和私有研报放在 `~/.vibe-research`（可由环境变量覆盖），笔记、自选和模型配置放浏览器 localStorage；持仓/研报有从旧仓库缓存复制迁移、锁和原子替换。但用户点击“让 AI 看我的持仓”时，精确股数、成本、现价、浮盈和汇总会进入请求上下文；API 模式再由后端发给用户配置的远程模型。
- **Type：** code fact + privacy recommendation
- **Source：** `<Path>temp/finance-references/Vibe-Research/backend/portfolio.py</Path>`、`myreports.py`；`<Path>temp/finance-references/Vibe-Research/frontend/src/pages/Portfolio.tsx</Path>`、`Settings.tsx`；`<Path>temp/finance-references/Vibe-Research/frontend/src/lib/llm.ts</Path>`、`api.ts`。
- **Confidence：** high
- **Limits：** 模型接收数据发生在用户显式点击后，并非后台偷偷上传；风险在于“本地存储”文案未同时给出字段级 egress 预览和保留策略。
- **Artifact impact：** Hana 设计独立的 storage ownership、model egress 和 external data egress 权限，不用“本地”一词覆盖三者。

建议的数据归属与默认策略：

| 数据 | 权威位置 | 默认模型 egress | 说明 |
|---|---|---|---|
| 自选/研究池 | 插件私有结构化存储，共享一个 Universe | 仅代码和用户选中的公开快照 | 不在多个页面各存一份 localStorage |
| 持仓 | 插件私有加密/受控存储候选；是否需要宿主 secret 能力由 INV-05 确认 | 默认只发暴露度摘要；股数、成本、盈亏逐项显式授权 | 与券商账户、自动交易严格分离 |
| 用户研报 | 原始文件保持 `ResourceRef`；索引和派生片段进插件数据 | 只发送用户选中的片段，并展示文件、页码/段落和字段 | 不默认 base64 复制，不把“归档”冒充 RAG |
| 研究记录 | 插件私有数据库，带迁移和导出 | 当前任务引用的记录和证据片段 | 需要删除、保留期、导出和父子血缘 |
| 模型凭据 | Hana 宿主 provider/config/secret 边界 | 不进入插件页面、日志或研究记录 | 插件不保存第二份 API Key |
| 生成报告 | 插件私有临时/持久目录 -> `stageFile()` | 仅用户选择发布/分享时外流 | 通过 SessionFile 交付，不暴露本地路径 |

每次模型运行前至少展示：将发送的对象、字段类别、来源文件/快照、是否含持仓或私有文档、目标宿主模型、预估成本；允许移除字段后再运行。研究记录保存“发了什么的哈希/引用”，不保存密钥。

### R-005：同一事实底稿和非裁决主持值得采用，但当前辩论并不完全独立也不可复现

- **Claim：** 辩论先收集行情、估值、一致预期、估值分位、财务、K 线、资金、两融、股东、公告、解禁、概念、研报和新闻 13 个 section；速率敏感源串行，其余有限并发；每段截断后形成同一底稿，并列出未取到的数据。中立主持只输出共识、分歧、验证清单和缺口，不给裁决、目标价或买卖建议。
- **Type：** code fact
- **Source：** `<Path>temp/finance-references/Vibe-Research/backend/debate.py</Path>`；`<Path>temp/finance-references/Vibe-Research/backend/tests/test_agents.py</Path>`；`<Path>temp/finance-references/Vibe-Research/frontend/src/pages/Debate.tsx</Path>`。
- **Confidence：** high
- **Limits：** “客观事实”只是接口返回，不保证来源授权、时点一致、字段正确或无供应商错误；这些由 INV-03/INV-06 收紧。
- **Artifact impact：** 采用 dossier-first 和 neutral synthesis，重构观点阶段与运行清单。

当前流程有四个关键缺口：

1. 首轮不对称：多方不看任何先前观点，空方会先看到多方陈述。代码和测试都明确这一点，容易产生锚定；Hana 应先并行生成互相不可见的独立初始观点，再开放交叉反驳。
2. 底稿事件只把 section 标题和工具名送给前端，保存笔记时又只保存角色文本；没有底稿快照、缺口、工具输出、来源、as-of、提示版本、模型、usage 或运行 ID，无法重放。
3. 单个角色失败仍会发 `stage_done(failed: true)`；前端 handler 丢弃 `failed` 字段并把该阶段视为完成，失败占位文本可能作为“完成辩论”保存。Hana 状态必须区分 succeeded/partial/failed/cancelled。
4. 前端中止只 abort HTTP 请求；后端使用同步模型请求，未见把取消信号传到正在执行的 provider 调用。因此“中止即停止计费/计算”没有代码保证，这是高置信推断而非已运行验证。

推荐运行协议：

```text
ResearchRun
  -> freeze DossierSnapshot(source/as_of/quality/missing)
  -> independent perspective A || independent perspective B
  -> optional cross-examination using named claims/evidence
  -> neutral synthesis(consensus/disagreement/unknown/checklist)
  -> evidence audit
  -> immutable run manifest + editable derived note
```

角色不是越多越好。三次或五次模型调用只是成本结构，不是质量证明；INV-04 应基于职责、隔离和评测决定 Agent 拓扑，而不是照抄角色名。

### R-006：上下文问答的交互细节可采用，但工具 trace 需要升级为证据 trace

- **Claim：** 页面内 Ask AI 按 route 和可选 scope 隔离对话，最多保存 40 条消息；切换对象或关闭时中止流，只持久化完整轮次，避免把半截回答当历史。API 模式由模型在最多 6 轮内选择工具，CLI 模式只消费预先打包的 context、不调用工具；页面只显示工具名和关键参数。
- **Type：** code fact + recommendation
- **Source：** `<Path>temp/finance-references/Vibe-Research/frontend/src/components/ui/AskAiButton.tsx</Path>`、`<Path>temp/finance-references/Vibe-Research/frontend/tests/ask-ai-storage.test.mjs</Path>`；`<Path>temp/finance-references/Vibe-Research/backend/chat.py</Path>`、`tools.py`、`cli_runtime.py`。
- **Confidence：** high
- **Limits：** 本次未做真实模型端到端调用；流中断语义只从实现和源码测试判断。
- **Artifact impact：** Hana 采用 scope、完整轮次和中止纪律；工具结果必须形成可追溯 `EvidenceRef`。

值得保留的交互模式：对象级会话、显式建议问题、运行中的工具反馈、失败时保留已完成的证据但不保存伪完整回答、保存为研究记录、关闭/切换时清理过期请求。

需要补强的工具 trace：

```text
invocation_id / tool_name / tool_version
input / started_at / completed_at / latency
source / fetched_at / as_of / quality_flags
output_snapshot_id / output_hash / truncation
error / fallback / cost_or_usage
```

上游 `trace` 只有工具名和参数，工具结果又会截断到约 6000 字符；它适合给用户看“正在查什么”，不足以证明回答依据。Hana 页面应让正文中的事实跳回工具结果或原始 ResourceRef，而不是另存一份不可核对的 Markdown。

### R-007：现有“研究记录”和“反思审计”尚未形成知识沉淀

- **Claim：** Note 只有 `id/kind/title/content/ts`，最多 200 条，没有编辑、搜索、标签、研究对象、父记录、证据、模型、提示、工具、来源或版本。反思只读取一段文本，超过 12000 字截断，调用模型一次；它不能访问原事实底稿核验内容。保存反思时创建一条新 Note，未保存父记录 ID。
- **Type：** code fact + inference
- **Source：** `<Path>temp/finance-references/Vibe-Research/frontend/src/lib/notes.ts</Path>`、`pages/Notes.tsx`、`lib/agents.ts`；`<Path>temp/finance-references/Vibe-Research/backend/reflection.py</Path>`、`tests/test_agents.py`。
- **Confidence：** high
- **Limits：** 语言模型仍可发现部分逻辑跳跃；结论是它不能证明事实真假，而不是反思功能毫无价值。
- **Artifact impact：** 将“笔记”降为研究运行的可编辑视图，权威记录是带证据血缘的 `ResearchRecord`。

反思应分成两层：

1. **推理审计：** 找混淆事实/推断、单因果、过度外推、选择性证据、反方缺失和不可证伪表述。
2. **证据审计：** 对每个可核验 claim 回到 snapshot/tool/resource，标注 supported/contradicted/stale/unverifiable，并生成下一步验证任务。

建议的最小记录对象：

```text
ResearchRecord {
  id, kind, subject_refs[], question, status,
  created_at, updated_at, parent_id, supersedes_id,
  content, claims[], assumptions[], gaps[], validation_checklist[],
  evidence_snapshot_ids[], resource_refs[],
  run_id, prompt_template_version, model_identity,
  tool_invocations[], usage, privacy_scope
}
```

用户可以编辑观点，但原始运行清单和证据快照不可被静默覆盖；新观点应通过 `supersedes_id` 或 revision 形成时间线。私有研报只有在解析、索引、片段引用和删除传播都实现后，才能标记为“可检索知识”，当前上游只是文件归档。

### R-008：刷新、缓存和失败降级有可取纪律，但缺少统一来源健康与新鲜度协议

- **Claim：** 市场概览使用进程内 5 分钟 TTL 且不缓存空结果；自选实时模式 3 秒轮询、页面隐藏暂停、失败指数退避到 30 秒；资讯雷达并发抓 RSS 并原子写缓存，但非 force 请求会无限读取已有缓存，没有 TTL；持仓页面每 30 分钟拉取，而后端所谓 scheduler 只刷新时间戳，实际行情在读取持仓时获取。
- **Type：** code fact + recommendation
- **Source：** `<Path>temp/finance-references/Vibe-Research/backend/market.py</Path>`、`newsradar.py`、`portfolio.py`；`<Path>temp/finance-references/Vibe-Research/frontend/src/pages/Watchlist.tsx</Path>`、`Portfolio.tsx`。
- **Confidence：** high
- **Limits：** INV-03 将进一步审计具体上游数据源、条款、限流和备用源；本票只记录消费层行为。
- **Artifact impact：** Hana 用一套 `DataSnapshot/SourceHealth/RefreshPolicy` 和宿主 TaskRegistry，不移植多个隐式计时器或假 scheduler。

最低刷新协议：

```text
dataset + provider + fetched_at + as_of
ttl + market_calendar + manual_refresh_allowed
last_success + last_attempt + last_error
completeness + stale_reason + next_retry
cache_hit + fallback_source + rate_limit_state
```

上游已有一些正确方向：空结果不污染缓存、RSS 原子替换、数据块区分加载与暂不可用、实时模式用户 opt-in、页面隐藏暂停、退避保护数据源。需要拒绝的是多个页面静默 `.catch(() => {})` 后让板块消失、把陈旧缓存继续当“今日”、以及 UI 显示已刷新而底层只改时间戳。部分可用要成为一等状态，不等于成功，也不等于整页失败。

### R-009：Hana 必须消费宿主能力，不嵌入 Vibe 的第二套平台

- **Claim：** 上游是一套 React/Vite + FastAPI 应用，自建 CORS、可选 Bearer Key、OpenAI-compatible 请求、本地 CLI 子进程、MCP stdio、文件归档和定时线程。Hana 已有页面、route、network、configuration、model sampling、plugin-private Session/Agent、ResourceIO、SessionFile、usage 与 TaskRegistry 契约。
- **Type：** code fact + Hana code/doc fact + recommendation
- **Source：** `<Path>temp/finance-references/Vibe-Research/backend/app.py</Path>`、`chat.py`、`cli_runtime.py`、`mcp_server.py`；Hana `<Path>skills2set/hana-plugin-creator/SKILL.md</Path>`、`<Path>PLUGINS.md</Path>` 与 `<Path>PLUGIN_SDK.md</Path>`。
- **Confidence：** high
- **Limits：** 具体长任务恢复、取消、流式 route 和大文档索引能力仍由 INV-05 做运行验证。
- **Artifact impact：** `<Path>plugins/quant-finance-workbench/</Path>` 采用 host-first topology；任何宿主契约无法表达的能力必须显式降级、外置或另立系统 change。

建议的初步映射：

| Vibe 能力 | Hana contribution/runtime | 约束 |
|---|---|---|
| 今日、对象、运行、资料库工作区 | 一个 `page` + plugin SDK/components | 不带独立路由壳和十项侧栏 |
| 行情、资讯、底稿、研究记录 API | `routes/` | iframe 用 `hana.api.fetch()`；route 用 `ctx.network.fetch()` 与 allowedHosts |
| 查市场、建底稿、审计研究、生成报告 | `tools/` | 输入输出有 schema、permission、副作用与 EvidenceRef |
| 简短摘要、分类、claim 提取 | `sampleText()` | 使用宿主 utility model 与 usage |
| 连续问答、复杂研究、观点检验 | plugin-private Session/Agent + `chat.surface` 候选 | 显式 session 身份、权限、历史、abort；最终拓扑由 INV-04 |
| 资讯/数据刷新、底稿、长研究运行 | TaskRegistry 候选 | 服务端 run_id、进度、恢复、真正取消；INV-05 验证 |
| 用户研报和导入数据 | `ResourceRef` + `ctx.resources` | read/search/watch；第三方库确需路径时才 materialize |
| 导出研究报告 | `stageFile()` / SessionFile | 不返回本地路径，不自己造下载协议 |
| 持仓、索引、研究记录、run manifest | `ctx.dataDir` + schema/migration | 明确保留、清除、备份、并发与原子性 |
| provider 偏好和数据源 Key | plugin configuration/secret | 不进 iframe asset/localStorage；服务端读取 |
| 模型与成本 | Hana provider/session/usage | 不再要求用户配置第二套模型 Key |

尤其应拒绝上游 CLI runner。它会以临时 cwd 启动 `claude/qwen/deepseek/codex`，但继承整个 `os.environ`；Qwen 使用 `--yolo`，DeepSeek 使用 `--auto`。临时目录不能隔离用户环境变量、HOME 中的凭据或子进程能力。Hana 插件已有受控模型与 Session，不应再启动具有自治参数的本机 CLI。

MCP 也不应成为内置插件内部的第二条工具总线。所需数据能力直接注册 Hana tools；若未来希望把金融工具导出给外部 MCP 客户端，那是独立的外部集成决策，不是插件核心运行路径。

### R-010：成本披露值得采用；部署、许可证与文档漂移阻止整仓复制

- **Claim：** 上游在运行辩论前披露一轮约 3 次模型调用、100-120 秒和约 3-4 万输入 token，两轮约 5 次调用和约 3 分钟；底稿约 35 秒、13 个公开接口。反思为一次调用并截断超长输入。仓库为 MIT License，但数据接口、RSS、研报内容和模型服务有各自条款与费用。
- **Type：** doc fact + code fact + recommendation
- **Source：** `<Path>temp/finance-references/Vibe-Research/README.md</Path>`、`LICENSE`；`<Path>temp/finance-references/Vibe-Research/frontend/src/pages/Debate.tsx</Path>`；`<Path>temp/finance-references/Vibe-Research/backend/debate.py</Path>`、`reflection.py`。
- **Confidence：** high for repository facts; estimates are upstream observations, not guarantees
- **Limits：** 时间、token 和价格取决于模型、网络、缓存、provider tokenizer 和上下文；本调查不是法律意见。
- **Artifact impact：** Hana 在启动前给出预算，在运行后记录实际 usage；复用实质 MIT 代码须保留 notice，数据 provider 和用户文档逐项记录授权/条款。

成本 UI 应从硬编码经验值升级为：预计工具请求数、预计模型阶段、上下文上限、预算/超限策略、是否含私有数据；运行后展示实际 usage、缓存命中、失败阶段和是否仍可能产生后台费用。

已确认的 README/代码或代码内部漂移：

1. `backend/app.py` 和后端 README 称“只读、无状态”，但持仓、私有研报、资讯缓存和多个进程内缓存都会写入或保存状态。
2. 每日复盘页面展示指数、情绪、成交额和板块资金，但 `runReview` 明确打包给模型的只有指数摘要；CLI 路径又不能调用工具，因此文案“把当天客观数据打包”夸大了实际上下文。
3. 板块中心来自静态 JSON；`ROADMAP.md` 明确后端 `/api/industry` 尚未接入前端，不能把静态知识卡当实时板块研究。
4. `market.py` 的 `_emotion` docstring 仍写“零个股名”，当前实现和注释已经返回连板股清单，属于代码内部文档陈旧。
5. `pf.start_scheduler(1800)` 被描述为后台刷新持仓数据，但线程只更新时间字段；实时价格仍在 `get_portfolio()` 请求时拉取。
6. “本地保存”对存储位置成立，但在 AI 动作中选定上下文会发送给模型；产品必须同时披露 egress，不能让用户从“本地”推断“永不离开设备”。

## Adopt / Adapt / Reject 总表

| 能力/设计 | 结论 | 理由 | 依赖与主要风险 |
|---|---|---|---|
| 发现 -> 底稿 -> 正反检验 -> 清单 -> 沉淀闭环 | adopt | 补齐量化工具不擅长的认知审计 | 必须共享 DataSnapshot/EvidenceRef |
| 每日概览与资讯雷达 | adapt | 是高频触发器，不应成为孤立门户 | 来源许可、去重、新鲜度、动态主题 |
| 同一事实底稿与显式数据缺口 | adopt | 限制角色凭空补事实 | 需要时点、来源、质量和不可变快照 |
| 中立主持不判输赢，只产验证清单 | adopt | 保留用户判断并减少荐股包装 | 提示词外还要结构化输出校验 |
| 首轮多方后空方的顺序 | reject | 初始观点不独立，存在锚定 | 改为独立并行后再交叉反驳 |
| 运行前成本/时间提示 | adopt | 用户能判断是否值得启动 | 用实际 usage 回填，不把估算当保证 |
| route/scope 级对话、完整轮次持久化、切换中止 | adopt | 减少对象串线与半答案污染 | 中止必须传播到真实 provider/task |
| 工具名和参数 trace | adapt | 有可见性但不足以审计 | 增加结果快照、hash、来源、时点、错误、usage |
| localStorage 笔记作为知识库 | reject | 无血缘、查询、迁移与并发契约 | 改为 ResearchRecord + revision + EvidenceRef |
| 纯文本反思 | adapt | 能检查推理表达，不能核验事实 | 增加 claim-to-evidence 审计和父记录 |
| 私有研报本地归档 | adapt | 数据归属方向正确，现状没有 RAG | ResourceIO、解析、引用、删除传播、格式安全 |
| 本地持仓作为研究上下文 | adapt | 个性化价值高且敏感 | 字段级 egress、默认摘要、绝不接自动下单 |
| A/HK/US 品牌级统一 | reject | 实际能力高度不对称 | market x dataset x workflow capability matrix |
| 静态热门板块和十个一级页面 | reject | 把特定市场偏好固化为 IA | 动态对象与上下文工作台 |
| 5 分钟空结果不缓存、实时 opt-in/暂停/退避 | adopt | 对用户和数据源都更稳健 | 统一 SourceHealth/RefreshPolicy |
| 无 TTL 资讯缓存、静默 catch、假 scheduler | reject | 会制造“看似更新/看似完整” | 部分失败和陈旧必须可见 |
| 自建 FastAPI/CORS/Bearer auth | reject | 与 Hana route/身份重复且扩大攻击面 | 使用宿主 surface session 与 route context |
| 浏览器 API Key/Base URL | reject | secret 暴露给页面并复制配置面 | 使用 Hana provider/config/secret |
| 本机 CLI 子进程和自治参数 | reject | 继承环境与凭据、取消和权限不可控 | 使用宿主 model/Session/Agent |
| MCP 作为插件内部工具总线 | reject | 与 Hana tools 重复并形成双轨审计 | 外部导出需求另立集成决策 |
| MIT 源码整体复制 | reject | 产品壳、运行时和数据边界不匹配 | 重构设计原则；实质复制保留 notice |

## 与 TickFlow 合并后的推荐闭环

最终产品不应呈现“Vibe 页面组 + TickFlow 页面组”，而应围绕一个研究对象贯穿：

```text
Today 发现异动/资讯
  -> Object Workspace 打开标的、板块、主题或组合
  -> 事实底稿引用统一 DataSnapshot
  -> 研究模式：独立观点、反思、私有资料引用、验证清单
  -> 量化模式：声明式假设、筛选、回测、样本外、监控
  -> Evidence Timeline 汇合事实、观点、运行、告警和新证据
  -> 新证据触发复查，但不自动生成交易动作
```

共享且只能有一份的对象：`AssetRef`、`Universe/Watchlist`、`PortfolioContext`、`DataSnapshot`、`EvidenceRef`、`ResearchRecord`、`TaskRun`、provider 配置与 usage。Vibe 式持仓只是研究上下文；TickFlow 式 portfolio backtest 是模拟结果；两者必须命名区分。首版也无需声称“全市场全能”：全能应指对象和证据可跨阶段流动、能力缺口透明，而不是每个市场都有同样多的卡片。

## Verification

- 固定提交和主仓 `LICENSE` 已核验；研究 clone 在调查结束前保持 clean，未安装依赖、未改源码。
- 执行 `node --test frontend/tests/*.test.mjs`：15 个测试项中 14 个通过；`ask-ai-markdown.test.mjs` 因 clone 未安装 `react-markdown` 而在加载阶段失败。通过项覆盖对话按路由/对象隔离、40 条上限、异常存储容错、清除、切换 abort、partial turn 不持久化等源码契约；这不是完整前端验证。
- 本票未调用真实行情源或模型，避免把易变外部状态误当固定源码事实；数据源稳定性与合规留给 INV-03。

## Conflicts and Unknowns

- 私有研报解析、全文索引、引用定位、OCR、删除传播和大文件预算尚无 Hana 选型，由 INV-05/INV-10 决定；当前不得承诺“本地 RAG”。
- Agent 的数量、隔离、并行、预算和评测标准由 INV-04 决定；本票只要求底稿一致、初始观点独立、运行可追溯。
- Hana 对长研究任务的重启恢复、取消传播、route streaming 和 usage 读取权限需 INV-05 实测。
- A/HK/US 的合法 provider、字段质量、频率、价格和再分发条款由 INV-03/INV-06 核验。
- 持仓是否需要额外加密、系统 keychain 或更窄的插件权限仍需宿主能力核验；在结论前默认不导入券商凭据。

## Recommendation

后续综合和 Spec 以四条原则约束 Vibe 式能力：

1. **事实、观点、验证分层：** 每个结论都能回到证据；模型输出永远是观点或推断，不因多角色一致而升级为事实。
2. **本地不等于不外发：** 存储所有权、模型 egress、外部数据请求分别授权和记录，私有持仓/研报默认最小披露。
3. **一个对象、一套底稿、两个研究模式：** Vibe 与 TickFlow 共享身份、快照、任务和知识库，只在研究方法上分工。
4. **宿主优先且失败可见：** 页面、身份、模型、Agent、Session、ResourceIO、网络、任务、usage 和文件交付全部优先使用 Hana；缺数据、陈旧、部分失败、取消未完成和成本超限都必须成为用户可见状态。
