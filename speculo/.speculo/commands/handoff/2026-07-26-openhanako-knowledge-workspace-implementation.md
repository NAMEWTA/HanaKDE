# OpenHanako 知识工作区实施交接

## 目标与权威

继续完整执行 `speculo/.speculo/specdev/changes/2026-07-24-openhanako-knowledge-workspace/goal-plan.md`，直到 57 个 ticket、193 条用户故事、22 个规则域、24 个 E2E、20 项威胁控制及发布 Gate 全部完成并有真实证据。

接手时按以下顺序恢复权威上下文：

1. `AGENTS.md`
2. `speculo/.speculo/workspace.json`
3. `speculo/config.json`
4. `speculo/workflows/specdev/INDEX.md`
5. `speculo/workflows/specdev/I-implement/I-implement.md`
6. `speculo/.speculo/specdev/changes/2026-07-24-openhanako-knowledge-workspace/goal-plan.md`
7. 当前 ticket、`ADR.md`、`CONTEXT.md`、accepted `LOG.md`、`spec.md`、`architecture.md`、`rules.md` 及对应固定实施契约

## 已完成

- Ticket 01 已关闭。实现、集成与证据见：
  - `speculo/.speculo/specdev/changes/2026-07-24-openhanako-knowledge-workspace/ticket/01-freeze-real-repository-baseline.md`
  - commits `f5018010`、`ba45f55b`、`89bfa6f0`
- Ticket 02 已关闭。参考审计与证据见：
  - `speculo/.speculo/specdev/changes/2026-07-24-openhanako-knowledge-workspace/ticket/02-audit-silverbullet-reference.md`
  - commits `e5257959`、`dcf8e122`
- Playwright 已按 `.npmrc` 冷却策略锁定为 `@playwright/test@1.62.0`。
- Ticket 01 最终门禁：baseline/preflight 17/17、全量 Vitest 9812 passed / 6 Windows manual skipped、typecheck、boundary、Open build/smoke 全绿。
- Ticket 01、02 的隔离 worktree 与临时分支已在确认补丁等价进入 `hanakde` 后自动删除。
- 用户已授权：以后每票合并并通过主线门禁后，由 Lead 自动删除对应 worktree 与临时分支，无需逐次确认。该规则已写入 `goal-plan.md`，commit `cc57a549`。
- 用户把计划并发上限改为 6；实际并发仍不得超过运行环境提供的可用槽位。

## 当前 Ticket 03

- Ticket：`speculo/.speculo/specdev/changes/2026-07-24-openhanako-knowledge-workspace/ticket/03-freeze-open-knowledge-contract.md`
- 状态：实现中。
- 主线准备 commits：`a5e9f569`、`f180ab06`。
- 分支：`speculo/specdev/2026-07-24-openhanako-knowledge-workspace-03`。
- 初始实现只新增：
  - `shared/knowledge-workspace-contract.ts`
  - `tests/knowledge-contract-schema.test.ts`
  - `tests/knowledge-open-full-composition.test.ts`
- 首轮双轴审查均为 `REQUEST_CHANGES`。实现者已进入 fixer round 1，扩大后的唯一 allowlist 为：
  - `shared/knowledge-workspace-contract.ts`
  - `tests/knowledge-contract-schema.test.ts`
  - `tests/knowledge-open-full-composition.test.ts`
  - `server/routes/resource-io.ts`
  - `server/http/resource-operation-context.ts`
  - `tests/resource-io-route.test.ts`

首轮审查必须消除的核心问题：

- 允许 provider 已验证的名称段内字面反斜杠，但不能把它当路径分隔符。
- `KnowledgeSourceDto.displayName` 不得携带 POSIX、Windows drive、UNC 或本地 file URL 绝对路径。
- contract validation issue 必须有冻结的 HTTP status、`retryable` 与安全 details 元数据，同时不得抢占 Ticket 04 的完整错误域。
- 真实 `/api/resource-io/*` mutation route 当前会让 body 中的伪造 principal 覆盖认证身份；必须改为只从 Hono auth context 派生并对伪造 authority 字段 fail-closed。
- composition 测试必须使用隔离临时环境真实启动 Open/Full Node Server，验证未认证拒绝、两 composition 相同的伪造身份拒绝，以及 Full-only 差异只由 composition 注入。
- 子进程必须 TERM/KILL 后等待退出，再清理临时目录。

## 接下来

1. 等 fixer round 1 完成，先检查 allowlist 与 `git diff --check`。
2. 运行 Ticket 03 精确测试、`tests/resource-io-route.test.ts`、baseline、target ESLint、typecheck、boundary。
3. 并行重新启动 Standards Review 与 Spec Review；任一拒绝则继续 fixer round。
4. 两轴批准后，由 Lead 提交 Ticket 03 分支并 cherry-pick/merge 到 `hanakde`。
5. Lead 补齐 Open 分发清单：确认 `shared/knowledge-workspace-contract.ts` 被 `export-manifest.json` 纳入，并更新其要求的确定性生成物。
6. 在合并结果上运行精确测试、typecheck、boundary、`npm run build:server:open`、`npm run smoke:server:open` 及适用 full build。
7. 回写 Ticket 03 状态、六条 primary requirement evidence、真实命令、平台、commit 和实现交接摘要。
8. 主线证据全绿后自动删除 Ticket 03 worktree 与临时分支，再按 DAG 启动 Tickets 04、11、13。

## Git 与保护边界

- `hanakde` 在本交接创建前工作树 clean，领先 `origin/hanakde` 10 个提交。
- 只有 Lead 操作 Git；implementer、reviewer、fixer 不得 commit、merge、cherry-pick 或清理分支。
- 不清理或覆盖用户修改。
- `silverbullet/` 是用户提供的临时参考源码，不得自动删除。
- ticket 实现必须位于冻结 allowlist；shared contract、composition、主 route、package/lock、change 文档及状态文件默认 Lead-only，只有 Lead 明确批准的单写者例外可由 implementer 修改。

## 建议 skills

- `orchestration`：继续按 ticket 派发 implementer、双轴 reviewer 与 fixer，并保持单写者/allowlist 约束。
- `browser:control-in-app-browser`：后续真实 Web Open/Full 与 E2E 交互验证需要浏览器时使用。
- `visualize:visualize`：仅在复杂状态机、依赖或性能证据需要交互式可视化时使用。
