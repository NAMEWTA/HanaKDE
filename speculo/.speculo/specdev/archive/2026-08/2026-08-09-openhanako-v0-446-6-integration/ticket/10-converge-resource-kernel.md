---
schema_version: 3
artifact: ticket
change: 2026-08-09-openhanako-v0-446-6-integration
id: T-10
title: 收敛 Resource Kernel
status: done
planning_depth: deep
planning_depth_reason: "ResourceIO、事件、Root Identity、Materialize、Transfer 与授权是跨系统公共核心接口并承载安全和数据完整性。"
ready: true
risk: critical
blocked_by: [T-09]
contract_ids: [AC-011, AC-014, AC-020, AC-023, AC-026]
owner: Worker-T-10 / Lead
expected_changes: ["<Path>lib/resource-io/**</Path>", "<Path>lib/file-ref/resource-io.ts</Path>", "<Path>server/routes/resource-io.ts</Path>", "<Path>server/http/resource-operation-context.ts</Path>", "<Path>tests/resource-*.test.ts</Path>", "<Path>build/persistence-store-inventory.json</Path>", "<Path>build/persistence-schema-fingerprint.json</Path>"]
writable_paths: ["<Path>lib/resource-io/**</Path>", "<Path>lib/file-ref/resource-io.ts</Path>", "<Path>server/routes/resource-io.ts</Path>", "<Path>server/http/resource-operation-context.ts</Path>", "<Path>tests/resource-*.test.ts</Path>", "<Path>build/persistence-store-inventory.json</Path>", "<Path>build/persistence-schema-fingerprint.json</Path>"]
read_only_paths: ["<Path>core/engine.ts</Path>", "<Path>core/knowledge-workspace/**</Path>", "<Path>lib/file-history/**</Path>", "<Path>lib/document-extract/**</Path>"]
shared_paths: []
shared_path_owners: []
---

# Ticket T-10: 收敛 Resource Kernel

- **Ticket 文件：** `<Path>{roots.state}/specdev/changes/{change}/ticket/10-converge-resource-kernel.md</Path>`
- **总体 Map：** `<Path>{roots.state}/specdev/changes/{change}/tickets-map.md</Path>`
- **上游 Spec：** `<Path>{roots.state}/specdev/changes/{change}/spec.md</Path>`
- **完成 Evidence：** `<Path>{roots.state}/specdev/changes/{change}/evidence/T-10.md</Path>`

## 1. 战略与来源

- **目标：** 以 HanaKDE 现有 ResourceIO、ResourceEventBus、ResourceWatchRegistry、ProviderRootIdentity 和 Transfer 为权威，吸收上游 Materialize 与 additive event 能力，形成唯一 Resource Kernel。
- **可观察产出：** Resource 调用者可安全区分 copy、transfer、materialize；内部 mutation 与 watcher echo 通过同一有序事件事实源收敛，越界和 unknown root fail closed。
- **来源：** `US-005`、`US-008`、`US-011`、`AC-011`、`AC-014`、`AC-020`、`AC-023`、`AC-026`、`ADR-001`、`ADR-004`、`ADR-007`。
- **当前事实：** 当前 `<Path>lib/resource-io/</Path>` 已有 ResourceIO、event bus、root identity、watch registry、providers 与 Transfer；冻结上游增加 Materialize 并修改同一核心路径。
- **Planning Depth 原因：** 公共核心、安全 authority、跨 Provider side effects 与所有下游消费者都依赖此契约。

## 2. 决策状态

### 已锁定决策

- ResourceIO 是内部 mutation 与 restore 的唯一写入事实源；ResourceEventBus 是统一 fan-out/catch-up 事实源。
- ProviderRootIdentity 是物理 root authority；不得用 raw path prefix、新公共 `workspaceId` 或 store key 替代。
- copy 是 provider-native 复制，transfer 是跨 Provider 持久搬运，materialize 是有界临时本地投影；三者生命周期和恢复语义不合并。
- event sequence 单调，source/origin 可辨，同资源同版本 echo 去重，subscriber failure 隔离；`since()` stale 必须显式报告。

### 已采用的低影响假设

- additive correlation metadata 的具体字段名遵循整合后 `<Path>lib/resource-io/types.ts</Path>` 现有命名惯例。

### 未决问题

无。

## 3. 范围边界

| IN（本 Ticket 构建） | REUSE（复用且不改变契约） | OUT（明确不做） |
|---|---|---|
| Root identity、event bus、ResourceIO、Materialize、Transfer、policy/route contracts 与定向测试 | 现有 providers、fixed transfer budgets、request authority context | Workspace lifecycle、History store、Knowledge repair、所有 Provider 重写 |

## 4. 要构建什么

调用者提交已授权 ResourceRef 后，Resource Kernel 解析并证明物理 scope，执行读取、写入、复制、跨 Provider transfer 或临时 materialize。mutation 只产生一条规范事件；watcher echo 不重复高层变化。无法证明 root、资源被替换或 scope 失效时，在 effect 前稳定拒绝且不产生 side effect。

## 5. 实现契约

- **入口或接缝：** ResourceIO API、ResourceEventBus subscribe/since、ProviderRootIdentity relation、Resource route authority context。
- **输入与输出：** ResourceRef + operation + authority + optional expected version/correlation → typed result/event 或稳定拒绝。
- **公共接口变化：** additive event metadata 与 Materialize interface；外部接口仍绑定 ResourceRef/opaque key，不接受 raw root 或公共 workspaceId。
- **不变量：** event order 单调；同版本重复 mutation 合并；subscriber failure 不回滚已提交写入；temporary staging 总会清理；Transfer budgets 不降低。
- **状态或数据流：** authority proof → effect preflight → provider operation/materialize → ResourceEventBus → logical consumers。
- **错误与失败行为：** unknown/disjoint/replaced root、越界、版本冲突、budget、cancellation 和 cleanup failure 均结构化报告；写入前失败不改资源。
- **兼容要求：** 现有 consumer 可忽略 additive metadata；不兼容旧内部 root helper 或重复 materialize parser。
- **安全与隐私要求：** effect 前重校验；symlink/junction 逃逸拒绝；外部错误和事件不泄漏绝对路径、token 或内容。

## 6. 执行路线

1. 用现有 Resource、Root Identity、EventBus 和 Transfer 合同建立红色/基线测试，冻结公共类型和错误行为。
2. 将上游 Materialize 接入 ResourceIO authority/budget/lifecycle，保持 copy/transfer/materialize 分离。
3. 收敛 event origin、sequence、correlation、echo dedupe、since/stale 和 subscriber isolation。
4. 统一 route/request authority 与 effect 前 root/scope revalidation，删除重复 root/path helper。
5. 运行恶意 root、跨 Provider、staging cleanup、event catch-up 和现有 Resource 回归。
6. 扫描重叠实现和调用点，证明 Resource Kernel 只有一个 production owner。

## 7. 路径访问契约

- **预计修改点：** frontmatter 中 Resource Kernel、route 与测试路径。
- **可写范围：** 仅 `writable_paths`；`<Path>core/engine.ts</Path>` 的生产 wiring 留给 T-12。
- **只读上下文：** History、Knowledge、Extraction 与 engine 消费者。
- **共享路径：** 无；本 Ticket 是 Resource Kernel 唯一 owner，消费者只读。
- **D-T10-01（Lead 于 2026-08-10 批准）：** 仅 `<Path>build/persistence-store-inventory.json</Path>` 作为生成 receipt 可写；T-10 新增的两个 URL materialize staging `fs.rmSync` 站点必须由 `<Path>scripts/scan-persistent-stores.mjs</Path>` 登记。此授权不包含 `<Path>build/persistence-startup-receipt.json</Path>`、任何其他 `<Path>build/**</Path>` 文件或扫描器逻辑。
- **D-T10-02（ticket；Lead 于 2026-08-10 批准）：** D-T10-01 使持久化 site mapping 从 756 增至 758，导致已提交 fingerprint 与官方生成 payload 不匹配。批准仅通过 `<Path>scripts/generate-persistence-schema-fingerprint.mjs</Path>` 以 `compatible` review 写入 `<Path>build/persistence-schema-fingerprint.json</Path>`；原因是两个 URL materialize 临时 staging cleanup receipt，不改变 persistent store registry、on-disk schema、`DATA_EPOCH` 或数据合同。不得修改 `<Path>build/persistence-startup-receipt.json</Path>`、扫描器或任何其他 `<Path>build/**</Path>` 文件。
- **保留或不动：** Knowledge DB、History DB、Workspace UI 和 plugin ownership。

## 8. 验证矩阵

| 行为或风险 | 验证接缝 | 命令或步骤 | 预期结果 | Evidence |
|---|---|---|---|---|
| 正常路径 | Resource module contracts | 运行 ResourceEventBus、Root Identity、Materialize、Transfer 定向 Vitest | 顺序、操作语义与 staging lifecycle 成立 | `<Path>{roots.state}/specdev/changes/{change}/evidence/T-10.md</Path>` |
| 失败路径 | malicious authority matrix | 运行 unknown/root replacement/symlink/junction/unauthorized/too-large/cancel tests | effect 前拒绝，磁盘和目标状态不变 | `<Path>{roots.state}/specdev/changes/{change}/evidence/T-10.md</Path>` |
| 回归 | existing Resource suite | `npm test -- --runInBand` 的适用定向子集及 `npm run typecheck` | providers、Transfer budgets 与 routes 无回退 | `<Path>{roots.state}/specdev/changes/{change}/evidence/T-10.md</Path>` |

## 9. 发布、迁移与恢复

- **迁移顺序：** 先契约与隔离测试，再消费者；生产 wiring 不在本 Ticket。
- **兼容窗口：** 仅 additive event metadata；无旧内部 helper 或双 Resource Kernel 兼容期。
- **监控信号：** event sequence/gap、dedupe count、subscriber failure、materialize cleanup 与 transfer budget metrics。
- **回滚或前向恢复：** 在未接生产的隔离分支修正；进入后续 cutover 后按 T-12 stop-then-start 恢复。
- **不可逆操作与批准点：** 无不可逆数据操作；任何 Git commit/merge 仍需明确授权。
- **收缩条件：** 重复 root helper、materialize owner 和事件 fan-out 调用点为零并有 scan Evidence。

## 10. 验收标准

- [x] `AC-011`：事件顺序、来源、去重、isolation 和 `since()` 合同通过。
- [x] `AC-014`：ProviderRootIdentity 关系与恶意 workspace 测试 fail closed。
- [x] `AC-020`：授权 read/materialize、稳定失败和 staging cleanup 通过。
- [x] `AC-023`：copy/transfer/materialize 生命周期与 fixed budgets 分离。
- [x] `AC-026`：route/event 不接受 raw root/公共 workspaceId 且不泄漏绝对路径。
- [x] 验证和结构 scan 记录到 `<Path>{roots.state}/specdev/changes/{change}/evidence/T-10.md</Path>`。
