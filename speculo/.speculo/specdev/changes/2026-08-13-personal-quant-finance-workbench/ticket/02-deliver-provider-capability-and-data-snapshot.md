---
schema_version: 3
artifact: ticket
change: 2026-08-13-personal-quant-finance-workbench
id: T-02
title: 交付多 provider 能力探测与可信数据快照
status: ready
planning_depth: deep
planning_depth_reason: 涉及外部数据、许可、PIT、单位、复权、限流、缓存和 fail-closed 语义，是金融正确性的共享高事故半径接缝。
ready: true
risk: critical
blocked_by: [T-01]
contract_ids: [AC-004, AC-006, AC-008, AC-030]
owner: implementation-owner
expected_changes: ["<Path>plugins/finance-workbench/src/data/**</Path>", "<Path>plugins/finance-workbench/src/providers/**</Path>", "<Path>plugins/finance-workbench/tests/fixtures/data/**</Path>", "<Path>plugins/finance-workbench/tests/data-contract.integration.test.ts</Path>"]
writable_paths: ["<Path>plugins/finance-workbench/src/data/**</Path>", "<Path>plugins/finance-workbench/src/providers/**</Path>", "<Path>plugins/finance-workbench/tests/fixtures/data/**</Path>", "<Path>plugins/finance-workbench/tests/data-contract.integration.test.ts</Path>"]
read_only_paths: ["<Path>plugins/finance-workbench/manifest.json</Path>", "<Path>plugins/finance-workbench/src/domain/**</Path>", "<Path>temp/finance-references/**</Path>", "<Path>PLUGIN_SDK.md</Path>", "<Path>PLUGINS.md</Path>"]
shared_paths: []
shared_path_owners: []
---

# Ticket T-02: 交付多 provider 能力探测与可信数据快照

- **Ticket 文件：** `<Path>{roots.state}/specdev/changes/{change}/ticket/02-deliver-provider-capability-and-data-snapshot.md</Path>`
- **总体 Map：** `<Path>{roots.state}/specdev/changes/{change}/tickets-map.md</Path>`
- **上游 Spec：** `<Path>{roots.state}/specdev/changes/{change}/spec.md</Path>`
- **完成 Evidence：** `<Path>{roots.state}/specdev/changes/{change}/evidence/T-02.md</Path>`

## 1. 战略与来源

- **目标：** 建立内置 provider adapter、capability probe、缓存/限流/退避、请求幂等和 `DataSnapshot` 生成，使任何数据都先经过证据门。
- **可观察产出：** 用户在 provider 面板看到逐 market/dataset 的状态、原因和替代路径；请求返回来源、时间、单位、PIT、复权、日历、staleAt、schema hash 和质量 gate。
- **来源：** `AC-004`、`AC-006`、`AC-008`、`AC-030`、`ADR-001`、`DEC-005`、`INV-03`、`INV-06`。
- **当前事实：** a-stock-data 研究发现旧 BSE 代码可 HTTP 200 但已僵尸、TCP 握手不代表真实 K 线、mootdx category 错误会静默落到日线、Tencent 分钟字段有单位陷阱；这些只能转为 fixture 和语义门。
- **Planning Depth 原因：** 错误 provider 结果会污染行情、持仓和回测，必须有迁移、观测、回滚和许可阻断。

## 2. 决策状态

### 已锁定决策

- iframe 不直连第三方；route/tool 使用 `ctx.network.fetch()`，host/method/超时/响应大小由 manifest 和 provider 配置限制。
- provider 只有在条款、字段 schema、身份、PIT、单位、复权、日历、刷新和容量证据齐全时标为 supported；fallback 需语义等价。
- 原始响应不直接成为公共结果；先解析、去重、校验真实 K 线/字段，再生成 `DataSnapshot`。空响应和 200 空数据是失败或 partial。

### 已采用的低影响假设

- 首版 provider 以 adapter 插件化；实际 host 列表和 API 由合法配置/探测决定，未验证源默认保持 experimental/unavailable。

### 未决问题

无。

## 3. 范围边界

| IN（本 Ticket 构建） | REUSE（复用且不改变契约） | OUT（明确不做） |
|---|---|---|
| provider interface、probe、cache key、rate limit、DataSnapshot、质量错误和 A/HK fixture | T-01 domain/error、`ctx.network.fetch`、参考项目的失败/降级行为 | 资产 UI、组合、回测、未审计第三方端点、Python/TCP runtime、交易所直连 |

## 4. 要构建什么

用户选择市场和数据集后，系统先探测 provider，显示条款/字段/质量/刷新证据，再执行请求。成功结果可被后续票据消费；断开、限流、错误、空响应、单位冲突、PIT 缺失或旧代码 fixture 返回结构化状态，保留最后可信快照且提供重试/导入替代路径。

## 5. 实现契约

- **入口或接缝：** `ProviderAdapter`、`capabilityProbe`、`dataRequest`、`snapshotStore`、provider route/tool。
- **输入与输出：** 输入 market/dataset/assets/time window/fields/adjustment/PIT/quality budget；输出 `ProviderCapability`、`DataSnapshot` 或 `provider_*`/`pit_unavailable`/`unit_mismatch`/`rate_limited` 错误。
- **公共接口变化：** 仅实现 T-01 插件内 domain 的 provider consumer；不改宿主网络 API。
- **不变量：** cache key 含 market、asset、dataset、时间窗、adjustment、PIT、provider、schema；snapshot 的观测时间和单位不可伪造；失败不覆盖最后可信值。
- **状态或数据流：** configured -> probing -> supported/partial/experimental/unavailable/blocked；request -> raw -> parse -> validate -> snapshot/cache；staleAt 单独计算。
- **错误与失败行为：** timeout、HTTP 错误、空 200、schema drift、旧代码、限流、许可未知都可分类、可重试性明确，禁止 silent fallback。
- **兼容要求：** adapter 版本化，未知字段隔离；provider 更换必须记录 source/provider 变化和质量重新判定。
- **安全与隐私要求：** secret 从 `ctx.config`/secret capability 读取，绝不进入 assets、日志、snapshot 或 fixture。

## 6. 执行路线

1. 为正常、空 200、错误、限流、旧代码、单位/PIT/schema 冲突建立 provider fixture 和失败测试。
2. 定义 adapter/probe 请求模型、缓存键、退避/限流和 snapshot 质量转换。
3. 接入 `ctx.network.fetch()` 和配置化合法 provider，解析并验证真实字段/K 线，不凭握手成功放行。
4. 实现 capability 面板 route/tool，展示状态、原因、探测时间和 import/fallback 入口。
5. 运行数据契约、静态 secret 扫描和 T-01 回归，记录语义等价 fallback 与 fail-closed 证据。

## 7. 路径访问契约

- **预计修改点：** `<Path>plugins/finance-workbench/src/data/**</Path>`、`<Path>plugins/finance-workbench/src/providers/**</Path>`、`<Path>plugins/finance-workbench/tests/fixtures/data/**</Path>`、`<Path>plugins/finance-workbench/tests/data-contract.integration.test.ts</Path>`。
- **可写范围：** 上述四个插件子路径。
- **只读上下文：** `<Path>plugins/finance-workbench/manifest.json</Path>`、`<Path>plugins/finance-workbench/src/domain/**</Path>`、`<Path>temp/finance-references/**</Path>`、`<Path>PLUGIN_SDK.md</Path>`、`<Path>PLUGINS.md</Path>`。
- **共享路径：** 无；T-02 只消费 T-01 的共享契约。
- **保留或不动：** 所有宿主网络/数据库/运行时路径和参考仓库源代码。

## 8. 验证矩阵

| 行为或风险 | 验证接缝 | 命令或步骤 | 预期结果 | Evidence |
|---|---|---|---|---|
| 正常路径 | adapter/probe integration | 运行 A/HK provider fixture 和 snapshot 测试 | 能力状态、snapshot 元数据、cache 命中和 staleAt 正确 | `<Path>{roots.state}/specdev/changes/{change}/evidence/T-02.md</Path>` |
| 失败路径 | fault-injection fixture | 注入空 200、僵尸代码、category 错、字段单位/PIT/schema 漂移、429/timeout | 分类错误/partial/blocked，保留最后可信快照，无错误 fallback | `<Path>{roots.state}/specdev/changes/{change}/evidence/T-02.md</Path>` |
| 回归 | T-01 domain/build | 运行插件类型、构建和 domain contract 测试 | 共享对象兼容，secret/host 约束未回归 | `<Path>{roots.state}/specdev/changes/{change}/evidence/T-02.md</Path>` |

## 9. 发布、迁移与恢复

- **迁移顺序：** 先 fixture/adapter contract，再接 provider；旧缓存不符合新 key/schema 时隔离，不自动重算为可信。
- **兼容窗口：** provider adapter 和 snapshot schema 支持当前版本读取；旧/未知版本标记 unavailable 并要求重新获取。
- **监控信号：** probe 状态、provider 错误类别、429、stale 命中、schema/unit/PIT 拒绝、fallback 语义差异和响应大小。
- **回滚或前向恢复：** provider 失效回退到最后可信 snapshot 或 import；错误配置可禁用单源，不影响其他 provider。
- **不可逆操作与批准点：** 无数据删除；启用真实 provider 需通过条款/质量检查，不以演示批准替代证据。
- **收缩条件：** 所有消费者只使用 DataSnapshot/ProviderCapability，不再读取原始 adapter 字段；扫描和契约测试证明后冻结接口。

## 10. 验收标准

- [ ] `AC-004`、`AC-006`、`AC-008`、`AC-030`：能力探测、数据快照、失败降级和结构化错误可重复验证。
- [ ] provider 未通过许可/质量/PIT/单位门时不会显示 supported。
- [ ] 验证矩阵记录到 `<Path>{roots.state}/specdev/changes/{change}/evidence/T-02.md</Path>`，修改只在授权插件路径。
