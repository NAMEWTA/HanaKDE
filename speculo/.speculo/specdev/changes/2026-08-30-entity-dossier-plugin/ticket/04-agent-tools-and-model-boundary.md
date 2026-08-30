---
schema_version: 3
artifact: ticket
change: 2026-08-30-entity-dossier-plugin
id: T-04
title: 交付 Agent 工具与按引用模型边界
status: done
planning_depth: deep
planning_depth_reason: Agent 工作区写入、全局模型访问、相对资料引用和确认门属于公共工具与隐私安全合同。
ready: true
risk: high
blocked_by: [T-02, T-03]
contract_ids: [AC-018, AC-019, AC-020, AC-021, AC-022, AC-023, AC-031]
owner: root
expected_changes: ["<Path>plugins/dossiers/src/application/agent/**</Path>", "<Path>plugins/dossiers/src/interfaces/agent/**</Path>", "<Path>plugins/dossiers/tools/agent-*.ts</Path>", "<Path>plugins/dossiers/tests/agent/**</Path>"]
writable_paths: ["<Path>plugins/dossiers/src/application/agent/**</Path>", "<Path>plugins/dossiers/src/interfaces/agent/**</Path>", "<Path>plugins/dossiers/tools/agent-*.ts</Path>", "<Path>plugins/dossiers/tests/agent/**</Path>"]
read_only_paths: ["<Path>plugins/dossiers/src/domain/**</Path>", "<Path>plugins/dossiers/src/application/catalog/**</Path>", "<Path>plugins/dossiers/src/application/documents/**</Path>", "<Path>packages/plugin-runtime/**</Path>", "<Path>PLUGIN_SDK.md</Path>"]
shared_paths: ["<Path>plugins/dossiers/src/domain/**</Path>", "<Path>plugins/dossiers/src/infrastructure/workspace/**</Path>", "<Path>plugins/dossiers/src/runtime.ts</Path>"]
shared_path_owners: ["<Path>plugins/dossiers/src/domain/**</Path> => T-01", "<Path>plugins/dossiers/src/infrastructure/workspace/**</Path> => T-01", "<Path>plugins/dossiers/src/runtime.ts</Path> => T-01"]
---

# Ticket T-04: 交付 Agent 工具与按引用模型边界

- **Ticket 文件：** `<Path>{roots.state}/specdev/changes/2026-08-30-entity-dossier-plugin/ticket/04-agent-tools-and-model-boundary.md</Path>`
- **总体 Map：** `<Path>{roots.state}/specdev/changes/2026-08-30-entity-dossier-plugin/tickets-map.md</Path>`
- **上游 Spec：** `<Path>{roots.state}/specdev/changes/2026-08-30-entity-dossier-plugin/spec.md</Path>`
- **完成 Evidence：** `<Path>{roots.state}/specdev/changes/2026-08-30-entity-dossier-plugin/evidence/T-04.md</Path>`

## 1. 战略与来源

- **目标：** 让 Agent 可查询和有界修改档案，同时保证首次上下文只含相对引用、模型访问可关闭、高风险写入需确认且没有后台自动调用。
- **可观察产出：** Agent tool catalog 可执行元数据 CRUD/上下文/建议确认；关闭模型访问后内容入口 fail closed；观测不到未请求模型调用或完整正文返回。
- **来源：** US-006、US-007；AC-018–AC-023、AC-031；ADR-005、ADR-008。
- **当前事实：** Hana 静态 tools 支持 sessionPermission 和 ResourceRef；既有 Agent/Office 工具可按需读取，插件无需调用模型 API。
- **Planning Depth 原因：** 工具是公共 Agent 接口并能写用户工作区，隐私误差会外发内容或执行破坏性动作。

## 2. 决策状态

### 已锁定决策

- 只返回 dossier.json/目录/ResourceRef 和元数据，不返回完整正文或绝对路径。
- 全局模型访问默认开、可关；开关不触发后台扫描。
- 建议先 proposed，确认后 accepted；批量、删除、覆盖 reviewer-bound。
- 插件不声明/调用 model.sample 或 network；Agent 自己使用现有受控读取工具。

### 已采用的低影响假设

- 精确 tool 短名按 list/get/create/update/context/accept-suggestion 等清晰动作组织，最终前缀由 plugin id 自动形成。

### 未决问题

无。

## 3. 范围边界

| IN | REUSE | OUT |
|---|---|---|
| Agent DTO/tools、权限描述、相对上下文、建议状态、模型开关、调用观测测试 | T-02/T-03 services、runtime tool/sessionPermission、现有资源/Office tools | 插件侧模型调用、正文解析、后台任务、UI |

## 4. 要构建什么

Agent 能列出/读取档案元数据并获得相对 AI 资料入口，随后按任务自行选择资源读取工具。普通单档案写入带 expected version；智能分类/属性/联系人只保存 proposed suggestion，确认工具才改变权威事实。模型访问关闭时不提供内容读取入口，但普通元数据仍可查询。

## 5. 实现契约

- **入口或接缝：** 静态 tools 与 application agent facade。
- **输入与输出：** JSON-safe ids/patch/expectedVersion/session principal；输出元数据、相对 ResourceRef、建议/确认结果。
- **公共接口变化：** 新增 `dossiers_*` Agent 工具及 sessionPermission 元数据。
- **不变量：** 未读文件不返回；关闭时 fail closed；未确认建议不写权威；所有写入有 actor/source/version。
- **状态或数据流：** query/context -> optional existing tool reads -> proposed suggestion -> explicit acceptance -> audit intent。
- **错误与失败行为：** 无 session/principal、关闭、stale version、越界 ref 和未确认高风险动作均拒绝。
- **兼容要求：** sessionId/sessionRef 优先，不以 sessionPath 为身份。
- **安全与隐私要求：** 无正文/敏感值/模型完整输入日志；side effect 精确可审查。

## 6. 执行路线

1. 建立 tool schema、payload snapshot 和负向模型调用 spy。
2. 实现只读 list/get/context 与模型开关门。
3. 实现 create/update/add refs 的有界写工具和 expected version。
4. 实现 proposed/accept/reject suggestion 与确认门。
5. 为批量/删除/覆盖声明 reviewer-bound side effect 并拒绝无确认路径。
6. 运行工具、权限、日志脱敏和“零后台模型调用”测试。

## 7. 路径访问契约

- **可写范围：** agent application/interfaces/tools/tests。
- **只读/共享：** T-01 foundation、T-02/T-03 services、SDK；共享 owner T-01。
- **保留或不动：** model/provider/system code、UI、其他插件。

## 8. 验证矩阵

| 行为或风险 | 接缝 | 步骤 | 预期 | Evidence |
|---|---|---|---|---|
| 元数据与相对入口 | tool invocation | list/get/context | 无全文/绝对路径，refs 可定位 | `<Path>{roots.state}/specdev/changes/2026-08-30-entity-dossier-plugin/evidence/T-04.md</Path>` |
| 关闭/确认/越界 | permission fixtures | toggle off、未确认、stale、bad ref | fail closed，权威不变 | 同上 |
| 回归/隐私 | request spy + log scan | Page/load/import idle、tool calls | 零插件模型调用，无敏感日志 | 同上 |

- **Workspace checks：** agent tests、tool schema/type checks、日志扫描。
- **E2E disposition：** required：真实 Agent tool discovery/invocation、模型开关和 relative ref 是跨 host 边界行为。
- **E2E owner/environment：** Lead / T-11 集成环境。
- **Integration evidence：** commit、candidate/direct-parent、result SHA、Lead Evidence。

## 9. 发布、迁移与恢复

- **迁移顺序：** 不适用：消费当前 schema。
- **兼容窗口：** tool 输入 schema versioned；未知 action 拒绝。
- **监控信号：** tool action、actor、decision、resource refs count、拒绝原因，不含正文。
- **回滚或前向恢复：** 未接受建议可丢弃；接受写入使用 T-01 operation recovery。
- **不可逆操作与批准点：** 批量、删除、覆盖、建议接受必须确认。
- **收缩条件：** 不适用。

## 10. 验收标准

- [ ] AC-018–AC-023、AC-031 对应工具/观测证据通过。
- [ ] required Agent E2E 由 Lead 完成。
- [ ] 没有插件侧模型调用、正文返回或越界写入。
- [ ] commit、路径、Evidence 和偏差门满足。
