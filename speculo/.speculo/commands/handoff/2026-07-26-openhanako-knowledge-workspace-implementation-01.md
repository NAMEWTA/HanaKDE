# OpenHanako 知识工作区实施交接 01

## 目标与权威

继续完整执行 `speculo/.speculo/specdev/changes/2026-07-24-openhanako-knowledge-workspace/goal-plan.md`，直到 57 个 ticket、193 条用户故事、22 个规则域、24 个 E2E、20 项威胁控制及全部发布 Gate 都有真实证据并关闭。

恢复时依次阅读：

1. `AGENTS.md`
2. `speculo/.speculo/workspace.json`
3. `speculo/config.json`
4. `speculo/workflows/specdev/INDEX.md`
5. `speculo/workflows/specdev/I-implement/I-implement.md`
6. change 内的 `goal-plan.md`、`README.md`、accepted `LOG.md`、`ADR.md`、`CONTEXT.md`、`spec.md`、`architecture.md`、`rules.md`
7. 当前 ticket 与其固定实施契约

## 已关闭

- Ticket 01：提交 `f5018010`、`ba45f55b`、`89bfa6f0`。
- Ticket 02：提交 `e5257959`、`dcf8e122`。
- Ticket 03：主线实现提交 `93de5ecf`（隔离 worktree 原始提交 `75686fe5`）。
- Ticket 03 双轴审查最终均 `APPROVED`。
- Ticket 03 精确测试 3 files、135/135；Open export 回归 3 files、52/52；typecheck、boundary、Renderer、Open build/smoke、一次性测试签名下 Full build 全部通过。
- Full build 的两次预期环境失败已如实登记：先缺 Renderer 产物，再缺 `HANA_SIGN_KEY`；临时签名材料验证完成后已永久删除。
- Ticket 03 的 E2E-KW-002、E2E-KW-021 仍为发布级待执行，不用 Vitest 冒充。

## 下一波

按 `goal-plan.md` DAG 启动 Tickets 04、11、13。Lead 先为每票读取完整 ticket/契约、冻结 disjoint allowlist、创建隔离 worktree，并执行票前基线；随后各自派发固定 `gpt-5.6-sol`、`reasoning_effort=medium` 的 implementer。每票实现完成后必须经过 Standards Review 与 Spec Review 两轴批准，再由 Lead 集成、主线验证、回写证据和清理 worktree/临时分支。

## Git 与保护边界

- 只有 Lead 操作 Git；implementer/reviewer/fixer 不得 commit、merge、cherry-pick、切换或删除分支。
- 不覆盖或清理用户修改；`silverbullet/` 是用户提供的临时参考源码，不得删除。
- ticket 实现严格受 Lead 明示 allowlist 约束。共享 contract、composition、主 route、package/lock、change 文档与状态文件默认 Lead-only，除非 Lead 明确批准单写者扩围。
- 用户已授权：每票补丁等价进入 `hanakde` 且主线门禁通过后，Lead 自动删除该票隔离 worktree 与临时分支。

## 建议 skills

- `orchestration`：维护 ticket DAG、单写者 allowlist、双轴审查与 fixer 循环。若 Orca runtime 不可用，使用当前协作子代理工具并如实记录来源。
- `browser:control-in-app-browser`：仅在后续真实 Web Open/Full 或用户交互 E2E 需要浏览器时使用。
- `visualize:visualize`：仅在复杂依赖、状态机或性能证据需要交互式图示时使用。
