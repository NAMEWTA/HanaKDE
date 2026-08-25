---
schema_version: 3
artifact: ticket
change: 2026-08-13-personal-quant-finance-workbench
id: T-05
title: 交付财务估值公告研报新闻与证据底稿
status: done
planning_depth: deep
planning_depth_reason: 涉及跨市场数据语义、PIT/覆盖区间、原文引用和金融结论可追溯性，缺证据时必须降级或阻断。
ready: true
risk: high
blocked_by: [T-04]
contract_ids: [AC-009]
owner: root
expected_changes: ["<Path>plugins/finance-workbench/src/research-data/**</Path>", "<Path>plugins/finance-workbench/src/evidence/**</Path>", "<Path>plugins/finance-workbench/routes/research-data.*</Path>", "<Path>plugins/finance-workbench/tests/research-data.integration.test.ts</Path>", "<Path>plugins/finance-workbench/tests/evidence.integration.test.ts</Path>"]
writable_paths: ["<Path>plugins/finance-workbench/src/research-data/**</Path>", "<Path>plugins/finance-workbench/src/evidence/**</Path>", "<Path>plugins/finance-workbench/routes/research-data.*</Path>", "<Path>plugins/finance-workbench/tests/research-data.integration.test.ts</Path>", "<Path>plugins/finance-workbench/tests/evidence.integration.test.ts</Path>"]
read_only_paths: ["<Path>plugins/finance-workbench/src/domain/**</Path>", "<Path>plugins/finance-workbench/src/data/**</Path>", "<Path>plugins/finance-workbench/src/assets/**</Path>", "<Path>plugins/finance-workbench/src/quotes/**</Path>", "<Path>temp/finance-references/Vibe-Research/**</Path>", "<Path>temp/finance-references/TradingAgents-astock/**</Path>"]
shared_paths: []
shared_path_owners: []
---

# Ticket T-05: 交付财务估值公告研报新闻与证据底稿

- **Ticket 文件：** `<Path>{roots.state}/specdev/changes/{change}/ticket/05-deliver-financials-filings-news-and-evidence.md</Path>`
- **总体 Map：** `<Path>{roots.state}/specdev/changes/{change}/tickets-map.md</Path>`
- **上游 Spec：** `<Path>{roots.state}/specdev/changes/{change}/spec.md</Path>`
- **完成 Evidence：** `<Path>{roots.state}/specdev/changes/{change}/evidence/T-05.md</Path>`

## 1. 战略与来源

- **目标：** 把财务指标、估值、公告、研报和新闻组织为可追溯的证据级研究底稿。
- **可观察产出：** 用户能按资产和日期查看数据集、覆盖区间、取得时间、原文/ResourceIO 引用、内容 hash、PIT 和质量状态；缺证据时页面明确 partial/unavailable。
- **来源：** `US-005`、`AC-009`、`INV-02`、`INV-04`、`ADR-001`。
- **当前事实：** Vibe Research 强调 A/HK 数据不对称、本地 watchlist/reports；TradingAgents 以 curr_date 和有限研究阶段约束证据；本票不复制其未经核验数据接口。
- **Planning Depth 原因：** PIT、引用、原文和单位错误会污染 Agent、筛选和回测，属于高事故数据完整性风险。

## 2. 决策状态

### 已锁定决策

- 每条研究数据必须携带 `EvidenceRef`、取得/适用时间、来源 provider 或 ResourceIO ref、schema/quality 状态。
- 财务/估值缺 PIT、币种/单位、覆盖期或原文证据时只能 partial/experimental/unavailable，不得显示确定性结论。
- 私有研报正文不进入插件索引以外的 provider/model；原文由 ResourceIO 管理。

### 已采用的低影响假设

- 估值指标按 provider capability 可用字段呈现，不在缺统一口径时自动跨市场比较。

### 未决问题

无。

## 3. 范围边界

| IN（本 Ticket 构建） | REUSE（复用且不改变契约） | OUT（明确不做） |
|---|---|---|
| 财务/估值/公告/研报/新闻查询、EvidenceRef、dossier 和缺口状态 | T-02 DataSnapshot/provider、T-03 AssetRef、T-04 observedAt | Agent 外发、回测因子、券商研究终端、投资建议 |

## 4. 要构建什么

用户从资产页进入 dossier，选择财务、估值、公告、研报或新闻数据集。系统先显示 capability，再展示带来源和时间的记录；点击原文通过 ResourceIO/外链打开。无 PIT、原文、覆盖区间或单位时仍可查看已知字段，但结论区域标注缺口并禁止下游把它当可信事实。

## 5. 实现契约

- **入口或接缝：** research-data routes/tools、dossier page、EvidenceRef resolver 和 ResourceIO ref adapter。
- **输入与输出：** 输入 AssetRef、dataset、date/PIT、fields、query；输出研究记录、EvidenceRef、coverage/quality 状态或 `pit_unavailable`/`license_blocked`/`partial_data`。
- **公共接口变化：** 插件内 dossier/record schema；宿主 ResourceIO 公共契约不变。
- **不变量：** EvidenceRef 能回到原始来源和 hash；适用时间与取得时间分离；私有正文不复制到普通日志/模型 payload。
- **状态或数据流：** capability -> request -> normalize -> evidence attach -> dossier index -> UI/export。
- **错误与失败行为：** 原文失效、provider 断开、字段缺失和时点未知显示可解释状态，不生成空白事实。
- **兼容要求：** 统一 `DataSnapshot`/`EvidenceRef` 版本，旧引用失效时保留记录但标 blocked。
- **安全与隐私要求：** ResourceIO 权限失败不重试绕过；私有引用逐次授权给 Agent。

## 6. 执行路线

1. 以 A/HK fixture 建立 PIT、覆盖期、单位、原文丢失和私有 ref 的失败测试。
2. 实现研究数据 normalize、EvidenceRef attach 和 dossier index。
3. 接通 dossier 页面、原文打开和 capability/缺口展示。
4. 运行来源 hash、隐私扫描、T-02/T-03/T-04 回归并记录证据。

## 7. 路径访问契约

- **预计修改点：** `<Path>plugins/finance-workbench/src/research-data/**</Path>`、`<Path>plugins/finance-workbench/src/evidence/**</Path>`、`<Path>plugins/finance-workbench/routes/research-data.*</Path>`、`<Path>plugins/finance-workbench/tests/research-data.integration.test.ts</Path>`、`<Path>plugins/finance-workbench/tests/evidence.integration.test.ts</Path>`。
- **可写范围：** 上述插件子路径。
- **只读上下文：** `<Path>plugins/finance-workbench/src/domain/**</Path>`、`<Path>plugins/finance-workbench/src/data/**</Path>`、`<Path>plugins/finance-workbench/src/assets/**</Path>`、`<Path>plugins/finance-workbench/src/quotes/**</Path>`、`<Path>temp/finance-references/Vibe-Research/**</Path>`、`<Path>temp/finance-references/TradingAgents-astock/**</Path>`。
- **共享路径：** 无。
- **保留或不动：** provider raw adapters、组合账本、Agent runtime。

## 8. 验证矩阵

| 行为或风险 | 验证接缝 | 命令或步骤 | 预期结果 | Evidence |
|---|---|---|---|---|
| 正常路径 | dossier/evidence integration | 查询 A/HK 财务、公告、研报、新闻 fixture | 每条记录有来源、时间、hash、coverage 和质量状态 | `<Path>{roots.state}/specdev/changes/{change}/evidence/T-05.md</Path>` |
| 失败路径 | PIT/license/source fault | 删除原文、缺 PIT/单位、ResourceIO deny | partial/blocked，不能输出确定性结论或泄露正文 | `<Path>{roots.state}/specdev/changes/{change}/evidence/T-05.md</Path>` |
| 回归 | T-02 snapshot/T-03 identity | 运行共享数据合同测试 | EvidenceRef 与 AssetRef 版本兼容 | `<Path>{roots.state}/specdev/changes/{change}/evidence/T-05.md</Path>` |
| UI E2E（owner：Lead） | dossier page | 桌面/窄屏打开记录、原文和缺口 | 状态、引用和替代路径可操作 | `<Path>{roots.state}/specdev/changes/{change}/evidence/T-05.md</Path>` |

- **Workspace checks（current-workspace）：** implementation owner 在 current workspace 运行 dossier/EvidenceRef、PIT/license/source fault fixture、ResourceIO 拒绝、脱敏、类型检查和插件构建，不创建 source worktree。
- **E2E disposition：** required：财务与内容记录从 provider/ResourceIO 进入 dossier UI 并打开原始证据，跨越外部来源、权限和浏览器边界，必须证明缺证据不会冒充确定性事实。
- **E2E owner/environment：** Lead / current-workspace；在 direct-parent 状态于桌面/窄屏查询记录、打开/拒绝原文并模拟缺 PIT、缺许可和引用失效，预期 EvidenceRef、coverage、时间与 partial/blocked 状态一致且私有正文不泄露。
- **Integration evidence（direct-parent）：** 记录 implementation commit、parent before SHA、ResourceIO/provider 场景、E2E 结果与脱敏核对、父分支 result SHA 及包含关系。

## 9. 发布、迁移与恢复

- **迁移顺序：** 先建立 evidence index，再接 dossier UI；失效引用保留 metadata 并标 blocked。
- **兼容窗口：** EvidenceRef schema 版本化，旧记录只读；新字段缺失时 partial。
- **监控信号：** provider coverage、PIT rejection、source hash mismatch、ResourceIO deny 和外链失效。
- **回滚或前向恢复：** 索引可重建，原文不在插件私有目录；provider 失败走导入/替代路径。
- **不可逆操作与批准点：** 删除私有引用需用户确认，原文删除由 ResourceIO owner 负责。
- **收缩条件：** 所有研究/Agent/回测输出均引用 EvidenceRef，不再接受裸字符串来源。

## 10. 验收标准

- [x] `AC-009`：研究底稿和证据引用可追溯，缺口状态不会伪装为事实。
- [x] 验证矩阵记录到 `<Path>{roots.state}/specdev/changes/{change}/evidence/T-05.md</Path>`。
- [x] 修改严格位于授权插件路径。
