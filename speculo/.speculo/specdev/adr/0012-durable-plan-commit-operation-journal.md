# ADR-0012: 复合操作使用持久 plan-commit journal

- Status: Accepted
- Date: 2026-08-09
- Sources: `<Path>{roots.state}/specdev/archive/2026-07/2026-07-24-openhanako-knowledge-workspace/ADR.md</Path>` (`ADR-0294`, `ADR-0302`)

## 决策上下文

纯内存 plan/commit 无法解释进程在主资源变更、链接部分写入或 rollback 期间崩溃后的真实结果。

## 决策

公开协议包含不可变 plan、expected versions、operation id、checkpoint、commit 和逐项结果。每个 mutation 用持久 Operation Journal 记录 intent 与 outcome；Server 暴露 mutation route 前必须通过恢复屏障。重复 commit 需幂等，过期 plan 必须拒绝。

## 后果

“原子”表示可恢复的事务性用户结果，而非跨文件、进程和 SQLite 的瞬时物理原子；启动增加恢复阶段并保留少量操作元数据。
