---
schema_version: 3
artifact: ticket
change: 2026-08-30-entity-dossier-plugin
id: T-08
title: 交付权威 Schema 迁移与故障恢复
status: done
planning_depth: deep
planning_depth_reason: dossier/type/contact/document 等权威格式升级必须跨版本、可恢复且不能破坏用户工作区。
ready: true
risk: high
blocked_by: [T-02, T-03, T-05, T-06, T-07]
contract_ids: [AC-005, AC-007, AC-028]
owner: root
expected_changes: ["<Path>plugins/dossiers/src/application/migration/**</Path>", "<Path>plugins/dossiers/src/infrastructure/migration/**</Path>", "<Path>plugins/dossiers/src/interfaces/routes/migration/**</Path>", "<Path>plugins/dossiers/tests/migration/**</Path>"]
writable_paths: ["<Path>plugins/dossiers/src/application/migration/**</Path>", "<Path>plugins/dossiers/src/infrastructure/migration/**</Path>", "<Path>plugins/dossiers/src/interfaces/routes/migration/**</Path>", "<Path>plugins/dossiers/tests/migration/**</Path>"]
read_only_paths: ["<Path>plugins/dossiers/src/domain/**</Path>", "<Path>plugins/dossiers/src/application/catalog/**</Path>", "<Path>plugins/dossiers/src/application/documents/**</Path>", "<Path>plugins/dossiers/src/application/lifecycle/**</Path>", "<Path>plugins/dossiers/src/application/exchange/**</Path>", "<Path>plugins/dossiers/src/infrastructure/index/**</Path>"]
shared_paths: ["<Path>plugins/dossiers/src/domain/**</Path>", "<Path>plugins/dossiers/src/infrastructure/workspace/**</Path>", "<Path>plugins/dossiers/src/runtime.ts</Path>"]
shared_path_owners: ["<Path>plugins/dossiers/src/domain/**</Path> => T-01", "<Path>plugins/dossiers/src/infrastructure/workspace/**</Path> => T-01", "<Path>plugins/dossiers/src/runtime.ts</Path> => T-01"]
---

# Ticket T-08: 交付权威 Schema 迁移与故障恢复

- **Ticket 文件：** `<Path>{roots.state}/specdev/changes/2026-08-30-entity-dossier-plugin/ticket/08-schema-migration-and-recovery.md</Path>`
- **总体 Map：** `<Path>{roots.state}/specdev/changes/2026-08-30-entity-dossier-plugin/tickets-map.md</Path>`
- **上游 Spec：** `<Path>{roots.state}/specdev/changes/2026-08-30-entity-dossier-plugin/spec.md</Path>`
- **完成 Evidence：** `<Path>{roots.state}/specdev/changes/2026-08-30-entity-dossier-plugin/evidence/T-08.md</Path>`

## 1. 战略与来源

- **目标：** 让权威 JSON 格式可显式升级，初始化/升级中断后可恢复，未来不兼容格式则安全只读失败。
- **可观察产出：** 空工作区安全初始化；旧 fixture 迁移后事实保持；故障注入不会留下混合版本；新版本提示兼容问题而不改写。
- **来源：** US-001、US-002、US-009；AC-005、AC-007、AC-028；ADR-002、ADR-006、ADR-007。
- **当前事实：** 权威文件散布于根级目录和每档案目录，索引可重建而非迁移权威。
- **Planning Depth 原因：** 迁移触碰全部长期数据格式，失败可造成跨目录不一致或不可逆丢失。

## 2. 决策状态

### 已锁定决策

- 所有权威格式带 schema version；迁移逐版本、可重复、先备份/暂存后提交。
- 升级失败保持旧权威可读或进入明确 recoverable 状态，不静默继续写。
- 未来未知版本 fail closed，只提供诊断/导出，不降级改写。
- SQLite 缓存不做权威迁移，删除后由 T-07 重建。

### 已采用的低影响假设

- migration journal 位于 `Dossiers/.system/`，仅记录步骤、版本、目标 id 和校验和，不含正文。

### 未决问题

无。

## 3. 范围边界

| IN | REUSE | OUT |
|---|---|---|
| 初始化 manifest、版本探测、逐版迁移、journal、恢复/只读兼容 | T-01 transaction、各权威 schema、T-07 rebuild | 产品运行时迁移、其他插件数据、自动网络恢复 |

## 4. 要构建什么

建立 compatibility manifest、migration registry、planner 和 recovery route。打开工作区先探测根及档案 schema；需要升级时形成计划和备份，经确认后按 journal 执行，每个步骤做前后校验。中断后下次打开只允许继续/恢复；新版本工作区进入兼容只读状态。

## 5. 实现契约

- **入口或接缝：** startup compatibility gate、migration application service、status/recover routes。
- **输入与输出：** detected versions、migration plan、confirmation；输出 compatible/needs-migration/recoverable/future-version 状态。
- **公共接口变化：** 新增 preflight、plan、execute、recover 和 compatibility status。
- **不变量：** 未完成迁移不开放普通写入；每步幂等；旧备份在验证成功前保留；未知版本不写。
- **状态或数据流：** detect -> plan -> confirm -> staged steps+journal -> validate -> activate -> reindex。
- **错误与失败行为：** 任一步异常停止并给出恢复动作，禁止在混合版本继续业务写入。
- **兼容要求：** 至少包含当前 schema、一个旧 fixture 和一个 future fixture。
- **安全与隐私要求：** journal/错误不含正文；路径仅在 `Dossiers/` 受控范围。

## 6. 执行路线

1. 汇总所有权威 schema version 并定义 compatibility matrix。
2. 实现空工作区幂等初始化和 future-version gate。
3. 实现逐版本 migration registry、备份、journal 与校验。
4. 实现故障恢复/继续及完成后的索引重建意图。
5. 用旧版、部分迁移、损坏和未来版本 fixture 验证。

## 7. 路径访问契约

- **可写范围：** migration application/infrastructure/routes/tests。
- **只读/共享：** T-01 foundation 及 T-02/T-03/T-05/T-06/T-07 schemas；共享 owner T-01。
- **保留或不动：** 产品 runtime migration、其他插件和未声明工作区目录。

## 8. 验证矩阵

| 行为或风险 | 接缝 | 步骤 | 预期 | Evidence |
|---|---|---|---|---|
| 初始化/旧版迁移 | startup gate | 空目录启动；旧 fixture 升级 | 幂等初始化；事实与文件哈希清单保持 | `<Path>{roots.state}/specdev/changes/2026-08-30-entity-dossier-plugin/evidence/T-08.md</Path>` |
| 中断恢复 | fault injection | 每个提交点中断并重启 | 继续或恢复，无混合版本业务写入 | 同上 |
| 未来版本回归 | compatibility fixture | 打开 higher schema | fail closed，只读诊断且文件未改 | 同上 |

- **Workspace checks：** migration fixture tests、journal invariant、before/after inventory diff。
- **E2E disposition：** not-required（本 Ticket direct-parent）：真实插件重启与 startup gate 保留为 T-11 required host 集成验证。
- **E2E owner/environment：** Lead / T-11 集成环境。
- **Integration evidence：** commit、candidate/direct-parent、result SHA、Lead Evidence。

## 9. 发布、迁移与恢复

- **迁移顺序：** root manifest -> types/contacts -> dossiers -> lifecycle/exchange metadata -> index rebuild。
- **兼容窗口：** 当前版本读写；受支持旧版本需迁移；未来版本只读诊断。
- **监控信号：** from/to version、step、duration、result、recovery state，不含正文。
- **回滚或前向恢复：** 激活前从备份恢复；激活后只以前向修复或完整备份恢复。
- **不可逆操作与批准点：** migration execute 必须显示计划并确认；不自动删除备份。
- **收缩条件：** 校验失败或未来版本时关闭全部写操作，只保留诊断/导出。

## 10. 验收标准

- [x] AC-005、AC-007、AC-028 的初始化、迁移、恢复与兼容证据通过。
- [x] 本 Ticket direct-parent E2E 为 not-required；required 重启 E2E 已由 T-11 Gate 锁定。
- [x] 未完成/未知版本不会开放业务写入或改写用户文件。
- [x] commit、路径、Evidence 和偏差门满足。
