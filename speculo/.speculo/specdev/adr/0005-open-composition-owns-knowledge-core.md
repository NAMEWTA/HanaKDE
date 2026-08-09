# ADR-0005: Open composition 拥有知识核心

- Status: Accepted
- Date: 2026-08-09
- Source: `<Path>{roots.state}/specdev/archive/2026-07/2026-07-24-openhanako-knowledge-workspace/ADR.md</Path>` (`ADR-0287`)

## 决策上下文

Desktop、LAN、Mobile、Open 与 Full 必须共享来源、操作、索引和查询语义。

## 决策

来源注册、资源访问、复合操作、索引和查询协议注册在 Open composition。Full 只通过 composition root 注入 Desk 等产品差异；迁移期由兼容 facade 保持旧 URL/DTO 含义。

## 后果

共享能力不依赖闭源模块，Open/Full 的行为差异受到明确限制。
