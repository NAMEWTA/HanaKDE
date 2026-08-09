# ADR-0007: 知识链接与重构严格同源

- Status: Accepted
- Date: 2026-08-09
- Source: `<Path>{roots.state}/specdev/archive/2026-07/2026-07-24-openhanako-knowledge-workspace/ADR.md</Path>` (`ADR-0289`)

## 决策上下文

跨来源猜测目标会破坏隔离、可移植性和重构确定性。

## 决策

Wikilink 以来源根为基准，Markdown 文件链接以引用页面目录为基准，解析结果必须留在相同 `sourceKey`。禁止跨来源回退、按文件名猜测或用搜索结果补目标；跨来源只做保持正文不变的字节复制。

## 后果

链接语义确定且来源可独立移动，跨来源引用需要显式复制流程。
