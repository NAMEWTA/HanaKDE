---
schema_version: 3
artifact: ticket
change: 2026-08-09-openhanako-v0-446-6-integration
id: T-12
title: 执行单 owner 生产切换
status: done
planning_depth: deep
planning_depth_reason: "生产 watcher、mutation fan-out 与 baseline owner 的一次性 stop-then-start 切换具有全局事故半径且禁止双运行。"
ready: true
risk: critical
blocked_by: [T-10, T-11, T-19]
contract_ids: [AC-009, AC-010, AC-011, AC-012, AC-013]
owner: Worker-T-12
expected_changes: ["<Path>core/engine.ts</Path>", "<Path>core/workspace-runtime/production-workspace-runtime.ts</Path>", "<Path>server/composition/open-root.ts</Path>", "<Path>server/http/route-security.ts</Path>", "<Path>shared/persistence/store-registry.ts</Path>", "<Path>scripts/scan-persistent-stores.mjs</Path>", "<Path>scripts/generate-persistence-schema-fingerprint.mjs</Path>", "<Path>build/persistence-store-inventory.json</Path>", "<Path>build/persistence-schema-fingerprint.json</Path>", "<Path>build/persistence-startup-receipt.json</Path>", "<Path>tests/engine-resource-events.test.ts</Path>", "<Path>tests/engine-lifecycle.test.ts</Path>", "<Path>tests/production-workspace-runtime.test.ts</Path>", "<Path>tests/file-history-production-boundary.test.ts</Path>", "<Path>tests/persistence-store-registry.test.ts</Path>", "<Path>tests/persistence-schema-tripwire.test.ts</Path>", "<Path>tests/server-composition-boundary.test.ts</Path>", "<Path>tests/http-route-security.test.ts</Path>"]
writable_paths: ["<Path>core/engine.ts</Path>", "<Path>core/workspace-runtime/production-workspace-runtime.ts</Path>", "<Path>server/composition/open-root.ts</Path>", "<Path>server/http/route-security.ts</Path>", "<Path>shared/persistence/store-registry.ts</Path>", "<Path>scripts/scan-persistent-stores.mjs</Path>", "<Path>scripts/generate-persistence-schema-fingerprint.mjs</Path>", "<Path>build/persistence-store-inventory.json</Path>", "<Path>build/persistence-schema-fingerprint.json</Path>", "<Path>build/persistence-startup-receipt.json</Path>", "<Path>tests/engine-resource-events.test.ts</Path>", "<Path>tests/engine-lifecycle.test.ts</Path>", "<Path>tests/production-workspace-runtime.test.ts</Path>", "<Path>tests/file-history-production-boundary.test.ts</Path>", "<Path>tests/persistence-store-registry.test.ts</Path>", "<Path>tests/persistence-schema-tripwire.test.ts</Path>", "<Path>tests/server-composition-boundary.test.ts</Path>", "<Path>tests/http-route-security.test.ts</Path>"]
read_only_paths: ["<Path>lib/resource-io/**</Path>", "<Path>core/knowledge-workspace/**</Path>", "<Path>lib/file-history/**</Path>", "<Path>server/routes/file-history.ts</Path>", "<Path>shared/workspace-observation.ts</Path>", "<Path>desktop/main.cjs</Path>"]
shared_paths: ["<Path>core/engine.ts</Path>", "<Path>core/workspace-runtime/production-workspace-runtime.ts</Path>", "<Path>server/composition/open-root.ts</Path>", "<Path>server/http/route-security.ts</Path>", "<Path>tests/file-history-production-boundary.test.ts</Path>", "<Path>tests/server-composition-boundary.test.ts</Path>", "<Path>tests/http-route-security.test.ts</Path>"]
shared_path_owners: ["<Path>core/engine.ts</Path> => T-12 W4 production assembly; preserve T-19 File Tool identity injection", "<Path>core/workspace-runtime/production-workspace-runtime.ts</Path> => T-12 W4 production assembly only", "<Path>server/composition/open-root.ts</Path> and <Path>tests/server-composition-boundary.test.ts</Path> => T-12 owns the one File History mount/inventory entry", "<Path>server/http/route-security.ts</Path> and <Path>tests/http-route-security.test.ts</Path> => T-12 owns the narrow file-history files.read/LOCAL_ONLY classification", "<Path>shared/persistence/store-registry.ts</Path>, <Path>scripts/scan-persistent-stores.mjs</Path>, <Path>scripts/generate-persistence-schema-fingerprint.mjs</Path>, generated persistence receipts, and their tests => D-T12-06 grants T-12 the production-registration correction and real SQLite introspector only; T-21 retains all other package/build ownership", "<Path>tests/file-history-production-boundary.test.ts</Path> => T-12 may authorize Engine assembly assertions only; T-13 exclusively owns lib/file-history/**"]
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

### D-T12-05: W4 File History production assembly authorization

- **Checkpoint / accepted dependency：** T-12 creation base_sha 为 `e758c7a12d31e8385b4993c406ae5acc04b18635`；resume/current checkpoint 为 `e6a687ba17752b4b5da3d46d6000f68b29abeaa9`。T-13 的已接受治理 checkpoint 为 `eba0480fc46fb929ab4473ff514f96ea0ecab09a`，其已审查的 History domain candidate 为 `e4600aff1fcd71285f8032fb610425ced5ead7cb`。两者都是本轮 assembly 的固定输入，不重放、不 rebase 且不自行合并到 integration。
- **授权与唯一 owner：** T-12 仅可修改 frontmatter 中的 ten assembly/composition/security/test paths。`core/engine.ts` 负责创建、rebind/root-switch teardown、dispose 和 `getFileHistoryService()`；`core/workspace-runtime/production-workspace-runtime.ts` 只构造经授权的 main binding。`server/composition/open-root.ts` 只挂载既有 route，`server/http/route-security.ts` 只把三个 read endpoint 列为 `files.read`、其余 `/api/file-history/*` fail closed 为 `LOCAL_ONLY`。T-12 不修改 History store、capture/policy、route implementation 或 Knowledge implementation。
- **消费契约：** File History 必须成为 main-only 的 logical `WorkspaceObservation` 和 `ResourceEventBus` consumer：复用 canonical observation subscription、已缓存 shared baseline 与 root proof；只读 authorized `ResourceIO` relative path；不创建 watcher、baseline walk、full scan、raw root projection 或第二 EventBus fact。
- **测试边界：** `tests/file-history-production-boundary.test.ts` 的原有 dormant-input 断言仅放宽到上述 narrow Engine assembly 和既有 route 的 production mount。`tests/server-composition-boundary.test.ts` 同步 frozen inventory，`tests/http-route-security.test.ts` 证明 `GET /api/file-history/{files,versions,diff}` 只需 `files.read`、其他 verb/path 为 `LOCAL_ONLY`。它们必须继续禁止 File History 自己拥有 watcher/baseline、直接 filesystem access、raw root/store leakage，且不得把 `lib/file-history/**` 交给 T-12。
- **W4 状态：** T-12 为 `in_progress`。T-13 和 T-14 保持 `review`，直到本 Ticket 的真实 production seam 证明和 combined W4 regressions 通过；本授权不允许任一 W4 Ticket 标记 `done` 或合并 integration。
- **W4 closure（2026-08-10）：** T-12 production seam 已与已接受的 T-13 和 T-14 candidates 完成 combined Node 24 matrix；14 files / 220 tests、project typecheck、authorized-path ESLint、SpecDev validator 与 two-axis review 全部通过。三个 W4 Ticket 现在为 `done`，并进入一次本地 integration merge；后续 G5 仍独立负责 restore convergence。

### D-T12-06: File History production persistence registration

- **等级与触发事实：** ticket deviation。`core/engine.ts` 已在健康的 main assembly 创建 `FileHistoryService`，但 `<Path>scripts/scan-persistent-stores.mjs</Path>` 仍以 `dormant-file-history-input` 排除 `<Path>lib/file-history/**</Path>`，而 `<Path>tests/file-history-production-boundary.test.ts</Path>` 仍断言 `file-history-sqlite` 不得注册。这使 production persistence census、inventory 与 schema fingerprint 和真实 owner 相互矛盾。
- **选项与推荐：** 保持排除会把实际 SQLite owner 从生产清单中隐藏；把 registry/scanner 留给 T-21 会让 W4 的 production cutover 在错误清单下结束；推荐由 T-12 最小接管，并只注册已激活的 File History SQLite store、移除 dormant exclusion、增加 scanner constructor census，并在既有 fingerprint generator 中添加真实 `FileHistoryStore` runtime introspector 后刷新三份 receipt。
- **批准、范围与所有权：** Root Lead 于 `2026-08-10T14:12:37+0800` 批准此 ticket 级 deviation。仅扩展本 Ticket frontmatter 的 persistence registry/scanner、generated inventory/fingerprint/startup receipt 和已列 persistence tests；`lib/file-history/**` 继续为 T-13 read-only，T-21 继续拥有非本项的 manifests、build 与 package inputs。
- **安全不变量与验收：** `file-history-sqlite` 必须成为真实 production store，schema fingerprint 必须由 runtime DDL introspection 生成；禁止重新引入 dormant exclusion、private watcher/baseline，或把绝对 root/store locator 公开。物理 private-store destination 必须在 main Workspace 外，包含 Hana home 既有祖先 symlink 指向 Workspace 的链路。

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

- [x] `AC-009`：N consumers 对 canonical root 始终只有一个 physical watcher。
- [x] `AC-010`：cutover 与恢复全过程 watcher/mutation/baseline overlap 为 0。
- [x] `AC-011`/`AC-012`：production mutation、observation 与 catch-up 进入唯一 EventBus/baseline owner。
- [x] `AC-013`：failure/retry health state 可见且正确。
- [x] 重复 production owner 与兼容开关扫描为零并记录到 `<Path>{roots.state}/specdev/changes/{change}/evidence/T-12.md</Path>`。
