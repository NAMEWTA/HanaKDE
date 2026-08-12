---
schema_version: 3
artifact: spec
change: 2026-08-12-openhanako-v0-446-6-platform-gates
status: ready
ready_for_tickets: true
sources:
  - "<Path>{roots.state}/specdev/changes/2026-08-09-openhanako-v0-446-6-integration/spec.md</Path>"
  - "<Path>{roots.state}/specdev/changes/2026-08-09-openhanako-v0-446-6-integration/evidence/T-22.md</Path>"
  - "<Path>{roots.state}/specdev/changes/2026-08-09-openhanako-v0-446-6-integration/evidence/T-23.md</Path>"
  - "<Path>{roots.state}/specdev/changes/2026-08-09-openhanako-v0-446-6-integration/evidence/T-25.md</Path>"
---

# Spec: openhanako v0.446.6 平台阻断门与最终验收后续

## 1. 问题与目标

原 umbrella change 的功能整合与本地质量验证已完成，但真实 Windows 运行矩阵以及 macOS 的 x64、物理 sleep/wake、literal descriptor 证据尚未完成。此 change 只承接这些未完结 Gate，并在平台证据更新后重跑最终 umbrella 验收。

## 2. 解决方案与外部行为

复用原 change 已集成的产品固定点、T-21 package inputs、T-22/T-23 harness 和 T-25 验收合同。Windows 必须真实运行；macOS 必须补齐原 Evidence 明确列出的残余。任何关键项无法运行都保持 blocked，不以 mock、skip 或其他平台替代。

## 4. 验收合同

本后续 change 重新验证原 umbrella 的 AC-001 至 AC-028，最终判定由 T-25 统一给出；平台 Ticket 重点覆盖 AC-009 至 AC-023 与 AC-027。

显式合同清单：AC-001、AC-002、AC-003、AC-004、AC-005、AC-006、AC-007、AC-008、AC-009、AC-010、AC-011、AC-012、AC-013、AC-014、AC-015、AC-016、AC-017、AC-018、AC-019、AC-020、AC-021、AC-022、AC-023、AC-024、AC-025、AC-026、AC-027、AC-028。

## 5. 范围

- IN：`<Path>scripts/platform/windows/**</Path>`、`<Path>tests/platform/windows/**</Path>`、`<Path>scripts/platform/macos/**</Path>`、`<Path>tests/platform/macos/**</Path>`、平台 Evidence 与最终验收 Evidence。
- REUSE：原 change 已归档的 T-01..T-21、T-24、T-26 证据与当前项目代码。
- OUT：产品功能重构、迁移、签名/公证/发布、远程写入及真实用户数据。

## 9. 验证策略

在真实平台执行平台 runner、native/package smoke、直接用户流程和清理审计；随后以最终固定 SHA 重跑 T-25 的全合同、DoD、结构和质量检查。

## 10. 风险、假设与未决问题

Windows runner availability 和 macOS x64/sleep hardware 是当前阻断因素；没有新的产品决策待确认。
