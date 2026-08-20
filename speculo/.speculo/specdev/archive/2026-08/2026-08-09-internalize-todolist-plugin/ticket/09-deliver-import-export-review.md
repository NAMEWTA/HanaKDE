---
schema_version: 3
artifact: ticket
change: 2026-08-09-internalize-todolist-plugin
id: T-09
title: 交付导入、导出与 Review
status: done
planning_depth: deep
planning_depth_reason: 新增版本化交换格式、事务导入和 migration audit，涉及数据迁移、冲突、隐私和回滚。
ready: true
risk: high
blocked_by: [T-08]
contract_ids: [AC-022, AC-027, AC-028, AC-029, AC-030, AC-031]
owner: implementation-owner
expected_changes: ["<Path>plugins/todolist/src/**</Path>", "<Path>plugins/todolist/assets/**</Path>", "<Path>plugins/todolist/tests/fixtures/**</Path>", "<Path>plugins/todolist/tests/import-export.integration.test.ts</Path>", "<Path>plugins/todolist/tests/e2e/review-import-export.spec.ts</Path>"]
writable_paths: ["<Path>plugins/todolist/**</Path>"]
read_only_paths: ["<Path>core/plugin-context.ts</Path>", "<Path>core/plugin-route-request-context.ts</Path>", "<Path>temp/HanaKDE-TodoList-0.0.5-workbench-source-audited-final/**</Path>"]
shared_paths: []
shared_path_owners: []
---

# Ticket T-09: 交付导入、导出与 Review

- **Ticket 文件：** `<Path>{roots.state}/specdev/changes/2026-08-09-internalize-todolist-plugin/ticket/09-deliver-import-export-review.md</Path>`
- **总体 Map：** `<Path>{roots.state}/specdev/changes/2026-08-09-internalize-todolist-plugin/tickets-map.md</Path>`
- **上游 Spec：** `<Path>{roots.state}/specdev/changes/2026-08-09-internalize-todolist-plugin/spec.md</Path>`
- **完成 Evidence：** `<Path>{roots.state}/specdev/changes/2026-08-09-internalize-todolist-plugin/evidence/T-09.md</Path>`

## 1. 战略与来源

- **目标：** 为完整 Todo 数据提供显式、可预览、可回滚的版本化交换，并让 Review 从同一 store 汇总任务与自动化事实。
- **可观察产出：** 用户可预览并提交受支持 JSON、明确看到旧 SQLite 被拒绝；默认追加且不触发 schedule、Run 或 Session，可按需下载版本化 JSON 或 Markdown Review/Automation 报告，不自动写工作区。
- **来源：** US-004、US-009、US-010，AC-022、AC-027～031，ADR-007、ADR-009，D-014、D-017。
- **当前事实：** 没有真实脱敏 0.0.5 数据样本，不能宣称旧私有数据库兼容；T-08 后插件数据模型和运营投影已稳定，可定义完整交换格式。
- **Planning Depth 原因：** import/export 是数据迁移和 wire contract，错误可能破坏全量私有数据或泄漏 Session/路径信息。

## 2. 决策状态

### 已锁定决策

- importer 只接受显式支持的版本化 JSON；旧 SQLite 或未知格式在 preview 阶段拒绝且零写入。
- preview 返回版本、实体计数、冲突、缺失引用、unsupported fields 和可提交标志；commit 绑定 preview/import identity 并事务执行。
- 重复 commit 可判定且不重复插入；失败完整回滚并保留源，记录脱敏 import audit。
- commit 默认只追加，不提供未授权的全量替换；导入不会注册、唤醒或补发任何 schedule、reminder、Run 或 Session。
- 没有真实脱敏旧样本时只实现当前规范 JSON fixture 和 SQLite 拒绝，不写“0.0.5 兼容完成”。
- export 为显式用户动作，返回版本化 JSON download；Markdown Review/Automation 报告按需生成下载，不写工作区、不申请 `resource.write`。
- export/Review 不含完整 Session messages、token、绝对路径；只包含最小 run summary/sessionRef 和规范 ResourceRef。

### 已采用的低影响假设

- 当前交换格式首版命名为插件私有 schema version 1；未来版本必须显式 migration，不能悄悄宽松解析。

### 未决问题

无。

## 3. 范围边界

| IN（本 Ticket 构建） | REUSE（复用且不改变契约） | OUT（明确不做） |
|---|---|---|
| JSON schema/fixture、preview/commit/audit、冲突与 rollback、JSON/Markdown download、Review projection/UI/tools | 完整插件 store、T-08 Run summaries、routes/tools、browser download | 打开/迁移旧 SQLite、默认报告、工作区写入、完整 transcript 导出、第三方格式猜测、导入触发后台副作用 |

## 4. 要构建什么

用户选择 JSON 后先看到清晰 preview，不触发任何 mutation；只有受支持版本、引用完整且冲突策略明确时才允许 commit。默认追加，重复提交返回已处理结果，不复制数据；导入不启动 schedule、reminder、Run 或 Session。选择 SQLite 或未知版本时显示稳定拒绝并保持 store 不变。Review 展示基础任务、完成、时间和自动化汇总，用户可显式下载 JSON 或 Markdown；Trash 只有明确勾选才交换；下载内容与页面投影一致且不含完整 Session 对话、绝对路径或 secret。

## 5. 实现契约

- **入口或接缝：** import parser/preview/commit service、export serializer、Review query、routes/tools/Page download actions。
- **输入与输出：** bounded upload/JSON document -> preview identity/diagnostics/counts -> version-bound commit result；export request -> versioned payload/download metadata。
- **公共接口变化：** 新增插件内 import/export/review routes/tools 和 schema v1；无宿主接口或 workspace write。
- **不变量：** preview 零写；commit 默认追加、事务且幂等；未知/SQLite 零写；导入不注册/唤醒 schedule、Run 或 Session；export 是 store 一致快照；messages/secret/absolute path 永不序列化。
- **状态或数据流：** source -> strict parse/schema -> reference/conflict analysis -> preview identity -> confirmed transaction -> audit；store snapshot -> redaction/serialization -> download。
- **错误与失败行为：** unsupported_format/version、invalid_schema、reference_conflict、preview_stale、already_committed、transaction_failed、export_failed 可判定，无隐藏部分成功。
- **兼容要求：** 当前 store schema 与 exchange schema 分离；未来 store migration 不隐式改变已发布 JSON version。
- **安全与隐私要求：** 上传大小/深度有界，防止 prototype/path 注入；不信任 owner/session 字段；export 脱敏且默认不产生文件副作用。

## 6. 执行路线

1. 定义 exchange schema v1、脱敏正/负 fixture 与 redaction/property 测试，先证明未知/SQLite 零写。
2. 实现严格 parser、preview identity、冲突/引用分析和 import audit。
3. 实现 version/session-bound 事务 commit、幂等重复判定和故障 rollback。
4. 实现一致快照 JSON exporter、Review/Markdown projection 与显式 download UI/tools，覆盖五语言和无障碍。
5. 运行 migration dry-run/rollback、E2E、store 数据核对、隐私扫描及全模型回归。

## 7. 路径访问契约

- **预计修改点：** 插件内 migration/import/export/review application、routes/tools/UI、fixtures/tests。
- **可写范围：** `<Path>plugins/todolist/**</Path>`。
- **只读上下文：** plugin context/route security 和参考插件的格式意图；旧 SQLite 只用于格式拒绝 fixture，不读取用户数据库。
- **共享路径：** 无；T-09 在最终模型 T-08 后顺序写入插件根。
- **保留或不动：** 工作区资源、宿主 ResourceIO、根下载/构建配置和插件根外产品文件。

## 8. 验证矩阵

| 行为或风险 | 验证接缝 | 命令或步骤 | 预期结果 | Evidence |
|---|---|---|---|---|
| 正常路径 | import/export integration | `npx vitest run <Path>plugins/todolist/tests/import-export.integration.test.ts</Path>` | preview/commit/duplicate、JSON roundtrip、Review/Markdown 一致 | `<Path>{roots.state}/specdev/changes/2026-08-09-internalize-todolist-plugin/evidence/T-09.md</Path>` |
| 失败路径 | dry-run/rollback/format fault | 同一测试执行 SQLite、unknown version、stale preview、conflict、commit failure | 全部稳定拒绝或完整 rollback，源和旧 store 保持 | `<Path>{roots.state}/specdev/changes/2026-08-09-internalize-todolist-plugin/evidence/T-09.md</Path>` |
| 隐私与安全 | serializer/fixture 扫描 | 扫描 messages、secret、absolute path、prototype keys 与 workspace writes | 输出不含禁用内容且未申请/调用 `resource.write` | `<Path>{roots.state}/specdev/changes/2026-08-09-internalize-todolist-plugin/evidence/T-09.md</Path>` |
| UI E2E（owner：当前执行 owner） | Review/import/export Page | `npx playwright test --config=<Path>plugins/todolist/tests/e2e/playwright.config.ts</Path> <Path>plugins/todolist/tests/e2e/review-import-export.spec.ts</Path>` | preview、拒绝、commit、Review/download 在桌面/窄布局可用 | `<Path>{roots.state}/specdev/changes/2026-08-09-internalize-todolist-plugin/evidence/T-09.md</Path>` |
| 回归 | 完整插件 store/projections | `npx vitest run <Path>plugins/todolist/tests</Path>` | CRUD、时间、周期、提醒、自动化行为保持 | `<Path>{roots.state}/specdev/changes/2026-08-09-internalize-todolist-plugin/evidence/T-09.md</Path>` |

## 9. 发布、迁移与恢复

- **迁移顺序：** 发布 schema/preview -> 验证 fixture -> 开放默认追加 commit -> 开放 export/Review；preview identity 与目标 store version 绑定，且导入副作用保持关闭。
- **兼容窗口：** 仅支持明示 JSON versions；未知版本和 SQLite 长期 fail closed，直到另有真实样本与新 Spec/Ticket。
- **监控信号：** preview/commit identity、版本、计数、冲突类别、rollback、duplicate commit 和 export redaction failure。
- **回滚或前向恢复：** commit 前保留事务边界/快照，失败回滚；已成功导入通过 audit 和显式删除流程处理，不自动反向删除。
- **不可逆操作与批准点：** import commit 是明确用户批准点；任何全量替换/覆盖策略未在本 Ticket 授权。
- **收缩条件：** roundtrip 数据核对一致、隐私扫描为零、unsupported format 零写和 rollback Evidence 完整后方可发布。

## 10. 验收标准

- [x] AC-027：支持 JSON preview/默认追加事务 commit/重复判定；SQLite 与未知版本拒绝且零写，导入不触发 schedule/Run/Session。
- [x] AC-028、AC-030：显式 JSON/Markdown download 与 Review 同源，无默认工作区写入。
- [x] AC-022、AC-029：无完整 Session 对话/绝对路径/secret，失败稳定且无隐藏部分成功。
- [x] AC-031：Review 与导入导出在五语言、键盘和窄布局下可用。
- [x] Evidence 完整且产品 diff 仅位于 `<Path>plugins/todolist/</Path>`。
