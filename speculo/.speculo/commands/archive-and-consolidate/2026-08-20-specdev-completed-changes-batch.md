# Archive and Consolidate

> 生成时间：2026-08-20 15:00 +08:00
> Workflow：specdev
> 模式：archive-batch（confirmed by accepted fork-governance plan）

## 结果摘要

- **待归档 change：** 2 个
- **归档预检：** 通过（均为 `change_status: completed`、源存在、目标不存在、无未合并 worktree）
- **知识提升：** 全部 deferred；历史 ADR/CONTEXT 留在归档内
- **清理候选：** 无永久知识删除
- **用户确认：** 已确认（实施已接受的 fork 同步与仓库清理计划）

## 阶段一：归档移动

| # | Change | 源路径 | 目标路径 | 状态 |
|---|---|---|---|---|
| 1 | `2026-08-09-internalize-todolist-plugin` | `<Path>{roots.state}/specdev/changes/2026-08-09-internalize-todolist-plugin/</Path>` | `<Path>{roots.state}/specdev/archive/2026-08/2026-08-09-internalize-todolist-plugin/</Path>` | moved |
| 2 | `2026-08-12-knowledge-workspace-resource-convergence` | `<Path>{roots.state}/specdev/changes/2026-08-12-knowledge-workspace-resource-convergence/</Path>` | `<Path>{roots.state}/specdev/archive/2026-08/2026-08-12-knowledge-workspace-resource-convergence/</Path>` | moved |

- 全局 `status.json.active` 已移除上述名称并追加到 `archived`
- 重复键 `claimed_investigations` 已从 markdown-wechat 条目删除
- `current_work` 与各 change `.status.json` 对齐
- 归档 integration 的 T-22/T-25 worktree 记录已改为 `removed`；平台 Gate 由 active `2026-08-12-openhanako-v0-446-6-platform-gates` 承接

## 阶段一：知识合并

| 来源 | 动作 | 判定 |
|---|---|---|
| 两个 archived change 的 ADR/CONTEXT | skip | 产品合同已在代码中；不把历史叙述提升为当前长期知识 |
| Evidence / LOG | keep in archive | 历史证据 |

## 阶段二：清理候选

无永久知识删除。Git worktree `specdev-worktree/T-22-audit` 已在独立 Git 清理步骤移除，救援 tag 为 `recovery/t22-audit-fad195c2`。
