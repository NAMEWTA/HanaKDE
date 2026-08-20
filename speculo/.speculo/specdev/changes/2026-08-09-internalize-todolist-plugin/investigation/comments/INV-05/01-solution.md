---
artifact: wayfinder-solution-comment
ticket: INV-05
sequence: 1
resolution: answered
---

# Solution: 收敛搜索筛选排序批量与规模体验

- **Ticket：** `<Path>{roots.state}/specdev/changes/2026-08-09-internalize-todolist-plugin/investigation/INV-05.md</Path>`
- **答案：** 搜索、筛选、排序都作用于 INV-03 定义的同源视图投影，并以每页 50 项的 cursor 查询扩展规模。首版保留明确进入的已有项多选和有限批量 mutation，但继续禁止批量创建；批量插件私有写入全成全不成，任何版本冲突都保留选择并返回逐项诊断，涉及 Automation 的外部取消采用显式确认与前向收敛。
- **事实与来源：**
  - **搜索范围：** 搜索标题、描述、Project 名和 tags，不索引 Automation 日志、Session 对话、附件内容或内部诊断。首版为 Unicode normalization 后忽略大小写的包含匹配，不做模糊搜索，也不改写展示文本。
  - **搜索作用域：** 默认只搜索当前视图的未完成 Todo；可显式切换“所有未完成”或 Completed。Trash 只在 Trash 内搜索。结果仍显示当前投影的出现理由、Project、日期和匹配片段，不建立独立结果状态。
  - **筛选：** 支持 Project、tags、priority、plannedFor、deadline、无日期、逾期、提醒状态与 Automation 状态。类别之间 AND，同类别多值 OR；全部活动条件显示为可移除 chip 并可清除全部，不允许不可见但仍生效的隐藏条件。
  - **默认排序：** Today 为逾期优先，再按 attentionDate、priority、创建时间；Inbox 创建时间倒序；Upcoming attentionDate 正序；Project/All 按 priority、attentionDate、创建时间；Completed 完成时间倒序。用户可切换日期、priority、创建时间和标题；首版无拖拽排序及自定义位置字段。
  - **查询状态与空态：** 搜索词、已应用筛选和排序按视图保存并进入内部导航历史，未应用的临时输入不进入。真正无 Todo 与筛选后无结果使用不同状态；后者显示条件与清除操作，不展示快速创建引导。请求失败沿用 INV-03 stale snapshot/专用错误态，不能冒充无结果。
  - **分页与规模：** cursor 每页 50 项，接近底部自动加载，并始终保留“加载更多”按钮供键盘和失败恢复。cursor 包含确定性排序 tie-breaker，mutation/后台刷新不得让已加载窗口出现重复或静默漏项；需要刷新时标识新结果并可显式归位。虚拟化不是首版强制方案，只有可重复规模基线证明必要且焦点、选择、详情返回均通过时才启用。
  - **选择模式：** 多选只能经明确“选择”命令进入，显示 checkbox 与固定操作栏；退出后恢复安静列表。最多选择 200 个已加载 Todo，不提供选择全部搜索结果。选中项按稳定 id/version 跨分页和刷新保留；移出当前视图时显示不可见数量，并允许查看或取消，不能静默丢失。
  - **允许的批量操作：** 仅完成、移动到 Project/Inbox、添加 tags、移除 tags、设置 priority、移入 Trash。不批量修改日期、提醒、周期、执行模式、Automation 配置，也不提供批量创建。周期 occurrence 只影响明确选中的 occurrence，绝不暗中扩展到未来或系列。
  - **预览与确认：** 每个批量操作先显示数量和变化摘要并由用户应用；删除，以及包含 scheduled/running/needs_action Automation 的完成，进入专门确认并解释取消影响。其它允许操作不增加第二层确认。任何详情中的失败/离线草稿不被批量 mutation 静默覆盖，冲突项需先解决。
  - **事务与冲突：** 请求携带每项 `id + expectedVersion` 和批量 `commandId`。Todo 私有 mutation 全成全不成；任一版本/校验冲突整批零写，返回冲突项。成功清空选择并保持搜索、筛选、排序和滚动；失败保留选择。结果不使用单一 success boolean 隐藏逐项诊断。
  - **整体撤销：** 完成、移动、tag/priority 与移入 Trash 成功后提供一次整体 versioned undo。撤销检查全部目标当前 version；任一项已有后续变化则整批撤销零写并列出冲突，不产生隐藏部分恢复。Trash 删除仍复用 prepare/confirm 与软删除合同。
  - **Automation 边界：** 涉及运行或计划 Automation 的批量完成/删除，插件事务记录 Todo mutation 与取消 intent，再幂等协调 future/queued/running Run；running 只有宿主确认后才是 cancelled，失败保持 `cancel_requested`/诊断可见。该前向过程不被描述为与宿主跨系统原子完成。
- **资产：** `<Path>{roots.state}/specdev/changes/2026-08-09-internalize-todolist-plugin/spec.md</Path>`、`<Path>{roots.state}/specdev/changes/2026-08-09-internalize-todolist-plugin/ticket/01-establish-builtin-persistent-crud.md</Path>`、`<Path>{roots.state}/specdev/changes/2026-08-09-internalize-todolist-plugin/ticket/02-deliver-safe-deletion-lifecycle.md</Path>`、`<Path>{roots.state}/specdev/changes/2026-08-09-internalize-todolist-plugin/investigation/comments/INV-02/01-solution.md</Path>`
- **后续 Ticket 所依赖的事实：** INV-09 的删除生命周期必须承接批量 Trash/undo 与 Automation cancel intent；INV-10 的 Review 批量动作不得绕过本票事务/选择规则；INV-11 的导入不是 UI 批量创建且必须维持独立 preview/commit 合同；INV-12/13 需验证 50 项分页、200 项选择、不可见选择、固定操作栏、焦点和窄布局；INV-14 需补充搜索/筛选/批量验收并确保 T-01/T-02/T-03/T-04/T-08 的实现覆盖。
- **新浮现的 Tickets：** 无。
- **升级的战争迷雾：** 无。
- **对现有 Tickets 的影响：** update T-01/T-02/T-03/T-04/T-08/T-10、AC-004/AC-005/AC-013/AC-014/AC-029/AC-031、INV-09/10/11/12/13/14。
