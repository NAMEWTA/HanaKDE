# Knowledge Test Strategy

- Promoted: 2026-08-09
- Source: `<Path>{roots.state}/specdev/archive/2026-07/2026-07-24-openhanako-knowledge-workspace/test-strategy.md</Path>`
- Status: Current verification strategy

## 测试分层

Vitest 是默认门禁，覆盖纯逻辑、契约、存储、索引、API、安全、fixtures、文档和组件级行为。Playwright 只用于需要真实 Browser/Electron 串联用户操作、UI 反馈和跨层结果的直接用户流程。

E2E 使用 `desktop-full`、`web-open` 与 `web-full` projects。每个测试创建独立临时 `HANA_HOME`、main、mounted sources、端口和用户配置，不读取开发者真实 home、固定端口、网络或已有 Workspace。

## 证据与归属

每条 `KW-US-*` 只有一个 primary owner ticket，并至少关联一个精确自动化测试路径。Supporting tickets 不替代 owner 验收；最终发布 ticket 只汇总实际运行证据。

固定发布回归由 E2E-KW-001 至 E2E-KW-024 构成，覆盖壳层、Open/Full、来源、编辑会话、保存、资产、冲突、链接、渲染、搜索、资源树、操作恢复、回收站、安全、可访问性与多 Renderer context。完整场景到 project 的映射保留在来源归档。

## CI 规则

Unit/integration 不自动 retry。E2E 最多 retry 1 次，首次失败仍保留 trace、video 和 log，不能只记录重试成功。Desktop 默认单 worker，Web 最多两个 worker。普通 ticket 不因发布级关联而自动安装浏览器；只有明确适用的用户流程或发布回归才运行 Playwright。

本次归档没有重新运行 Ticket 57、E2E、完整测试或发布矩阵；这里沉淀的是既有测试契约，不是新的执行证据。
