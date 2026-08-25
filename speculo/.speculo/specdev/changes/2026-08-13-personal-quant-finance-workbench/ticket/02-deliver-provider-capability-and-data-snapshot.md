---
schema_version: 3
artifact: ticket
change: 2026-08-13-personal-quant-finance-workbench
id: T-02
title: 交付同花顺优先的多源探测、路由与可信数据快照
status: ready
planning_depth: deep
planning_depth_reason: 涉及外部数据、许可、PIT、单位、复权、限流、缓存和 fail-closed 语义，是金融正确性的共享高事故半径接缝。
ready: true
risk: critical
blocked_by: [T-01]
contract_ids: [AC-004, AC-006, AC-008, AC-030, AC-034, AC-035, AC-037]
owner: root
expected_changes: ["<Path>plugins/finance-workbench/src/data/**</Path>", "<Path>plugins/finance-workbench/src/providers/**</Path>", "<Path>plugins/finance-workbench/routes/providers.*</Path>", "<Path>plugins/finance-workbench/tools/providers.*</Path>", "<Path>plugins/finance-workbench/tests/fixtures/data/**</Path>", "<Path>plugins/finance-workbench/tests/data-contract.integration.test.ts</Path>"]
writable_paths: ["<Path>plugins/finance-workbench/src/data/**</Path>", "<Path>plugins/finance-workbench/src/providers/**</Path>", "<Path>plugins/finance-workbench/routes/providers.*</Path>", "<Path>plugins/finance-workbench/tools/providers.*</Path>", "<Path>plugins/finance-workbench/tests/fixtures/data/**</Path>", "<Path>plugins/finance-workbench/tests/data-contract.integration.test.ts</Path>"]
read_only_paths: ["<Path>plugins/finance-workbench/manifest.json</Path>", "<Path>plugins/finance-workbench/src/domain/**</Path>", "<Path>temp/finance-references/**</Path>", "<Path>PLUGIN_SDK.md</Path>", "<Path>PLUGINS.md</Path>"]
shared_paths: []
shared_path_owners: []
---

# Ticket T-02: 交付同花顺优先的多源探测、路由与可信数据快照

- **Ticket 文件：** `<Path>{roots.state}/specdev/changes/{change}/ticket/02-deliver-provider-capability-and-data-snapshot.md</Path>`
- **总体 Map：** `<Path>{roots.state}/specdev/changes/{change}/tickets-map.md</Path>`
- **上游 Spec：** `<Path>{roots.state}/specdev/changes/{change}/spec.md</Path>`
- **完成 Evidence：** `<Path>{roots.state}/specdev/changes/{change}/evidence/T-02.md</Path>`

## 1. 战略与来源

- **目标：** 建立内置 provider adapter、`hithink-rest` BYOK、capability probe、`auto | pinned` 路由、缓存/限流/退避、请求幂等和 `DataSnapshot` 生成，使任何数据都先经过证据门。
- **可观察产出：** 用户在 provider 面板看到逐 market/dataset/workflow 的认证、状态、SourcePolicy、SourceDecision、原因和替代路径；请求返回 source kind、来源、时间、单位、PIT、复权、日历、staleAt、schema hash 和质量 gate；Market Dumps 原型门未满足时明确 blocked/unavailable。
- **来源：** `US-006`、`US-019`、`US-021`、`AC-004`、`AC-006`、`AC-008`、`AC-030`、`AC-034`、`AC-035`、`AC-037`、`ADR-001`、`ADR-004`～`ADR-006`、`DEC-005`、`DEC-010`～`DEC-012`、`INV-03`、`INV-06`。
- **当前事实：** Financial-API 使用 `X-api-key` 和 HTTP + 业务信封双层结果，适用 A 股数据集但不覆盖港股、分钟 K、tick 或原文；其账号 capability、时间、PIT/vintage 和公开条款必须逐项探测。Market Dumps 的 native DuckDB 跨平台事实由 P-prototype 回答，原型前不能 supported。
- **Planning Depth 原因：** 错误 provider 结果会污染行情、持仓和回测，必须有迁移、观测、回滚和许可阻断。

## 2. 决策状态

### 已锁定决策

- iframe 不直连第三方；route/tool 使用 `ctx.network.fetch()`，host/method/超时/响应大小由 manifest 和 provider 配置限制。
- provider 只有在条款、认证/账号授权、字段 schema、身份、PIT、单位、复权、日历、刷新和容量证据齐全时标为 supported；`auto` fallback 需语义等价且产生 SourceDecision，`pinned` 不换源。
- 原始响应不直接成为公共结果；先解析、去重、校验真实 K 线/字段，再生成 `DataSnapshot`。空响应和 200 空数据是失败或 partial。
- `hithink-rest` 只用用户 BYOK，并在探测通过的适用 A 股 dataset 中作为出厂优先来源；港股、分钟 K、tick、宏观和新闻/公告/研报原文必须拒绝路由。
- `hithink-market-dump` 只建立本地 source contract、同步状态和原型证据门；不得在本票复制/启动 Python/CLI，也不得在 P-prototype 通过前宣称 production supported。

### 已采用的低影响假设

- 首版 provider 以 adapter 插件化；实际 host 列表和 API 由合法配置/探测决定，未验证源默认保持 experimental/unavailable。

### 未决问题

无。

## 3. 范围边界

| IN（本 Ticket 构建） | REUSE（复用且不改变契约） | OUT（明确不做） |
|---|---|---|
| provider interface、`hithink-rest` BYOK、probe、SourcePolicy router/decision、cache key、rate limit、DataSnapshot、本地 source gate、质量错误和 A/HK fixture | T-01 domain/error/source schema、`ctx.network.fetch`、插件敏感配置、参考项目的失败/降级行为 | 资产 UI、组合、回测、共享 Key/代理、未审计第三方端点、Python/CLI/TCP runtime、原型前的 native production 接入、交易所直连 |

## 4. 要构建什么

用户配置自己的同花顺 Key 后，系统逐 dataset 探测认证、权限、业务信封和金融质量；适用 A 股单元格通过后把 `hithink-rest` 作为 `auto` 首选。用户也可 pinned 合法来源。每次请求显示 SourceDecision；断开、凭据失效、权限不足、限流、错误、空响应、单位/PIT/lineage 冲突返回结构化状态并保留最后可信快照。`hithink-market-dump` 在原型证据不足时显示 blocked/unavailable、磁盘/同步条件和其他来源，不启动 native/Python 实现。

## 5. 实现契约

- **入口或接缝：** `ProviderAdapter`、`hithink-rest` adapter、`capabilityProbe`、`sourceRouter`、`dataRequest`、`snapshotStore`、provider route/tool。
- **输入与输出：** 输入 market/dataset/workflow/assets/time window/fields/adjustment/PIT/quality budget/SourcePolicy；输出 `ProviderCapability`、`SourceDecision`、`DataSnapshot` 或认证/provider/PIT/unit/rate-limit/local-source 阻断错误。
- **公共接口变化：** 仅实现 T-01 插件内 domain 的 provider consumer；不改宿主网络 API。
- **不变量：** cache key 含 market、asset、dataset、workflow、时间窗、adjustment、PIT、provider/source kind、SourcePolicy version 和 schema；snapshot 的观测时间、单位和 lineage 不可伪造；有效 Key 不等于全部 capability；失败不覆盖最后可信值。
- **状态或数据流：** configured -> probing -> supported/partial/experimental/unavailable/blocked；request -> raw -> parse -> validate -> snapshot/cache；staleAt 单独计算。
- **错误与失败行为：** timeout、HTTP/业务信封错误、凭据失效、权限不足、空 200、schema drift、旧代码、限流、许可未知、非等价 fallback 和本地源未就绪都可分类、可重试性明确，禁止 silent fallback。
- **兼容要求：** adapter 版本化，未知字段隔离；provider 更换必须记录 source/provider 变化和质量重新判定。
- **安全与隐私要求：** BYOK 从 owner-only 敏感 configuration/secret capability 读取，只在 Node route 形成 `X-api-key`，绝不进入前端、assets、日志、snapshot、导出或 fixture；不提供共享 Key/代理。

## 6. 执行路线

1. 为正常、业务错误信封、凭据失效、权限不足、空 200、限流、旧代码、单位/PIT/schema/lineage 冲突和不支持市场/数据集建立 provider fixture 与失败测试。
2. 定义 adapter/probe、SourcePolicy/SourceDecision、缓存键、退避/限流和 snapshot 质量转换；先让 pinned/非等价 fallback 稳定 fail closed。
3. 用敏感 BYOK 接入 `hithink-rest` 的 `ctx.network.fetch()`，验证 A 股允许矩阵并拒绝港股、分钟 K、tick 与原文请求；其他合法 provider 走同一 adapter contract。
4. 实现 capability/source 面板 route/tool，展示认证、状态、选源原因、探测时间、local prototype gate 和 import/fallback 入口。
5. 运行数据契约、静态 secret/Python/CLI 扫描和 T-01 回归，记录等价 fallback、pinned 失败、本地源 blocked 与 fail-closed 证据。

## 7. 路径访问契约

- **预计修改点：** `<Path>plugins/finance-workbench/src/data/**</Path>`、`<Path>plugins/finance-workbench/src/providers/**</Path>`、`<Path>plugins/finance-workbench/tests/fixtures/data/**</Path>`、`<Path>plugins/finance-workbench/tests/data-contract.integration.test.ts</Path>`。
- **可写范围：** 上述四个插件子路径。
- **只读上下文：** `<Path>plugins/finance-workbench/manifest.json</Path>`、`<Path>plugins/finance-workbench/src/domain/**</Path>`、`<Path>temp/finance-references/**</Path>`、`<Path>PLUGIN_SDK.md</Path>`、`<Path>PLUGINS.md</Path>`。
- **共享路径：** 无；T-02 只消费 T-01 的共享契约。
- **保留或不动：** 所有宿主网络/数据库/运行时路径和参考仓库源代码。

## 8. 验证矩阵

| 行为或风险 | 验证接缝 | 命令或步骤 | 预期结果 | Evidence |
|---|---|---|---|---|
| 正常路径 | adapter/probe integration | 运行 A/HK provider fixture、`hithink-rest` BYOK/probe、SourcePolicy 和 snapshot 测试 | 适用 A 股优先、选源有据，能力状态、snapshot 元数据、cache 命中和 staleAt 正确 | `<Path>{roots.state}/specdev/changes/{change}/evidence/T-02.md</Path>` |
| 失败路径 | fault-injection fixture | 注入凭据失效、权限不足、业务错误、空 200、僵尸代码、单位/PIT/schema/lineage 漂移、429/timeout、pinned 失败 | 分类错误/partial/blocked，保留最后可信快照，无 silent fallback | `<Path>{roots.state}/specdev/changes/{change}/evidence/T-02.md</Path>` |
| 本地源门禁 | source capability fixture | 在无原型证据及部分证据状态查询 `hithink-market-dump` | 状态保持 unavailable/blocked/experimental，显示缺口、磁盘条件和替代路径，不启动 Python/CLI/native production | `<Path>{roots.state}/specdev/changes/{change}/evidence/T-02.md</Path>` |
| 回归 | T-01 domain/build | 运行插件类型、构建和 domain contract 测试 | 共享对象兼容，secret/host 约束未回归 | `<Path>{roots.state}/specdev/changes/{change}/evidence/T-02.md</Path>` |

- **Workspace checks（current-workspace）：** implementation owner 在 current workspace 运行 provider adapter、capability probe、DataSnapshot、cache/限流 fault fixture、类型检查和插件构建，不创建 source worktree。
- **E2E disposition：** required：route 到 network adapter、业务信封、capability、缓存与结构化失败的链路跨越插件 route/网络边界，必须证明空 200、限流、stale 和语义不等价 fallback 会 fail closed。
- **E2E owner/environment：** Lead / current-workspace；在 direct-parent 状态通过确定性 provider 服务夹具调用真实插件 route，覆盖成功、空响应、429、timeout、schema/unit/PIT 漂移，预期只产生可追溯 snapshot 或明确 unavailable/partial/blocked。
- **Integration evidence（direct-parent）：** 记录 implementation commit、parent before SHA、fixture 服务与 route 命令/退出状态、E2E 结果、父分支 result SHA 及其包含 implementation commit 的证明。

## 9. 发布、迁移与恢复

- **迁移顺序：** 先 fixture/adapter contract，再接 provider；旧缓存不符合新 key/schema 时隔离，不自动重算为可信。
- **兼容窗口：** provider adapter 和 snapshot schema 支持当前版本读取；旧/未知版本标记 unavailable 并要求重新获取。
- **监控信号：** probe 状态、provider 错误类别、429、stale 命中、schema/unit/PIT 拒绝、fallback 语义差异和响应大小。
- **回滚或前向恢复：** provider 失效回退到最后可信 snapshot 或 import；错误配置可禁用单源，不影响其他 provider。
- **不可逆操作与批准点：** 无数据删除；启用真实 provider 需通过账号 capability/条款/质量检查；`hithink-market-dump` 只有 P-prototype 的三平台证据全部通过后才可另行提升 supported，不以演示批准替代证据。
- **收缩条件：** 所有消费者只使用 DataSnapshot/ProviderCapability，不再读取原始 adapter 字段；扫描和契约测试证明后冻结接口。

## 10. 验收标准

- [ ] `AC-004`、`AC-006`、`AC-008`、`AC-030`、`AC-034`、`AC-035`、`AC-037`：BYOK 探测、逐数据集选源、可信快照、失败降级、本地原型门和结构化错误可重复验证。
- [ ] provider 未通过许可/质量/PIT/单位门时不会显示 supported。
- [ ] 验证矩阵记录到 `<Path>{roots.state}/specdev/changes/{change}/evidence/T-02.md</Path>`，修改只在授权插件路径。
