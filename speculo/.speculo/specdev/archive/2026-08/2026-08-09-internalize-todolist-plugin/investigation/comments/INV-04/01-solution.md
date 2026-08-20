---
artifact: wayfinder-solution-comment
ticket: INV-04
sequence: 1
resolution: answered
---

# Solution: 设计编辑保存冲突与撤销反馈

- **Ticket：** `<Path>{roots.state}/specdev/changes/2026-08-09-internalize-todolist-plugin/investigation/INV-04.md</Path>`
- **答案：** 列表只直接完成/恢复，其他编辑进入详情。普通字段使用可观察的字段级自动保存，高影响配置使用显式应用；所有 mutation 以 `expectedVersion`、字段基线与 mutation identity 防止静默覆盖，区分已保存、待发送、本地草稿、失败和冲突，并为完成、撤销、外部更新和多窗口编辑提供确定的恢复路径。
- **事实与来源：**
  - **编辑表面：** 列表行只直接完成/恢复；标题、描述、日期、Project、priority、tags 与执行模式在详情编辑。桌面详情为侧边面板，窄窗口为全屏页，沿用 INV-03 的导航历史和返回状态。完成 Todo 不自动关闭详情；若它移出当前投影，关闭详情后返回原位置并解释移出原因。
  - **普通字段自动保存：** 标题、描述连续输入停止 600ms 或 blur 后保存；日期、Project、priority、tags 等离散选择完成后立即保存。详情顶部持续显示“正在保存/已保存/保存失败/本地草稿/存在冲突”，字段级错误同时就地呈现。
  - **字段级 patch：** 每个自动保存 patch 只含变更字段、`expectedVersion`、该字段基线值和唯一 `mutationId`，不发送整份详情快照。同字段请求串行，不同字段可并发。响应只能确认自身 mutation，旧响应不得覆盖新输入。
  - **技术 stale 与真实冲突：** version 前进后先重读；目标字段未变化时只自动重放一次，目标字段已变化时进入人工冲突。再次 stale、超时结果不确定或同字段冲突都停止自动请求，展示服务端当前值与本地值，由用户逐字段选择后重新保存。不同字段可自动合并，并明确列出已合并字段。
  - **外部与多窗口更新：** Agent、另一窗口或后台 mutation 成功后，未触碰字段刷新；正在编辑或有本地草稿的同字段进入冲突，不静默覆盖。多个窗口沿用相同 expectedVersion/field baseline 合同，不采用最后写入获胜。
  - **失败、离线与离开：** 保存失败保留本地值并提供重试，其他已成功字段不回滚。离线或 route 不可达时标为“本地草稿”，不能显示“已保存”；恢复连接后先拉取新版本，再无冲突提交或进入裁决。关闭存在未发送/失败编辑的详情时提供“保留草稿/放弃更改/继续编辑”，正常已保存则直接关闭。
  - **校验：** 空标题、超过 240 Unicode code points、无效日期或其它字段错误不发送该字段 mutation，保留编辑状态并就地报错；独立的有效字段仍可保存。日期 DST gap/overlap 等进一步规则由 INV-06/T-04 提供，编辑反馈服从同一不发送无效 patch 的原则。
  - **高影响 command：** 执行模式、提醒、周期规则与 Project 删除等影响范围较大的变化使用显式“应用”。插件私有领域字段和本地 outbox/intent 在一个事务中记录，再协调 TaskRegistry/Session 等宿主副作用；宿主调用无法与插件数据库形成跨系统原子事务，若外部副作用已经发生或结果不确定，只能进入持久、可诊断、幂等的前向恢复状态，不能宣称完全回滚。
  - **完成/恢复：** 点击完成或恢复前等待已发送保存请求收敛；仍有无效、失败或离线草稿时，状态 mutation 可以继续，但必须明确提示草稿未保存并继续保留。状态行乐观更新，服务端失败恢复原状态并解释原因，Automation 取消等正交副作用不得被状态 UI 伪装为同步成功。
  - **撤销：** 完成/恢复及允许撤销的单次 mutation 提供短暂撤销。撤销只反转该 `mutationId` 对应变化并检查当前 version；存在后续变化时拒绝撤销并提示。创建撤销仍按 INV-02 软删除进入 Trash，不覆盖当前捕获草稿。
  - **最小冲突数据：** 冲突与撤销记录只保留必要字段值、version、mutation identity、时间和脱敏诊断；不复制整份详情、完整 Agent 对话、绝对路径或 secret。
- **资产：** `<Path>{roots.state}/specdev/changes/2026-08-09-internalize-todolist-plugin/spec.md</Path>`、`<Path>{roots.state}/specdev/changes/2026-08-09-internalize-todolist-plugin/CONTEXT.md</Path>`、`<Path>{roots.state}/specdev/changes/2026-08-09-internalize-todolist-plugin/ticket/01-establish-builtin-persistent-crud.md</Path>`、`<Path>{roots.state}/specdev/changes/2026-08-09-internalize-todolist-plugin/ticket/02-deliver-safe-deletion-lifecycle.md</Path>`
- **后续 Ticket 所依赖的事实：** INV-05 的筛选和批量 mutation 必须复用 version/command/撤销边界，不得覆盖本地详情草稿；INV-06/07/08 的提醒、周期和 Automation 配置使用显式应用与 outbox/前向恢复；INV-09 需协调删除与未保存草稿、运行中副作用；INV-12/13 需验证状态反馈、冲突比较、离线/多窗口与焦点；INV-14 需把这些合同路由到 T-01/T-02/T-04/T-05/T-06/T-07/T-08 的实现和验收。
- **新浮现的 Tickets：** 无。
- **升级的战争迷雾：** 无。
- **对现有 Tickets 的影响：** update T-01/T-02/T-04/T-05/T-06/T-07/T-08/T-10、AC-004/AC-013/AC-016/AC-029/AC-031、INV-05/06/07/08/09/12/13/14。
