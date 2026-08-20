# LOG: openhanako v0.446.6 平台阻断门后续

## LOG-001 — 2026-08-12 — 从原 umbrella change 拆分未完结事项

- 原 change 已完成：T-01..T-21、T-24、T-26。
- 未完结：T-22 `blocked`、T-23 `review`、T-25 `blocked`。
- 用户要求将未完结事项单独形成后续 change；本 change 只承接这三个 Ticket。

## LOG-002 — 2026-08-12 — 保留阻断事实

不把 macOS arm64 局部通过或 macOS 上的 Windows 合同测试当作 blocking pass。T-25 必须在 T-22/T-23 新鲜 Evidence 后重跑。

## LOG-003 — 2026-08-20 — 清理 detached T-22-audit worktree

- 已为旁支提交 `fad195c2e431c14d8797b51c80ee070c44ffe34a` 建立本地救援 tag `recovery/t22-audit-fad195c2`。
- 该提交不在 `hanakde` 历史上；正式同类实现为 `35cb5e7a`，T-22 集成点为 `e06a5230`。
- 仓库级 stash 仍保留：`stash@{0}` = `50c189617cc5a2fe6403faa112117ea3cb1c4163`（parents `1693a9d8` / `7efff42a` / `725d27ed`），不纳入本次分支治理。
- 清理后不再注册 `specdev-worktree/T-22-audit`。未来真实 Windows rerun 必须按标准路径重建 `specdev-worktree/T-22`。
