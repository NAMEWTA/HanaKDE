# ADR-0015: 索引按来源分区并通过 generation 切换

- Status: Accepted
- Date: 2026-08-09
- Sources: `<Path>{roots.state}/specdev/archive/2026-07/2026-07-24-openhanako-knowledge-workspace/ADR.md</Path>` (`ADR-0297`, `ADR-0303`)

## 决策上下文

索引是可重建派生数据，但需处理来源隔离、Windows 打开句柄、取消 rebuild、并发旧查询和 schema 演进。

## 决策

每来源使用独立 `better-sqlite3` generation，由 `current.json` 原子指向当前可查询版本。schema 变化执行 rebuild；切换前 checkpoint/关闭 WAL。连续子串由 folded FTS5 trigram 候选加 `instr` 确认，短查询使用受限扫描。

## 后果

失败或取消可保留旧 generation；系统需要 writer lock、query lease、短查询预算和旧 generation 清理。
