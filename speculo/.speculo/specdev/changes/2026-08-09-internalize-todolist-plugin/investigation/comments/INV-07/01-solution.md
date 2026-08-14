---
artifact: wayfinder-solution-comment
ticket: INV-07
sequence: 1
resolution: answered
---

# Solution: 完成周期任务的日常操作语义

- **Ticket：** `<Path>{roots.state}/specdev/changes/2026-08-09-internalize-todolist-plugin/investigation/INV-07.md</Path>`
- **答案：** 周期由 `calendar` 或 `after_completion` 两种明确锚点构成，规则是系列权威，物化 occurrence 是独立 Todo 事实。日常操作默认只影响当前 occurrence；未来变更必须显式选择范围、版本化并确认，历史永不重写。
- **事实与来源：**
  - **创建与规则：** 创建周期必须选择 `calendar` 或 `after_completion`，不默认推断。calendar 首版支持每日、每周、每月、每年；after_completion 支持完成后固定日/周/月间隔。复杂自然语言 RRULE、工作日/节假日系统和外部日历同步不在范围。
  - **系列与 occurrence：** RecurrenceRule 是系列权威；每个 occurrence 有独立 id、version、规则来源、时间、状态、提醒和 AutomationRun。Calendar 只按 Upcoming 可见窗口物化，预览只读不写；重复物化、扩大窗口和并发调用均由 stable identity 幂等收敛。
  - **after_completion：** 当前 occurrence 未完成时绝不生成下一项；完成 mutation 成功后登记 next-materialization intent，事务失败可重试；并发完成最多生成一个 next occurrence。生成失败不回滚已完成 Todo，不重复生成。
  - **日常默认范围：** 列表完成、提前完成、跳过、改期、删除、提醒或附件操作默认只影响当前 occurrence。周期详情顶部显示当前项、下一项和系列状态，提供下一次只读预览；“删除本次 occurrence，不影响系列”与“删除系列”必须是不同命令。
  - **仅本次：** 创建保留规则来源的 occurrence override，显示“本次已调整”；不回写 rule、不影响后续 occurrence。跳过本次写稳定 suppression key，不创建替代 occurrence；对 after_completion 来说跳过不等于完成，不生成 next。删除本次是软删除到 Trash，保留系列规则。
  - **本次及未来：** 操作前显示边界日期、受影响未完成 occurrence 数量和历史/完成项不变承诺；确认后从当前 occurrence 建立新 rule version，仅替换边界之后未完成的已物化 occurrence。手动编辑字段不会静默丢失，规则变更覆盖 override 时必须列出冲突并让用户逐项选择。
  - **暂停/恢复：** 暂停停止未来 occurrence 物化、提醒和 Agent trigger；已存在 occurrence 保持可见，已 claim/running 的 handoff/Run 不被伪造取消。恢复从当前规则边界创建新的未来 schedule，不补发暂停期间全部 occurrence，不复活旧 Run。
  - **结束系列：** 停止规则和新 occurrence 物化；边界之后已物化且未完成的 occurrence 经 T-02 prepare/confirm 后软删除至 Trash，并保留系列来源、rule version、审计和关联历史。已完成 occurrence、历史规则版本、Reminder/Handoff/Automation 历史永不删除；从 Trash 恢复某个未来 occurrence 不自动恢复整个系列。
  - **确认与失败：** 系列编辑、暂停、恢复、结束、未来替换等批量/破坏性变更复用 T-02 prepare/confirm。rule version、occurrence version 或 Todo version 任一变化使旧 token 失效，整次零写。规则、occurrence 或物化失败保留原 rule/occurrence/草稿，提供重试；重新打开页面不能触发重复物化。
  - **后台身份：** Reminder 与 Automation 始终绑定具体 occurrence；编辑系列不重用旧 occurrence 的 handoff/Run identity，新 occurrence 才产生新的后台事实。周期历史按 occurrence 展示来源 rule version、计划时间、实际完成/跳过/删除状态和 override，不能把系列汇总行伪装成单个 Todo。
- **资产：** `<Path>{roots.state}/specdev/changes/2026-08-09-internalize-todolist-plugin/ADR.md</Path>`、`<Path>{roots.state}/specdev/changes/2026-08-09-internalize-todolist-plugin/CONTEXT.md</Path>`、`<Path>{roots.state}/specdev/changes/2026-08-09-internalize-todolist-plugin/ticket/05-deliver-recurrence-history.md</Path>`、`<Path>{roots.state}/specdev/changes/2026-08-09-internalize-todolist-plugin/investigation/comments/INV-06/01-solution.md</Path>`
- **后续 Ticket 所依赖的事实：** INV-08 以 occurrence 精确触发和每 occurrence 独立 Run 为边界；INV-09 承接结束系列的未来 occurrence Trash 与恢复隔离；INV-10 展示 rule version/occurrence 历史但不改写；INV-11 导出 occurrence/series 引用并保持版本；INV-12/13 验证周期范围确认、预览、窄布局和失败重试；INV-14 需修订周期相关旧表述并补齐 AC-015/016。
- **新浮现的 Tickets：** 无。
- **升级的战争迷雾：** 无。
- **对现有 Tickets 的影响：** update T-02/T-04/T-05/T-06/T-07/T-08/T-09/T-10、AC-014～018/024/029/030/031、INV-08/09/10/11/12/13/14。
