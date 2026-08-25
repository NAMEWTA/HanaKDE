---
schema_version: 3
artifact: ticket
change: 2026-08-13-personal-quant-finance-workbench
id: T-11
title: 交付导入导出与金融工作台诊断审计
status: done
planning_depth: deep
planning_depth_reason: 涉及用户文件、SessionFile、隐私字段、schema 版本、运行审计和故障排查，是跨模块发布与安全收口。
ready: true
risk: high
blocked_by: [T-10, T-06]
contract_ids: [AC-014, AC-015, AC-030, AC-033, AC-038]
owner: root
expected_changes: ["<Path>plugins/finance-workbench/src/exchange/**</Path>", "<Path>plugins/finance-workbench/src/diagnostics/**</Path>", "<Path>plugins/finance-workbench/routes/exchange.*</Path>", "<Path>plugins/finance-workbench/routes/diagnostics.*</Path>", "<Path>plugins/finance-workbench/tests/exchange-diagnostics.integration.test.ts</Path>"]
writable_paths: ["<Path>plugins/finance-workbench/src/exchange/**</Path>", "<Path>plugins/finance-workbench/src/diagnostics/**</Path>", "<Path>plugins/finance-workbench/routes/exchange.*</Path>", "<Path>plugins/finance-workbench/routes/diagnostics.*</Path>", "<Path>plugins/finance-workbench/tests/exchange-diagnostics.integration.test.ts</Path>"]
read_only_paths: ["<Path>plugins/finance-workbench/manifest.json</Path>", "<Path>plugins/finance-workbench/src/domain/**</Path>", "<Path>plugins/finance-workbench/src/portfolio/**</Path>", "<Path>plugins/finance-workbench/src/agent/**</Path>", "<Path>plugins/finance-workbench/src/automation/**</Path>", "<Path>plugins/finance-workbench/src/research-data/**</Path>", "<Path>PLUGIN_SDK.md</Path>", "<Path>PLUGINS.md</Path>"]
shared_paths: []
shared_path_owners: []
---

# Ticket T-11: 交付导入导出与金融工作台诊断审计

- **Ticket 文件：** `<Path>{roots.state}/specdev/changes/{change}/ticket/11-deliver-import-export-and-diagnostics.md</Path>`
- **总体 Map：** `<Path>{roots.state}/specdev/changes/{change}/tickets-map.md</Path>`
- **上游 Spec：** `<Path>{roots.state}/specdev/changes/{change}/spec.md</Path>`
- **完成 Evidence：** `<Path>{roots.state}/specdev/changes/{change}/evidence/T-11.md</Path>`

## 1. 战略与来源

- **目标：** 提供 CSV/JSON/Parquet/ResourceIO/SessionFile 的显式导入导出，并让用户能按 requestId/runId 检索脱敏诊断、质量和授权审计。
- **可观察产出：** 导入先 preview 后 commit；导出前显示目标和字段范围；诊断页解释 provider、SourcePolicy/SourceDecision、RunSourceManifest、本地同步、任务、回测、Agent 和权限为何可用/不可用。
- **来源：** `US-006`、`US-018`～`US-021`、`AC-014`、`AC-015`、`AC-030`、`AC-033`、`AC-038`、`ADR-002`、`ADR-005`、`ADR-006`。
- **当前事实：** Hana 有 ResourceIO、SessionFile、plugin diagnostics 和 `stageFile()` 约束；用户要求个人资料和结果可带来源导出。
- **Planning Depth 原因：** 导出/隐私/审计跨越全模块且可能泄露个人数据，需要 schema、脱敏、回滚和发布检查。

## 2. 决策状态

### 已锁定决策

- 原始用户资源使用 ResourceIO，插件生成文件使用 `stageFile()`/SessionFile；浏览器不使用绝对本地路径。
- 导入必须 preview/validate/commit；失败行、schema、来源、quality 和 privacy 标记保留，默认不触发后台任务。
- 诊断日志脱敏，不记录 secret、私有正文或完整模型 prompt；export target、fields、consent 和 quality 可审计。
- capability probe、SourcePolicy、SourceDecision、RunSourceManifest、本地同步状态和候选排除原因可诊断/导出；BYOK 原值和未授权原始数据永不出现。

### 已采用的低影响假设

- 首版导出优先结构化 JSON/CSV/Markdown 和 SessionFile，Parquet 作为合法 provider/运行时可用时的格式状态。

### 未决问题

无。

## 3. 范围边界

| IN（本 Ticket 构建） | REUSE（复用且不改变契约） | OUT（明确不做） |
|---|---|---|
| import preview/commit、export manifest、SessionFile/ResourceIO delivery、diagnostics/audit UI/routes | T-01 errors、T-06 ledger、T-09 tasks、T-10 consent、Hana ResourceIO/SessionFile/diagnostics | 宿主文件系统 API、自动上传、外部发布、secret 导出 |

## 4. 要构建什么

用户在导入页选择文件或 ResourceRef，系统展示字段映射、错误、市场/币种、重复行和隐私范围；确认后写入插件私有数据或 ResourceIO。用户从任何模块点击导出，选择 SessionFile/ResourceIO 目标和字段，获得带 schema、来源、SourceDecision/RunSourceManifest、质量、隐私标记的文件。诊断页可按 requestId/runId 查看脱敏事件、错误、provider/source kind、能力探测、选源/排除原因、本地同步、任务、授权和恢复建议。

## 5. 实现契约

- **入口或接缝：** exchange/diagnostics routes/tools/page、parser registry、export serializer、audit query。
- **输入与输出：** 输入 ResourceRef/file format/field mapping/commit token/export target/field scope；输出 preview/commit result、SessionFile ref、diagnostic events 或稳定错误。
- **公共接口变化：** 插件内 exchange/audit schema；ResourceIO/SessionFile 使用宿主既有契约。
- **不变量：** preview 无副作用；commit 幂等/版本校验；export 不泄露未批准字段/secret；诊断可检索且脱敏。
- **状态或数据流：** select -> read -> preview -> approve -> commit/index；query -> redact/filter -> diagnostics; export -> stageFile/resource write -> audit。
- **错误与失败行为：** 格式/schema/permission/target/version/size 错误可分类；失败不产生半文件或隐藏写入。
- **兼容要求：** exchange/audit schema versioned；未知格式或字段 blocked/unavailable；SessionFile 只用稳定 ref。
- **安全与隐私要求：** 外发/写文件复用 ConsentRecord；ResourceIO write 权限最小化；日志和错误脱敏。

## 6. 执行路线

1. 为 preview/commit、导出拒绝、secret/private redaction、坏格式和 ResourceIO deny 建立测试。
2. 实现 parser/serializer registry、schema/version、preview token 和幂等 commit。
3. 接入 ResourceIO/SessionFile delivery、字段级导出确认和审计事件。
4. 实现 diagnostics 查询/筛选/质量解释/恢复建议和 UI。
5. 运行全模块审计、隐私扫描、T-06/T-09/T-10 回归。

## 7. 路径访问契约

- **预计修改点：** `<Path>plugins/finance-workbench/src/exchange/**</Path>`、`<Path>plugins/finance-workbench/src/diagnostics/**</Path>`、`<Path>plugins/finance-workbench/routes/exchange.*</Path>`、`<Path>plugins/finance-workbench/routes/diagnostics.*</Path>`、`<Path>plugins/finance-workbench/tests/exchange-diagnostics.integration.test.ts</Path>`。
- **可写范围：** 上述插件子路径。
- **只读上下文：** `<Path>plugins/finance-workbench/manifest.json</Path>`、`<Path>plugins/finance-workbench/src/domain/**</Path>`、`<Path>plugins/finance-workbench/src/portfolio/**</Path>`、`<Path>plugins/finance-workbench/src/agent/**</Path>`、`<Path>plugins/finance-workbench/src/automation/**</Path>`、`<Path>plugins/finance-workbench/src/research-data/**</Path>`、`<Path>PLUGIN_SDK.md</Path>`、`<Path>PLUGINS.md</Path>`。
- **共享路径：** 无。
- **保留或不动：** 根导出脚本、宿主文件系统和远程发布渠道。

## 8. 验证矩阵

| 行为或风险 | 验证接缝 | 命令或步骤 | 预期结果 | Evidence |
|---|---|---|---|---|
| 正常路径 | exchange/ResourceIO integration | preview/commit CSV/JSON/Parquet，导出 SessionFile/ResourceIO 与 RunSourceManifest，查询来源诊断 | 映射、schema、SourceDecision/manifest、质量、隐私和 audit 完整 | `<Path>{roots.state}/specdev/changes/{change}/evidence/T-11.md</Path>` |
| 失败路径 | parser/redaction/permission fixture | 坏格式、版本/lineage 冲突、未授权字段、BYOK/secret/private正文、写入失败 | 失败可解释、无部分文件、无敏感值泄露或后台副作用 | `<Path>{roots.state}/specdev/changes/{change}/evidence/T-11.md</Path>` |
| 回归 | T-06/T-09/T-10 | 运行账本、任务、consent 和工具 catalog 测试 | export/diagnostics 不改变账本、任务或授权语义 | `<Path>{roots.state}/specdev/changes/{change}/evidence/T-11.md</Path>` |
| UI E2E（owner：Lead） | exchange/diagnostics page | 桌面/窄屏 preview、导出、筛选 requestId/runId | 目标/字段/状态可见且不重叠 | `<Path>{roots.state}/specdev/changes/{change}/evidence/T-11.md</Path>` |

- **Workspace checks（current-workspace）：** implementation owner 在 current workspace 运行 parser/schema、preview/commit 原子性、SessionFile/ResourceIO、诊断查询、脱敏/权限 fault fixture、类型检查和插件构建，不创建 source worktree。
- **E2E disposition：** required：导入导出和诊断跨越用户文件、ResourceIO/SessionFile、插件存储、权限与 UI，必须证明失败不会留下部分文件或泄露 secret/私有正文。
- **E2E owner/environment：** Lead / current-workspace；在 direct-parent 状态用隔离文件执行 preview/commit、导出目标确认、写入失败和 requestId/runId 检索，预期字段范围/质量/隐私可见、写入原子且日志脱敏。
- **Integration evidence（direct-parent）：** 记录 implementation commit、parent before SHA、隔离文件与权限环境、E2E/脱敏结果、父分支 result SHA 及包含关系。

## 9. 发布、迁移与恢复

- **迁移顺序：** 先 parser/serializer/audit schema，再 ResourceIO/SessionFile，最后 UI。
- **兼容窗口：** exchange/audit schema versioned；未知结果只读隔离，不自动覆盖旧导出。
- **监控信号：** preview/commit、export target、redaction、permission deny、partial file cleanup、diagnostic query latency。
- **回滚或前向恢复：** commit/export 使用临时插件数据和原子 rename/ResourceIO expectedVersion；失败清理临时文件并保留 audit。
- **不可逆操作与批准点：** 导出到用户资源/模型外发前确认字段；原始文件不自动删除。
- **收缩条件：** 所有用户可见导入导出都经过本票 registry/audit，静态扫描无绝对路径和 secret。

## 10. 验收标准

- [x] `AC-014`、`AC-015`、`AC-030`、`AC-033`、`AC-038`：导入导出、来源清单、选源/本地同步诊断、脱敏审计和结构化错误可检索。
- [x] 验证矩阵记录到 `<Path>{roots.state}/specdev/changes/{change}/evidence/T-11.md</Path>`。
