# LOG: openhanako v0.446.6 平台阻断门后续

## LOG-001 — 2026-08-12 — 从原 umbrella change 拆分未完结事项

- 原 change 已完成：T-01..T-21、T-24、T-26。
- 未完结：T-22 `blocked`、T-23 `review`、T-25 `blocked`。
- 用户要求将未完结事项单独形成后续 change；本 change 只承接这三个 Ticket。

## LOG-002 — 2026-08-12 — 保留阻断事实

不把 macOS arm64 局部通过或 macOS 上的 Windows 合同测试当作 blocking pass。T-25 必须在 T-22/T-23 新鲜 Evidence 后重跑。
