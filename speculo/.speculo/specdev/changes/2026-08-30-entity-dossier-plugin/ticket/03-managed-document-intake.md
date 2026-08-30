---
schema_version: 3
artifact: ticket
change: 2026-08-30-entity-dossier-plugin
id: T-03
title: 交付受管资料导入、分类与原子移动
status: done
planning_depth: deep
planning_depth_reason: 用户文件复制、哈希去重、命名冲突、容量预检和故障回滚具有高数据完整性事故半径。
ready: true
risk: high
blocked_by: [T-01, T-02]
contract_ids: [AC-010, AC-011, AC-012, AC-013, AC-014]
owner: root
expected_changes: ["<Path>plugins/dossiers/src/application/documents/**</Path>", "<Path>plugins/dossiers/src/interfaces/documents/**</Path>", "<Path>plugins/dossiers/routes/documents.ts</Path>", "<Path>plugins/dossiers/tools/documents-*.ts</Path>", "<Path>plugins/dossiers/tests/documents/**</Path>"]
writable_paths: ["<Path>plugins/dossiers/src/application/documents/**</Path>", "<Path>plugins/dossiers/src/interfaces/documents/**</Path>", "<Path>plugins/dossiers/routes/documents.ts</Path>", "<Path>plugins/dossiers/tools/documents-*.ts</Path>", "<Path>plugins/dossiers/tests/documents/**</Path>"]
read_only_paths: ["<Path>plugins/dossiers/src/domain/**</Path>", "<Path>plugins/dossiers/src/infrastructure/workspace/**</Path>", "<Path>plugins/dossiers/src/application/catalog/**</Path>", "<Path>PLUGIN_SDK.md</Path>"]
shared_paths: ["<Path>plugins/dossiers/src/domain/**</Path>", "<Path>plugins/dossiers/src/infrastructure/workspace/**</Path>", "<Path>plugins/dossiers/src/runtime.ts</Path>"]
shared_path_owners: ["<Path>plugins/dossiers/src/domain/**</Path> => T-01", "<Path>plugins/dossiers/src/infrastructure/workspace/**</Path> => T-01", "<Path>plugins/dossiers/src/runtime.ts</Path> => T-01"]
---

# Ticket T-03: 交付受管资料导入、分类与原子移动

- **Ticket 文件：** `<Path>{roots.state}/specdev/changes/2026-08-30-entity-dossier-plugin/ticket/03-managed-document-intake.md</Path>`
- **总体 Map：** `<Path>{roots.state}/specdev/changes/2026-08-30-entity-dossier-plugin/tickets-map.md</Path>`
- **上游 Spec：** `<Path>{roots.state}/specdev/changes/2026-08-30-entity-dossier-plugin/spec.md</Path>`
- **完成 Evidence：** `<Path>{roots.state}/specdev/changes/2026-08-30-entity-dossier-plugin/evidence/T-03.md</Path>`

## 1. 战略与来源

- **目标：** 从导入预览到 ResourceIO 复制、清单发布和分类移动交付一条无半成品的受管资料闭环。
- **可观察产出：** 外部/其他目录文件复制进入目标档案；同目录引用不复制；重复和同名冲突可预览；取消/失败不发布悬空引用。
- **来源：** US-004；AC-010–AC-014；ADR-002、ADR-009。
- **当前事实：** SDK 要求用户文件只经 `ctx.resources`；T-01 提供 operation journal，T-02 提供 dossier 清单事务。
- **Planning Depth 原因：** 文件操作与 JSON 权威必须跨失败原子协调，错误可能丢失或覆盖用户资料。

## 2. 决策状态

### 已锁定决策

- 目标档案目录外来源一律复制；目标目录内才相对引用。
- 每份资料一个物理主分类、多个逻辑标签；改主分类移动文件。
- 相同字节用内容哈希识别；同名异内容稳定后缀；不全局跨档案去重。
- preview 零权威写入，completed 才发布引用。

### 已采用的低影响假设

- 默认分类 id/文案在本 Ticket 固定为可本地化 defaults，用户可创建自定义分类。

### 未决问题

无。

## 3. 范围边界

| IN | REUSE | OUT |
|---|---|---|
| file/folder preview、容量/冲突、copy/hash/name、分类 move、标签、故障恢复 | T-01 journal/ResourceIO、T-02 dossier transaction | zip 交换、回收站、UI、正文读取/索引 |

## 4. 要构建什么

调用者选择文件或文件夹后收到稳定预览：来源、目标相对路径、分类、哈希重复、命名和预计字节。commit 使用 request-scoped ResourceIO 将暂存复制完成后原子发布 dossier document refs。改分类保持旧路径到新路径和清单的一致落点；失败可从 journal 重试或回滚。

## 5. 实现契约

- **入口或接缝：** document preview/commit/move/tag application、route 和 tools。
- **输入与输出：** ResourceRef、dossierId、categoryId、expectedVersion；输出 previewId/result/revision/逐项诊断。
- **公共接口变化：** 新增插件 document actions；工作区写工具必须声明 reviewer-bound side effect。
- **不变量：** 来源不改；目标不覆盖；发布引用必有文件；相对路径在目标 dossier 根内。
- **状态或数据流：** preview -> stage/copy/hash -> publish manifest -> completed，或 failed/cancelled recovery。
- **错误与失败行为：** 权限、容量、冲突、copy/move 中断保持旧权威；preview stale 时拒绝 commit。
- **兼容要求：** ResourceRef 联合类型透明处理，不假定 local path。
- **安全与隐私要求：** materialize 仅执行边界且不持久化；符号链接/路径越界拒绝。

## 6. 执行路线

1. 建立 copy/move 故障注入、hash/name 和 traversal 负向测试。
2. 实现 file/folder preview 与稳定计划摘要。
3. 实现 staged ResourceIO copy、hash 和命名决策。
4. 协调 dossier manifest 发布和 operation journal recovery。
5. 实现 category move/tag update 与 stale preview/version 拒绝。
6. 暴露 routes/tools 并运行定向、属性和故障恢复测试。

## 7. 路径访问契约

- **可写范围：** documents application/interfaces/routes/tools/tests。
- **只读/共享：** T-01 foundation、T-02 catalog；共享 owner T-01。
- **保留或不动：** 交换、生命周期、UI、系统路径。

## 8. 验证矩阵

| 行为或风险 | 接缝 | 步骤 | 预期 | Evidence |
|---|---|---|---|---|
| 外部/内部来源 | fake ResourceIO | preview+commit | 正确 copy/reference 与相对清单 | `<Path>{roots.state}/specdev/changes/2026-08-30-entity-dossier-plugin/evidence/T-03.md</Path>` |
| 重复/冲突/中断 | property + failure injection | hash、同名、容量、取消、move fail | 不覆盖、不发布半引用、可恢复 | 同上 |
| 回归 | version/path scan | stale preview、traversal、materialize | fail closed，无绝对路径 | 同上 |

- **Workspace checks：** document tests、类型检查、敏感路径扫描。
- **E2E disposition：** not-required for T-03 integration：本 Ticket 由确定性 ResourceIO integration fixture 验证；真实 Resource Picker/ResourceIO copy/move 跨 iframe-host 场景保持为 T-11 required E2E。
- **E2E owner/environment：** Lead / T-11 current-workspace real-host Gate。
- **Integration evidence：** commit、候选/直接父验证、result SHA、Lead Evidence。

## 9. 发布、迁移与恢复

- **迁移顺序：** 先复制并验证 bytes，再发布清单；移动先保持 journal 和旧引用可恢复。
- **兼容窗口：** 仅当前 dossier/document schema 可写。
- **监控信号：** preview bytes、copy progress、duplicate/conflict counts、recovery state。
- **回滚或前向恢复：** 清理未发布暂存或继续 journal；不得删除来源。
- **不可逆操作与批准点：** 覆盖永不允许；批量导入 commit 需用户确认。
- **收缩条件：** 不适用。

## 10. 验收标准

- [x] AC-010–AC-014 全部有正常/失败/回归证据。
- [x] 真实 host/picker E2E 场景已明确保留给 T-11 required Gate。
- [x] 路径、commit、Evidence 和偏差门满足。
