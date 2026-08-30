---
schema_version: 3
artifact: ticket
change: 2026-08-30-entity-dossier-plugin
id: T-01
title: 建立工作区权威根与安全初始化基础
status: done
planning_depth: deep
planning_depth_reason: 固定工作区数据根、版本化公共 schema、原子操作日志和不兼容目录 fail-closed 会约束全部后续切片及迁移安全。
ready: true
risk: high
blocked_by: []
contract_ids: [AC-003, AC-004]
owner: root
expected_changes: ["<Path>plugins/dossiers/src/domain/**</Path>", "<Path>plugins/dossiers/src/infrastructure/workspace/**</Path>", "<Path>plugins/dossiers/src/runtime.ts</Path>", "<Path>plugins/dossiers/tests/foundation/**</Path>"]
writable_paths: ["<Path>plugins/dossiers/src/domain/**</Path>", "<Path>plugins/dossiers/src/infrastructure/workspace/**</Path>", "<Path>plugins/dossiers/src/runtime.ts</Path>", "<Path>plugins/dossiers/tests/foundation/**</Path>"]
read_only_paths: ["<Path>plugins/todolist/src/domain/**</Path>", "<Path>plugins/todolist/src/infrastructure/store.ts</Path>", "<Path>PLUGIN_SDK.md</Path>"]
shared_paths: ["<Path>plugins/dossiers/src/domain/**</Path>", "<Path>plugins/dossiers/src/infrastructure/workspace/**</Path>", "<Path>plugins/dossiers/src/runtime.ts</Path>"]
shared_path_owners: ["<Path>plugins/dossiers/src/domain/**</Path> => T-01", "<Path>plugins/dossiers/src/infrastructure/workspace/**</Path> => T-01", "<Path>plugins/dossiers/src/runtime.ts</Path> => T-01"]
---

# Ticket T-01: 建立工作区权威根与安全初始化基础

- **Ticket 文件：** `<Path>{roots.state}/specdev/changes/2026-08-30-entity-dossier-plugin/ticket/01-workspace-authority-foundation.md</Path>`
- **总体 Map：** `<Path>{roots.state}/specdev/changes/2026-08-30-entity-dossier-plugin/tickets-map.md</Path>`
- **上游 Spec：** `<Path>{roots.state}/specdev/changes/2026-08-30-entity-dossier-plugin/spec.md</Path>`
- **完成 Evidence：** `<Path>{roots.state}/specdev/changes/2026-08-30-entity-dossier-plugin/evidence/T-01.md</Path>`

## 1. 战略与来源

- **目标：** 建立后续所有切片共同消费、但只有本 Ticket 可修改的版本化领域合同、固定 `Dossiers/` 根解析和可恢复操作基础。
- **可观察产出：** 空工作区可安全初始化兼容档案库；普通非兼容同名目录被零写入阻塞；权威路径始终是 ResourceRef/相对标识。
- **来源：** US-001；AC-003、AC-004；ADR-004、ADR-007、ADR-013、ADR-014。
- **当前事实：** Hana 插件公开工作区访问只有 `ctx.resources`；`<Path>plugins/todolist/src/infrastructure/store.ts</Path>` 提供原子写入先例，但其 plugin-data JSON 归属不能直接复用。
- **Planning Depth 原因：** 这是公共数据/schema 与迁移根，错误会覆盖用户工作区或令全部后续 Ticket 形成双重权威。

## 2. 决策状态

### 已锁定决策

- 当前工作区固定逻辑根为 `Dossiers/`；不回退到 cwd、绝对路径或 plugin-data。
- 根 manifest、dossier/type/contact/document/operation 的稳定 id、version 与 JSON envelope 在此定义。
- 只接管不存在、空目录或兼容 manifest；非兼容根 fail closed。
- 写入采用期望版本、暂存和持久操作日志；派生索引不进入权威接口。

### 已采用的低影响假设

- 不透明 id 的具体生成算法由实现者选择，但必须跨平台、URL/文件名安全且重命名不变。

### 未决问题

无。

## 3. 范围边界

| IN（本 Ticket 构建） | REUSE（复用且不改变契约） | OUT（明确不做） |
|---|---|---|
| 根 manifest/schema、ResourceRef 根解析、兼容检测、原子 JSON/operation primitives、dataDir 级 runtime | `ctx.resources`、Todo 原子存储与错误映射模式 | 档案 CRUD、资料复制、UI、Agent、索引、旧 schema 迁移执行 |

## 4. 要构建什么

调用者给出当前 workspace ResourceRef 后，foundation 返回 `ready | blocked | migration-required` 投影。首次初始化只创建兼容根及基础目录/manifest；遇到非兼容内容返回可说明原因的阻塞结果且 ResourceIO mutation 数为零。后续模块通过稳定 repository/operation 接缝读写版本化清单，不自行拼路径或持久化 materialized path。

## 5. 实现契约

- **入口或接缝：** dataDir 级 runtime；workspace library open/initialize；versioned JSON repository；operation journal。
- **输入与输出：** 输入 request-scoped ResourceIO 和 workspace ResourceRef；输出 JSON-safe library projection、规范相对地址和版本冲突/阻塞结果。
- **公共接口变化：** 仅插件内部共享接口，后续 Ticket 只读消费。
- **不变量：** JSON 清单是权威；根身份与 workspace 绑定；无绝对路径；陈旧版本拒绝；失败不发布部分清单。
- **状态或数据流：** resolve root -> inspect -> initialize/open/block -> atomic operation -> publish manifest。
- **错误与失败行为：** 授权不足、非兼容根、暂存/rename 失败和陈旧版本均保持旧权威不变。
- **兼容要求：** 未知新主 schema 只读阻塞；允许的扩展字段往返不丢失。
- **安全与隐私要求：** 所有相对路径规范化并禁止越界；日志不写 ResourceRef 敏感宿主字段。

## 6. 执行路线

1. 建立 fake ResourceIO、非兼容根和故障注入测试，使 AC-003/004 先失败。
2. 定义版本化 envelope、稳定身份和根 manifest schema，以及 parser/validator。
3. 实现 workspace root inspection、初始化和 fail-closed 投影。
4. 实现 expected-version 原子清单 repository 与持久 operation journal primitives。
5. 建立 dataDir 级 runtime，确保 request-scoped ResourceIO 不被缓存。
6. 运行 foundation 测试、类型检查和路径/敏感值扫描。

## 7. 路径访问契约

- **预计修改点/可写范围：** 仅 frontmatter 所列 foundation 路径。
- **只读上下文：** Todo 存储先例与 SDK 文档。
- **共享路径：** domain、workspace infrastructure、runtime 仅 T-01 修改，后续 Ticket 只读。
- **保留或不动：** `<Path>plugins/dossiers/manifest.json</Path>`、Page、tools、其他项目路径。

## 8. 验证矩阵

| 行为或风险 | 验证接缝 | 命令或步骤 | 预期结果 | Evidence |
|---|---|---|---|---|
| 空根初始化 | fake ResourceIO 集成 | 定向 foundation 测试 | 只创建兼容根与 schema，状态 ready | `<Path>{roots.state}/specdev/changes/2026-08-30-entity-dossier-plugin/evidence/T-01.md</Path>` |
| 非兼容/故障 | mutation spy + 故障注入 | 普通同名目录、权限、写中断 | blocked 且零发布写入 | 同上 |
| 回归 | 类型/路径扫描 | TypeScript + 绝对路径/敏感字段负向测试 | 合同稳定且无泄露 | 同上 |

- **Workspace checks：** source/current workspace 运行 foundation 测试和适用类型检查。
- **E2E disposition：** not-required：尚无 Page/host contribution，真实宿主由 T-11 汇合验证。
- **E2E owner/environment：** Lead / T-11 current-workspace 或 parent-candidate。
- **Integration evidence：** implementation/source commit、parent before、result SHA 和 Lead Evidence。

## 9. 发布、迁移与恢复

- **迁移顺序：** 本 Ticket 只识别 migration-required，不执行旧 schema 改写。
- **兼容窗口：** 当前 schema 可写；未知新 schema 只读阻塞。
- **监控信号：** library state、schema version、blocked reason、operation recovery count。
- **回滚或前向恢复：** 未发布暂存可清理；已发布操作由 journal 重放/确认。
- **不可逆操作与批准点：** 无物理删除；初始化前兼容门必须通过。
- **收缩条件：** 不适用：全新插件合同。

## 10. 验收标准

- [x] AC-003、AC-004 可判定通过。
- [x] 正常、失败、回归验证记录到 T-01 Evidence。
- [x] 共享 foundation 路径只有 T-01 修改并形成非空 commit/集成结果。
- [x] 未发生未批准偏差。
