# openhanako v0.446.6 整合设计日志

本日志按轮次追加当前 change 的事实、决定、延后与替代轨迹。指定集成计划是受当前仓库事实约束的设计基线，不是可以跳过现状审核的实现授权。

## LOG-001 — 2026-08-09T10:08:37+08:00 — 冻结本地输入与仓库事实
- **设计树节点：** 不适用
- **轮次与依赖：** round 0 / 无
- **状态：** confirmed
- **问题：** 为新 change 冻结可复现的输入边界与当前仓库基线。
- **事实与来源：** 用户指定的计划现位于 `<Path>{roots.state}/specdev/changes/2026-08-09-openhanako-v0-446-6-integration/HanaKDE-openhanako-v0.444.1-integration-plan.md</Path>`；初始摄入时 SHA-256 为 `887dbca1a84b7218a70cf7ef9fe8a7955fdd30bccb7ba5fcf329d764b0e7abbf`。本地 `v0.444.1^{commit}` 为 `cc19cb49b0786d61ed723764e0a83baf87887270`，当时 `hanakde` HEAD 为 `ed9699fbed09c0e22e91ac8633697e9df248b0fa`，merge-base 为 `ef8a6f700191c2486effd3761a4bd2b7f3ad774c`，`hanakde...v0.444.1` 左右提交计数为 `198/275`；这些是被后续 LOG-006/009/024 更新的初始历史事实。
- **选项：** 不适用；这是只读发现。
- **推荐：** 后续所有 merge 与差异审计继续固定到上述完整 commit，不读取移动的 `upstream/main` 作为本轮输入。
- **结论：** 新 change 使用冻结的本地计划和 tag/commit 事实启动；尚未执行 fetch、merge、tag、branch、commit 或产品实现。
- **原因：** 固定输入才能让冲突集合、测试证据与架构审计可复现。
- **影响工件：** Spec / Ticket / Goal Plan
- **约束或不变量：** 本轮上游目标不得静默漂移。
- **后续：** 当前 G work 通过设计树确认计划权威与冲突裁决后再路由 Spec。
- **替代/被替代：** 无

## LOG-002 — 2026-08-09T10:08:37+08:00 — 功能落点判定
- **设计树节点：** 不适用
- **轮次与依赖：** round 0 / 无
- **状态：** confirmed
- **问题：** 此整合能力应落入内置插件还是 HanaKDE 系统本体。
- **事实与来源：** `feature-placement` 判定门；候选设计要求修改 ResourceIO、Root Identity、ResourceEventBus、Engine 装配、Workspace 生命周期、持久化迁移、安全校验、Server API、Electron/Desktop 生命周期与跨平台构建。
- **选项：** 内置插件；HanaKDE 系统本体。
- **推荐：** HanaKDE 系统本体。
- **结论：** 落点为系统本体；主契约位于 `<Path>lib/resource-io/**</Path>` 与建议新增的 `<Path>lib/workspace-runtime/**</Path>`，由 `<Path>core/engine.ts</Path>` 装配，并通过 `<Path>server/routes/**</Path>`、`<Path>desktop/**</Path>` 暴露产品行为。
- **原因：** 同时命中特权子系统、共享契约原语、启动期常驻基础设施三道破盒硬门；删除该能力会使 Resource/Workspace 基础契约和其他模块依赖失效，插件贡献面及权限模型不能完整容纳。
- **影响工件：** ADR / Spec / Ticket / Goal Plan
- **约束或不变量：** 插件只能消费未来稳定契约，不拥有物理 watcher、Root Identity、安全策略或系统级持久化。
- **后续：** G work 继续确认系统本体内部的产品与架构合同。
- **替代/被替代：** 无

## LOG-003 — 2026-08-09T10:08:37+08:00 — 检出既有 Knowledge Workspace 合同冲突
- **设计树节点：** D-003
- **轮次与依赖：** round 0 / D-001
- **状态：** deferred
- **问题：** 旧 change 将“切换工作目录”定义为打开全新 workspace；新计划又提出可保持 `workspaceId` 的显式 relocation，两者不能同时作为未加限定的合同。
- **事实与来源：** `<Path>{roots.state}/specdev/changes/2026-07-24-openhanako-knowledge-workspace/spec.md</Path>` 与其 LOG/ADR；当前计划 `<Path>{roots.state}/specdev/changes/2026-08-09-openhanako-v0-446-6-integration/HanaKDE-openhanako-v0.444.1-integration-plan.md</Path>` 的原始第 7 节。该旧 relocation 方案已由 LOG-008/016 和计划 v2.0 正文替代。
- **选项：** 保持旧语义；由本 change 显式替代为可 relocation 的长期逻辑 workspace；拆分“普通切换”和“明确迁移”两种动作。
- **推荐：** 拆分两种动作：普通切换仍创建新 workspace，只有独立且需确认的 relocation 流程保持 `workspaceId`。
- **结论：** 尚未确认；等待 D-001 明确计划权威后进入后续 frontier。
- **原因：** 这会改变身份、历史归属、迁移、安全提示和 API 行为，不能由实现者猜测。
- **影响工件：** CONTEXT / ADR / Spec / Ticket / Goal Plan
- **约束或不变量：** 在确认前不得把 path hash、`sourceKey` 或 `workspaceId` 静默互相等同。
- **后续：** 用户回答 D-001 后询问 D-003。此延后阻止 Spec/Ticket Ready。
- **替代/被替代：** 无

## LOG-004 — 2026-08-09T10:17:01+08:00 — 确认受仓库事实约束的计划基线
- **设计树节点：** D-001
- **轮次与依赖：** round 1 / 无
- **状态：** confirmed
- **问题：** 指定集成计划在本 change 中拥有什么权威，以及如何处理它与当前代码现实的偏差。
- **事实与来源：** 用户回答“采用推荐方案，但是同时也认真审核以符合现在 hanakde 的仓库现状”；当前仓库已经存在计划未完整反映的 ResourceWatchRegistry、Knowledge Index 事件协调、Workspace UI path-keyed state、Desktop legacy watch IPC、Office 内置插件等实现。
- **选项：** 把计划逐字视为不可复核合同；把计划降为普通候选；采用受仓库事实约束的设计基线。
- **推荐：** 采用受仓库事实约束的设计基线。
- **结论：** 计划中的明确目标、架构不变量、non-goals、模块所有权和验收要求默认进入下游合同；但必须逐项对照当前 `hanakde`、既有 change 合同、固定 `v0.444.1` tag 与真实 scripts。仓库事实能证明设计需要调整时，必须在设计树/LOG 中显式裁决；代码事实不能静默改变用户目标。
- **原因：** 既保留 4,630 行方案已经完成的高价值设计工作，又避免按照过时路径、缺失模块假设或旧生命周期实施。
- **影响工件：** CONTEXT / ADR / Spec / Ticket / Goal Plan
- **约束或不变量：** 不照抄机器路径、建议文件名、checkpoint 列表或虚构脚本；不因当前实现存在就默认它是最终 owner；不因计划声明 Final 就跳过冲突审计。
- **后续：** 以当前仓库审计后的 round 2 frontier 继续关闭交付边界、身份冲突、Git 拓扑及功能边界。
- **替代/被替代：** 无

## LOG-005 — 2026-08-09T10:17:01+08:00 — Round 2 当前仓库差距审计
- **设计树节点：** 不适用
- **轮次与依赖：** round 2 / D-001
- **状态：** confirmed
- **问题：** 识别计划与当前 `hanakde` 的关键差距，避免把已经存在、职责不同或已被替代的实现当成空白绿地。
- **事实与来源：** `<Path>lib/resource-io/root-identity.ts</Path>` 已有 ProviderRootIdentityBroker；`<Path>lib/resource-io/resource-event-bus.ts</Path>` 已有 sequence、subscribe、since/stale 和版本去重；`<Path>lib/resource-io/resource-watch-registry.ts</Path>` 已按 resourceKey/refCount 共享 backend watch，但仍以目标 Resource 为粒度且缺少 workspace baseline/reconcile owner；`<Path>core/knowledge-workspace/knowledge-index-runtime.ts</Path>` 已要求 ResourceWatchRegistry，Renderer 已有静态门禁禁止直接 native watch；`<Path>desktop/workspace-watch-registry.cjs</Path>`、`<Path>desktop/file-watch-registry.cjs</Path>` 及 preload IPC 仍保留 legacy native watcher；Workspace UI state 当前仍以规范化 path 为 key；当前分支没有 File History 或 `lib/document-extract/`，但 Office 读取已有 `<Path>plugins/office/</Path>` 消费 ResourceIO materialize 的插件实现。
- **选项：** 不适用；这是只读现状审核。
- **推荐：** 把目标描述为“演进和收敛现有 ResourceWatchRegistry/Knowledge pipeline，并退役重复 Desktop watcher”，而不是从零新建全部 Resource/Workspace 平台；DocumentExtractionService 复用上游 extractor 作为系统派生内容契约，但需避免与 Office 插件文档读取职责混淆。
- **结论：** 原计划方向仍成立，但施工边界必须从当前实现出发：保留已更强的 Resource 身份/事件/Knowledge 合同，吸收上游缺失行为，并用验证证明哪些 watcher 可删除、哪些只是 Electron lifecycle bridge。
- **原因：** 当前代码已经实现了相当部分目标能力，同时仍存在多个不同生命周期的 watcher 和 path-keyed 持久状态；机械新增 `WorkspaceWatchCoordinator` 会制造新的重复 owner。
- **影响工件：** ADR / Spec / Ticket / Goal Plan
- **约束或不变量：** 每个待删除 watcher 必须先审计真实职责；既有 Office 插件不升级为系统安全或持久化 owner；现有 stronger contracts 不得因 merge 降级。
- **后续：** Round 2 用户决策后继续细化单 owner 迁移、身份 schema、兼容窗口与门禁。
- **替代/被替代：** 无

## LOG-006 — 2026-08-09T10:23:04+08:00 — 并发合并后的当前基线复核
- **设计树节点：** 不适用
- **轮次与依赖：** round 2 / D-001
- **状态：** confirmed
- **问题：** 审计期间当前 `hanakde` HEAD 从 `ed9699fb` 变为 `bf4c6ee5`，是否需要重做现状审核或改变设计结论。
- **事实与来源：** 当前 HEAD 为 `bf4c6ee57891324fe686f63780092f5240e61bec`，新增两个实际提交和一个 merge commit；`git diff ed9699fb..bf4c6ee5` 为空，说明这些提交的最终项目树与原冻结基线相同。merge-base 仍为 `ef8a6f700191c2486effd3761a4bd2b7f3ad774c`，`HEAD...v0.444.1` 提交计数更新为 `201/275`。
- **选项：** 忽略并发 HEAD；完全重做审计；更新提交身份并保留已验证的树级结论。
- **推荐：** 更新提交身份并保留树级结论。
- **结论：** 本 change 的当前下游提交基线更新为 `bf4c6ee57891324fe686f63780092f5240e61bec`；Round 2 代码现状结论无需重做，因为项目树无差异。
- **原因：** Git topology 变化会影响 ancestry/提交计数，但空 tree diff 不改变模块、接口、测试和 overlap 文件事实。
- **影响工件：** Spec / Ticket / Goal Plan
- **约束或不变量：** 后续建立实际 integration branch/worktree 时必须重新冻结当时 HEAD，不能假定本次访谈 SHA 永久不变。
- **后续：** 继续 Round 2 frontier；D-004 和后续 Goal Plan 使用最新基线。
- **替代/被替代：** LOG-001 中的下游 HEAD/左右计数已被本条更新；上游 target 与 merge-base 未变。

## Research: 冻结 openhanako v0.446.6 上游目标
- Decision / target: 确认用户指定的最新上游 tag、精确 commit、发布性质及相对原计划的增量；owner 为当前 G work，目标工件为本 LOG。
- Scope / version: 官方仓库 `liliMozi/openhanako`，`v0.444.1..v0.446.6`。
- Stop condition: 官方 Git tag、GitHub release API 与本地 fetch 后 Git 对象一致。

### R-001
- Claim: 官方 tag `v0.446.6` 存在，精确 commit 为 `5f08a4f30203abb61dafac7dbb7ab92d11c23efa`，并且是 `v0.444.1` 的后代。
- Type: official fact
- Source: `<Url>https://github.com/liliMozi/openhanako/releases/tag/v0.446.6</Url>`；官方 Git refs；本地 `git merge-base --is-ancestor v0.444.1 v0.446.6`。
- Confidence: high
- Limits: tag 可被远端维护者未来移动；本 change 以本次冻结的完整 commit 为准。
- Artifact impact: 更新 change 名称、Git 完成门和所有后续 Spec/Ticket target。

### R-002
- Claim: GitHub 将 `v0.446.6` 标记为 prerelease，发布时间为 2026-08-08T18:52:57Z；“latest stable” API 仍返回 `v0.444.1`。用户已明确选择更新的 prerelease。
- Type: official fact / user decision
- Source: `<Url>https://github.com/liliMozi/openhanako/releases/tag/v0.446.6</Url>`；GitHub Releases API；本轮用户回答。
- Confidence: high
- Limits: “最新”区分最新 tag 与 latest stable；本 change 使用用户指定的最新 tag。
- Artifact impact: 风险和发布门必须注明 prerelease 输入，但不得自动降回 `v0.444.1`。

### R-003
- Claim: `v0.444.1..v0.446.6` 有 11 个提交、51 个文件变化，主要新增 per-agent Memory Dream，并包含压缩菜单优先级和 Markdown 裸 URL 可见性修复；相对 HanaKDE 当前分叉新增 18 个 overlap 文件，总 overlap 从 48 增至 50。
- Type: official fact / code fact
- Source: 官方 release digest；本地 `git log`、`git diff` 与 overlap 计算。
- Confidence: high
- Limits: overlap 只说明双方都改过文件，不等于语义冲突。
- Artifact impact: Freeze/Audit、Spec 范围、Memory 纵向 Ticket、持久化与编辑器验收。

### Conflicts and Unknowns
- `v0.446.6` 的 Memory Dream 触及 HanaKDE 已增强的 memory ticker、Facts/Long-term 编译、持久化 registry 和 Agent settings；必须做语义融合，但用户已决定正常上游迭代默认吸收，不创建旧内部兼容层。

### Recommendation
冻结 `5f08a4f30203abb61dafac7dbb7ab92d11c23efa` 为新目标；保留原 `v0.444.1` 计划作为 Resource/Knowledge 设计来源，并新增 `v0.444.1..v0.446.6` 的 Memory/Editor/Build 审计切片。

## LOG-007 — 2026-08-09T10:39:29+08:00 — 采用单一 umbrella change
- **设计树节点：** D-002
- **轮次与依赖：** round 2 / D-001
- **状态：** confirmed
- **问题：** 大规模上游跟随与跨层融合采用一个还是多个 change。
- **事实与来源：** 用户回答“一个 umbrella change”；目标更新后 HanaKDE/上游差异文件为 747/671，overlap 为 50。
- **选项：** 单一 umbrella change；按阶段拆成多个独立 change。
- **推荐：** 单一 umbrella change，内部以 Deep Spec、Tickets 和 Goal Plan 分 Wave。
- **结论：** 全部上游 ancestry、正常迭代吸收、Resource/Workspace/History/Knowledge/Office/Memory/UI 融合及最终发布门由本 change 统一负责。
- **原因：** 这些切片共享 ancestry、单一 owner 和跨模块一致性完成条件，拆开会允许局部“完成”但系统尚未收敛。
- **影响工件：** Spec / Ticket / Goal Plan
- **约束或不变量：** 内部必须纵向切片并分 Wave，不能形成一个不可审计的大 Ticket。
- **后续：** D-005/D-010 继续决定迁移和发布门。
- **替代/被替代：** 无

## LOG-008 — 2026-08-09T10:39:29+08:00 — 不新增 Workspace relocation 语义
- **设计树节点：** D-003
- **轮次与依赖：** round 2 / D-001
- **状态：** confirmed
- **问题：** 工作目录、主 Workspace、额外挂载与候选 relocation 的关系。
- **事实与来源：** 用户说明工作目录就是主 Workspace，可增加额外目录作为链接/挂载；目标是跟随上游并保留 HanaKDE 文件资源管理与编辑器增强，而非新增迁移产品。
- **选项：** 新增保持 workspaceId 的 relocation；普通切换与 relocation 双动作；不新增 relocation。
- **推荐：** 不新增 relocation。
- **结论：** 工作目录就是唯一主 Workspace `main`；切换工作目录就是切换主 Workspace。额外目录只作为挂载。现有 path-keyed UI state 按当前切换语义处理，不为 relocation 设计额外兼容迁移。
- **原因：** 原计划的 relocation 是超出用户整合目标的推演，不是上游同步所必需；保留它会引入身份、迁移和回滚复杂度。
- **影响工件：** CONTEXT / ADR / Spec / Ticket
- **约束或不变量：** Root Identity 仍用于安全和范围证明；不得由挂载自动提升或替换 main。
- **后续：** D-006 收敛是否还需要新 workspaceId。
- **替代/被替代：** LOG-003 的 relocation 推荐被本条替代。

## LOG-009 — 2026-08-09T10:39:29+08:00 — 更新并冻结上游目标为 v0.446.6
- **设计树节点：** D-004
- **轮次与依赖：** round 2 / D-001
- **状态：** confirmed
- **问题：** 上游目标与 Git 整合拓扑。
- **事实与来源：** 用户指定最新 `v0.446.6`；Research R-001—R-003 证实官方 prerelease tag、commit 与增量。
- **选项：** 保持 `v0.444.1` stable；跟随移动 main；冻结 `v0.446.6` 并 staged merge。
- **推荐：** 冻结 `v0.446.6` commit 并 staged merge。
- **结论：** 本轮上游目标改为 `v0.446.6` / `5f08a4f30203abb61dafac7dbb7ab92d11c23efa`。继续采用可审计 staged merge；checkpoint 由本地 ancestry、行为密度和 overlap 决定，最终该 commit 必须成为 HEAD ancestor。
- **原因：** 满足用户跟随最新上游的目标，同时保持输入可复现。
- **影响工件：** ADR / Spec / Ticket / Goal Plan
- **约束或不变量：** 不追移动 main；不因 prerelease 标签自动舍弃用户指定目标；实际实施开始时重新冻结下游 HEAD。
- **后续：** D-005 决定切换策略；Spec 新增 Memory Dream 增量范围。
- **替代/被替代：** LOG-001 的 `v0.444.1` 当前目标被本条替代；其计划 hash 和历史事实继续保留。

## LOG-010 — 2026-08-09T10:39:29+08:00 — Workspace File History 只覆盖 main
- **设计树节点：** D-008
- **轮次与依赖：** round 2 / D-001
- **状态：** confirmed
- **问题：** File History 首期来源范围。
- **事实与来源：** 用户确认只有 main 才是真正工作空间，其他目录只是额外挂载。
- **选项：** main；所有本地可写来源；所有 provider。
- **推荐：** 只覆盖 main。
- **结论：** Workspace File History 只捕获主 Workspace `main`；额外挂载不进入该历史，也不创建独立 history DB。
- **原因：** 与产品领域层级一致，避免把附加目录扩张成多 Workspace 模型。
- **影响工件：** CONTEXT / ADR / Spec / Ticket
- **约束或不变量：** 挂载仍保留既有文件管理、编辑与 Knowledge 能力；不因没有 File History 降格为只读。
- **后续：** D-006 确定 main 的内部身份；D-010 确定 History 平台门。
- **替代/被替代：** LOG-005 中“所有来源可能共享 Workspace History”的候选范围被本条收紧。

## LOG-011 — 2026-08-09T10:39:29+08:00 — 两类文件历史保留不同入口并共享底层能力
- **设计树节点：** D-009
- **轮次与依赖：** round 2 / D-001
- **状态：** confirmed
- **问题：** Workspace File History 与 Agent 对话文件变更历史是否冲突。
- **事实与来源：** 用户指出前者面向工作目录/工作空间，后者面向 Agent 对话时的文件变动，两者不冲突；底层操作逻辑与代码应尽可能一致和复用。
- **选项：** 合并成单一 UI；只保留 Workspace 历史；保留两个产品投影并共享 primitive。
- **推荐：** 保留两个产品投影并共享 primitive。
- **结论：** 两类历史保留各自 scope 和入口。Workspace 历史以 main 为范围；Agent 历史按对话/操作过滤。两者共享 ResourceIO、事件、版本、快照、diff、restore 和物理观察中语义相同的能力，不重复实现底层事实源。
- **原因：** 产品问题不同，但底层资源事实相同。
- **影响工件：** CONTEXT / ADR / Spec / Ticket
- **约束或不变量：** Agent 维度只能是查询/投影上下文，不能成为重复物理 history store 或 watcher owner。
- **后续：** D-010 确认产品/平台门；Ticket 决定共享服务和两个 UI 接入点。
- **替代/被替代：** 原 D-009“不保留上游 agentId modal”的绝对推荐被本条细化；是否复用具体组件由现有 UI 审核决定。

## LOG-012 — 2026-08-09T10:39:29+08:00 — 将上游 Extraction 作为 Office 正常升级吸收
- **设计树节点：** D-011
- **轮次与依赖：** round 2 / D-001
- **状态：** confirmed
- **问题：** 上游 Document Extraction 与现有 Office 插件解析器的关系。
- **事实与来源：** 用户认为可以完整接受变化，这是 Office 插件的升级优化；正常上游迭代应全盘接受，重点是识别真正的 HanaKDE 二开影响面。
- **选项：** 永久并列两套 parser；保留旧 Office 实现拒绝上游；以上游 Extraction 升级并语义融合真实差异。
- **推荐：** 以上游 Extraction 升级并语义融合真实差异。
- **结论：** 完整吸收上游 Extraction。现有 Office parser 在语义重叠处迁移并删除；HTML/JSON 等真实差异能力作为适配保留。Derived Markdown 不自动落盘，OCR 不进入本轮。
- **原因：** 这是正常升级，不是需要为旧实现制造兼容层的产品冲突。
- **影响工件：** ADR / Spec / Ticket
- **约束或不变量：** Resource 授权、Materialize 生命周期、输入预算和 native packaging 必须保持或加强。
- **后续：** Spec 写出格式/输出合同，Ticket 用行为测试证明可删除哪些 parser。
- **替代/被替代：** 无

## LOG-013 — 2026-08-09T10:39:29+08:00 — History 与 Knowledge 共享观察事实
- **设计树节点：** D-012
- **轮次与依赖：** round 2 / D-001
- **状态：** confirmed
- **问题：** History 与 Knowledge 的一致性边界。
- **事实与来源：** 用户同意推荐方案；当前 Knowledge 已消费 ResourceEvent 但仍有完整 rebuild 扫描。
- **选项：** 完全独立观察；合并数据库；共享观察事实、保持领域派生独立。
- **推荐：** 共享观察事实、保持领域派生独立。
- **结论：** 共享 ResourceEvent、资源版本、Root Identity 和 main baseline observation；History 与 Knowledge 分别执行 scoped repair。DB、retention、policy、索引与恢复语义保持独立。
- **原因：** 消除重复物理扫描和竞争当前状态，同时保留两个领域模型。
- **影响工件：** ADR / Spec / Ticket / Goal Plan
- **约束或不变量：** Restore 必须经 ResourceIO；同一 main 不允许各业务服务独立 full walk 来发现变化。
- **后续：** D-013 在 D-005 后决定降级/恢复状态。
- **替代/被替代：** 无

## LOG-014 — 2026-08-09T10:39:29+08:00 — 确认跟随式融合与去冗余总原则
- **设计树节点：** D-016
- **轮次与依赖：** round 2 / D-001
- **状态：** confirmed
- **问题：** 如何在上游正常迭代与 HanaKDE 二开之间设定默认裁决。
- **事实与来源：** 用户明确本轮是 fork 的跟随迭代更新，应尽可能融合到当前架构；同类功能/代码不得冗余或重复设计，不应设计过多兼容。
- **选项：** HanaKDE 内部实现默认优先；上游覆盖一切；上游正常迭代默认接受、真实合同冲突才语义融合。
- **推荐：** 上游正常迭代默认接受、真实合同冲突才语义融合。
- **结论：** 上游正常功能、修复与优化默认完整吸收；HanaKDE 只有产品、安全、数据、开放边界等真实合同差异才触发语义融合。同类型 primitive 必须单一 owner，迁移验证后删除旧重复实现，不保留长期兼容壳。
- **原因：** 这是 fork 可持续跟随且保留二开价值的最小复杂度策略。
- **影响工件：** CONTEXT / ADR / Spec / Ticket / Goal Plan
- **约束或不变量：** “当前已有代码”不是保留依据；“来自上游”也不是降低 HanaKDE 已确认安全/数据合同的依据。
- **后续：** 所有下游工件用该原则分类 overlap。
- **替代/被替代：** 无

## LOG-015 — 2026-08-09T11:35:52+08:00 — 基础设施不允许临时双运行
- **设计树节点：** D-005
- **轮次与依赖：** round 3 / D-002, D-004
- **状态：** confirmed
- **问题：** Resource/History/Knowledge 与 legacy watcher 收敛时是否允许影子双读或其他临时双运行。
- **事实与来源：** 用户回答“不允许临时双运行，一步到位”。
- **选项：** 测试/影子阶段短暂双读；直接单 owner 切换；长期双运行。
- **推荐：** 原推荐允许隔离的短暂双读，但生产 mutation、watcher 和 baseline 始终单 owner。
- **结论：** 采用更严格的一步到位切换。新路径只能在不接入同一真实 root 的隔离环境验证；正式切换和回滚都执行 stop-then-start，任何时刻不允许双 watcher、双 mutation 或双 baseline walk。
- **原因：** 与本 change 的单一 owner 和去冗余原则完全一致，避免过渡链成为第二事实源。
- **影响工件：** CONTEXT / ADR / Spec / Ticket / Goal Plan
- **约束或不变量：** 不能以影子验证、回滚安全或迁移观察为理由临时同时接入同一 root。
- **后续：** D-013 决定单 owner 链路降级、事件 gap 与 reconciliation 失败的可见状态。
- **替代/被替代：** 替代 D-005 原推荐中“测试/影子比对可短暂双读”的部分。

## LOG-016 — 2026-08-09T11:35:52+08:00 — 不引入新的 workspaceId
- **设计树节点：** D-006
- **轮次与依赖：** round 3 / D-003, D-008
- **状态：** confirmed
- **问题：** 拒绝 Workspace relocation 后，`main` 是否仍需全新长期逻辑身份。
- **事实与来源：** 用户回答“不引入”；当前 HanaKDE 已有 Workspace/Knowledge 生命周期、`sourceKey=main`、ResourceRef 与 ProviderRootIdentity。
- **选项：** 新公共 workspaceId；复用现有身份 primitive，仅增加 File History 私有存储键。
- **推荐：** 不引入新公共 workspaceId。
- **结论：** `main` 复用现有生命周期和身份 primitive。File History 可使用必要的私有存储键，但该键不得成为用户可见或跨功能公共身份。
- **原因：** 新 workspaceId 的主要理由是 relocation 和跨路径延续；这两项已不在产品合同中，继续引入只会扩大迁移与兼容面。
- **影响工件：** CONTEXT / ADR / Spec / Ticket
- **约束或不变量：** 不把 raw path hash、ResourceRef、ProviderRootIdentity 或私有 history key 互相等同。
- **后续：** D-007 只审查真实持久化数据，不再假设需要 workspaceId 迁移。
- **替代/被替代：** 原计划的长期 workspaceId 方案在本 change 中被替代。

## LOG-017 — 2026-08-09T11:35:52+08:00 — 平台阻断门限定为 Windows 与 macOS
- **设计树节点：** D-010
- **轮次与依赖：** round 3 / D-002, D-008, D-009
- **状态：** confirmed
- **问题：** 哪些平台的原生验证必须阻止 umbrella change 完成。
- **事实与来源：** 用户回答“只需要 windows 和 macos”；仓库存在 Windows/macOS 原生路径、Electron 构建和平台特定测试，同时也保留 Linux 构建配置。
- **选项：** Windows/macOS/Linux 全阻断；仅 Windows/macOS 阻断；单一平台阻断。
- **推荐：** 原推荐要求三个平台全部阻断。
- **结论：** 只有 Windows 和 macOS 是平台阻断门；两者的安全、文件监听、production build 和 native extraction packaging 必须通过。Linux 验证失败不阻止本 change 完成。
- **原因：** 按用户实际发布目标限定 umbrella change 完成面。
- **影响工件：** CONTEXT / ADR / Spec / Ticket / Goal Plan
- **约束或不变量：** 非阻断 Linux 不得降低跨平台代码质量，也不得代替 Windows/macOS 原生证据；若未来要求 Linux 发布，另行建立门禁。
- **后续：** D-015 将 Windows/macOS Evidence 纳入最终 Definition of Done。
- **替代/被替代：** 替代 D-010 原推荐中的 Linux 阻断要求。

## LOG-018 — 2026-08-09T11:41:33+08:00 — 只迁移真实存在的持久化数据
- **设计树节点：** D-007
- **轮次与依赖：** round 4 / D-006
- **状态：** confirmed
- **问题：** 拒绝新 workspaceId 且当前无已发布 File History 后，还应为哪些数据设计迁移与兼容窗口。
- **事实与来源：** 用户确认推荐方案；当前 HanaKDE 没有 Workspace File History 实现或用户旧库，现有 Workspace UI/Profile/Knowledge 数据也不因 D-006 改变身份合同。
- **选项：** 为假设旧格式预建兼容；只迁移真实已发布且 schema 改变的数据。
- **推荐：** 只迁移真实已发布且 schema 改变的数据。
- **结论：** 不为不存在的旧 File History DB 制造兼容层，不借本功能改写合同未变的 Workspace UI、Profile 或 Knowledge 数据。真实迁移必须幂等、先备份、失败保留原数据；清理另做显式 change。
- **原因：** 迁移代码本身具有数据风险，必须由可证明的用户数据路径驱动，而不是由过时计划假设驱动。
- **影响工件：** CONTEXT / ADR / Spec / Ticket / Goal Plan
- **约束或不变量：** 每项迁移都要有真实旧 schema、来源版本和 fixture；否则从范围移除。
- **后续：** D-014 决定真实迁移或新库初始化失败时的处置。
- **替代/被替代：** 替代 D-007 原先假设 path-hash FileHistory 与新 workspace identity 都需长期兼容的范围。

## LOG-019 — 2026-08-09T11:41:33+08:00 — 采用四态资源一致性健康模型
- **设计树节点：** D-013
- **轮次与依赖：** round 4 / D-005, D-012
- **状态：** confirmed
- **问题：** 单 owner 观察链出现 watcher 降级、事件 gap、reconciliation 失败或 Knowledge 滞后时的可见性与恢复合同。
- **事实与来源：** 用户确认推荐方案；D-005 禁止双运行，D-012 要求 History/Knowledge 共享观察事实。
- **选项：** 静默重试；布尔 healthy；四态健康模型与 scoped retry。
- **推荐：** 四态健康模型与 scoped retry。
- **结论：** 使用 `HEALTHY`、`DEGRADED`、`RECONCILING`、`FAILED`。状态和必要错误真实可见，按 Workspace/Resource 范围重试收敛，不得静默丢事件或把降级伪装正常；不新增复杂运维界面。
- **原因：** 单一事实源必须同时拥有可判断的健康事实，才能证明切换、恢复和发布门完成。
- **影响工件：** CONTEXT / ADR / Spec / Ticket
- **约束或不变量：** History、Knowledge 与 UI 不得各自定义互相冲突的健康状态；派生进度不等于物理观察健康。
- **后续：** D-015 将关键状态转换和恢复证据纳入完成合同。
- **替代/被替代：** 无

## LOG-020 — 2026-08-09T11:48:16+08:00 — 未发布基线完全取消迁移设计
- **设计树节点：** D-007
- **轮次与依赖：** round 5 / D-006
- **状态：** superseded
- **问题：** 用户是否需要任何真实数据迁移、兼容窗口或旧数据清理设计。
- **事实与来源：** 用户明确“本次更新迭代是一次颠覆性的，另外当前这个 hanakde 还未发布，故无需考虑迁移等问题”。
- **选项：** 只迁移真实数据；完全不设计迁移与旧版本兼容。
- **推荐：** 上一轮推荐只迁移真实数据；新事实表明连该保守路径也无实际用户数据依据。
- **结论：** 完全取消 legacy migration、兼容窗口、migration rollback、旧 Profile 导入与旧数据清理。新 schema 和收敛后的基础设施直接成为唯一基线。
- **原因：** 未发布产品没有必须保护的旧用户数据，本轮又允许颠覆性改变；保留迁移只会制造重复 schema、状态机和测试负担。
- **影响工件：** CONTEXT / ADR / Spec / Ticket / Goal Plan
- **约束或不变量：** 运行时初始化失败和 Root Identity 安全失败仍须处理，但不得包装成迁移兼容流程。
- **后续：** D-015 从完成合同删除原 DoD 14/15。
- **替代/被替代：** 替代 LOG-018；ADR-011 supersedes ADR-009。

## LOG-021 — 2026-08-09T11:48:16+08:00 — 移除迁移失败产品流程
- **设计树节点：** D-014
- **轮次与依赖：** round 5 / D-005, D-007
- **状态：** confirmed
- **问题：** 是否需要迁移失败时的 legacy fallback、只读旧库或用户恢复操作。
- **事实与来源：** 用户确认未发布 HanaKDE 的颠覆性更新无需考虑迁移；D-013 已定义正常运行时健康状态。
- **选项：** 迁移失败保留旧库并恢复；不建立迁移流程，仅保留运行时安全与健康失败。
- **推荐：** 根据最新未发布事实，选择后者。
- **结论：** 不设计迁移失败 UI、旧库 fallback 或迁移恢复操作。Root Identity 异常继续 fail closed；File History 新库初始化失败进入 `FAILED` 并允许 scoped retry，均属于正常运行时合同。
- **原因：** 迁移前提已被移除，继续定义迁移失败行为会重新引入被明确拒绝的兼容系统。
- **影响工件：** CONTEXT / ADR / Spec / Ticket
- **约束或不变量：** “无迁移”不等于忽略运行时安全或错误处理，也不允许初始化失败时破坏其他 Workspace/Knowledge 能力。
- **后续：** D-015 确认校正后的最终 Definition of Done。
- **替代/被替代：** D-014 原迁移失败推荐被本条收窄为正常运行时失败合同。

## LOG-022 — 2026-08-09T11:52:26+08:00 — 确认校正后的 15 项完成门
- **设计树节点：** D-015
- **轮次与依赖：** round 6 / D-010, D-011, D-013, D-014
- **状态：** confirmed
- **问题：** 原计划 17 项 Definition of Done 经上游版本、平台和无迁移裁决后，是否作为 umbrella change 的最终完成合同。
- **事实与来源：** 用户确认；目标已更新为 `v0.446.6`，平台门限于 Windows/macOS，未发布基线删除旧 Profile 迁移与 migration rollback。
- **选项：** 仅以 Git merge/build 为完成；采用校正后的 15 项统一完成门。
- **推荐：** 采用 15 项统一完成门并逐项绑定 Ticket/Evidence。
- **结论：** 15 项全部成为本 change 完成合同：`v0.446.6` ancestry、HanaKDE 二开无回退、File History、Document Extraction、Office→Knowledge、Materialize/Transfer、Root Identity、单 watcher、ResourceEventBus、单 baseline、restore 全链一致、Windows/macOS 门禁、production/native packaging、删除重复实现、架构与 upstream sync ledger。
- **原因：** umbrella change 只有形成完整 ancestry、行为、架构、平台和去冗余闭环才可以声明完成。
- **影响工件：** CONTEXT / Spec / Ticket / Tickets Map / Goal Plan / Evidence
- **约束或不变量：** 每项必须有可重复 Evidence；范围削减先修改 Spec 并走 deviation control，不得在 merge 或实现中静默延后。
- **后续：** frontier 为空后请求用户确认完整设计树共识；确认后路由 Deep Spec。
- **替代/被替代：** 替代原计划 DoD 1、12、14、15：版本改为 `v0.446.6`，平台改为 Windows/macOS，删除两项迁移门。

## LOG-023 — 2026-08-09T12:12:54+08:00 — 完整设计树达成共识
- **设计树节点：** 不适用
- **轮次与依赖：** round 6 / D-001—D-016
- **状态：** confirmed
- **问题：** 完整设计树是否仍有遗漏，能否结束 `G-grill-with-docs` 并路由下游。
- **事实与来源：** 16 个设计节点全部为 answered，frontier 为空；用户在完整共识摘要后明确回复“确认”。
- **选项：** 补充遗漏并继续 grilling；确认共识并路由 Deep Spec。
- **推荐：** 确认共识并路由 Deep Spec。
- **结论：** 设计树状态转为 `consensus`，当前 G Work 成功完成；下一 Work 为 `specdev/spec`，由 Deep Spec 将本 change 的外部行为、范围、15 项完成门与关键架构约束形成 Ready 合同。
- **原因：** 所有高影响已知分支均已关闭，且用户已显式确认无遗漏。
- **影响工件：** design-tree / workflow status / Spec
- **约束或不变量：** 本结论只完成设计访谈，不授权产品实现、Git merge、commit、branch、push 或发布。
- **后续：** 从 `<Path>{roots.workflows}/specdev/S-spec/S-spec.md</Path>` 运行 Deep Spec。
- **替代/被替代：** 无

## LOG-024 — 2026-08-09T13:08:04+08:00 — 移动并按最终共识修订集成计划
- **设计树节点：** 不适用
- **轮次与依赖：** consensus maintenance / D-001—D-016
- **状态：** confirmed
- **问题：** 用户将原计划移动到当前 change 后，计划的路径、目标版本和旧设计是否仍与最终共识一致。
- **事实与来源：** 用户移动文件时内容哈希仍为初始 `887dbca1a84b7218a70cf7ef9fe8a7955fdd30bccb7ba5fcf329d764b0e7abbf`；当前规范路径为 `<Path>{roots.state}/specdev/changes/2026-08-09-openhanako-v0-446-6-integration/HanaKDE-openhanako-v0.444.1-integration-plan.md</Path>`。按 design tree/CONTEXT/ADR 修订后的 SHA-256 为 `a333d1fc93d49eff8499ad908ce4cd2b657b42fe79152509d51114f2f3a2e111`。
- **选项：** 只更新路径并保留冲突旧正文；在保留来源文件名的同时把整份计划升级为当前合同。
- **推荐：** 选择后者，避免下游 Spec/Ticket 从旧章节重新引入已拒绝设计。
- **结论：** 计划升级为 v2.0 / `v0.446.6`：一个 umbrella change；正常上游迭代默认吸收；`main` 是唯一 Workspace；挂载无 Workspace History；无 relocation/公共 workspaceId；两类 History 分产品 scope、共享 primitive；Document Extraction 升级 Office/Knowledge；History/Knowledge 共享观察事实；单 owner 直接切换；四态健康；未发布新基线无迁移；Windows/macOS 阻断；15 项 DoD。计划同时补入当前 ResourceWatchRegistry、ResourceEventBus、Root Identity、Knowledge runtime、Desktop watcher 与 Office 插件的仓库起点。
- **原因：** 原文是高价值设计来源，但若保留已被用户否决的身份、迁移、双运行、产品入口和平台门禁，会与 consensus 工件形成两个相互冲突的实施权威。
- **影响工件：** integration plan / LOG / downstream Spec / Ticket / Goal Plan
- **约束或不变量：** 文件名中的 `v0.444.1` 只保留来源追溯含义；当前 target 只能是冻结的 `v0.446.6` commit。未执行产品代码修改、Git merge、branch、tag、commit 或 push。
- **后续：** Deep Spec 必须读取修订后的计划、design tree、CONTEXT 与 ADR，不得恢复被替代章节。
- **替代/被替代：** 更新 LOG-001/003 的文件 locator；计划 v2.0 替代其原 v1.0 冲突正文，但初始哈希与讨论轨迹继续保留。
