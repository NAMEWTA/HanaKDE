# ADR-0006: 已保存磁盘内容是唯一持久知识事实

- Status: Accepted
- Date: 2026-08-09
- Source: `<Path>{roots.state}/specdev/archive/2026-07/2026-07-24-openhanako-knowledge-workspace/ADR.md</Path>` (`ADR-0288`)

## 决策上下文

Renderer buffer、磁盘和可重建索引可能短暂不一致，需要确定持久事实源。

## 决策

未保存 buffer 只属于文档会话。索引按来源分区、可丢弃且只读取成功保存的磁盘版本；当前 outline/outbound 可读 buffer，Server backlinks、tags 和 search 只读已保存索引。

## 后果

查询结果具有可重建事实基础，但未保存编辑不会出现在 Server 级搜索和反向引用中。
