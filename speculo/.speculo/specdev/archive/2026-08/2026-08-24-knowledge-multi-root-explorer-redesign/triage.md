---
schema_version: 1
artifact: triage
change: 2026-08-24-knowledge-multi-root-explorer-redesign
mode: intake
source: <Path>{roots.state}/specdev/changes/2026-08-24-knowledge-multi-root-explorer-redesign/source.md</Path>
classification: feature
risk: medium
route: specdev/spec
ready_for_implementation: true
external_action: not-applicable
updated_at: 2026-08-25T22:39:44+08:00
---

# Triage: Knowledge 多根 Explorer 与工作台树行统一

## 当前判定

- **影响：** 收敛 Knowledge Renderer 的多根 Explorer 和 Desk/Knowledge 树行视觉，不改变后端 DTO、ResourceIO、持久化或来源注册。
- **紧急度：** normal
- **当前证据：** Source 已冻结用户批准的 UI 目标；实现提交 `18310e5e7afef6a392b4786a8ab2269cb298d059` 已在 `hanakde` 历史中，组件、构建和 Node 24 server-backed E2E 均通过。
- **相关代码/工件：** `<Path>desktop/src/react/components/knowledge-workspace/</Path>`、`<Path>desktop/src/react/components/shared/WorkspaceTreeRow.tsx</Path>`、`<Path>{roots.state}/specdev/changes/2026-08-24-knowledge-multi-root-explorer-redesign/evidence/direct-spec.md</Path>`。

## 未知项

- **可发现事实：** 无。
- **需要用户决定：** 无；计划和 Direct Spec 实施已获批准。
- **低影响实现细节：** 无；change 已由实际实现和验证闭环。

## 路由

- **下一 Work：** `<Path>{roots.workflows}/specdev/A-archive-and-consolidate/A-archive-and-consolidate.md</Path>`
- **理由：** Direct Spec 验收、实现证据、E2E 和完成门均通过，且没有远程来源需要 reconcile。

## 外部动作

- **远程目标：** 无
- **关闭能力：** not-applicable
- **当前状态：** not-applicable
- **授权记录：** 无需远程动作
- **尝试与结果：** 无

外部动作只投影最终完成，不替代本地状态、Spec 或 Evidence。
