---
schema_version: 3
artifact: tickets-map
change: 2026-08-12-openhanako-v0-446-6-platform-gates
status: in_progress
---

# Tickets Map: openhanako v0.446.6 平台阻断门后续

## 1. 目标与拆分策略

本 Map 只包含原 change 尚未完结的 T-22、T-23、T-25。原 change 的已完成前置通过来源与 Evidence 引用继承，不复制为新待办。

## 2. 执行清单

| Ticket | 来源 | 目标 | 依赖 | 状态 |
|---|---|---|---|---|
| T-22 | `<Path>{roots.state}/specdev/changes/{change}/ticket/22-windows-blocking-gate.md</Path>` | 真实 Windows native/package Gate | — | blocked |
| T-23 | `<Path>{roots.state}/specdev/changes/{change}/ticket/23-macos-blocking-gate.md</Path>` | 补齐 macOS blocking residuals | — | review |
| T-25 | `<Path>{roots.state}/specdev/changes/{change}/ticket/25-final-umbrella-acceptance.md</Path>` | 重跑 28 AC / 15 DoD final verdict | T-22, T-23 | blocked |

## 3. 依赖 DAG

```text
T-22 ─┐
      ├─→ T-25
T-23 ─┘
```

原 change 已完成的 T-21、T-24、T-26 是外部已验证前置，不作为本 change 的未完成 Ticket。

## 4. 合同覆盖矩阵

| Contract | 覆盖 Ticket | 状态 |
|---|---|---|
| AC-001—AC-028 | T-25 | blocked，待最终 SHA 重跑 |
| AC-009—AC-023、AC-027 | T-22、T-23 | blocked/review |

## 5. 并行与路径所有权

- T-22 只写 `<Path>scripts/platform/windows/**</Path>` 与 `<Path>tests/platform/windows/**</Path>`。
- T-23 只写 `<Path>scripts/platform/macos/**</Path>` 与 `<Path>tests/platform/macos/**</Path>`，并沿用原 Ticket 已批准的 adapter/test 范围。
- T-25 只写后续 Evidence 与状态工件；不得修改产品代码或平台 Gate 结果。
