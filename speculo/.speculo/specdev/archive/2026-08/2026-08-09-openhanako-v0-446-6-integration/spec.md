---
schema_version: 3
artifact: spec
change: 2026-08-09-openhanako-v0-446-6-integration
status: ready
ready_for_tickets: true
sources:
  - USER-DECISION:2026-08-09-final-design-consensus
  - ADR-001..ADR-008
  - ADR-010..ADR-011
  - "<Path>{roots.state}/specdev/changes/2026-08-09-openhanako-v0-446-6-integration/design-tree.json</Path>"
  - "<Path>{roots.state}/specdev/changes/2026-08-09-openhanako-v0-446-6-integration/HanaKDE-openhanako-v0.444.1-integration-plan.md</Path>"
  - CODE:hanakde@bf4c6ee57891324fe686f63780092f5240e61bec
  - CODE:openhanako-v0.446.6@5f08a4f30203abb61dafac7dbb7ab92d11c23efa
---

# Spec: HanaKDE 跟随 openhanako v0.446.6 并收敛 Resource / Workspace / Knowledge 基础设施

- **Spec：** `<Path>{roots.state}/specdev/changes/2026-08-09-openhanako-v0-446-6-integration/spec.md</Path>`
- **当前 ADR：** `<Path>{roots.state}/specdev/changes/2026-08-09-openhanako-v0-446-6-integration/ADR.md</Path>`
- **当前领域上下文：** `<Path>{roots.state}/specdev/changes/2026-08-09-openhanako-v0-446-6-integration/CONTEXT.md</Path>`
- **设计来源：** `<Path>{roots.state}/specdev/changes/2026-08-09-openhanako-v0-446-6-integration/HanaKDE-openhanako-v0.444.1-integration-plan.md</Path>`

## 1. 问题与目标

### 问题陈述

HanaKDE 需要跟随冻结的 openhanako `v0.446.6`，吸收 Workspace File History、Document Extraction、ResourceIO Materialize、Memory Dream、压缩菜单修复、Markdown 裸 URL 修复及关联的运行时、设置、持久化和构建变化。同时，HanaKDE 已经拥有更强的 ResourceIO、ProviderRootIdentity、跨 Provider Transfer、ResourceEventBus、Knowledge Workspace 与 Workbench 产品合同。

如果只解决 Git 冲突，最终会让 File History、Knowledge、Desktop 和 UI 各自持有 watcher、baseline scan、路径身份、document parser 或 restore 写入通道，造成重复事件、历史分叉、索引滞后、安全降级和后续上游同步成本持续上升。本 change 必须完成一次跟随式融合：产品能力取并集，同用途基础设施收敛到一个 owner，并删除重复实现。

当前审计事实：HanaKDE 规划快照为 `bf4c6ee57891324fe686f63780092f5240e61bec`；冻结上游对象 `5f08a4f30203abb61dafac7dbb7ab92d11c23efa` 已存在于本地并对应 `v0.446.6`。实际实施开始前必须重新冻结下游 HEAD、工作树、merge-base、patch equivalence 和 overlap，不能把规划快照当成未来实施起点。

### 目标用户与场景

- HanaKDE 用户：在唯一主 Workspace `main` 中编辑、查看、检索、比较和恢复文件，并在 Workbench 中观察一致结果。
- Agent 对话用户：查看当前对话或操作相关的文件变化；对于 `main` 内资源，复用共享版本、diff 与 restore 能力，而不产生第二套物理历史。
- Knowledge 用户：让 Markdown、文本和 Office 文档基于已保存磁盘内容进入可重建语义索引，并在外部修改或 restore 后自动收敛。
- Resource 调用者：在授权范围内区分 copy、transfer 和 materialize，使用统一事件与 Root Identity 安全合同。
- HanaKDE 维护者：审计 staged merge、保护 HanaKDE 二开合同、删除重复 owner，并用 Windows/macOS 与 production package Evidence 判定整合完成。

### 成功标准

1. 冻结的 `v0.446.6` commit 成为最终整合 HEAD 的 Git ancestor，且正常上游功能、修复与优化被完整吸收。
2. HanaKDE Knowledge、Resource、Transfer、安全和 Workbench 合同没有行为回退。
3. Workspace File History 在 `main` 范围内完成 capture、deleted history、timeline、diff、restore、retention 和 quota 闭环；额外挂载不进入该范围。
4. Resource mutation、外部观察和 baseline reconciliation 汇入统一事件与版本事实；同一 canonical root 不存在重复 physical watcher 或重复完整 baseline walk。
5. Document Extraction 成为 File Tool、Office 适配和 Knowledge ingestion 共用能力，重叠 parser 被删除，派生 Markdown 不污染 Workspace。
6. Restore 后 Disk、Preview、History、Knowledge、Search 与 Agent Read 收敛到同一版本。
7. Windows 和 macOS 的安全、watcher、production build 与 native extraction packaging 门禁通过；Linux 结果只作为非阻断证据。
8. 15 项 umbrella Definition of Done 全部绑定可重复 Evidence，不以“merge 无冲突”或单平台构建代替完成。

### 非目标

非目标以第 5 节的 `OOS-*` 为权威。特别是，本 change 不增加 relocation、公共 `workspaceId`、挂载 Workspace History、OCR、legacy migration、临时双运行或所有 remote provider 的 File History。

## 2. 解决方案与外部行为

### 解决方案摘要

本 change 是一个 umbrella change。它以 staged merge 吸收 `v0.446.6`，再以当前 HanaKDE 架构收敛冲突职责：

- 现有 ResourceIO、ResourceEventBus、ProviderRootIdentity 与 Transfer 继续作为 Resource Kernel 权威；上游 Materialize 合入该内核。
- 当前 `main` 生命周期是唯一主 Workspace 生命周期；切换工作目录关闭旧 `main` 并打开新 `main`，不延续旧身份。
- Workspace 物理观察与 baseline observation 各只有一个 owner；History、Knowledge 和 UI 是逻辑消费者。
- File History 保留独立私有存储、retention 和 byte-history 语义，只覆盖 `main`。
- Knowledge 保留独立数据库、Semantic IR、Source Registry 和 Search，只消费共享资源事实并执行 scoped repair。
- Document Extraction 输出 canonical derived Markdown，供 File Tool、Office 适配和 Knowledge 使用；授权、ResourceIO/Materialize 和输入预算在调用边界执行。
- Workspace History 与 Agent 对话文件变化保留不同入口。Agent 入口继续按对话/操作关联规则呈现文件影响；只有 `main` 内可用的共享版本进入 File History diff/restore，不得为了挂载或会话另建 capture store、watcher 或写入通道。

### 主要流程

#### 上游整合

1. 实施者在获授权后冻结实际 HanaKDE 起点、`v0.446.6` 对象、merge-base、patch equivalence、overlap 和 module ownership。
2. 以可审计 release checkpoint staged merge；普通上游变化默认接受，只有真实 HanaKDE 产品、安全、数据或开放边界差异进入语义融合。
3. 每个基础设施 owner 切换先在隔离环境证明新路径，再停止旧 owner，确认资源已释放，最后启动新 owner。
4. 最终验证 ancestry、行为合同、双平台、production package、去冗余和 sync ledger。

#### 打开或切换 `main`

1. 对候选工作目录完成 ResourceRef 解析、授权和 ProviderRootIdentity 证明。
2. 处理旧 Workspace 的未保存文档和关闭合同，然后停止旧 `main` 的观察、队列和派生生命周期。
3. 打开新 `main`，初始化其 File History 私有存储并启动唯一物理观察 owner。
4. 运行一次共享 baseline observation，向 History、Knowledge 和 UI 提供版本化观察结果。
5. 初始化或 observation 失败时报告统一健康状态；不得把挂载、旧 History 身份或旧 Workspace UI 状态自动继承给新 `main`。

#### 资源变化与收敛

1. 内部写入必须经 ResourceIO；外部写入由唯一 watcher 观察；事件 gap、resume 或 watcher 降级由共享 baseline reconciliation 修复。
2. 三类来源都进入 ResourceEventBus，保留来源、版本、顺序与可选 correlation metadata。
3. 相同资源、版本和变化类型的 watcher echo 被合并，不重复触发高层 mutation。
4. File History 按 HistoryCapturePolicy 记录 `main` 内符合条件的物理版本；Knowledge 按 KnowledgeIndexPolicy 重读、重解析或重抽取；UI 只消费这些事实。

#### History 查看与 restore

1. Workspace/Workbench 从当前已授权 `main` 查看文件、删除项、版本 timeline 和 line diff。
2. Agent 对话入口按当前对话/操作过滤文件影响，并在 `main` 内复用同一版本、diff 和 restore 流程。
3. restore 在 effect 前重新验证 root、resource scope 和 expected current version；版本已变化、root 被替换或资源越界时拒绝且不写盘。
4. 合法 restore 只经 ResourceIO 写盘，带 `history_restore` origin/correlation；restore 自身生成可恢复的新历史版本。
5. ResourceEventBus 驱动 Preview、History、Knowledge、Search 与 Agent Read 收敛；失败进入健康状态和 scoped retry。

#### 文档抽取与 Knowledge ingestion

1. 调用者先通过现有授权与 ResourceAccessPolicy 获得 ResourceRef。
2. 可直接读取的资源使用有界 bytes；只接受本地路径的 converter 经 Materialize 获得临时路径并在结束后清理。
3. Document Extraction 将受支持文档转为 derived Markdown，并返回 format、warnings 或结构化失败原因。
4. File Tool/Office 适配按其产品输出消费同一抽取内核；Knowledge 将 derived Markdown 送入现有 Semantic IR 与来源分区索引。
5. 资源版本或 extractor version 变化使缓存失效并触发 re-extract/re-index；derived Markdown 不自动写为 Workspace 文件。

### 边界、失败与稳定错误行为

- 无法证明 ProviderRootIdentity、root relation 为 `unknown`、授权后 root 被替换、symlink/junction 逃逸或 effect 前 scope 变化时，敏感操作 fail closed；不得回退到字符串前缀判断。
- restore 的 expected version 不匹配时返回可识别的版本冲突并保持当前磁盘内容不变；本 Spec 不虚构新的传输错误码。
- File History 私有存储初始化失败进入 `FAILED`，允许对当前 `main` scoped retry；普通 Workspace 文件管理和未受影响的 Knowledge 能力不得被破坏。
- watcher 错误或事件 gap 进入 `DEGRADED`，开始修复后进入 `RECONCILING`，成功后回到 `HEALTHY`，不可恢复失败保持 `FAILED` 并暴露必要错误。
- Document Extraction 稳定失败原因为 `unsupported | parse-failed | scanned-pdf | too-large`；`scanned-pdf` 不自动调用 OCR。
- 超过 50 MiB 的文档在调用 converter 前返回 `too-large`；File History 超过 5 MiB 的单文件不捕获全量快照。
- 挂载与 remote/non-local provider 不进入 Workspace File History；这不取消其既有文件管理、编辑、Knowledge 或 Agent 操作记录能力。
- subscriber、History 或 Knowledge 投影失败不能把已提交 ResourceIO mutation 伪装成失败；它们进入可观察的派生收敛流程。
- 新 owner 启动失败时先停止并证明其 watcher、queue 和 baseline 已关闭，再恢复前一代码 Wave；任何时刻不允许两个生产 owner 同时接入同一真实 root。

### 状态转换与不变量

- `main` 是唯一主 Workspace；工作目录切换是 close-old/open-new，不是 relocation。
- `sourceKey=main` 负责来源路由，ResourceRef 负责定位，ProviderRootIdentity 负责物理证明，File History 私有 `historyStoreKey` 只负责存储定位；四者不得互相替代。
- 同一 canonical physical root 的 physical watcher 数量小于等于 1，逻辑消费者数量不改变该数量。
- 同一 `main` 的完整 baseline filesystem walk 只有一个 observation owner；History 与 Knowledge 只执行各自 scoped repair。
- ResourceIO 是内部 mutation 与 restore 的唯一写入事实源；ResourceEventBus 是统一 mutation fan-out 与 catch-up 事实源。
- File History DB 与 Knowledge DB、retention、policy、模型和恢复语义保持独立；二者共享资源事实而不共享持久化模型。
- File History runtime data 必须位于用户 Workspace 之外，不得被 watcher 捕获、被 Knowledge 索引或通过外部事件泄漏绝对路径。
- 健康状态只使用 `HEALTHY | DEGRADED | RECONCILING | FAILED`；消费者可以报告派生进度，但不能另建冲突的物理观察健康事实。
- 新基线不含 legacy migration、旧 schema 兼容、migration marker、旧 Profile 导入、迁移回滚或旧数据清理状态。

## 3. 用户故事

- **US-001**：作为 HanaKDE 维护者，我希望冻结的 `v0.446.6` 成为可审计的新基座并完整吸收正常上游迭代，以便后续同步不依赖长期 fork 兼容壳。
- **US-002**：作为 Workspace 用户，我希望当前工作目录始终是唯一 `main`，且额外挂载继续可管理和编辑但不冒充另一个 Workspace，以便模型简单且作用域明确。
- **US-003**：作为 Workspace 用户，我希望查看 `main` 内文本文件的版本、删除历史、diff、retention 状态并安全 restore，以便恢复误改且可以反悔 restore。
- **US-004**：作为 Agent 对话用户，我希望按当前对话或操作查看相关文件影响，并在适用时复用共享 diff/restore，以便理解 Agent 改了什么而不创建第二套文件历史。
- **US-005**：作为使用外部编辑器的用户，我希望内部写入、外部写入和丢失事件后的修复最终产生一致 History、Knowledge 与 UI，以便 watcher 偶发丢事件不会永久造成数据分叉。
- **US-006**：作为执行 restore 的用户，我希望系统在写入前检查 root 与当前版本，并在成功后让所有读取面收敛，以便不会覆盖较新的内容或恢复出互相矛盾的状态。
- **US-007**：作为 File Tool、Office 和 Knowledge 用户，我希望受支持文档通过一个共享抽取能力转为 Markdown，并得到明确失败原因，以便增加格式覆盖而不维护重复 parser。
- **US-008**：作为 Resource 调用者，我希望 copy、transfer 与 materialize 保持不同生命周期和安全语义，以便临时投影不会被误当成持久搬运。
- **US-009**：作为 HanaKDE 用户，我希望在基础设施降级时看到必要状态和错误并可 scoped retry，以便故障可判断、可恢复且不会伪装正常。
- **US-010**：作为未发布产品的维护者，我希望直接建立唯一新 schema 与基础设施基线，以便不为不存在的旧用户数据引入迁移和兼容系统。
- **US-011**：作为安全负责人，我希望 root identity、scope、symlink/junction 与 effect 前重校验对 restore、transfer、materialize 和 extraction 一致生效，以便路径别名或 TOCTOU 不造成越权。
- **US-012**：作为发布负责人，我希望 Windows、macOS、production/native packaging、去冗余和 sync ledger 都形成阻断 Evidence，以便 umbrella change 只有在真实可发布时才完成。

## 4. 验收合同

| ID | 前置条件 | 动作或事件 | 可观察结果 | 验证接缝 |
|---|---|---|---|---|
| AC-001 | 整合 HEAD 已形成 | 检查冻结 target ancestry 与 staged merge audit | `5f08a4f30203abb61dafac7dbb7ab92d11c23efa` 是 HEAD ancestor；checkpoint、overlap 与语义裁决可追踪 | Git fixed-point inspection + sync ledger |
| AC-002 | 上游 `v0.446.6` 功能已吸收 | 运行 Memory Dream、compaction menu、Markdown bare URL 及关联 settings/persistence/build 回归 | 冻结上游正常功能和修复可用，不为旧内部实现保留兼容壳 | 上游回归测试 + 产品集成测试 |
| AC-003 | HanaKDE 与上游完成语义融合 | 运行 Knowledge、Resource、Transfer、安全和 Workbench 现有合同 | HanaKDE 二开能力无行为回退，开放边界保持 | 现有 Vitest、Knowledge E2E、open boundary gate |
| AC-004 | 一个 `main` 已打开 | 用户切换工作目录 | 旧 `main` 关闭，新目录作为全新 `main` 打开；旧 History 身份、Knowledge tabs、挂载和 Workspace UI state 不自动继承 | Workspace lifecycle integration |
| AC-005 | `main` 有额外挂载 | 用户编辑或浏览挂载资源并查询 Workspace History | 挂载的既有文件管理、编辑和 Knowledge 可用；Workspace History 不捕获挂载且不建挂载 history store | Workspace/History scope test |
| AC-006 | `main` 含符合策略的文本文件 | 内部修改、外部修改、rename、delete 或 reconciliation observation 发生 | History 正确显示版本、删除项、origin、timeline 和 line diff；无内容变化不重复；rename 在 `main` 内延续历史 | File History store/module integration |
| AC-007 | History 使用冻结上游默认策略 | 高频保存、超大文件或 retention 到期 | 60 秒 merge window 生效；单快照上限 5 MiB；默认最大年龄 30 天、总存储 500 MiB；噪音目录/文件不捕获 | Policy/store deterministic tests |
| AC-008 | Agent 对话关联到若干资源变化 | 打开 Agent 文件变化入口 | 入口按对话/操作过滤文件影响；`main` 内版本复用共享 timeline/diff/restore；不会扩大挂载 History capture 或创建第二 store/watcher | Agent projection + shared History integration |
| AC-009 | N 个消费者订阅同一 canonical root | History、Knowledge 与 UI 同时订阅和退订 | 始终最多一个 physical watcher；最后消费者释放后 watcher 关闭；消费者数量只改变 logical subscriptions | Watch coordinator factory/descriptor regression |
| AC-010 | 旧 owner 正在观察真实 root | 执行基础设施切换或失败恢复 | 旧 owner 停止证据先于新 owner 启动；全过程 watcher/mutation/baseline owner overlap count 为 0 | Cutover state-machine test + Gate Evidence |
| AC-011 | ResourceIO 或 watcher 产生同版本变化 | ResourceEventBus 接收 mutation 与 watcher echo | 事件顺序单调、来源可辨、同版本重复高层 mutation 被合并；subscriber 失败隔离；`since()` 非 stale 时增量恢复 | ResourceEventBus contract tests |
| AC-012 | 消费者 cursor 已过期或 watcher 事件丢失 | 调用 catch-up 或触发 resume/repair | stale/gap 进入 scoped reconciliation；只做一次共享 baseline observation，各消费者按差异修复，不重复 full walk | Reconciliation integration + scan counter |
| AC-013 | observation 或派生链健康状态变化 | watcher error、gap、retry、repair success/failure 发生 | 状态按 `HEALTHY → DEGRADED → RECONCILING → HEALTHY/FAILED` 转换，必要错误可见且 scoped retry 可执行 | Health transition contract + UI state test |
| AC-014 | `main` root 与资源已授权 | 比较 same/ancestor/descendant/disjoint/unknown、大小写别名、symlink/junction 或 root replacement | ProviderRootIdentity 是物理 authority；unknown/越界/替换 fail closed；不得依赖路径前缀猜测 | Root Identity + malicious workspace tests |
| AC-015 | 用户选择历史版本且 UI 携带 expected current version | 当前版本未变时 restore | restore 只经 ResourceIO 写盘，产生 `history_restore` correlation 和可反悔版本 | History route/domain + ResourceIO integration |
| AC-016 | 用户打开历史后文件或 root 又变化 | 使用旧 expected version restore，或 effect 前 root/scope 失效 | 请求被拒绝，当前磁盘内容不变，返回可识别冲突/安全失败 | Restore conflict + TOCTOU security tests |
| AC-017 | 合法 restore 完成 | 等待事件与 scoped repair 收敛 | Disk、Preview、History current state、Knowledge source、Search 和 Agent Read 内容相同 | Restore end-to-end consistency |
| AC-018 | 已授权文档不超过 50 MiB | 抽取 DOCX、XLSX、PPTX、PDF、CSV、ODT/ODS/ODP、RTF、EPUB、HTML 等冻结上游支持格式 | 返回 derived Markdown、detected format 与 warnings；File Tool 可使用 | Document Extraction fixture tests |
| AC-019 | 文档不受支持、过大、扫描 PDF 或损坏 | 调用 Document Extraction | 分别返回 `unsupported`、`too-large`、`scanned-pdf` 或 `parse-failed`；超限在 converter 前拒绝 | Extraction failure matrix |
| AC-020 | remote/abstract Resource 需要 path-only converter | 授权后通过 bounded read 或 Materialize 抽取 | 抽取成功或返回稳定失败；staging 生命周期结束后清理；拒绝未授权资源 | ResourceIO/Materialize/Extraction integration |
| AC-021 | Office 文档位于 Knowledge 可索引来源 | 创建或修改文档 | 共享 Extraction 输出进入 Semantic IR、来源分区索引和 Search；资源/extractor version 变化会重新抽取；Office HTML/JSON 等真实差异适配保留 | Office Knowledge integration/E2E |
| AC-022 | 抽取成功或 PDF 无文字层 | 完成 Knowledge ingestion 或返回 `scanned-pdf` | 不在 Workspace 自动生成同名 Markdown；不启动 OCR；不会形成 watcher/index 循环 | Filesystem assertion + extraction failure test |
| AC-023 | Resource 调用者执行 copy、transfer 或 materialize | 分别完成 provider-native copy、跨 Provider transfer、临时本地投影 | 三种行为保持独立生命周期、授权、恢复和 side effect；现有 Transfer fixed budgets 不降低 | ResourceIO copy/transfer/materialize tests |
| AC-024 | 用户进入 Workbench 或 Agent Conversation | 查看 History、diff、restore、deleted files、`@` 搜索和健康状态 | Workspace 与 Agent 入口语义分离但共享底层能力；上游 query/loading/cancellation/stale-response 修复生效；UI 不维护 shadow file truth | Component tests + Playwright direct user flows |
| AC-025 | 新 `main` 首次打开且无旧 File History 数据 | 初始化新 store 成功或失败 | 只创建唯一新基线；失败进入 `FAILED` 且可 retry，其他 Workspace 能力不被破坏；不存在 migration/旧 Profile/兼容状态 | New-store initialization failure tests |
| AC-026 | 外部/LAN/Renderer 查询 History 或接收事件 | 请求携带 raw root、新公共 `workspaceId`、越界资源或观察外部事件 | 接口绑定授权 `main` 与 ResourceRef/opaque key；raw root/越界被拒绝；外部数据不泄漏绝对路径 | Route schema + security tests |
| AC-027 | Windows 与 macOS 构建输入就绪 | 分别运行原生安全、watcher、restore、native extraction 与 production package 门禁 | 两个平台各自形成通过 Evidence；任一阻断项失败则 umbrella change 不完成；Linux 结果不阻断 | Windows/macOS native runners + package smoke |
| AC-028 | 所有行为合同通过 | 执行重复 owner/parser 扫描并审查架构文档与 upstream sync ledger | 重复 watcher、baseline walk、root helper 和重叠 parser 已删除；架构/ledger 记录 target、保留能力、吸收能力、删除项和平台门 | Structural scan + architecture review + ledger validation |

### 用户故事覆盖

| 用户故事 | 覆盖合同 |
|---|---|
| US-001 | AC-001—AC-003、AC-028 |
| US-002 | AC-004、AC-005、AC-025 |
| US-003 | AC-006、AC-007、AC-015—AC-017、AC-024 |
| US-004 | AC-008、AC-024 |
| US-005 | AC-009—AC-013、AC-017 |
| US-006 | AC-015—AC-017 |
| US-007 | AC-018—AC-022 |
| US-008 | AC-020、AC-023 |
| US-009 | AC-013、AC-024、AC-025 |
| US-010 | AC-025 |
| US-011 | AC-014、AC-016、AC-020、AC-026 |
| US-012 | AC-001、AC-027、AC-028 |

## 5. 范围

### IN

- 以 `v0.446.6` / `5f08a4f30203abb61dafac7dbb7ab92d11c23efa` 为冻结 target 的可审计 staged integration 和最终 ancestry。
- 冻结 target 中正常 runtime、session、provider、MCP、compaction、usage accounting、Memory Dream、Markdown、settings、persistence、安全与 build 更新。
- `main` Workspace lifecycle、File History、Agent 文件变化投影、History UI、diff、restore、deleted history、retention 和 quota。
- ResourceIO、Materialize、Transfer、ResourceEventBus、ProviderRootIdentity、唯一物理观察、唯一 baseline observation、策略拆分与四态健康。
- Document Extraction、Office 适配升级、Knowledge Office ingestion、资源/extractor version 驱动的缓存与重索引。
- Windows/macOS 原生门禁、production build/native packaging、去冗余、架构文档和 upstream sync ledger。

### REUSE

- 当前 ResourceIO、ResourceRef、ResourceAccessPolicy、ResourceEventBus、ResourceWatchRegistry、ProviderRootIdentity、Transfer 与现有安全/预算合同。
- 当前 Knowledge Workspace 的 Source Registry、Semantic IR、来源分区索引、Search、操作恢复、Workspace lifecycle 和 Workbench 产品语义。
- 冻结上游 File History store/policy/diff/restore 行为、recursive watcher 经验、Document Extraction、Materialize 和异步 `@` 搜索生命周期修复。
- 当前 Office 插件中没有被 canonical extraction 覆盖的 HTML/JSON、PDF 页范围等真实差异适配。
- 当前 Vitest、Playwright Knowledge user flows、Windows/macOS build 与 Electron package 工具链。

### OUT

- **OOS-001**：不把额外挂载提升为 Workspace，也不为挂载建立 Workspace File History。
- **OOS-002**：不新增 Workspace relocation 或跨目录延续旧 `main` 身份。
- **OOS-003**：不新增用户可见或跨功能公共 `workspaceId`。
- **OOS-004**：不把 File History 一次性泛化到所有 remote/non-local provider。
- **OOS-005**：不引入 OCR runtime；`scanned-pdf` 保持结构化失败。
- **OOS-006**：不合并 File History DB 与 Knowledge DB，也不统一二者 retention、policy 或模型。
- **OOS-007**：不自动把 extracted Markdown 写入 Workspace。
- **OOS-008**：不重写所有 Resource Provider、所有公开 Resource interface 或仅为目录整齐做大规模搬迁。
- **OOS-009**：不新增只有一个真实 adapter/consumer 的包装 interface。
- **OOS-010**：不保留双 watcher、双写、双 baseline walk、shadow watcher 或双 store 作为临时保险。
- **OOS-011**：不实现 legacy migration、旧 schema 兼容、migration marker、旧 Profile 导入、迁移回滚或旧数据清理。
- **OOS-012**：不把 Linux 设为本 umbrella change 的完成阻断平台。
- **OOS-013**：不直接追随浮动的 `upstream/main`；target 只使用冻结 commit。
- **OOS-014**：本 Spec 不授权 branch、tag、merge、commit、push、发布、部署或不可逆操作；实施到相应批准点时必须取得用户明确授权。

## 6. 已锁定实现约束

- **DEC-001**：上游正常功能、修复和优化默认吸收；只有真实 HanaKDE 产品、安全、数据或开放边界差异做语义融合。来源：`ADR-001`。
- **DEC-002**：一个 umbrella change 承载 ancestry 与 15 项完成门；Tickets 必须是垂直切片，Goal Plan 必须编排 Deep Ticket、共享路径与平台 Gate。来源：`USER-DECISION:umbrella-change`。
- **DEC-003**：`main` 是唯一 Workspace；切换工作目录等于切换 `main`；挂载不是 Workspace 且无 Workspace History。来源：`ADR-002`。
- **DEC-004**：不得新增公共 `workspaceId`；`sourceKey=main`、ResourceRef、ProviderRootIdentity 与 File History 私有 store key 各自只承担一个职责。来源：`ADR-007`。
- **DEC-005**：Workspace History 与 Agent 对话文件变化保留不同产品 scope 和入口，但共同复用可共享 primitive；不得创建第二物理事实源。来源：`ADR-003`。
- **DEC-006**：History 与 Knowledge 共享 ResourceEvent、资源版本、Root Identity 和 `main` baseline observation，但 DB、retention、policy、索引和恢复模型独立。来源：`ADR-005`。
- **DEC-007**：Document Extraction 完整吸收并升级 Office/Knowledge；重叠 parser 验证后删除，derived Markdown 不自动落盘，OCR 不在范围。来源：`ADR-004`。
- **DEC-008**：生产基础设施只允许 stop-then-start 直接切换；隔离验证不能连接同一真实 root；失败恢复同样先停后启。来源：`ADR-006`。
- **DEC-009**：统一健康状态固定为 `HEALTHY | DEGRADED | RECONCILING | FAILED`，并支持 Workspace/Resource scoped retry。来源：`ADR-010`。
- **DEC-010**：HanaKDE 未发布，本轮直接建立唯一新基线，不实现任何 legacy migration 或旧版本兼容。来源：`ADR-011`。
- **DEC-011**：Windows 与 macOS 是阻断平台，Linux 非阻断；两个阻断平台都必须有原生与 production/native package Evidence。来源：`ADR-008`。
- **DEC-012**：该能力属于 HanaKDE 系统本体。Resource Kernel、Workspace Infrastructure、History、Extraction、Knowledge wiring、Server 与 Desktop 各在现有系统层承担职责；Office 插件只保留真实产品适配，不拥有系统核心。来源：`USER-DECISION:feature-placement-confirmed`。
- **DEC-013**：相同用途 primitive 迁移到单一 owner 后必须删除重复实现；不为旧 fork 内部函数、parser 或 watcher 建立长期兼容壳。来源：`ADR-001`。
- **DEC-014**：已有 Knowledge 外部合同继续有效：活动根映射 `main`、已保存磁盘内容是持久知识事实、provider 证明 root identity、系统派生目录与用户来源分域、安全默认拒绝。来源：永久 `ADR-0002`、`ADR-0006`、`ADR-0016`、`ADR-0019`、`ADR-0023`。
- **DEC-015**：受影响 UI 垂直切片必须同时保持现有本地化、键盘、ARIA、主题和窄布局合同；Playwright 只覆盖必须串联真实用户操作的流程，其余以 Vitest 为默认门禁。来源：永久 `ADR-0018`、`ADR-0024`。

## 7. 数据、接口与兼容

- **公共接口变化：** 增加绑定当前已授权 `main` 的 History 查询/diff/restore interface、共享 Document Extraction interface、资源一致性健康状态以及必要的 additive ResourceEvent correlation metadata。History interface 使用 ResourceRef、相对逻辑地址或 opaque resource key 与 expected current version，不接受 raw workspace root 或新公共 `workspaceId`。具体 route 名称、DTO 字段和内部类名由 Ticket 在现有路由/schema 惯例内锁定，不能改变本节语义。
- **数据模型与持久化：** 新建 File History 私有 SQLite 基线，位于用户 Workspace 之外，仅由私有 `historyStoreKey` 定位。保存符合策略的物理 byte snapshots、版本、删除标记、origin、retention 和 quota 元数据。Knowledge 继续使用独立可重建 generation/index；需要记录足以判定 source/extraction/parser version 是否 stale 的派生版本信息。
- **兼容要求：** 完整吸收冻结上游正常行为；保留 HanaKDE 现有 Knowledge/Resource/Transfer/Workbench/安全与开放边界合同；Office 真实差异适配保持可用。事件 metadata 以 additive 方式演进，现有不识别 metadata 的 consumer 仍可工作。不会为旧 fork 内部实现、未发布 File History schema 或旧 Profile 提供兼容。
- **迁移要求：** 不适用：HanaKDE 尚未发布且用户明确要求颠覆性新基线。任何 migration、兼容窗口或 migration rollback 都属于范围偏差。
- **发布或运维影响：** staged merge、单 owner cutover、Windows/macOS 原生 Gate、clean install、production Electron package、native extractor assets、结构化健康/日志和 sync ledger 均为发布影响。创建 Git branch/tag、执行 merge/commit/push 或发布前仍需用户明确授权。

## 8. 非功能要求

- **NFR-001 安全与隐私：** ProviderRootIdentity、scope proof 和 effect 前重校验覆盖 restore、write、delete、rename、transfer、materialize 与 extraction；未知关系 fail closed；外部/LAN/Renderer 数据不泄漏绝对路径、scope token、文件正文或私有 root identity。
- **NFR-002 性能与容量：** watcher 数量随受观察 physical roots 增长而非随文件数或 consumer 数增长；同一 `main` 只有一次完整 baseline observation；高频同资源事件、History capture 与 Knowledge re-index 有界合并；Extraction 保留 50 MiB 输入上限；Transfer 保留现有 fixed process/stream budgets。
- **NFR-003 可用性与可靠性：** 内部事件、外部 watcher 和 baseline reconciliation 三条路径都可恢复一致性；ResourceEventBus 支持 sequence/catch-up；投影失败不回滚已提交文件事实；restore 结果最终在所有读取面一致；新 store 初始化失败不瘫痪未受影响能力。
- **NFR-004 可观测性与运营：** 可关联 source、脱敏 root identity、operation、resource、origin 和 sequence；至少可判断 watcher count/error、event/coalescing/gap、reconcile、History capture failure、extract result、Knowledge re-index 与 Transfer 活动状态；不得记录正文或对外广播绝对路径。
- **NFR-005 平台与打包：** Windows 与 macOS 分别执行原生 watcher/Root Identity/security/restore/native extraction/production package 验证；native converter 及依赖进入实际可运行 package；Linux 验证只记录附加风险。
- **NFR-006 用户体验与可访问性：** History、Agent 文件变化、健康和 retry 交互保持 HanaKDE 现有本地化、键盘、ARIA、主题和窄布局质量；UI 只展示必要状态与操作，不新增复杂运维界面或第二文件树产品壳。
- **NFR-007 可维护性：** 同用途 watcher、baseline walk、root helper、mutation path 和 parser 最终只有一个 owner；删除旧实现与仅验证旧实现细节的测试，在统一 interface 上保留行为合同。

## 9. 验证策略

| 接缝 | 层级 | 覆盖合同 | 现有先例或命令 | Evidence 类型 |
|---|---|---|---|---|
| Git target、merge-base、patch equivalence、overlap 与 ancestry | 固定点/仓库 | AC-001、AC-002、AC-028 | `git merge-base --is-ancestor 5f08a4f30203abb61dafac7dbb7ab92d11c23efa HEAD` 及只读审计命令 | SHA、命令输出、sync ledger |
| ResourceEventBus、ResourceWatchRegistry、ProviderRootIdentity、Transfer | 稳定 Module interface | AC-009—AC-014、AC-023、AC-026 | `<Path>tests/resource-event-bus.test.ts</Path>`、`<Path>tests/resource-watch-registry.test.ts</Path>`、`<Path>tests/provider-root-identity.test.ts</Path>`、`<Path>tests/resource-io-transfer.test.ts</Path>` | Vitest 结果、factory/scan counters |
| File History store、policy、capture、route 与 restore | Domain/HTTP integration | AC-005—AC-008、AC-015—AC-017、AC-025—AC-026 | 冻结上游先例 `<Path>tests/file-history-store.test.ts</Path>`、`<Path>tests/file-history-service.test.ts</Path>`、`<Path>tests/file-history-route.test.ts</Path>`；整合后在统一 interface 重写/扩展 | Vitest、SQLite fixture、filesystem assertions |
| Document Extraction 与 Materialize | Domain/Resource integration | AC-018—AC-023、AC-026 | 冻结上游先例 `<Path>tests/document-extract-unit.test.ts</Path>`、`<Path>tests/document-extract-integration.test.ts</Path>`、`<Path>tests/resource-io-materialize-tool.test.ts</Path>`；当前 `<Path>tests/office-plugin-tools.test.ts</Path>` | 格式 fixture、失败矩阵、staging cleanup |
| Knowledge event/index/search | 跨 Module integration | AC-003、AC-011—AC-013、AC-017、AC-021—AC-022 | `<Path>tests/knowledge-index-runtime.test.ts</Path>`、`<Path>tests/knowledge-index-event-coordinator.test.ts</Path>`、`<Path>tests/knowledge-index-rebuild.test.ts</Path>`、`<Path>tests/knowledge-query-api.test.ts</Path>` | Vitest、index/query assertions |
| Workbench、Agent 文件变化、History UI、`@` 生命周期和健康 UI | 用户行为/组件 | AC-004、AC-008、AC-013、AC-017、AC-024 | 当前 React tests、冻结上游 `<Path>desktop/src/react/__tests__/components/FileHistoryModal.test.tsx</Path>`、`npm run test:knowledge:e2e` | Vitest DOM、Playwright screenshot/trace |
| Root replacement、symlink/junction、越界与恶意 workspace | 安全 E2E | AC-014、AC-016、AC-020、AC-026—AC-027 | `<Path>tests/knowledge-malicious-workspace.test.ts</Path>`、`<Path>tests/knowledge-threat-control-matrix.test.ts</Path>` 及平台原生 fixtures | 平台结果、稳定拒绝、磁盘未变 |
| 基础质量门 | 仓库 | AC-002、AC-003、AC-028 | `npm ci`、`npm test`、`npm run typecheck`、`npm run lint`、`npm run build:client` | 命令、exit status、失败分类 |
| Windows production/native | 平台/Package | AC-009—AC-010、AC-014—AC-023、AC-027 | `npm run dist:win` 加 Windows 原生 watcher、junction、locked-file、restore 与 package smoke | Windows runner、installer/package smoke |
| macOS production/native | 平台/Package | AC-009—AC-010、AC-012—AC-023、AC-027 | `npm run dist` 加 recursive watcher、descriptor、sleep/resume、symlink、restore 与 package smoke | macOS runner、DMG/app smoke |
| 去冗余与架构/ledger | 结构审查 | AC-009—AC-012、AC-021—AC-023、AC-028 | owner factory assertions、调用点扫描、parser/watcher/baseline inventory、architecture review | 零重复调用点清单、文档审查 |

所有完成 Evidence 写入后续 Ticket 对应的 `<Path>{roots.state}/specdev/changes/2026-08-09-openhanako-v0-446-6-integration/evidence/{ticket-id}.md</Path>`。Windows/macOS 原生结果不得由 mock、Linux 或单元测试替代；未运行项必须分类并保持阻断状态。

## 10. 风险、假设与未决问题

### 风险

- 整合横跨大量文件并有共享核心 overlap；当前工作树还有用户/并行 change 修改。实施前未重新冻结事实会让 merge audit 和路径所有权失真。
- 上游 File History 当前自行拥有 watcher、baseline 和 path-based workspace identity；直接合入会违反单 owner、Root Identity 和 `main` scope 合同。
- Desktop legacy watcher、ResourceWatchRegistry、Knowledge watch lease 与上游 watcher 同时存在；切换顺序错误会造成重复事件或观察空窗。
- Document Extraction 的 native/runtime 依赖可能只在开发环境可用而未进入 Electron package；Windows/macOS 必须分别证明实际 package 可加载。
- restore 跨 History、ResourceIO、Knowledge 和 UI，任何 bypass write 或 expected-version 缺失都可能造成数据覆盖或派生不一致。
- 删除重复 parser 或 watcher 前若只比较函数名而不比较行为，会丢失 Office 特有输出、安全预算或平台修复；删除条件必须绑定合同 Evidence。
- staged merge、branch/tag 和 package Gate 有外部副作用或平台依赖；规划完成不代表已授权执行。

### 已采用的低影响假设

- Ticket 拆分时可以调整内部模块名称和项目路径，只要不改变本 Spec 的公共行为、数据、安全、scope、平台和验证合同；开始每个 Ticket 前用实际整合树重新解析路径。
- 具体 HTTP route 名称、健康 DTO 形状和 additive event metadata 字段遵循整合后现有 schema/route 惯例；其外部语义由 AC-013、AC-015—AC-017、AC-026 锁定。
- Linux 测试在资源允许时运行并记录，但其结果不改变 Windows/macOS 阻断结论。

### 未决问题

无。

## 11. Umbrella Definition of Done 追踪

| DoD | 完成条件 | 验收合同 |
|---|---|---|
| 1 | `v0.446.6` 是最终 HEAD ancestor | AC-001 |
| 2 | HanaKDE Knowledge / Resource / Workbench 无回退 | AC-002、AC-003 |
| 3 | `main` File History 完整，Agent 变化使用共享底层投影 | AC-005—AC-008、AC-024 |
| 4 | Document Extraction 完整可用 | AC-018—AC-020 |
| 5 | Office 文档通过统一 Extraction 进入 Knowledge | AC-021、AC-022 |
| 6 | Materialize 与 Transfer 同时存在且语义清晰 | AC-023 |
| 7 | Root Identity 是统一 physical root authority | AC-014、AC-016、AC-026 |
| 8 | 同一 Workspace root 无多个业务 physical watcher | AC-009、AC-010 |
| 9 | ResourceEventBus 是统一 mutation fan-out | AC-011 |
| 10 | Baseline reconciliation 不重复完整扫描同一 root | AC-012 |
| 11 | Restore 后 Disk / Preview / History / Knowledge / Agent Read 一致 | AC-015—AC-017 |
| 12 | Windows/macOS 关键门禁通过 | AC-027 |
| 13 | Package/native production build 可用 | AC-027 |
| 14 | 重复基础设施和重叠 parser 被删除 | AC-021—AC-023、AC-028 |
| 15 | 架构与 upstream sync ledger 进入仓库 | AC-001、AC-028 |
