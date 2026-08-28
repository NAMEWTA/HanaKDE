---
schema_version: 3
artifact: tickets-map
change: 2026-08-28-knowledge-explorer-convergence
status: ready
---

# Tickets Map: Knowledge Explorer 收敛

- **Spec：** `<Path>{roots.state}/specdev/changes/2026-08-28-knowledge-explorer-convergence/spec.md</Path>`
- **Ticket 目录：** `<Path>{roots.state}/specdev/changes/2026-08-28-knowledge-explorer-convergence/ticket/</Path>`
- **Evidence 目录：** `<Path>{roots.state}/specdev/changes/2026-08-28-knowledge-explorer-convergence/evidence/</Path>`

## 1. 拆分策略

T-01 先交付可独立验证的真实工作区加载与安全上下文；T-02 只在该数据链路成立后重组 UI 并做最终 E2E。两个 Ticket 采用 current workspace 严格串行。

## 2. 执行清单

| ID | Ticket | 可观察产出 | Blocked By | Depth | Risk | Ready | Owner | Contract IDs | Status |
|---|---|---|---|---|---|---|---|---|---|
| T-01 | `<Path>{roots.state}/specdev/changes/2026-08-28-knowledge-explorer-convergence/ticket/01-bind-knowledge-to-active-workspace.md</Path>` | Knowledge 加载当前授权 Desk root | — | deep | high | yes | root | AC-001—AC-005 | ready |
| T-02 | `<Path>{roots.state}/specdev/changes/2026-08-28-knowledge-explorer-convergence/ticket/02-deliver-upstream-explorer-shell.md</Path>` | 共享文件编辑器、文件命令与插件页面恢复 | T-01 | standard | medium | yes | root | AC-006—AC-012 | ready |

## 3. 依赖 DAG

`T-01 -> T-02 -> final desktop E2E`

## 4. 合同覆盖矩阵

| Contract | Ticket | 验证接缝 | 状态 |
|---|---|---|---|
| AC-001—AC-005 | T-01 | client、route/security、workspace switch tests | covered |
| AC-006—AC-012 | T-02 | component、route/service、desktop E2E、visual overflow | covered |

无 deferred 或 uncovered 合同。

## 5. 并行与路径所有权

Lead 是唯一 writer；两个 Ticket 严格串行。共享 `<Path>desktop/src/react/components/knowledge-workspace/KnowledgeWorkspace.module.css</Path>` 最终由 T-02 owner 收敛，没有 implementation subagent 或并行写入。
