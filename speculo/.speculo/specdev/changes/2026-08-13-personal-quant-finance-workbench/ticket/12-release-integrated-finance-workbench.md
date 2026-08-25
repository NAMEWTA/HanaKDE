---
schema_version: 3
artifact: ticket
change: 2026-08-13-personal-quant-finance-workbench
id: T-12
title: 完成 finance-workbench 全模块集成与上线门
status: ready
planning_depth: deep
planning_depth_reason: 汇合全部金融模块、共享契约、路径边界、隐私安全、UI、构建和可卸载发布验证，事故半径覆盖整个内置插件。
ready: true
risk: critical
blocked_by: [T-11, T-09, T-08, T-07, T-06, T-05, T-04, T-03, T-02, T-01]
contract_ids: [AC-001, AC-002, AC-003, AC-004, AC-005, AC-006, AC-007, AC-008, AC-009, AC-010, AC-011, AC-012, AC-013, AC-014, AC-015, AC-016, AC-017, AC-018, AC-019, AC-020, AC-021, AC-022, AC-023, AC-024, AC-025, AC-026, AC-027, AC-028, AC-029, AC-030, AC-031, AC-032, AC-033, AC-034, AC-035, AC-036, AC-037, AC-038]
owner: root
expected_changes: ["<Path>plugins/finance-workbench/**</Path>"]
writable_paths: ["<Path>plugins/finance-workbench/**</Path>"]
read_only_paths: ["<Path>PLUGIN_SDK.md</Path>", "<Path>PLUGINS.md</Path>", "<Path>packages/plugin-sdk/**</Path>", "<Path>packages/plugin-runtime/**</Path>"]
shared_paths: ["<Path>plugins/finance-workbench/**</Path>"]
shared_path_owners: ["<Path>plugins/finance-workbench/**</Path> => T-12 release-owner"]
---

# Ticket T-12: 完成 finance-workbench 全模块集成与上线门

- **Ticket 文件：** `<Path>{roots.state}/specdev/changes/{change}/ticket/12-release-integrated-finance-workbench.md</Path>`
- **总体 Map：** `<Path>{roots.state}/specdev/changes/{change}/tickets-map.md</Path>`
- **上游 Spec：** `<Path>{roots.state}/specdev/changes/{change}/spec.md</Path>`
- **完成 Evidence：** `<Path>{roots.state}/specdev/changes/{change}/evidence/T-12.md</Path>`

## 1. 战略与来源

- **目标：** 将 T-01～T-11 汇合为可直接上线、可诊断、可卸载的内置 A/HK 个人量化金融插件。
- **可观察产出：** 全部 Spec 模块从总览进入并可用；跨模块状态/证据/隐私一致；构建、安装、dev loop、桌面/窄屏、删除插件和无交易副作用门全部通过。
- **来源：** `US-001`～`US-021`、`AC-001`～`AC-038`、`ADR-001`～`ADR-006`、`DEC-001`～`DEC-012`。
- **当前事实：** 这是唯一全插件根写入 owner；前序票据分别持有各自子路径并需 Evidence 完整，任何模块不可因 provider unavailable 而删除入口。
- **Planning Depth 原因：** 是全 change 的发布汇合和不可逆发布批准点，必须有跨票验证、回滚和残余风险记录。

## 2. 决策状态

### 已锁定决策

- 只有所有前序 Ticket 的合同和 Evidence 完成后才进入发布；高影响 provider 缺口以 capability 状态显示，不降低质量门。
- T-12 可以在插件根内做整合修复、manifest 版本/资源引用和插件内测试；不修改宿主或其他插件。
- “全部首版上线”表示入口和完整状态都存在，不表示每个 provider/dataset 均 supported。

### 已采用的低影响假设

- 发布使用 Hana 现有构建、plugin.dev install/reload/diagnostics/scenario 流程；不新造发行渠道。

### 未决问题

无。

## 3. 范围边界

| IN（本 Ticket 构建） | REUSE（复用且不改变契约） | OUT（明确不做） |
|---|---|---|
| 跨模块 wiring、manifest/asset 修复、全局 UI 状态、插件内集成测试、可卸载和 release evidence | T-01～T-11 领域实现、Hana build/dev loop、宿主 diagnostics | 宿主修复、provider 条款替代、交易/券商/资金、远程 marketplace 发布 |

## 4. 要构建什么

从总览进入数据源配置、资产、自选、行情、研究底稿、组合、筛选、回测、监控、任务、Agent 和导入导出，每个模块都能完成正常和受控 fallback 流程。跨模块传递使用同一 AssetRef/DataSnapshot/SourcePolicy/SourceDecision/RunSourceManifest/EvidenceRef/ResearchRun/ConsentRecord；诊断页能定位任意失败。`hithink-rest` BYOK 与适用 A 股优先规则可验证，`hithink-market-dump` 未过原型门时保持 blocked/unavailable。禁用/删除插件后 Hana 核心、其他插件和用户原始资源仍可正常工作。

## 5. 实现契约

- **入口或接缝：** plugin manifest, page/widget navigation, route/tool registry, integration fixtures, build/dev install and diagnostics.
- **输入与输出：** 输入各 Ticket 的稳定接口、provider fixtures、用户配置和测试资源；输出可安装插件、release checklist、全 AC Evidence 和残余风险。
- **公共接口变化：** 无宿主 API；只做插件内 wiring/版本化迁移。
- **不变量：** 产品 diff 只在 `plugins/finance-workbench/**`；所有模块入口存在；状态/证据/授权一致；无交易 tool；可卸载。
- **状态或数据流：** plugin install -> enable -> page navigation -> module routes/tasks/tools -> diagnostics/export -> disable/uninstall smoke。
- **错误与失败行为：** 任一关键 gate 失败则 release blocked，并保留失败 Evidence；不通过删测试、隐藏模块或放宽质量。
- **兼容要求：** build/host baseline 保持；plugin schema migration 可回滚/前向恢复；旧 provider/缓存隔离。
- **安全与隐私要求：** 运行 secret、私有资料、外发、长期任务和交易静态/动态扫描；UI 通过 keyboard/a11y/窄屏检查。

## 6. 执行路线

1. 读取 T-01～T-11 Evidence，冻结基线、版本、provider capability 和允许的插件 diff。
2. 在插件根内完成跨模块路由/导航、状态矩阵、诊断和 manifest/assets 整合。
3. 运行 manifest/schema/type/build、provider/data correctness、ResourceIO/privacy、TaskRegistry/Agent/no-trade 和 UI E2E 全套门禁。
4. 做 plugin.dev install/reload/diagnostics/scenario smoke，再在临时隔离环境执行整块删除/宿主启动测试。
5. 记录所有命令、AC 映射、偏差、残余风险和回滚说明；仅当全部通过才允许标记 done。

## 7. 路径访问契约

- **预计修改点：** `<Path>plugins/finance-workbench/**</Path>`；Evidence 是状态工件，不是产品写入路径。
- **可写范围：** `<Path>plugins/finance-workbench/**</Path>`。
- **只读上下文：** `<Path>PLUGIN_SDK.md</Path>`、`<Path>PLUGINS.md</Path>`、`<Path>packages/plugin-sdk/**</Path>`、`<Path>packages/plugin-runtime/**</Path>`、`<Path>{roots.state}/specdev/changes/{change}/ticket/</Path>`。
- **共享路径：** `<Path>plugins/finance-workbench/**</Path>`；T-12 是唯一 release/integration owner，前序票据必须已完成。
- **保留或不动：** 根 package/lock、宿主 core/server/shared、其他 plugins、外部 marketplace 和用户原始 ResourceIO。

## 8. 验证矩阵

| 行为或风险 | 验证接缝 | 命令或步骤 | 预期结果 | Evidence |
|---|---|---|---|---|
| 正常路径 | plugin.dev + route/tool/UI integration | 安装、启用、列 surface、运行 scenario，逐模块走通 | 全部入口和状态可用，AC 证据可追溯 | `<Path>{roots.state}/specdev/changes/{change}/evidence/T-12.md</Path>` |
| 失败路径 | negative/security/recovery suite | 注入 provider/BYOK/source policy/run manifest/local prototype/ResourceIO/Task/Agent/secret/交易/迁移错误 | release blocked 或安全降级，无 silent fallback、敏感值泄露或隐藏副作用 | `<Path>{roots.state}/specdev/changes/{change}/evidence/T-12.md</Path>` |
| 回归 | project baseline/build | 运行现有插件/宿主相关测试和构建 | 宿主及其他插件无回归，核心不依赖金融插件 | `<Path>{roots.state}/specdev/changes/{change}/evidence/T-12.md</Path>` |
| UI E2E（owner：Lead） | desktop/narrow/a11y/screenshot | 按页面和状态运行 E2E、可访问性树、视觉检查 | 无重叠/溢出，键盘可用，状态文字准确 | `<Path>{roots.state}/specdev/changes/{change}/evidence/T-12.md</Path>` |
| 可卸载 | isolated delete smoke | 在临时隔离环境删除 `<Path>plugins/finance-workbench/</Path>` 并启动宿主 | Hana 核心/其他插件/原始资源仍正常 | `<Path>{roots.state}/specdev/changes/{change}/evidence/T-12.md</Path>` |

- **Workspace checks（current-workspace）：** release implementation owner 在 current workspace 运行全插件单元/组件/集成、静态路径与无交易扫描、类型检查、lint、client/server 构建和安装预检，不创建 source worktree。
- **E2E disposition：** required：本票是全部模块、宿主插件运行时、外部 capability、隐私安全、桌面/窄屏和可卸载性的最终发布门，任何下层证据都不能替代组合状态验证。
- **E2E owner/environment：** Lead / current-workspace；在 direct-parent 最终组合状态逐模块运行正常/失败/恢复场景、桌面/窄屏/a11y/视觉检查、启停与隔离删除 smoke，预期 AC-001 至 AC-038 全部可追溯且无隐藏副作用。
- **Integration evidence（direct-parent）：** 记录 release implementation commit、parent before SHA、完整验证命令/退出状态、E2E 与可卸载结果、最终父分支 result SHA 及其包含全部 Ticket commits 的证明。

## 9. 发布、迁移与恢复

- **迁移顺序：** 前序 Evidence -> integration wiring -> full verification -> dev install/reload -> release approval；不越过未完成票据。
- **兼容窗口：** 插件 manifest/private schemas 遵循现有版本；provider/缓存/导入未知版本隔离。
- **监控信号：** plugin load/activation、route/tool error、capability matrix、task/research runs、privacy/no-trade scans、UI E2E 和宿主 baseline。
- **回滚或前向恢复：** dev install 失败使用宿主 uninstall/rollback；插件私有迁移失败保留旧 envelope；发布 blocked 时不得把 change 标 completed。
- **不可逆操作与批准点：** release-owner 在所有 AC Evidence、静态 no-trade、privacy、path scan 和可卸载 smoke 通过后批准上线；不执行远程 marketplace 发布。
- **收缩条件：** T-01～T-11 状态均 done/cancelled、无 uncovered AC、DAG/路径扫描通过，且残余风险已记录。

## 10. 验收标准

- [ ] `AC-001`～`AC-038` 全部有前序 Ticket Evidence 和本票集成证据，无 deferred/uncovered。
- [ ] 生产实现和测试 fixture 只在 `<Path>plugins/finance-workbench/</Path>`，宿主/其他插件无金融代码。
- [ ] plugin.dev、构建、UI、隐私、安全、数据正确性、任务恢复和无交易副作用门全部通过。
- [ ] 验证矩阵记录到 `<Path>{roots.state}/specdev/changes/{change}/evidence/T-12.md</Path>`，无未批准偏差。
