# ADR-0011: 外部冲突采用显式三方解决

- Status: Accepted
- Date: 2026-08-09
- Source: `<Path>{roots.state}/specdev/archive/2026-07/2026-07-24-openhanako-knowledge-workspace/ADR.md</Path>` (`ADR-0293`)

## 决策上下文

外部工具可在本地编辑期间修改磁盘，静默覆盖或自动合并都会造成数据风险。

## 决策

无本地修改时 watcher 可触发重读；有本地修改时阻止保存并保留 baseline/local/disk，要求用户选择合并、保留本地或采用磁盘版本。

## 后果

冲突不会静默丢失数据，但用户必须完成显式处置才能继续保存。
