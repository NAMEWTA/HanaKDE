---
schema_version: 3
artifact: ticket
change: 2026-08-12-knowledge-workspace-resource-convergence
id: T-01
title: 将活动工作目录绑定为唯一 Knowledge ResourceIO owner
status: done
planning_depth: deep
planning_depth_reason: "跨 core/engine、Knowledge registry、ResourceIO route、operation coordinator 和 workspace lifecycle 的共享核心切换；涉及公共写入事实、scope generation、错误稳定性和可回滚的 owner cutover。"
ready: true
risk: critical
blocked_by: []
contract_ids: [AC-001, AC-002, AC-003, AC-011]
owner: current-implementer
expected_changes: ["<Path>core/engine.ts</Path>", "<Path>server/routes/knowledge-workspace.ts</Path>", "<Path>server/routes/resource-io.ts</Path>", "<Path>tests/knowledge-workspace-route.test.ts</Path>", "<Path>tests/resource-io-route.test.ts</Path>", "<Path>tests/knowledge-workspace-lifecycle.test.ts</Path>", "<Path>tests/engine-resource-events.test.ts</Path>"]
writable_paths: ["<Path>core/engine.ts</Path>", "<Path>server/routes/knowledge-workspace.ts</Path>", "<Path>server/routes/resource-io.ts</Path>", "<Path>tests/knowledge-workspace-route.test.ts</Path>", "<Path>tests/resource-io-route.test.ts</Path>", "<Path>tests/knowledge-workspace-lifecycle.test.ts</Path>", "<Path>tests/engine-resource-events.test.ts</Path>"]
read_only_paths: ["<Path>core/knowledge-workspace/**</Path>", "<Path>lib/knowledge-workspace/**</Path>", "<Path>desktop/src/react/services/knowledge-workspace-client.ts</Path>", "<Path>docs/upstream-sync-ledger.md</Path>"]
shared_paths: []
shared_path_owners: []
---

# Ticket T-01: 将活动工作目录绑定为唯一 Knowledge ResourceIO owner

- **Ticket 文件：** `<Path>{roots.state}/specdev/changes/{change}/ticket/01-bind-main-resource-owner.md</Path>`
- **总体 Map：** `<Path>{roots.state}/specdev/changes/{change}/tickets-map.md</Path>`
- **上游 Spec：** `<Path>{roots.state}/specdev/changes/{change}/spec.md</Path>`
- **完成 Evidence：** `<Path>{roots.state}/specdev/changes/{change}/evidence/T-01.md</Path>`

## 1. 战略与来源

- **目标：** 让聊天/工作台当前选择的工作目录成为 Knowledge `main` 与 Engine/Server 公开 ResourceIO 的同一 workspace-scoped owner，消除保存、创建、删除和 operation commit 的 503 mismatch。
- **可观察产出：** 默认工作目录 fixture 下，Knowledge read/write/create/delete/restore 使用同一 provider scope；切换到新工作目录后旧 scope 的 mutation 被拒绝，新 scope 可用，事件和树缓存不会混用。
- **来源：** `US-001`、`US-002`、`US-006`、`AC-001`、`AC-002`、`AC-003`、`AC-011`、`ADR-001`、`DIAG-001`、`USER-DECISION:2026-08-12-knowledge-resource-convergence`。
- **当前事实：** `<Path>server/routes/knowledge-workspace.ts</Path>` 的 registry/operation entry 和 `<Path>core/engine.ts</Path>` 的 `getResourceIO()` 可创建不同 owner；显式同根注入的测试控制用例通过，默认 composition 的 route mutation 稳定返回 `knowledge_resource_unavailable`。
- **Planning Depth 原因：** owner 是跨层共享写入事实源；切换错误会造成数据完整性、事件顺序和安全 scope 事故，需 stop-old-then-start-new、回滚和结构扫描证据。

## 2. 决策状态

### 已锁定决策

- 活动工作目录是 `main` 的真实根；授权目录仍是 agent/session 边界，不自动成为挂载源。
- Knowledge registry、ResourceIO route、create/copy/trash/atomic coordinator、watcher/index 通过同一 owner 访问，禁止 route 内创建第二 ResourceIO。
- workspace 切换采用 stop-old-then-start-new；旧 scope generation 的 mutation fail closed，错误保持 503 `knowledge_resource_unavailable` / `retryable: true`。
- 不修改 KnowledgeAddress、ResourceIO DTO、sourceKey 语义或磁盘格式；只做现有 seam 的最小 wiring/adapter。

### 已采用的低影响假设

- Engine 已有 workspace close/open 生命周期可作为 owner 释放与重建接缝；若命名不同，沿现有生命周期命名适配，不新增第二套状态机。
- 公开 ResourceIO facade 可以继续由现有 `engine.resourceIO/getResourceIO()` 暴露；仅统一其 backing owner 和 invalidation。

### 未决问题

无。

## 3. 范围边界

| IN（本 Ticket 构建） | REUSE（复用且不改变契约） | OUT（明确不做） |
|---|---|---|
| Engine 与 Knowledge/ResourceIO route 的 owner composition、scope generation、切换 drain/rebuild、默认 fixture regression | 现有 ResourceIO、operation journal、Trash/atomic、Knowledge address/error normalization、workspace lifecycle | 新建 provider、第二 watcher/store/parser、绝对路径 API、授权模型变化、数据迁移、UI 右键菜单 |

## 4. 要构建什么

系统启动并选定工作目录 A 时，Knowledge 的 `main` registry、ResourceIO route 和复合 mutation coordinator 都解析到 A 的同一 owner。编辑器按 expected version 写入后磁盘内容和事件可见；页面/文件夹创建和删除提交不再因 owner mismatch 返回 503。切换到 B 时先停止并使 A 的 owner/scope 失效，再建立 B；任何携带 A generation 的旧请求在 effect 前返回既有 unavailable，B 的读写只触及 B。ResourceIO 仍在 expected-version 冲突时返回 conflict，不覆盖新内容。

## 5. 实现契约

- **入口或接缝：** `<Path>core/engine.ts</Path>` ResourceIO lifecycle、`<Path>server/routes/knowledge-workspace.ts</Path>` registry/resource operation composition、`<Path>server/routes/resource-io.ts</Path>` public facade、workspace switch/close hooks。
- **输入与输出：** active work directory + existing engine lifecycle → one owner reference per scope; Knowledge/ResourceIO requests with source-relative address and optional expected version → existing result or normalized unavailable/conflict error。
- **公共接口变化：** 无；若必须暴露内部 owner/scope handle，只能是非 DTO、向后兼容的内部接缝。
- **不变量：** `sourceKey: main` 只解析活动工作目录；一个 scope 只有一个 owner；旧 generation 不接受 mutation；operation/event/index/tree 共用同一 scope；无部分写入。
- **状态或数据流：** open A → create owner/registry/coordinator binding → recover barrier → serve mutations → close A/drain/invalidate → open B/rebind → reject stale A → serve B。
- **错误与失败行为：** owner 未建立、切换 drain、旧 scope、provider 不可用统一返回 503 retryable；expected-version mismatch 保持既有 409/conflict；失败前不得改变磁盘或 journal 状态。
- **兼容要求：** Desk、History、Agent file-change、挂载来源和已有显式 ResourceIO 注入 fixture 保持行为；不得把挂载或授权目录重命名为工作目录语义。
- **安全与隐私要求：** 只使用 source-relative address、provider scope 和现有 Native Grant；不向 renderer 或错误详情泄漏 raw absolute root。

## 6. 执行路线

1. 扩展默认工作目录 route/composition fixture，使 save/create/delete/restore 和 owner identity 在当前基线按目标失败，并保留显式同根注入控制用例。
2. 将 Engine `getResourceIO()`、Knowledge registry、operation entry 和 ResourceIO route 绑定到活动工作目录的同一 owner seam，移除/旁路临时 sandbox owner。
3. 接入 workspace close/switch 的 stop-old-then-start-new、drain/recovery barrier 和 scope generation 校验；旧请求在 effect 前 fail closed。
4. 运行 route、ResourceIO、lifecycle 与 event/index 定向回归，确认磁盘事实、request hash、operation state 和事件序列一致。
5. 扫描 production owner/watcher/provider 创建点，确认没有新增第二 ResourceIO owner；形成可供后续 UI/clipboard Ticket 消费的稳定 composition。

## 7. 路径访问契约

- **预计修改点：** 与 frontmatter `expected_changes` 对齐的 Engine、server route 和后端 route/lifecycle tests。
- **可写范围：** 仅 frontmatter `writable_paths`；不得修改 desktop UI、shared DTO 或 docs ledger。
- **只读上下文：** Knowledge services、client、clipboard、Desk actions、永久 ADR/context 和 upstream ledger。
- **共享路径：** 无；本 Ticket 是 owner composition 的唯一生产 owner。
- **保留或不动：** `<Path>shared/knowledge-workspace-contract.ts</Path>`、`<Path>lib/knowledge-workspace/**</Path>` 的协议和服务实现不作契约重写。

## 8. 验证矩阵

| 行为或风险 | 验证接缝 | 命令或步骤 | 预期结果 | Evidence |
|---|---|---|---|---|
| 默认根正常读写 | route composition | `npm test -- --run tests/knowledge-workspace-route.test.ts tests/resource-io-route.test.ts` | save/create/delete/restore 使用活动目录同一 owner，磁盘事实正确 | `<Path>{roots.state}/specdev/changes/{change}/evidence/T-01.md</Path>` |
| expected-version 失败 | ResourceIO public route | 定向匹配版本与过期版本用例 | 匹配写入成功；过期写入 conflict 且不覆盖 | `<Path>{roots.state}/specdev/changes/{change}/evidence/T-01.md</Path>` |
| workspace switch | lifecycle composition | `npm test -- --run tests/knowledge-workspace-lifecycle.test.ts` | A→B stop-old/start-new；A mutation unavailable，B 可用，事件不混源 | `<Path>{roots.state}/specdev/changes/{change}/evidence/T-01.md</Path>` |
| provider/owner 失败 | route failure tests | owner unavailable/drain fixture | 503 retryable，effect 前无部分写入 | `<Path>{roots.state}/specdev/changes/{change}/evidence/T-01.md</Path>` |
| 回归与结构 | typecheck + owner scan | `npm run typecheck`；扫描 Engine/server 中 ResourceIO 创建点 | 无 DTO/安全回退；无第二生产 owner | `<Path>{roots.state}/specdev/changes/{change}/evidence/T-01.md</Path>` |

## 9. 发布、迁移与恢复

- **迁移顺序：** 先测试接缝与内部 binding，再接 workspace switch；T-02/T-03/T-04 只能消费完成后的 owner 行为；T-05/T-06 才运行跨层 Gate。
- **兼容窗口：** 保留既有 `engine.resourceIO` 显式注入和错误 DTO；不保留双 owner 并行窗口。
- **监控信号：** owner 创建/释放、scope generation、drain 时长、503 unavailable、operation recovery barrier、事件 sequence gap。
- **回滚或前向恢复：** 若新 owner 无法建立，停止新绑定并将 Knowledge 标记 unavailable，保留旧磁盘事实；修复后从当前活动根重新 open/recover，不自动重放 mutation。
- **不可逆操作与批准点：** 无数据迁移或永久删除；任何生产发布/合并需另行授权。
- **收缩条件：** Knowledge/ResourceIO/operation/watcher 的重复 owner 创建点为零，并有扫描与 route evidence；无旧 root fallback。

## 10. 验收标准

- [x] `AC-001`：默认活动工作目录下保存、创建页面/文件夹、删除/恢复共享同一 owner，相关用户报告的 503 消失且磁盘事实正确。
- [x] `AC-002`：expected-version 匹配写入成功，过期写入保持冲突且不覆盖。
- [x] `AC-003`：切换工作目录后旧 scope mutation 被拒绝，新 scope 独占读写且 watcher/index/tree 不混用。
- [x] `AC-011`：stale scope/event 只触发既有 resync，不回滚新事实。
- [x] 验证矩阵全部执行并记录到 `<Path>{roots.state}/specdev/changes/{change}/evidence/T-01.md</Path>`。
- [x] 实际项目修改未超出 `writable_paths`，无未批准契约或范围偏差。
