---
schema_version: 3
artifact: ticket
change: 2026-08-30-entity-dossier-plugin
id: T-02
title: 交付档案类型、联系人和元数据目录闭环
status: done
planning_depth: deep
planning_depth_reason: 版本化档案/type/contact schema、typed field 迁移和独立联系人引用是长期公共数据合同。
ready: true
risk: high
blocked_by: [T-01]
contract_ids: [AC-006, AC-007, AC-008, AC-009]
owner: root
expected_changes: ["<Path>plugins/dossiers/src/application/catalog/**</Path>", "<Path>plugins/dossiers/src/interfaces/catalog/**</Path>", "<Path>plugins/dossiers/routes/catalog.ts</Path>", "<Path>plugins/dossiers/tools/catalog-*.ts</Path>", "<Path>plugins/dossiers/tests/catalog/**</Path>"]
writable_paths: ["<Path>plugins/dossiers/src/application/catalog/**</Path>", "<Path>plugins/dossiers/src/interfaces/catalog/**</Path>", "<Path>plugins/dossiers/routes/catalog.ts</Path>", "<Path>plugins/dossiers/tools/catalog-*.ts</Path>", "<Path>plugins/dossiers/tests/catalog/**</Path>"]
read_only_paths: ["<Path>plugins/dossiers/src/domain/**</Path>", "<Path>plugins/dossiers/src/infrastructure/workspace/**</Path>", "<Path>plugins/dossiers/src/runtime.ts</Path>", "<Path>plugins/todolist/src/application/**</Path>"]
shared_paths: ["<Path>plugins/dossiers/src/domain/**</Path>", "<Path>plugins/dossiers/src/infrastructure/workspace/**</Path>", "<Path>plugins/dossiers/src/runtime.ts</Path>"]
shared_path_owners: ["<Path>plugins/dossiers/src/domain/**</Path> => T-01", "<Path>plugins/dossiers/src/infrastructure/workspace/**</Path> => T-01", "<Path>plugins/dossiers/src/runtime.ts</Path> => T-01"]
---

# Ticket T-02: 交付档案类型、联系人和元数据目录闭环

- **Ticket 文件：** `<Path>{roots.state}/specdev/changes/2026-08-30-entity-dossier-plugin/ticket/02-catalog-contacts-search.md</Path>`
- **总体 Map：** `<Path>{roots.state}/specdev/changes/2026-08-30-entity-dossier-plugin/tickets-map.md</Path>`
- **上游 Spec：** `<Path>{roots.state}/specdev/changes/2026-08-30-entity-dossier-plugin/spec.md</Path>`
- **完成 Evidence：** `<Path>{roots.state}/specdev/changes/2026-08-30-entity-dossier-plugin/evidence/T-02.md</Path>`

## 1. 战略与来源

- **目标：** 从 API/tool 入口到 JSON 权威，交付个人/组织/项目与自定义模板、typed fields、档案 CRUD 和独立联系人角色关系。
- **可观察产出：** 调用者可创建/读取/更新/分页列出档案和联系人；模板改动不会静默破坏已有值；共享联系人投影一致。
- **来源：** US-002、US-003；AC-006–AC-009；ADR-001、ADR-003、ADR-006、ADR-013。
- **当前事实：** T-01 提供稳定 schema/repository；Todo application/HTTP/tool 分层可只读复用模式。
- **Planning Depth 原因：** typed field 与联系人身份一旦落盘难以逆转，且必须支持版本冲突和后续迁移。

## 2. 决策状态

### 已锁定决策

- 内置模板只有个人、组织、项目；公司/企业/机构是组织实例。
- typed fields 支持文本、长文本、数字、日期、布尔、枚举、URL、邮箱、电话，字段 id/type/order 稳定。
- 联系人独立存在；档案联系人关系保存角色，解除关系不删除联系人。
- 不提供档案间关系字段或接口。

### 已采用的低影响假设

- 默认字段文案和顺序可按 Hana 现有中文/英文体验选取，不成为持久身份。

### 未决问题

无。

## 3. 范围边界

| IN | REUSE | OUT |
|---|---|---|
| 类型/字段/档案/联系人/角色关系 CRUD、DTO、routes/tools、领域测试 | T-01 schema/repository/runtime，Todo 薄接口模式 | 文件复制、索引实现、UI、档案关系、删除回收站 |

## 4. 要构建什么

用户或 Agent 通过相同 application 合同创建模板和档案、维护 typed values、创建联系人并建立角色关系。所有修改带 expected version；查询返回 JSON-safe 投影和允许动作。模板不兼容改型只生成预览/阻塞结果，不在本 Ticket 执行跨 schema 全库迁移。

## 5. 实现契约

- **入口或接缝：** catalog route、前缀为 catalog 的静态 tools、application service。
- **输入与输出：** 结构化 DTO + expectedVersion；输出稳定 id/version、投影、校验诊断和分页 cursor。
- **公共接口变化：** 新增插件 catalog API/tool 行为，不新增宿主接口。
- **不变量：** 统一档案实体；无档案关系；字段值符合字段 schema；联系人关系与实体分离。
- **状态或数据流：** request context -> validate -> repository transaction -> audit intent -> projection。
- **错误与失败行为：** 无效字段/角色、重复稳定 key、陈旧版本、删除有引用联系人均拒绝且不部分写入。
- **兼容要求：** 未知允许字段往返保留；内置模板不可删除。
- **安全与隐私要求：** DTO/日志不返回联系人敏感值以外的无关字段，日志本身必须脱敏。

## 6. 执行路线

1. 为四类 AC 建立 application/route/tool 失败测试。
2. 实现内置/自定义 type 与 typed field 校验投影。
3. 实现 dossier CRUD、稳定版本和无关系边界。
4. 实现 contact CRUD 与带角色关系、引用检查。
5. 暴露薄 routes/tools 并统一错误/版本语义。
6. 运行领域、接口、脱敏与兼容测试。

## 7. 路径访问契约

- **预计修改点/可写范围：** catalog application/interfaces/routes/tools/tests。
- **只读上下文/共享路径：** T-01 foundation，owner T-01。
- **保留或不动：** documents、UI、manifest、根配置及系统路径。

## 8. 验证矩阵

| 行为或风险 | 接缝 | 命令或步骤 | 预期 | Evidence |
|---|---|---|---|---|
| 类型/档案/联系人正常路径 | application + HTTP/tool | catalog 定向测试 | CRUD/关系投影一致 | `<Path>{roots.state}/specdev/changes/2026-08-30-entity-dossier-plugin/evidence/T-02.md</Path>` |
| 模板改型/引用删除/陈旧版本 | failure fixtures | 负向测试 | 零部分写入且诊断可判定 | 同上 |
| 回归 | schema round-trip | 未知允许字段、重命名、跨档案联系人 | 身份和值不丢失 | 同上 |

- **Workspace checks：** 定向测试、类型检查。
- **E2E disposition：** not-required：本 Ticket 的稳定外部接缝由 HTTP/tool 合同覆盖，Page 在 T-11 E2E。
- **E2E owner/environment：** Lead / T-11 集成环境。
- **Integration evidence：** commit、direct-parent/candidate、result SHA 与 Lead Evidence。

## 9. 发布、迁移与恢复

- **迁移顺序：** 新 schema 仅创建；旧 schema 全库迁移由 T-08。
- **兼容窗口：** 当前 schema 可写，未知新 schema 只读。
- **监控信号：** validation/version conflict/reference counts。
- **回滚或前向恢复：** repository 原子回滚；错误模板变更不发布。
- **不可逆操作与批准点：** 无物理清理。
- **收缩条件：** 不适用：全新合同。

## 10. 验收标准

- [x] AC-006–AC-009 全部通过并记录。
- [x] 无档案关系接口或隐藏字段；联系人引用安全。
- [x] writable/shared/commit/Evidence 门禁满足。
