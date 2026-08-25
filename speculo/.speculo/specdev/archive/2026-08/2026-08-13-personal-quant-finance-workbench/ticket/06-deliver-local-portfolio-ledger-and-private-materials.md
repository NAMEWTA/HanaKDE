---
schema_version: 3
artifact: ticket
change: 2026-08-13-personal-quant-finance-workbench
id: T-06
title: 交付本地组合持仓账本与私有资料
status: done
planning_depth: deep
planning_depth_reason: 涉及个人持仓、成本/P&L、隐私、ResourceIO 和版本化账本迁移，虽不连接券商但仍有高事故数据完整性风险。
ready: true
risk: critical
blocked_by: [T-05]
contract_ids: [AC-011, AC-012, AC-013, AC-014, AC-015]
owner: root
expected_changes: ["<Path>plugins/finance-workbench/src/portfolio/**</Path>", "<Path>plugins/finance-workbench/src/private-materials/**</Path>", "<Path>plugins/finance-workbench/routes/portfolio.*</Path>", "<Path>plugins/finance-workbench/tests/portfolio.integration.test.ts</Path>", "<Path>plugins/finance-workbench/tests/private-materials.integration.test.ts</Path>"]
writable_paths: ["<Path>plugins/finance-workbench/src/portfolio/**</Path>", "<Path>plugins/finance-workbench/src/private-materials/**</Path>", "<Path>plugins/finance-workbench/routes/portfolio.*</Path>", "<Path>plugins/finance-workbench/tests/portfolio.integration.test.ts</Path>", "<Path>plugins/finance-workbench/tests/private-materials.integration.test.ts</Path>"]
read_only_paths: ["<Path>plugins/finance-workbench/src/domain/**</Path>", "<Path>plugins/finance-workbench/src/data/**</Path>", "<Path>plugins/finance-workbench/src/assets/**</Path>", "<Path>plugins/finance-workbench/src/research-data/**</Path>", "<Path>temp/finance-references/Vibe-Research/**</Path>", "<Path>PLUGIN_SDK.md</Path>"]
shared_paths: []
shared_path_owners: []
---

# Ticket T-06: 交付本地组合持仓账本与私有资料

- **Ticket 文件：** `<Path>{roots.state}/specdev/changes/{change}/ticket/06-deliver-local-portfolio-ledger-and-private-materials.md</Path>`
- **总体 Map：** `<Path>{roots.state}/specdev/changes/{change}/tickets-map.md</Path>`
- **上游 Spec：** `<Path>{roots.state}/specdev/changes/{change}/spec.md</Path>`
- **完成 Evidence：** `<Path>{roots.state}/specdev/changes/{change}/evidence/T-06.md</Path>`

## 1. 战略与来源

- **目标：** 提供本地手工/文件导入的持仓账本、成本、股数、费用、币种、P&L、笔记和私有研报引用。
- **可观察产出：** 用户预览并提交导入、编辑账本，看到估值时刻/行情新鲜度下的已实现与未实现 P&L；私有资料通过 ResourceIO 管理，插件不创建券商连接。
- **来源：** `US-007`～`US-009`、`AC-011`～`AC-015`、`ADR-002`、`DEC-006`、`INV-02`、`INV-06`。
- **当前事实：** 参考项目有 local portfolio/watchlist/report 经验，但 Hana 的原始文件、私有索引和授权必须由 ResourceIO/插件 dataDir 分离。
- **Planning Depth 原因：** 个人数据、版本化账本、成本和 P&L 具有隐私及不可静默重算风险。

## 2. 决策状态

### 已锁定决策

- 账本只接手工事件和 CSV/JSON/Parquet 导入；无 broker credential、自动同步、订单或资金动作。
- 原始文件走 `ctx.resources`，派生账本/索引走 `ctx.dataDir`；浏览器不直接读本地路径。
- 缺价格/汇率/费用或单位时返回 partial/stale，禁止静默归零；已实现/未实现 P&L 分开。

### 已采用的低影响假设

- 账本事件以用户提供的交易日期和结算语义为准；不猜测券商成交明细或税费。

### 未决问题

无。

## 3. 范围边界

| IN（本 Ticket 构建） | REUSE（复用且不改变契约） | OUT（明确不做） |
|---|---|---|
| ledger、import preview/commit、cost/P&L、notes/private refs、ResourceIO routes/UI | T-03 AssetRef、T-04 DataSnapshot、T-05 EvidenceRef、Hana ResourceIO/secret | broker sync、orders、funds、自动仓位变更、Agent 外发确认实现 |

## 4. 要构建什么

用户选择文件或逐项输入账本事件，先看到字段映射、币种、重复/错误行和估值假设，再提交版本化账本。组合页按确认 AssetRef 加载行情，显示成本、股数、费用、汇率、估值时刻和 P&L 状态。笔记/私有研报引用可通过 ResourceIO 选择、打开、索引和撤销；拒绝权限不会泄露或写入。

## 5. 实现契约

- **入口或接缝：** portfolio routes/tools/page、import parser、ledger store、ResourceIO ref index。
- **输入与输出：** 输入 ledger event/import ResourceRef/note ref、expectedVersion；输出 preview、validation errors、PortfolioSnapshot、private EvidenceRef 或 `permission_denied`/`invalid_import`。
- **公共接口变化：** 仅插件内账本和私有资料 API；不改变 ResourceIO 公共接口。
- **不变量：** 提交前不写；无效行不进入账本；版本冲突不覆盖；P&L 的价格、汇率、费用和 stale 状态可追溯；原文不复制到日志/模型。
- **状态或数据流：** select/read -> parse -> preview -> user commit -> ledger version -> snapshot/P&L -> index/reference。
- **错误与失败行为：** schema/market/currency/date/duplicate/permission/price/fx/fee 错误可分类并保留原账本。
- **兼容要求：** ledger schema envelope/version migration 显式；未知字段隔离，不静默改历史 P&L。
- **安全与隐私要求：** ResourceIO 访问最小化、secret 不写入插件；任何模型读取由 T-10 Agent consent 决定。

## 6. 执行路线

1. 建立导入 parser、成本/P&L 和权限拒绝 fixture，先证明错误不写。
2. 建立版本化 ledger store、手工编辑和 preview/commit 流程。
3. 接入 T-03/T-04/T-05 的身份、行情和证据，计算 P&L 与缺口状态。
4. 接入 ResourceIO 私有 ref、笔记索引、删除/撤销和导出前字段预览。
5. 运行隐私扫描、重启/版本迁移、UI 和前序回归。

## 7. 路径访问契约

- **预计修改点：** `<Path>plugins/finance-workbench/src/portfolio/**</Path>`、`<Path>plugins/finance-workbench/src/private-materials/**</Path>`、`<Path>plugins/finance-workbench/routes/portfolio.*</Path>`、`<Path>plugins/finance-workbench/tests/portfolio.integration.test.ts</Path>`、`<Path>plugins/finance-workbench/tests/private-materials.integration.test.ts</Path>`。
- **可写范围：** 上述插件子路径。
- **只读上下文：** `<Path>plugins/finance-workbench/src/domain/**</Path>`、`<Path>plugins/finance-workbench/src/data/**</Path>`、`<Path>plugins/finance-workbench/src/assets/**</Path>`、`<Path>plugins/finance-workbench/src/research-data/**</Path>`、`<Path>temp/finance-references/Vibe-Research/**</Path>`、`<Path>PLUGIN_SDK.md</Path>`。
- **共享路径：** 无。
- **保留或不动：** 用户原文件由 ResourceIO owner 管理；不写宿主数据库/工作区绝对路径。

## 8. 验证矩阵

| 行为或风险 | 验证接缝 | 命令或步骤 | 预期结果 | Evidence |
|---|---|---|---|---|
| 正常路径 | ledger/ResourceIO integration | 预览并提交手工和 CSV/JSON/Parquet 账本，计算 P&L，打开私有引用 | 版本、成本、股数、费用、币种和引用可追溯 | `<Path>{roots.state}/specdev/changes/{change}/evidence/T-06.md</Path>` |
| 失败路径 | parser/permission/fx fixture | 注入坏行、重复、版本冲突、缺价格/汇率、ResourceIO deny、secret | 不写入/partial/stale/permission_denied，正文不外发 | `<Path>{roots.state}/specdev/changes/{change}/evidence/T-06.md</Path>` |
| 回归 | T-03/T-04/T-05 integration | 运行身份、行情、证据测试 | 账本只接受 confirmed AssetRef 和 DataSnapshot | `<Path>{roots.state}/specdev/changes/{change}/evidence/T-06.md</Path>` |
| UI E2E（owner：Lead） | portfolio/import/materials page | 桌面/窄屏完成预览、拒绝、提交和撤销引用 | 字段不溢出，隐私状态清晰且可恢复 | `<Path>{roots.state}/specdev/changes/{change}/evidence/T-06.md</Path>` |

- **Workspace checks（current-workspace）：** implementation owner 在 current workspace 运行 ledger、P&L、导入 parser、ResourceIO/permission、缺价格/汇率和隐私回归 fixture、类型检查及插件构建，不创建 source worktree。
- **E2E disposition：** required：导入预览/提交、私有文件授权、账本持久化和 P&L 展示跨越文件、权限、存储、行情与 UI 边界，涉及个人金融数据完整性和隐私。
- **E2E owner/environment：** Lead / current-workspace；在 direct-parent 状态于桌面/窄屏执行手工与文件导入、拒绝坏行、确认提交、缺价/汇率降级、打开及撤销私有引用，预期无未确认写入、无正文外发且 P&L 状态可追溯。
- **Integration evidence（direct-parent）：** 记录 implementation commit、parent before SHA、隔离测试文件与授权场景、E2E/隐私结果、父分支 result SHA 及包含关系。

## 9. 发布、迁移与恢复

- **迁移顺序：** 先建立 ledger envelope 和 preview，后启用 commit/P&L；旧/未知 schema 只读隔离。
- **兼容窗口：** ledger version、currency、cost basis 和 event type 显式；不静默重算历史。
- **监控信号：** import reject/commit、version conflict、P&L partial/stale、ResourceIO deny、private index deletion 和 secret redaction。
- **回滚或前向恢复：** preview/commit 事务失败保持旧账本；派生 P&L 可从账本+snapshot 重建；原文件删除由 ResourceIO 恢复流程负责。
- **不可逆操作与批准点：** 删除私有索引/引用需用户确认；不删除原始文件，不接交易批准。
- **收缩条件：** 无 route/tool 接受绝对本地路径或 broker token；静态扫描和 ResourceIO 测试证明。

## 10. 验收标准

- [x] `AC-011`～`AC-015`：导入、账本、P&L、私有资料和隐私边界成立。
- [x] 无券商/订单/资金工具，所有失败保持原数据不变。
- [x] 验证矩阵记录到 `<Path>{roots.state}/specdev/changes/{change}/evidence/T-06.md</Path>`。
