---
artifact: wayfinder-solution-comment
ticket: INV-12
sequence: 1
resolution: answered
---

# Solution: 定义首次使用与全局异常恢复状态

- **Ticket：** `<Path>{roots.state}/specdev/changes/2026-08-09-internalize-todolist-plugin/investigation/INV-12.md</Path>`
- **答案：** Todo Page 必须始终给出可理解的当前状态和出口。首次使用直接进入可操作 Inbox；初始化、stale、degraded、blocked 与真实空数据严格区分。基础 CRUD 与局部能力隔离，所有重试、诊断和宿主不确定结果 fail closed，不用空白页或假成功掩盖问题。
- **首次打开与状态机：** 首次打开直接显示 Inbox/quick capture；零数据只显示轻量可执行空状态，不要求教程、导入或配置，不展示伪造统计。页面状态至少区分 `initializing`、`ready-empty`、`ready-with-data`、`stale`、`degraded` 和 `blocked`。`initializing` 不渲染空列表、不清除捕获草稿，也不允许高影响 mutation。
- **Store migration：** 插件私有 store migration 在后台能力之前执行。成功后才进入 `ready`；失败保留原 store 和可恢复备份，阻断写入，并显示 migration 版本、稳定错误类别、重试、打开诊断和导出脱敏诊断入口。不得自动改写用户文件、猜测 schema 或把 migration 失败渲染为空数据库。
- **Route/store 加载：** 有上次成功快照时沿用列表、计数、筛选、滚动和 quick capture 草稿并标记 stale；无成功快照时显示专用错误态与重试/诊断，不显示“没有 Todo”。动作失败保留选择、草稿和原列表；未知结果不自动重放，重试用新 commandId 并先读取最新版本。
- **局部降级：** 只要 store 与 Todo routes 可用，创建、编辑、完成、恢复和 Trash 等基础操作继续可用。Project、Calendar、Review、Import/Export 或 Automation route 单独失败时隔离对应页面，并在其入口显示可执行错误；不能让某个附加 route 失败导致基础 Todo 空白或只读。
- **写入错误分类：** UI 和 routes 区分 `validation`、`conflict`、`capability`、`store`、`unknown`，每类返回脱敏摘要、下一步和稳定 identity。冲突要求重新读取并人工决定；capability 缺失不偷偷降级到未声明接口；unknown 只允许查询状态或重新预览。
- **TaskRegistry readiness：** `task:*` handler 未就绪时 CRUD 仍可用。提醒/Automation 控件显示后台尚未就绪，不创建 schedule、不启动私有 timer；插件只执行有限、可取消的 readiness retry。成功后注册 Todo handler、恢复持久 schedule/Run；耗尽后进入 `backend_unavailable`，显示最后探测时间、影响范围和手动重试。
- **重启恢复：** 启动只恢复持久化 schedule、Run/Attempt、cancel intent、handoff 和 import commit 查询。稳定 identity 使一次补偿幂等；不扫描全部到期 Todo、不重复通知、不创建替代 Run、不把 `handed_off` 伪装为 delivered。未知状态保留 needs_action/诊断。
- **通知降级：** 全局 notification event 或宿主 handoff 不可用时，Reminder 保留 `handoff_failed`/`handoff_unknown`，在 Todo/Reminder 视图显示待处理项和重试入口；不能标记 delivered，也不阻断 manual Todo 或其它字段编辑。
- **Session/Agent 降级：** 没有 Agent、Session、权限或 reviewer 能力时，普通 Todo、Review 和导入导出继续可用。agent_execute 显示不可用/needs_action，允许切换 manual 或补齐权限；不自动降级执行、不创建假的 Session、不复制完整 transcript。
- **ResourceIO 降级：** `resource.read`/`stageFile` 不可用时，Todo 核心字段仍可编辑；附件和导出下载显示待处理/失败原因，重试需重新验证 ResourceIO scope。禁止接受任意本机路径或调用未声明的 workspace 写入旁路。
- **全局状态栏与诊断：** 只展示需要用户行动的高价值状态，例如 migration failed、backend unavailable、handoff unknown、Run needs_action、导出失败；避免连续 toast。诊断记录 plugin id、operation、stable identity、时间、错误类别、重试次数和脱敏摘要，不记录标题正文、Session transcript、token、workspace 绝对路径或完整请求体。
- **恢复出口：** 每个异常至少提供“重试当前操作”“重新读取最新状态”“打开诊断”“导出脱敏诊断”中适用的出口。恢复成功后只刷新受影响 projection，保留其它页面筛选、折叠、滚动、选择和草稿；遮罩不能永久锁死页面，窄窗口同样能返回或切换。
- **能力矩阵：** Settings/Diagnostics 显示 store/routes/task/notification/session/agent/resource/import/export 的用户可理解状态、影响范围、最后探测时间和下一步，不要求用户理解内部 capability 名称。状态矩阵是诊断投影，不成为新的系统共享状态。
- **资产：** `<Path>{roots.state}/specdev/changes/2026-08-09-internalize-todolist-plugin/Spec.md</Path>`、`<Path>{roots.state}/specdev/changes/2026-08-09-internalize-todolist-plugin/ADR.md</Path>`、`<Path>{roots.state}/specdev/changes/2026-08-09-internalize-todolist-plugin/ticket/06-deliver-scheduler-readiness-and-reminders.md</Path>`、`<Path>{roots.state}/specdev/changes/2026-08-09-internalize-todolist-plugin/ticket/09-deliver-import-export-review.md</Path>`、`<Path>{roots.state}/specdev/changes/2026-08-09-internalize-todolist-plugin/investigation/comments/INV-03/01-solution.md</Path>`、`<Path>{roots.state}/specdev/changes/2026-08-09-internalize-todolist-plugin/investigation/comments/INV-08/01-solution.md</Path>`
- **后续 Ticket 所依赖的事实：** INV-13 验证各状态在桌面/窄窗口的布局、焦点与返回路径；INV-14 汇总 capability、错误分类、降级与重启恢复验收合同。
- **新浮现的 Tickets：** 无。
- **升级的战争迷雾：** 无。
- **对现有 Tickets 的影响：** update T-01/T-04/T-06/T-08/T-09/T-10、AC-009/012/022～024/027～031/033、INV-13/14。
