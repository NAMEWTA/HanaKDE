# ADR-0003: 附加来源按会话隔离

- Status: Accepted
- Date: 2026-08-09
- Source: `<Path>{roots.state}/specdev/archive/2026-07/2026-07-24-openhanako-knowledge-workspace/ADR.md</Path>` (`ADR-0285`)

## 决策上下文

多来源必须避免地址、索引和链接域互相渗透，也不能把历史挂载自动带入新会话。

## 决策

`main` 与每个附加来源拥有独立文件、地址、索引、标签和引用域。来源根必须由 provider 证明互不重叠；附加来源不自动恢复，稳定根只可复用历史 `sourceKey`。

## 后果

跨来源隔离可验证；用户每次会话需要显式挂载额外来源。
