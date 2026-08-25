---
schema_version: 3
artifact: ticket
change: 2026-08-13-personal-quant-finance-workbench
id: T-01
title: 建立 finance-workbench 插件盒与共享领域契约
status: ready
planning_depth: deep
planning_depth_reason: 涉及内置插件 manifest、全模块公共领域对象、错误协议、能力状态和唯一产品写入边界，后续所有票据都依赖这些不可随意改变的契约。
ready: true
risk: high
blocked_by: []
contract_ids: [AC-001, AC-002, AC-003, AC-004, AC-032, AC-034, AC-035, AC-036, AC-037]
owner: root
expected_changes: ["<Path>plugins/finance-workbench/manifest.json</Path>", "<Path>plugins/finance-workbench/src/domain/**</Path>", "<Path>plugins/finance-workbench/routes/**</Path>", "<Path>plugins/finance-workbench/assets/**</Path>", "<Path>plugins/finance-workbench/tests/**</Path>"]
writable_paths: ["<Path>plugins/finance-workbench/**</Path>"]
read_only_paths: ["<Path>PLUGIN_SDK.md</Path>", "<Path>PLUGINS.md</Path>", "<Path>packages/plugin-sdk/**</Path>", "<Path>packages/plugin-runtime/**</Path>", "<Path>skills2set/hana-plugin-creator/SKILL.md</Path>"]
shared_paths: ["<Path>plugins/finance-workbench/manifest.json</Path>", "<Path>plugins/finance-workbench/src/domain/**</Path>"]
shared_path_owners: ["<Path>plugins/finance-workbench/manifest.json</Path> => T-01", "<Path>plugins/finance-workbench/src/domain/**</Path> => T-01"]
---

# Ticket T-01: 建立 finance-workbench 插件盒与共享领域契约

- **Ticket 文件：** `<Path>{roots.state}/specdev/changes/{change}/ticket/01-establish-finance-plugin-shell-and-domain-contract.md</Path>`
- **总体 Map：** `<Path>{roots.state}/specdev/changes/{change}/tickets-map.md</Path>`
- **上游 Spec：** `<Path>{roots.state}/specdev/changes/{change}/spec.md</Path>`
- **完成 Evidence：** `<Path>{roots.state}/specdev/changes/{change}/evidence/T-01.md</Path>`

## 1. 战略与来源

- **目标：** 用 hana-plugin-creator 的 full-access UI 形态建立一个可发现、可启停、可卸载的 `finance-workbench` 插件，并冻结跨模块领域对象和错误包络。
- **可观察产出：** Hana 能发现插件并打开 page/widget；首页显示 A/HK 模块能力矩阵；插件 route/tool 能返回版本化 `AssetRef`、`ProviderCapability`、`SourcePolicy`、`SourceDecision`、`RunSourceManifest`、`DataSnapshot`、`ResearchRun`、`EvidenceRef` 和结构化错误的空实现/fixture。
- **来源：** `US-001`、`US-015`、`US-019`～`US-021`、`AC-001`～`AC-004`、`AC-032`、`AC-034`～`AC-037`、`ADR-001`、`ADR-003`～`ADR-006`、`CODE`、`RESEARCH`。
- **当前事实：** 当前项目没有金融插件目录；现有插件使用 `manifest.json`、`routes/`、`tools/`、`assets/` 和 `@hana/plugin-*` SDK。生产实现不得进入宿主核心或其他插件。
- **Planning Depth 原因：** manifest、路由、schema、错误和 capability 是后续票据的共享接缝，错误会造成全 change 的兼容和安全回归。

## 2. 决策状态

### 已锁定决策

- 插件 id 为 `finance-workbench`，`trust` 为 `full-access`，提供用户可见 page 与 widget；动态业务数据由本插件 route 提供，iframe 只调用 `hana.api.fetch(...)`。
- manifest、共享领域对象和错误协议由本票唯一 owner；后续票据只消费，不能另造第二套 schema。
- 所有领域对象带 `schemaVersion`、`requestId/runId`、quality/status 和时间字段；错误至少包含 `code`、`retryable`、影响范围和替代路径。
- manifest 预声明本 Spec 所需的最小 SDK capability：`network.fetch`、敏感 configuration、ResourceIO 读/搜/写/物化、`session`、`agent`、`model.sample`；`hithink-rest` host 进入精确 network allowlist，Key 不进入前端或普通配置响应。
- 共享 schema 固定 `SourcePolicy auto | pinned`、`SourceDecision`、`RunSourceManifest` 和 `hithink-rest | hithink-market-dump` source kind；本地 source 在原型证据齐全前只能是 experimental/unavailable/blocked。

### 已采用的低影响假设

- 页面初版使用 route-backed WebView/iframe，复杂 native card 不作为前置依赖；首页可先渲染 capability fixture，再接真实数据。

### 未决问题

无。

## 3. 范围边界

| IN（本 Ticket 构建） | REUSE（复用且不改变契约） | OUT（明确不做） |
|---|---|---|
| manifest、敏感 provider 配置 schema、page/widget、插件入口、领域类型、来源策略/运行清单、状态枚举、错误 envelope、诊断占位和插件内契约测试 | Hana 插件发现、WebView、`hana.api.fetch`、SDK capability 和 theme | 真实 provider、native DuckDB、量化计算、持仓数据、宿主 API、全局 registry、交易工具 |

## 4. 要构建什么

用户启用插件后，从 page 进入总览并看到 A/HK 所有模块入口和状态；在无 provider 时页面仍显示 `unavailable` 与导入/配置替代路径。插件 route 对无效请求返回稳定错误，对 fixture 请求返回带版本和质量信息的对象。禁用或删除插件后宿主仍能启动，且静态扫描能证明金融代码只在插件目录。

## 5. 实现契约

- **入口或接缝：** `manifest.json`、生命周期入口、page/widget route、插件内 `src/domain`、诊断 route 和 contract test harness。
- **输入与输出：** capability matrix 查询接收市场/数据集过滤并返回状态、原因、探测时间、替代路径；领域 envelope 接受 JSON-safe 字段并返回版本化对象或稳定错误。
- **公共接口变化：** 只新增插件私有 routes/tools/schema；不修改 HanaKDE 宿主公共 API。
- **不变量：** A/HK 模块不可隐藏；unknown 不得变成 supported；plugin id、schemaVersion、错误 code 和质量状态稳定；不存在交易相关 tool。
- **状态或数据流：** plugin discovered -> enabled -> page/widget active -> disabled/uninstalled；请求 queued -> result/error，均保留 requestId。
- **错误与失败行为：** manifest/route/schema 失败可诊断；错误脱敏、可重试性明确，不吞异常或返回假成功。
- **兼容要求：** 只使用当前 SDK 已记录的 manifest、route、assets 和 `hana.api.fetch` 语义；SDK 缺口记录为外部依赖。
- **安全与隐私要求：** 本票不读取用户私有内容；manifest 不放 secret，未来私有字段按后续票据通过 ResourceIO/ConsentRecord。

## 6. 执行路线

1. 运行 hana-plugin-creator preflight，按现有插件形态生成插件骨架和 page/widget route shell。
2. 建立共享领域 schema、SourcePolicy/SourceDecision/RunSourceManifest、能力状态枚举、错误 envelope、版本化私有 store 接缝和最小 fixture。
3. 将总览 route 与 UI 接到 fixture，展示所有模块及 supported/partial/experimental/unavailable/blocked 状态。
4. 建立 manifest/schema/route/static-scan 测试，证明只读宿主上下文、不暴露 secret 和不注册交易工具。
5. 运行插件包级类型/构建/定向测试，形成可供 T-02～T-12 消费的稳定证据。

## 7. 路径访问契约

- **预计修改点：** `<Path>plugins/finance-workbench/manifest.json</Path>`、`<Path>plugins/finance-workbench/src/domain/**</Path>`、`<Path>plugins/finance-workbench/routes/**</Path>`、`<Path>plugins/finance-workbench/assets/**</Path>`、`<Path>plugins/finance-workbench/tests/**</Path>`。
- **可写范围：** `<Path>plugins/finance-workbench/**</Path>`。
- **只读上下文：** `<Path>PLUGIN_SDK.md</Path>`、`<Path>PLUGINS.md</Path>`、`<Path>packages/plugin-sdk/**</Path>`、`<Path>packages/plugin-runtime/**</Path>`、`<Path>skills2set/hana-plugin-creator/SKILL.md</Path>`。
- **共享路径：** `<Path>plugins/finance-workbench/manifest.json</Path>`、`<Path>plugins/finance-workbench/src/domain/**</Path>`；唯一 owner 为 T-01，后续票据只读并通过扩展兼容字段请求变更。
- **保留或不动：** 所有插件目录之外的产品代码、根 package/lock、宿主路由和公共 schema。

## 8. 验证矩阵

| 行为或风险 | 验证接缝 | 命令或步骤 | 预期结果 | Evidence |
|---|---|---|---|---|
| 正常路径 | plugin manifest/route harness | 运行插件 manifest、surface、capability/source fixture 测试 | plugin 可发现、page/widget 可加载，矩阵包含 A/HK 全模块和 source kind，来源对象可版本化往返 | `<Path>{roots.state}/specdev/changes/{change}/evidence/T-01.md</Path>` |
| 失败路径 | schema/error contract | 提交 unknown market、坏 schema、未知 capability 和交易意图 | 稳定错误/blocked，无假成功、无交易 tool | `<Path>{roots.state}/specdev/changes/{change}/evidence/T-01.md</Path>` |
| 回归 | static path scan/build | 扫描 git diff、运行插件构建和宿主插件加载 smoke | 只改插件目录，宿主可启动，资源通过官方 assets 机制 | `<Path>{roots.state}/specdev/changes/{change}/evidence/T-01.md</Path>` |
| UI E2E（owner：Lead） | page/widget accessibility | 读取桌面/窄屏可访问性树并打开首屏 | 所有模块入口和状态可见且不重叠 | `<Path>{roots.state}/specdev/changes/{change}/evidence/T-01.md</Path>` |

- **Workspace checks（current-workspace）：** implementation owner 在 current workspace 运行 manifest/schema、domain contract、静态路径扫描、类型检查和插件构建，不创建 source worktree。
- **E2E disposition：** required：插件发现、启停、page/widget 加载、桌面/窄屏首屏以及删除插件后宿主可启动均跨越宿主运行时与插件边界，不能由单元测试替代。
- **E2E owner/environment：** Lead / current-workspace；在 direct-parent 状态执行插件发现与启停、首屏可访问性、窄屏布局和隔离删除 smoke，预期模块入口完整、无重叠且宿主不依赖插件。
- **Integration evidence（direct-parent）：** 记录 implementation commit、parent before SHA、Lead 运行的命令与退出状态、E2E 结果、父分支 result SHA 及其包含 implementation commit 的证明。

## 9. 发布、迁移与恢复

- **迁移顺序：** 先生成插件骨架和版本化私有 store，再开放 fixture UI；真实数据消费者在共享 schema 稳定后接入。
- **兼容窗口：** `schemaVersion: 1` 为首个插件私有协议；新增字段保持旧消费者可忽略，未知版本 fail closed。
- **监控信号：** plugin load/enable、route error、capability probe、schema rejection 和交易 tool 静态扫描结果进入诊断。
- **回滚或前向恢复：** 插件安装失败由宿主回退；私有 store 迁移先备份/校验，失败保持旧 envelope；删除插件不影响宿主。
- **不可逆操作与批准点：** 无用户数据不可逆操作；后续 provider/写入/长期任务票据必须通过自身确认点。
- **收缩条件：** 后续票据全部消费同一领域 schema，且没有并行副本或旧错误协议调用；由契约扫描证明后才可扩展字段。

## 10. 验收标准

- [ ] `AC-001`～`AC-004`、`AC-032`、`AC-034`～`AC-037`：插件可发现、可停用、路径无越界，首页能力矩阵、敏感 provider 配置和共享来源 schema 可用；本地 source 默认不超过 experimental/blocked。
- [ ] 验证矩阵全部执行并记录到 `<Path>{roots.state}/specdev/changes/{change}/evidence/T-01.md</Path>`。
- [ ] 后续 Ticket 只能读取本票 owner 的 manifest/domain 契约，未发生未批准的宿主扩展。
- [ ] 实际修改未超出 `<Path>plugins/finance-workbench/**</Path>`，Ticket、Map 和 Evidence 状态一致。
