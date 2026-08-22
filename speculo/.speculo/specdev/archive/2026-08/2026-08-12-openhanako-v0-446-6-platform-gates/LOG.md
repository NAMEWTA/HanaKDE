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

## LOG-004 — 2026-08-20 — 采用完整启动完整性修复

不写 typebox 特例。当前 change 增加 T-27，覆盖 production dependency runtime
exports、Pi AI import、launcher/postinstall 门禁、Desktop source/package 错误分类和
optional JSON ENOENT 降噪。

## LOG-005 — 2026-08-20 — 开发态快速失败

开发依赖残缺时不由产品进程自动修改依赖；立即失败并指导开发者执行
`volta run npm ci`，避免隐藏损坏的工作树状态。

## LOG-006 — 2026-08-20 — 打包态确认后修复

打包组件缺失只允许一次短退避。持续失败后显示“修复并重启/退出”；仅在用户确认
后复用 artifact 白名单修复，且用户数据区不在删除范围内。

## LOG-007 — 2026-08-22 — 用户取消不可用 macOS 环境矩阵并要求归档

用户确认没有真实 macOS x64、物理 sleep/wake 和 literal kernel descriptor 环境，明确要求不再执行这些测试并直接归档。Lead 将 T-23 记为 `cancelled` 而非 pass；T-25 基于真实 Windows、macOS arm64、既有 package/direct-flow 和当前回归给出 accepted-with-waiver verdict。缺失测试保留为残余风险，不形成虚假 Evidence。
