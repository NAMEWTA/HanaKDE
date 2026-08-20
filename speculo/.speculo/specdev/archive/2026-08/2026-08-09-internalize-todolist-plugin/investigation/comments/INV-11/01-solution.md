---
artifact: wayfinder-solution-comment
ticket: INV-11
sequence: 1
resolution: answered
---

# Solution: 闭环导入导出备份与冲突预演

- **Ticket：** `<Path>{roots.state}/specdev/changes/2026-08-09-internalize-todolist-plugin/investigation/INV-11.md</Path>`
- **答案：** Todo 交换采用严格、版本化、插件私有的 JSON schema v1。导入必须先完成零写 preview，确认后以版本化事务提交；导出基于一致快照并主动下载。未知格式、旧 SQLite、冲突、过期预览和敏感字段均 fail closed，不把“已接受”或“已生成文件”误报为后台交付。
- **交换格式与来源：** 首版只接受明确声明的 `exchange schema v1` JSON，schema 与插件内部 store schema 分离；未来版本必须新增显式 migration。JSON 以外、未知版本、旧 SQLite 和任意二进制在 preview 阶段稳定拒绝且不写入。没有真实 0.0.5 脱敏样本前，只提供规范 fixture 与 SQLite 拒绝测试，不宣称旧数据库兼容。
- **文件交付：** 导入使用受限上传/资源选择读取 bounded JSON，限制字节数、嵌套深度、数组长度和字段总量，解析器拒绝 prototype/path 注入。导出与 Review/Automation 报告仅在用户主动点击后生成 staged file/下载元数据；不写工作区、不申请 `resource.write`，生成失败不改变 Todo store。
- **Preview 零写：** strict parse、字段校验、敏感字段扫描、引用完整性、Project/series/occurrence/resource 映射、重复和冲突计算全部发生在 preview。preview 不创建 Todo、Project、occurrence、Run、schedule、Session、Trash 或审计写入；只保存有界 preview identity、source digest、目标 store version、诊断和计数。
- **默认策略：** 首版只支持追加导入，不支持全量覆盖、删除目标、隐式合并或通过普通导入复活 Trash。用户在预览中明确确认后才提交；导入的 Trash 保持 Trash，关联 schedule/Run/Session 不重启，恢复/覆盖必须走独立恢复或编辑命令。
- **重复与冲突：** 稳定实体 ID、occurrence identity 和 series/rule identity 优先判定重复。`same-id-same-content` 可幂等跳过；`same-id-different-content` 阻断。缺失 Project/series/resource ref、unsupported field 和不合法时间是阻断诊断；无稳定 ID 的来源记录按规范化字段 fingerprint 标记 potential duplicate，由用户逐项选择跳过或以新 ID 追加，不自动猜测合并。
- **字段与权限：** Preview 逐字段展示来源值、当前值、映射和最终动作；owner、plugin、session、权限或执行授权字段不从文件恢复，任意绝对路径和系统内部路径拒绝。ResourceRef 只保留规范引用并验证 ResourceIO 边界，不扩大 workspace scope。导入后的 trigger/reminder/agent 配置默认为 disabled 或 pending review，导入本身不向 TaskRegistry、EventBus 或 Session 发起后台执行。
- **原子提交：** commit 绑定 `previewId + sourceDigest + targetStoreVersion + commandId`。目标 store 版本、引用、权限或确认令牌任一变化，整次零写并返回 `preview_stale`/稳定冲突诊断和新预览入口；不允许部分成功。写入 Todo、Project、series、Trash、history 和脱敏 import audit 使用同一插件事务边界。
- **幂等与中断：** 同一 `commandId` 重复提交返回首次结果，不重复插入。网络中断后可按 preview/command 查询 `committed/failed/unknown`；`unknown` 不自动重放，用户重新 preview 后再决定。失败完整回滚并保留源；成功记录 created/skipped/conflicted、实体计数、引用重连、Trash 数量、被禁用副作用数和 auditId。
- **一致导出：** 导出从固定 `storeVersion` 快照序列化，生成期间的新 mutation 不混入，元数据带快照时间、schema version 和计数。默认包含活动 Todo、完成历史、Project、series/rule version、必要 Trash 元数据、Reminder/Handoff 状态、AutomationRun 最小摘要与审计；Trash 需在预览中显式勾选并显示额外计数。已 purge 内容不导出。
- **隐私边界：** JSON、Markdown Review/Automation 报告和导入核对均排除 Session transcript/messages、token/secret、workspace 绝对路径、系统内部路径、完整 Agent 诊断和宿主私有对象；只保留 `sessionRef`、规范 ResourceRef、最小结果和脱敏错误类别。import/export audit 只记录稳定 ID、schema、计数、时间、操作者和结果哈希；不记录标题正文或完整来源文件。
- **导入后核对与恢复：** 提交后提供只读核对页和可下载摘要，明确区分 created/skipped/conflicted、引用重连、Trash、disabled side effects 与审计结果；核对成功不代表通知送达或 Agent 成功。已成功导入不自动反向删除，纠错使用 Todo/Trash 的显式版本化操作。
- **资产：** `<Path>{roots.state}/specdev/changes/2026-08-09-internalize-todolist-plugin/ticket/09-deliver-import-export-review.md</Path>`、`<Path>{roots.state}/specdev/changes/2026-08-09-internalize-todolist-plugin/Spec.md</Path>`、`<Path>{roots.state}/specdev/changes/2026-08-09-internalize-todolist-plugin/ADR.md</Path>`、`<Path>{roots.state}/specdev/changes/2026-08-09-internalize-todolist-plugin/investigation/comments/INV-09/01-solution.md</Path>`
- **后续 Ticket 所依赖的事实：** INV-12 验证导入失败、capability 缺失和重启恢复时的降级；INV-13 验证 preview/commit/下载在桌面与窄窗口的可操作性和隐私提示；INV-14 汇总 AC-022/027～031 及 exchange schema/审计合同。
- **新浮现的 Tickets：** 无；真实 0.0.5 迁移样本仍是未来独立输入，不在无证据时扩大兼容承诺。
- **升级的战争迷雾：** 无。
- **对现有 Tickets 的影响：** update T-09/T-10、AC-022/027～031、INV-12/13/14。
