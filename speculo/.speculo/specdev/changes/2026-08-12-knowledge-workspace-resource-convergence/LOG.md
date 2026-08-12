# Knowledge 工作区资源内核与文件树交互收敛设计日志

## LOG-010 — 2026-08-12T12:38:00+08:00 — T-tickets 草拟完成
- **Work：** `specdev/tickets`
- **输入：** `<Path>{roots.state}/specdev/changes/{change}/spec.md</Path>`、`ADR.md`、`CONTEXT.md`、`diagnosis.md`、现有代码/测试、`<Path>docs/upstream-sync-ledger.md</Path>`。
- **拆分：** T-01 单一 main/ResourceIO owner；T-02 创建 dialog 提交屏障；T-03 复用 Desk 资源树右键/open/icon；T-04 clipboard 来源边界；T-05 跨层 integration/E2E Gate；T-06 upstream checkpoint 遍历兼容 Gate。
- **路径与依赖：** T-01 为核心前置；T-02/T-03 可在 T-01 后并行；T-04 依赖 T-03；T-05 汇合产品切片；T-06 独占 upstream ledger/Map 并在 T-05 后运行。共享路径 owner 已写入 Ticket/Map。
- **结论：** 6 个 Ticket 均为 `status: ready`、`ready: true`，Spec 的 AC-001—AC-013 全部 covered；坚持复用现有 ResourceIO、Knowledge client、Desk action、ContextMenu、file-kind、remote preview、Native Grant、clipboard、Trash 和 upstream ledger，不新增第二 owner 或大范围重排。
- **验证：** `node <Path>{roots.workflows}/specdev/common/tools/validate-specdev.mjs</Path> --stage tickets <Path>{roots.state}/specdev/changes/{change}</Path>` → 0 error / 0 warning。
- **下一步：** 展示完整 Ticket 列表供用户核对；用户批准后再将 Work 标记完成并进入 `specdev/goal-plan`（Deep Ticket、共享核心和 UI Gate 触发）。

## LOG-011 — 2026-08-12T12:55:00+08:00 — 普通 Goal Plan 发布
- **Work：** `specdev/goal-plan`
- **规划分支：** 用户选择普通 Goal Plan；未生成 Lead/Worker、provider、Delivery Contract、Dispatch Packet 或其它委派痕迹。
- **模式：** `coordination`、`high-assurance`、`reference-conformance`。
- **编排：** G1 T-01 单一 owner → G2A T-02/T-03 → G2B T-04 → G3 T-05 跨层 integration/E2E → G4 T-06 upstream checkpoint ledger；最大并发 3，T-03 独占 ContextMenu shared owner，T-06 独占 upstream ledger。
- **授权：** 仅在后续 I-implement 中按 Ticket writable_paths 修改；commit、push、merge、deploy、release、远程写入和真实用户文件操作未授权。
- **验证：** `<Path>{roots.workflows}/specdev/common/tools/validate-specdev.mjs</Path> --stage goal-plan <Path>{roots.state}/specdev/changes/{change}</Path>` → 0 error / 0 warning。
- **下一步：** 进入 `<Path>{roots.workflows}/specdev/I-implement/I-implement.md</Path>`；开始 Deep Ticket 前按 Goal Plan 的批准点确认用户授权。

## LOG-001 — 2026-08-12T11:52:00+08:00 — 功能落点与 `main` owner
- **设计树节点：** D-001
- **轮次与依赖：** round 1 / 无
- **状态：** confirmed
- **问题：** Knowledge 是否应与聊天/工作台共享活动工作目录及 ResourceIO owner。
- **事实与来源：** 用户明确共识；`<Path>speculo/.speculo/specdev/adr/0002-active-root-as-main.md</Path>`；`<Path>server/routes/knowledge-workspace.ts</Path>`；`<Path>server/routes/resource-io.ts</Path>`；诊断红灯输出。
- **选项：** registry 仅映射 `main`；Knowledge 自建 ResourceIO；活动根统一绑定单一 ResourceIO owner。
- **推荐：** 活动根统一绑定单一 owner。
- **结论：** 确认：聊天/工作台打开选择的工作目录就是知识 `main` 主来源；知识不再单独维护另一套根或 ResourceIO owner。
- **原因：** 当前 503 的最小根因是 registry root 与 Engine ResourceIO owner 不一致；单一 owner 同时保持 ResourceIO、operation journal、watcher 和 index 的事实一致。
- **影响工件：** CONTEXT / ADR / Spec / Ticket
- **约束或不变量：** `main` 仍使用 `{sourceKey, relativePath}`；授权目录不等于 Knowledge 挂载来源；不向 DTO 暴露绝对路径。
- **后续：** 需要用户关闭 D-002 至 D-006 后继续 G。
- **替代/被替代：** 无

## LOG-002 — 2026-08-12T11:55:00+08:00 — 功能落点判定
- **设计树节点：** 不适用
- **轮次与依赖：** round 1 / 无
- **状态：** confirmed
- **问题：** Knowledge 资源内核与资源树交互应作为插件还是系统本体。
- **事实与来源：** `<Path>{roots.state}/specdev/changes/{change}/feature-placement.md</Path>`；`<Path>{roots.state}/specdev/adr/0005-open-composition-owns-knowledge-core.md</Path>`；`<Path>{roots.state}/specdev/adr/0012-durable-plan-commit-operation-journal.md</Path>`；现有 `core/knowledge-workspace`、`server/routes` 与 `desktop` 代码。
- **选项：** 内置插件；HanaKDE 系统本体；UI 做插件、内核做系统本体的混合贡献。
- **推荐：** 系统本体，按 core/server/desktop 分层落地。
- **结论：** 七条判据逐项判定为：破盒硬门 1=破盒，2=破盒，3=不适用；软门 4=破盒，5=破盒，6=能装进，7=破盒。决策树落到 HanaKDE 系统本体。
- **原因：** 单一活动工作根、ResourceIO owner、operation journal 与安全边界是被多组件依赖的共享原语；插件不能修改或定义这些特权子系统。局部 UI 复用不改变主落点。
- **影响工件：** feature-placement / ADR / Spec / Ticket
- **约束或不变量：** 插件不拥有 Knowledge 核心；系统本体继续消费现有 Workbench/ResourceIO/Native bridge，不新建第二套文件事实。
- **后续：** G 关闭 D-002 至 D-006 后进入 S。
- **替代/被替代：** 无

## LOG-003 — 2026-08-12T12:02:00+08:00 — 跨来源剪切边界
- **设计树节点：** D-002
- **轮次与依赖：** round 2 / D-001 / 无
- **状态：** confirmed
- **问题：** 跨来源 cut 是否允许移动。
- **事实与来源：** 用户确认“1 是”；永久 `<Path>{roots.state}/specdev/adr/0007-links-and-refactors-are-source-local.md</Path>` 与归档 Knowledge ADR-0155/0157/0277。
- **选项：** 跨来源移动；静默降级为复制；拒绝 cut 并要求 copy。
- **推荐：** 拒绝 cut 并要求 copy。
- **结论：** 跨来源 cut fail closed；同源 cut 才进入原子 move；跨来源 copy 保持源不变、正文/字节原样且不改写链接。
- **原因：** 跨来源移动会破坏来源边界、Trash/链接重构和恢复语义。
- **影响工件：** CONTEXT / ADR / Spec / Ticket
- **约束或不变量：** 不自动删除源，不执行跨来源链接迁移。
- **后续：** Ticket 必须覆盖拒绝响应与 copy fallback 提示。
- **替代/被替代：** 无

## LOG-004 — 2026-08-12T12:02:00+08:00 — 资源树右键动作复用
- **设计树节点：** D-003
- **轮次与依赖：** round 2 / D-001, D-002 / 无
- **状态：** confirmed
- **问题：** Knowledge 树是否复用工作台上下文菜单和文件动作。
- **事实与来源：** 用户确认“2 是”；`<Path>desktop/src/react/components/desk/DeskTree.tsx</Path>`、`<Path>desktop/src/react/ui/ContextMenu.tsx</Path>`。
- **选项：** Knowledge 自建菜单；复用 Desk 菜单/动作；只保留工具栏按钮。
- **推荐：** 复用 Desk 菜单/动作。
- **结论：** 文件/文件夹右键提供 cut/copy/delete/rename/copy relative path/copy absolute path/open folder/open default app 等动作；按来源能力、Native Grant 与 runtime 可用性投影菜单。
- **原因：** 单一文件操作语义、减少重复实现，并保持 Web/远程安全降级。
- **影响工件：** CONTEXT / ADR / Spec / Ticket
- **约束或不变量：** 未授权动作隐藏或禁用；菜单 action 不直接访问 Node FS。
- **后续：** UI ticket 复用既有 `ContextMenuItem` 与动作 helper。
- **替代/被替代：** 无

## LOG-005 — 2026-08-12T12:02:00+08:00 — 文件类型 icon 与打开策略
- **设计树节点：** D-004
- **轮次与依赖：** round 2 / D-001, D-003 / 无
- **状态：** confirmed
- **问题：** Knowledge 树是否另建文件类型与打开实现。
- **事实与来源：** 用户确认“3 是”；`<Path>desktop/src/react/utils/file-kind.ts</Path>`、`<Path>desktop/src/react/utils/remote-file-preview.ts</Path>`、永久 `<Path>{roots.state}/specdev/adr/0017-auditable-silverbullet-adaptation.md</Path>` 及归档资源打开策略。
- **选项：** Knowledge 自建 parser/icon/open；复用 Desk/FileRef preview 与 Native Grant；全部默认应用打开。
- **推荐：** 复用既有 preview/open policy。
- **结论：** `.md/.pdf/.jpg/.html` 等资源复用 file-kind、remote preview 与 native open policy；无能力时隐藏，不伪造成功。
- **原因：** 既有资源类型、媒体 viewer、远程内容和原生桥已经是系统事实源。
- **影响工件：** CONTEXT / ADR / Spec / Ticket
- **约束或不变量：** 非 Markdown 继续是 Asset；Markdown 仍走 Knowledge editor；绝对路径不进入 DTO/Renderer。
- **后续：** 增加每种资源类型的 UI/route regression。
- **替代/被替代：** 无

## LOG-006 — 2026-08-12T12:02:00+08:00 — 创建弹窗生命周期
- **设计树节点：** D-005
- **轮次与依赖：** round 2 / D-001 / 无
- **状态：** confirmed
- **问题：** 创建成功后的 modal 是否应立即关闭且不可重入。
- **事实与来源：** 用户确认“4 是”；`<Path>desktop/src/react/components/knowledge-workspace/CreateResourceDialog.tsx</Path>` 现有 `submitting` 状态及测试缺口。
- **选项：** 保持当前回调顺序；成功后关闭并单次刷新/打开；成功后保持 modal 展示结果。
- **推荐：** 成功关闭、单次刷新/打开。
- **结论：** submit 首次触发即锁定；成功先关闭 dialog，再执行一次 locate/open；409 显示一次错误并允许显式重试。
- **原因：** 避免重复 mutation 与冲突，同时保持创建后的导航反馈。
- **影响工件：** CONTEXT / Spec / Ticket
- **约束或不变量：** finally 不得把已卸载 dialog 重新变为可交互；失败时保留输入和错误。
- **后续：** 组件测试必须断言单请求、卸载和重试。
- **替代/被替代：** 无

## LOG-007 — 2026-08-12T12:02:00+08:00 — 图标优先与可访问性
- **设计树节点：** D-006
- **轮次与依赖：** round 2 / D-003, D-004 / 无
- **状态：** confirmed
- **问题：** 右键菜单是否采用图标优先而保留可访问名称。
- **事实与来源：** 用户确认“5 是”；`<Path>desktop/src/react/ui/ContextMenu.tsx</Path>` 当前文字菜单契约；用户明确要求减少纯文字。
- **选项：** 全部文字；无文字纯图标；icon-first + tooltip/ARIA，陌生动作保留短文字。
- **推荐：** icon-first + tooltip/ARIA。
- **结论：** 熟悉动作优先使用图标；每项保留 tooltip/ARIA 名称；陌生或高风险操作显示短文字，保持键盘/屏幕阅读器可发现性。
- **原因：** 满足视觉收敛，同时不牺牲可用性与无障碍。
- **影响工件：** CONTEXT / Spec / Ticket
- **约束或不变量：** 使用现有 icon library/组件，不手绘重复 SVG；按钮和菜单项文本不溢出。
- **后续：** UI ticket 绑定亮暗主题、窄布局和 ARIA 测试。
- **替代/被替代：** 无

## LOG-008 — 2026-08-12T12:10:00+08:00 — 设计树全量共识收口
- **设计树节点：** D-001 至 D-006
- **轮次与依赖：** round 2 / 所有依赖已满足
- **状态：** confirmed
- **问题：** 本 change 是否已覆盖用户确认的 owner、跨来源剪切、右键动作、打开策略、创建提交屏障和图标可访问性边界。
- **事实与来源：** 用户对设计树待确认分支逐项回复“1 是、2 是、3 是、4 是、5 是”；`<Path>speculo/.speculo/specdev/changes/2026-08-12-knowledge-workspace-resource-convergence/design-tree.json</Path>`。
- **选项：** 继续追加设计分支；标记 consensus 并进入 S-spec。
- **推荐：** 标记 consensus 并进入 S-spec。
- **结论：** 用户已明确确认全部待决分支；设计树无 open/deferred 节点，G-grill-with-docs 完成，下一工作流为 S-spec。
- **原因：** 根因、共享 owner 契约、交互复用边界与失败安全行为均已形成可执行约束，继续停留在 grill 不会增加决策信息。
- **影响工件：** `.status.json` / 全局 SpecDev 状态 / 后续 Spec 与 Ticket。
- **约束或不变量：** 本轮不修改产品代码；S-spec 必须把 ADR-001 至 ADR-003 展开为实现规格和回归验收。
- **后续：** 进入 `specdev/spec`，输出实现规格后再拆分 tickets。
- **替代/被替代：** 无

## LOG-009 — 2026-08-12T12:25:00+08:00 — Ready Spec 发布
- **设计树节点：** 不适用
- **轮次与依赖：** S-spec / D-001 至 D-006、ADR-001 至 ADR-003
- **状态：** confirmed
- **问题：** 如何在尽可能复用现有实现的前提下，把资源 owner、资源树动作和 fork 上游遍历升级约束写成可验收规格。
- **事实与来源：** 当前代码与测试探索；`<Path>docs/upstream-sync-ledger.md</Path>`；`<Path>{roots.state}/specdev/changes/2026-08-12-knowledge-workspace-resource-convergence/diagnosis.md</Path>`；用户要求“尽可能复用，不进行大幅度修改，并考虑上游更新后的 fork 二开分支遍历升级”。
- **选项：** 复制上游实现并大范围重构；在现有 owner/client/tree/Desk seam 上做最小适配；暂不写 Spec。
- **推荐：** 在现有 seam 上做最小适配，并把 upstream checkpoint 分类和 owner 审计纳入验收合同。
- **结论：** `spec.md` 已完成并标记 `ready_for_tickets: true`；规格保持现有接口、数据模型、安全边界和上游 ledger 规则，未引入迁移或第二套基础设施。
- **原因：** 用户外部行为与架构决策已经充分确定；最小适配能修复共享 owner 根因，同时降低 fork 遍历升级的冲突面。
- **影响工件：** `<Path>{roots.state}/specdev/changes/2026-08-12-knowledge-workspace-resource-convergence/spec.md</Path>` / `.status.json` / 全局 SpecDev 状态。
- **约束或不变量：** Spec 不包含逐文件施工清单；实现若发现公共契约或 owner 设计需要改变，必须返回 G-grill-with-docs。
- **后续：** 用户明确请求后进入 `<Path>{roots.workflows}/specdev/T-tickets/T-tickets.md</Path>`。
- **替代/被替代：** 无

## LOG-010 — 2026-08-12T18:29:00+08:00 — T-01 至 T-06 实现与双轴审查完成
- **设计树节点：** D-001 至 D-006
- **轮次与依赖：** I-implement / Goal Plan G1 至 G5
- **状态：** confirmed
- **问题：** 是否可在当前 fork 工作树内以最小 seam 完成单一 ResourceIO owner、资源树 Desk 复用、clipboard 边界、跨层 Gate 和 upstream checkpoint。
- **事实与来源：** 用户回复“1”批准全部 T-01—T-06、当前 `hanakde` 分支、不创建 worktree 且不 commit；`<Path>{roots.state}/specdev/changes/{change}/evidence/T-01.md</Path>` 至 `<Path>{roots.state}/specdev/changes/{change}/evidence/T-06.md</Path>`；`<Path>docs/upstream-sync-ledger.md</Path>`。
- **选项：** 大范围重写 Knowledge；只修 route 503；沿现有 Engine/ResourceIO/Desk/Native/operation seams 完成全部垂直切片。
- **推荐：** 沿现有 owner 与 UI seam 最小适配，并以 focused + E2E + 双轴审查 + ledger 收口。
- **结论：** T-01—T-06 已实现并进入 review：20 files / 214 focused tests、Web Open Playwright 1/1、三套 typecheck、focused lint、renderer build 和 change-scoped diff check 通过；全量 suite 的 Node/native ABI 与无关 baseline 失败明确分类。Standards/specification 两轴审查在修正 action icons 和 source-root native action 条件后通过。
- **原因：** 该方案修复用户报告的共享 owner 根因并补齐复用交互，同时不新增 provider、watcher、parser、route kernel、绝对路径 Renderer API 或 upstream 合并面。
- **影响工件：** 生产代码/测试、6 份 Evidence、Tickets Map、Goal Plan、upstream ledger。
- **约束或不变量：** 授权目录不等于挂载目录；`main` 内部 key 不改、可见名称为“工作目录”；跨来源 cut 拒绝；Web/remote 隐藏 native/path 动作；commit/push/merge/deploy 未授权。
- **后续：** 运行 review-state SpecDev validator；通过后将 Tickets/Map/Goal Plan/change status 原子转换为 completed，交给 Archive Work。
- **替代/被替代：** 无

## LOG-011 — 2026-08-12T18:36:35+08:00 — Change completion 转换
- **设计树节点：** D-001 至 D-006
- **轮次与依赖：** I-implement completion / LOG-010
- **状态：** confirmed
- **问题：** 当前 change 是否满足 active → completed 的唯一合同。
- **事实与来源：** T-01—T-06 均有完整 Evidence 并通过 review-state implement/tickets/goal-plan validator（各 0 error / 0 warning）；AC-001—AC-013 与 G1—G5 均可定位；项目验证和环境/基线失败分类完整；triage `external_action: not-applicable`；无 blocker、deviation 或未授权远程动作。
- **选项：** 保持 active；转换为 completed；直接移动 archive。
- **推荐：** 转换为 completed，保留原目录并交由后续 Archive Work 移动。
- **结论：** 6 个 Ticket 置为 `done`，Tickets Map 与 Goal Plan 置为 `completed`，Goal Plan `ready_for_execution: false`，change `.status.json` 原子写入 completed 时间并从全局 active 索引移除；`--stage complete` 为 0 error / 0 warning；未归档。
- **原因：** `<Path>{roots.workflows}/specdev/common/rules/change-completion.md</Path>` 的六项完成门全部满足，当前 Implement 是无委派 Goal Plan 的最后计划内执行 owner。
- **影响工件：** Ticket frontmatter/checklist、Tickets Map、Goal Plan、change status、全局 SpecDev active index。
- **约束或不变量：** 完成本地 change 不授权 commit/push/merge/deploy/release；Archive 必须作为下一独立 Work 执行。
- **后续：** 可进入 Archive Work；归档前不再修改已完成工件。
- **替代/被替代：** 无
