# ADR-0021: 实现前必须通过可执行仓库 Preflight

- Status: Accepted
- Date: 2026-08-09
- Source: `<Path>{roots.state}/specdev/archive/2026-07/2026-07-24-openhanako-knowledge-workspace/ADR.md</Path>` (`ADR-0306`)

## 决策上下文

文档内部一致不能证明当前分支、Node、scripts、依赖和关键接缝仍符合设计时基线。

## 决策

实现前运行可执行 preflight，检查 Git 祖先关系、Node、package、关键接缝、依赖和 SilverBullet hashes。允许基线后的正常前进提交；dirty 工作树只警告并保护用户修改。

## 后果

契约漂移会在编码前阻断，开发者无需被锁定到单个 exact HEAD。
