---
schema_version: 3
artifact: ticket
change: 2026-08-09-internalize-todolist-plugin
id: T-10
title: 发布完整 builtin Todo 产品
status: ready
planning_depth: standard
planning_depth_reason: 汇合全部纵向切片并验证现有 build/seed 分发、五语言可访问 UI、删除插件可恢复性和严格路径白名单，不新增宿主公共合同。
ready: true
risk: high
blocked_by: [T-09]
contract_ids: [AC-001, AC-003, AC-023, AC-025, AC-029, AC-031, AC-032, AC-033]
owner: release-owner
expected_changes: ["<Path>plugins/todolist/**</Path>"]
writable_paths: ["<Path>plugins/todolist/**</Path>"]
read_only_paths: ["<Path>package.json</Path>", "<Path>scripts/build-server.mjs</Path>", "<Path>scripts/build-server-plugin-runtime-deps.mjs</Path>", "<Path>scripts/**</Path>", "<Path>tests/**</Path>", "<Path>core/plugin-manager.ts</Path>", "<Path>desktop/**</Path>"]
shared_paths: []
shared_path_owners: []
---

# Ticket T-10: 发布完整 builtin Todo 产品

- **Ticket 文件：** `<Path>{roots.state}/specdev/changes/2026-08-09-internalize-todolist-plugin/ticket/10-release-complete-builtin-todo.md</Path>`
- **总体 Map：** `<Path>{roots.state}/specdev/changes/2026-08-09-internalize-todolist-plugin/tickets-map.md</Path>`
- **上游 Spec：** `<Path>{roots.state}/specdev/changes/2026-08-09-internalize-todolist-plugin/spec.md</Path>`
- **完成 Evidence：** `<Path>{roots.state}/specdev/changes/2026-08-09-internalize-todolist-plugin/evidence/T-10.md</Path>`

## 1. 战略与来源

- **目标：** 以真实产品构建和桌面流程证明 Hana Todo 已成为可分发、可整块删除、视觉和交互质量完整的 builtin 插件。
- **可观察产出：** 现有 build/seed 无修改即可收录插件、assets 和 runtime deps；五语言桌面/窄布局主流程通过；实施产品 diff 严格只在插件目录。
- **来源：** US-001、US-002、US-009、US-011，AC-001、AC-003、AC-023、AC-025、AC-029、AC-031～033，ADR-014，USER-DECISION。
- **当前事实：** 构建脚本已通配复制 `<Path>plugins/</Path>` 并发现运行依赖，无需根注册；此前 UI 质量义务由各垂直 Ticket 同步实现，本 Ticket 做真实汇合验证和插件内缺口修复。
- **Planning Depth 原因：** 不新增 schema/宿主接口，但发布面包含全产品构建、分发、视觉、可访问性、路径和可移除性，风险高且跨多个验证接缝。

## 2. 决策状态

### 已锁定决策

- 所有实现性修复仍只写 `<Path>plugins/todolist/</Path>`；根脚本、依赖、公共测试、宿主和其它插件完全只读。
- 使用仓库既有 typecheck、lint、server/renderer build、seed 和 test 命令，不修改命令定义来制造绿色。
- 产物必须从构建/seed 目录独立加载，不依赖 workspace symlink 或未复制源码。
- 在临时隔离副本/worktree 中删除插件目录执行非 Todo smoke，绝不删除当前用户工作区中的目录。
- 路径审计相对于实施前记录的基线/实施提交集进行，不能把当前工作区既有无关改动归因于本 change，也不能覆盖它们。
- zh-CN、zh-TW、ja、ko、en、键盘、焦点、ARIA、主题和窄布局均是 Gate；截图/像素检查必须确认无空白、裁切、遮挡或错位。

### 已采用的低影响假设

- 正式 Goal Plan 指定当前集成 owner 运行 Playwright 和产物 Gate；Ticket 不预设 Lead/Worker。

### 未决问题

无。

## 3. 范围边界

| IN（本 Ticket 构建） | REUSE（复用且不改变契约） | OUT（明确不做） |
|---|---|---|
| 插件内集成修复、全流程 E2E、视觉/a11y/i18n 校验、build/seed/package smoke、runtime deps、路径和整块删除审计 | T-01～T-09 行为、既有根命令与通配构建、临时隔离 workspace | 根脚本/依赖/测试修改、宿主补丁、隐藏失败、当前工作区破坏性删除、新功能扩张 |

## 4. 要构建什么

从干净实施基线构建产品后，Hana Todo 以 builtin loaded，Page 和用户级 tools 可用。用户可以在五种语言、桌面和窄窗口完成捕获、编辑、删除恢复、计划、周期、提醒诊断、Automation 操作、Review 和导出；界面无文本裁切或控件遮挡。server/renderer/seed 产物含插件及运行依赖且不依赖源码 workspace。Git allowlist 只出现 `<Path>plugins/todolist/</Path>` 产品文件；隔离环境移除插件后非 Todo 引擎仍能构建和运行。

## 5. 实现契约

- **入口或接缝：** 完整插件 test suite、Desktop/narrow Playwright、root type/lint/build/seed/test commands、产物内容和 Git path audit。
- **输入与输出：** 实施基线与提交集、构建产物、locale/theme/viewport matrix；输出为命令状态、截图、产物清单、路径差异和可移除 smoke。
- **公共接口变化：** 无；只收口已批准 builtin 插件贡献。
- **不变量：** 产品写入根唯一；既有 `todo_write`/宿主/其它插件不变；产物自包含；删插件后非 Todo 系统成立；失败分类诚实。
- **状态或数据流：** source plugin -> existing build/seed -> product artifact -> PluginManager load -> Desktop E2E；baseline -> implementation diff -> allowlist report。
- **错误与失败行为：** 新失败、基线失败、环境失败、无效验证分开记录；不得跳过、放宽、吞错或改根命令。
- **兼容要求：** builtin source priority、community plugin behavior、TaskRegistry 其它 handlers、TodoWrite 和非 Todo build/test 均保持。
- **安全与隐私要求：** 最终 manifest capability 与实际使用一致；产物/日志/截图/导出不泄漏 secret、完整 transcript 或绝对 workspace path。

## 6. 执行路线

1. 固定实施基线、预期提交集、插件目录清单、locale/viewport/主题和 AC 场景矩阵。
2. 运行插件全量 Vitest、typecheck/lint，并只在 `<Path>plugins/todolist/</Path>` 修复集成缺口。
3. 运行 server/renderer build、seed smoke 与产物依赖/加载检查，证明无 workspace symlink 依赖。
4. 启动桌面测试环境，执行五语言、桌面/窄布局、键盘/ARIA 和截图 Gate，检查空白、裁切、遮挡与交互状态。
5. 审计产品 diff、manifest capability、tool catalog、禁用代码模式和敏感输出；在临时隔离环境执行整块删除 smoke。
6. 运行适用全量回归，分类所有失败并把命令、截图、清单和残余风险写入 Evidence。

## 7. 路径访问契约

- **预计修改点：** 仅 `<Path>plugins/todolist/**</Path>` 内集成、测试、资产、依赖声明和修复。
- **可写范围：** `<Path>plugins/todolist/**</Path>`；即使根命令失败也不得修改其定义或其它产品文件。
- **只读上下文：** 根 package/scripts/tests、PluginManager、desktop 和构建产物。
- **共享路径：** 无；T-10 是串行最终集成 Ticket，正式 owner 由 Goal Plan 指定。
- **保留或不动：** 插件根之外所有产品代码与用户既有工作树改动。

## 8. 验证矩阵

| 行为或风险 | 验证接缝 | 命令或步骤 | 预期结果 | Evidence |
|---|---|---|---|---|
| 正常路径 | 插件全量 + 产品构建 | `npx vitest run <Path>plugins/todolist/tests</Path>`，再运行既有 typecheck/lint/build/seed 命令 | 插件行为绿色，产物包含 builtin、assets 和 runtime deps 且可加载 | `<Path>{roots.state}/specdev/changes/2026-08-09-internalize-todolist-plugin/evidence/T-10.md</Path>` |
| 失败路径 | 产物/能力/路径故障检查 | 从精确产物加载并检查缺依赖、capability mismatch、隐藏 tool、敏感内容 | 无 workspace fallback；失败稳定且无敏感泄漏 | `<Path>{roots.state}/specdev/changes/2026-08-09-internalize-todolist-plugin/evidence/T-10.md</Path>` |
| UI E2E（owner：当前集成 owner） | Desktop/narrow Playwright + screenshots | 运行 `<Path>plugins/todolist/tests/e2e/</Path>` 全套五语言/主题/viewport 场景并检查截图/像素 | 主流程可用，无空白、裁切、遮挡、错位或焦点丢失 | `<Path>{roots.state}/specdev/changes/2026-08-09-internalize-todolist-plugin/evidence/T-10.md</Path>` |
| 路径/可移除性 | Git allowlist + 临时隔离 smoke | 对实施基线审计产品 diff；在临时 worktree 删除 `<Path>plugins/todolist/</Path>` 后运行非 Todo build/test | 产品 diff 仅插件根，非 Todo 引擎仍构建运行，当前工作区未被删除 | `<Path>{roots.state}/specdev/changes/2026-08-09-internalize-todolist-plugin/evidence/T-10.md</Path>` |
| 回归 | 仓库既有测试 | 运行 `<Path>package.json</Path>` 定义的适用全量测试并单列基线/环境失败 | TodoWrite、PluginManager、TaskRegistry、EventBus、其它插件无新回归 | `<Path>{roots.state}/specdev/changes/2026-08-09-internalize-todolist-plugin/evidence/T-10.md</Path>` |

## 9. 发布、迁移与恢复

- **迁移顺序：** 不适用：本 Ticket 不新增数据模型；只在 T-01～T-09 migration Evidence 完整后构建发布候选。
- **兼容窗口：** 构建候选只使用当前插件 schema/manifest；无旧 SQLite 或宿主兼容层。
- **监控信号：** build/seed exit、产物加载、plugin readiness、E2E console/network、截图、path allowlist 和全量回归分类。
- **回滚或前向恢复：** 发布前可整块移除插件；已有数据/运行后按前序 Ticket 前向恢复，后台开关可停止新副作用。
- **不可逆操作与批准点：** 发布与任何真实数据 import/purge 均需独立明确批准；本 Ticket 验证不执行真实用户不可逆操作。
- **收缩条件：** 所有 AC 有 Evidence、路径违规为零、产物自包含、整块删除 smoke 与五语言视觉 Gate 通过后才可标记发布就绪。

## 10. 验收标准

- [ ] AC-001、AC-032：既有 build/seed 产物包含并加载 builtin Todo，运行依赖完整且不靠 workspace symlink。
- [ ] AC-025：实施产品新增/修改/删除/生成文件全部位于 `<Path>plugins/todolist/</Path>`。
- [ ] AC-031：五语言、键盘、焦点、ARIA、主题和桌面/窄布局全流程通过截图与交互 Gate。
- [ ] AC-003、AC-023、AC-029、AC-033：TodoWrite、readiness、错误和 tool catalog 回归通过。
- [ ] 临时隔离环境删除插件后非 Todo build/test 通过，当前工作区与用户改动未受破坏。
- [ ] Evidence 完整，所有失败正确分类，Ticket、Map 与状态同步。
