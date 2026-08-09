# ADR-0022: 每个用户故事只有一个 Primary Owner

- Status: Accepted
- Date: 2026-08-09
- Source: `<Path>{roots.state}/specdev/archive/2026-07/2026-07-24-openhanako-knowledge-workspace/ADR.md</Path>` (`ADR-0307`)

## 决策上下文

一个故事映射多个 ticket 会让实现和验收责任变得含糊。

## 决策

每条 `KW-US-*` 只指定一个 primary owner ticket，并关联精确自动化测试路径；supporting tickets 可以复用契约但不替代 owner。最终发布 ticket 不能担任故事 owner。

## 后果

追踪矩阵维护更严格，但可以唯一回答每条需求由谁实现、由什么证据验收。
