# ADR-0023: 用户来源、回收站与系统派生目录严格分域

- Status: Accepted
- Date: 2026-08-09
- Source: `<Path>{roots.state}/specdev/archive/2026-07/2026-07-24-openhanako-knowledge-workspace/ADR.md</Path>` (`ADR-0308`)

## 决策上下文

把 SQLite、journal 和缓存放入用户来源会导致 watcher/index 递归、同步泄露和知识事实混淆。

## 决策

索引、journal、source binding 和证据位于 `<HANA_HOME>/knowledge-workspace/`。来源内唯一内部区域是 `.trash/`，由专用服务访问并从普通树、索引、搜索和链接解析排除。

## 后果

派生状态与用户知识清晰隔离；Server 必须管理系统 namespace 和来源 fingerprint。
