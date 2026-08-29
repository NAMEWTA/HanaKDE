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

T-00 先移除已拒绝的 builtin 工作台；T-01 交付真实工作区加载与安全上下文；T-02 收敛到共享工作台并删除平行 UI；T-03 最后同步和审计 upstream。全部 Ticket 采用 current workspace 严格串行。

## 2. 执行清单

| ID | Ticket | 可观察产出 | Blocked By | Depth | Risk | Ready | Owner | Contract IDs | Status |
|---|---|---|---|---|---|---|---|---|---|
| T-00 | `<Path>{roots.state}/specdev/changes/2026-08-28-knowledge-explorer-convergence/ticket/00-retire-rejected-workbenches.md</Path>` | 两个插件不再加载或打包 | — | standard | medium | yes | root | AC-012 | in_progress |
| T-01 | `<Path>{roots.state}/specdev/changes/2026-08-28-knowledge-explorer-convergence/ticket/01-bind-knowledge-to-active-workspace.md</Path>` | Knowledge 加载当前授权 Desk root | T-00 | deep | high | yes | root | AC-001—AC-005 | ready |
| T-02 | `<Path>{roots.state}/specdev/changes/2026-08-28-knowledge-explorer-convergence/ticket/02-deliver-upstream-explorer-shell.md</Path>` | 共享文件编辑器、文件命令并删除平行 UI | T-01 | standard | medium | yes | root | AC-006—AC-011 | ready |
| T-03 | `<Path>{roots.state}/specdev/changes/2026-08-28-knowledge-explorer-convergence/ticket/03-sync-and-audit-upstream.md</Path>` | 吸收 v0.450.0 并清理无合同差异 | T-02 | deep | high | yes | root | AC-013 | ready |

## 3. 依赖 DAG

`T-00 -> T-01 -> T-02 -> T-03 -> final desktop E2E`

## 4. 合同覆盖矩阵

| Contract | Ticket | 验证接缝 | 状态 |
|---|---|---|---|
| AC-001—AC-005 | T-01 | client、route/security、workspace switch tests | covered |
| AC-006—AC-011 | T-02 | component、route/service、desktop E2E、visual overflow | covered |
| AC-012 | T-00 | PluginManager、route、tool、build inventory | covered |
| AC-013 | T-03 | fixed-point diff ledger、full verification | covered |

无 deferred 或 uncovered 合同。

## 5. 并行与路径所有权

Lead 是唯一 writer；四个 Ticket 严格串行。共享 `<Path>desktop/src/react/components/knowledge-workspace/KnowledgeWorkspace.module.css</Path>` 最终由 T-02 owner 收敛，没有 implementation subagent 或并行写入。
