---
schema_version: 3
artifact: ticket
change: 2026-08-13-personal-quant-finance-workbench
id: T-07
title: 交付筛选因子与策略定义工作流
status: done
planning_depth: deep
planning_depth_reason: 涉及声明式公共 schema、字段时点/单位校验和量化计算前置门，错误定义会扩散到回测、监控和 Agent。
ready: true
risk: high
blocked_by: [T-05]
contract_ids: [AC-016]
owner: root
expected_changes: ["<Path>plugins/finance-workbench/src/quant/screener/**</Path>", "<Path>plugins/finance-workbench/src/quant/strategy/**</Path>", "<Path>plugins/finance-workbench/routes/quant-definition.*</Path>", "<Path>plugins/finance-workbench/tests/quant-definition.integration.test.ts</Path>"]
writable_paths: ["<Path>plugins/finance-workbench/src/quant/screener/**</Path>", "<Path>plugins/finance-workbench/src/quant/strategy/**</Path>", "<Path>plugins/finance-workbench/routes/quant-definition.*</Path>", "<Path>plugins/finance-workbench/tests/quant-definition.integration.test.ts</Path>"]
read_only_paths: ["<Path>plugins/finance-workbench/src/domain/**</Path>", "<Path>plugins/finance-workbench/src/assets/**</Path>", "<Path>plugins/finance-workbench/src/data/**</Path>", "<Path>plugins/finance-workbench/src/research-data/**</Path>", "<Path>temp/finance-references/tickflow-stock-panel/**</Path>", "<Path>temp/finance-references/TradingAgents-astock/**</Path>"]
shared_paths: []
shared_path_owners: []
---

# Ticket T-07: 交付筛选因子与策略定义工作流

- **Ticket 文件：** `<Path>{roots.state}/specdev/changes/{change}/ticket/07-deliver-screening-factors-and-strategy-definitions.md</Path>`
- **总体 Map：** `<Path>{roots.state}/specdev/changes/{change}/tickets-map.md</Path>`
- **上游 Spec：** `<Path>{roots.state}/specdev/changes/{change}/spec.md</Path>`
- **完成 Evidence：** `<Path>{roots.state}/specdev/changes/{change}/evidence/T-07.md</Path>`

## 1. 战略与来源

- **目标：** 让用户用声明式字段、条件、因子、权重和再平衡规则构建可保存、可解释、可版本化的筛选和策略定义。
- **可观察产出：** 用户能预览 Universe、字段来源、缺失处理、单位和时点，并保存策略版本；非法或未知输入被阻断。
- **来源：** `US-010`、`AC-016`、`ADR-001`、`INV-01`、`INV-06`。
- **当前事实：** TickFlow 有规则与成本模型，参考量化项目不能替代 Hana 的 schema/quality contract；本票只定义策略，不执行回测。
- **Planning Depth 原因：** 策略 schema 是回测、监控和 Agent 的共享输入，且时间旅行/单位错误有金融风险。

## 2. 决策状态

### 已锁定决策

- `StrategyDefinition` 必须包含 Universe、字段/因子、表达式版本、缺失处理、权重、再平衡、交易规则引用、费用/滑点和禁用 look-ahead 的时点约束。
- 只能引用已确认 AssetRef、已通过 capability 的字段和有 EvidenceRef 的研究数据。
- 结果是研究定义/候选集合，不构成交易信号或投资建议。

### 已采用的低影响假设

- 初版表达式采用 JSON AST/有限运算符 allowlist，不提供任意代码执行。

### 未决问题

无。

## 3. 范围边界

| IN（本 Ticket 构建） | REUSE（复用且不改变契约） | OUT（明确不做） |
|---|---|---|
| screener/factor/strategy schema、编辑器、preview、版本和校验 | T-01 domain、T-03 AssetRef、T-05 research EvidenceRef | 回测执行、下单、任意 Python/JS 执行、模型自动改策略 |

## 4. 要构建什么

用户选择 A/HK Universe，加入市值、财务、估值、价格或自定义字段条件，预览候选数量和缺失原因；用户可组成因子和权重、设置再平衡并保存策略版本。执行前如果字段单位、PIT、市场规则或身份不满足，UI 显示具体门禁并不提交执行请求。

## 5. 实现契约

- **入口或接缝：** quant definition routes/tools、JSON AST validator、strategy store、screener preview page。
- **输入与输出：** 输入 versioned StrategyDefinition/filters/factors/universe；输出 normalized definition、candidate preview、validation diagnostics 或 `invalid_definition`/`unit_mismatch`。
- **公共接口变化：** 插件私有 definition schema；回测票据只读取版本化定义。
- **不变量：** AST 只含 allowlist；字段 market/type/unit/PIT 与定义一致；版本不可静默修改；无未来字段访问。
- **状态或数据流：** draft -> validate -> preview -> saved version -> executable/blocked。
- **错误与失败行为：** 未知字段、空 Universe、单位不符、循环引用、非法权重和时间旅行均可定位到字段/节点。
- **兼容要求：** definition schema versioned，旧版本只读或显式迁移。
- **安全与隐私要求：** 不执行任意代码，不读取私有资料，不调用模型改变定义。

## 6. 执行路线

1. 为非法 AST、未来字段、单位冲突、空 Universe 和权重错误建立测试。
2. 实现 schema/AST validator、版本化 store 和 canonical serialization。
3. 实现筛选/因子/策略编辑与 preview，显示字段证据和缺失处理。
4. 接入 AssetRef/DataSnapshot/EvidenceRef 校验，并运行量化定义回归。

## 7. 路径访问契约

- **预计修改点：** `<Path>plugins/finance-workbench/src/quant/screener/**</Path>`、`<Path>plugins/finance-workbench/src/quant/strategy/**</Path>`、`<Path>plugins/finance-workbench/routes/quant-definition.*</Path>`、`<Path>plugins/finance-workbench/tests/quant-definition.integration.test.ts</Path>`。
- **可写范围：** 上述插件子路径。
- **只读上下文：** `<Path>plugins/finance-workbench/src/domain/**</Path>`、`<Path>plugins/finance-workbench/src/assets/**</Path>`、`<Path>plugins/finance-workbench/src/data/**</Path>`、`<Path>plugins/finance-workbench/src/research-data/**</Path>`、`<Path>temp/finance-references/tickflow-stock-panel/**</Path>`、`<Path>temp/finance-references/TradingAgents-astock/**</Path>`。
- **共享路径：** 无。
- **保留或不动：** 回测 engine、monitor rule 和宿主执行器。

## 8. 验证矩阵

| 行为或风险 | 验证接缝 | 命令或步骤 | 预期结果 | Evidence |
|---|---|---|---|---|
| 正常路径 | AST/definition integration | 创建 A/HK 筛选、因子、权重、再平衡并保存版本 | 预览候选和来源可解释，定义可被回测消费 | `<Path>{roots.state}/specdev/changes/{change}/evidence/T-07.md</Path>` |
| 失败路径 | validator fixture | 注入未知字段、单位冲突、未来字段、循环和任意代码 | 定位诊断、blocked、零执行副作用 | `<Path>{roots.state}/specdev/changes/{change}/evidence/T-07.md</Path>` |
| 回归 | T-03/T-05 contract | 运行 AssetRef/EvidenceRef 测试 | 定义只引用 confirmed/有证据字段 | `<Path>{roots.state}/specdev/changes/{change}/evidence/T-07.md</Path>` |

- **Workspace checks（current-workspace）：** implementation owner 在 current workspace 运行 AST parser/validator、版本化持久化、字段/单位/未来数据/cycle fault fixture、类型检查和插件构建，不创建 source worktree。
- **E2E disposition：** required：用户从编辑入口保存策略并预览 Universe 的路径跨越 UI、route、版本存储与数据字段解析，必须证明任意代码和未来字段无法执行。
- **E2E owner/environment：** Lead / current-workspace；在 direct-parent 状态创建、保存、重开并预览 A/HK 筛选/因子/策略，同时提交未知字段、单位冲突、循环和任意代码，预期合法版本可解释且非法定义 blocked、零执行副作用。
- **Integration evidence（direct-parent）：** 记录 implementation commit、parent before SHA、策略 UI/route 场景与安全断言、E2E 结果、父分支 result SHA 及包含关系。

## 9. 发布、迁移与恢复

- **迁移顺序：** 先 validator/serialization，再 UI 和 preview；旧定义只读并显式升级。
- **兼容窗口：** schema version 和 operator allowlist 保留；未知 operator 不执行。
- **监控信号：** invalid definition 类别、字段缺失、preview 行数、版本迁移失败和执行阻断原因。
- **回滚或前向恢复：** 保存新版本失败不改变旧版本；策略执行只引用不可变版本。
- **不可逆操作与批准点：** 无；执行/回测在后续票据另行确认质量门。
- **收缩条件：** 回测/监控没有绕过 validator 的入口，静态搜索证明。

## 10. 验收标准

- [x] `AC-016`：筛选、因子和策略定义可版本化、解释和安全阻断。
- [x] 验证矩阵记录到 `<Path>{roots.state}/specdev/changes/{change}/evidence/T-07.md</Path>`。
