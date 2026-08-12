# openhanako v0.446.6 整合架构决策

## ADR-001: 以上游跟随为默认、以语义融合保护 HanaKDE 合同

**Status:** accepted
**Source:** LOG-014 / user decision
**Supersedes:** none

### Context
HanaKDE 是持续跟随 openhanako 的 fork。若为每个上游内部变化保留旧实现兼容层，会让同类 primitive、解析器、watcher 和 UI 长期并列；若无条件覆盖 HanaKDE，又会丢失已经形成的 Knowledge、Resource、安全与产品合同。

### Decision
以官方 `v0.446.6` 及其完整 ancestry 作为本轮新基座。上游正常功能、修复和优化默认完整吸收；只有与 HanaKDE 已确认产品、安全、数据或开放边界合同冲突时才做语义融合。同类型功能收敛为单一 owner，迁移验证后删除重复实现，不为旧 fork 内部结构创建长期兼容壳。

### Trade-off
拒绝“全面 ours”会增加必要的接口适配；拒绝“双实现保险”会要求更严格的迁移证据。接受这两项成本，以换取可持续上游同步和单一事实源。

### Consequences
上游新增 Memory Dream、压缩菜单修复和 Markdown 裸 URL 修复等正常迭代进入本轮范围。已有 HanaKDE 增强只有在表现为真实合同而非实现偶然时才保留。

### Verification / Migration
逐 checkpoint 审计 overlap；对每个语义融合点写行为测试；最终验证 `v0.446.6` 为 HEAD ancestor，并清点被删除的重复实现。

## ADR-002: main 是唯一主 Workspace，挂载不升级为 Workspace

**Status:** accepted
**Source:** LOG-008 / LOG-010 / user decision
**Supersedes:** none

### Context
当前 Knowledge Workspace 支持 `main` 与额外挂载来源。原计划提出逻辑 `workspaceId` 与 relocation，可能被误解为新增多 Workspace 或保持身份的搬迁产品语义。

### Decision
用户选择的工作目录就是唯一主 Workspace `main`。切换工作目录就是切换主 Workspace；不新增 Workspace relocation 产品动作。额外目录只是挂载，不成为另一个 Workspace。本轮 Workspace File History 只覆盖 `main`。

### Trade-off
不提供自动保持旧 Workspace 身份的目录搬迁体验，换取与现有产品模型和上游工作目录模型一致的简单生命周期，避免不必要的身份兼容与迁移状态。

### Consequences
额外挂载继续复用既有文件管理和编辑能力，但不拥有独立 Workspace File History。Root Identity 继续用于范围与安全证明，不据此引入用户可见 relocation。

## ADR-003: 两类文件历史分离产品语义、复用系统 primitive

**Status:** accepted
**Source:** LOG-011 / user decision
**Supersedes:** none

### Context
上游 Workspace File History 面向工作目录版本；HanaKDE 还需要在 Agent 对话上下文展示相关文件变更。它们的用户入口和查询 scope 不同，但重复实现 watcher、快照、diff、restore 或写入链会制造竞争事实源。

### Decision
保留 Workspace File History 与 Agent 对话文件变更历史两个产品投影。它们按各自 scope 呈现，但共同复用 ResourceIO、ResourceEventBus、资源版本、物理观察、快照/diff/restore 中语义相同的底层能力；不得各自拥有重复 watcher 或文件写入事实源。

### Trade-off
共享底层契约需要把上游按 `agentId + root` 的偶然耦合拆开，但保留两个用户入口，避免把不同任务强行压成一个 UI。

### Consequences
Workspace 历史按 `main` 查询；Agent 视图只做上下文过滤/投影。底层 restore 始终走 ResourceIO 并触发统一事件收敛。

## ADR-004: Document Extraction 升级现有 Office 能力而不并列解析器

**Status:** accepted
**Source:** LOG-012 / user decision
**Supersedes:** none

### Context
HanaKDE Office 插件已有 DOCX/XLSX/PDF 等读取器，上游新增覆盖更广、输出 Markdown 的 document extraction。长期保留两套同格式解析会导致行为、限制、打包和安全边界分叉。

### Decision
完整吸收上游 Document Extraction，将其作为对现有 Office 插件与 Knowledge ingestion 的升级。语义相同的解析路径迁移到共享实现并删除重复 parser；Office 特有的 HTML/JSON 等真实差异能力作为共享服务上的产品适配保留。Derived Markdown 不自动写入 Workspace，OCR 不在本轮实现。

### Trade-off
允许上游升级改变现有插件内部实现，接受必要的行为测试和调用适配，换取更广格式覆盖和单一解析事实源。

### Consequences
不得为了兼容旧 Office 内部函数永久并列 parser。授权、ResourceIO/Materialize 和输入预算继续在系统边界执行。

## ADR-005: History 与 Knowledge 共享观察事实但保持派生模型独立

**Status:** accepted
**Source:** LOG-013 / user decision
**Supersedes:** none

### Context
History 保存物理版本，Knowledge 保存可重建语义索引。它们都需要发现同一主 Workspace 的变化，但 retention、恢复和数据模型不同。

### Decision
History 与 Knowledge 共享 ResourceEvent、资源版本、Root Identity 和主 Workspace baseline observation；消费者基于同一观察结果执行 scoped repair。History DB、Knowledge DB、retention、policy、索引模型和恢复语义保持独立。

### Trade-off
共享物理观察需要重构现有各自扫描入口，但拒绝合并数据库，保留两个领域模型的清晰生命周期。

### Consequences
同一 `main` 不允许业务服务各自完整 walk 来发现变化。Restore 只经 ResourceIO 写盘，再由统一事件让 History、Knowledge 和 UI 收敛。

## ADR-006: 基础设施采用单 owner 直接切换

**Status:** accepted
**Source:** LOG-015 / user decision
**Supersedes:** none

### Context
现有 ResourceWatchRegistry、ResourceEventBus、Knowledge pipeline、Electron legacy watcher 与上游 File History watcher 存在职责重叠。临时双读虽可用于比对，但仍会让同一 root 同时受两套观察链影响，与本 change 的去冗余原则冲突。

### Decision
不允许临时双运行。新路径只能先在不接入同一真实 root 的隔离环境完成验证；正式切换必须先停止旧 mutation/watcher/baseline owner，再启用新 owner。回滚采用同样的 stop-then-start 顺序，不得用双 watcher、双写或双 baseline walk 作为过渡。

### Trade-off
放弃在线影子比对，要求切换前的隔离测试和切换门更完整；换取明确所有权、无重复事件和可判定的回滚状态。

### Consequences
Goal Plan 必须为每个基础设施 Wave 定义旧 owner 停止证据、新 owner 启动证据和失败回滚点。任何需要同时接入同一 root 才能验证的方案不符合本合同。

## ADR-007: 复用 main 现有身份而不新增 workspaceId

**Status:** accepted
**Source:** LOG-016 / user decision
**Supersedes:** none

### Context
原计划以 relocation 和跨路径延续为理由提出长期 `workspaceId`，但本 change 已明确不提供 relocation，`main` 是随工作目录切换的唯一主 Workspace。当前 ResourceIO 与 Knowledge 已有 ResourceRef、`sourceKey` 和 ProviderRootIdentity 分担路由、定位与物理证明。

### Decision
不新增用户可见或跨功能公共 `workspaceId`。`main` 继续使用现有 Workspace/Knowledge 生命周期、`sourceKey=main`、ResourceRef 与 ProviderRootIdentity。File History 只增加其持久化真正需要的私有存储键，该键不得成为其他系统的新身份依赖。

### Trade-off
File History 不能依赖一个统一的长期 Workspace ID 简化所有查询，但避免为了已拒绝的 relocation 语义重构现有状态和制造新的公共身份层。

### Consequences
Spec 和 Ticket 必须区分路由键、资源引用、物理身份与 File History 私有存储键，不得把 path hash 或私有键提升为公共合同。

## ADR-008: Windows 与 macOS 是本轮平台阻断门

**Status:** accepted
**Source:** LOG-017 / user decision
**Supersedes:** none

### Context
本轮整合涉及原生文件监听、Root Identity、安全路径、Electron production build 和 document extraction native packaging。不同平台的原生行为不能只靠通用单元测试证明。

### Decision
Windows 和 macOS 构成本 umbrella change 的平台阻断门。两者的安全与监听关键合同、production build 及 native document-extraction packaging 必须通过。Linux 验证不阻断本 change 完成。

### Trade-off
Linux 上可能保留未由本 change 关闭的验证风险；换取与用户实际发布目标一致的完成门，避免把非目标平台拖入 umbrella change 的阻断路径。

### Consequences
Tickets 和 Goal Plan 必须为 Windows/macOS 分别绑定原生 Evidence。Linux 结果可以记录为非阻断证据或后续事项，但不得反向降低两个阻断平台的合同。

## ADR-009: 只为真实持久化数据设计迁移

**Status:** superseded
**Source:** LOG-018 / user decision
**Supersedes:** none

### Context
当前 HanaKDE 尚未发布 Workspace File History，也不引入新的公共 `workspaceId`。若仍为假设中的旧 File History 库或不变的 Workspace 状态设计兼容迁移，会扩大本轮数据风险并违背去冗余原则。

### Decision
只迁移仓库审计证明已发布、用户可能实际持有且 schema 被本轮改变的数据。不存在的旧 Workspace File History DB 不建立兼容层；现有 Workspace UI、Profile 与 Knowledge 数据若合同未变则不因本功能改写。真实迁移必须幂等、先备份，失败时保留原数据；清理旧数据由后续显式 change 决定。

### Trade-off
不为理论上的跨版本路径提供预防性兼容，换取更小、更可验证的数据影响面。未来若发现真实旧格式，必须作为新事实进入 deviation control，而不是依赖本轮虚构迁移。

### Consequences
每个迁移 Ticket 必须先给出真实旧数据来源、schema 差异和可重复 fixture；缺少这些证据的迁移代码不得进入本 change。

## ADR-010: 资源一致性采用四态健康模型

**Status:** accepted
**Source:** LOG-019 / user decision
**Supersedes:** none

### Context
History 与 Knowledge 共享单一物理观察事实，基础设施又不允许临时双运行。Watcher 降级、事件 gap、baseline reconciliation 和下游重索引若不可见，系统无法可靠判断单 owner 链是否已经收敛。

### Decision
统一使用 `HEALTHY`、`DEGRADED`、`RECONCILING`、`FAILED` 表达资源一致性状态。事件 gap、监听降级、reconciliation 失败和 Knowledge 重索引滞后必须反映真实状态；恢复按 Workspace/Resource scope 可重试收敛，不得静默丢失或把降级伪装正常。只提供必要状态和错误反馈，不新增复杂运维界面。

### Trade-off
需要共享健康契约和 UI 最小状态接入，换取可观察、可恢复且能够形成发布证据的单 owner 链路。

### Consequences
History、Knowledge 和 UI 消费同一健康事实；消费者可以展示自己的派生进度，但不得重新定义独立健康状态。测试必须覆盖状态转换、事件 gap、retry 和失败保持。

## ADR-011: 未发布基线不设计迁移或旧版本兼容

**Status:** accepted
**Source:** LOG-020 / LOG-021 / user decision
**Supersedes:** ADR-009

### Context
HanaKDE 当前尚未发布，本次上游整合被明确定位为颠覆性基线更新。不存在必须保护的已发布 HanaKDE File History、workspaceId 或旧 Profile 用户数据路径，因此迁移、兼容窗口和旧版本回滚会成为无事实依据的额外系统。

### Decision
本 change 不实现 legacy 数据迁移、旧 schema 兼容、migration marker、旧 Profile 导入、迁移回滚或旧数据清理。新数据 schema、File History 存储和收敛后的基础设施直接成为唯一基线。Root Identity 异常按既有安全合同处理；新存储初始化失败按统一健康状态处理，不建立迁移状态机。

### Trade-off
明确放弃从未发布内部版本升级和回滚数据的能力，换取更小的实现面、单一数据模型以及没有临时兼容代码的最终架构。

### Consequences
原计划 DoD 中“旧 HanaKDE profile 可迁移”和“migration 可回滚”删除。Spec、Ticket 与测试不得重新引入相关路径；若未来发布后需要 schema 升级，必须基于当时真实发布数据另建 change。

## ADR-012: 安全条件写入是 ResourceIO 的系统本体 primitive

**Status:** accepted
**Source:** D-T15-03 / Root Lead decision
**Supersedes:** Node-only local-provider proof attempt in D-T15-02

### Context
AC-016 要求 stale version、root replacement、scope escape 与 symlink/junction TOCTOU 都在 disk write 前 fail closed。Node v22 缺少可在 macOS 和 Windows 上使用的 dirfd-relative traversal；重复 pathname proof 或 `O_NOFOLLOW` 只能保护 final path 的一部分，无法把 root、ancestor、target identity 和 write effect 原子绑定。

### Decision
将 secure conditional write 作为 ResourceIO 内部系统 primitive，而非 File History/route/plugin 特性。一个 bounded framed native helper 由 `lib/resource-io/native-secure-write.ts` 调用：macOS 以 directory handle + `openat` no-follow traversal，Windows 以 handle-first `CreateFileW`、reparse inspection、final-path/file-id proof。只在 verified target handle 上检查 expected version、truncate 和 write；任何 helper 缺失、unsupported platform、frame/proof failure 均 fail closed。上层继续只调用 `ResourceIO.writeExpectedVersion`；proof 不序列化、不进入 route/UI/日志。

### Trade-off
引入跨平台 native implementation、dev build 和后续 package closure，换取一个深层 module：调用者无需理解 dirfd、reparse、file ID 或 handle lifetime，所有本地 conditional writes 在同一 seam 获得相同安全性质。拒绝 Node fallback 和 restore-special helper，以避免双 mutation authority 或伪安全降级。

### Consequences
T-15 建立 helper 的 source、internal runner、local provider integration 与 isolated fixtures；T-21 只在后续将已验证 helper 纳入 production artifact/package/CI closure，T-22/T-23 给出真实 Windows/macOS Evidence。任何新 ResourceIO public method、route parameter、raw root/native identity disclosure，或无法用 C++ handle primitives证明的后端，必须重新走 deviation control。
