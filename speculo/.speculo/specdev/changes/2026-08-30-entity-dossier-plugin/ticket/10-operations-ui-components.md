---
schema_version: 3
artifact: ticket
change: 2026-08-30-entity-dossier-plugin
id: T-10
title: 交付资料、联系人和维护操作 UI
status: done
planning_depth: standard
planning_depth_reason: 多个已确定服务需形成一致的确认、进度和恢复交互，但组件本身不拥有文件或迁移逻辑。
ready: true
risk: medium
blocked_by: [T-03, T-04, T-05, T-06, T-08]
contract_ids: [AC-010, AC-013, AC-020, AC-021, AC-024, AC-025, AC-026, AC-027]
owner: root
expected_changes: ["<Path>plugins/dossiers/src/ui/operations/**</Path>", "<Path>plugins/dossiers/tests/ui/operations/**</Path>"]
writable_paths: ["<Path>plugins/dossiers/src/ui/operations/**</Path>", "<Path>plugins/dossiers/tests/ui/operations/**</Path>"]
read_only_paths: ["<Path>plugins/dossiers/src/domain/**</Path>", "<Path>plugins/dossiers/src/application/documents/**</Path>", "<Path>plugins/dossiers/src/application/agent/**</Path>", "<Path>plugins/dossiers/src/application/lifecycle/**</Path>", "<Path>plugins/dossiers/src/application/exchange/**</Path>", "<Path>plugins/dossiers/src/application/migration/**</Path>"]
shared_paths: ["<Path>plugins/dossiers/src/domain/**</Path>", "<Path>plugins/dossiers/src/runtime.ts</Path>"]
shared_path_owners: ["<Path>plugins/dossiers/src/domain/**</Path> => T-01", "<Path>plugins/dossiers/src/runtime.ts</Path> => T-01"]
---

# Ticket T-10: 交付资料、联系人和维护操作 UI

- **Ticket 文件：** `<Path>{roots.state}/specdev/changes/2026-08-30-entity-dossier-plugin/ticket/10-operations-ui-components.md</Path>`
- **总体 Map：** `<Path>{roots.state}/specdev/changes/2026-08-30-entity-dossier-plugin/tickets-map.md</Path>`
- **上游 Spec：** `<Path>{roots.state}/specdev/changes/2026-08-30-entity-dossier-plugin/spec.md</Path>`
- **完成 Evidence：** `<Path>{roots.state}/specdev/changes/2026-08-30-entity-dossier-plugin/evidence/T-10.md</Path>`

## 1. 战略与来源

- **目标：** 将资料加入/分类、联系人选择、模型开关、回收站、导入导出和迁移恢复形成可审查操作组件。
- **可观察产出：** 用户能看到复制预检与进度、管理联系人引用、确认高风险动作，并从失败状态恢复。
- **来源：** US-003、US-005、US-007、US-008、US-009；AC-010、AC-013、AC-020、AC-021、AC-024–AC-027。
- **当前事实：** 所有业务与主机边界由 T-03/T-04/T-05/T-06/T-08 提供；本 Ticket 只产生 intents。
- **Planning Depth 原因：** 标准 UI 切片，但需系统覆盖确认门、长操作和恢复状态。

## 2. 决策状态

### 已锁定决策

- 外部/内部来源都显示“复制进档案”结果，不用模糊的链接术语。
- 批量、删除、永久清理、导入提交、迁移和建议接受必须展示范围并确认。
- 模型访问是全局开关；关闭后内容入口明确不可用，但元数据操作仍可用。
- 文件/导出产物只通过受控 ResourceRef 交给 host。

### 已采用的低影响假设

- 维护操作集中在档案详情的操作面板与独立维护视图，避免多层嵌套卡片。

### 未决问题

无。

## 3. 范围边界

| IN | REUSE | OUT |
|---|---|---|
| 资料列表/加入、联系人选择、确认 dialog、进度/恢复、回收站、交换/迁移 UI | 已有 application DTO/client、UI tokens/icons | 文件复制、ZIP、迁移、模型调用、Page/host wiring |

## 4. 要构建什么

实现 operations feature components。用户从档案详情加入文件并查看目标分类、哈希重复或稳定改名结果，关联已有/新联系人，切换模型访问；维护视图展示回收站、ZIP 导入导出、迁移预检与恢复。所有破坏性或跨多项操作先展示精确范围，确认后才发 intent。

## 5. 实现契约

- **入口或接缝：** `DossierOperations`、`MaintenanceView` 及 typed client props。
- **输入与输出：** dossier/document/contact/lifecycle/exchange/migration DTO；输出明确 command intents 和 confirmations。
- **公共接口变化：** 新增 operations UI exports，不新增业务 route。
- **不变量：** 不直接碰文件系统；无确认不发高风险 command；关闭模型不隐藏元数据能力。
- **状态或数据流：** preview -> confirm -> progress -> success/recoverable error -> refresh。
- **错误与失败行为：** 用户取消无副作用；中断保留可恢复状态；冲突展示后选择安全结果，不默认为覆盖。
- **兼容要求：** 未知 operation/status 以只读诊断呈现并禁用提交。
- **安全与隐私要求：** 不把绝对路径、正文或敏感属性写入 DOM 日志和错误详情。

## 6. 执行路线

1. 建立 operations typed client 和 preview/confirmation 状态机 fixtures。
2. 实现资料、联系人和模型开关组件。
3. 实现回收站、交换、迁移与恢复组件。
4. 覆盖取消、冲突、中断、future-version、窄屏和键盘交互。

## 7. 路径访问契约

- **预计修改点：** operations UI 与对应 tests。
- **可写范围：** `plugins/dossiers/src/ui/operations/**` 和 tests；越界前停止。
- **只读上下文：** 上游 application contracts。
- **共享路径：** domain/runtime 只读，唯一 owner T-01。
- **保留或不动：** Page shell、catalog UI、manifest、业务服务和产品 UI。

## 8. 验证矩阵

| 行为或风险 | 接缝 | 步骤 | 预期 | Evidence |
|---|---|---|---|---|
| 资料与联系人 | component harness | 加入、重复、分类、选择联系人 | 预检和结果清晰，intent 参数正确 | `<Path>{roots.state}/specdev/changes/2026-08-30-entity-dossier-plugin/evidence/T-10.md</Path>` |
| 高风险失败路径 | client fixture | 取消/冲突/中断/未来版本 | 不提交或进入可恢复状态 | 同上 |
| 响应式回归 | browser component test | 桌面/窄屏维护操作 | 无重叠，确认范围可读，键盘可达 | 同上 |

- **Workspace checks：** component tests、type/lint、a11y、viewport screenshots、敏感信息 DOM scan。
- **E2E disposition：** not-required：本 Ticket 仅交付注入 client 的操作组件，不直接跨 host 边界；真实 picker/ResourceRef/restart 由 T-11 承接。
- **E2E owner/environment：** Lead / current-workspace；T-11 在真实 Hana 主机执行集成 E2E。
- **Integration evidence：** implementation/source commit、parent before、candidate/result SHA。

## 9. 发布、迁移与恢复

- **迁移顺序：** 不适用：仅消费 T-08 状态，不写 schema。
- **兼容窗口：** 未知状态 fail closed。
- **监控信号：** 不适用：组件不直接写审计或遥测。
- **回滚或前向恢复：** 回退组件 commit 不改变权威数据；恢复动作由 service 执行。
- **不可逆操作与批准点：** UI 必须对永久删除、导入提交、迁移和批量动作收集确认。
- **收缩条件：** 不适用：新增组件。

## 10. 验收标准

- [x] AC-010、AC-013、AC-020、AC-021、AC-024–AC-027 的组件证据通过。
- [x] 取消、失败、恢复、窄屏和键盘路径已记录。
- [x] 未越过 writable paths，未直接访问 host/文件系统。
- [x] required 集成 E2E 由 T-11 承接。
