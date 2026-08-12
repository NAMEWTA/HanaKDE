# Archive and Consolidate Dry-Run

> 生成时间：2026-08-12 00:00 +08:00  
> Workflow：specdev  
> 模式：archive-single（confirmed）

## 结果摘要

- **待归档 change：** 1 个
- **待拆分后续 change：** 1 个，保持 active，不进入归档批次
- **归档预检：** 通过
- **知识提升候选：** 0 个自动写入；现有 ADR/context/research 已有同主题长期知识，候选全部标记为 `keep/needs-confirmation`，不在 dry-run 写入
- **清理候选：** 0 个已批准删除；不删除历史工件或永久知识
- **用户确认：** 已确认（本轮用户明确回复“确认”）

## 阶段一：归档移动计划

| # | Change | 源路径 | 目标路径 | 状态 | 备注 |
|---|---|---|---|---|---|
| 1 | `2026-08-09-openhanako-v0-446-6-integration` | `<Path>{roots.state}/specdev/changes/2026-08-09-openhanako-v0-446-6-integration/</Path>` | `<Path>{roots.state}/specdev/archive/2026-08/2026-08-09-openhanako-v0-446-6-integration/</Path>` | moved | `.status.json` completed 预检通过；T-22/T-23/T-25 已拆分；T-22/T-25 worktree 已安全清理 |

confirmed 已执行：

- 原 change 已原子移动至归档目录；
- 归档 `.status.json` 已更新为 `change_status: archived`、`archived: true`；
- 原 change 已从全局 `status.json.active` 移除并追加到 `archived`；
- 后续 change `2026-08-12-openhanako-v0-446-6-platform-gates` 保持 active。

## 阶段一：知识合并计划

| 来源 | 目标 store | 动作 | 判定 |
|---|---|---|---|
| 原 change `ADR.md` | `<Path>{roots.state}/specdev/adr/</Path>` | skip / needs-confirmation | 已有 24 个长期 ADR；本 change 的 ADR-001..ADR-012 与现有 openhanako 知识存在主题重叠，需单独确认后才可合并 |
| 原 change `CONTEXT.md` | `<Path>{roots.state}/specdev/context/</Path>` | skip / needs-confirmation | 现有领域上下文已包含同一组术语；dry-run 不盲目追加或覆盖 |
| 原 change `LOG.md`、Evidence、Goal Plan | `<Path>{roots.state}/specdev/research/</Path>` | ephemeral / keep in archive | 执行记录、平台残余和固定 SHA 是历史证据，不自动升级为当前长期知识 |

没有任何永久知识写入动作被包含在本次 dry-run 的 confirmed 默认计划中；如需提升，必须另行确认具体 ADR/术语及冲突处理。

## 阶段二：清理候选

| 文件/范围 | 分类 | 理由 | 风险 |
|---|---|---|---|
| 原 change 内 T-22/T-23/T-25 Ticket 与 Evidence | keep | 已由后续 change 溯源引用；归档后作为历史事实保留 | low |
| `<Path>{roots.state}/specdev/adr/</Path>`、`context/`、`research/` 现有条目 | keep / needs-confirmation | 仍被当前 change、代码或历史归档引用；不做无确认清理 | medium |

本报告没有 delete、merge 或 rewrite 动作。

## 预检与保护

- `workspace.json`、项目 `config.json`、SpecDev `INDEX.md` 和 Archive Skill 已读取。
- 原 change 状态、Ticket、Map、Goal Plan、Evidence 与完成门已通过 `--stage complete`。
- 后续 change 已通过 `--stage implement`；工作流包 `--self-check` 通过。
- 未执行 `mv`、删除、永久知识写入、Git commit/push/merge、远程写入或发布动作。

## 执行后验证

- 原 active 源路径不存在，归档目标完整存在。
- 归档 `.status.json` 与 global `status.json` 状态无重叠。
- 后续平台 change 仍存在于 active changes。
- 永久 ADR/context/research 未修改；知识候选保留在归档 change 中供后续明确确认。
