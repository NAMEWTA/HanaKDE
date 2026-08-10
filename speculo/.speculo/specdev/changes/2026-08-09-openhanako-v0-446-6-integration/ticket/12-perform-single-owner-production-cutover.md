---
schema_version: 3
artifact: ticket
change: 2026-08-09-openhanako-v0-446-6-integration
id: T-12
title: 执行单 owner 生产切换
status: in_progress
planning_depth: deep
planning_depth_reason: "生产 watcher、mutation fan-out 与 baseline owner 的一次性 stop-then-start 切换具有全局事故半径且禁止双运行。"
ready: true
risk: critical
blocked_by: [T-10, T-11, T-19]
contract_ids: [AC-009, AC-010, AC-011, AC-012, AC-013]
owner: Worker-T-12
expected_changes: ["<Path>core/engine.ts</Path>", "<Path>server/composition/**</Path>", "<Path>server/resource-events-ws.ts</Path>", "<Path>desktop/main.cjs</Path>", "<Path>desktop/preload.cjs</Path>", "<Path>desktop/src/react/types.ts</Path>", "<Path>desktop/src/react/services/resource-events.ts</Path>", "<Path>desktop/src/react/__tests__/services/resource-events.test.ts</Path>", "<Path>tests/engine-resource-events.test.ts</Path>", "<Path>tests/engine-lifecycle.test.ts</Path>"]
writable_paths: ["<Path>core/engine.ts</Path>", "<Path>server/composition/**</Path>", "<Path>server/resource-events-ws.ts</Path>", "<Path>desktop/main.cjs</Path>", "<Path>desktop/preload.cjs</Path>", "<Path>desktop/src/react/types.ts</Path>", "<Path>desktop/src/react/services/resource-events.ts</Path>", "<Path>desktop/src/react/__tests__/services/resource-events.test.ts</Path>", "<Path>tests/engine-resource-events.test.ts</Path>", "<Path>tests/engine-lifecycle.test.ts</Path>"]
read_only_paths: ["<Path>lib/resource-io/**</Path>", "<Path>core/workspace-runtime/**</Path>", "<Path>desktop/workspace-watch-registry.cjs</Path>", "<Path>core/knowledge-workspace/**</Path>", "<Path>lib/file-history/**</Path>"]
shared_paths: ["<Path>core/engine.ts</Path>"]
shared_path_owners: ["<Path>core/engine.ts</Path> => T-19 narrow session File Tool injection until W3 integration; T-12 owns later production cutover work"]
---

# Ticket T-12: 执行单 owner 生产切换

- **Ticket 文件：** `<Path>{roots.state}/specdev/changes/{change}/ticket/12-perform-single-owner-production-cutover.md</Path>`
- **总体 Map：** `<Path>{roots.state}/specdev/changes/{change}/tickets-map.md</Path>`
- **上游 Spec：** `<Path>{roots.state}/specdev/changes/{change}/spec.md</Path>`
- **完成 Evidence：** `<Path>{roots.state}/specdev/changes/{change}/evidence/T-12.md</Path>`

## 1. 战略与来源

- **目标：** 在 production assembly 中停止并移除旧观察/事件/baseline owners，再启动 T-10/T-11 的唯一 owner，证明全过程 overlap count 为 0。
- **可观察产出：** Engine、Server 和 Desktop 只连接一套 Resource/Workspace 事实源；History、Knowledge、UI 以后只作为 logical consumers。
- **来源：** `US-005`、`US-009`、`AC-009`—`AC-013`、`ADR-005`、`ADR-006`、`DEC-008`。
- **当前事实：** `<Path>core/engine.ts</Path>` 组装 ResourceEventBus 与 Knowledge runtime；Desktop main/renderer 还存在多种 watch registry/lease 路径。
- **Planning Depth 原因：** production lifecycle、资源释放和失败恢复必须在真实 assembly 上证明，且绝不允许临时双运行。

## 2. 决策状态

### 已锁定决策

- 切换顺序只能是 isolated proof → stop old → prove release → start new → verify health。
- 新 owner 启动失败时只能 stop new → prove release → restore previous code Wave；不得并行启动旧 owner。
- Engine 只负责 assembly/subscription，不逐个显式调用 History/Knowledge/UI。
- 不保留 shadow watcher、dual write、dual baseline 或旧 owner compatibility switch。

### 已采用的低影响假设

- stop/release proof 的具体 inspection API 沿用 T-11 descriptor/inspection contract。

### 未决问题

无。

## 3. 范围边界

| IN（本 Ticket 构建） | REUSE（复用且不改变契约） | OUT（明确不做） |
|---|---|---|
| Engine/server/renderer assembly、old owner removal、cutover/recovery state machine | T-10 Kernel、T-11 Workspace infrastructure、existing lifecycle tests | History/Knowledge product logic、临时双运行、数据 migration |

## 4. 要构建什么

系统启动或切换 `main` 时，旧 owner 的 watcher、queue 和 baseline lease 必须先全部关闭，再启动新 coordinator。所有 Resource mutations 和 observations 进入唯一 EventBus。启动失败会显示 `FAILED` 或恢复前一代码 Wave，但任一时刻 watcher/mutation/baseline overlap 都是 0。

## 5. 实现契约

- **入口或接缝：** Engine initialize/dispose、server composition、desktop resource event bridge、cutover inspection hooks。
- **输入与输出：** old/new owner descriptors + lifecycle signal → single active owner, health state and auditable stop/start sequence。
- **公共接口变化：** renderer/server 继续消费授权 resource events；不公开 root、workspaceId 或 owner internals。
- **不变量：** old stopped before new start；overlap count always 0；shutdown/dispose idempotent；subscriber count 不改变 physical watcher count。
- **状态或数据流：** isolate verify → stop old/release proof → start new → EventBus → logical subscribers。
- **错误与失败行为：** stop proof 失败则不启动新 owner；new start 失败先完整停止新 owner再恢复或保持 FAILED。
- **兼容要求：** 一步到位删除旧 production wiring，不提供开关或兼容窗口。
- **安全与隐私要求：** lifecycle/event bridge 不向 LAN/renderer 暴露 raw root、absolute path 或 scope secrets。

## 6. 执行路线

1. 用 fake descriptors 和 lifecycle spies 固定 cutover/recovery 时序红色测试。
2. 将 Engine assembly 改为创建唯一 Resource/Workspace owners 与 subscriptions。
3. 停止并删除旧 production watcher/event/baseline wiring，加入 release proof。
4. 接入 server/renderer event bridge，保持 UI 只消费事实而不维护 shadow file truth。
5. 覆盖 startup failure、dispose、root switch、subscriber churn 和 recovery，断言 overlap 永远为 0。
6. 运行结构扫描，删除旧 owner factory/wiring 与兼容开关。

## 7. 路径访问契约

- **预计修改点：** Engine/server composition、event bridge 和 lifecycle tests。
- **D-T19-02 接口交接：** T-19 在 W3 先以 object-identity 方式为内建 File Tool 注入 session-scoped sandbox `resourceIO`，并在 `<Path>tests/engine-build-tools.test.ts</Path>` 证明非 File Tool 不会得到该对象。T-12 不重做或扩大该 injection；在 W3 integrated 后继续拥有 `<Path>core/engine.ts</Path>` 的 production cutover 变更。
- **可写范围：** 仅 frontmatter `writable_paths`；Kernel/Workspace 实现为只读消费者契约。
- **只读上下文：** Resource Kernel、workspace coordinator、Desktop main 与下游 consumers。
- **共享路径：** 无；T-12 是 production assembly/cutover 唯一 owner。
- **保留或不动：** History、Knowledge、Extraction 产品模型和平台 package。

### D-T12-01: legacy IPC watcher owner path correction

- **等级 / 触发事实：** ticket；`<Path>desktop/main.cjs</Path>` 的 `watch-workspace`/`unwatch-workspace` IPC 处理器可对任意 absolute root 创建 `chokidar` physical watcher，且 `<Path>desktop/preload.cjs</Path>` 将该能力暴露给任意 renderer。当前 React 没有调用点不改变其作为可调用生产 owner 的事实。
- **批准与范围：** Lead 于 2026-08-10 批准仅将 `<Path>desktop/main.cjs</Path>`、`<Path>desktop/preload.cjs</Path>`、`<Path>desktop/src/react/types.ts</Path>` 和 `<Path>desktop/src/react/__tests__/services/resource-events.test.ts</Path>` 加入 T-12；原有 T-12 engine tests 仍是定向生命周期测试。此修订只移除 legacy absolute-root IPC owner，并将 renderer 保持为 logical EventBus consumer。
- **并行 / 所有权审计：** T-13 仅拥有 `<Path>lib/file-history/**</Path>`、`<Path>server/routes/file-history.ts</Path>` 和 file-history tests；T-14 仅拥有 Knowledge core/lib/route/tests；均与新增 T-12 路径不交叉。T-11 曾拥有 `<Path>desktop/main.cjs</Path>` 的 isolated proof，但已 integrated/removed，且 Evidence 明确将 production cutover 留给 T-12。
- **不扩大内容：** 不修改 `<Path>desktop/workspace-watch-registry.cjs</Path>`、`<Path>desktop/src/modules/platform.js</Path>` 或其测试；这些路径不再从 production main/preload reachable。不得保留 disabled fallback、compat flag 或另一条 root watch IPC。
- **反向验证：** 在 source/behavior tests 中证明 main 和 preload 不再注册、暴露或可调用 `watch-workspace`，renderer 不发起 `/api/resource-io/subscribe` physical watch lease，且 Engine stop-old/prove-release/start-new 的 overlap count 始终为 0。

## 8. 验证矩阵

| 行为或风险 | 验证接缝 | 命令或步骤 | 预期结果 | Evidence |
|---|---|---|---|---|
| 正常路径 | Engine cutover state machine | initialize/switch/dispose + N consumers | stop proof 先于 start，single owner healthy | `<Path>{roots.state}/specdev/changes/{change}/evidence/T-12.md</Path>` |
| 失败路径 | recovery injection | 注入 old stop/new start/release failure | 不双运行；失败可见；恢复仍 stop-then-start | `<Path>{roots.state}/specdev/changes/{change}/evidence/T-12.md</Path>` |
| 回归 | structural + lifecycle suite | owner factory scan、engine/resource event tests | duplicate wiring 为零，existing lifecycle 绿色 | `<Path>{roots.state}/specdev/changes/{change}/evidence/T-12.md</Path>` |

## 9. 发布、迁移与恢复

- **迁移顺序：** isolated proof → stop old → release Evidence → start new；无 dual-run 阶段。
- **兼容窗口：** 无；旧 production wiring 同 Ticket 删除。
- **监控信号：** active owner counts、descriptor/queue leases、health transitions、event sequence/gap。
- **回滚或前向恢复：** 先停止新 owner并证明释放，再经批准恢复前一代码 Wave；不是数据迁移回滚。
- **不可逆操作与批准点：** production cutover code integration 与 Git commit/merge 需明确批准；无破坏性数据操作。
- **收缩条件：** 旧 owner factory/wiring/feature flag 调用点为零，overlap state-machine Evidence 全绿。

## 10. 验收标准

- [ ] `AC-009`：N consumers 对 canonical root 始终只有一个 physical watcher。
- [ ] `AC-010`：cutover 与恢复全过程 watcher/mutation/baseline overlap 为 0。
- [ ] `AC-011`/`AC-012`：production mutation、observation 与 catch-up 进入唯一 EventBus/baseline owner。
- [ ] `AC-013`：failure/retry health state 可见且正确。
- [ ] 重复 production owner 与兼容开关扫描为零并记录到 `<Path>{roots.state}/specdev/changes/{change}/evidence/T-12.md</Path>`。
