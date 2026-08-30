---
schema_version: 3
artifact: tickets-map
change: 2026-08-29-todolist-backend-reliability
status: done
---

# Tickets Map: Todo 后台可靠性

- **Spec：** `<Path>{roots.state}/specdev/changes/2026-08-29-todolist-backend-reliability/spec.md</Path>`
- **Ticket：** `<Path>{roots.state}/specdev/changes/2026-08-29-todolist-backend-reliability/ticket/01-restore-todo-host-backend.md</Path>`
- **Ticket：** `<Path>{roots.state}/specdev/changes/2026-08-29-todolist-backend-reliability/ticket/02-align-todo-ui-and-ai-tools.md</Path>`
- **Evidence：** `<Path>{roots.state}/specdev/changes/2026-08-29-todolist-backend-reliability/evidence/T-01.md</Path>`

## 1. 拆分策略

后台故障与视觉合同分别用两个 standard Ticket 串行覆盖；两者共享同一 Todo 发布单元，但 UI 收敛不得改写已验证的领域和宿主合同。

## 2. 执行清单

| ID | 可观察产出 | Blocked By | Risk | Ready | Owner | Contract IDs | Status |
|---|---|---|---|---|---|---|---|
| T-01 | 真实宿主 task backend ready；Todo/Project CRUD 和完整关联能力通过 | — | medium | yes | root | AC-001—AC-006 | done |
| T-02 | Todo 继承系统设计语言；AI 工具目录完整且可验证 | T-01 | medium | yes | root | AC-007—AC-008 | done |

单 Ticket 由 root 在 current workspace 串行完成；没有并行 writer 或共享路径争用。

## 3. 依赖 DAG

`T-01 -> T-02 -> repository gates -> b0c74282 direct-parent integration`

## 4. 合同覆盖矩阵

| Contract | Ticket | 验证接缝 | 状态 |
|---|---|---|---|
| AC-001 | T-01 | ordering test + real status | covered |
| AC-002/003 | T-01 | real Hono routes + disk Store | covered |
| AC-004 | T-01 | browser UI timeout/dispose test | covered |
| AC-005 | T-01 | authenticated Desktop page CRUD | covered |
| AC-006 | T-01 | complete plugin verify | covered |
| AC-007 | T-02 | CSS contract + authenticated Desktop screenshot | covered |
| AC-008 | T-02 | exact AI tool catalog contract | covered |

无 deferred 或 uncovered 合同。

## 5. 并行与路径所有权

root 是唯一 writer，使用 current workspace 严格串行。只修改 Ticket frontmatter 声明的宿主、Todo 和 SpecDev 路径；其他既有 dirty worktree 内容不纳入本 Ticket。
