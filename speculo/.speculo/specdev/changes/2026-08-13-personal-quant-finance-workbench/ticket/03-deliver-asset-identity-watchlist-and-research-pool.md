---
schema_version: 3
artifact: ticket
change: 2026-08-13-personal-quant-finance-workbench
id: T-03
title: 交付 A/HK 资产身份、自选与研究池
status: ready
planning_depth: deep
planning_depth_reason: 资产身份错误会污染行情、持仓、回测和 Agent 证据，且涉及旧代码迁移、市场歧义和私有研究上下文。
ready: true
risk: high
blocked_by: [T-02]
contract_ids: [AC-005, AC-010]
owner: implementation-owner
expected_changes: ["<Path>plugins/finance-workbench/src/assets/**</Path>", "<Path>plugins/finance-workbench/src/watchlist/**</Path>", "<Path>plugins/finance-workbench/tests/asset-identity.integration.test.ts</Path>", "<Path>plugins/finance-workbench/tests/watchlist.integration.test.ts</Path>"]
writable_paths: ["<Path>plugins/finance-workbench/src/assets/**</Path>", "<Path>plugins/finance-workbench/src/watchlist/**</Path>", "<Path>plugins/finance-workbench/tests/asset-identity.integration.test.ts</Path>", "<Path>plugins/finance-workbench/tests/watchlist.integration.test.ts</Path>"]
read_only_paths: ["<Path>plugins/finance-workbench/src/domain/**</Path>", "<Path>plugins/finance-workbench/src/data/**</Path>", "<Path>plugins/finance-workbench/manifest.json</Path>", "<Path>temp/finance-references/**</Path>"]
shared_paths: []
shared_path_owners: []
---

# Ticket T-03: 交付 A/HK 资产身份、自选与研究池

- **Ticket 文件：** `<Path>{roots.state}/specdev/changes/{change}/ticket/03-deliver-asset-identity-watchlist-and-research-pool.md</Path>`
- **总体 Map：** `<Path>{roots.state}/specdev/changes/{change}/tickets-map.md</Path>`
- **上游 Spec：** `<Path>{roots.state}/specdev/changes/{change}/spec.md</Path>`
- **完成 Evidence：** `<Path>{roots.state}/specdev/changes/{change}/evidence/T-03.md</Path>`

## 1. 战略与来源

- **目标：** 为 A 股和港股建立可确认、可迁移、可追溯的 `AssetRef`，并交付自选与研究池。
- **可观察产出：** 用户按代码/名称/市场搜索、确认资产，看到旧代码映射和冲突；可创建、排序、删除自选/研究池并查看数据集状态。
- **来源：** `US-002`、`US-004`、`AC-005`、`AC-010`、`INV-03`、`INV-05`。
- **当前事实：** 参考数据中存在 BSE 旧代码和市场标识陷阱；T-02 已提供 provider identity evidence 和 DataSnapshot 接缝。
- **Planning Depth 原因：** identity 是下游金融计算的高事故输入，迁移和去重必须可回滚、可审计。

## 2. 决策状态

### 已锁定决策

- `AssetRef` 必须含 market、规范代码、类型、币种、有效期、provider 和置信度；冲突/低置信度不进入计算。
- 旧代码只作为 mapping evidence，不能覆盖规范身份；用户确认后才保存到研究池。
- 自选和研究池是插件私有派生数据，支持跨 A/HK 混合但每个成员保留市场和 capability 状态。

### 已采用的低影响假设

- 排序默认按用户最近使用/自定义顺序，未提供价格时不自动按涨跌排序。

### 未决问题

无。

## 3. 范围边界

| IN（本 Ticket 构建） | REUSE（复用且不改变契约） | OUT（明确不做） |
|---|---|---|
| 资产搜索/确认/迁移、identity confidence、自选、研究池和空/冲突状态 | T-01 domain、T-02 provider probe/snapshot | 行情展示、组合账本、券商同步、未确认资产回测 |

## 4. 要构建什么

用户输入 `600519`、`00700` 或名称并选择 A/HK 后，系统返回候选 `AssetRef`；旧代码、重复映射或市场冲突显示证据并要求确认。确认后资产可加入自选或研究池，资产详情能显示每个数据集/provider 的状态，删除不会删除历史账本或原始资料。

## 5. 实现契约

- **入口或接缝：** asset search/resolve routes/tools、watchlist/research-pool store 和 page panels。
- **输入与输出：** 输入 query、market、asset type、候选选择、pool mutation/version；输出 `AssetRef`、mapping evidence、list item 和稳定 `identity_mismatch`/`invalid_asset`。
- **公共接口变化：** 只新增插件内资产/列表 routes/tools；复用 T-01 schema。
- **不变量：** 同一规范资产在同一列表只出现一次；低置信度不可执行；删除列表成员不级联删除账本/证据。
- **状态或数据流：** search -> candidates -> confirmed -> watchlist/research_pool；ambiguous/expired -> needs_confirmation。
- **错误与失败行为：** 空候选、跨市场同名、旧代码过期、provider 不一致均返回可行动状态，不猜测匹配。
- **兼容要求：** 后续行情/组合/量化只接收 confirmed AssetRef；旧 mapping 保留来源和有效期。
- **安全与隐私要求：** 列表只保存必要 metadata，不读取私有文件；Agent 读取列表仍受公开/私有范围限制。

## 6. 执行路线

1. 建立 identity、alias、market conflict 和 list version 的失败 fixture。
2. 实现基于 T-02 provider evidence 的候选归一化和显式确认。
3. 实现自选/研究池 CRUD、排序、去重、状态投影和资产详情入口。
4. 覆盖空、冲突、旧代码、删除/恢复上下文和跨市场混合 UI 状态。
5. 运行集成与 T-02 回归，形成迁移和不级联证据。

## 7. 路径访问契约

- **预计修改点：** `<Path>plugins/finance-workbench/src/assets/**</Path>`、`<Path>plugins/finance-workbench/src/watchlist/**</Path>`、`<Path>plugins/finance-workbench/tests/asset-identity.integration.test.ts</Path>`、`<Path>plugins/finance-workbench/tests/watchlist.integration.test.ts</Path>`。
- **可写范围：** 上述插件子路径。
- **只读上下文：** `<Path>plugins/finance-workbench/src/domain/**</Path>`、`<Path>plugins/finance-workbench/src/data/**</Path>`、`<Path>plugins/finance-workbench/manifest.json</Path>`、`<Path>temp/finance-references/**</Path>`。
- **共享路径：** 无。
- **保留或不动：** 账本、回测和宿主 registry；不得写入其他插件。

## 8. 验证矩阵

| 行为或风险 | 验证接缝 | 命令或步骤 | 预期结果 | Evidence |
|---|---|---|---|---|
| 正常路径 | identity/list integration | 搜索 A/HK 标的、确认、加入/排序/删除自选和研究池 | AssetRef 可追溯且列表状态可见 | `<Path>{roots.state}/specdev/changes/{change}/evidence/T-03.md</Path>` |
| 失败路径 | migration/conflict fixture | 输入旧代码、同名跨市场、重复和失效 provider mapping | 要求确认或返回稳定错误，不进入下游计算 | `<Path>{roots.state}/specdev/changes/{change}/evidence/T-03.md</Path>` |
| 回归 | T-02 snapshot consumer | 运行 provider/domain 集成测试 | 只消费 confirmed AssetRef，删除列表不删除数据快照 | `<Path>{roots.state}/specdev/changes/{change}/evidence/T-03.md</Path>` |
| UI E2E（owner：当前执行 owner） | asset/watchlist page | 桌面/窄屏执行搜索、确认、排序、删除 | 不重叠，冲突原因与替代路径可操作 | `<Path>{roots.state}/specdev/changes/{change}/evidence/T-03.md</Path>` |

## 9. 发布、迁移与恢复

- **迁移顺序：** 先建立规范 AssetRef/mapping，再建立列表索引；旧代码只迁移为 evidence，不覆盖历史。
- **兼容窗口：** list schema 新增字段可忽略，未知身份版本隔离；confirmed 状态不可由旧缓存自动恢复。
- **监控信号：** identity conflict、低置信度确认、旧代码命中、列表重复和删除/恢复错误。
- **回滚或前向恢复：** mapping 失败保留候选；列表 mutation 使用版本校验，失败不写，删除列表成员可重新加入。
- **不可逆操作与批准点：** 无；用户确认资产是唯一人工批准点。
- **收缩条件：** 下游没有 query/name 直连计算，全部读取 confirmed AssetRef；静态搜索和测试证明。

## 10. 验收标准

- [ ] `AC-005`、`AC-010`：资产身份、旧代码、冲突、自选和研究池行为成立。
- [ ] 验证矩阵记录到 `<Path>{roots.state}/specdev/changes/{change}/evidence/T-03.md</Path>`。
- [ ] 修改严格位于授权插件路径，Ticket/Map/Evidence 状态一致。
