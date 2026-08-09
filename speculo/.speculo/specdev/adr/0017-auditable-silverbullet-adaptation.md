# ADR-0017: SilverBullet 复用必须可审计

- Status: Accepted
- Date: 2026-08-09
- Source: `<Path>{roots.state}/specdev/archive/2026-07/2026-07-24-openhanako-knowledge-workspace/ADR.md</Path>` (`ADR-0299`)

## 决策上下文

SilverBullet 2.9.0 可提供实现参考，但直接搬运会带来架构、身份和许可证风险。

## 决策

允许研究、独立改写或小范围复用 MIT 代码；每项记录本地文件、SHA-256、采用方式、目标位置和 notice 义务。禁止移植其 Preact/Rust/Lua/plugin/query runtime，也不采用其 Space identity。

## 后果

来源和许可证可追溯，但任何参考快照漂移或复用范围变化都需要更新审计矩阵。
