---
artifact: wayfinder-map
change: 2026-08-09-internalize-todolist-plugin
status: active
---

# Wayfinder Map: Todo 产品闭环与顺手体验

## 目的地

形成一套经过用户确认、可直接修订当前 Spec、ADR、Tickets 与 Goal Plan 的决策完备补充合同：Todo 的高频路径足够快，异常与恢复路径闭环，提醒、周期和 Agent 自动化不误导用户，桌面与窄窗口均可稳定操作。

## 说明

本地图只进行产品与架构寻路，不修改 `<Path>plugins/todolist/</Path>` 或其它产品代码。每次遍历只关闭一个调查 Ticket；涉及用户偏好的 Ticket 必须由用户实时回答，Agent 不代答。

产品语言规范固定为 TypeScript：插件运行时、routes、tools、领域服务、持久化、React UI、测试与构建配置均使用 TypeScript；不在 `<Path>plugins/todolist/</Path>` 引入 Python 源码、Python 运行时或 Python 构建依赖。`hana-plugin-creator` 自带 Python 脚手架生成器只是仓外生成工具，不代表产品实现语言；本 change 默认不依赖它生成生产代码。

持续咨询 `<Path>skills2set/hana-plugin-creator/SKILL.md</Path>`、`<Path>PLUGIN_SDK.md</Path>`、`<Path>PLUGINS.md</Path>`、当前 change 的 Spec/ADR/CONTEXT/Tickets/Goal Plan 以及仓库运行时事实。稳定的 WebView/iframe、routes、tools、lifecycle、TaskRegistry、Session/Agent、ResourceIO 与插件私有数据边界优先；不假设 rich native card、未声明权限或宿主内部对象可用。

功能落点判定为**内置插件**：Todo 产品消费现有插件贡献面与宿主契约，新增 Todo 私有领域模型、持久 store 和插件内编排，产物属于插件私有数据或显式导出的 SessionFile。逐条判据为：不修改特权子系统；不定义其它组件依赖的公共原语；可在 PluginManager 之后通过 `onStartup` lifecycle 恢复自身 handler，而非成为先于插件系统的常驻基础设施；可整块删除；可由 page/routes/tools/lifecycle/task 表达；权限可由 full-access、manifest capabilities、session permission 与 ResourceIO 自洽声明；数据不成为系统共享状态。最强反方是提醒和调度恢复依赖启动期宿主能力；若调查证明缺少稳定公共契约，该契约必须由独立的系统 change 提供，不能在 Todo 插件内私造。

建议落点保持 `<Path>plugins/todolist/</Path>`，采用 professional React/full 形态；具体 manifest capabilities、activation events、host capabilities 与后台恢复协议由“核验宿主插件契约与文档漂移”调查锁定。

## 已做出的决策

- **核验宿主插件契约与文档漂移：** `<Path>{roots.state}/specdev/changes/2026-08-09-internalize-todolist-plugin/investigation/comments/INV-01/01-solution.md</Path>` —— Todo 可保持 TypeScript 内置插件且无需系统前置 change；TaskRegistry 使用有界晚就绪握手，通知仅承诺 event handoff，Session 跳转缺口交由产品决策收口。
- **锁定三秒捕获与上下文继承：** `<Path>{roots.state}/specdev/changes/2026-08-09-internalize-todolist-plugin/investigation/comments/INV-02/01-solution.md</Path>` —— 首版只允许逐项捕获，Enter 单项提交且兼容 IME；上下文继承必须可见，不做自然语言识别，并以幂等 pending、隔离草稿和非阻断失败支持连续录入。
- **定义导航视图与任务出现理由：** `<Path>{roots.state}/specdev/changes/2026-08-09-internalize-todolist-plugin/investigation/comments/INV-03/01-solution.md</Path>` —— 一级行动视图与二级运营视图分层；attentionDate 统一取计划/截止较早日，列表解释出现理由，并在桌面/窄窗口恢复同一导航与详情状态。
- **设计编辑保存冲突与撤销反馈：** `<Path>{roots.state}/specdev/changes/2026-08-09-internalize-todolist-plugin/investigation/comments/INV-04/01-solution.md</Path>` —— 普通字段采用可观察的字段级自动保存，高影响配置显式应用；expectedVersion、单次自动重放、本地草稿、人工冲突与 versioned undo 防止静默覆盖。
- **收敛搜索筛选排序批量与规模体验：** `<Path>{roots.state}/specdev/changes/2026-08-09-internalize-todolist-plugin/investigation/comments/INV-05/01-solution.md</Path>` —— 同源投影采用可见筛选、确定性排序和 50 项 cursor 分页；已有项可明确多选并全成全不成地批量修改，但批量创建继续禁止。
- **闭环计划截止提醒与错过补救：** `<Path>{roots.state}/specdev/changes/2026-08-09-internalize-todolist-plugin/investigation/comments/INV-06/01-solution.md</Path>` —— 时间意图分离，单活动 reminder 采用 reminder/occurrence/handoff identity；错过与交接不确定项只显式补救，不自动重发或宣称送达。
- **完成周期任务的日常操作语义：** `<Path>{roots.state}/specdev/changes/2026-08-09-internalize-todolist-plugin/investigation/comments/INV-07/01-solution.md</Path>` —— 周期规则是系列权威、occurrence 是独立事实；日常操作默认只作用当前项，未来修改必须确认并版本化，暂停/结束不改写历史。
- **定义 Agent 协作授权冲突与结果回路：** `<Path>{roots.state}/specdev/changes/2026-08-09-internalize-todolist-plugin/investigation/comments/INV-08/01-solution.md</Path>` —— Agent 执行显式预览授权、每 occurrence 独立 Run/Session，accepted 不等于成功，结果不自动完成 Todo；人工接管和取消 fail closed，Session 导航采用稳定 ref 降级。
- **完善删除回收站与数据生命周期：** `<Path>{roots.state}/specdev/changes/2026-08-09-internalize-todolist-plugin/investigation/comments/INV-09/01-solution.md</Path>` —— Todo、Project 与周期 occurrence 采用可恢复 Trash 生命周期；恢复不复活旧副作用，运行中取消保持真实状态，purge 受外部副作用和版本前置条件约束，导出与审计严格限制敏感数据。
- **设计 Review 与完成历史复盘：** `<Path>{roots.state}/specdev/changes/2026-08-09-internalize-todolist-plugin/investigation/comments/INV-10/01-solution.md</Path>` —— Review 是有时间范围、固定分段、明确去向、可保存进度并主动结束的行动工作流；异常 Run 保持真实状态，完成历史不可改写，导出复用显式脱敏合同。
- **闭环导入导出备份与冲突预演：** `<Path>{roots.state}/specdev/changes/2026-08-09-internalize-todolist-plugin/investigation/comments/INV-11/01-solution.md</Path>` —— 交换格式严格版本化，导入先 preview 再原子幂等提交且不触发副作用；导出取一致快照并显式下载，Trash、运行摘要和审计按用户选择脱敏包含。
- **定义首次使用与全局异常恢复状态：** `<Path>{roots.state}/specdev/changes/2026-08-09-internalize-todolist-plugin/investigation/comments/INV-12/01-solution.md</Path>` —— 首次打开直达可操作 Inbox，真实空数据与 loading/stale/degraded/blocked 分离；基础 CRUD 与局部能力隔离，migration、后台 readiness、通知、Session、ResourceIO 和导入导出均提供可诊断、可重试出口。
- **验证桌面窄窗口与键盘交互模型：** `<Path>{roots.state}/specdev/changes/2026-08-09-internalize-todolist-plugin/investigation/comments/INV-13/01-solution.md</Path>` —— 桌面三栏与窄窗口单列全屏详情共享同一行为；焦点、草稿、滚动和历史可恢复，错误/确认/多选在两种布局均不遮挡且具备 ARIA 与五语言出口，原型不进入产品目录。
- **收口首发范围验收与文档回写路线：** `<Path>{roots.state}/specdev/changes/2026-08-09-internalize-todolist-plugin/investigation/comments/INV-14/01-solution.md</Path>` —— 首发阻断范围、后续增强、未授权动作、TypeScript 边界、Spec/ADR/Ticket/Goal Plan 回写顺序和 I-implement 授权门全部固定；Wayfinder 完成不代表产品实现或 change 完成。

## 尚未明确

- 高频交互与响应式原型完成后，现有 T-03/T-04/T-08 的垂直切片是否需要重排，目前还不能精确到文件级执行合同。
- 产品决策收敛后新增验收合同的准确数量、优先级和 Ticket 覆盖关系仍待最终范围收口。

## 超出范围

- 团队协作、共享列表、多层子任务、复杂依赖、看板、Habit、Pomodoro、位置提醒与生产力评分套件。
- 用 rich native card 或 renderer 私有 API 取代稳定的 WebView/iframe Page。
- 在 Wayfinder 中编写生产代码、执行真实用户数据导入、发布、提交、推送或修改远程系统。
