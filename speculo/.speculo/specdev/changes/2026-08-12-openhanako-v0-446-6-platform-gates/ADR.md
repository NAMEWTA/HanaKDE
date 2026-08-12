# ADR: 平台阻断 Gate 独立后续化

## Decision

将未完成的 Windows/macOS blocking Gate 与依赖它们的 umbrella final acceptance 从已完成的整合 change 拆为独立后续 change；已完成实现与质量 Evidence 作为只读前置归档。

## Consequences

原 change 可以在完成门通过后归档，平台未验证事实不会被覆盖；后续 change 保持 active，直到真实平台 Evidence 和 T-25 final verdict 完成。

## Source

`<Path>{roots.state}/specdev/changes/2026-08-09-openhanako-v0-446-6-integration/evidence/T-22.md</Path>`、`<Path>{roots.state}/specdev/changes/2026-08-09-openhanako-v0-446-6-integration/evidence/T-23.md</Path>`、`<Path>{roots.state}/specdev/changes/2026-08-09-openhanako-v0-446-6-integration/evidence/T-25.md</Path>`
