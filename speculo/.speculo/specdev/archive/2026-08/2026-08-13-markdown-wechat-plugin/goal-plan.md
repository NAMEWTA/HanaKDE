---
schema_version: 6
artifact: goal-plan
change: 2026-08-13-markdown-wechat-plugin
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

# Goal Plan: Markdown 公众号排版内置插件

- **Goal Plan：** `<Path>{roots.state}/specdev/changes/{change}/goal-plan.md</Path>`
- **Spec：** `<Path>{roots.state}/specdev/changes/{change}/spec.md</Path>`
- **Tickets Map：** `<Path>{roots.state}/specdev/changes/{change}/tickets-map.md</Path>`
- **Evidence：** `<Path>{roots.state}/specdev/changes/{change}/evidence/</Path>`

## 1. Outcome and Authority

### Outcome

交付一个可安装、可删除、无网络权限的 `markdown-wechat` 内置插件：Page 与 Widget 共用编辑和渲染状态，支持安全预览、主题、富文本复制、浏览器下载、ResourceIO 导入/显式写回，以及只在 Agent session 中创建 SessionFile 的纯产出工具。

### Success and False Completion

成功要求 AC-001～AC-018 全部有自动化证据，插件可由宿主发现，关键失败保留草稿且不伪报成功。仅有静态页面、只通过单元测试、绕过 ResourceIO、Page/Widget 状态分叉或把浏览器下载冒充 SessionFile 均是假完成。

### Non-goals

不修改宿主、shared 或其他插件；不接入网络、第三方上传、旧浏览器数据库迁移或后台发布任务。

### Authoritative Inputs

最新用户决定优先，其次为本 change 的 ADR、CONTEXT、Spec、Ticket 与当前插件 SDK/宿主运行事实；冲突必须返回真正拥有该决定的工件修订，Goal Plan 不改写产品合同。

## 2. Execution Graph

### DAG and Critical Path

```text
T-01 -> T-02 -> T-03 -> T-05 -> T-06 -> T-07
  |       |                         ^
  +-> T-04 -------------------------+
```

current workspace 策略下仍按 T-01、T-02、T-03、T-04、T-05、T-06、T-07 严格串行，避免共享插件根出现多个 writer。

### Waves and Ownership

| Wave | Ticket | 前置 | 项目写路径 | Shared owner | Gate |
|---|---|---|---|---|---|
| W1 | T-01 | 无 | `<Path>plugins/markdown-wechat/**</Path>` | root | G1 根契约 |
| W2 | T-02 | T-01 | 同上 | root | G2 编辑预览 |
| W3 | T-03 | T-02 | 同上 | root | G2 产出交付 |
| W4 | T-04 | T-01，且等待 W3 串行完成 | 同上 | root | G3 资源边界 |
| W5 | T-05 | T-02，且等待 W4 串行完成 | 同上 | root | G3 Agent 产出 |
| W6 | T-06 | T-02、T-05 | 同上 | root | G4 宿主边界 |
| W7 | T-07 | T-02～T-06 | 同上 | root | G5 发布 |

### Ticket Quick Reference

| ID | 可观察产出 | Dependencies | Workspace | Implementation owner | E2E disposition | Evidence |
|---|---|---|---|---|---|---|
| T-01 | 插件盒与私有 envelope | 无 | current | root | required | `<Path>{roots.state}/specdev/changes/{change}/evidence/T-01.md</Path>` |
| T-02 | 编辑、预览、主题与双 surface | T-01 | current | root | required | `<Path>{roots.state}/specdev/changes/{change}/evidence/T-02.md</Path>` |
| T-03 | 剪贴板与浏览器下载 | T-02 | current | root | required | `<Path>{roots.state}/specdev/changes/{change}/evidence/T-03.md</Path>` |
| T-04 | ResourceIO 导入/写回 | T-01 | current | root | required | `<Path>{roots.state}/specdev/changes/{change}/evidence/T-04.md</Path>` |
| T-05 | Agent 渲染与 SessionFile | T-02 | current | root | required | `<Path>{roots.state}/specdev/changes/{change}/evidence/T-05.md</Path>` |
| T-06 | 策略、诊断与删除 smoke | T-02、T-05 | current | root | required | `<Path>{roots.state}/specdev/changes/{change}/evidence/T-06.md</Path>` |
| T-07 | 集成发布门 | T-02～T-06 | current | root | required | `<Path>{roots.state}/specdev/changes/{change}/evidence/T-07.md</Path>` |

## 3. Gates and Completion Evidence

### Overall Definition of Done

七张 Ticket 均为 done；每张 Evidence 包含 implementation/result SHA、路径审计和真实测试输出；插件测试、typecheck/build、宿主发现、桌面与窄屏 E2E、删除 smoke 全通过；SpecDev implement/complete 校验为零错误零警告。

### Gates

| Gate | 开启条件 | 关闭证据 | 阻塞范围 | Lead | 失败恢复 |
|---|---|---|---|---|---|
| G1 | T-01 开始 | manifest、route、私有 store 测试 | 全部后续 | root | 修复 T-01 |
| G2 | G1 关闭 | renderer、surface、clipboard/download E2E | 用户闭环 | root | 回到失败票 |
| G3 | G2 关闭 | ResourceIO、SessionFile、失败保留草稿 | T-06～T-07 | root | 回到 T-04/T-05 |
| G4 | G3 关闭 | policy scan、diagnostics、删除 smoke | T-07 | root | 修复越界或诊断 |
| G5 | T-01～T-06 done | 全量构建、回归、桌面 E2E | change 完成 | root | 最多三次集成修复 |

### Contract and Reference Coverage

AC-001～AC-018 的 Ticket 覆盖以 Tickets Map 为权威投影；每项必须在对应 Evidence 中引用测试接缝和结果，不以人工观察替代自动化门。

## 4. Execution and Integration Protocol

### Lead Orchestration

| 项目 | 决定 | 事实依据 |
|---|---|---|
| Lead | root | 唯一 SpecDev 状态、Evidence 与父分支 owner |
| Implementation subagents | 最多 3，Lead 不计入 | config 上限；current 模式实际同时只允许一个 writer |
| Integration attempts | 3 | config 快照 |
| Read-only agents | 无 SpecDev 数字上限 | 只做 review/research/test observation |
| Dispatch | execution-time dynamic | 按当前 Ticket 风险和可用能力派单 |

### Ticket Workspace and Integration

| Ticket | Parent/base | Workspace/branch | Source checks | Implementation commit | Integration checks/E2E | Parent result |
|---|---|---|---|---|---|---|
| T-01～T-07 | 最新通过的 `hanakde` HEAD | current / `hanakde` | Ticket 非 E2E 测试、路径审计 | 每 Ticket 一个本地 commit | Lead 在同一 direct-parent 状态运行集成与 E2E | 验证通过的 implementation SHA |

Ticket 必须严格串行。每张票形成 implementation commit 后，Lead 执行 Local direct-parent verification and parent update，记录 result SHA 后才开始下一票；不创建 source/candidate worktree。

### Authorization Matrix

| 动作 | 状态 | 目标与条件 |
|---|---|---|
| Current workspace Ticket changes | allowed | 仅本插件路径，严格串行 |
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

产品 diff 只在 `<Path>plugins/markdown-wechat/**</Path>`；无网络权限；用户资源只经 ResourceIO；Page/Widget 下载只走浏览器手势；SessionFile 只由有 session context 的 Agent 工具产生；任何失败不得覆盖草稿或伪报成功。

### Verification Integrity

实现测试必须命中真实 renderer、route/tool 与宿主插件发现接缝。current/direct-parent 的 implementation check 与 Lead E2E 均需记录，禁止通过删断言、只测 mock 或跳过关键桌面路径制造绿色。

### Migration or Release Sequence

无数据迁移和远程发布；仅完成插件本地集成门与可删除验证。

### Risks, Monitoring and Recovery

重点监控剪贴板权限、下载手势、ResourceIO 冲突、HTML 安全、Widget 窄布局、SessionFile 上下文。失败回到拥有该行为的 Ticket，三次集成尝试耗尽则阻塞并保留最后通过 SHA。

### Deviation Control

遵循 `<Path>{roots.workflows}/specdev/common/rules/deviation-control.md</Path>`；发现宿主缺口必须另开 system change。

## 6. Progress and Decisions

### Current Status

G1～G5 已关闭；T-01～T-07 均通过 `3607ba0b` implementation/result checkpoint、插件 verify、真实 PluginManager 和 Chromium 下载验证。

### Pending Decisions and Blockers

无。用户已授权本地实现 commit 与 direct-parent 推进；外部写入保持未授权且不阻塞。

### Resume Protocol

恢复时读取本计划、当前 Ticket、change status 和最新 Evidence，从最后通过的 result SHA 继续；不得跳过未关闭 Gate。

## Assumptions

现有 full-access 插件 SDK、ResourceIO、SessionFile tool context 和宿主测试框架可承载 Spec 已确认的行为；这是已由仓库接口验证的低影响假设。
