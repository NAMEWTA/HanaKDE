---
artifact: wayfinder-solution-comment
ticket: INV-03
sequence: 1
resolution: answered
---

# Solution: 定义导航视图与任务出现理由

- **Ticket：** `<Path>{roots.state}/specdev/changes/2026-08-09-internalize-todolist-plugin/investigation/INV-03.md</Path>`
- **答案：** Todo 使用稳定的行动视图层级：一级为 Today、Inbox、Upcoming、Projects、All，二级为 Calendar、Completed、Automation、Review。Todo 主状态与 Project 归属保持单一，视图都是同一 store 的可重叠投影；列表行必须解释当前出现理由，导航、返回状态、空态和失败态使用同一套桌面/窄窗口语义。
- **事实与来源：**
  - **导航层级：** 一级固定为 Today、Inbox、Upcoming、Projects、All；Calendar、Completed、Automation、Review 放在分隔后的二级区域。Trash 是 Completed 内的独立入口，不占主导航。空视图保留快速捕获，仅展示简短状态和相关主操作，不放教学说明或装饰卡片。
  - **成员规则：** Today 只含未完成且 `attentionDate <= today` 的 Todo，分为逾期与今天，逾期持续保留到完成或重新计划。Inbox 是无 Project 的未完成 Todo，即使同一项也属于 Today。Upcoming 只含未来 `attentionDate`，无日期不进入。All 是全部未完成 Todo，不混入 Completed 或 Trash。
  - **attentionDate 裁决：** `attentionDate = min(plannedFor, deadline)`，在显示时区中派生且不持久化。两者同日时 Todo 只出现一次，同时显示“计划今天 · 截止今天”；不同日期时 Today/Upcoming 归入较早日期，并同时展示两个日期。`<Path>ticket/04-deliver-typed-time-and-focus-views.md</Path>` 中“plannedFor 优先、deadline 后备”的旧表述必须被替换。
  - **日期边界与 Upcoming 窗口：** Today 使用当前显示时区本地日的 `00:00` 至次日 `00:00` 边界，午夜自动刷新成员与计数。Upcoming 默认加载未来 30 个本地日，按日期分组，底部每次继续加载 30 日；这是查询与 calendar recurrence 物化的有界窗口，不是一次性生成全部未来 occurrence。
  - **出现理由与计数：** Todo 可同时出现在多个行动视图，行内按当前投影显示“计划今天”“截止今天”“逾期 3 天”等理由。Today 徽标计逾期加今天，Inbox 计无 Project 的未完成 Todo，Automation 只计需要人工处理的 Run；其它导航不显示徽标。计数与列表使用相同查询口径并随 mutation、午夜刷新和后台事件更新。
  - **Projects：** Projects 先进入项目总览。桌面侧栏可展开具体 Project，窄窗口从项目列表进入具体项目。总览卡/行显示未完成数量和最近 `attentionDate`；具体 Project 侧栏入口不显示徽标。Project 仍为单层稳定归属，不引入嵌套层级。
  - **Calendar 与 Completed：** Calendar 默认月视图，选择日期后展示当天 Todo，默认仅未完成项；首版不支持拖拽改期，必须走明确编辑。Completed 按完成日期倒序分组并有界分页，可打开详情和恢复，不混入 Trash。
  - **详情与返回：** 桌面以侧边详情面板打开 Todo，窄窗口使用全屏详情；关闭或返回恢复原列表的滚动、筛选、展开分组与焦点。数据变化使 Todo 移出当前投影时，返回原位置并告知移出理由，不强跳到新视图。
  - **导航历史：** Todo 内部 navigation history 恢复视图、Project、日期和详情；临时菜单、popover、确认层等不进入历史。各入口分别保存滚动、筛选、展开分组和选中 Todo，避免跨视图状态污染。
  - **失败不等于空：** 加载失败保留导航和上一次成功列表，明确标为可能过期并提供重试；没有成功快照时显示专用错误态。请求失败不得渲染为空状态，也不得清空用户的捕获草稿。
- **资产：** `<Path>{roots.state}/specdev/changes/2026-08-09-internalize-todolist-plugin/spec.md</Path>`、`<Path>{roots.state}/specdev/changes/2026-08-09-internalize-todolist-plugin/CONTEXT.md</Path>`、`<Path>{roots.state}/specdev/changes/2026-08-09-internalize-todolist-plugin/ticket/03-deliver-capture-and-organization.md</Path>`、`<Path>{roots.state}/specdev/changes/2026-08-09-internalize-todolist-plugin/ticket/04-deliver-typed-time-and-focus-views.md</Path>`
- **后续 Ticket 所依赖的事实：** INV-04 以桌面侧栏/窄窗口全屏详情、原列表状态恢复和移出理由为编辑反馈边界；INV-05 以各投影成员规则、分页和计数口径设计搜索筛选；INV-07 以 Upcoming 30 日滚动窗口约束 recurrence 物化；INV-10 不能让 Review 改写行动视图成员规则；INV-12/INV-13 需原型验证 URL/history、焦点、午夜刷新、stale snapshot 与桌面/窄窗口一致性；INV-14 需统一 attentionDate 文档漂移并补齐导航验收。
- **新浮现的 Tickets：** 无。
- **升级的战争迷雾：** 无。
- **对现有 Tickets 的影响：** update T-03/T-04/T-05/T-08/T-09/T-10、AC-005/AC-030/AC-031、INV-04/05/07/10/12/13/14。
