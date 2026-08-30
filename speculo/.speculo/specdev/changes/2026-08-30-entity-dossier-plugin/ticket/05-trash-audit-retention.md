---
schema_version: 3
artifact: ticket
change: 2026-08-30-entity-dossier-plugin
id: T-05
title: 交付回收站、恢复与审计保留
status: done
planning_depth: deep
planning_depth_reason: 删除恢复、审计保留和内容脱敏直接影响用户数据可恢复性与隐私。
ready: true
risk: high
blocked_by: [T-02, T-03]
contract_ids: [AC-009, AC-024, AC-025, AC-030, AC-031]
owner: root
expected_changes: ["<Path>plugins/dossiers/src/application/lifecycle/**</Path>", "<Path>plugins/dossiers/src/interfaces/routes/lifecycle/**</Path>", "<Path>plugins/dossiers/tools/lifecycle-*.ts</Path>", "<Path>plugins/dossiers/tests/lifecycle/**</Path>", "<Path>plugins/dossiers/routes/catalog.ts</Path>", "<Path>plugins/dossiers/tools/catalog-contact.ts</Path>"]
writable_paths: ["<Path>plugins/dossiers/src/application/lifecycle/**</Path>", "<Path>plugins/dossiers/src/interfaces/routes/lifecycle/**</Path>", "<Path>plugins/dossiers/tools/lifecycle-*.ts</Path>", "<Path>plugins/dossiers/tests/lifecycle/**</Path>", "<Path>plugins/dossiers/routes/catalog.ts</Path>", "<Path>plugins/dossiers/tools/catalog-contact.ts</Path>"]
read_only_paths: ["<Path>plugins/dossiers/src/domain/**</Path>", "<Path>plugins/dossiers/src/application/catalog/**</Path>", "<Path>plugins/dossiers/src/application/documents/**</Path>", "<Path>packages/plugin-runtime/**</Path>"]
shared_paths: ["<Path>plugins/dossiers/src/domain/**</Path>", "<Path>plugins/dossiers/src/infrastructure/workspace/**</Path>", "<Path>plugins/dossiers/src/runtime.ts</Path>"]
shared_path_owners: ["<Path>plugins/dossiers/src/domain/**</Path> => T-01", "<Path>plugins/dossiers/src/infrastructure/workspace/**</Path> => T-01", "<Path>plugins/dossiers/src/runtime.ts</Path> => T-01"]
---

# Ticket T-05: 交付回收站、恢复与审计保留

- **Ticket 文件：** `<Path>{roots.state}/specdev/changes/2026-08-30-entity-dossier-plugin/ticket/05-trash-audit-retention.md</Path>`
- **总体 Map：** `<Path>{roots.state}/specdev/changes/2026-08-30-entity-dossier-plugin/tickets-map.md</Path>`
- **上游 Spec：** `<Path>{roots.state}/specdev/changes/2026-08-30-entity-dossier-plugin/spec.md</Path>`
- **完成 Evidence：** `<Path>{roots.state}/specdev/changes/2026-08-30-entity-dossier-plugin/evidence/T-05.md</Path>`

## 1. 战略与来源

- **目标：** 让档案及资料删除在 30 天内可恢复，并以分级期限保留不含正文的审计记录。
- **可观察产出：** 删除进入工作区回收站；恢复保持标识与资料；到期清理可预测；普通活动与永久事件按期限查询。
- **来源：** US-003、US-008；AC-009、AC-024、AC-025、AC-030、AC-031；ADR-007、ADR-008。
- **当前事实：** 权威资料都位于工作区 `Dossiers/`；插件私有存储不能承担恢复依据。
- **Planning Depth 原因：** 生命周期错误可能永久丢失资料，审计错误可能泄露正文或削弱追溯。

## 2. 决策状态

### 已锁定决策

- 软删除进入 `Dossiers/.trash/`，默认保留 30 天；恢复是显式操作。
- 普通活动保留 1 年；迁移、永久删除、恢复和安全事件永久保留。
- 审计仅记 actor/action/time/target/result/reason/version 等元数据，不记正文或敏感字段值。
- 永久删除必须经 reviewer-bound 确认，且不得由后台自动执行。

### 已采用的低影响假设

- 清理在用户打开插件或显式维护动作时惰性执行，不引入后台调度器。

### 未决问题

无。

## 3. 范围边界

| IN | REUSE | OUT |
|---|---|---|
| 删除/恢复/到期清理、审计写入查询、保留策略 | T-01 原子操作、T-02/T-03 标识与清单 | 云备份、系统级回收站、正文日志、后台 scheduler |

## 4. 要构建什么

建立生命周期 facade 和 route/tool adapters。删除以同一工作区内的原子移动保存 dossier id、原路径和删除时间；恢复前检查目标冲突并给出稳定结果。审计采用 append-only 事件文件或等价权威格式，查询按分级期限过滤；永久删除只处理已到期且确认过的目标。

## 5. 实现契约

- **入口或接缝：** lifecycle application service、Page routes、受控 lifecycle tools。
- **输入与输出：** dossier/resource id、expected version、reason、confirmation；输出 trash record、restore result、audit summary。
- **公共接口变化：** 新增删除、恢复、列回收站、永久清理与审计查询能力。
- **不变量：** 30 天内可恢复；恢复不静默覆盖；永久删除不可伪装成普通删除；日志无正文。
- **状态或数据流：** active -> trash record -> restore 或 confirmed purge；每步追加审计。
- **错误与失败行为：** stale version、目标冲突、非法路径、缺失确认均 fail closed，并保持原状态。
- **兼容要求：** 未知 audit event/version 可跳过读取但不能被重写丢失。
- **安全与隐私要求：** 审计拒绝文档正文、完整属性值、绝对外部路径和模型输入。

## 6. 执行路线

1. 定义 trash/audit schema、保留策略时钟和测试夹具。
2. 实现单资料与整档案软删除、冲突安全恢复。
3. 实现审计 append/query 与字段脱敏守卫。
4. 实现惰性过期识别及 reviewer-bound 永久清理。
5. 覆盖中断恢复、重复调用、到期边界和日志扫描。

## 7. 路径访问契约

- **可写范围：** lifecycle application/routes/tools/tests；并由 T-05 接管既有 catalog contact 删除 route/tool 的薄委托分支，使其执行 Trash 引用预检。
- **只读/共享：** T-01 foundation、T-02/T-03 services；共享 owner T-01。
- **保留或不动：** 系统回收站、后台服务、其他插件和产品核心。
- **执行期偏差闭合：** 原 T-02 联系人删除只扫描 active dossiers；档案进入 Trash 后会漏掉仍可恢复的联系人关系。T-05 因 AC-009 扩展两个精确 adapter 路径，委托 lifecycle facade；不修改 T-02 domain/schema，其余 catalog 行为保持只读。

## 8. 验证矩阵

| 行为或风险 | 接缝 | 步骤 | 预期 | Evidence |
|---|---|---|---|---|
| 删除与恢复 | lifecycle facade | 删除档案/资料后恢复 | 30 天窗口内内容、标识和分类恢复 | `<Path>{roots.state}/specdev/changes/2026-08-30-entity-dossier-plugin/evidence/T-05.md</Path>` |
| 冲突与永久删除 | confirmation route | 制造目标冲突、无确认清理 | fail closed，无静默覆盖/丢失 | 同上 |
| 审计与保留 | fake clock + log scan | 跨 30 天/1 年边界查询 | 期限正确，永久事件保留且无正文 | 同上 |

- **Workspace checks：** lifecycle tests、schema/type checks、敏感字段日志扫描。
- **E2E disposition：** required：删除、重启、恢复和确认清理跨越真实工作区 route 边界。
- **E2E owner/environment：** Lead / T-11 集成环境。
- **Integration evidence：** commit、candidate/direct-parent、result SHA、Lead Evidence。

## 9. 发布、迁移与恢复

- **迁移顺序：** 先能读当前 schema，再启用清理；旧事件只读保留。
- **兼容窗口：** audit/trash record 带 schema version。
- **监控信号：** action、target id、result、retention class、拒绝原因，不含正文。
- **回滚或前向恢复：** 软删除通过 restore；清理前生成确认记录并重验期限。
- **不可逆操作与批准点：** 永久清理必须显式 reviewer-bound。
- **收缩条件：** 时间源或 schema 异常时禁用 purge，仅允许读取与恢复。

## 10. 验收标准

- [ ] AC-009、AC-024、AC-025、AC-030、AC-031 的正常/失败/回归证据通过。
- [ ] required 生命周期 E2E 由 Lead 完成。
- [ ] 无静默覆盖、无后台永久清理、无正文审计。
- [ ] commit、路径、Evidence 和偏差门满足。
