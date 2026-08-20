---
schema_version: 3
artifact: goal-plan
change: 2026-08-12-knowledge-workspace-resource-convergence
status: completed
modes: [coordination, high-assurance, reference-conformance]
ready_for_execution: false
---

# Goal Plan: Knowledge 工作区资源与工作台文件能力收敛

- **Goal Plan：** `<Path>{roots.state}/specdev/changes/{change}/goal-plan.md</Path>`
- **Spec：** `<Path>{roots.state}/specdev/changes/{change}/spec.md</Path>`
- **Tickets Map：** `<Path>{roots.state}/specdev/changes/{change}/tickets-map.md</Path>`
- **Ticket 目录：** `<Path>{roots.state}/specdev/changes/{change}/ticket/</Path>`
- **Evidence 目录：** `<Path>{roots.state}/specdev/changes/{change}/evidence/</Path>`

## 1. Outcome and Authority

### Outcome

将聊天/工作台当前选定的工作目录绑定为 Knowledge 的 `main` 主来源和公开 ResourceIO 的唯一 workspace-scoped owner，消除保存、新建、删除和 operation commit 的 owner mismatch；同时让 Knowledge 资源树复用 Desk 的文件操作、icon、preview、Native Grant 和默认应用策略，并收敛创建 dialog、剪切/复制/粘贴、scope/event 和 fork/upstream checkpoint 证据。

最终用户可观察到：编辑内容能保存到工作目录；页面/文件夹创建成功后弹窗立即关闭且不会重复提交；资源树右键提供适用的剪切、复制、删除、重命名、路径复制、打开文件夹和默认应用打开；Markdown、PDF、图片、HTML/代码沿现有 Workbench 策略打开；同源剪切是 move，跨来源剪切明确拒绝，跨来源复制保持源和链接文本不变；Web/远程挂载不显示绝对路径或原生动作。

### Success and False Completion

成功必须同时满足：

- T-01 至 T-06 全部以 `done` 状态完成，或有明确批准的 cancelled/deferred；每个 Ticket 有完整 Evidence。
- AC-001—AC-013 全部映射到真实命令、代码/磁盘事实、组件断言或 E2E Evidence；没有 `unverified` 被改写为通过。
- 默认工作目录 composition、workspace switch、expected-version、create/delete/paste/cut、事件 scope 和能力降级定向测试通过；相关 typecheck/lint/build/E2E 按项目配置执行并分类结果。
- ResourceIO、Knowledge registry、operation coordinator、watcher/index 只有一个活动 owner；没有第二 provider、shadow watcher、私有 parser、绝对路径 API 或 renderer 文件系统旁路。
- upstream checkpoint 按 ledger 冻结 SHA、path overlap、五路分类、owner/security scan 和受影响合同测试完成；不以“无冲突”作为完成证明。

以下是假完成：只修 ResourceIO route 而默认 Knowledge composition 仍为 503；只关闭 modal 但重复请求或重复 locate/open 仍存在；只添加文字菜单而未复用 Desk 能力或未处理 Web/remote；把跨来源 cut 静默降级为 copy/move；只通过低层单测而跳过用户流程/安全 Gate；或只记录 upstream 无冲突而未完成语义分类与受影响测试。

### Non-goals

- 不新增 Knowledge 存储、ResourceIO provider、watcher、parser、preview 或跨会话授权目录。
- 不把 agent 授权目录改成 Knowledge 挂载目录；授权目录与挂载目录保持不同安全边界。
- 不修改 KnowledgeAddress/ResourceIO/operation/clipboard DTO、`main`/sourceKey 事实语义、磁盘格式或引入迁移。
- 不支持跨来源 move、自动链接重写、绕过 `.trash` 的永久删除或 renderer 直接访问 Node FS。
- 本 Goal Plan 不执行 upstream merge/rebase/cherry-pick、commit/push、PR、部署、发布、远程写入或真实用户文件操作。

### Authoritative Inputs

| 优先级 | 来源 | 负责内容 | 冲突处理 |
|---|---|---|---|
| 1 | 用户最新明确决定与本次选择的普通 Goal Plan 分支 | 产品取舍、复用约束和执行授权 | 更新真正拥有该决定的上游工件；不得在 Goal Plan 静默改行为 |
| 2 | `<Path>{roots.state}/specdev/changes/{change}/ADR.md</Path>` 与 `<Path>{roots.state}/specdev/changes/{change}/CONTEXT.md</Path>` | 当前 change 的 owner、来源边界、UI 与 clipboard 架构决定 | 架构冲突暂停受影响 Wave，回到 Grill/ADR owner |
| 3 | `<Path>{roots.state}/specdev/changes/{change}/spec.md</Path>` | 外部行为、范围、AC 与非目标 | 下游不得改写；行为/范围变化回到 S-spec |
| 4 | `<Path>{roots.state}/specdev/changes/{change}/ticket/{ticket-file}.md</Path>` | 单 Ticket 行为、依赖、路径与局部验收 | Goal Plan 只安排顺序和 Gate；Ticket 变更需更新 owning Ticket |
| 5 | `<Path>{roots.state}/specdev/changes/{change}/tickets-map.md</Path>` | DAG、合同覆盖与路径投影 | 以 Ticket frontmatter 为真相并同步 Map |
| 6 | 当前代码、测试、配置和 `<Path>docs/upstream-sync-ledger.md</Path>` | 可执行 seam、验证命令与 fork checkpoint 事实 | 事实冲突按 deviation-control 停止，记录 Evidence 后修订 owning artifact |

冲突裁决顺序为：安全/数据完整性 > Spec/ADR 合同 > 单一 owner/可恢复性 > 上游功能吸收 > 执行速度。

## 2. Execution Graph

### DAG and Critical Path

```text
T-01 [G1: Core owner]
  ├─→ T-02 [G2A: Create lifecycle]
  └─→ T-03 [G2A: Desk tree actions/open]
        └─→ T-04 [G2B: Clipboard boundary]
T-01 + T-02 + T-03 + T-04
  └─→ T-05 [G3: Product integration]
        └─→ T-06 [G4: Upstream checkpoint compatibility]
```

关键路径为 `T-01 → T-03 → T-04 → T-05 → T-06`；T-02 在 T-01 后与 T-03 并行候选，T-05 是第一个完整产品闭环汇合点，T-06 是 fork/upstream 兼容收缩点。每条边均来自 Ticket frontmatter 的真实 `blocked_by`，不表达人员交接偏好。

### Waves and Ownership

最大并发读取 `<Path>{roots.state}/specdev/config.json</Path>`，当前为 3；普通 Goal Plan 不创建委派角色。以下“执行 owner”是未来 I-implement 的当前实现者/集成执行者投影，不改变 Ticket frontmatter 的产品 owner 字段。

| Wave/Gate | Ticket | 前置条件 | 项目写路径 | Shared owner | 集成点 |
|---|---|---|---|---|---|
| W1 / G1 Core owner contract | T-01 | Spec/Map/T-01 Ready；Deep Ticket 开始前取得用户批准 | `<Path>core/engine.ts</Path>`、`<Path>server/routes/knowledge-workspace.ts</Path>`、`<Path>server/routes/resource-io.ts</Path>`、对应 route/lifecycle tests | T-01：活动根/ResourceIO composition | G1 Core owner Gate |
| W2A / G2 UI behavior | T-02 | G1 closed；T-02 Ready | `<Path>desktop/src/react/components/knowledge-workspace/CreateResourceDialog.tsx</Path>`、对应 component test | 无 | G2A-Create lifecycle |
| W2A / G2 UI behavior | T-03 | G1 closed；T-03 Ready；ContextMenu owner 可用 | Knowledge tree/layout、ContextMenu、file-kind/preview tests | T-03：`<Path>desktop/src/react/ui/ContextMenu.tsx</Path>` | G2A-Desk tree action |
| W2B / G2 clipboard | T-04 | G1 closed、T-03 Evidence 完整 | Knowledge clipboard/tree/layout、独立 clipboard route/copy tests | 无 | G2B-Clipboard boundary |
| W3 / G3 product integration | T-05 | T-01—T-04 done；Deep Ticket 开始前取得用户批准 | 新 integration/E2E tests only | 无 | G3 Product integration Gate |
| W4 / G4 fork compatibility | T-06 | T-05 Gate closed；Deep Ticket 开始前取得用户批准 | `<Path>docs/upstream-sync-ledger.md</Path>` | T-06：upstream ledger | G4 Checkpoint compatibility Gate |

T-02/T-03 是唯一可并行候选，写路径不相交；如实际采用并行 worktree，必须从同一已验证 G1 基线创建，并在 W2A 汇合后再启动 T-04。T-06 不拥有 SpecDev Map，Map 由当前 Goal Plan Work 维护，避免状态路径越权。

### Ticket Quick Reference

| ID | Ticket | 行为产出 | Depth/Risk | Dependencies | Wave/Gate | 执行 owner | Evidence |
|---|---|---|---|---|---|---|---|
| T-01 | `<Path>{roots.state}/specdev/changes/{change}/ticket/01-bind-main-resource-owner.md</Path>` | 活动工作目录是唯一 `main`/ResourceIO owner，save/create/delete/switch 正确 | deep/critical | — | W1/G1 | 当前实现者 | `<Path>{roots.state}/specdev/changes/{change}/evidence/T-01.md</Path>` |
| T-02 | `<Path>{roots.state}/specdev/changes/{change}/ticket/02-close-create-dialog-submit.md</Path>` | 创建不可重入，成功卸载后单次 locate/open | standard/medium | T-01 | W2A/G2 | 当前实现者 | `<Path>{roots.state}/specdev/changes/{change}/evidence/T-02.md</Path>` |
| T-03 | `<Path>{roots.state}/specdev/changes/{change}/ticket/03-reuse-desk-resource-tree-actions.md</Path>` | 树右键复用 Desk action/open/icon/native policy | standard/high | T-01 | W2A/G2 | 当前实现者 | `<Path>{roots.state}/specdev/changes/{change}/evidence/T-03.md</Path>` |
| T-04 | `<Path>{roots.state}/specdev/changes/{change}/ticket/04-converge-knowledge-clipboard-boundaries.md</Path>` | 同源 move、跨源 cut 拒绝、copy 源不变 | standard/high | T-01, T-03 | W2B/G2 | 当前实现者 | `<Path>{roots.state}/specdev/changes/{change}/evidence/T-04.md</Path>` |
| T-05 | `<Path>{roots.state}/specdev/changes/{change}/ticket/05-run-resource-convergence-integration-gate.md</Path>` | 全用户流程与跨层回归证据 | deep/high | T-01—T-04 | W3/G3 | 当前集成执行者 | `<Path>{roots.state}/specdev/changes/{change}/evidence/T-05.md</Path>` |
| T-06 | `<Path>{roots.state}/specdev/changes/{change}/ticket/06-traverse-upstream-resource-convergence-checkpoints.md</Path>` | upstream checkpoint 逐路径分类与证据 | deep/high | T-05 | W4/G4 | 当前集成执行者 | `<Path>{roots.state}/specdev/changes/{change}/evidence/T-06.md</Path>` |

## 3. Gates and Completion Evidence

### Overall Definition of Done

整体 DoD：

1. T-01—T-06 均 `done`，每个 Ticket 的 Evidence 包含基线、实际修改、命令结果、合同映射、失败分类、路径审计、偏差和残余风险。
2. AC-001—AC-013 全部 `covered`，没有未批准 deferred 或 `unverified` 伪绿色。
3. 默认活动工作目录的 save/create/delete/paste/cut、expected-version 和 workspace switch 通过公共 route/composition；Knowledge tree 的 context/open/icon/native 降级和 dialog 生命周期通过组件/utility/E2E。
4. `npm run typecheck`、适用 `npm test` 定向套件、`npm run lint` 和必要 build/E2E 均实际执行；任何基线失败、环境失败或新失败均有分类与处理。
5. 只存在一个 ResourceIO/Knowledge owner，不新增第二 watcher/parser/preview/store；upstream ledger checkpoint 有冻结 SHA、overlap、五路分类、扫描和受影响测试证据。
6. 用户没有另行授权的 commit、push、merge、deploy、release、远程写入和真实用户文件操作均未发生；完成后按 change-completion 规则交给下一 Work。

### Gates

| Gate | 开启条件 | 关闭证据 | 阻塞范围 | Owner/批准人 | 失败恢复 |
|---|---|---|---|---|---|
| G1 Core owner contract | Spec/Map/全部 Ticket Ready；T-01 Deep approval 已取得 | T-01 Evidence：默认 composition、switch、expected-version、owner uniqueness、定向 route/lifecycle tests | W2A/W2B/W3/W4 | T-01 执行者；用户批准 Deep 开始 | 停止所有下游，回到 T-01 owning seam；保留明确 503/磁盘事实，不重放 mutation |
| G2 UI/clipboard behavior | G1 closed；T-02/T-03 Ready；ContextMenu shared owner 稳定 | T-02/T-03/T-04 Evidence：single submit、menu/open/capability、same/cross-source clipboard | W3 | 当前实现者；用户批准受影响 Deep Gate | 仅暂停受影响 UI/clipboard Ticket，回退 adapter，不改 ResourceIO/文件协议 |
| G3 Product integration | T-01—T-04 `done` 且 Evidence fresh | T-05 integration + component + E2E + focused regression + typecheck/lint 结果及失败分类 | W4 / change completion | 当前集成执行者；用户批准 Deep Gate | 重开对应产品 Ticket；废弃受影响 integration Evidence，保持最后绿色基线 |
| G4 Fork checkpoint compatibility | G3 closed；ledger checkpoint 输入可冻结 | T-06 ledger：SHA/overlap/五路分类/owner-security scan/affected tests/diff check | change completion / upstream follow-up | 当前集成执行者；用户批准 Deep Gate | 在冲突 checkpoint 停止，回到 Spec/Grill；不合并 upstream、不声称完成 |
| G5 Final change readiness | G4 closed；T-01—T-06 done | validator `--stage goal-plan`、Map/Goal Plan/status/Evidence 一致、change-completion preflight | 仅完成转换 | 当前集成执行者；用户最终确认 | 保持 change active，记录 blocker/deviation，不移动归档 |

### Contract and Reference Coverage

| 合同或参考要求 | 覆盖 Ticket | 验证接缝 | Evidence | 状态 |
|---|---|---|---|---|
| AC-001 | T-01, T-05 | route composition + cross-layer integration | `<Path>{roots.state}/specdev/changes/{change}/evidence/T-01.md</Path>`、`<Path>{roots.state}/specdev/changes/{change}/evidence/T-05.md</Path>` | covered |
| AC-002 | T-01, T-05 | ResourceIO expected-version + editor save | 对应 T-01/T-05 Evidence | covered |
| AC-003 | T-01, T-05 | lifecycle/scope/event regression | 对应 T-01/T-05 Evidence | covered |
| AC-004 | T-02, T-05 | CreateResourceDialog + E2E | 对应 T-02/T-05 Evidence | covered |
| AC-005 | T-02, T-05 | conflict/unavailable retry tests | 对应 T-02/T-05 Evidence | covered |
| AC-006 | T-03, T-05 | Knowledge ContextMenu + user flow | 对应 T-03/T-05 Evidence | covered |
| AC-007 | T-03, T-05 | file-kind/remote-preview/tree open | 对应 T-03/T-05 Evidence | covered |
| AC-008 | T-03, T-05 | native security + capability E2E | 对应 T-03/T-05 Evidence | covered |
| AC-009 | T-04, T-05 | clipboard/store/route/E2E | 对应 T-04/T-05 Evidence | covered |
| AC-010 | T-04, T-05 | copy service + cross-source route | 对应 T-04/T-05 Evidence | covered |
| AC-011 | T-01, T-04, T-05 | owner/event/clipboard stale regression | 对应 T-01/T-04/T-05 Evidence | covered |
| AC-012 | T-06 | upstream ledger and affected-test procedure | `<Path>{roots.state}/specdev/changes/{change}/evidence/T-06.md</Path>` | covered |
| AC-013 | T-03, T-05 | icon/a11y/menu E2E | 对应 T-03/T-05 Evidence | covered |

## 4. Execution and Integration Protocol

### Ticket Execution Order

| Ticket | 开始条件 | 执行 owner | 必跑验证 | Evidence | 集成条件 |
|---|---|---|---|---|---|
| T-01 | G1 输入门禁通过；用户批准 Deep Ticket；工作区 preflight 无阻塞 | 当前实现者 | Knowledge/ResourceIO route、lifecycle、expected-version、typecheck、owner scan | T-01 Evidence | 只有默认 composition 和 switch 全绿才关闭 G1 |
| T-02 | G1 closed；路径基线未漂移 | 当前实现者 | CreateResourceDialog component + 相邻 layout tests | T-02 Evidence | single request/unmount/error retry 通过 |
| T-03 | G1 closed；T-03 shared ContextMenu owner 未被占用 | 当前实现者 | tree/context/open/file-kind/remote-preview/native security tests | T-03 Evidence | Desk reuse、capability hiding、icon/ARIA 通过 |
| T-04 | G1 closed、T-03 done；独立 clipboard route fixture 可用 | 当前实现者 | clipboard slice、copy service、clipboard route、tree/layout regression | T-04 Evidence | same-source move、cross-source cut rejection/copy 通过 |
| T-05 | T-01—T-04 done；用户批准 Deep Ticket；产品代码基线固定 | 当前集成执行者 | integration suite、Knowledge tree integration、Knowledge E2E、focused regression、typecheck/lint | T-05 Evidence | G3 关闭且失败分类完整 |
| T-06 | G3 closed；用户批准 Deep Ticket；ledger checkpoint 可冻结 | 当前集成执行者 | SHA/overlap/five-way classification、owner/security scans、affected tests、`git diff --check` | T-06 Evidence + ledger | G4/G5 关闭；未执行 upstream merge |

实现者只能修改对应 Ticket `writable_paths`；需要跨 Ticket shared path 时先暂停并更新 owning Ticket/Map/Goal Plan。T-02/T-03 若使用并行 worktree，均从 G1 的同一绿色基线创建；T-04 等待 T-03 集成后重新执行 preflight；T-05/T-06 不修改前置生产路径。

### Authorization Matrix

| 动作 | 状态 | 目标与条件 |
|---|---|---|
| Local changes | completed | 已按用户授权在当前工作树完成 T-01—T-06；不再扩大项目写路径 |
| Commit | not-authorized | 用户未明确授权提交；普通 Goal Plan 不自动提交 |
| Push / PR / Merge | not-authorized | 不访问远程仓库，不合并 upstream 或本地分支 |
| Deploy / Migration | not-authorized | 本 change 无数据迁移；不部署、不发布、不运行真实用户文件操作 |
| Production configuration / feature / real user data | not-authorized | 只使用临时测试 fixture 和现有测试环境；Native default-app 仅在获批 E2E 环境中按 Ticket 约束验证 |

### Evidence Return and Integration

每个实现 Ticket 完成或阻塞时，必须写入对应 Evidence，并同步 Ticket frontmatter、Tickets Map、Goal Plan、change status；Evidence 至少包含基线/worktree、实际修改路径、每条命令和退出状态、AC 映射、失败分类、路径审计、偏差批准、残余风险和恢复条件。普通 Goal Plan 不设 Lead/Worker 派单；当前实现者直接按 DAG 集成。最后一个计划内 Implement 负责汇总 G4/G5、运行 change-completion preflight 并在用户确认后转换 change 状态。

## 5. Constraints, Risk and Recovery

### Non-negotiable Constraints

- **单一 owner：** `main`、活动工作目录、公开 ResourceIO、Knowledge registry、operation coordinator、watcher/index 必须绑定同一 scope owner。来源：`ADR-001`、`0002-active-root-as-main.md`；违反时停止所有 mutation，防止 503/数据分叉。
- **来源边界：** `sourceKey` 与 source-relative address 是资源事实边界；授权目录不等于挂载目录，跨来源 cut 必须拒绝。来源：`ADR-002`、`0003-session-scoped-isolated-sources.md`、`0007-links-and-refactors-are-source-local.md`；违反时不得继续集成。
- **复用优先：** Knowledge tree 只能适配既有 Desk ContextMenu/action、file-kind、remote preview、Native Grant 和 client seam，不复制 parser/icon/preview/filesystem。来源：`ADR-002`、用户决定；违反时重开 T-03/S-spec。
- **不可隐式重放：** create submit、operation commit、clipboard mutation 和 stale event 不能重复产生事实；使用既有 journal/event sequence/Trash recovery。来源：`ADR-003`、`0012-durable-plan-commit-operation-journal.md`；重复/部分写入使 Gate 失败。
- **路径隐私：** absolute path 只在 Native Grant 保护的本地动作内部短暂存在；Web/remote 隐藏 native/path actions，Renderer 不直读 Node FS。来源：`0004-knowledge-resource-address.md`、`0016-fail-closed-security-boundary.md`、`0020-grant-based-native-bridge.md`；路径泄露为安全阻断。
- **fork 可遍历：** upstream checkpoint 必须先冻结 SHA/overlap，再五路分类、scan、affected tests；不以无冲突 merge/rerere 代替语义验证。来源：`docs/upstream-sync-ledger.md`、Spec `DEC-006`；冲突暂停 T-06 并回到 Spec/Grill。

### Verification Integrity

- 不可修改的判卷接缝是公共 route/composition、ResourceIO expected-version、Knowledge client/operation、React component、file-kind/preview utility、native security route 和 Playwright user flow。
- 基线红灯已记录在 `<Path>{roots.state}/specdev/changes/{change}/diagnosis.md</Path>`；实现时必须重跑并确认默认 owner mismatch 由 T-01 消除，不能将测试移出命令或放宽断言。
- 每个 Ticket 至少验证正常、失败和回归；UI Ticket 必须有 component/E2E 证据；Deep Ticket 必须记录监控、回滚/前向恢复和批准点。
- 失败分类固定为新失败、基线失败、环境/权限失败或验证无效；关键 Gate 无法执行时保持 open/blocked，不写成通过。
- 对静默失败风险执行受控反向验证：owner fallback、重复 submit、跨来源 cut、无 native grant、stale event 和 checkpoint 无冲突但契约丢失均必须有反例断言。

### Migration or Release Sequence

- **数据迁移：** 不适用；不改变磁盘格式、地址格式、store schema 或权限模型。
- **实现顺序：** G1 T-01 → G2A T-02/T-03 → G2B T-04 → G3 T-05 → G4 T-06；每个 Gate 只接受前置 Evidence 完整且源码基线未漂移。
- **上游顺序：** T-06 对每个 ledger checkpoint 执行 freeze/overlap/classify/scan/test/record；本 change 不执行 upstream merge/rebase/cherry-pick。
- **发布：** 无新增发布步骤；任何部署、发布、远程 reconcile 或真实用户数据操作须另行授权并转入对应 Work。

### Risks, Monitoring and Recovery

| 风险/触发信号 | 预防与检测 | 恢复动作 | 暂停范围 | 批准点 |
|---|---|---|---|---|
| 默认 owner 再次分裂、出现 503 或事件混源 | T-01 composition、scope generation、owner creation scan | 保留磁盘事实，停止新 owner，回 T-01 owning seam，重跑 G1 | T-02—T-06 | 用户批准 T-01 Deep restart |
| ContextMenu adapter 泄露绝对路径或绕过 grant | T-03 capability matrix、native security tests、remote/Web E2E | 关闭新菜单 native actions，回退 adapter，重跑安全测试 | T-03—T-06 | 用户批准 T-03 correction |
| 创建/clipboard/operation 重复或部分写入 | request count、journal/request hash、source/target disk assertions | 依既有 journal/Trash recovery；不自动重放；重开 T-02/T-04 | T-04—T-06 | 用户批准受影响 Deep Gate |
| integration/E2E 环境失败或基线失败 | 失败分类、保留原始命令/退出码 | 标为环境/基线失败并提供替代证据；不可替代时 Gate 保持 open | G3/G4 | 用户决定是否提供环境 |
| upstream overlap 改变公共契约或 owner | freeze SHA、path overlap、five-way classification、scan | 停止 checkpoint，回 S-spec/G-grill，不合并 upstream | T-06 及后续完成 | 用户批准重新规划 |

### Deviation Control

行为、公共接口、数据、安全、来源边界、路径所有权或 Gate 证据变化时，执行者必须停止受影响 Ticket，写明偏差、失效 Evidence、受影响 Wave/Gate、恢复条件，并回到真正 owning artifact（S-spec、ADR、Ticket 或 Map）。不得以 Goal Plan 文字覆盖 Spec/ADR，也不得先改后报。低影响实现细节可沿现有代码惯例调整，但需写入 Ticket Evidence。

## 6. Progress and Decisions

### Current Status

```text
WAVE_STATUS wave=completed ready=none active=none done=T-01,T-02,T-03,T-04,T-05,T-06 blocked=none
GATE_STATUS gate=G1-core-owner state=closed evidence=<Path>{roots.state}/specdev/changes/{change}/evidence/T-01.md</Path> risks=native-index ABI residual classified
GATE_STATUS gate=G2-ui-clipboard state=closed evidence=<Path>{roots.state}/specdev/changes/{change}/evidence/T-02.md</Path>,<Path>{roots.state}/specdev/changes/{change}/evidence/T-03.md</Path>,<Path>{roots.state}/specdev/changes/{change}/evidence/T-04.md</Path> risks=none
GATE_STATUS gate=G3-product-integration state=closed evidence=<Path>{roots.state}/specdev/changes/{change}/evidence/T-05.md</Path> risks=full-suite environment/baseline failures classified
GATE_STATUS gate=G4-upstream-compatibility state=closed evidence=<Path>{roots.state}/specdev/changes/{change}/evidence/T-06.md</Path> risks=future SHA requires fresh audit
GATE_STATUS gate=G5-final-readiness state=closed evidence=<Path>{roots.state}/specdev/changes/{change}/evidence/</Path> risks=environment/baseline residuals recorded in T-01/T-05
TICKET_STATUS id=T-01 state=done evidence=<Path>{roots.state}/specdev/changes/{change}/evidence/T-01.md</Path> deviation=none
TICKET_STATUS id=T-02 state=done evidence=<Path>{roots.state}/specdev/changes/{change}/evidence/T-02.md</Path> deviation=none
TICKET_STATUS id=T-03 state=done evidence=<Path>{roots.state}/specdev/changes/{change}/evidence/T-03.md</Path> deviation=none
TICKET_STATUS id=T-04 state=done evidence=<Path>{roots.state}/specdev/changes/{change}/evidence/T-04.md</Path> deviation=none
TICKET_STATUS id=T-05 state=done evidence=<Path>{roots.state}/specdev/changes/{change}/evidence/T-05.md</Path> deviation=none
TICKET_STATUS id=T-06 state=done evidence=<Path>{roots.state}/specdev/changes/{change}/evidence/T-06.md</Path> deviation=none
```

最近已验证事实：6 个 Ticket 均已实现并形成 Evidence；最终 change-focused 20 files / 214 tests、Web Open Playwright 1/1、三套 typecheck、focused lint、renderer build 与 change-scoped diff check 通过。全量 suite 的 Node/native ABI 与无关 baseline 失败已在 T-05 Evidence 分类，未伪写为通过。

### Pending Decisions and Blockers

- `DECISION-001`—`DECISION-003`：用户以“1”批准全部 T-01—T-06 在当前分支执行；不创建 worktree、不 commit/push/merge/deploy。
- 当前没有 blocker；G1—G5 均关闭，change 已完成。未授权的 commit/push/merge/deploy/release/真实用户文件操作保持禁止。

### Resume Protocol

恢复时依次读取本 Goal Plan、`<Path>{roots.state}/specdev/changes/{change}/.status.json</Path>`、当前 Ticket frontmatter、最新 Ticket Evidence、Tickets Map 和源码/Git 状态。先核对当前 Gate 的最后绿色事实、路径所有权和基线是否漂移，再从 DAG 中第一个未完成 Ticket 继续；若 Evidence 缺失或基线不匹配，只暂停受影响 Ticket 并按 Deviation Control 恢复，不重复询问已锁定的产品决定。

### Reporting Format

后续执行按以下可核验格式回报，不使用主观百分比：

```text
WAVE_STATUS wave=<number> ready=<ids> active=<ids> done=<ids> blocked=<ids>
GATE_STATUS gate=<name> state=open|closed evidence=<paths> risks=<summary>
TICKET_STATUS id=<id> state=<state> evidence=<path> deviation=<none|id>
BLOCKER id=<id> owner=<owner> needed=<decision-or-input> impact=<scope>
DECISION id=<id> owner=<owner> status=pending|approved|rejected impact=<scope>
```

## Assumptions

- 现有 `<Path>speculo/config.json</Path>` 与 `<Path>{roots.state}/specdev/config.json</Path>` 在实现开始前保持可读取，最大并发仍为 3；验证方式为 I-implement preflight。
- T-03 的 ContextMenu 可用可选 icon/ARIA/tooltip 投影承载 Knowledge 菜单；验证方式为 ContextMenu/Knowledge tree component tests。
- 现有 Knowledge E2E 配置可在至少一个适用 runtime 执行；无法运行的环境将保留为明确 blocker，不改变合同或伪造通过。
