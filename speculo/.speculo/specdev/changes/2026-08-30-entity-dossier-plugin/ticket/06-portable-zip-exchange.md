---
schema_version: 3
artifact: ticket
change: 2026-08-30-entity-dossier-plugin
id: T-06
title: 交付单档案 ZIP 与整库迁移
status: done
planning_depth: deep
planning_depth_reason: 导入导出会跨信任边界复制用户文件，必须处理路径穿越、冲突、校验和中断恢复。
ready: true
risk: high
blocked_by: [T-02, T-03]
contract_ids: [AC-026, AC-027]
owner: root
expected_changes: ["<Path>plugins/dossiers/src/application/exchange/**</Path>", "<Path>plugins/dossiers/src/interfaces/routes/exchange/**</Path>", "<Path>plugins/dossiers/tools/exchange-*.ts</Path>", "<Path>plugins/dossiers/tests/exchange/**</Path>"]
writable_paths: ["<Path>plugins/dossiers/src/application/exchange/**</Path>", "<Path>plugins/dossiers/src/interfaces/routes/exchange/**</Path>", "<Path>plugins/dossiers/tools/exchange-*.ts</Path>", "<Path>plugins/dossiers/tests/exchange/**</Path>"]
read_only_paths: ["<Path>plugins/dossiers/src/domain/**</Path>", "<Path>plugins/dossiers/src/application/catalog/**</Path>", "<Path>plugins/dossiers/src/application/documents/**</Path>", "<Path>packages/plugin-runtime/**</Path>"]
shared_paths: ["<Path>plugins/dossiers/src/domain/**</Path>", "<Path>plugins/dossiers/src/infrastructure/workspace/**</Path>", "<Path>plugins/dossiers/src/runtime.ts</Path>"]
shared_path_owners: ["<Path>plugins/dossiers/src/domain/**</Path> => T-01", "<Path>plugins/dossiers/src/infrastructure/workspace/**</Path> => T-01", "<Path>plugins/dossiers/src/runtime.ts</Path> => T-01"]
---

# Ticket T-06: 交付单档案 ZIP 与整库迁移

- **Ticket 文件：** `<Path>{roots.state}/specdev/changes/2026-08-30-entity-dossier-plugin/ticket/06-portable-zip-exchange.md</Path>`
- **总体 Map：** `<Path>{roots.state}/specdev/changes/2026-08-30-entity-dossier-plugin/tickets-map.md</Path>`
- **上游 Spec：** `<Path>{roots.state}/specdev/changes/2026-08-30-entity-dossier-plugin/spec.md</Path>`
- **完成 Evidence：** `<Path>{roots.state}/specdev/changes/2026-08-30-entity-dossier-plugin/evidence/T-06.md</Path>`

## 1. 战略与来源

- **目标：** 让单档案可作为自包含 ZIP 交换，并让整个 `Dossiers/` 目录可直接迁移后重建使用。
- **可观察产出：** 导出包含 manifest、权威元数据和 managed files；导入校验后原子落盘；复制整库到新工作区可恢复目录。
- **来源：** US-009；AC-026、AC-027；ADR-001、ADR-006。
- **当前事实：** 可迁移性依赖权威文件在工作区内，而非 plugin-private 数据库。
- **Planning Depth 原因：** 归档文件是外部输入，路径和资源上限错误可越界写入或破坏已有档案。

## 2. 决策状态

### 已锁定决策

- 单档案导出为 ZIP；整库迁移直接复制 `Dossiers/`。
- 导入只接受相对路径、已知 schema 和受限文件规模；先暂存校验再提交。
- 冲突使用稳定后缀/新 id，不静默覆盖现有档案。
- `catalog.sqlite` 等可重建缓存不作为导出权威要求。

### 已采用的低影响假设

- ZIP manifest 记录格式版本、文件相对路径、大小和哈希，名称不参与身份判断。

### 未决问题

无。

## 3. 范围边界

| IN | REUSE | OUT |
|---|---|---|
| ZIP pack/unpack、manifest 校验、冲突策略、整库探测 | T-01 原子写入、T-02/T-03 schema | 云同步、加密备份、网络分享、专有压缩格式 |

## 4. 要构建什么

实现 exchange service 和 route/tool adapters。导出从权威 dossier 目录生成确定性 manifest 并打包；导入先解压到插件受控临时资源，校验路径、schema、大小、哈希和 dossier id，再通过 workspace transaction 提交。整库迁移只需安全初始化并触发索引重建。

## 5. 实现契约

- **入口或接缝：** exchange application service、导入/导出 routes 和确认工具。
- **输入与输出：** dossier id 或受控 ResourceRef；输出 ZIP ResourceRef、预检报告或导入结果。
- **公共接口变化：** 新增 export、inspect-import、commit-import、detect-library 能力。
- **不变量：** ZIP 不含绝对路径；导入不出 `Dossiers/`；失败不留下半档案；缓存可缺失。
- **状态或数据流：** export snapshot -> manifest -> archive；archive -> staging -> validate -> atomic commit -> reindex intent。
- **错误与失败行为：** zip-slip、炸弹阈值、哈希不符、未知 schema、冲突均在提交前拒绝。
- **兼容要求：** 支持当前及明确声明的可迁移旧格式；未来格式 fail closed。
- **安全与隐私要求：** 不自动上传，不记录外部绝对路径或内容。

## 6. 执行路线

1. 定义 exchange manifest、资源上限和恶意 fixture。
2. 实现确定性单档案导出与哈希清单。
3. 实现 staging inspect、冲突预览和原子 commit。
4. 实现整库复制后的探测与重建触发合同。
5. 覆盖 zip-slip、截断、重复导入、中断和跨工作区往返。

## 7. 路径访问契约

- **可写范围：** exchange application/routes/tools/tests。
- **只读/共享：** T-01 foundation、T-02/T-03 schema；共享 owner T-01。
- **保留或不动：** 网络、系统压缩服务、产品核心与其他插件。

## 8. 验证矩阵

| 行为或风险 | 接缝 | 步骤 | 预期 | Evidence |
|---|---|---|---|---|
| 单档案往返 | exchange service | export -> clean workspace import | 元数据、联系人、属性、分类和文件哈希一致 | `<Path>{roots.state}/specdev/changes/2026-08-30-entity-dossier-plugin/evidence/T-06.md</Path>` |
| 恶意/损坏包 | staging validator | zip-slip、超限、哈希不符 | 提交前拒绝，目标不变 | 同上 |
| 整库迁移回归 | second workspace | 复制 `Dossiers/` 后打开 | 档案可发现，缓存可重建 | 同上 |

- **Workspace checks：** exchange tests、archive fixture scan、schema/type checks。
- **E2E disposition：** 当前 Ticket integration not-required：确定性 ResourceIO/ZIP seam 已覆盖；真实文件选择、ZIP ResourceRef 和第二工作区往返由 T-11 required E2E 承接。
- **E2E owner/environment：** Lead / T-11 集成环境。
- **Integration evidence：** commit、candidate/direct-parent、result SHA、Lead Evidence。

## 9. 发布、迁移与恢复

- **迁移顺序：** inspect 识别格式，再调用 T-08 迁移，最后 commit。
- **兼容窗口：** manifest format version 明确；未知未来版本拒绝。
- **监控信号：** 文件数、总字节、格式版本、校验结果、冲突策略，不含内容。
- **回滚或前向恢复：** staging 可删除；commit 中断由 T-01 journal 恢复。
- **不可逆操作与批准点：** 覆盖不提供；导入提交需用户确认预检结果。
- **收缩条件：** 校验器异常时禁用导入，保留导出与只读探测。

## 10. 验收标准

- [x] AC-026、AC-027 的正常/失败/回归证据通过。
- [x] 当前 integration not-required；required 跨工作区 host E2E 已明确交由 T-11 Lead Gate。
- [x] 恶意包不能越界、超限或留下半成品。
- [x] commit、路径、Evidence 和偏差门满足。
