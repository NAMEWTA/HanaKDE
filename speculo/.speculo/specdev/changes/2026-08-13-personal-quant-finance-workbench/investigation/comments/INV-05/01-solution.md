---
artifact: wayfinder-solution-comment
ticket: INV-05
sequence: 1
resolution: answered
---

# Solution: Hana 插件能力契约与破盒边界

- **Ticket：** `<Path>{roots.state}/specdev/changes/2026-08-13-personal-quant-finance-workbench/investigation/INV-05-hana-plugin-boundary.md</Path>`
- **答案：** 金融工作台可以完整落在 `<Path>plugins/quant-finance-workbench/</Path>` 的内置 `full-access` 插件中，前提是把它定义成“页面 + 路由 + 工具 + 插件私有研究运行时”的领域应用，而不是 Hana 通用量化内核。页面、iframe 路由、Agent 工具、配置/秘密、ResourceIO、`ctx.dataDir`、Session/Agent、`sampleText()`、TaskRegistry、进度/取消、SessionFile 与 dev loop 都有现成契约。图表应作为 iframe 自包含资产；Python/Polars/DuckDB、mootdx TCP、任意本地进程和需要系统级共享的长期服务不属于当前通用插件契约，必须降级为 HTTP provider、受限 CLI Provider，或另立系统前置 change。
- **关键边界：** `full-access` 是运行时信任级别，不等于“插件可以任意打开 socket、启动子进程、读宿主文件或建立全局数据库”。TaskRegistry 保存任务/计划元数据，插件 handler 仍是内存函数；重启后要在 `onload()` 重新注册 handler 并自行从 `ctx.dataDir` 恢复业务状态。`local-cli` 的公开 schema 当前是 Provider/Media 的结构化命令绑定，不是金融计算沙箱。
- **事实来源：** `<Path>PLUGIN_SDK.md</Path>`、`<Path>PLUGINS.md</Path>`、`<Path>skills2set/hana-plugin-creator/SKILL.md</Path>`、`<Path>packages/plugin-runtime/src/index.ts</Path>`、`<Path>core/plugin-context.ts</Path>`、`<Path>core/plugin-manager.ts</Path>`、`<Path>lib/task-registry.ts</Path>`、`<Path>server/task-bus-handlers.ts</Path>`、`<Path>core/plugin-dev-service.ts</Path>` 与现有 `sdk-showcase`/内置插件样例。源码结论以当前工作区状态为准；本 ticket 不修改这些宿主模块。
- **信心与限制：** 页面/网络/资源/任务/Session API 为高信心代码事实。Python 库安装、mootdx 协议和任意 sidecar 的“能否运行”不是公开插件合同所保证的能力，因此按契约缺口裁决，而不是按某台本机恰好能运行来承诺。

## 结论矩阵

| 必需能力 | 裁决 | 当前可表达方式 | 不能假设/金融约束 |
|---|---|---|---|
| 全屏工作台页面 | **supported** | `trust: "full-access"` + `contributes.page` + `routes/*.js` + iframe/WebView | 页面只是 UI；动态数据必须走同插件 route，不能让浏览器直连第三方 |
| 小组件/摘要入口 | **supported** | `contributes.widget`，与 page 并存 | 首版只做摘要/最近运行；不要复制第二套业务状态 |
| 插件路由 | **supported** | Hono factory/default app，宿主注入 `pluginCtx`、`pluginRequestContext` | route 不是静态资源服务器；错误由宿主隔离为 4xx/500 |
| Agent 工具 | **supported** | `tools/*.js` 静态工具或 `ctx.registerTool()` 动态工具，统一 `execute(input, ctx)` | 工具必须声明参数和 `sessionPermission`；不能把任意命令行当工具输入 |
| 外部 HTTP | **supported/constrained** | route/tool/lifecycle 中 `ctx.network.fetch()` | 需 `network.fetch`、HTTPS、`allowedHosts`、HTTP methods、timeout、响应字节上限；默认不允许私网；GET cache 只是一段内存 TTL |
| 配置与秘密 | **supported** | `contributes.configuration` schema + `ctx.config.get/set`；`sensitive: true` | 秘密只在 Node 侧读取；不进 `assets`、HTML、iframe JS；配置数据与插件 data 同属插件持久化，但不是用户资源 |
| 用户资源读取 | **supported** | `ctx.resources.stat/read/list/search` + `resource.read/search` | 输入是 ResourceRef，不是可自由使用的宿主绝对路径；URL 资源只读 |
| 用户资源写入 | **supported/constrained** | `write/edit/mkdir/delete/copy/rename/move/trash` + `resource.write` | 需要显式用户资源权限和审计；不能用裸 `fs` 绕过 ResourceIO；写工作区文件的工具应 reviewer-bound |
| 本地路径给库使用 | **supported/constrained** | `ctx.resources.materialize(ref)` + `resource.materialize` | materialize 是执行边界；使用后必须显式决定是否通过 ResourceIO 写回，不能把临时路径当源身份 |
| 资源变更订阅 | **supported** | `ctx.resources.watch/subscribe` + `resource.watch`，`ctx.bus` 接收 `resource.changed/deleted/renamed` | 必须保存 `resourceKeys` 并在 `onunload`/`finally` 释放 handle |
| 插件私有文件 | **supported** | `ctx.dataDir`；可建 JSON/SQLite/索引/缓存/研究快照 | 只能是本插件数据；不要写 `Path.home()`、共享数据库或其它插件目录 |
| 交付生成文件 | **supported** | `toolCtx.stageFile({ sessionId/sessionRef, filePath, label })` + media details，产生 `SessionFile` | 只用于插件生成物；用户原文件修改仍走 ResourceIO；`sessionPath` 仅旧 locator |
| 私有 Agent/Session | **supported** | `createAgent/createSession`，`visibility: "plugin_private"`、`ownerPluginId` | 必须以 `sessionId/sessionRef` 定位；`createChatSurfaceCard` 只显示同插件私有 transcript，不能当富原生卡片 API |
| 插件侧短文本模型 | **supported/constrained** | `sampleText(ctx, ...)`，用于抽取、分类、摘要、RAG 改写 | 非流式；模型/provider/预算/失败要写 run trace；不应在页面首屏隐式调用 |
| 长研究运行 | **supported/constrained** | `TaskRegistry` bus 协议或 runtime `registerTask/updateTask/completeTask/failTask/cancelTask/scheduleTask` | handler 只在内存；宿主持久化记录与 schedule，不持久化函数；重启状态会变 `recovering`，插件必须恢复/失败 |
| 进度与取消 | **supported/constrained** | task `progress`（current/total/percent/message），`task:cancel` -> handler `abort(taskId)` | 取消是协作式；handler 必须中断轮询/请求并幂等清理；无法保证已发出的 provider 调用即时强杀 |
| 定时同步/监控 | **supported/constrained** | `task:schedule` 或 scheduler 的 `plugin_action` 调用插件工具 | 只能是可删除的插件任务；不能变成 Hana 启动前置、交易执行器或跨插件调度中心 |
| 图表/高密度交互 | **supported/constrained** | iframe `assets/` 内自包含 JS/CSS/字体/图表库，route 返回规范化 JSON | 没有稳定的原生金融 chart/card composition API；必须自己处理空、部分、过期、不可用和大数据降采样 |
| 错误诊断 | **supported** | 插件错误隔离、`/api/plugins/diagnostics`、dev diagnostics、日志、task records、surface debug | 诊断不能证明数据正确；需另存 provider/tool audit、snapshot hash 和金融质量状态 |
| 开发/场景 smoke test | **supported** | dev install/reload/diagnostics/listSurfaces/describeSurface/runScenario/invokeTool | Agent dev tools 默认关闭；full-access dev 要 `allowFullAccess: true`；scenario 不是生产 API |
| Python/Polars/DuckDB | **unsupported as generic contract** | 首选插件内 JS/TS 确定性计算；重计算可先 HTTP 化 | 没有“插件依赖安装 + 隔离 Python worker + 版本锁定 + 资源配额”的公开合同；不能把本机环境当发布条件 |
| mootdx/TCP 行情 | **unsupported as current plugin contract** | 找获授权的 HTTPS provider；把 TCP 适配器外置为独立服务 change | `ctx.network.fetch()` 只治理 HTTP(S)；不能由 iframe 或普通 route 获得 raw TCP/WebSocket 契约 |
| 任意本地进程/sidecar | **unsupported/constrained** | 仅可研究 `providers/*.js` 的 `runtime.kind: "local-cli"` 受限 Provider 形状 | 当前 local-cli 只定义结构化命令绑定与媒体输出合同，不是通用 Polars/回测沙箱；侧车需独立系统 change |
| 交易账户/下单 | **unsupported/out of scope** | 只输出研究 stance、证据与人工检查清单 | 不建立 broker credential、订单、资金或无人值守执行边界 |

`supported` 表示有公开、可测试的 Hana 入口；`constrained` 表示可用但有明确生命周期/权限/性能前提；`unsupported` 表示不应在本插件 manifest 或实现里暗中发明能力。

## Hana 契约如何拼成金融插件

### R-001：页面、路由与 iframe 是主工作台边界

`contributes.page.route` 指向插件 route 的相对路径，宿主以 `/api/plugins/{pluginId}{route}` 打开 iframe。`routes/*.js` 可以导出 Hono factory，宿主在请求级注入 `pluginCtx` 和 `pluginRequestContext`；后者包含 agent/principal、声明权限和请求级 bus。页面 JavaScript 使用 `hana.ready()`、`hana.api.fetch("api/...")`，不要硬编码 plugin id、复用 `pluginIframeTicket` 或直接 `fetch` 外站。

建议金融页面分成三类同源 route：

1. `dashboard`：只返回已缓存的 `WatchlistSnapshot`、运行摘要和能力状态，不首屏触发 LLM/大规模抓取。
2. `runs`：创建/查询/取消研究运行，前端只传 `AssetRef`、`asOf`、规则/预算选项，不传宿主绝对路径。
3. `data`：按 `DatasetCapability` 请求标准化 JSON；route 调 `ctx.network.fetch` 或读取 `ctx.dataDir`，并返回 `source/status/asOf/evidenceRefs`。

动态 JSON 与图表资产分离：静态图表库放 `assets/`，请求数据必须经过 schema 校验、大小上限、日期/复权/单位检查和 provider audit。若结果超出可视化上限，route 返回降采样或 `too_large` 状态，不在浏览器悄悄截断。

### R-002：外部网络与秘密

`ctx.network.fetch()` 会验证 capability、host allowlist、HTTPS、私网目标、HTTP method、timeout、cache TTL 和响应体上限；manifest 至少要有：

```json
{
  "capabilities": ["network.fetch"],
  "network": {
    "allowedHosts": ["api.example.com"],
    "methods": ["GET", "POST"],
    "defaultTimeoutMs": 8000,
    "maxResponseBytes": 1048576
  }
}
```

金融插件应按 provider 列出精确 host，不使用 `*`；每一条 `DataRequest` 写入 provider、URL 模板、方法、参数 hash、响应 hash、请求时钟和许可状态。API key、cookie、bearer token 只通过配置 schema 的 `sensitive: true` 字段保存，并在 route/lifecycle 运行时读取。浏览器只看到经过清洗的 JSON，不看到凭证。

`network.fetch` 不是实时行情合同：没有 raw TCP、长期 websocket、自动重连、tick backpressure 或行情许可治理。需要实时性时，首版采用用户触发的短轮询/手动刷新，明确 `staleAt` 和 `unavailable`；实时 feed 另立系统 change。

### R-003：ResourceIO、SessionFile 与 `ctx.dataDir` 三分法

把三类东西严格分开：

```text
用户文件 / mounted file / URL / SessionFile  -> ctx.resources (ResourceRef)
插件内部缓存 / snapshot / index / checkpoint -> ctx.dataDir
插件生成并交付的 CSV / JSON / Markdown / chart -> stageFile -> SessionFile
```

`resource.read` 覆盖 stat/read/list，`resource.search` 覆盖检索，`resource.write` 覆盖写入和移动等变更，`resource.materialize` 只在库确实需要路径时声明。ResourceIO 以 `principal.kind = "plugin"` 写审计；URL 资源写入在 provider 边界失败。资源 watch 返回可释放 handle，变更事件要用 handle 的 `resourceKeys` 过滤。

量化插件的 `DossierSnapshot`、provider 原始响应、schema 版本、任务 checkpoint 和计算缓存应写 `ctx.dataDir`。写用户研究笔记、报告或 watchlist 文件时，使用 ResourceIO 的版本/冲突接口；不要把 materialize 的临时路径当作最终写入。Agent 工具生成文件时，先写插件 data，再用 `stageFile()` 登记 `SessionFile`，让桌面、Bridge、Mobile PWA 使用同一资源身份。

### R-004：Session、Agent 与模型

研究对话或角色化复盘可用 `createAgent()` + `createSession()` 建立 detached、`plugin_private` 的对象，并以 `ownerPluginId` 隔离。`sendSessionMessage()` 支持每轮 `context.system/beforeUser/afterUser`，适合注入已批准的 RAG 片段；不直接改 JSONL history。需要把摘要放主聊天时，使用 `createChatSurfaceCard()`，但它只承诺 transcript surface，不承诺原生富图表卡。

首版研究运行不应为每个 Analyst 建永久 Agent。推荐：

```text
deterministic data/quality -> 0 LLM
perspective A             -> 1 bounded sampleText
perspective B             -> 1 bounded sampleText
neutral synthesis         -> 1 structured sampleText
optional outcome review   -> separate user-triggered task
```

每次 run 冻结 `provider/model/promptVersion/schemaVersion/budget`。`sampleText()` 是非流式 utility 调用，适合抽取/分类/摘要，不是自由代理图运行时；结构化失败默认是 `schema_error`，只有用户显式确认才允许第二次自由文本调用，且两次成本均留痕。

### R-005：TaskRegistry 的真实生命周期

宿主 `TaskRegistry` 记录 `pending/running/paused/blocked/recovering/completed/failed/canceled/aborted`，维护 progress、result、error、schedule 和 pluginId。插件在 `onload()` 通过 `ctx.bus.request("task:register-handler", { type, abort, run? })` 注册 handler；每次运行通过 `task:register` 登记实例，之后用 `task:update`、`task:complete`、`task:fail`、`task:cancel`、`task:remove` 管理状态。SDK 的 `registerTask/updateTask/...` 只是这些 bus 请求的 typed helper。

关键事实是：

- 任务 handler 只存在内存，宿主只持久化任务和 schedule 元数据。
- 重启把未完成任务标成 `recovering`；插件 reload 时必须重新注册 handler，读取自己的 checkpoint，决定 resume、fail 或清理。
- `abort` 是宿主调用的协作式钩子；插件要中断轮询、清除 `AbortController`、释放 watch/临时文件，并防止完成回写覆盖 canceled 状态。
- `task:schedule` 的 `run` 适合可重复的同步/刷新；schedule payload 只存 JSON，不能塞函数、密钥或大快照。
- `plugin_action` cron 只是调用一个现有插件工具；它不是另一个后台计算引擎。

因此 `ResearchRun` 需要自己的状态机和幂等键：`runId`、`stageId`、`inputHash`、`snapshotId`、`checkpointVersion`。TaskRegistry 是可观测的宿主骨架，不替代金融运行记录、数据快照或计算 checkpoint。

### R-006：图表、错误和诊断

Hana 没有稳定的金融原生 chart API。将图表渲染器、颜色 token、交互和小型数据适配器打包到 `assets/`，由 iframe 使用 `hana.api.fetch` 获取已校验 JSON。必须把 `fresh/stale/partial/unavailable/blocked/too_large` 作为一等 UI 状态；“没有点”不能和“没有数据”画成同一空白图。

宿主会隔离单个 route/tool/onload 错误，插件状态和日志进入 `/api/plugins/diagnostics`；dev loop 还提供 `plugin.dev.diagnostics`、surface element-first debug、tool invoke 和 manifest scenario。金融插件需在这些宿主诊断之上增加自己的：

```text
provider/tool request audit
data snapshot + schema/rule version
taskId/runId/stageId correlation
input/output hash and row/byte counts
quality decision and missing reasons
model/provider/token/cost attribution
```

诊断只能回答“哪里失败、用了什么输入、是否可恢复”，不能把 provider 返回 200、模型完成或任务 completed 等同于金融数据正确。

## 候选 manifest 与贡献面

以下是待实现时的最小候选，不是要求现在创建文件；字段只采用当前文档/样例已有形状，host capability 和资源能力按实际首个垂直切片删减：

```json
{
  "manifestVersion": 1,
  "id": "quant-finance-workbench",
  "name": "Quant Finance Workbench",
  "version": "0.1.0",
  "description": "Personal, evidence-traceable finance research workbench.",
  "minAppVersion": "0.158.0",
  "trust": "full-access",
  "activationEvents": ["onStartup"],
  "capabilities": [
    "network.fetch",
    "resource.read",
    "resource.search",
    "resource.materialize",
    "session",
    "agent",
    "model.sample"
  ],
  "ui": {
    "hostCapabilities": ["resource.open", "resource.pick", "resource.requestAccess"]
  },
  "network": {
    "allowedHosts": ["api.example.com"],
    "methods": ["GET", "POST"],
    "defaultTimeoutMs": 8000,
    "maxResponseBytes": 1048576
  },
  "contributes": {
    "page": {
      "title": { "zh": "金融", "en": "Finance" },
      "route": "/dashboard",
      "icon": "<svg viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\"><polyline points=\"3 17 9 11 13 15 21 6\"/></svg>"
    },
    "widget": {
      "title": { "zh": "金融摘要", "en": "Finance" },
      "route": "/widget"
    },
    "configuration": {
      "properties": {
        "defaultCalendar": { "type": "string", "scope": "global", "default": "CN-A" },
        "providerApiKey": { "type": "string", "sensitive": true, "ui": { "control": "password" } },
        "refreshIntervalMs": { "type": "integer", "default": 300000, "scope": "global" }
      }
    }
  },
  "dev": {
    "scenarios": [
      {
        "id": "smoke-dashboard",
        "steps": [{ "openSurface": { "kind": "page", "route": "/dashboard" } }]
      }
    ]
  }
}
```

候选中有三点必须在 Spec 阶段再次收窄：

1. `resource.write`、`resource.watch`、`usage.read`、`media.generate` 不应预先加入；只有首个垂直切片真正使用时才声明。
2. `session`、`agent`、`model.sample` 是 skill 认可的普通 SDK 能力；TaskRegistry 在当前文档中通过 full-access bus/helpers 表达，没有可靠理由发明 `task.*` capability。实现时先用 `/api/plugins/diagnostics` 和 EventBus capability registry 验证宿主策略。
3. `onStartup` 只有在确实需要恢复 schedule/monitor 时保留；只做页面和按需工具时改为更窄的 activation event，避免常驻。

候选目录：

```text
plugins/quant-finance-workbench/
  manifest.json
  index.js                    # onload: task handlers, dynamic tools, resource watches
  routes/dashboard.js         # iframe shell
  routes/api.js               # run/data/task JSON APIs
  tools/*.js                  # Agent-callable bounded actions
  assets/dist/*               # bundled UI and chart renderer
  providers/*.js              # only if a real Hana provider contribution is needed
```

内置插件的 `skills/` 目录按当前 PluginManager 规则不会作为冻结路径加载；投研纪律应以工具返回、README/文档或 route 可读资源提供，不把 versioned server runtime 的绝对路径写入会话。

## 破盒项与处理路线

| 破盒需求 | 本 change 的处理 | 后续路线 |
|---|---|---|
| Polars/DuckDB/NumPy 大规模时序 | 首版改成有边界的 JS/TS 计算或 HTTP 数据服务；小规模结果落 `ctx.dataDir` | 若确认需要 Python worker，另立“量化执行边界”系统 change：版本锁、worker 协议、取消、CPU/RAM/磁盘配额、沙箱、健康检查、升级回滚 |
| mootdx 原始 TCP/行情 feed | 不塞进 iframe/普通 route；改用获授权 HTTPS provider 或用户手动导入 | 另立实时行情/网络能力 change：连接权限、重连、背压、缓存、合规、跨平台部署、断线恢复 |
| 任意 `child_process` / shell | 不作为通用插件约定；不拼命令字符串 | 仅在现有 `providers/*.js` local-cli 形状内评估媒体/明确 provider；金融 CLI 需独立 capability 与沙箱 change |
| 长时间回测/实时监控 | 用 TaskRegistry + checkpoint 做可恢复插件任务，限制为个人、可删除、协作式取消 | 需要共享队列、跨插件调度、强杀 worker 或系统启动依赖时，升级为系统 change |
| 原生高性能 chart/card | iframe 自包含渲染和 route JSON | 若需要 Hana 原生 chart contract，单独提公共 UI capability change，不从金融插件私造协议 |
| 全局金融数据库/共享 Dataset Registry | 插件私有 `ctx.dataDir` + ResourceIO 交付 | 多插件共享、迁移和统一版本时，另立系统 Registry/storage change |

## 数据迁移、卸载与安全主体

- `ctx.dataDir` 和配置是插件所有权范围；schema 增加时做插件自己的版本化迁移文件/幂等迁移函数，迁移失败使插件进入 failed/diagnostics，不改 Hana 核心数据库。
- 当前公开生命周期是 `onload/onunload`，dev uninstall 只明确删除 `${HANA_HOME}/plugins-dev` 槽位。不能假设有自动生产数据迁移、备份恢复或“卸载时安全删除全部插件 data”的通用 hook；正式卸载策略应在插件 README/设置提供“导出/清理私有数据”操作，并在独立安装/卸载 change 中验证宿主行为。
- 正常插件删除必须不损坏 Hana session、Agent、ResourceIO、provider 或其他插件；plugin-private Session/Agent 需要在插件清理流程中按 `ownerPluginId` 列出并明确归档/删除策略，不能直接删共享 session 文件。
- 安全主体分层为：宿主认证的 iframe surface session；route 的 request principal + manifest declared capabilities；Node plugin context 的 plugin principal；用户资源操作的 ResourceIO audit principal；任务记录的 pluginId/agentId/sessionId。任何 route 不读取伪造 header 来推断 agent 身份。
- full-access 插件是内置信任边界，不是合规豁免。没有真实用户确认、provider 许可、PIT 和规则版本时，插件只显示研究状态/缺口，不输出订单、仓位或账户动作。

## 与 placement-decision 的逐条复核

1. **特权子系统：保持能装进盒子。** 当前所需页面、网络、资源、模型、Session 和任务均由现有插件入口提供；Python worker、raw TCP、共享量化内核一旦成为硬需求，按 placement-decision 另立系统前置 change。
2. **共享契约原语：保持能装进盒子。** 金融对象、provider audit 和 run schema 只在插件私有目录内拥有；不注册 Hana 通用 Dataset/Strategy/Backtest Registry。
3. **启动与常驻：有条件能装进盒子。** 任务可按需启动，schedule 可禁用；不把行情 feed、回测队列或数据库迁移作为 Hana 启动前置。
4. **整块删除：有条件能装进盒子。** 删除插件代码应只移除金融能力；正式实现必须验证 plugin-private sessions、dataDir、config 和 scheduled tasks 的清理/保留策略。
5. **贡献面表达：能装进盒子，但有破盒路线。** page/widget/routes/tools/config/lifecycle/TaskRegistry 足以支持第一阶段；通用 Python/TCP/sidecar 不得伪装为已支持。
6. **权限自洽：能装进盒子。** 外网走 `ctx.network.fetch`，用户资源走 ResourceIO，秘密走 config，iframe 走同插件 API，模型走 helpers；每项按实际调用声明最小 capability。
7. **产物归属：能装进盒子。** cache/checkpoint/snapshot 属 plugin data；用户报告经 ResourceIO 或 SessionFile；不写全局路径、不建立未审计跨插件状态。

## 最小可行垂直切片与验收

实现前仍需要 INV-06/07 冻结领域和 capability 合同；但本 ticket 已给出可验证的插件边界。建议首个 slice 是：

```text
一个 AssetRef + 一个获授权 HTTPS provider
  -> DataRequest / immutable snapshot
  -> deterministic quality gate
  -> 一个 bounded sampleText synthesis
  -> ResearchAssessment（evidence refs + unknowns）
  -> TaskRegistry progress/cancel
  -> 页面表格 + 一张 snapshot 图 + JSON/Markdown SessionFile 导出
```

验收证据：

- manifest diagnostics 显示 page、route、tools、configuration、capabilities 和任务状态；未使用的 capability 不在清单中。
- iframe 只出现 `hana.api.fetch`/`hana.assets.url`，无第三方直连、ticket 复用或自建静态资源 route。
- provider API key 不出现在 `assets`、route shell、日志和 tool result；HTTP host/method/timeout/bytes 违规均给出可诊断错误。
- 用户资源读取/写入可在 ResourceIO audit 中按 plugin principal 追踪；materialize 后没有隐式回写。
- 运行可显示 pending/running/progress/paused/canceling/canceled/failed/partial/completed；重启后 recovering 能被插件 onload 恢复或明确失败。
- `plugin.dev.install -> reload -> diagnostics -> invokeTool/scenario -> listSurfaces` 全链路在 dev slot 运行，未污染正式插件目录。
- 复制/删除插件目录的演练确认 Hana 其他 session、Agent、资源和插件不受损；金融私有 data/config 的保留、导出和清理策略有明确用户入口。

## Adopt / Adapt / Reject

**Adopt：** page/iframe route 边界、`ctx.network.fetch` 白名单、config sensitive fields、ResourceIO 审计、`ctx.dataDir` 私有存储、SessionFile 交付、TaskRegistry 状态与 dev diagnostics。

**Adapt：** Session/Agent 只做少量 plugin-private 研究上下文；Agent 研究图压缩成有限阶段；图表完全自包含；schedule 只用于可恢复、可删除的同步；模型调用预算/证据/结构化 schema 由金融插件自己加固。

**Reject：** 浏览器直连第三方、裸路径读写用户资源、把 `full-access` 当任意 shell/TCP 权限、复制独立 FastAPI/Streamlit/LangGraph 平台、把 local-cli Provider 当 Python 计算沙箱、把 AI stance 变成下单或收益承诺。

## 对后续 Ticket 的影响

- **INV-06：** 必须定义 `DataRequest`、PIT/交易日历/单位/复权、质量状态和错误码，使 route/Task/Agent 都消费同一确定性对象。
- **INV-07：** 将 `network.fetch`、dataset/provider、model、TaskRegistry、ResourceIO 变成金融 capability manifest 与运行时探测，而不是只检查插件是否 loaded。
- **INV-09：** UI 需要展示 task progress、evidence、成本、stale/partial/blocked、取消和恢复，而非只画图。
- **INV-10：** 需要设计 plugin-private checkpoint、幂等请求、handler 恢复、sidecar 触发条件和卸载/迁移策略；若突破本票 unsupported 项，必须新建系统 change。
- **INV-11：** Spec handoff 应把本 solution 的 supported/constrained/unsupported 矩阵和候选 manifest 作为前置约束。

