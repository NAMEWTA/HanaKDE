# ADR-0008: Renderer 与 Server 共享 Markdown 语义 IR

- Status: Accepted
- Date: 2026-08-09
- Source: `<Path>{roots.state}/specdev/archive/2026-07/2026-07-24-openhanako-knowledge-workspace/ADR.md</Path>` (`ADR-0290`)

## 决策上下文

编辑、链接、索引和重构必须对相同文本给出一致语义，但 CodeMirror parse tree 不适合作为 Server 契约。

## 决策

两端共享文本范围、token 和规范化规则；CM6 syntax tree 只存在 Renderer。LinkResolver、索引、Frontmatter、标签、任务和编辑器扩展消费同一语义契约或一致语料。

## 后果

跨层语义可测试且不绑定 UI parser 内部结构，需要维护公共 IR 和对照 fixtures。
