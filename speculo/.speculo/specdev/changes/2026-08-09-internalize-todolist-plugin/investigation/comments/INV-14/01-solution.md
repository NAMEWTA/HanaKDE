---
artifact: wayfinder-solution-comment
ticket: INV-14
sequence: 1
resolution: answered
---

# Solution: 收口首发范围验收与文档回写路线

- **Ticket：** `<Path>{roots.state}/specdev/changes/2026-08-09-internalize-todolist-plugin/investigation/INV-14.md</Path>`
- **答案：** Wayfinder 已完成产品闭环寻路，但不等于产品实现授权或 change 完成。T-01～T-10 的核心行为构成首发阻断合同；自然语言、批量创建、复杂周期和其它未授权扩展明确后置/越界。下一步按 S-spec -> T-tickets -> P-goal-plan 的回写顺序统一文档，再由用户明确进入 I-implement，产品代码始终只写 TypeScript 的 `<Path>plugins/todolist/</Path>`。
- **首发阻断范围：** 同源持久 CRUD、逐项捕获、Inbox/Today/Upcoming/Projects/All 与二级视图、typed date/exact/DST、周期 occurrence/历史不可变、提醒 handoff、每 Todo×occurrence 隔离 Agent Run/Session/Attempt/取消、Trash/Undo/恢复/purge 前置条件、Automation 运营、Review、exchange schema v1 preview/原子幂等 commit/一致快照导出、首次使用与异常降级、五语言/键盘/ARIA/桌面窄布局、插件构建/seed/可整块删除边界。
- **首发质量门：** AC-001～AC-033 与 NFR-001～NFR-006 均须有命令、代码/产物、截图或批准证据。任一未验证、隐藏部分成功、假送达/假取消、权限越界、Session transcript/路径泄漏、第二 scheduler、插件外产品写入、migration/事务不一致均阻断对应 Ticket/Gate；不能以“主要流程可用”放行。不可执行的关键验证标为 `unverified` 并保持阻断。
- **基础可用优先级：** store 与核心 Todo routes 可用时，基础创建、编辑、完成、恢复、Trash 继续可用；附加 Project、Calendar、Review、Import/Export、Automation 失败只隔离对应 surface。私有 store migration、核心 routes 或数据一致性失败时阻断写入、保留原数据和草稿，进入诊断/重试，不渲染空数据。
- **后续增强：** 自然语言识别、复杂 RRULE/工作日/节假日、第三方日历、Bridge/渠道送达回执、`session.open` 导航、模糊搜索、拖拽排序、生产力评分、完整报告/Transcript 导出、批量创建以及更丰富的项目分析均不得混入首发；任何后续能力先新建产品决策和适用 Ticket。
- **明确未授权/越界：** 真实用户数据 import/purge/migration、真实通知、真实 Agent 执行、发布部署、提交推送和远程写入均不在本轮授权；只实现插件内 preview、事务、fake/harness 和故障注入测试。不得修改 Core、server、desktop、shared、SDK、公共测试、构建脚本或其它插件。
- **TypeScript 约束：** 产品运行时、routes/tools、domain/store、React UI、测试、fixtures、Playwright 配置与 build config 全部使用 TypeScript。`hana-plugin-creator` 的 Python 脚手架只是仓外生成工具；生产目录不引入 Python 源码、运行时或构建依赖。
- **文档回写路线：** 用户行为、首发范围和 AC 变化回写 S-spec；宿主能力、状态机、隐私、调度和架构边界回写 ADR；文件级实现、命令、owner、验证矩阵和 Evidence 回写 T-tickets；依赖、波次、Gate、授权和恢复路线回写 Goal Plan。Wayfinder 保留用户决策来源，下游不复制第二套易漂移合同。
- **旧文档冲突：** 若既有 Spec/ADR/Ticket 与本轮 solution 冲突，先在回写中列出旧表述、新表述和受影响 AC，再由对应层更新；禁止默默覆盖。若发现宿主 SDK、capability 或路径事实变化，返回 feature-placement/架构调查重新裁决，不在 T-ticket 内临时扩大范围。
- **实现顺序与授权门：** 依次执行 T-01 -> T-02 -> T-03 -> T-04 -> T-05 -> T-06 -> T-07 -> T-08 -> T-09 -> T-10；前一票 Evidence、回归和 Gate 完整后才能进入下一票。Wayfinder 完成后仍停在 planning；只有用户明确进入 `<Path>{roots.workflows}/specdev/I-implement/I-implement.md</Path>` 才可创建产品文件。进入 I 前重新运行 creator preflight、baseline/宿主接缝检查、tickets/goal-plan validator，并确认插件路径 ownership。
- **验证分层：** Vitest 负责领域、store、routes、tools、组件和故障注入；Playwright 只覆盖直接用户流程和发布汇合。每个 Ticket Evidence 记录 baseline、命令/exit/result、AC 映射、未运行项、失败分类、双轴审查、路径审计、偏差和残余风险；不得用代码阅读替代关键验证。
- **完成条件：** 只有 T-10/G5 汇总所有 Evidence、AC/NFR、路径审计、产物加载、删除 `<Path>plugins/todolist/</Path>` 的隔离 smoke、全量回归和用户批准后，change 才能按 `change-completion.md` 转为 completed。本轮只关闭 INV-01～INV-14 调查票，不关闭 change、不提交、不发布。
- **资产：** `<Path>{roots.state}/specdev/changes/2026-08-09-internalize-todolist-plugin/Spec.md</Path>`、`<Path>{roots.state}/specdev/changes/2026-08-09-internalize-todolist-plugin/ADR.md</Path>`、`<Path>{roots.state}/specdev/changes/2026-08-09-internalize-todolist-plugin/tickets-map.md</Path>`、`<Path>{roots.state}/specdev/changes/2026-08-09-internalize-todolist-plugin/goal-plan.md</Path>`、`<Path>{roots.state}/specdev/changes/2026-08-09-internalize-todolist-plugin/investigation/comments/INV-01/01-solution.md</Path>`～`<Path>{roots.state}/specdev/changes/2026-08-09-internalize-todolist-plugin/investigation/comments/INV-13/01-solution.md</Path>`
- **后续路线：** 先进入 `specdev/S-spec` 回写唯一产品合同；再进入 `specdev/tickets` 同步文件级实现与验证矩阵；随后进入 `specdev/goal-plan` 同步波次/Gate/授权；最后由用户明确进入 `specdev/I-implement`。实现阶段每一票结束后回到变更状态和 Evidence 校验，不能跳过 Gate。
- **新浮现的 Tickets：** 无。
- **升级的战争迷雾：** 无。
- **对现有 Tickets 的影响：** update T-01～T-10、AC-001～AC-033、NFR-001～NFR-006 及 Goal Plan G0～G5；后续增强必须另开决策，不在本 change 首发范围内。
