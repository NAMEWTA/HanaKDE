---
schema_version: 3
artifact: tickets-map
change: 2026-08-12-knowledge-workspace-resource-convergence
status: completed
---

# Tickets Map: Knowledge 工作区资源与工作台文件能力收敛

- **Map：** `<Path>{roots.state}/specdev/changes/{change}/tickets-map.md</Path>`
- **Spec：** `<Path>{roots.state}/specdev/changes/{change}/spec.md</Path>`
- **Ticket 目录：** `<Path>{roots.state}/specdev/changes/{change}/ticket/</Path>`
- **Evidence 目录：** `<Path>{roots.state}/specdev/changes/{change}/evidence/</Path>`
- **可选 Goal Plan：** `<Path>{roots.state}/specdev/changes/{change}/goal-plan.md</Path>`

## 1. 目标与拆分策略

本 Map 将 Ready Spec 的 `US-001`—`US-006` 与 `AC-001`—`AC-013` 拆成最小可观察的垂直切片：先修复当前 503 的单一活动工作目录/ResourceIO owner，再分别收敛创建 dialog、资源树 Desk action/open policy 和 clipboard 来源边界，最后用跨层 integration/E2E Gate 验证用户行为，并以独立 checkpoint Ticket 固化 fork/upstream 可遍历升级证据。

拆分依据是用户可观察行为和真实阻塞，而非按 core/server/desktop/tests 水平切层。T-01 是唯一共享核心前置；T-02 与 T-03 在 T-01 后可并行，分别拥有 dialog 与 ContextMenu/tree 路径；T-04 依赖 T-03 的 context action seam 与 T-01 的 owner；T-05 汇合所有产品切片；T-06 在 Gate 之后唯一维护 upstream ledger 和最终 Map 投影。未引入无价值 prefactor、数据迁移或第二实现。所有本地适配坚持最小 seam，遵循现有 `docs/upstream-sync-ledger.md` 的 checkpoint 分类和 fork 遍历规则。

## 2. 执行清单

| ID | Ticket | 可观察产出 | Blocked By | Depth | Risk | Ready | Owner | Contract IDs | Wave/Gate | Status |
|---|---|---|---|---|---|---|---|---|---|---|
| T-01 | `<Path>{roots.state}/specdev/changes/{change}/ticket/01-bind-main-resource-owner.md</Path>` | 活动工作目录成为 Knowledge `main` 与公开 ResourceIO 的单一 owner；save/create/delete/switch 不再错用 provider | — | deep | critical | yes | current-implementer | AC-001, AC-002, AC-003, AC-011 | Wave 1 / Core owner Gate | done |
| T-02 | `<Path>{roots.state}/specdev/changes/{change}/ticket/02-close-create-dialog-submit.md</Path>` | 创建提交不可重入；成功卸载后只 locate/open 一次；失败可显式重试 | T-01 | standard | medium | yes | current-implementer | AC-004, AC-005 | Wave 2A / UI lifecycle | done |
| T-03 | `<Path>{roots.state}/specdev/changes/{change}/ticket/03-reuse-desk-resource-tree-actions.md</Path>` | Knowledge 树右键复用 Desk actions、file-kind、preview/native 能力，icon-first 且按能力降级 | T-01 | standard | high | yes | current-implementer | AC-006, AC-007, AC-008, AC-013 | Wave 2A / Resource tree action | done |
| T-04 | `<Path>{roots.state}/specdev/changes/{change}/ticket/04-converge-knowledge-clipboard-boundaries.md</Path>` | 同源 cut 是 move；跨源 cut 拒绝；跨源 copy 保持源/链接不变；paste 无部分写入 | T-01, T-03 | standard | high | yes | current-implementer | AC-009, AC-010, AC-011 | Wave 2B / Clipboard boundary | done |
| T-05 | `<Path>{roots.state}/specdev/changes/{change}/ticket/05-run-resource-convergence-integration-gate.md</Path>` | API、磁盘事实、树/editor、能力降级、stale scope 的跨层 integration/E2E 证据 | T-01, T-02, T-03, T-04 | deep | high | yes | current-implementer | AC-001—AC-011, AC-013 | Wave 3 / Product integration Gate | done |
| T-06 | `<Path>{roots.state}/specdev/changes/{change}/ticket/06-traverse-upstream-resource-convergence-checkpoints.md</Path>` | 每个 upstream checkpoint 有 SHA、overlap、五路分类、owner/security scan、affected tests 和 ledger 记录 | T-05 | deep | high | yes | current-implementer | AC-012 | Wave 4 / Fork compatibility Gate | done |

## 3. 依赖 DAG

```text
T-01 [DONE, Core owner Gate]
  ├─→ T-02 [DONE, UI lifecycle]
  └─→ T-03 [DONE, Resource tree action]
        └─→ T-04 [DONE, Clipboard boundary]
T-01 + T-02 + T-03 + T-04
  └─→ T-05 [DONE, Product integration Gate]
        └─→ T-06 [DONE, Fork compatibility Gate]
```

所有边均为真实开始条件：T-01 稳定 owner/scope 后，UI 可验证 mutation 失败语义；T-04 需要 T-03 提供右键入口；T-05 必须等产品切片完成才能运行完整用户流程；T-06 必须使用 T-05 的受影响合同证据。DAG 无环。

## 4. 合同覆盖矩阵

| Contract ID | 覆盖 Ticket | 验证接缝 | 状态 | 说明 |
|---|---|---|---|---|
| AC-001 | T-01, T-05 | route composition + integration | covered | 默认活动根所有 save/create/delete/restore 使用同一 owner，并由跨层流程复核 |
| AC-002 | T-01, T-05 | ResourceIO expected-version route/editor save | covered | 匹配写入成功，过期写入冲突且不覆盖 |
| AC-003 | T-01, T-05 | lifecycle composition + stale scope | covered | A→B stop-old/start-new，旧 scope mutation 拒绝 |
| AC-004 | T-02, T-05 | CreateResourceDialog + E2E | covered | 单次 submit、关闭/卸载、单次 locate/open |
| AC-005 | T-02, T-05 | dialog failure/retry + route errors | covered | conflict/unavailable 保持输入，显式重试，无自动重放 |
| AC-006 | T-03, T-05 | tree ContextMenu + user flow | covered | Desk actions 投影到 Knowledge file/folder |
| AC-007 | T-03, T-05 | file-kind/remote-preview/tree open | covered | md/pdf/jpg/html 等沿既有策略打开 |
| AC-008 | T-03, T-05 | native grant/security + E2E capability matrix | covered | Web/remote/no-grant 隐藏 native/absolute path |
| AC-009 | T-04, T-05 | clipboard slice + route + E2E | covered | 同源 cut 一次 move，源/目标和事件正确 |
| AC-010 | T-04, T-05 | copy service + route | covered | 跨源 cut 拒绝，copy 源不变且链接原样 |
| AC-011 | T-01, T-04, T-05 | owner/event/clipboard stale regression | covered | stale event 只 resync，无混源或部分写入 |
| AC-012 | T-06 | upstream ledger + scans + affected tests | covered | checkpoint 可遍历升级并记录分类/证据 |
| AC-013 | T-03, T-05 | ContextMenu UI/a11y + E2E | covered | icon-first、tooltip/ARIA、文本不溢出 |

## 5. 并行与路径所有权

- 最大并发以 `<Path>{roots.state}/specdev/config.json</Path>` 为准；本 Map 不引入委派角色。
- T-01 是 core/server owner composition 唯一 owner。
- T-02 与 T-03 在 T-01 完成后可并行：writable paths 无交集；T-03 独占共享 `<Path>desktop/src/react/ui/ContextMenu.tsx</Path>`。
- T-04 使用独立 clipboard route 测试文件；不与 T-01 的 composition route fixture 争用 writable path。
- T-05 使用新测试文件，不与产品 Ticket 共享 writable path。
- T-06 独占 `<Path>docs/upstream-sync-ledger.md</Path>` 与本 Map；所有上游遍历文档更新集中在此 Ticket。

| Ticket A | Ticket B | Writable 交集 | 真实依赖 | 处理 |
|---|---|---|---|---|
| T-02 | T-03 | 无 | 否（均依赖 T-01） | 可并行，分别拥有 dialog 与 tree/menu |
| T-01 | T-04 | 无 | 是 | T-04 依赖 T-01 的 owner 行为，但使用独立 clipboard route fixture |
| T-03 | T-04 | Knowledge tree/layout（T-04 依赖 T-03） | 是 | 顺序执行，T-03 是 action seam owner |
| T-05 | T-06 | 无 | 是 | 先产品 Gate，再 fork Gate |

## 6. Gate、Wave 与集成点

| Wave/Gate | 前置 | 进入条件 | 退出证据 |
|---|---|---|---|
| Wave 1 / Core owner Gate | — | T-01 ready | 默认 composition、switch、expected-version、owner scan |
| Wave 2A / UI behavior | T-01 | T-02/T-03 ready | dialog lifecycle、context menu、file open/capability tests |
| Wave 2B / Clipboard boundary | T-01, T-03 | T-04 ready | same-source move、cross-source cut rejection/copy tests |
| Wave 3 / Product integration Gate | T-01—T-04 | T-05 ready | integration + E2E + focused regression + failure classification |
| Wave 4 / Fork compatibility Gate | T-05 | T-06 ready | checkpoint ledger、overlap/classification、scan/test evidence |

正式跨 Ticket 编排、worktree 或委派由 `<Path>{roots.workflows}/specdev/P-goal-plan/P-goal-plan.md</Path>` 决定；普通 Goal Plan 已锁定顺序与恢复 owner，当前不启用委派执行。

## 7. 横切契约与风险

- `main` = 活动工作目录；挂载来源与 agent 授权目录保持不同安全边界。
- ResourceIO/operation/event/index/tree 只允许一个 workspace-scoped owner；stale scope fail closed/resync。
- 所有 mutation 使用 source-relative address、expected version、journal/Trash 和稳定 error code；不新增第二 storage/provider。
- Knowledge tree 只复用 Desk action/open/icon/preview/native seam；Web/remote 不泄露 absolute path。
- 同源 cut 是 move，跨源 cut 拒绝，copy 永不删除源且不改写链接。
- fork/upstream 以 ledger checkpoint evidence 为准；无冲突不替代语义验证。

## 8. 同步规则

- Ticket 状态变化后同步本执行清单；Ticket frontmatter 是单 Ticket 状态、依赖、深度和路径契约权威。
- T-03 是 ContextMenu shared path owner；T-01 是 route composition owner；T-06 是 upstream ledger owner。
- Tickets Map 由当前 T-tickets Work 维护；T-06 只更新 upstream ledger，不把 SpecDev 状态路径声明为项目 writable path。
- 依赖、合同覆盖或路径所有权变化后运行 `<Path>{roots.workflows}/specdev/common/tools/validate-specdev.mjs</Path>` 的 tickets stage。
- 内部工件只使用完整根变量 Path 标签，不使用相对 Markdown 链接或机器绝对路径。
