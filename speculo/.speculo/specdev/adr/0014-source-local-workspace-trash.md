# ADR-0014: 删除先进入来源级工作区回收站

- Status: Accepted
- Date: 2026-08-09
- Source: `<Path>{roots.state}/specdev/archive/2026-07/2026-07-24-openhanako-knowledge-workspace/ADR.md</Path>` (`ADR-0296`)

## 决策上下文

直接永久删除不可恢复，而跨来源或系统级回收机制不能单独承载来源内恢复语义。

## 决策

每个来源使用根级 `.trash/` 批次和 manifest，并从普通树与索引排除。恢复使用确定冲突后缀，只修复同一批次双方均恢复的引用；清理进入系统废纸篓，失败时保留工作区副本。

## 后果

删除可恢复且随来源移动，但需要专用服务保护 `.trash/` 身份与 manifest 一致性。
