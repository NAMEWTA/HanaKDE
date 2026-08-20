---
schema_version: 3
artifact: goal-plan
change: 2026-08-12-openhanako-v0-446-6-platform-gates
status: in_progress
modes: [coordination, high-assurance, release-coordination]
ready_for_execution: false
---

# Goal Plan: openhanako v0.446.6 启动完整性与双平台 Gate 收口

- **Goal Plan：** `<Path>{roots.state}/specdev/changes/{change}/goal-plan.md</Path>`
- **Spec：** `<Path>{roots.state}/specdev/changes/{change}/spec.md</Path>`
- **Tickets Map：** `<Path>{roots.state}/specdev/changes/{change}/tickets-map.md</Path>`
- **Ticket 目录：** `<Path>{roots.state}/specdev/changes/{change}/ticket/</Path>`
- **Evidence 目录：** `<Path>{roots.state}/specdev/changes/{change}/evidence/</Path>`

## 1. Outcome and Authority

### Outcome

先修复并验证 runtime dependency/startup recovery 共享合同，再在同一固定点并行关闭 Windows 与 macOS 原生/package Gate，最后只读判定 AC-001—AC-031 与原 15 项 DoD。开发者得到早期、准确的 Volta 恢复提示；打包用户可确认安全修复组件；首次可选偏好缺失不污染日志。

### Success and False Completion

成功要求 T-27、T-22、T-23、T-25 全部 done，三个 Gate 均有 final-SHA Evidence。以下均是假完成：普通 `npm install` 后未验证包内入口；只让当前 typebox import 成功；开发启动靠等待第二次成功；只有 unit fixture 没有 packaged repair E2E；Windows/macOS 任一 blocking skip；T-25 使用 T-27 前的旧 Evidence。

### Non-goals

不升级依赖或改 lock，不自动修复开发依赖，不改变 artifact protocol/签名/发布，不迁移/修改真实用户数据，不以 Linux 或 mock 替代阻断平台，不执行 Git 集成或远程动作。

### Authoritative Inputs

| 优先级 | 来源 | 负责内容 | 冲突处理 |
|---|---|---|---|
| 1 | 用户最新明确决定 | change 归属、修复广度、开发/打包恢复策略与授权 | 更新真正拥有决定的工件并重开适用 Gate |
| 2 | `<Path>{roots.state}/specdev/changes/{change}/ADR.md</Path>` | 当前 change 架构和恢复边界 | 以新 ADR/LOG 显式替代，不在下游静默覆盖 |
| 3 | `<Path>{roots.state}/specdev/changes/{change}/spec.md</Path>` | 外部行为、范围、AC-001—AC-031 | Ticket/计划不得改写 |
| 4 | `<Path>{roots.state}/specdev/changes/{change}/diagnosis.md</Path>` | 红灯、根因、修复不变量 | 新反证触发诊断偏差和 G1 暂停 |
| 5 | `<Path>{roots.state}/specdev/changes/{change}/ticket/{ticket-file}.md</Path>` | 单 Ticket 行为、路径与验证 | 本计划只编排 |
| 6 | 当前代码与 Evidence | 可行性、实际结果和固定点 | 冲突时停止并回到真正 owner |

## 2. Execution Graph

### DAG and Critical Path

```text
W0 / G1                 W1 / G2                         W2 / G3
T-27 startup fix ──────┬─→ T-22 real Windows ─┐
                       │                       ├─→ T-25 final acceptance
                       └─→ T-23 macOS residual ┘
```

关键路径为 `T-27 → max(T-22, T-23) → T-25`。T-22/T-23 只有共享固定点依赖，无项目写路径交集，可以并行；T-25 是只读汇合。

### Waves and Ownership

| Wave | Ticket | 前置条件 | 项目写路径 | Shared owner | 集成点 |
|---|---|---|---|---|---|
| W0 | T-27 | 当前红灯与诊断已记录；允许在实现阶段执行 clean install | manifest、shared verifier、scripts、Desktop startup/readiness/locales/tests | startup-integrity-owner | 关闭 G1，冻结平台候选 SHA |
| W1 | T-22 | G1 closed；Windows/Volta/MSVC/NSIS 可用 | Windows platform scripts/tests | 无 | Windows Evidence 指向候选 SHA |
| W1 | T-23 | G1 closed；arm64/x64 与 sleep window 可用 | macOS platform scripts/tests | 无 | macOS Evidence 指向候选 SHA |
| W2 | T-25 | G2 closed；两平台 Evidence 同一候选 SHA | 无项目写入 | 无 | final verdict 与 change completion 建议 |

### Ticket Quick Reference

| ID | Ticket | 行为产出 | Depth/Risk | Dependencies | Wave/Gate | Owner | Evidence |
|---|---|---|---|---|---|---|---|
| T-27 | `<Path>{roots.state}/specdev/changes/{change}/ticket/27-runtime-dependency-startup-hardening.md</Path>` | 安装完整性、mode-aware recovery、optional JSON | deep/critical | — | W0/G1 | startup-integrity-owner | `<Path>{roots.state}/specdev/changes/{change}/evidence/T-27.md</Path>` |
| T-22 | `<Path>{roots.state}/specdev/changes/{change}/ticket/22-windows-blocking-gate.md</Path>` | Windows native/package/startup pass | deep/critical | T-27 | W1/G2 | windows-gate-owner | `<Path>{roots.state}/specdev/changes/{change}/evidence/T-22.md</Path>` |
| T-23 | `<Path>{roots.state}/specdev/changes/{change}/ticket/23-macos-blocking-gate.md</Path>` | macOS residual/package/startup pass | deep/critical | T-27 | W1/G2 | macos-gate-owner | `<Path>{roots.state}/specdev/changes/{change}/evidence/T-23.md</Path>` |
| T-25 | `<Path>{roots.state}/specdev/changes/{change}/ticket/25-final-umbrella-acceptance.md</Path>` | final AC/DoD verdict | deep/critical | T-22, T-23 | W2/G3 | final-acceptance-owner | `<Path>{roots.state}/specdev/changes/{change}/evidence/T-25.md</Path>` |

## 3. Gates and Completion Evidence

### Overall Definition of Done

- 四个 Ticket 均 done，Evidence 包含实际修改/命令/结果/失败分类/风险/SHA/cleanup。
- AC-001—AC-031 和原 15 项 DoD 均有 final-SHA 通过证据；无 blocking skip、stale Evidence 或未批准 deferred。
- runtime verifier、test、typecheck、lint、build:client、适用 server/package 和用户流程全部通过，基线无未批准退化。
- 受控反向验证证明残缺 entrypoint、dev/package classification 与 artifact repair 边界确实能失败；随后恢复绿色。
- Node/Pi/typebox 版本和 package-lock 不变；旧统一自动更新误分类、重复 owner/parser/legacy 禁止项归零。
- Ticket、Map、Goal Plan、Evidence、代码和 change status 一致，无未批准 Git/remote/release/real-user-data 副作用。

### Gates

| Gate | 开启条件 | 关闭证据 | 阻塞范围 | Owner/批准人 | 失败恢复 |
|---|---|---|---|---|---|
| G1 Runtime Integrity Stable | T-27 Ready；诊断红灯可重复 | T-27 done/Evidence；残缺 fixture 红绿；Pi import；dev/package/optional JSON tests；quality/build/start smoke；lock/version diff clean | T-22、T-23 | startup-integrity-owner；用户已批准恢复策略 | 产品/合同失败留在 T-27；高影响偏差回 Spec/ADR；不开放 W1 |
| G2 Native Platforms Passing | G1 closed；候选 SHA 冻结；平台环境可用 | T-22/T-23 done；真实 OS/arch/package/start/repair Evidence；blocking skip 为零；cleanup 完整 | T-25 | windows-gate-owner + macos-gate-owner | 产品修复重新打开 G1 并使 W1 Evidence 失效；环境失败保持对应 Ticket 未完成 |
| G3 Umbrella Accepted | G2 closed；两平台 Evidence 同 SHA | T-25 pass verdict；31 AC、15 DoD、quality、structure、reverse checks 全绿 | change completion | final-acceptance-owner | 任一 finding 返回 owner；代码变化重新打开相应上游 Gate并重跑终审 |

### Contract and Reference Coverage

| 合同或参考要求 | 覆盖 Ticket | 验证接缝 | Evidence | 状态 |
|---|---|---|---|---|
| AC-001—AC-008、AC-011、AC-024—AC-026、AC-028 | T-25 | final fixed point、归档 Evidence、quality/structure | `<Path>{roots.state}/specdev/changes/{change}/evidence/T-25.md</Path>` | planned |
| AC-009—AC-010、AC-012—AC-023、AC-027 | T-22, T-23, T-25 | 双平台 native/package/direct flow | T-22/T-23/T-25 Evidence | planned |
| AC-029—AC-031 | T-27, T-22, T-23, T-25 | fixture/import/launcher/Desktop + packaged OS smoke | T-27/T-22/T-23/T-25 Evidence | planned |
| 15 项原 umbrella DoD | T-25 | final matrix | `<Path>{roots.state}/specdev/changes/{change}/evidence/T-25.md</Path>` | planned |

## 4. Execution and Integration Protocol

### Ticket Execution Order

| Ticket | 开始条件 | 执行 owner | 必跑验证 | Evidence | 集成条件 |
|---|---|---|---|---|---|
| T-27 | current red evidence recorded；stop stale dev processes；clean install authorized | startup-integrity-owner | Ticket matrix、Pi import、postinstall、test/typecheck/lint/build/start smoke | T-27 Evidence | G1 全部关闭条件满足，冻结 candidate SHA |
| T-22 | G1 closed；Windows toolchain preflight pass | windows-gate-owner | native matrix、dist:win、standalone、NSIS install/start/repair direct flow | T-22 Evidence | 无产品路径改动；全部 Windows blocker closed |
| T-23 | G1 closed；arm64/x64/sleep environment ready | macos-gate-owner | native residual、dist/app/DMG、startup/repair direct flow | T-23 Evidence | 无产品路径改动；全部 macOS residual closed |
| T-25 | G2 closed；Evidence SHA/状态一致 | final-acceptance-owner | 31 AC、15 DoD、quality/structure/reverse checks | T-25 Evidence | pass verdict；无项目修改或未授权动作 |

### Authorization Matrix

| 动作 | 状态 | 目标与条件 |
|---|---|---|
| Local changes | allowed | 仅各 Ticket `writable_paths`；T-27 实现开始可执行 `volta run npm ci` 恢复根依赖 |
| Local tests/build/package | allowed | 使用隔离 fixtures/Profile；真实平台安装只作用于明确测试目标 |
| Commit | not-authorized | 本计划不授权创建 commit；需用户另行明确要求 |
| Push / PR / Merge | not-authorized | 不操作远程、分支集成或 PR |
| Deploy / Migration | not-authorized | 无数据迁移、部署、签名、公证或发布 |
| Production configuration / feature / real user data | not-authorized | artifact repair E2E 仅用隔离 HANA_HOME；不得触碰真实用户数据 |

### Evidence Return and Integration

每个 Ticket 完成或阻塞时写入对应 Evidence，记录 fixed SHA、平台/架构、实际命令、退出状态、失败分类、路径审计、cleanup 和恢复条件。状态同步顺序为 Ticket frontmatter → Tickets Map → Goal Plan current status → change status。W1 可以并行执行，但 G2 只在两份 Evidence 都指向 G1 candidate 且无产品 diff 时关闭。

## 5. Constraints, Risk and Recovery

### Non-negotiable Constraints

- runtime dependency 完整性必须是通用精确 runtime target 合同，不得以 typebox 路径特例交付；根开发使用 all-exact，packaged build 保持 root-only，违反任一 scope 合同则 AC-029 失败。
- 开发态不得自动写依赖，packaged repair 必须用户确认且只清白名单；违反则安全/数据边界失败。
- T-22/T-23 不修改产品路径；任何平台发现的产品缺陷返回 owner 并重开 G1。
- Windows/macOS blocking Evidence 不可互相替代，不可由 mock/synthetic/skip 代替。
- final verdict 只接受同一 final SHA 的新鲜 Evidence；代码变化使下游 Evidence 失效。

### Verification Integrity

不可修改的判卷接缝包括残缺 package fixture、直接 Pi import、dev/package retry count、artifact repair 白名单与 relaunch 条件、optional JSON ENOENT/非 ENOENT 对照、双平台 native runner 和 final structural scans。禁止通过跳过用例、吞错、放宽缺文件断言、删除失败文案检查或把命令移出矩阵制造绿色。

G1 关闭前至少执行一次受控反向验证：移除 fixture 的精确 runtime target 必须得到 integrity failure；将 packaged context 改为 source context 必须不显示 artifact repair；注入 repair failed target 必须不 relaunch。反向验证后恢复 fixture 并重跑绿色。

### Migration or Release Sequence

无数据迁移或生产发布。顺序固定为：记录当前红灯 → 开发者 clean install → T-27 实现/验证 → 冻结 G1 candidate → 双平台 native/package Gate → final acceptance。任何共享产品代码变化都回到 T-27/G1，不在 W1 热修。

### Risks, Monitoring and Recovery

| 风险 | 触发信号 | 事故半径 | 预防/检测 | 恢复与批准点 |
|---|---|---|---|---|
| verifier 误报合法 exports | 完整 `npm ci` 后 preflight fail | 全部开发入口阻断 | exact/non-wildcard/types fixtures；全生产依赖 dry run | 修正规则并重跑 G1；不以关闭门禁规避 |
| mode classification 错误 | dev 出现 repair 或 packaged 出现 npm 提示 | 错误恢复、潜在组件清理 | structured context tests + E2E | 停止 W1，修复 T-27；repair 仍需确认 |
| artifact repair 循环 | failed result 后 relaunch | 启动循环 | failed.length gate + cancel/failure tests | 禁止 relaunch，保留 crash log/CLI escape hatch |
| Windows 工具链缺失 | cl.exe/NSIS/native helper preflight fail | T-22 阻断 | Wave 开始前环境预检 | 补齐环境后同 SHA 重跑；不得标 pass |
| macOS residual 环境缺失 | x64/sleep/descriptor 未运行 | T-23/T-25 阻断 | 明确 hardware window 与 arch | 保持 blocked，获得环境后重跑 |
| Evidence 过期 | SHA 不同或 W1 有产品 diff | final verdict 无效 | Evidence identity audit | 重开 G1/G2，重跑受影响平台与 T-25 |

### Deviation Control

遵循 `<Path>{roots.workflows}/specdev/common/rules/deviation-control.md</Path>`。会改变 dependency target 语义、恢复确认、用户数据边界、平台 blocking 范围或 AC 的偏差必须暂停所有下游 Wave，更新 ADR/Spec/Ticket；仅局部命名/fixture 布局变化可由 Ticket owner记录为低影响假设。未经批准不得扩大到依赖升级、lock 改写或发布。

## 6. Progress and Decisions

### Current Status

```text
WAVE_STATUS wave=W0 ready=none active=none done=T-27,T-28,T-29 blocked=none
GATE_STATUS gate=G1 state=closed evidence=<Path>{roots.state}/specdev/changes/{change}/evidence/T-27.md</Path> risks=后续产品路径变化会使组合指纹失效并重开G1
WAVE_STATUS wave=W1 ready=none active=none done=T-22 blocked=T-23:macOS-environment-residuals
GATE_STATUS gate=G2 state=open evidence=<Path>{roots.state}/specdev/changes/{change}/evidence/T-22.md</Path>,<Path>{roots.state}/specdev/changes/{change}/evidence/T-23.md</Path> risks=Windows已关闭；macOS x64/sleep/descriptor及共享启动路径变更后的package/startup/repair证据不可用
WAVE_STATUS wave=W2 ready=none active=none done=none blocked=T-25:waiting-for-G2
GATE_STATUS gate=G3 state=open evidence=historical-T-25-only risks=旧 verdict 非最终
```

### Pending Decisions and Blockers

产品和恢复策略未决问题为零。G1 已关闭；T-28/T-29 产品修复和 T-22 Windows Gate 已在远端固定点 `61dcfcba` 加内容指纹 `485ABFA47F334672A07845500260A07E922AE79491A0EA9F30A0B411AD252EB1` 上关闭，正式 NSIS、静默安装、installed direct flow 与确认 repair 均通过。G2 仅剩 T-23：真实 macOS x64、物理 sleep/wake、literal descriptor，以及共享启动路径变化后的 package/startup/repair 新鲜证据不可用。T-25 因 G2 未关闭而 blocked。

```text
TICKET_STATUS id=T-27 state=done evidence=<Path>{roots.state}/specdev/changes/{change}/evidence/T-27.md</Path> deviation=none
TICKET_STATUS id=T-28 state=done evidence=<Path>{roots.state}/specdev/changes/{change}/evidence/T-28.md</Path> deviation=none
TICKET_STATUS id=T-29 state=done evidence=<Path>{roots.state}/specdev/changes/{change}/evidence/T-29.md</Path> deviation=none
TICKET_STATUS id=T-22 state=done evidence=<Path>{roots.state}/specdev/changes/{change}/evidence/T-22.md</Path> deviation=none
TICKET_STATUS id=T-23 state=blocked evidence=<Path>{roots.state}/specdev/changes/{change}/evidence/T-23.md</Path> deviation=none
TICKET_STATUS id=T-25 state=blocked evidence=<Path>{roots.state}/specdev/changes/{change}/evidence/T-25.md</Path> deviation=none
BLOCKER id=T-23 owner=macos-gate-owner needed=macOS-x64-physical-sleep-literal-descriptor-and-final-fingerprint-package-startup-repair impact=G2,G3
```

### Resume Protocol

恢复时依次读取本 Goal Plan、当前 Wave Ticket、最新 Evidence、`<Path>{roots.state}/specdev/changes/{change}/.status.json</Path>` 和 Tickets Map。从最后关闭 Gate 的 candidate SHA 继续；若 SHA 或 shared product diff 不一致，先使下游 Evidence 失效并回到 owning Gate，不重复询问已确认恢复策略。

### Reporting Format

```text
WAVE_STATUS wave=<W0|W1|W2> ready=<ids> active=<ids> done=<ids> blocked=<ids>
GATE_STATUS gate=<G1|G2|G3> state=open|closed evidence=<evidence-path> risks=<summary>
TICKET_STATUS id=<id> state=<state> evidence=<evidence-path> deviation=<none|id>
BLOCKER id=<id> owner=<ticket-owner> needed=<environment-or-decision> impact=<scope>
DECISION id=<id> owner=<artifact-owner> status=pending|approved|rejected impact=<scope>
```

## Assumptions

- npm root lock metadata不镜像 script 文本；T-27 仍以 lock diff 为零作为验证，不依赖该推断放行。
- W1 实际并发取决于真实平台可用性；可以顺序运行，但不得改变依赖、Evidence 新鲜度或 blocking 语义。
- package/installer 具体产物名从最终 `<Path>package.json</Path>` 配置发现，不硬编码机器绝对路径。
