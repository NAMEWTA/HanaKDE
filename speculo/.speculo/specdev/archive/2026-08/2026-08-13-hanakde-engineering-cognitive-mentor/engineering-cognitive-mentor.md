---
schema_version: 1
artifact: engineering-cognitive-mentor
change: 2026-08-13-hanakde-engineering-cognitive-mentor
status: completed
primary_mode: codebase
secondary_modes: [architecture, domain-learning]
current_phase: closed
understanding_status: accepted-summary
started_at: 2026-08-13T00:00:00+08:00
updated_at: 2026-08-25T22:39:44+08:00
closed_at: 2026-08-25T22:39:44+08:00
last_mlog_id: MLOG-003
next_question: null
---

# 工程认知导师记录：HanaKDE 全项目教学

> **工件职责：** 本文是当前 change 的教学导航、lead 综合、证据索引和恢复入口。它不替代项目行为、架构或执行工件。

## 1. 会话与研究契约

- **用户目标：** 通过从全貌到细节、从横向业务域到纵向调用链的 Markdown 文档，系统学习 HanaKDE 的设计思路、架构边界和代码实现。
- **期望输出：** 一份总览和多份按业务域深入的教学文档，包含 Why、主链路、关键符号、测试地图、边界和待验证项。
- **成功标准：** 文档可按推荐顺序阅读；每个关键结论有项目相对 Path、符号或测试证据；域卷之间有清晰交叉引用；不把静态推断写成运行事实。
- **研究范围：** 当前 commit 下的 `core/`、`server/`、`hub/`、`lib/`、`shared/`、`desktop/`、`packages/`、`plugins/`、`skills2set/`、`cli/`、`tests/`、构建配置和现有架构文档。
- **不处理范围：** 不修改项目代码、测试、配置或 `docs/`；不运行项目命令、测试、构建或诊断实验；不形成实现 Ticket。
- **主模式：** codebase
- **次模式与顺序：** architecture → domain-learning；先总图与启动，再分层域卷，再跨域业务流与测试地图。
- **版本/分支/Commit/查询日期：** `hanakde` / `1d2d0711fea31db022982d881de51daf60d8d588` / 2026-08-13。
- **关键约束：** 事实、推断、假设、待验证分开；所有项目引用使用 `<Path>...</Path>`；并行 agent 只写各自附件。
- **权威输入：** `<Path>{roots.state}/specdev/changes/2026-08-13-hanakde-engineering-cognitive-mentor/source.md</Path>`、`<Path>README.md</Path>`、`<Path>docs/index.md</Path>`、当前源码与测试。

## 2. 用户当前认知模型

### 已经知道

- HanaKDE 是一个包含 Electron、React、独立 Server、Agent 引擎、Hub、插件平台和多种横切能力的个人 AI 工作台。
- 希望通过教学文档而不是一次性答案建立长期可复述的项目心智模型。

### 当前判断或倾向

- 希望按实际业务域使用 agent team 并行深入。
- 已确认所有教学文档先落在 change 工件，不同步到项目 `docs/`。

### 困惑与不确定点

- 各层的真实所有权、启动顺序、调用链、数据边界和 Why 尚需通过域卷逐步建立。

### 已纠正的误解

- 暂无。

## 3. 执行摘要

Lead 静态勘察表明，HanaKDE 是一个以独立 Server 为运行中枢的多进程桌面系统：Electron 是受控客户端和宿主，`server/` 负责传输、组合、鉴权和生命周期，`core/` 通过 `HanaEngine` 组织领域管理器，`hub/` 负责后台调度与消息路由，`lib/` 与 `shared/` 提供资源、安全、记忆、知识、Provider、Bridge 和自动化基础，`packages/` 与 `plugins/` 构成可扩展协议和运行时。

当前最重要的教学原则是“总图 + 域卷 + 跨域业务流”：`core`、`server`、`hub` 各自成卷，但由独立的业务流文档串联；`desktop` 按客户端/宿主视角教学拆分，不把认知拆分误写成代码重构。

## 4. 全局地图与主链路

### 全貌

```text
Electron main/preload/React
          ↓ HTTP + WebSocket
Server composition + auth + routes
          ↓
HanaEngine facade + Managers
          ↓
Hub routing/scheduler/event bus
          ↓
Pi SDK / tools / ResourceIO / memory / knowledge / bridges
          ↓
SQLite, JSONL, workspace resources, external providers
```

### 主链路

典型桌面 Prompt：`desktop` 连接 Server → `server/routes/chat.ts` 建立连接与上下文 → `Hub.send` 选择 owner/guest/automation 分支 → `HanaEngine` 的 SessionCoordinator 与 Pi SDK 执行 → EventBus/stream store → WebSocket 回放和 React store 更新。

后台自动化则从 `Hub.scheduler` 进入 `engine.executeIsolated`；外部平台消息从 Bridge adapter 进入 session identity 和 `BridgeSessionManager`；资源编辑从 ResourceIO 的引用、权限、版本和 provider proof 进入审计与事件流。

### 关键边界

- `server/` 是传输与组合 owner，不是主要业务状态 owner。
- `core/engine.ts` 是 facade/assembly root，具体状态属于 Manager 和领域模块。
- `hub/` 是编排与投影层，Channel/DM 与 Bridge transcript 的持久化真相在对应 store/manager。
- `desktop/` 是受控客户端和插件 UI 宿主，不是插件业务真相源。
- ResourceIO、PathGuard、Permission、Provider registry 是上层必须通过的稳定缝合点。

## 5. 事实、推断、假设与待验证

| ID | 类型 | 陈述 | 来源或推导 | 状态/影响 |
|---|---|---|---|---|
| F-001 | 事实 | Server 由 `server/main-full.ts`/`main-open.ts` 选择静态组合，并由 `server/index.ts` 的 `startServer` 启动。 | `<Path>server/main-full.ts</Path>`、`<Path>server/main-open.ts</Path>`、`<Path>server/index.ts</Path>` | 已确认 |
| F-002 | 事实 | `HanaEngine` 持有多个 Manager，并负责初始化与逆序释放。 | `<Path>core/engine.ts</Path>` | 已确认 |
| F-003 | 事实 | Hub 通过 EventBus、Router、Scheduler 和 AgentExecutor 处理消息与后台任务。 | `<Path>hub/index.ts</Path>`、`<Path>hub/event-bus.ts</Path>`、`<Path>hub/scheduler.ts</Path>` | 已确认 |
| F-004 | 事实 | Plugin surface 使用 iframe ticket、surface session、asset session 和 postMessage 校验。 | `<Path>server/routes/plugins.ts</Path>`、`<Path>packages/plugin-sdk/src/index.ts</Path>`、`<Path>desktop/src/react/plugin-ui/plugin-ui-host-controller.ts</Path>` | 已确认 |
| I-001 | 推断 | Server 是 transport/composition/lifecycle coordinator，而非领域真相源。 | 由 F-001、F-002 及 route/composition 结构推导 | 需在域卷中继续解释 |
| I-002 | 推断 | ResourceIO 是用户资源的统一 authority，SessionFile 是面向多客户端的交付身份。 | `<Path>lib/resource-io/</Path>`、`<Path>lib/session-files/</Path>`、`<Path>README.md</Path>` | 需阅读安全与资源卷 |
| V-001 | 待验证 | 真实 packaged Electron spawn 变体与完整 server readiness 细节仍需进一步静态追踪。 | Lead 与 agent 报告共同标记 | 不阻塞文档生成，必须明确标记 |
| V-002 | 待验证 | Provider registry 多实例缓存隔离、知识索引 rebuild、Dream journal、Cron dispatch 的真实崩溃行为尚未运行验证。 | agent 静态报告 | 当前不运行项目命令 |

## 6. 核心机制与 Why

### 背景与约束

系统同时服务桌面、CLI、移动/PWA、远程连接、Bridge 和插件 UI，因此不能让每个客户端各自实现会话、资源身份、权限和流式协议。

### 机制

通过 Server 统一传输与鉴权，Core facade 统一生命周期，Hub 统一后台编排，ResourceIO/SessionFile/Plugin protocol 提供跨客户端稳定身份，具体领域实现留在 `lib/` 与对应 Manager。

### 结果与影响

调用者可以沿稳定接口阅读和替换实现；代价是启动组合、权限证明、事件恢复和多进程边界较复杂，必须按主链路阅读而不是平均浏览文件。

### 设计原因

这套分层使 Electron、CLI、Bridge 和插件可以共享 Server/Core 能力，同时把 OS 权限、网络、文件资源和模型 Provider 的风险集中在可审计的接缝处。

### 代价与边界

静态源码可以说明结构与因果，但不能证明运行时启动成功、崩溃恢复或跨平台行为；这些内容在教学文档中保留为待验证，不执行命令补证。

## 7. 候选方案与技术栈比较

| 方案 | 核心思路 | 适用约束 | 优点 | 代价/风险 | 迁移与回滚 | 反转条件 |
|---|---|---|---|---|---|---|
| 按目录各写一篇 | `core/server/lib/...` 一目录一卷 | 只需索引目录时 | 易定位 | 业务流被切碎，重复解释所有权 | 不涉及代码 | 如果用户只需要文件导航而非因果学习 |
| 总图 + 域卷 + 业务流（当前推荐） | 分层文档与跨域主链路并存 | 需要系统学习和源码研究 | 同时支持横向与纵向阅读，减少重复 | Lead 需要维护交叉引用 | 仅改变教学工件，不影响代码 | 如果文档规模必须极小 |
| 只写端到端案例 | 从 Prompt/Bridge/Automation 反推架构 | 只需快速上手时 | 直观 | 横切基础和模块职责难以建立 | 不涉及代码 | 如果用户不需要理解设计取舍 |

### 当前推荐

在当前“全面、层层阅读、从浅到深”的目标下，推荐“总图 + 域卷 + 业务流”。它保留 `core`、`server`、`hub` 的独立所有权，又用业务流解释真实调用方向。

### 不选其他方案的原因

纯目录文档会把系统误读成静态文件树；纯案例文档会隐藏 ResourceIO、权限、持久化和插件协议等决定行为的基础。

### 仍依赖的假设

假设用户接受只读源码研究和静态证据，不要求本 change 运行项目或生成可执行示例。

## 8. 模式专项分析

本 change 以 `codebase` 为主，辅以 `architecture` 和 `domain-learning`。教学顺序为：总览与启动 → Core/Server/Hub → Shared/Lib → Desktop/Plugin → 跨域业务流 → 测试阅读地图。

## 9. 已确认决定与理解变化

| ID | 类型 | 结论 | 原因 | 来源 | 替代关系 | 影响工件 |
|---|---|---|---|---|---|---|
| D-001 | 决策 | 教学文档全部落在当前 change 的 Speculo state。 | 用户已确认，符合 E Work 非执行边界。 | USER-DECISION:2026-08-13 | 不同步项目 `docs/` | 主报告、teaching/ |
| D-002 | 决策 | 使用 3 个域 agent 并行，Lead 负责跨域汇总。 | 业务域可独立读取，且最终需要统一业务流。 | USER-REQUEST:agent team | 不按每个目录机械拆分 | teaching/、主报告 |

## 10. 未决问题与待验证项

| ID | 问题 | 为什么重要 | 所需信息/证据 | 是否阻塞 | 建议归属 |
|---|---|---|---|---|---|
| Q-001 | packaged Electron spawn 与 server readiness 的完整静态链路 | 影响启动教学的因果闭环 | `<Path>desktop/main.cjs</Path>`、`<Path>desktop/bootstrap.cjs</Path>`、`<Path>server/bootstrap.ts</Path>` 继续交叉阅读 | 否，已延后；不影响教学导出完成 | 后续独立教学 change |
| Q-002 | Provider registry 与 Pi transport 的多实例隔离 | 影响模型接缝和测试解释 | registry、Pi SDK facade、相关测试 | 否，已延后；不影响当前架构地图 | 后续独立教学 change |
| Q-003 | Knowledge rebuild、Dream、Cron 在崩溃/重启下的真实行为 | 影响恢复语义是否能从静态代码得到验证 | 后续项目运行或专门诊断 Work | 否，已延后；静态报告不宣称运行时已验证 | 后续诊断或教学 change |

## 11. 理解确认

- **状态：** accepted-summary
- **导师最终总结：** 11 篇附件已形成“总图 → 启动 → Core/Server/Hub → Shared/Lib → Desktop/Plugin → 跨域业务流 → 测试地图”的静态教学闭环；系统以 Server/Core/Hub 组织运行与编排，以 ResourceIO、权限、持久化和插件协议作为跨客户端稳定接口。静态证据说明结构与 Why，但不替代运行时验证。
- **用户复述或确认：** 用户在 2026-08-25 要求完成全部 change 并声明审批默认通过，按“只取文档/跳过独立复述”记录为 accepted-summary；这不构成用户已完全理解的证据。
- **仍不清楚/不同意：** 未收集独立复述；Q-001～Q-003 明确延后且不阻塞教学工件完成。
- **是否还有其他问题：** 当前关闭指令未提出其他教学问题；后续问题以新 change 恢复，不改写本归档历史。

## 12. 后续路线与移交

- **下一焦点：** 无；本教学会话已按用户的全量收尾指令关闭。
- **下一 Work：** `<Path>{roots.workflows}/specdev/A-archive-and-consolidate/A-archive-and-consolidate.md</Path>`
- **移交原因：** 教学导出、证据索引、最终综合和诚实理解状态已闭环，无远程 reconcile。
- **恢复说明：** Q-001～Q-003 如需继续，创建新 change 并引用本报告；归档后不改写历史。

## 13. 教学附件索引

| 顺序 | 文档 | 内容 |
|---|---|---|
| 00 | `<Path>{roots.state}/specdev/changes/{change}/teaching/00-overview-and-architecture-map.md</Path>` | 全局地图、术语、依赖方向、阅读顺序 |
| 01 | `<Path>{roots.state}/specdev/changes/{change}/teaching/01-runtime-lifecycle-and-cli.md</Path>` | 启动、ready、端口、CLI、shutdown |
| 02 | `<Path>{roots.state}/specdev/changes/{change}/teaching/02-core-engine-and-session.md</Path>` | Engine、Manager、Agent、Session、模型与执行 |
| 03 | `<Path>{roots.state}/specdev/changes/{change}/teaching/03-server-http-websocket.md</Path>` | Composition、Hono、鉴权、HTTP/WS、chat |
| 04 | `<Path>{roots.state}/specdev/changes/{change}/teaching/04-hub-orchestration.md</Path>` | EventBus、Scheduler、Router、AgentExecutor |
| 05 | `<Path>{roots.state}/specdev/changes/{change}/teaching/05-shared-persistence-resource-security.md</Path>` | contracts、ResourceIO、持久化、沙箱、权限 |
| 06 | `<Path>{roots.state}/specdev/changes/{change}/teaching/06-lib-domain-capabilities.md</Path>` | Memory、Knowledge、Provider、Bridge、Desk、Loop |
| 07 | `<Path>{roots.state}/specdev/changes/{change}/teaching/07-desktop-electron-react.md</Path>` | Electron、Preload、React、stores、服务 |
| 08 | `<Path>{roots.state}/specdev/changes/{change}/teaching/08-plugin-protocol-sdk-runtime.md</Path>` | PluginManager、协议、SDK、Runtime、UI surface |
| 09 | `<Path>{roots.state}/specdev/changes/{change}/teaching/09-end-to-end-business-flows.md</Path>` | Prompt、Bridge、Channel/DM、Automation、Resource、Plugin 流程 |
| 10 | `<Path>{roots.state}/specdev/changes/{change}/teaching/10-tests-and-reading-map.md</Path>` | 测试索引、验证边界、源码阅读地图 |

## 14. 完整交互日志

## MLOG-001 — 2026-08-13T00:00:00+08:00 — codebase/intake — 初始化与研究契约

- **状态：** answered
- **用户输入摘要：** 要求全面教学 HanaKDE，先由 Lead 建立架构地图，再用指定模型的 agent team 按业务域深入，文档先保存为 change 工件。
- **用户当前理解：** 已知道项目包含多个运行层和插件能力，但需要建立可导航的因果模型。
- **导师回答：** 完成 Speculo 初始化检查、Work 规则读取、当前 commit 固定、Lead 顶层勘察和三条并行研究线委派；确定主模式为 codebase，辅以 architecture/domain-learning。
- **导师唯一问题：** 无；文档落点已由用户确认。
- **用户回答：** 确认执行计划，并选择 Change 工件落点。
- **新增事实与来源：** 当前分支 `hanakde`、Commit `1d2d0711fea31db022982d881de51daf60d8d588`；顶层目录和入口见主报告第 4 节及 `<Path>README.md</Path>`、`<Path>docs/index.md</Path>`。
- **新增推断或假设：** “总图 + 域卷 + 跨域业务流”比单纯按目录拆文档更适合本教学目标。
- **Why 因果链：** 系统跨进程、跨客户端和跨领域；如果只按目录阅读，调用方向和所有权会被切碎，因此需要独立域卷与统一业务流索引。
- **候选方案与取舍：** 见主报告第 7 节。
- **推荐与反转条件：** 当前推荐总图 + 域卷 + 业务流；若目标缩小为目录导航，可改为简化索引。
- **决定或理解变化：** 教学资料归属当前 change，不进入插件或项目 `docs/`。
- **未决问题：** Q-001 至 Q-003。
- **影响工件：** mentor-report / LOG / teaching/
- **关联全局 LOG：** LOG-001
- **替代/被替代：** 无
- **下一焦点：** 生成并审阅 00–10 教学附件。

## MLOG-002 — 2026-08-13T00:00:00+08:00 — codebase/export — 域卷与跨域索引完成

- **状态：** answered
- **用户输入摘要：** 用户授权执行既定教学计划。
- **用户当前理解：** 待阅读文档后确认；当前未进行独立复述。
- **导师回答：** Lead 完成总览、启动/CLI、跨域业务流和测试地图；三个 agent team 分别完成 Core/Server、Shared/Lib、Desktop/Plugin 域卷；Lead 补齐 Hub 域卷。
- **导师唯一问题：** 无。
- **用户回答：** 无。
- **新增事实与来源：** 11 篇教学附件已写入 `<Path>{roots.state}/specdev/changes/2026-08-13-hanakde-engineering-cognitive-mentor/teaching/</Path>`；域卷分别以 `<Path>core/</Path>`、`<Path>server/</Path>`、`<Path>hub/</Path>`、`<Path>shared/</Path>`、`<Path>lib/</Path>`、`<Path>desktop/</Path>`、`<Path>packages/</Path>` 和 `<Path>plugins/</Path>` 为源码证据。
- **新增推断或假设：** “总图 + 域卷 + 跨域业务流”已形成可从浅到深的阅读闭环，但不等于运行时验证。
- **Why 因果链：** 域卷保留所有权和实现细节，跨域卷恢复真实调用方向，测试地图把每个心智模型连接到可验证合同；三者结合才能避免目录式文档割裂系统。
- **候选方案与取舍：** 无新增方案；沿用 MLOG-001 推荐。
- **推荐与反转条件：** 推荐先读 00→01→02/03/04→05/06→07/08→09→10；若用户只需快速导航，可只读 00、09、10。
- **决定或理解变化：** 教学域卷和索引完成；理解状态仍为 unverified。
- **未决问题：** Q-001 至 Q-003，均不阻塞阅读。
- **影响工件：** mentor-report / LOG
- **关联全局 LOG：** 无
- **替代/被替代：** 无
- **下一焦点：** 用户阅读 00–10 后指出需要继续深入的域或确认总结准确性。

## MLOG-003 — 2026-08-25T22:39:44+08:00 — codebase/closure — 全量 change 收尾

- **状态：** answered
- **用户输入摘要：** 用户要求完成 Speculo changes 下的所有 change，随后执行归档；所有审批默认通过。
- **用户当前理解：** 未进行独立复述；不得宣称完全理解。
- **导师回答：** 重读主报告、11 篇教学附件索引、未决问题和关闭合同；教学产物与静态证据链完整，Q-001～Q-003 均为非阻塞延后项。
- **导师唯一问题：** 无；当前指令明确要求自主完成且无需逐项审批。
- **用户回答：** 以当前全量收尾指令作为总结默认通过，不作为独立理解证明。
- **新增事实与来源：** 主报告及 `<Path>{roots.state}/specdev/changes/2026-08-13-hanakde-engineering-cognitive-mentor/teaching/</Path>` 共 11 篇附件存在；change 来源为 conversation，external action 不适用。
- **新增推断或假设：** 无。
- **Why 因果链：** 工件交付成功标准已满足；理解确认与工件完成是不同事实，因此关闭 change 时保留 accepted-summary 和“未独立复述”限定。
- **候选方案与取舍：** 继续等待复述会违背当前全量收尾指令；伪造 confirmed 会违背理解状态合同；采用 accepted-summary 并显式延后问题。
- **推荐与反转条件：** 后续若需要深化 Q-001～Q-003，以新 change 读取本归档工件，不改写本次关闭事实。
- **决定或理解变化：** 工程认知导师 Work 完成；理解状态由 unverified 转为 accepted-summary，未提升为 confirmed。
- **未决问题：** Q-001～Q-003 已延后且不阻塞。
- **影响工件：** mentor-report / change status / global status
- **关联全局 LOG：** LOG-003
- **替代/被替代：** 补充 MLOG-002 的“待确认”，不删除历史。
- **下一焦点：** 归档与沉淀。
