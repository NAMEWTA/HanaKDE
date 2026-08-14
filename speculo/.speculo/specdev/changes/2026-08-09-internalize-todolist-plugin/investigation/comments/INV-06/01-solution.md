---
artifact: wayfinder-solution-comment
ticket: INV-06
sequence: 1
resolution: answered
---

# Solution: 闭环计划截止提醒与错过补救

- **Ticket：** `<Path>{roots.state}/specdev/changes/2026-08-09-internalize-todolist-plugin/investigation/INV-06.md</Path>`
- **答案：** `plannedFor`、`deadline` 和 reminder trigger 是分离的时间意图；首版每个 Todo 只有一个活动 reminder。提醒以稳定 reminder/occurrence/handoff 三层身份接入唯一 TaskRegistry，并以显式重试、稍后提醒和错过补救形成诚实闭环，不宣称操作系统送达，也不自动轰炸用户。
- **事实与来源：**
  - **时间意图：** `plannedFor` 表示计划处理，`deadline` 表示必须完成，trigger 表示提醒时刻；三者分开编辑，前两者不会隐式创建 reminder。plannedFor/deadline 支持 date 或 zoned exact time；reminder 必须是精确时间。
  - **默认与建议：** reminder 必须显式开启。若 plannedFor 是精确时间，开启时只建议同一时刻；否则 deadline 是精确时间时建议同一时刻；纯日期不猜时间，要求用户选择。首版每 Todo 只有一个活动 reminder，多提醒留作未来优化。
  - **时区与 DST：** 精确时间保存 local value、IANA timezone 和唯一 instant；DST gap 拒绝，overlap 要求用户选择 offset。系统时区变化不改已保存 IANA zone/instant；纯日期保持原日历日期。Today/Upcoming 使用 INV-03 的显示时区和 `attentionDate=min(plannedFor,deadline)`。
  - **稳定身份：** 活动 reminder 有稳定 `reminderId`；每次触发有 `occurrenceId`；每次通知尝试有 `handoffId`/attempt。提醒时间编辑创建新的 reminder version，先取消旧 schedule；旧 occurrence 即使晚到也只标为 superseded。重试沿用同一 occurrence，生成新的 handoff attempt，不复制提醒事实。
  - **重计划：** 修改 plannedFor/deadline 不自动移动 reminder，详情明确显示“提醒仍在原时间”；用户必须显式选择同步 reminder 或保留。关闭 reminder、切到 manual、完成或移入 Trash 时取消未来 schedule；已到期未 claim occurrence 标记 cancelled，已 claim 的 handoff 历史保留真实状态。
  - **到期与交接：** TaskRegistry 是唯一 due authority，插件不维护第二 timer 或 due scanner。到期先事务写 stable schedule/occurrence/handoff claim，再发射宿主全局 `notification` event；`handed_off` 仅代表事件交给宿主，不能表示已展示/已送达。权限拒绝、无桌面订阅者、EventBus 异常和进程崩溃分别进入 failed 或 unknown，诊断脱敏。
  - **重试：** “现在重试”仅对 `handoff_failed` 与 `handoff_unknown` 可用，已 `handed_off` 不自动或手动重复发送；重试前显示标题、原触发时间和原因。failed 重试失败保留 failed 并增加 attempt；unknown 成功也保留旧 unknown 历史和新明确结果。
  - **稍后提醒：** 提供 10 分钟、1 小时、明天同一时间和自定义精确时间。新时间不能早于当前时刻，且创建新的 trigger occurrence，不覆盖原 reminder 配置。原 occurrence 进入 missed/deferred 历史，新 occurrence 是唯一活动补救项。
  - **错过补偿：** 应用关闭、休眠或 readiness 晚就绪导致的错过，重启只处理稳定 occurrence 一次；不扫描全部 Todo，不按错过时长重复触发。超过 24 小时默认进入“需要处理”，用户可“现在提醒”或“关闭”，不发送跨多个错过点的通知洪泛。
  - **展示与正交性：** Reminder 页面和 Todo 详情显示相同 projection：下一次 trigger、最近 occurrence、handoff 状态、attempt 次数、原因与可用动作。Reminder 状态不改变 Todo pending/completed；Reminder 和 Agent automation 开关独立，关闭其一不取消另一项。
  - **完成与历史：** 完成 Todo 取消尚未触发 schedule；已交接或 unknown 通知无法撤回，历史保留。所有 reminder/occurrence/handoff 状态变更记录稳定 identity、时间、状态和脱敏原因，不保存 OS 送达证明、路径、token 或完整通知正文。
- **资产：** `<Path>{roots.state}/specdev/changes/2026-08-09-internalize-todolist-plugin/ticket/04-deliver-typed-time-and-focus-views.md</Path>`、`<Path>{roots.state}/specdev/changes/2026-08-09-internalize-todolist-plugin/ticket/06-deliver-scheduler-readiness-and-reminders.md</Path>`、`<Path>{roots.state}/specdev/changes/2026-08-09-internalize-todolist-plugin/CONTEXT.md</Path>`、`<Path>{roots.state}/specdev/changes/2026-08-09-internalize-todolist-plugin/ADR.md</Path>`
- **后续 Ticket 所依赖的事实：** INV-07 以 occurrence 独立身份、完成后 next、Reminder 不随重计划隐式移动为边界；INV-08 以精确 trigger 和 automation 开关独立为边界；INV-09 承接完成/Trash 时 schedule 收敛；INV-10 展示 reminder 历史但不改主状态；INV-12/13 验证 DST、错过、权限/无订阅者、handoff 状态与显式动作；INV-14 需将旧的多提醒/自然语言/已送达表述统一为本票合同。
- **新浮现的 Tickets：** 无。
- **升级的战争迷雾：** 无。
- **对现有 Tickets 的影响：** update T-04/T-05/T-06/T-07/T-08/T-10、AC-008～012/023/024/029/031、INV-07/08/09/10/12/13/14。
