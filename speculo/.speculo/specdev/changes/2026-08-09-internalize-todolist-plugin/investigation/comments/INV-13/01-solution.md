---
artifact: wayfinder-solution-comment
ticket: INV-13
sequence: 1
resolution: answered
---

# Solution: 验证桌面窄窗口与键盘交互模型

- **Ticket：** `<Path>{roots.state}/specdev/changes/2026-08-09-internalize-todolist-plugin/investigation/INV-13.md</Path>`
- **答案：** Todo UI 采用同一信息架构的桌面/窄窗口变体，而不是两套行为。桌面使用导航、列表、详情侧面板；窄窗口使用单列和全屏详情/确认页。焦点、草稿、筛选、滚动和返回位置可恢复，错误和宿主能力降级始终有出口；本票只形成原型与验收证据，不写入产品目录。
- **响应式结构：** 桌面显示左侧一级导航、主列表和可选详情侧面板三栏；窄窗口切为单列，详情、Automation、Review 分段、导入 preview 和危险确认均进入全屏页，不用横向滚动承载核心动作。导航与内容的稳定层级在两种布局一致。
- **稳定尺寸与文本：** 导航、quick capture、列表行、checkbox、状态 badge、详情字段和固定操作栏使用稳定尺寸、最小宽度和明确换行策略。标题、Project、状态和多语言长文案允许多行或受控截断并提供完整可读名称；不能撑破行高、遮挡操作或让布局因 loading/error 文本跳动。
- **焦点与键盘：** 路由切换把焦点放到页面标题或主内容起点；打开详情/对话框把焦点移入首个有效控件，关闭后归还触发列表行/按钮；后台刷新不抢焦点。Tab 顺序为导航、捕获、筛选/排序、列表、操作；Enter/Space 只触发当前控件，IME composition 的 Enter 不创建；Escape 关闭弹层/退出选择模式但不丢草稿，不新增快捷键。
- **快速捕获：** 桌面与窄窗口都始终可见或可一键回到 capture。创建按钮和标题输入不被详情、错误层或批量操作遮挡；成功后保留输入焦点和上下文 chips，失败保留标题、上下文和恢复/重试入口。多行粘贴仍遵守 INV-02 的逐项创建禁令。
- **列表与详情：** 列表行只提供完成/恢复、打开详情等低风险动作；Trash、周期范围、批量完成/删除和 Automation 等危险动作进入确认。行内显示状态、出现理由、Project、日期和最近 Automation 摘要；窄窗口按优先级折叠但可展开，不能只剩无名称图标。桌面详情侧面板宽度可调整但有上下限；窄窗口详情为全屏页，有明确返回按钮并与浏览器历史一致。未保存/失败/冲突草稿离开时提供保留草稿、放弃或继续编辑。
- **筛选与多选：** 筛选 chips 始终可见且可逐个移除；多选通过明确选择模式进入，固定顶部/底部操作栏不遮挡最后一行，窄窗口操作栏可滚动。选择最多 200 个已加载稳定 ID，跨分页保留，不提供选择全部结果；任何批量动作继续遵守 INV-05 预览、全成全不成和冲突保留选择。
- **确认与错误层：** 危险确认、批量 preview、导入 preview 和诊断使用可返回的对话或窄窗口全屏页，展示主/次操作、影响数量、目标版本和外部副作用状态。失败不关闭用户上下文、不清除草稿或选择；操作成功、待宿主确认、失败、未知使用不同文案和 ARIA 状态。
- **Automation 与 Session：** retry/cancel/人工接管、`cancel_pending`、`needs_action` 和 SessionRef 降级在两种布局均可扫描；`accepted` 与 `cancel_requested` 不显示为成功。当前没有 `session.open` 时只显示 sessionRef/sessionId、复制和最小结果，不渲染假的打开会话按钮。
- **加载、stale 与空状态：** 初次加载使用骨架或明确 loading 文本；旧列表保留并标记 stale，加载更多失败保留已加载项和重试入口。真正无数据、筛选后无结果、功能不可用和加载失败使用不同状态；都保留适用的返回、清除筛选、quick capture 和诊断出口，不用装饰性教学卡替代行动。
- **五语言与可访问性：** zh-CN、zh-TW、ja、ko、en 的最长文案均通过桌面/窄窗口检查。控件有可读名称，状态使用 ARIA live/role，颜色不是唯一状态信号，焦点可见且顺序稳定；错误和确认层不会永久锁住基础 CRUD。
- **滚动、历史与原型边界：** 每个稳定视图保存筛选、排序、折叠、滚动和焦点恢复点；详情返回原列表位置。浏览器历史只记录页面、详情和已应用筛选等稳定状态，不记录临时 popover、toast 或输入草稿。本票的原型、截图和测试记录留在 SpecDev 工件/evidence，不进入 `<Path>plugins/todolist/</Path>`；最终产品实现仍全部采用 TypeScript/React 与 `professional-react/full` 约束。
- **资产：** `<Path>{roots.state}/specdev/changes/2026-08-09-internalize-todolist-plugin/Spec.md</Path>`、`<Path>{roots.state}/specdev/changes/2026-08-09-internalize-todolist-plugin/ticket/01-establish-builtin-persistent-crud.md</Path>`、`<Path>{roots.state}/specdev/changes/2026-08-09-internalize-todolist-plugin/ticket/08-deliver-automation-operations-surface.md</Path>`、`<Path>{roots.state}/specdev/changes/2026-08-09-internalize-todolist-plugin/ticket/09-deliver-import-export-review.md</Path>`、`<Path>{roots.state}/specdev/changes/2026-08-09-internalize-todolist-plugin/investigation/comments/INV-04/01-solution.md</Path>`、`<Path>{roots.state}/specdev/changes/2026-08-09-internalize-todolist-plugin/investigation/comments/INV-12/01-solution.md</Path>`
- **后续 Ticket 所依赖的事实：** INV-14 统一 AC-031、各状态反馈和原型证据；T-01～T-10 的 UI 实现均需复用本票的焦点、响应式、ARIA 和失败出口合同。
- **新浮现的 Tickets：** 无。
- **升级的战争迷雾：** 无。
- **对现有 Tickets 的影响：** update T-01/T-03/T-04/T-08/T-09/T-10、AC-006/021/028～031/033、INV-14。
