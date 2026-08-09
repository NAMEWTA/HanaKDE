# ADR-0009: CodeMirror 表面通过策略复用

- Status: Accepted
- Date: 2026-08-09
- Source: `<Path>{roots.state}/specdev/archive/2026-07/2026-07-24-openhanako-knowledge-workspace/ADR.md</Path>` (`ADR-0291`)

## 决策上下文

Preview 与 Knowledge 都需要 Markdown 编辑能力，但保存、附件和链接语义不同。

## 决策

两者共用 CM6 表面和扩展，通过 policy 注入保存、附件、链接打开和内容门禁。Preview 保留既有 autosave/checkpoint 语义；Knowledge 使用手动保存、ResourceIO、同级 `assets/` 和 Wikilink。

## 后果

避免复制编辑器实现，同时要求策略边界覆盖所有行为差异。
