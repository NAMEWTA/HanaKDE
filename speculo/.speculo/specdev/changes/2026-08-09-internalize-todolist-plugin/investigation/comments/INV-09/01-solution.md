---
artifact: wayfinder-solution-comment
ticket: INV-09
sequence: 1
resolution: answered
---

# Solution: 完善删除回收站与数据生命周期

- **Ticket：** `<Path>{roots.state}/specdev/changes/2026-08-09-internalize-todolist-plugin/investigation/INV-09.md</Path>`
- **答案：** 删除采用可恢复的 Trash 生命周期，而不是直接消失；恢复、系列/Project 关联、运行中副作用、永久清除和导出各有明确边界。任何版本变化或宿主状态不确定都 fail closed，重新预览后才能继续，不以 UI 成功提示代替真实取消或交付。
- **删除模型：** Todo、Project、RecurrenceRule、occurrence、Reminder、AutomationRun/Attempt 分别拥有稳定 ID、版本和审计来源。Todo 的 `trashEntry` 保存删除前完整字段、原 Project/series 引用、删除原因、操作者、时间、`expectedVersion`、外部副作用收敛状态和 `commandId`。单条删除与既有批量删除共用同一状态机；INV-05 的批量操作仍是全成全不成、无批量创建。
- **进入 Trash：** 删除确认成功后，Todo 立即从活动投影移除并写入 Trash；未来 schedule/reminder 被取消，运行中 Run 收到取消意图。queued/future 可直接取消，claimed/running 进入 `cancel_pending`，只有宿主确认后才标记 `cancelled`。通知、Session 和 TaskRegistry 均不被假定为事务参与者，插件只记录 `requested/confirmed/failed/unknown` 的事实。
- **恢复字段：** 恢复使用 Trash 行的 `expectedVersion`，保留进入 Trash 前的标题、描述、Project、计划/截止、标签、系列 occurrence 身份、规则来源、运行历史和审计；版本不匹配返回最新投影和新的恢复预览，绝不静默覆盖。恢复成功只让 Todo 回到活动状态，不重放旧 schedule、reminder、handoff 或 AutomationRun。
- **恢复位置：** 原 Project 已删除或仍在 Trash 时，Todo 恢复到 Inbox 未分配状态，并保留历史 `projectRef` 供界面提示和后续重新关联；不自动重建 Project。Project 恢复是独立的显式动作，成功后引用可重新解析，但不会伪造 Todo 已经恢复到该 Project。
- **Trash 操作面：** Trash 只提供查看、恢复和永久清除。Trash 内禁止编辑、完成/恢复完成、排期、提醒、周期编辑、标签/优先级变更和启动 Agent；用户必须先恢复再编辑，从而不会让“已删除项”重新产生副作用。Trash 列表仍显示删除原因、原位置、关联 Project/series、取消状态和可执行阻断原因。
- **Project 生命周期：** Project 自身作为可恢复记录进入 Trash。删除 Project 不级联永久删除 Todo；未完成 Todo 在活动投影中转入 Inbox，同时保留原 Project 归属历史。恢复 Project 后，仍在活动状态且引用未被用户改写的 Todo 可重新解析到该 Project；已被用户重新分配的 Todo 不被抢回，冲突在 Project 恢复预览中列出。
- **周期生命周期：** 删除/结束系列只处理边界之后的未完成、已物化 occurrence；已完成 occurrence、规则版本、Reminder/Handoff/Automation 历史和审计永不删除。恢复单个 occurrence 不恢复系列、不自动生成后续 occurrence；恢复系列是独立的确认动作。系列结束、未来 occurrence 清理沿用 INV-07 的 prepare/confirm、规则版本和零写冲突合同。
- **运行中副作用：** 进入 Trash 或结束系列时向 schedule、reminder、Run 发出前向取消意图；取消尚未确认时显示 `cancel_pending`，失败显示 `cancel_failed`/原因，不能显示“已取消”。恢复不会复活旧 schedule、handoff、Run 或 Agent 授权；用户必须显式配置新一次执行。取消失败不会触发自动重试，也不会阻止用户查看或恢复，但会阻止 purge。
- **永久清除：** purge 前执行 preflight。只要存在 queued、claimed、running、`cancel_pending` 或宿主返回 unknown 的副作用，就拒绝清除并列出具体 Run/occurrence/资源；只有所有外部副作用已确认取消或已结束，且最新 Trash 版本与确认令牌匹配时才允许 purge。并发变化使令牌失效，返回新预览，不产生部分写入。
- **Session 与运行记录：** purge 删除插件私有的 AutomationRun/Attempt 详情、诊断和 Todo 上的 `sessionRef`；不调用不存在的 Session 删除能力，也不声称 Hana Session 已删除。宿主 Session 是否保留由宿主生命周期管理；Todo 插件不复制 transcript、路径、密钥或完整上下文。必要的最小 purge 审计只保存稳定 ID、时间、操作者、结果和原因哈希。
- **Undo：** 单条或批量 Trash 在短窗口内提供 Undo（产品默认窗口为 15 秒）；Undo 仍需携带 Todo/occurrence version、外部副作用状态和 mutationId。窗口过期、版本变化或取消状态变化后，Undo 明确失败并要求重新打开恢复预览，不尝试强制写回。
- **导出：** 默认导出活动 Todo、完成历史、系列规则、必要审计和最小运行投影；Trash 只有用户显式勾选“包含回收站”才导出；已 purge 内容不出现在导出中。导出不包含 Session transcript、workspace 路径、资源秘密或完整 Agent 诊断。导入/恢复备份必须把 Trash 与活动对象分开预览，不能通过普通导入隐式复活已删除副作用。
- **失败与重试：** 恢复、取消、Project/系列联动和 purge 的失败保留原 Trash、规则、运行状态和用户草稿；界面区分真实成功、已提交待宿主确认、失败和未知。重试使用新的 `commandId`，但同一稳定实体/occurrence 不创建重复 occurrence、Run、schedule 或审计；所有内部 mutation 采用 `expectedVersion + mutationId/commandId` 幂等处理。
- **资产：** `<Path>{roots.state}/specdev/changes/2026-08-09-internalize-todolist-plugin/ADR.md</Path>`、`<Path>{roots.state}/specdev/changes/2026-08-09-internalize-todolist-plugin/CONTEXT.md</Path>`、`<Path>{roots.state}/specdev/changes/2026-08-09-internalize-todolist-plugin/ticket/02-deliver-trash-restore.md</Path>`、`<Path>{roots.state}/specdev/changes/2026-08-09-internalize-todolist-plugin/ticket/05-deliver-recurrence-history.md</Path>`、`<Path>{roots.state}/specdev/changes/2026-08-09-internalize-todolist-plugin/ticket/07-deliver-isolated-agent-runs.md</Path>`、`<Path>{roots.state}/specdev/changes/2026-08-09-internalize-todolist-plugin/ticket/08-deliver-automation-operations-surface.md</Path>`
- **后续 Ticket 所依赖的事实：** INV-10 展示 Trash/恢复后历史、Project/series 来源和 Run 收敛状态但不复制 transcript；INV-11 将活动、完成历史和可选 Trash 分开导出并保留引用；INV-12/13 验证删除确认、cancel_pending、purge 阻断、恢复冲突和窄窗口布局；INV-14 统一删除、恢复、批量、周期和自动化验收合同。
- **新浮现的 Tickets：** 无；宿主 Session 删除能力、Session 导航和外部副作用的跨系统事务仍属于独立系统能力，不在 Todo 插件内私造。
- **升级的战争迷雾：** 无。
- **对现有 Tickets 的影响：** update T-02/T-05/T-06/T-07/T-08/T-09/T-10、AC-014～018/021～022/026/029～033、INV-10/11/12/13/14。
