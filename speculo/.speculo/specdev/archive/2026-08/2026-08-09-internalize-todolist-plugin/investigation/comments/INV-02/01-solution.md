---
artifact: wayfinder-solution-comment
ticket: INV-02
sequence: 1
resolution: answered
---

# Solution: 锁定三秒捕获与上下文继承

- **Ticket：** `<Path>{roots.state}/specdev/changes/2026-08-09-internalize-todolist-plugin/investigation/INV-02.md</Path>`
- **答案：** 首版快速捕获是一次只创建一项 Todo 的 TypeScript UI/route 流程。单行输入中 `Enter` 提交并保持焦点，输入法 composition 期间的 Enter 只确认候选；不提供展开详情或详情提交快捷键。创建成功不自动打开详情，允许连续录入；所有继承与手动字段在提交前可见，不做自然语言识别，也不允许批量创建。
- **事实与来源：**
  - **单项提交：** 每次提交只包含一个标题和一组显式字段，禁止多行批量预览、批量捕获 API 和“每行一项”行为。粘贴含换行的文本时阻止此次粘贴并提示逐项添加，不静默截断、拼接或部分创建。此决定只约束创建；INV-05 仍可独立讨论对既有 Todo 的批量完成、移动、打标或删除。
  - **输入与快捷操作：** 标题使用单行控件；非 composition 状态的 `Enter` 创建，页面同时提供可点击的创建按钮。首版不提供 `Shift+Enter`、`Cmd/Ctrl+Enter` 等展开或提交快捷键。`Esc` 先关闭更多字段面板；面板已关闭且有内容时清空；内容为空时退出焦点。点击输入器外部只保存草稿，不自动提交。
  - **上下文继承：** Global 默认无 Project 且投影为 Inbox；Today 显式显示并继承 `plannedFor=today`；具体 Project 和具体日期页分别显示并继承当前 Project/日期。继承值必须是可移除 chip，移除后不写入。用户手动选择优先于页面继承；恢复草稿时若 Project 已删除，移除失效 chip、保留其它内容并明确提示，不静默改绑。
  - **无自然语言识别：** 输入文本在 trim 首尾空白后原样作为标题；首版不解析日期、Project、tag、提醒或执行模式，不产生 suggestion、解析预览或 `parse_rejected`。这些字段只能通过显式控件或可见继承 chip 设置。自然语言识别仅作为后续优化候选，不进入本 change 的实现或验收合同。
  - **字段层级：** 快速捕获的更多字段包含 description、Project、plannedFor、deadline、priority 与 tags。reminder、recurrence、Agent automation 和 ResourceRef 附件只在创建后的详情编辑中配置，避免捕获阶段触发复杂副作用。创建后不自动打开详情。
  - **连续录入与幂等：** 提交后立即渲染独立 pending 行，清空标题并保持输入焦点；当前页面的继承 chip 保留，手动字段清空。连续请求按提交顺序展示，每项使用唯一 `captureRequestId` 做服务端幂等；前项失败不阻塞后项，也不因重试重复创建。
  - **失败与恢复：** 创建失败不使用阻断式模态框；pending 行转为失败状态并提供“重试”和“恢复到输入框”，原始标题和显式字段完整保留。创建成功提供短暂的“撤销创建”，通过软删除进入 Trash，且不覆盖当前新草稿。
  - **草稿：** Global、Today、具体 Project 与具体日期上下文分别持有一份插件本地草稿；切换视图不迁移或丢弃，返回原上下文时显示“已恢复草稿”。成功创建、明确清空或撤销恢复到输入框后的对应状态会确定性更新草稿。
  - **标题与重复：** 标题 trim 首尾空白，保留内部空格、标点、大小写与原语言字符；空标题禁用提交，最多 240 个 Unicode code points，超限明确报错且不截断。相似检查仅限同一 Project/Inbox 中标准化标题完全相同的未完成 Todo；仍允许创建，只给非阻塞提示和“查看相似项”，不做模糊匹配。
- **资产：** `<Path>{roots.state}/specdev/changes/2026-08-09-internalize-todolist-plugin/spec.md</Path>`、`<Path>{roots.state}/specdev/changes/2026-08-09-internalize-todolist-plugin/ticket/03-deliver-capture-and-organization.md</Path>`、`<Path>temp/HanaKDE-TodoList-0.0.5-workbench-source-audited-final/src/application/todo-service.ts</Path>`
- **后续 Ticket 所依赖的事实：** INV-03 需为各上下文提供稳定且可解释的 capture scope；INV-04 需承接创建后详情编辑、撤销与失败恢复；INV-05 不得新增批量创建，但可讨论既有项批量操作；INV-12/INV-13 需覆盖草稿恢复、IME、窄布局、焦点、pending/failed 行和 240 字符边界；INV-14 需从 Spec、T-03 与 Goal Plan 删除自然语言 parser/suggestion/parse_rejected 合同并加入单项捕获、幂等和草稿验收。
- **新浮现的 Tickets：** 无。
- **升级的战争迷雾：** 无。
- **对现有 Tickets 的影响：** update T-01/T-03、AC-006、INV-03/04/05/12/13/14；自然语言识别降为当前 change 范围外的未来优化。
