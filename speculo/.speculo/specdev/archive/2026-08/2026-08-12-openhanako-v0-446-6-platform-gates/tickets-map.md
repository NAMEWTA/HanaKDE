---
schema_version: 3
artifact: tickets-map
change: 2026-08-12-openhanako-v0-446-6-platform-gates
status: completed
---

# Tickets Map: openhanako v0.446.6 平台 Gate 与启动完整性收口

- **Map：** `<Path>{roots.state}/specdev/changes/{change}/tickets-map.md</Path>`
- **Spec：** `<Path>{roots.state}/specdev/changes/{change}/spec.md</Path>`
- **Ticket 目录：** `<Path>{roots.state}/specdev/changes/{change}/ticket/</Path>`
- **Evidence 目录：** `<Path>{roots.state}/specdev/changes/{change}/evidence/</Path>`
- **Goal Plan：** `<Path>{roots.state}/specdev/changes/{change}/goal-plan.md</Path>`

## 1. 目标与拆分策略

当前 change 继续拥有原 T-22/T-23/T-25，并新增垂直产品修复 T-27/T-28/T-29。T-27 交付从安装/launcher preflight 到 Desktop 分类/恢复的完整启动闭环；T-28 收口 Windows NSIS hook 的栈安全；T-29 收口 Win32 secure-write stdin EOF；不按脚本、Desktop、locale 水平拆分。平台 Ticket 保持 harness-only 所有权，在产品 Ticket 稳定后重验；T-25 只读汇合 AC-001—AC-031。

该拆分落实 `ADR-002`—`ADR-004`：产品修复与平台验证 owner 分离，最终 Evidence 必须共享同一包含 T-27 的固定点。

## 2. 执行清单

| ID | Ticket | 可观察产出 | Blocked By | Depth | Risk | Ready | Owner | Contract IDs | Wave/Gate | Status |
|---|---|---|---|---|---|---|---|---|---|---|
| T-27 | `<Path>{roots.state}/specdev/changes/{change}/ticket/27-runtime-dependency-startup-hardening.md</Path>` | 残缺依赖早期失败；开发/打包恢复准确；optional preferences 安静 fallback | — | deep | critical | yes | startup-integrity-owner | AC-029—AC-031 | W0 / G1 | done |
| T-28 | `<Path>{roots.state}/specdev/changes/{change}/ticket/28-windows-installer-stack-safety.md</Path>` | NSIS custom process-check hook 无栈下溢，installer 可安装 | T-27 | deep | critical | yes | windows-installer-owner | AC-027、AC-030 | W0 / G1 | done |
| T-29 | `<Path>{roots.state}/specdev/changes/{change}/ticket/29-windows-secure-write-pipe-eof.md</Path>` | Win32 secure-write helper 正确处理 stdin EOF，Knowledge 写入收敛 | T-27, T-28 | deep | critical | yes | secure-write-owner | AC-015、AC-017、AC-023、AC-027、AC-030 | W0 / G1 | done |
| T-22 | `<Path>{roots.state}/specdev/changes/{change}/ticket/22-windows-blocking-gate.md</Path>` | 真实 Windows native/package/startup/repair 阻断矩阵通过 | T-27, T-28, T-29 | deep | critical | yes | windows-gate-owner | AC-009—AC-010、AC-014—AC-023、AC-027、AC-029—AC-031 | W1 / G2 | done |
| T-23 | `<Path>{roots.state}/specdev/changes/{change}/ticket/23-macos-blocking-gate.md</Path>` | macOS x64/sleep/descriptor/package/startup residual 全部通过 | T-27, T-28, T-29 | deep | critical | no | macos-gate-owner | AC-009—AC-010、AC-012—AC-023、AC-027、AC-029—AC-031 | W1 / G2 | cancelled |
| T-25 | `<Path>{roots.state}/specdev/changes/{change}/ticket/25-final-umbrella-acceptance.md</Path>` | final SHA 上 31 AC、15 DoD、质量、结构与 Evidence 得到 verdict | T-22, T-23 | deep | critical | no | final-acceptance-owner | AC-001—AC-031 | W2 / G3 | done |

Ticket frontmatter 是状态、依赖、深度和路径访问契约权威；本表只做同步投影。

## 3. 依赖 DAG

```text
T-27 [DONE: G1 product fingerprint frozen]
  ├─→ T-28 [DONE: NSIS stack safety]
  └─→ T-29 [DONE: secure-write pipe EOF]
          ├─→ T-22 [DONE: real Windows]
          └─→ T-23 [CANCELLED: user waived unavailable macOS environment rows]
          T-22 ─┐
                ├─→ T-25 [DONE: accepted with explicit waiver]
          T-23 ─┘
```

- **根节点：** T-27。
- **并行扇出：** T-28/T-29 已完成；T-22 已在包含两项修复的固定点通过。用户于 2026-08-22 取消 T-23 中不可用的真实 macOS x64、physical sleep/wake 和 literal descriptor 行。
- **关键汇合：** T-25 已基于现有 Evidence 与 approved waiver 完成。

## 4. 合同覆盖矩阵

| Contract ID | 覆盖 Ticket | 验证接缝 | 状态 | 说明 |
|---|---|---|---|---|
| AC-001—AC-008 | T-25 | ancestry、归档 Evidence、final-SHA 回归 | covered | 原 umbrella 行为由终审确认无回退 |
| AC-009—AC-010 | T-22, T-23, T-25 | 双平台 watcher/cutover + final audit | covered | 两个平台分别阻断 |
| AC-011 | T-25 | ResourceEventBus final-SHA tests | covered | 归档实现、当前回归 |
| AC-012—AC-013 | T-23, T-25 | macOS gap/sleep/health + final audit | covered | Windows 适用行为由 T-22 相关矩阵附加验证 |
| AC-014—AC-023 | T-22, T-23, T-25 | 双平台 security/restore/extraction/Knowledge | covered | platform native 不可互相替代 |
| AC-024—AC-026 | T-25 | component/E2E/security schema | covered | final fixed point 复核 |
| AC-027 | T-22, T-23, T-25 | Windows NSIS、macOS app/DMG、final review | covered | 任一平台失败阻断 |
| AC-028 | T-25 | structural scan、architecture/ledger | covered | 禁止重复和旧兼容状态 |
| AC-029 | T-27, T-22, T-23, T-25 | dependency fixtures/import/launcher + platform smoke | covered | 产品合同由 T-27 owner，平台验证消费者 |
| AC-030 | T-27, T-22, T-23, T-25 | Desktop classification/artifact repair + packaged E2E | covered | 用户确认、白名单、无循环 |
| AC-031 | T-27, T-22, T-23, T-25 | optional JSON + package startup logs | covered | ENOENT 静默，其他错误可观察 |

## 5. 并行与路径所有权

- 配置允许的最大并发为 3；用户要求在当前分支操作并禁止 worktree，因此本次项目写并发固定为 1。
- T-27 是 root manifest、runtime verifier、Desktop startup/readiness 的唯一 shared owner。
- T-22 与 T-23 的平台 Evidence 可由隔离环境分别采集，但当前 workspace 只允许严格串行写入，路径分别限于 Windows/macOS platform harness。
- T-25 仅文档/只读验收，不修改项目路径。
- 不创建 worktree；所有代码、Evidence 和 change 状态均在当前 `hanakde` 分支按 Ticket 顺序同步，不并发覆盖。

| Ticket A | Ticket B | Writable 交集 | 真实依赖 | 处理 |
|---|---|---|---|---|
| T-27 | T-22 | 无项目并发：T-22 blocked_by T-27 | 是 | 串行，T-27 先稳定 shared startup |
| T-27 | T-23 | 无项目并发：T-23 blocked_by T-27 | 是 | 串行，T-27 先稳定 shared startup |
| T-22 | T-23 | 无 | 否 | W1 可并行，分别使用平台隔离环境 |
| T-22 | T-25 | T-25 无项目写入 | 是 | T-25 等平台 Evidence |
| T-23 | T-25 | T-25 无项目写入 | 是 | T-25 等平台 Evidence |

## 6. Gate、Wave 与集成点

| Gate | Wave | 可验证状态 | 关闭条件 |
|---|---|---|---|
| G1 Runtime Integrity Stable | W0: T-27/T-28/T-29 | 安装/launcher/Desktop/native recovery 合同稳定 | T-27/T-28/T-29 done；AC-029—AC-031 与 Windows native write/installer contract 通过；lock/版本不变；Evidence 完整 |
| G2 Native Platforms Passing | W1: T-22, T-23 | 双平台最终 fixed point 可发布性已实测 | 两 Ticket done；Windows/macOS blocking rows 无 skip；package/startup/repair Evidence 新鲜 |
| G3 Umbrella Accepted | W2: T-25 | 31 AC 与 15 DoD 在同一 SHA 通过 | T-25 pass verdict；质量/结构/反向检查通过；无未批准偏差 |

T-27 的 G1 子门曾关闭，随后 T-28 暴露 NSIS 栈安全，T-29 又由 Windows Knowledge 写入诊断出 stdin EOF 错误码缺陷；两项已修复并验证。T-22 已基于最终 Windows 产品指纹完成；实现和 Evidence 经用户授权在当前 `hanakde` 分支 direct-parent 固定到 `f29abef4a7a79ac9eefebe0ed4597f1252a2b29c`。用户于 2026-08-22 取消不可用的 T-23 环境矩阵，T-25 以 accepted-with-waiver verdict 完成；未执行行不声明为 pass。

## 7. 横切契约与风险

- 开发进程不得自动运行 npm 写操作；恢复命令固定使用 Volta 语境。
- artifact repair 仅在 packaged context 和用户确认后运行，白名单与用户数据边界不变。
- blocking platform 行不能被 mock、synthetic package、其他架构或其他 OS 代替。
- 所有 Evidence 记录 SHA、OS/arch、命令、退出状态、失败分类和 cleanup；绝对路径/用户内容脱敏。
- 依赖版本、package-lock、artifact protocol、sign/release 和 legacy migration 均不在范围。

## 8. 同步规则

- Ticket 状态变化后同步本 Map；frontmatter 冲突时以 Ticket 为权威。
- Wave/Gate 与 owner 以 `<Path>{roots.state}/specdev/changes/{change}/goal-plan.md</Path>` 为编排权威。
- T-27 以后任何共享产品路径变化都使 T-22/T-23 受影响 Evidence 过期；T-25 以后任何代码变化都使 final verdict 过期。
- 依赖、合同或路径所有权变化后运行 `<Path>{roots.workflows}/specdev/common/tools/validate-specdev.mjs</Path>`。
