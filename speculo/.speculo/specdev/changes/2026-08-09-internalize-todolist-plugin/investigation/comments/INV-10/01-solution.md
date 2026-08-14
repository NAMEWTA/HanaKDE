---
artifact: wayfinder-solution-comment
ticket: INV-10
sequence: 1
resolution: answered
---

# Solution: 设计 Review 与完成历史复盘

- **Ticket：** `<Path>{roots.state}/specdev/changes/2026-08-09-internalize-todolist-plugin/investigation/INV-10.md</Path>`
- **答案：** Review 是一个可暂停、可继续、可结束的行动工作流，不是统计页。它从同一 Todo/occurrence/Automation 投影生成固定分段，要求用户对需要关注的项作出明确去向，同时保存范围、进度和最小审计；所有高影响动作继续复用既有预览、版本和幂等合同。
- **入口与时间范围：** Review 属于二级导航，默认范围是用户显示 IANA 时区的本周（周一 00:00 至周日 23:59:59）。支持上周、下周、最近 7 天、最近 30 天和自定义日期范围；范围、时区和边界在页面显式显示，并保存在 Review 自身视图状态，不改变 Today、Upcoming 或 Todo 持久字段。跨午夜或切换时区只重新计算投影，不重写 date/exact 原值。
- **固定分段：** 按稳定顺序展示 Inbox 未处理、逾期、未来 7 天、无日期、提醒/Automation 异常、最近完成六段。每段只返回满足条件的项；空段可折叠但保留计数，避免用户误以为查询漏数据。异常段同时覆盖 reminder `failed/unknown` 与 Automation `needs_action/failed/cancel_pending`，显示真实状态和最近原因。
- **确定性排序：** 逾期按 `attentionDate` 升序；Inbox 按创建时间降序；未来按 `attentionDate` 升序；无日期按 priority、创建时间；异常按最近状态变化；完成历史按 completion time 降序。所有排序使用稳定 ID 作为最终 tie-breaker，不引入拖拽自定义排序，分页/刷新不会重复或跳项。
- **逐项行动：** 每行支持 complete/reopen、编辑日期/Project/priority/tags、打开详情和进入 Trash。字段编辑复用 INV-04 的字段级 patch、expectedVersion 与冲突展示；提醒、周期范围、Agent 执行、删除和其它高影响变更必须显示结构化预览并确认。Review 不隐式创建 Todo、不隐式排期、不隐式启动 Run。
- **Inbox 闭环：** Inbox 未处理段为每项提供“分配 Project”“安排日期”“保持 Inbox”“移入 Trash”四个明确去向。用户可以逐项处理，也可以只对已选择项使用 INV-05 允许的批量 move/tags/priority/complete/Trash；不提供批量创建。操作成功后该项从当前段移除或移动到正确段，并保留可见撤销/失败反馈。
- **逾期与无日期：** 逾期项必须选择“重新安排”“标记完成”“保持原日期”“移入 Trash”之一，才记为本轮已处理；保持原日期是明确决定，不会偷偷清空日期。无日期项可保持无日期，但记录 Review decision，避免每次复盘都被误认为未处理。重新安排先写显式日期字段，不能把 Review 结束动作当作自动改期。
- **完成历史：** 最近完成段按完成日期有界分页，展示完成时的 Project、plannedFor/deadline、occurrence/rule version、完成时间和最近 Automation 摘要。重新计划动作先恢复 Todo，再要求用户显式修改字段；不改写完成历史、原 occurrence 时间或旧 Run/Session 投影。恢复冲突沿用 INV-09 的新预览和 expectedVersion。
- **异常处理：** Review 只提供合法的查看、retry、cancel 或转 manual/人工接管入口，并显示每个动作的当前版本和前置条件。`accepted`、`cancel_requested`、`cancel_pending` 均不能显示为成功；取消需宿主确认，失败/unknown 保留诊断且不自动重试。Review 查询失败保留最后一次成功列表并标记 stale，不能显示空列表或“已完成”。
- **进度保存：** 保存 Review 范围、时区、段折叠状态、筛选/排序、已处理稳定 ID 和滚动位置。已处理 ID 只是本轮提示，不改变 Todo 的 `pending/completed`，也不把关闭页面算作完成。重新进入时若实体版本或当前条件变化，旧 ID 显示“已变化/需复核”，不静默跳过。
- **结束本次复盘：** 只有用户主动点击“结束本次复盘”才写入 Review session 记录；记录范围、结束时间、已处理数、未处理数、异常数和跳过原因等最小事实。关闭页面、切换导航或浏览器刷新均保持未结束状态，可继续；不计算生产力评分、排名或评价性完成率。
- **主动导出：** Review 可对当前范围主动生成摘要下载，但必须复用 INV-11 的显式 export preview、脱敏、ResourceIO `stageFile` 和用户下载流程。默认不导出 Trash、Session transcript、workspace 绝对路径、token、secret 或完整 Agent 诊断；用户若要导出 Trash，必须在导出预览中显式勾选并看到额外计数与隐私提示。
- **空状态与动作失败：** 无待处理项时仍保留 quick capture 和范围调整入口，使用简短的可执行空状态，不加入装饰性统计卡。任何动作失败都保留选择、草稿和 Review 进度；重试使用新的 commandId 并重新读取目标版本，不能重复写入或伪造已处理。成功、待确认、失败、未知分别用可区分状态反馈。
- **资产：** `<Path>{roots.state}/specdev/changes/2026-08-09-internalize-todolist-plugin/Spec.md</Path>`、`<Path>{roots.state}/specdev/changes/2026-08-09-internalize-todolist-plugin/CONTEXT.md</Path>`、`<Path>{roots.state}/specdev/changes/2026-08-09-internalize-todolist-plugin/ticket/08-deliver-automation-operations-surface.md</Path>`、`<Path>{roots.state}/specdev/changes/2026-08-09-internalize-todolist-plugin/ticket/09-deliver-import-export-review.md</Path>`、`<Path>{roots.state}/specdev/changes/2026-08-09-internalize-todolist-plugin/investigation/comments/INV-03/01-solution.md</Path>`、`<Path>{roots.state}/specdev/changes/2026-08-09-internalize-todolist-plugin/investigation/comments/INV-05/01-solution.md</Path>`
- **后续 Ticket 所依赖的事实：** INV-11 使用 Review 的范围、脱敏和显式下载边界设计 exchange preview；INV-12/13 验证分段、进度恢复、stale 查询、确认动作和桌面/窄窗口交互；INV-14 统一 AC-022/027～031 与 Review/导出合同。
- **新浮现的 Tickets：** 无。
- **升级的战争迷雾：** 无。
- **对现有 Tickets 的影响：** update T-08/T-09/T-10、AC-022/027～031、INV-11/12/13/14。
