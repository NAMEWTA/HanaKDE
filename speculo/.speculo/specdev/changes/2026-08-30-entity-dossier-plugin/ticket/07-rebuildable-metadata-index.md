---
schema_version: 3
artifact: ticket
change: 2026-08-30-entity-dossier-plugin
id: T-07
title: 交付可重建元数据索引与规模门
status: done
planning_depth: deep
planning_depth_reason: SQLite 缓存跨越权威文件和派生状态边界，必须证明可丢弃、可重建且不会索引正文。
ready: true
risk: medium
blocked_by: [T-01, T-02]
contract_ids: [AC-015, AC-016, AC-029]
owner: root
expected_changes: ["<Path>plugins/dossiers/src/application/index/**</Path>", "<Path>plugins/dossiers/src/infrastructure/index/**</Path>", "<Path>plugins/dossiers/src/interfaces/routes/index/**</Path>", "<Path>plugins/dossiers/tests/index/**</Path>"]
writable_paths: ["<Path>plugins/dossiers/src/application/index/**</Path>", "<Path>plugins/dossiers/src/infrastructure/index/**</Path>", "<Path>plugins/dossiers/src/interfaces/routes/index/**</Path>", "<Path>plugins/dossiers/tests/index/**</Path>"]
read_only_paths: ["<Path>plugins/dossiers/src/domain/**</Path>", "<Path>plugins/dossiers/src/application/catalog/**</Path>", "<Path>packages/plugin-runtime/**</Path>"]
shared_paths: ["<Path>plugins/dossiers/src/domain/**</Path>", "<Path>plugins/dossiers/src/infrastructure/workspace/**</Path>", "<Path>plugins/dossiers/src/runtime.ts</Path>"]
shared_path_owners: ["<Path>plugins/dossiers/src/domain/**</Path> => T-01", "<Path>plugins/dossiers/src/infrastructure/workspace/**</Path> => T-01", "<Path>plugins/dossiers/src/runtime.ts</Path> => T-01"]
---

# Ticket T-07: 交付可重建元数据索引与规模门

- **Ticket 文件：** `<Path>{roots.state}/specdev/changes/2026-08-30-entity-dossier-plugin/ticket/07-rebuildable-metadata-index.md</Path>`
- **总体 Map：** `<Path>{roots.state}/specdev/changes/2026-08-30-entity-dossier-plugin/tickets-map.md</Path>`
- **上游 Spec：** `<Path>{roots.state}/specdev/changes/2026-08-30-entity-dossier-plugin/spec.md</Path>`
- **完成 Evidence：** `<Path>{roots.state}/specdev/changes/2026-08-30-entity-dossier-plugin/evidence/T-07.md</Path>`

## 1. 战略与来源

- **目标：** 用可删除重建的 `catalog.sqlite` 提供元数据搜索，并在目标规模下保持可用。
- **可观察产出：** 按名称、类型、标签、联系人、属性键/值搜索；删除或损坏索引后由权威 JSON 重建；基准满足 Spec 门槛。
- **来源：** US-004、US-010；AC-015、AC-016、AC-029；ADR-003、ADR-004。
- **当前事实：** `dossier.json` 和根级类型/联系人 JSON 是权威，全文/OCR 明确不在范围。
- **Planning Depth 原因：** 派生索引容易被误当权威，且性能策略可能意外读取文档正文。

## 2. 决策状态

### 已锁定决策

- SQLite 只索引元数据；不读取或持久化 managed document 正文。
- 索引可完全删除并由权威 JSON 重建，不阻塞直接读取档案。
- 首屏/搜索/重建按 Spec 的 1,000 档案、10,000 资料目标验证。
- 索引写入失败不回滚已成功的权威写入，只标记 stale 并可重建。

### 已采用的低影响假设

- 使用显式 schema version 与单 writer 队列，搜索结果再由权威文件校验关键展示字段。

### 未决问题

无。

## 3. 范围边界

| IN | REUSE | OUT |
|---|---|---|
| SQLite schema、增量更新、全量重建、元数据查询、基准 | T-01 reader、T-02 catalog events | 全文/OCR、语义向量、远程搜索、权威数据存储 |

## 4. 要构建什么

建立 index repository、rebuild coordinator 和搜索 route。增量事件更新 SQLite；缺失、版本不兼容或 integrity check 失败时从 `Dossiers/` 权威文件扫描重建。搜索只返回 ids 和安全摘要，再经 catalog reader 解析，确保 stale index 不伪造权威事实。

## 5. 实现契约

- **入口或接缝：** catalog change events、index repository、search/rebuild routes。
- **输入与输出：** normalized metadata event/query/page cursor；输出 dossier ids、摘要、stale/rebuild 状态。
- **公共接口变化：** 新增 metadata search、index status、explicit rebuild 能力。
- **不变量：** 无正文列；索引可丢弃；权威写成功不依赖索引成功；结果路径不越界。
- **状态或数据流：** authority write -> index event -> SQLite；query -> ids -> authority hydration。
- **错误与失败行为：** corrupt/locked/old schema 标记 stale，降级到有界扫描或提示重建，不修改权威文件。
- **兼容要求：** index schema 可直接重建，不对旧缓存做权威迁移。
- **安全与隐私要求：** 参数化 SQL；查询/日志不含文档正文。

## 6. 执行路线

1. 定义 SQLite schema、normalization 和 no-content invariant tests。
2. 实现增量 upsert/delete 与 stale 状态。
3. 实现全量重建、崩溃后替换和 integrity 检查。
4. 实现 metadata search、分页和 authority hydration。
5. 建立 1,000/10,000 fixture 基准与性能回归阈值。

## 7. 路径访问契约

- **可写范围：** index application/infrastructure/routes/tests。
- **只读/共享：** T-01 foundation、T-02 catalog；共享 owner T-01。
- **保留或不动：** 文档内容、Agent/UI、产品级数据库。

## 8. 验证矩阵

| 行为或风险 | 接缝 | 步骤 | 预期 | Evidence |
|---|---|---|---|---|
| 元数据搜索 | search route | 各字段与组合条件查询 | 命中正确且不索引正文 | `<Path>{roots.state}/specdev/changes/2026-08-30-entity-dossier-plugin/evidence/T-07.md</Path>` |
| 删除/损坏缓存 | index repository | 删除或破坏 SQLite 后打开 | 权威可读，重建后结果一致 | 同上 |
| 性能回归 | benchmark fixture | 1,000 档案/10,000 资料 | 满足 AC-029 门槛并记录环境 | 同上 |

- **Workspace checks：** index tests、SQLite integrity、正文 sentinel scan、benchmark。
- **E2E disposition：** not-required：本 Ticket 的索引合同与规模门可由确定性集成测试观察；真实 Page 搜索和重建由 T-11 覆盖。
- **E2E owner/environment：** Lead / current-workspace；T-11 在真实 Hana 主机执行集成 E2E。
- **Integration evidence：** commit、candidate/direct-parent、result SHA、Lead Evidence。

## 9. 发布、迁移与恢复

- **迁移顺序：** 检测 index schema；不兼容则建立新临时库并原子替换。
- **兼容窗口：** 无缓存兼容承诺，权威 schema 由 T-08 负责。
- **监控信号：** schema version、stale reason、rebuild duration/count、query latency。
- **回滚或前向恢复：** 删除缓存并重建；永不以缓存回写权威。
- **不可逆操作与批准点：** 无权威不可逆动作。
- **收缩条件：** 性能或 integrity 异常时禁用索引写入并降级只读扫描。

## 10. 验收标准

- [x] AC-015、AC-016、AC-029 的功能、恢复和基准证据通过。
- [x] SQLite 可删除重建，且 sentinel 正文不进入索引。
- [x] 集成 E2E 交由 T-11 明确承接。
- [x] commit、路径、Evidence 和偏差门满足。
