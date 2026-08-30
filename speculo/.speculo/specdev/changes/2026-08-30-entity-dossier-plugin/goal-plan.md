---
schema_version: 6
artifact: goal-plan
change: 2026-08-30-entity-dossier-plugin
status: completed
modes: [migration, high-assurance, reference-conformance]
orchestration: lead-directed
lead: root
implementation_agent_limit: 1
integration_attempt_limit: 3
ticket_workspace_policy: current
integration_gate: direct-parent
ready_for_execution: false
---

# Goal Plan: Hana Dossiers 档案插件

- **Goal Plan：** `<Path>{roots.state}/specdev/changes/2026-08-30-entity-dossier-plugin/goal-plan.md</Path>`
- **Spec：** `<Path>{roots.state}/specdev/changes/2026-08-30-entity-dossier-plugin/spec.md</Path>`
- **Tickets Map：** `<Path>{roots.state}/specdev/changes/2026-08-30-entity-dossier-plugin/tickets-map.md</Path>`
- **Ticket 目录：** `<Path>{roots.state}/specdev/changes/2026-08-30-entity-dossier-plugin/ticket/</Path>`
- **Evidence 目录：** `<Path>{roots.state}/specdev/changes/2026-08-30-entity-dossier-plugin/evidence/</Path>`

## 1. Outcome and Authority

### Outcome

在不修改 HanaKDE 产品核心、根构建或根依赖的前提下，交付 `<Path>plugins/dossiers/**</Path>` 内可独立安装的 Hana Dossiers / 档案插件。用户在当前工作区的固定 `Dossiers/` 根创建多类型档案、维护 typed fields 和独立联系人、复制并分类受管资料、执行元数据搜索、删除恢复及 ZIP/整库迁移；Agent 首次只取得相对清单/资料引用并按需读取。插件通过真实 Hana 主机、重启/迁移/故障恢复和精确发布目录 standalone smoke。

### Success and False Completion

成功要求 32 个 AC 均有 Lead 可复核 Evidence；11 个非取消 Ticket 各有非空 implementation commit、通过的 current-workspace/direct-parent 验证和父分支 `result_sha`；工作区权威、迁移、审计、模型边界、UI、插件发现与独立包合同全部闭合。

以下均为伪完成：只有 UI mock 或内存 CRUD；权威事实落在 plugin-private 数据；Agent 返回整份正文；SQLite 成为唯一真相；只在仓库源码中可加载而复制发布目录失败；required E2E 由实现者自报；跳过故障注入/恶意 ZIP/未来 schema；产品 diff 越出 `<Path>plugins/dossiers/**</Path>`；无 commit/Evidence 仅声称测试通过。

### Non-goals

- 不建设档案到档案的关系、知识图谱、多人协作、云同步或服务端账号。
- 不做正文全文检索、OCR、向量检索、后台模型扫描或插件主动模型调用。
- 不修改 `<Path>core/**</Path>`、`<Path>server/**</Path>`、`<Path>desktop/**</Path>`、`<Path>shared/**</Path>`、`<Path>packages/**</Path>`、根构建与根依赖。
- 不执行 marketplace 发布、远程 push/PR/merge、生产部署或用户真实数据迁移。

### Authoritative Inputs

| 优先级 | 来源 | 负责内容 | 冲突处理 |
|---|---|---|---|
| 1 | 用户最新明确决定 | 产品取舍、worktree 选择与执行授权 | 更新真正拥有该决策的工件；不得由下游推断扩大授权 |
| 2 | `<Path>{roots.state}/specdev/changes/2026-08-30-entity-dossier-plugin/ADR.md</Path>` 与 `<Path>{roots.state}/specdev/changes/2026-08-30-entity-dossier-plugin/CONTEXT.md</Path>` | 当前 change 架构决定与领域语义 | 返回 Grill 更新 owner，不在实现中改写 |
| 3 | `<Path>{roots.state}/specdev/adr/</Path>` 与 `<Path>{roots.state}/specdev/context/</Path>` | journal、回收站、fail-closed、垂直质量、preflight、插件能力和启动完整性 | 当前 change 替代时必须在 ADR/LOG 明示 |
| 4 | `<Path>{roots.state}/specdev/changes/2026-08-30-entity-dossier-plugin/spec.md</Path>` | 外部行为、范围、AC/NFR | 下游不得改写 |
| 5 | `<Path>{roots.state}/specdev/changes/2026-08-30-entity-dossier-plugin/ticket/</Path>` | 单 Ticket 范围、路径、局部验收 | Goal Plan 只编排，不扩张 writable paths |
| 6 | `<Path>PLUGIN_SDK.md</Path>`、`<Path>PLUGINS_EN.md</Path>`、`<Path>skills2set/hana-plugin-creator/SKILL.md</Path>` 与当前公开 SDK/runtime | 插件 manifest、Page/tool/resource、dev loop 与独立包合同 | 若公开合同不支持设计，停止并返回上游偏差门 |
| 7 | 当前代码、Git 和命令实测 | 可行性、基线与工具链 | 与上游冲突时记录 blocker，不伪造通过 |

## 2. Execution Graph

### DAG and Critical Path

```text
G0 [授权 + 工具链/基线 preflight]
  ↓
T-01 → T-02 → T-03 → T-07 → T-04 → T-05 → T-06 → T-09 → T-08 → T-10 → T-11
        │       │       │       │       │       │       │       │       │       └─ G7 release
        │       │       │       │       │       │       │       │       └─ G6 operations UI
        │       │       │       │       │       │       │       └─ G5 migration/compatibility
        │       │       │       │       │       │       └─ catalog UI result
        │       │       │       │       │       └─ exchange result
        │       │       │       │       └─ lifecycle/audit result
        │       │       │       └─ Agent/model boundary result
        │       │       └─ G3 document + index data plane
        │       └─ document authority
        └─ G2 catalog/contact authority
```

结构 DAG 的关键路径是 T-01 → T-02 → T-03 → T-05/T-06 → T-08 → T-10 → T-11；T-03/T-07 与 T-04/T-05/T-06/T-09 原本有并行候选。由于用户选择默认 `current` 策略，执行临界序列固定包含全部 11 个 Ticket，不得并行写项目路径。顺序优先稳定资料与索引，再形成 Agent/生命周期/交换合同，最后迁移、操作 UI 和装配。

### Waves and Ownership

| Wave | Ticket | 前置条件 | 项目写路径 | Shared owner | Gate/集成序号 |
|---|---|---|---|---|---|
| S01 | T-01 | G0 关闭 | domain/workspace/runtime foundation | T-01 唯一 owner | G1 / 01 |
| S02 | T-02 | T-01 result | catalog/routes/tools/tests | 读取 T-01 | G2 / 02 |
| S03 | T-03 | T-02 result | documents/routes/tools/tests | 读取 T-01 | G3-a / 03 |
| S04 | T-07 | T-02/T-03 result | index/routes/tests | 读取 T-01 | G3 / 04 |
| S05 | T-04 | T-03/T-07 result | agent/tools/tests | 读取 T-01 | G4-a / 05 |
| S06 | T-05 | T-04 result | lifecycle/routes/tools/tests | 读取 T-01 | G4-b / 06 |
| S07 | T-06 | T-05 result | exchange/routes/tools/tests | 读取 T-01 | G4-c / 07 |
| S08 | T-09 | T-06 result 且 T-07 已完成 | catalog UI/tests | 读取 T-01 | G4 / 08 |
| S09 | T-08 | T-02/T-03/T-05/T-06/T-07 results | migration/routes/tests | 读取 T-01 | G5 / 09 |
| S10 | T-10 | T-04/T-05/T-06/T-08 results | operations UI/tests | 读取 T-01 | G6 / 10 |
| S11 | T-11 | T-04/T-08/T-09/T-10 results | manifest/entry/Page/build/assets/E2E | 读取全部上游 | G7 / 11 |

T-01 是 `<Path>plugins/dossiers/src/domain/**</Path>`、`<Path>plugins/dossiers/src/infrastructure/workspace/**</Path>`、`<Path>plugins/dossiers/src/runtime.ts</Path>` 的唯一 shared owner。T-11 是 manifest、entry、Page shell、browser app、assets、build/package、README 和真实 E2E 的唯一 owner。其他 Ticket 不得借“集成”修改这些路径；共享合同变化必须回到 owner Ticket 修订并重新过 Gate。

### Ticket Quick Reference

| ID | 可观察产出 | Dependencies | Workspace | Implementation owner | E2E disposition | Evidence |
|---|---|---|---|---|---|---|
| T-01 | 安全初始化与原子权威基础 | — | `current` | Lead / dynamic dispatch，单 writer | not-required：T-11 汇合宿主 | `<Path>{roots.state}/specdev/changes/2026-08-30-entity-dossier-plugin/evidence/T-01.md</Path>` |
| T-02 | 多类型档案、字段与联系人 | T-01 | `current` | Lead / dynamic dispatch，单 writer | not-required：合同层 | `<Path>{roots.state}/specdev/changes/2026-08-30-entity-dossier-plugin/evidence/T-02.md</Path>` |
| T-03 | 受管资料复制与分类事务 | T-01,T-02 | `current` | Lead / dynamic dispatch，单 writer | required：T-11/current-workspace 汇合 | `<Path>{roots.state}/specdev/changes/2026-08-30-entity-dossier-plugin/evidence/T-03.md</Path>` |
| T-04 | Agent 相对引用与模型边界 | T-02,T-03 | `current` | Lead / dynamic dispatch，单 writer | required：T-11/current-workspace 汇合 | `<Path>{roots.state}/specdev/changes/2026-08-30-entity-dossier-plugin/evidence/T-04.md</Path>` |
| T-05 | 回收站、恢复与审计 | T-02,T-03 | `current` | Lead / dynamic dispatch，单 writer | required：T-11/current-workspace 汇合 | `<Path>{roots.state}/specdev/changes/2026-08-30-entity-dossier-plugin/evidence/T-05.md</Path>` |
| T-06 | ZIP 交换与整库迁移 | T-02,T-03 | `current` | Lead / dynamic dispatch，单 writer | required：T-11/current-workspace 汇合 | `<Path>{roots.state}/specdev/changes/2026-08-30-entity-dossier-plugin/evidence/T-06.md</Path>` |
| T-07 | 可重建元数据索引 | T-01,T-02 | `current` | Lead / dynamic dispatch，单 writer | not-required：集成/基准可观察 | `<Path>{roots.state}/specdev/changes/2026-08-30-entity-dossier-plugin/evidence/T-07.md</Path>` |
| T-08 | Schema 迁移与恢复 Gate | T-02,T-03,T-05,T-06,T-07 | `current` | Lead / dynamic dispatch，单 writer | required：T-11/current-workspace 汇合 | `<Path>{roots.state}/specdev/changes/2026-08-30-entity-dossier-plugin/evidence/T-08.md</Path>` |
| T-09 | 目录与搜索 UI | T-02,T-07 | `current` | Lead / dynamic dispatch，单 writer | not-required：组件层 | `<Path>{roots.state}/specdev/changes/2026-08-30-entity-dossier-plugin/evidence/T-09.md</Path>` |
| T-10 | 资料与维护操作 UI | T-03,T-04,T-05,T-06,T-08 | `current` | Lead / dynamic dispatch，单 writer | not-required：组件层 | `<Path>{roots.state}/specdev/changes/2026-08-30-entity-dossier-plugin/evidence/T-10.md</Path>` |
| T-11 | 完整插件、真实宿主与独立包 | T-04,T-08,T-09,T-10 | `current` | Lead / dynamic dispatch，单 writer | required：Lead/current-workspace | `<Path>{roots.state}/specdev/changes/2026-08-30-entity-dossier-plugin/evidence/T-11.md</Path>` |

## 3. Gates and Completion Evidence

### Overall Definition of Done

- 32 个 AC 全部由通过的 Ticket/集成 Evidence 覆盖，无未经批准 deferred。
- 每个非取消 Ticket 有非空 implementation commit、Lead 复核的 current-workspace 检查、`method=direct-parent` 集成记录和父分支 `result_sha`。
- `Dossiers/` 权威、journal、回收站、SQLite 重建、ZIP 安全、schema 迁移和 future-version fail closed 均通过正常/失败/恢复演练。
- Page、routes、tools、ResourceRef、Agent 按需读取、模型关闭、桌面/窄屏和重启流程在真实 Hana 主机由 Lead 验证。
- `<Path>plugins/dossiers/**</Path>` 精确发布目录独立 smoke 通过；无 unresolved repo-only imports、产品越界 diff、未请求 network/model 调用或敏感日志。
- Ticket、Map、Goal Plan、Evidence、change status 与 Git checkpoint 一致，无未集成 commit、活动候选或高影响偏差。

### Gates

| Gate | 开启条件 | 关闭证据 | 阻塞范围 | Lead/批准人 | 失败恢复 |
|---|---|---|---|---|---|
| G0 Execution Ready | 用户授权 current workspace implementation commits 与 Lead direct-parent 推进；`volta run npm ci` 后固定工具链/依赖可执行；基线 SHA/dirty 用户改动复核 | 授权状态、Node/npm、依赖 integrity、相邻插件 typecheck、Git baseline receipt | 全部 T-01–T-11 | Lead + 用户授权 | 不安装/不编码；保留计划 blocked，修复工具链后重跑 preflight |
| G1 Foundation Stable | G0 关闭、T-01 开始 | init/incompatible/path/fault tests、T-01 commit/result SHA | T-02–T-11 | Lead | 留在 T-01 修正；禁止消费者补写 shared path |
| G2 Authority Stable | G1 关闭、T-02 开始 | schema/CRUD/contact/reference tests、T-02 commit/result SHA | T-03–T-11 | Lead；不兼容 schema 变化回上游 | 恢复 T-02，重新验证 T-01 回归 |
| G3 Data Plane Stable | T-03/T-07 direct-parent 完成 | copy/move/hash fault tests、no-content index scan、rebuild/scale report、两个 result SHA | T-04–T-11 | Lead | 分别回到失败 owner；权威成功不得由索引失败回滚 |
| G4 Operations Contracts Stable | T-04/T-05/T-06/T-09 完成 | Agent spy、模型/确认门、生命周期时钟、恶意 ZIP、目录 UI/a11y 与四个 result SHA | T-08/T-10/T-11 | Lead | 暂停下游；按 owner 修正，重跑涉及 shared contract 的消费者测试 |
| G5 Migration Compatible | G4 关闭、T-08 完成 | old/future/partial fixtures、backup/journal/restart rehearsal、T-08 result SHA | T-10/T-11 | Lead；迁移 execute 仍需运行时用户确认 | 关闭全部写入，保留诊断/导出，从备份或 journal 恢复 |
| G6 UI Operational | G5 关闭、T-10 完成且 T-09 已集成 | 两组组件正常/错误/窄屏/a11y evidence、T-10 result SHA | T-11 | Lead | 回到对应 UI owner；不得用 T-11 首次补核心行为 |
| G7 Release Ready | T-11 完成 | manifest/SDK conformance、真实主机全旅程、重启恢复、diff allowlist、build、standalone smoke、final result SHA | Change 完成 | Lead；任何远程发布另行授权 | 父分支不推进失败 commit；卸载/回退插件不删除 `Dossiers/` |

### Contract and Reference Coverage

| 合同或参考要求 | 覆盖 Ticket | 验证接缝 | Evidence | 状态 |
|---|---|---|---|---|
| AC-001–AC-005 插件/初始化/迁移恢复 | T-01,T-08,T-11 | diff、workspace fixtures、真实加载 | T-01,T-08,T-11 | passed |
| AC-006–AC-009 档案/模板/联系人 | T-02,T-05,T-09 | domain/routes/components | T-02,T-05,T-09 | passed |
| AC-010–AC-014 受管资料 | T-03,T-10 | ResourceIO fault integration、UI preview | T-03,T-10,T-11 | passed |
| AC-015–AC-017 搜索/Page | T-07,T-09,T-11 | index benchmark、components、Playwright | T-07,T-09,T-11 | passed |
| AC-018–AC-023 Agent/模型/确认 | T-04,T-10,T-11 | tool payload、request spy、真实 tool | T-04,T-10,T-11 | passed |
| AC-024–AC-031 生命周期/交换/索引/隐私 | T-05,T-06,T-07,T-08,T-10,T-11 | fake clock、hostile ZIP、migration、log scan | T-05–T-08,T-10,T-11 | passed |
| AC-032 独立发布目录 | T-11 | copied plugin standalone smoke | T-11 | passed |
| hana-plugin-creator / public SDK conformance | T-01,T-03,T-04,T-11 | preflight、manifest schema、ResourceIO、bundle scan | T-01,T-03,T-04,T-11 | passed |
| 永久 ADR-0012/0014/0016/0018/0021/0024/0025/0028 | 全部，主责 T-01,T-03,T-05,T-08,T-11 | journal/trash/security/vertical quality/preflight/E2E/package | 各 Ticket + G7 | passed |

## 4. Execution and Integration Protocol

### Lead Orchestration

| 项目 | 决定 | 事实依据 |
|---|---|---|
| Lead | `root`，change leadership epoch 1 | 唯一 SpecDev 状态、Evidence、E2E 与父分支 owner |
| Implementation subagents | 上限 1，Lead 不计入 | config 上限 3；current 模式主动降低并保持单 writer |
| Integration attempts | 每 Ticket/集成点最多 3 次 | config `max_integration_attempts=3` |
| Read-only agents | 无 SpecDev 数字上限 | review/research/test-observation，不写项目或状态且不争用可变测试环境 |
| Dispatch | execution-time dynamic | 不预分配 provider/模型/agent；可自行实现或原生派单 |
| Delivery contract | `operation=plan` 已固定 implementation/review/research/test-observation | Lead 保留 SpecDev、父分支、Evidence、E2E；外部网页通道需另行 provider/发送范围授权和项目内 ZIP |

current 模式下原生 implementation Dispatch Packet 必须包含 Ticket、依赖 Evidence、不可变 `base_sha`、`workspace_ref=current`、`branch=hanakde`、单 writer 锁、writable/read-only/shared owner、commit 授权、非 E2E 检查、停止条件和返回字段。subagent 不写 Ticket/Map/Goal Plan/Evidence/status；E2E 永远由 Lead 拥有。外部 provider 不继承任何授权，未获明确数据发送许可时禁止使用。

### Ticket Workspace and Integration

| Ticket | Parent/base | Workspace/branch | Source checks | Implementation commit | Integration checks/E2E | Parent result |
|---|---|---|---|---|---|---|
| T-01 | G0 baseline | current / hanakde | foundation unit/fault/type | `d642c3ef2b16f7eadf0e3864e49931cb4ff1e4b7` | Lead direct-parent foundation regression passed | `d642c3ef2b16f7eadf0e3864e49931cb4ff1e4b7` |
| T-02 | T-01 result | current / hanakde | catalog/contact/schema tests | `83ff6cc5796d20c15b93ce0dfd370384c185b599` | Lead direct-parent T-01/T-02 regression passed | `83ff6cc5796d20c15b93ce0dfd370384c185b599` |
| T-03 | T-02 result `83ff6cc5796d20c15b93ce0dfd370384c185b599` | current / hanakde | document/ResourceIO/fault tests | `7fbffe97f5c84d56d8f56c5eda01cffe33278808` | Lead direct-parent regression passed；real-host 场景保留给 T-11 | `7fbffe97f5c84d56d8f56c5eda01cffe33278808` |
| T-07 | T-03 result `7fbffe97f5c84d56d8f56c5eda01cffe33278808` | current / hanakde | index/integrity/scale benchmark | `552a29320618a190f07e9d44fcbdb28b45da920b` | Lead direct-parent authority/index regression passed | `552a29320618a190f07e9d44fcbdb28b45da920b` |
| T-04 | T-07 result `552a29320618a190f07e9d44fcbdb28b45da920b` | current / hanakde | Agent/tool/permission/log tests | `5dd3a069f209de089c78943fa6059229d8e2a133` | Lead direct-parent regression passed；real host E2E 保留 T-11 | `5dd3a069f209de089c78943fa6059229d8e2a133` |
| T-05 | T-04 result `5dd3a069f209de089c78943fa6059229d8e2a133` | current / hanakde | lifecycle/fake-clock/redaction tests | `6b4b94566ef6903dc1aa3f25a08a590e7dfe7c08` | Lead direct-parent regression passed；real host E2E 保留 T-11 | `6b4b94566ef6903dc1aa3f25a08a590e7dfe7c08` |
| T-06 | T-05 result `6b4b94566ef6903dc1aa3f25a08a590e7dfe7c08` | current / hanakde | ZIP hostile/round-trip tests | `8dd7a18c07cdb10076fe5d5d5778117922bbd15d` | Lead direct-parent non-E2E passed；required picker E2E 汇入 T-11 | `8dd7a18c07cdb10076fe5d5d5778117922bbd15d` |
| T-09 | T-06 result `8dd7a18c07cdb10076fe5d5d5778117922bbd15d` | current / hanakde | component/a11y/viewport tests | `369be56dfbf720e789f1dab2d5fe7f21a74cce71` | Lead direct-parent UI contract regression passed | `369be56dfbf720e789f1dab2d5fe7f21a74cce71` |
| T-08 | T-09 result `369be56dfbf720e789f1dab2d5fe7f21a74cce71` | current / hanakde | migration/future/fault fixtures | `3e517da00c0a1d51b7e81c4a366cdc9fefcffa1a` | Lead direct-parent rehearsal passed；required restart E2E 汇入 T-11 | `3e517da00c0a1d51b7e81c4a366cdc9fefcffa1a` |
| T-10 | T-08 result `3e517da00c0a1d51b7e81c4a366cdc9fefcffa1a` | current / hanakde | operations component/a11y tests | `034eb8ece16e057f2cfa41fc9e3d6a3e358d65a8` | Lead direct-parent upstream DTO/UI regression passed | `034eb8ece16e057f2cfa41fc9e3d6a3e358d65a8` |
| T-11 | T-10 result `034eb8ece16e057f2cfa41fc9e3d6a3e358d65a8` | current / hanakde | manifest/type/test/build/package scans | `00d8cd071654913f4654b8fc5a81569a6f1b6448` | Lead current-workspace real-host E2E + restart + standalone smoke passed | `00d8cd071654913f4654b8fc5a81569a6f1b6448` |

Ticket 必须严格串行。Lead 每次只允许一个 implementation owner 写 current workspace；owner 完成非 E2E 检查并形成 commit 后，Lead 核对实际 diff、dirty 状态和 commit，再执行 Local direct-parent verification and parent update。验证通过时 `result_sha=implementation_commit` 并开始下一个 Ticket；失败时留在同一 Ticket 修正，父分支不得声称推进。不得创建 source/candidate worktree，source worktree 不运行 E2E 的规则在本 current 计划中不适用。

### Authorization Matrix

| 动作 | 状态 | 目标与条件 |
|---|---|---|
| Current workspace Ticket changes | allowed | USER-CONFIRMATION:2026-08-30；仅 `<Path>plugins/dossiers/**</Path>`，严格串行、单一 writer |
| Ticket worktree local changes | not-authorized | current 模式禁止创建 |
| Implementation commit | allowed | USER-CONFIRMATION:2026-08-30；每 Ticket 非空本地实现 commit |
| Local direct-parent verification and parent update | allowed | USER-CONFIRMATION:2026-08-30；Lead 在 `hanakde` 核对并推进通过的 Ticket commit |
| Local candidate integration and parent update | not-authorized | current 模式不适用且禁止 |
| Push / PR / remote merge | not-authorized | 本计划不授权任何远程副作用 |
| Branch/worktree cleanup | not-authorized | 本计划不创建 worktree；其他清理仍需独立授权 |
| Deploy / migration / production actions | not-authorized | 只允许测试 fixture；真实用户数据/发布环境动作逐次授权 |

### Evidence Return

implementation owner 返回 Ticket ID、current workspace locator、最终 commit、dirty 状态、修改路径、非 E2E 命令/结果、失败/未运行项和恢复条件。Lead 重读文件与 Git，验证 commit 可达、路径未越界、tip 与返回一致，再把事实写入 `<Path>{roots.state}/specdev/changes/2026-08-30-entity-dossier-plugin/evidence/T-##.md</Path>`。任何 subagent 测试、截图或 E2E 声明在 Lead 复核前均为 candidate，不得写成 pass。

## 5. Constraints, Risk and Recovery

### Non-negotiable Constraints

- 产品 diff 仅位于 `<Path>plugins/dossiers/**</Path>`；发现需要产品核心或根依赖时立即停止并返回 SpecDev 偏差门。
- `Dossiers/` JSON/managed files 是迁移权威，SQLite/plugin-private state 只可重建；所有写入使用 structured parser、schema 和 expected version。
- browser 只经 `hana.api.fetch` 调 same-plugin route；用户资源只经 `ctx.resources`/受控 host capability；不物化持久绝对路径。
- 插件不调用 model/network、不后台扫描；Agent 初次只得相对引用，模型全局关闭时内容入口 fail closed。
- 删除、覆盖、批量、导入提交、迁移和永久清理必须预检/确认；日志/审计不含正文、敏感值、凭据或完整模型输入。
- 生产插件目录无 unresolved repo-only import；真实 host E2E 和 standalone smoke 不能被 mock/源码内加载替代。

### Verification Integrity

执行基线为 branch `hanakde`、HEAD `80ebb6d93f019891c89f90c2fd0e95d19f2f7921`，初始 dirty 仅包含本 Change SpecDev 工件，`<Path>plugins/dossiers/</Path>` 不存在。G0 已使用 Volta 固定 `node v24.16.0` / `npm 11.13.0` 执行 `npm ci` 与 packages build；runtime integrity 验证 49 个生产依赖和 Pi AI import，相邻 `<Path>plugins/todolist/</Path>` typecheck 通过，package/lockfile 无修改。安装报告的既有依赖树包含 50 个 audit 项（2 low、20 moderate、26 high、2 critical），未执行会改版本的 audit fix；该残余风险不得通过本插件越界修改根依赖。

后续 Ticket 使用插件内定向 test/typecheck/build；Lead 在 current-workspace 运行受影响根回归。T-11 运行真实 Hana E2E、桌面/窄屏截图和精确发布目录 smoke。禁止以跳过测试、改断言、只测 mock、忽略 exit code、使用仓库根解析生产依赖或把 source 自报 E2E 当作绿色。

### Migration or Release Sequence

expand 顺序：T-01 工作区兼容根与 journal → T-02/T-03 权威 schemas/writers → T-07 派生索引 → T-04/T-05/T-06 操作合同 → T-09 UI → T-08 detect/plan/backup/migrate/recover Gate → T-10 状态 UI → T-11 manifest/Page/tool 装配。启动时 detect → 必要迁移确认 → staged/journal execution → validate/activate → index rebuild → 开放写入。不存在旧插件 contract 删除；未来 schema 与迁移失败保持只读诊断。发布仅指本地精确目录验证，不授权 marketplace、远程或生产发布。

### Risks, Monitoring and Recovery

- **路径/数据损坏：** canonicalize、root containment、expected version、暂存/journal、fault injection；失败保留旧权威并停止写入。
- **ZIP/资源耗尽：** 路径穿越、绝对路径、symlink、hash、文件数/总量上限；提交前拒绝并清理 staging。
- **索引权威漂移：** integrity/stale 标识、authority hydration、删除重建；索引失败不回滚权威成功。
- **隐私/模型：** request spy、内容 sentinel、日志扫描、全局开关；异常时禁用内容入口，不降级外发。
- **UI/宿主：** component tests 加真实 host 单 worker E2E；失败保留 trace/screenshot，回到实际 owner，T-11 不首次补核心行为。
- **工具链/依赖：** Volta 固定版本、`npm ci`、runtime import integrity；缺失依赖时停止，不修改 package/lock 规避。
- **direct-parent 失败：** 保留当前 Ticket commit 和工作区，最多三次修正/验证；仍失败则标 blocked，不开始下游。
- **Lead 恢复：** 从最后通过的 `result_sha`、当前 Ticket commit、change status 与 Evidence 继续；不重新决定已锁定设计。

### Deviation Control

遵循 `<Path>{roots.workflows}/specdev/common/rules/deviation-control.md</Path>`。新增产品路径/根依赖、改变权威/复制/模型/确认/迁移合同、未声明外部发送、无法达到 AC、父 HEAD 非预期变化或需要真实用户数据动作时，停止当前 Ticket，记录事实、影响、最后可信 checkpoint 和恢复条件，返回 Spec/ADR/用户批准 owner。局部命名或内部算法选择只要不改变合同，可在 Ticket writable paths 内实现并记录 Evidence。

## 6. Progress and Decisions

### Current Status

- 上游 Spec 与 11 个 Ready Ticket 均通过 validator：`0 errors, 0 warnings`。
- Goal Plan 已选 `current/direct-parent`、Lead `root`、implementation agent limit 1、integration attempt limit 3。
- G0 已关闭；授权、固定工具链、依赖完整性、packages build、相邻插件 typecheck 与 Git baseline 均有通过事实。
- G1 已关闭：T-01 foundation 19/19、类型/边界/回归通过，implementation/result SHA=`d642c3ef2b16f7eadf0e3864e49931cb4ff1e4b7`，Evidence=`<Path>{roots.state}/specdev/changes/2026-08-30-entity-dossier-plugin/evidence/T-01.md</Path>`。
- G2 已关闭：T-02 catalog 18/18、foundation+catalog 37/37、类型/边界/回归通过，implementation/result SHA=`83ff6cc5796d20c15b93ce0dfd370384c185b599`，Evidence=`<Path>{roots.state}/specdev/changes/2026-08-30-entity-dossier-plugin/evidence/T-02.md</Path>`。
- T-03 已完成：documents 14/14、累计 51/51、类型/边界/回归通过，implementation/result SHA=`7fbffe97f5c84d56d8f56c5eda01cffe33278808`，Evidence=`<Path>{roots.state}/specdev/changes/2026-08-30-entity-dossier-plugin/evidence/T-03.md</Path>`；真实 host/picker 场景保留给 T-11 required E2E。
- G3 已关闭：T-07 index 8/8、累计 59/59、SQLite ABI/规模/恢复/边界通过，implementation/result SHA=`552a29320618a190f07e9d44fcbdb28b45da920b`，Evidence=`<Path>{roots.state}/specdev/changes/2026-08-30-entity-dossier-plugin/evidence/T-07.md</Path>`。
- T-04 已完成：Agent 9/9、累计 68/68、类型/边界/隐私/运行时回归通过，implementation/result SHA=`5dd3a069f209de089c78943fa6059229d8e2a133`，Evidence=`<Path>{roots.state}/specdev/changes/2026-08-30-entity-dossier-plugin/evidence/T-04.md</Path>`；真实 Agent host 场景保留给 T-11 required E2E。
- T-05 已完成：lifecycle 15/15、累计 83/83、类型/恢复/隐私/运行时回归通过，implementation/result SHA=`6b4b94566ef6903dc1aa3f25a08a590e7dfe7c08`，Evidence=`<Path>{roots.state}/specdev/changes/2026-08-30-entity-dossier-plugin/evidence/T-05.md</Path>`；真实 restart/lifecycle 场景保留 T-11。
- T-06 已完成：exchange 11/11、累计 94/94、type/lint/runtime/allowlist/privacy 通过，implementation/result SHA=`8dd7a18c07cdb10076fe5d5d5778117922bbd15d`，Evidence=`<Path>{roots.state}/specdev/changes/2026-08-30-entity-dossier-plugin/evidence/T-06.md</Path>`；真实 picker/第二工作区 host E2E 保留 T-11。
- G4 已关闭：T-09 catalog UI 5/5、既有 Dossiers 94/94、type/lint/runtime/a11y/viewport/allowlist/privacy 通过，implementation/result SHA=`369be56dfbf720e789f1dab2d5fe7f21a74cce71`，Evidence=`<Path>{roots.state}/specdev/changes/2026-08-30-entity-dossier-plugin/evidence/T-09.md</Path>`；真实 Page 场景保留 T-11。
- G5 已关闭：T-08 migration 12/12、累计 106/106、22 个 journal 发布点中断恢复、复制整库、type/lint/runtime/allowlist/privacy 通过，implementation/result SHA=`3e517da00c0a1d51b7e81c4a366cdc9fefcffa1a`，Evidence=`<Path>{roots.state}/specdev/changes/2026-08-30-entity-dossier-plugin/evidence/T-08.md</Path>`；真实 startup/restart 场景保留 T-11。
- G6 已关闭：T-10 operations UI 10/10、两组 UI 15/15、核心 106/106、type/lint/runtime/a11y/viewport/allowlist/privacy 通过，implementation/result SHA=`034eb8ece16e057f2cfa41fc9e3d6a3e358d65a8`，Evidence=`<Path>{roots.state}/specdev/changes/2026-08-30-entity-dossier-plugin/evidence/T-10.md</Path>`；真实 picker/Page 场景保留 T-11。
- G7 已关闭：T-11 核心 106/106、UI 18/18、真实 Hana desktop/narrow E2E 4/4、restart persistence、production bundle、standalone 38 entries/34 tools、allowlist/privacy 全通过，implementation/result SHA=`00d8cd071654913f4654b8fc5a81569a6f1b6448`，Evidence=`<Path>{roots.state}/specdev/changes/2026-08-30-entity-dossier-plugin/evidence/T-11.md</Path>`；全部 11 个 Ticket 和 Change 已完成，Archive 尚未执行。

### Pending Decisions and Blockers

- 无。
- worktree 选择已按用户此前“全部默认”记录为“否”；若改为“是”，必须重新生成 required/candidate-merge 计划，不能在执行中切换。

### Resume Protocol

恢复时读取本 Goal Plan、当前 Ticket、`<Path>{roots.state}/specdev/changes/2026-08-30-entity-dossier-plugin/.status.json</Path>`、Git status/HEAD 和最新 Evidence。G0 未关闭时只重验授权与工具链；关闭后从最后通过的 direct-parent `result_sha` 的下一个串行 Ticket 开始。若当前 Ticket 有未通过 implementation commit，则继续同一 current workspace 修正，不跳到下游，不创建 worktree/candidate。

## Assumptions

- 当前计划采用用户此前“全部默认”决定所对应的 no-worktree/current 模式；这已明示且可在执行前纠正。
- 插件公开 SDK/manifest/runtime 合同以当前仓库固定文件为准；实现前 preflight 再读取精确 schema，不使用浮动的“最新”版本。
- 真实 E2E 需要用户在 Hana 设置中启用 full-access 插件与 Agent plugin development tools；该环境前置不授权额外产品或用户数据副作用。
