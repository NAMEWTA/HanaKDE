# Knowledge 工作区资源内核与文件树交互架构决策

## ADR-001: 活动工作根拥有 Knowledge ResourceIO

**Status:** accepted
**Source:** LOG-001 / USER-DECISION:2026-08-12
**Supersedes:** none

### Context

Knowledge registry 已按活动工作目录解析逻辑 `main`，但 ResourceIO route 与 Knowledge mutation coordinator 可能消费 Engine 的另一 owner，导致地址可解析而 provider 不可用。

### Decision

当前活动工作根同时拥有 Knowledge `main` 和 Engine/Server 公开 ResourceIO owner。Knowledge registry、ResourceIO 路由、create/copy/trash/atomic/refactor coordinator、watcher 与 index binding 通过同一 owner 访问活动根；切换工作根时旧 owner 与 workspace-scoped runtime 一起失效并重建。

### Trade-off

比在 Knowledge route 内临时创建第二 ResourceIO 更复杂，需要工作区生命周期同步；但避免双重 provider scope、事件分裂和保存/删除语义漂移。

### Consequences

保存、新建、删除和剪切/粘贴共享同一文件事实与事件链；授权目录仍由 agent/session 安全边界控制，不自动成为 Knowledge 挂载源。owner 不可用时 fail closed 并返回稳定 retryable unavailable。

### Verification / Migration

增加默认活动工作目录 composition regression，验证 ResourceIO route 与 Knowledge route 的 provider ref 相同；切换工作根验证旧 owner 不再接受 mutation。未发布旧数据无需迁移。

## ADR-002: 资源树复用工作台文件动作与打开策略

**Status:** accepted
**Source:** LOG-004, LOG-005, LOG-007 / USER-DECISION:2026-08-12
**Supersedes:** none

### Context

Knowledge 资源树目前已有选择、拖拽和打开回调，但没有工作台提供的完整文件右键操作、文件类型图标和原生打开能力。

### Decision

Knowledge 资源树复用 Desk 的 ContextMenu、file-kind、remote-file-preview、Native Grant 与 ResourceIO operation client。菜单动作包括 cut/copy/delete/rename、复制相对路径/绝对路径、打开文件夹和默认应用打开；动作按来源能力、runtime 和 native bridge 可用性投影，禁止 Renderer 直接访问 Node FS。跨来源 cut fail closed，同源 cut 才 move，跨来源 copy 保持源不变。

### Trade-off

复用需要把 KnowledgeAddress 适配到 Desk/FileRef/Workbench preview 的稳定接缝，并处理远程 mount 无绝对路径的降级；代价是增加适配层和测试矩阵，但避免两套文件管理语义。

### Consequences

Knowledge 与工作台对同一真实文件给出一致 icon、preview、默认应用和操作结果；Web/远程场景能力集合更小但不会伪造成功；跨来源移动不会被隐式执行。`copyPath` 作为可选 Native Grant action 只在受信任 Main 内消费 materialized path 并写入系统剪贴板，路径不返回 Renderer 或 HTTP。

### Verification / Migration

为树 context menu、资源类型 open、跨来源 cut/copy、native 能力隐藏和路径复制增加 Vitest/Playwright 覆盖；无数据迁移。

## ADR-003: 创建对话框成功提交不可重入

**Status:** accepted
**Source:** LOG-006 / USER-DECISION:2026-08-12
**Supersedes:** none

### Context

创建成功后 modal 在异步回调期间仍可见，重复点击会再次提交同一目标并产生 409。

### Decision

第一次 submit 立即设置不可重入屏障；成功路径先关闭 modal，再触发一次 locate/open；失败保留输入和错误并允许显式重试，不能由 finally 恢复已成功请求的可交互状态。

### Trade-off

成功反馈不在 modal 内停留，但资源树/编辑器会立即显示结果；降低重复提交和冲突风险。

### Consequences

创建 UI 生命周期与资源事实提交顺序可观测，单次 mutation 与单次导航投影可测试。

### Verification / Migration

组件测试断言双击/连续提交只调用一次 client、成功后 dialog 卸载且只调用一次 locate/open；无数据迁移。
