# ADR-0024: Vitest 是默认门禁，Playwright 只覆盖直接用户流程

- Status: Accepted
- Date: 2026-08-09
- Source: `<Path>{roots.state}/specdev/archive/2026-07/2026-07-24-openhanako-knowledge-workspace/ADR.md</Path>` (`ADR-0309`, supersedes source `ADR-0305`)

## 决策上下文

把 Playwright 作为每个 ticket 的通用门禁会重复启动 Browser/Electron，也不能提高纯逻辑和存储契约的证据质量。

## 决策

逻辑、契约、存储、索引、API、安全、fixture、文档和组件级行为使用 Vitest。只有必须在真实 Browser/Electron 中串联用户操作、反馈和跨层结果的场景使用 Playwright；发布追踪不要求所有关联 ticket 各自执行 E2E。

## 后果

关键用户旅程保留真实环境证据，普通 ticket 的反馈循环更短；发布级回归仍需独立汇总。
