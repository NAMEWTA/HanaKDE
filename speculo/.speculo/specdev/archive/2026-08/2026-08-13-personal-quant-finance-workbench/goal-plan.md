---
schema_version: 6
artifact: goal-plan
change: 2026-08-13-personal-quant-finance-workbench
status: completed
modes: [high-assurance, reference-conformance]
orchestration: lead-directed
lead: root
implementation_agent_limit: 3
integration_attempt_limit: 3
ticket_workspace_policy: current
integration_gate: direct-parent
ready_for_execution: false
---

# Goal Plan: A/HK 个人量化金融工作台

- **Goal Plan：** `<Path>{roots.state}/specdev/changes/{change}/goal-plan.md</Path>`
- **Spec：** `<Path>{roots.state}/specdev/changes/{change}/spec.md</Path>`
- **Tickets Map：** `<Path>{roots.state}/specdev/changes/{change}/tickets-map.md</Path>`
- **Evidence：** `<Path>{roots.state}/specdev/changes/{change}/evidence/</Path>`

## 1. Outcome and Authority

### Outcome

在 `<Path>plugins/finance-workbench/</Path>` 交付可发现、可删除、离线优先的 A/HK 个人研究工作台，覆盖可信来源、资产与行情、研究证据、个人账本、声明式量化与回测、自动化、Agent consent、导入导出和诊断；永不提供交易工具。

### Success and False Completion

成功要求 AC-001～AC-038 全部有可重复证据，数据来源和 stale/quality 状态可见，run 内来源冻结，私有资料默认不外发，所有实现可整块删除。仅用 fixture 拼出 UI、静默换源、隐去数据质量、宣称未经原型验证的 native market dump 可用、或提供任何交易副作用都视为假完成。

### Non-goals

不修改宿主、shared、其他插件或宿主数据库；不连接券商、不执行交易、不复制/启动第三方 Python/CLI；`hithink-market-dump` 在独立原型证据前保持 experimental/blocked。

### Authoritative Inputs

最新用户决定优先，其次为本 change 的 ADR、CONTEXT、Spec、Ticket 和当前 SDK/仓库事实。参考项目只提供设计证据，不覆盖 Hana capability、隐私、许可和安全边界。

## 2. Execution Graph

### DAG and Critical Path

```text
T-01 -> T-02 -> T-03 -> T-04 -> T-05 -> T-06 -> T-07
                                      |       |
                                      +-------+-> T-08 -> T-09 -> T-10 -> T-11 -> T-12
```

T-06 与 T-07 在逻辑 DAG 可分支，但 current workspace 策略下全部 T-01～T-12 严格串行。

### Waves and Ownership

| Wave | Ticket | 前置 | 项目写路径 | Shared owner | Gate |
|---|---|---|---|---|---|
| W1～W5 | T-01～T-05 | 前一 Ticket | 各 Ticket frontmatter 授权的插件子路径 | root | G1～G2 数据/研究 |
| W6 | T-06 | T-05 | portfolio/private materials | root | G3 个人数据 |
| W7 | T-07 | T-05，且等待 T-06 串行完成 | screener/strategy | root | G3 量化定义 |
| W8～W11 | T-08～T-11 | Tickets Map DAG | 各 Ticket frontmatter 授权的插件子路径 | root | G4～G7 |
| W12 | T-12 | T-01～T-11 | `<Path>plugins/finance-workbench/**</Path>` | root | G8 发布 |

### Ticket Quick Reference

| ID | 可观察产出 | Dependencies | Workspace | Implementation owner | E2E disposition | Evidence |
|---|---|---|---|---|---|---|
| T-01 | 插件盒、能力矩阵、领域合同 | 无 | current | root | required | `<Path>{roots.state}/specdev/changes/{change}/evidence/T-01.md</Path>` |
| T-02 | provider 探测与可信 snapshot | T-01 | current | root | required | `<Path>{roots.state}/specdev/changes/{change}/evidence/T-02.md</Path>` |
| T-03 | AssetRef、自选、研究池 | T-02 | current | root | required | `<Path>{roots.state}/specdev/changes/{change}/evidence/T-03.md</Path>` |
| T-04 | 行情、K 线、stale/live | T-03 | current | root | required | `<Path>{roots.state}/specdev/changes/{change}/evidence/T-04.md</Path>` |
| T-05 | 财务、公告、研报、新闻证据 | T-04 | current | root | required | `<Path>{roots.state}/specdev/changes/{change}/evidence/T-05.md</Path>` |
| T-06 | 本地账本与私有资料 | T-05 | current | root | required | `<Path>{roots.state}/specdev/changes/{change}/evidence/T-06.md</Path>` |
| T-07 | 筛选、因子、策略定义 | T-05 | current | root | required | `<Path>{roots.state}/specdev/changes/{change}/evidence/T-07.md</Path>` |
| T-08 | 规则感知回测与结果 | T-06、T-07 | current | root | required | `<Path>{roots.state}/specdev/changes/{change}/evidence/T-08.md</Path>` |
| T-09 | 监控、告警、定时研究 | T-08 | current | root | required | `<Path>{roots.state}/specdev/changes/{change}/evidence/T-09.md</Path>` |
| T-10 | Agent 研究与 consent | T-06、T-09 | current | root | required | `<Path>{roots.state}/specdev/changes/{change}/evidence/T-10.md</Path>` |
| T-11 | 导入导出与诊断 | T-06、T-10 | current | root | required | `<Path>{roots.state}/specdev/changes/{change}/evidence/T-11.md</Path>` |
| T-12 | 全模块集成发布门 | T-01～T-11 | current | root | required | `<Path>{roots.state}/specdev/changes/{change}/evidence/T-12.md</Path>` |

## 3. Gates and Completion Evidence

### Overall Definition of Done

十二张 Ticket 均为 done；每张 Evidence 有 implementation/result SHA、路径审计、真实测试输出与合同映射；插件单元/集成/E2E、typecheck/build、宿主发现、窄屏、a11y、无交易扫描、隐私/密钥脱敏、删除 smoke 和 SpecDev complete 校验全部通过。

### Gates

| Gate | 开启条件 | 关闭证据 | 阻塞范围 | Lead | 失败恢复 |
|---|---|---|---|---|---|
| G1 数据可信 | T-01 开始 | manifest、provider capability、snapshot/identity/quote fault tests | T-05～T-12 | root | 回到 T-01～T-04 |
| G2 研究证据 | G1 关闭 | dossier、EvidenceRef、PIT fixture | T-06～T-12 | root | 修复 T-05 |
| G3 个人/量化定义 | G2 关闭 | ledger/privacy、AST/strategy validator | T-08～T-12 | root | 修复 T-06/T-07 |
| G4 回测质量 | G3 关闭 | quality gate、bias/cost/source manifest tests | T-09～T-12 | root | 修复 T-08 |
| G5 自动化安全 | G4 关闭 | monitor stale、task pause/recovery | T-10～T-12 | root | 修复 T-09 |
| G6 Agent 安全 | G5 关闭 | AI-off、consent、egress、no-trade tests | T-11～T-12 | root | 修复 T-10 |
| G7 交换诊断 | G6 关闭 | preview/import/export/audit/redaction | T-12 | root | 修复 T-11 |
| G8 发布 | T-01～T-11 done | 全量构建、E2E、路径与删除审计 | change 完成 | root | 最多三次集成修复 |

### Contract and Reference Coverage

AC-001～AC-038 的覆盖矩阵以 Tickets Map 为权威投影；每项必须落到对应 Evidence 的测试接缝。外部参考实现不得被复制为 Python/CLI 服务，native market dump 仍需独立 prototype 才可提升支持状态。

## 4. Execution and Integration Protocol

### Lead Orchestration

| 项目 | 决定 | 事实依据 |
|---|---|---|
| Lead | root | 唯一 SpecDev 状态、Evidence 与父分支 owner |
| Implementation subagents | 最多 3，Lead 不计入 | config 上限；current 模式实际同时只允许一个 writer |
| Integration attempts | 3 | config 快照 |
| Read-only agents | 无 SpecDev 数字上限 | review/research/test observation |
| Dispatch | execution-time dynamic | 按 Ticket 风险、依赖和可用能力派单 |

### Ticket Workspace and Integration

| Ticket | Parent/base | Workspace/branch | Source checks | Implementation commit | Integration checks/E2E | Parent result |
|---|---|---|---|---|---|---|
| T-01～T-12 | 最新通过的 `hanakde` HEAD | current / `hanakde` | Ticket 非 E2E、路径/密钥/交易扫描 | 每 Ticket 一个本地 commit | Lead 在同一 direct-parent 状态运行集成与 E2E | 验证通过的 implementation SHA |

Ticket 必须严格串行。每张票形成 implementation commit 后，Lead 执行 Local direct-parent verification and parent update，记录 result SHA 后才开始下一票；不创建 source/candidate worktree。

### Authorization Matrix

| 动作 | 状态 | 目标与条件 |
|---|---|---|
| Current workspace Ticket changes | allowed | 仅 Ticket writable paths，严格串行 |
| Ticket worktree local changes | not-authorized | current 模式不使用 |
| Implementation commit | allowed | 用户要求完成全部 change 且默认批准 |
| Local direct-parent verification and parent update | allowed | Lead 核对每张 Ticket 后推进 |
| Local candidate integration and parent update | not-authorized | current 模式不使用 |
| Push / PR / remote merge | not-authorized | 本地完成不需要 |
| Branch/worktree cleanup | not-authorized | 未创建 Ticket worktree |
| Deploy / migration / production actions | not-authorized | 不属于本 change |

### Evidence Return

实现者只返回候选事实与 commit；Lead 独立核对并写 Evidence、状态和最终验收。

## 5. Constraints, Risk and Recovery

### Non-negotiable Constraints

产品 diff 只在 `<Path>plugins/finance-workbench/**</Path>`；无交易工具；Key、私有资料与 consent 内容不进入前端、日志、fixture 或导出；pinned 不换源、run 内不换源；数据质量不足 fail closed；native market dump 在 prototype 前保持 experimental/blocked。

### Verification Integrity

测试必须命中真实 provider router、data contract、route/tool、TaskRegistry/ResourceIO 和宿主插件发现接缝。current/direct-parent 的 implementation check 与 Lead E2E 都要记录；禁止删除质量门、隐去 stale、以 mock 代替关键集成或跳过安全负例制造绿色。

### Migration or Release Sequence

私有 schema 只做插件内版本化；未知版本隔离。无宿主 migration、远程发布或生产部署。

### Risks, Monitoring and Recovery

重点监控来源许可/可用性、单位与复权、PIT、市场日历、费用/容量、stale、密钥/隐私、任务恢复、Agent 外发和无交易边界。失败回到拥有行为的 Ticket；三次集成尝试耗尽则阻塞并保留最后通过 SHA。

### Deviation Control

遵循 `<Path>{roots.workflows}/specdev/common/rules/deviation-control.md</Path>`；发现宿主能力缺口必须另开 system change，不得修改 core 补洞。

## 6. Progress and Decisions

### Current Status

Goal Plan completed；G1～G8 已关闭；implementation/result SHA 为 `3866178b`。native market dump 明确为 blocked/experimental，不阻塞 fixture 与 REST provider 路径的产品闭环。

### Pending Decisions and Blockers

无。用户已授权本地 implementation commit 与 direct-parent 推进；远程/生产动作保持未授权且不阻塞。

### Resume Protocol

恢复时读取本计划、当前 Ticket、change status 和最新 Evidence，从最后通过的 result SHA 继续；先重新核对 provider capability 与未关闭 Gate。

## Assumptions

现有 full-access 插件 SDK、ResourceIO、TaskRegistry、Agent/session helpers 和插件内 Node/TypeScript 测试框架足以承载 Spec；这是仓库接口已验证的低影响假设。外部 provider 不可用时允许使用明确标注来源的 deterministic fixture，但不得把 fixture 宣称为实时数据。
