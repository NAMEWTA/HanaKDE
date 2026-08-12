---
schema_version: 3
artifact: ticket
change: 2026-08-12-knowledge-workspace-resource-convergence
id: T-04
title: 收敛 Knowledge 剪切复制粘贴来源边界
status: done
planning_depth: standard
planning_depth_reason: "跨 clipboard slice、Knowledge tree/layout 和既有 paste/copy service 的行为 vertical slice；涉及来源隔离和原子 mutation，但不改变 DTO 或磁盘协议。"
ready: true
risk: high
blocked_by: [T-01, T-03]
contract_ids: [AC-009, AC-010, AC-011]
owner: current-implementer
expected_changes: ["<Path>desktop/src/react/stores/knowledge-clipboard-slice.ts</Path>", "<Path>desktop/src/react/components/knowledge-workspace/KnowledgeResourceTree.tsx</Path>", "<Path>desktop/src/react/components/knowledge-workspace/KnowledgeLayout.tsx</Path>", "<Path>desktop/src/react/__tests__/stores/knowledge-clipboard-slice.test.ts</Path>", "<Path>tests/knowledge-copy-service.test.ts</Path>", "<Path>tests/knowledge-workspace-clipboard-route.test.ts</Path>"]
writable_paths: ["<Path>desktop/src/react/stores/knowledge-clipboard-slice.ts</Path>", "<Path>desktop/src/react/components/knowledge-workspace/KnowledgeResourceTree.tsx</Path>", "<Path>desktop/src/react/components/knowledge-workspace/KnowledgeLayout.tsx</Path>", "<Path>desktop/src/react/__tests__/stores/knowledge-clipboard-slice.test.ts</Path>", "<Path>tests/knowledge-copy-service.test.ts</Path>", "<Path>tests/knowledge-workspace-clipboard-route.test.ts</Path>"]
read_only_paths: ["<Path>desktop/src/react/components/knowledge-workspace/CreateResourceDialog.tsx</Path>", "<Path>desktop/src/react/services/knowledge-workspace-client.ts</Path>", "<Path>core/knowledge-workspace/**</Path>", "<Path>lib/knowledge-workspace/**</Path>"]
shared_paths: []
shared_path_owners: []
---

# Ticket T-04: 收敛 Knowledge 剪切复制粘贴来源边界

- **Ticket 文件：** `<Path>{roots.state}/specdev/changes/{change}/ticket/04-converge-knowledge-clipboard-boundaries.md</Path>`
- **总体 Map：** `<Path>{roots.state}/specdev/changes/{change}/tickets-map.md</Path>`
- **上游 Spec：** `<Path>{roots.state}/specdev/changes/{change}/spec.md</Path>`
- **完成 Evidence：** `<Path>{roots.state}/specdev/changes/{change}/evidence/T-04.md</Path>`

## 1. 战略与来源

- **目标：** 让 Knowledge 剪贴板携带 workspace/source scope；同源 cut/paste 使用已有原子 move，跨来源 cut 在提交前 fail closed，跨来源 copy 创建普通副本且保持源和链接文本不变。
- **可观察产出：** 同源剪切后源消失、目标出现且只产生一次 operation/event/tree projection；跨来源剪切提示改用 copy 且源不变；跨来源复制目标出现、源和正文链接不变；混合选择/旧 workspace clipboard 不会产生部分写入。
- **来源：** `US-005`、`AC-009`、`AC-010`、`AC-011`、`ADR-002`、`DEC-003`、`USER-DECISION:2026-08-12-knowledge-resource-convergence`。
- **当前事实：** `<Path>desktop/src/react/stores/knowledge-clipboard-slice.ts</Path>` 已保存 workspace/source scope 并拒绝混合来源；`KnowledgeLayout` 已有 toolbar copy/cut/paste；tree drag/drop 已调用 `pasteResources`，但右键 wiring/跨来源 cut fail-closed 与单次 projection 证据不足。
- **Planning Depth 原因：** 来源边界和 move/copy 语义涉及数据完整性和安全，必须通过 service/route integration 证明无部分写入。

## 2. 决策状态

### 已锁定决策

- source-relative address 是唯一 clipboard payload；workspace key 不匹配时 clipboard 失效。
- 同源 `cut` 才是 move；跨来源 `cut` 拒绝，不静默降级为 copy；跨来源 `copy` 保持源不变和正文/链接文本原样。
- 混合来源选择、目标冲突、owner unavailable、版本冲突均在 effect 前拒绝或逐项结果化，不做部分写入。
- 复用现有 `pasteResources`、copy service、operation journal、Trash/event seam，不新建 transfer protocol。

### 已采用的低影响假设

- 现有 `KnowledgeWorkspaceClient.pasteResources` 可以表达 intent/addresses/target；若需补充受限错误字段，保持向后兼容并由 route contract 测试锁定。
- 右键动作由 T-03 提供入口，本 Ticket 只接入 clipboard intent/target 和结果投影。

### 未决问题

无。

## 3. 范围边界

| IN（本 Ticket 构建） | REUSE（复用且不改变契约） | OUT（明确不做） |
|---|---|---|
| clipboard scope guard、同源 move、跨源 cut rejection/copy、一次性结果/tree projection、相关 store/layout/service/route tests | existing clipboard slice、pasteResources、copy service、operation journal、source-local Trash/events | 跨来源 move、自动链接重写、永久删除、文件协议/DTO 重写、第二 clipboard store |

## 4. 要构建什么

用户选中同一来源的资源并执行 cut，在目标目录 paste。客户端验证 workspace/source scope 后调用既有 cut operation；成功结果只应用一次，源从树消失、目标出现。用户把来源 A 的 cut 粘到来源 B 时，客户端/服务在提交前明确拒绝，源保持不变并显示改用 copy；用户执行 copy 时服务创建普通副本，源与正文链接保持原样。若 clipboard 属于旧 workspace、选择混合 source、目标冲突或 owner unavailable，mutation 不产生部分事实，结果按既有 structured error/逐项结果显示。

## 5. 实现契约

- **入口或接缝：** clipboard slice active scope、KnowledgeLayout/tree context action、`KnowledgeWorkspaceClient.pasteResources`、copy/operation route。
- **输入与输出：** intent + source-relative addresses + target source/directory + workspace key → per-item result; cut success returns move projection, cross-source cut returns stable rejection, copy returns created target addresses.
- **公共接口变化：** 目标不变；若需要错误 detail，采用可选字段，不暴露绝对路径。
- **不变量：** cut 不会隐式变 copy；copy 不删除源；同一 operation/event/tree projection 只应用一次；旧 scope clipboard 不可提交；源内容/链接文本不被重写。
- **状态或数据流：** select → store scope → paste preflight(source/workspace/target) → existing copy/move operation → journal/Trash/events → refresh/clipboard failure retention。
- **错误与失败行为：** cross-source cut、mixed source、stale scope、conflict/version/owner unavailable 均 fail closed 或逐项失败；失败源不删除，不掩盖 retryability。
- **兼容要求：** drag/drop 和 toolbar paste 保持既有语义；Desk/native file clipboard 入口继续独立工作。
- **安全与隐私要求：** provider/source scope 在服务端重新校验；renderer 不直接 FS、不传 raw absolute root。

## 6. 执行路线

1. 为 store/client/route 固定同源 cut、跨源 cut、跨源 copy、旧 workspace/mixed selection 和 conflict 的红灯测试。
2. 将右键/toolbar/drag paste 统一经过同一 scope preflight，拒绝旧或混合 clipboard。
3. 保持同源 cut 使用既有 atomic move/journal，跨源 cut 明确错误，copy 调用现有 copy service 并保留源。
4. 收敛一次性 result/event/tree projection 与失败 clipboard retention；不新增 watcher。
5. 运行 clipboard/store、copy service、route/event 回归，检查正文/链接和磁盘事实。

## 7. 路径访问契约

- **预计修改点：** clipboard slice、Knowledge tree/layout、clipboard/service/route tests。
- **可写范围：** frontmatter `writable_paths`；clipboard route 覆盖使用独立的 `<Path>tests/knowledge-workspace-clipboard-route.test.ts</Path>`，避免与 T-01 的 composition route fixture 争用。
- **只读上下文：** CreateResourceDialog、Knowledge client contracts、core/lib copy/operation/Trash。
- **共享路径：** 无。
- **shared path owner：** 不适用；T-01 的 owner composition route fixture 与本 Ticket 的 clipboard route fixture 分离。
- **保留或不动：** 不改 shared DTO、copy service 链接语义和 Desk clipboard。

## 8. 验证矩阵

| 行为或风险 | 验证接缝 | 命令或步骤 | 预期结果 | Evidence |
|---|---|---|---|---|
| 同源 cut/paste | store + route integration | clipboard slice tests + `npm test -- --run tests/knowledge-workspace-route.test.ts` | 一次 move，源消失目标出现，事件/tree 定位一次 | `<Path>{roots.state}/specdev/changes/{change}/evidence/T-04.md</Path>` |
| 跨来源 cut | route/service integration | 构造 A→B cut | 提交前拒绝，源/目标不变并提示 copy | `<Path>{roots.state}/specdev/changes/{change}/evidence/T-04.md</Path>` |
| 跨来源 copy | copy service integration | `npm test -- --run tests/knowledge-copy-service.test.ts` | 普通副本成功，源和正文链接不变 | `<Path>{roots.state}/specdev/changes/{change}/evidence/T-04.md</Path>` |
| stale/mixed/conflict | store + route failure tests | 旧 workspace clipboard、混合 source、目标冲突、owner unavailable | 无部分写入；稳定错误/逐项结果；失败 cut 源保留 | `<Path>{roots.state}/specdev/changes/{change}/evidence/T-04.md</Path>` |
| 回归 | drag/drop and toolbar | Knowledge tree/layout tests | 既有 drag/drop、toolbar copy/paste 不回归 | `<Path>{roots.state}/specdev/changes/{change}/evidence/T-04.md</Path>` |

## 9. 发布、迁移与恢复

- **迁移顺序：** 先 scope/preflight，再各入口迁移；不需要 expand-contract 数据迁移。
- **兼容窗口：** 保留现有 clipboard payload 字段；新增拒绝结果只作可选 detail，旧 client 仍可识别失败。
- **监控信号：** operation id/request hash、source scope rejection、copy/move result、event sequence 和失败保留项。
- **回滚或前向恢复：** 失败 operation 由既有 journal/Trash recovery 处理；UI 可清空 clipboard 后重试 copy，不自动重放 cut。
- **不可逆操作与批准点：** move/delete 继续使用既有 atomic/Trash 确认；无新不可逆点。
- **收缩条件：** 所有 Knowledge cut/copy/paste 入口共用同一 scope preflight，无旁路 move/copy 实现。

## 10. 验收标准

- [x] `AC-009`：同源 cut/paste 是一次 move，源/目标和事件投影正确。
- [x] `AC-010`：跨来源 cut fail closed；跨来源 copy 保持源与正文链接不变。
- [x] `AC-011`：stale/mixed/conflict 不产生部分写入且只触发必要 resync。
- [x] 正常、失败、回归证据记录到 `<Path>{roots.state}/specdev/changes/{change}/evidence/T-04.md</Path>`。
