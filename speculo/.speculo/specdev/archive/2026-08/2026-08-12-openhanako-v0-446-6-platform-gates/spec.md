---
schema_version: 3
artifact: spec
change: 2026-08-12-openhanako-v0-446-6-platform-gates
status: ready
ready_for_tickets: true
sources:
  - "<Path>{roots.state}/specdev/archive/2026-08/2026-08-09-openhanako-v0-446-6-integration/spec.md</Path>"
  - "<Path>{roots.state}/specdev/changes/{change}/diagnosis.md</Path>"
  - "<Path>{roots.state}/specdev/changes/{change}/design-tree.json</Path>"
  - "USER-DECISION:platform-gates-owns-startup-integrity-fix"
---

# Spec: openhanako v0.446.6 平台阻断门与启动完整性收口

- **Spec：** `<Path>{roots.state}/specdev/changes/{change}/spec.md</Path>`
- **当前 ADR：** `<Path>{roots.state}/specdev/changes/{change}/ADR.md</Path>`
- **当前领域上下文：** `<Path>{roots.state}/specdev/changes/{change}/CONTEXT.md</Path>`

## 1. 问题与目标

### 问题陈述

原 umbrella change 已完成主要产品整合，但 Windows/macOS 阻断 Gate 和最终验收尚未收口。真实 Windows 执行现已进一步证明：根 `node_modules` 可以在安装被中断后处于“版本和 package metadata 正确、包内文件残缺”的状态；现有 postinstall、开发入口与 Desktop 启动流程均未在正确接缝拦截，最终由 Server import 以 `ERR_MODULE_NOT_FOUND` 崩溃，并被错误归因为自动更新竞态。

该缺陷阻止 T-22 的真实 package/start smoke，也使共享 Desktop 启动路径变化后必须重跑 T-23。当前 change 必须先交付有界的启动完整性修复，再在同一最终固定点完成双平台 Gate 和 umbrella 最终验收。

### 目标用户与场景

- 使用 Volta 和仓库源码启动 HanaKDE 的开发者：安装目录残缺时，在昂贵构建和 Electron spawn 前得到准确、可执行的恢复建议。
- 使用已打包 HanaAgent 的用户：组件 artifact 持续缺文件时，可在不触碰用户数据的前提下确认修复并重启。
- 平台与发布维护者：Windows/macOS Gate 对修复后的同一候选形成新鲜、不可替代的 Evidence。

### 成功标准

- 开发态残缺依赖在 postinstall 或任一源码入口 preflight 中稳定失败，明确指导 `volta run npm ci`，且应用不自动修改依赖。
- 完整依赖安装、Pi runtime import、CLI/Server/Desktop 开发入口保持可用。
- 打包态持久模块缺失不再显示开发依赖建议；用户可确认“修复并重启”，恢复只作用于 artifact 白名单。
- 首次启动缺少可选偏好文件时使用默认值且不输出错误；真实解析、权限和 I/O 错误仍可观察。
- T-22、T-23 和 T-25 全部基于 T-27 后的最终 SHA 完成，无关键 skip 或过期 Evidence。

### 非目标

- 不升级 Node、Pi SDK、typebox 或其他依赖，不改依赖版本策略。
- 不由应用自动运行 `npm install` 或 `npm ci`，不自动删除开发者 `node_modules`。
- 不改变签名、notarization、发布、远程写入或真实用户数据。
- 不新增 legacy migration、旧 Profile 兼容、OCR 或 Linux 阻断 Gate。

## 2. 解决方案与外部行为

### 解决方案摘要

复用 server packaging 已有的 external entrypoint verifier，把它提升为同时服务构建输出和根开发安装的运行时完整性合同：校验所有根生产依赖声明的精确、非通配运行时入口，对关键 Pi AI 入口执行真实 ESM import smoke，并接入 postinstall 与所有源码 launcher。Desktop 将模块缺失按 source/dev 与 packaged artifact 两类处理；首次偏好读取只对非 ENOENT 失败记录错误。

### 主要流程

1. 依赖安装完成时，postinstall 先保留现有 Pi SDK verifier，再运行 runtime dependency verifier。
2. `start`、`start:dev`、`start:vite` 在 helper/build 之前运行同一 verifier；`cli` 与 `server` 在 launcher spawn 前运行。
3. 完整性失败输出损坏 package/entrypoint、稳定错误标识 `HANA_DEPENDENCY_INTEGRITY` 和恢复命令，随后以非零状态退出。
4. Desktop source/dev 若仍捕获模块解析错误，零重试并标记 `DEV_DEPENDENCY_INCOMPLETE`，使用开发依赖文案。
5. Packaged Desktop 在 artifact readiness 或 Server import 中发现组件缺失时保留一次短退避；仍失败则标记 `PACKAGED_COMPONENT_INCOMPLETE`，提供“修复并重启/退出”。
6. 用户确认后复用现有 artifact repair；只有白名单清理全部成功才 relaunch。取消或修复失败均退出并保留诊断日志。

### 边界、失败与稳定错误行为

- 精确 runtime export 缺失、package manifest 缺失或 Pi import 失败都属于依赖完整性失败；`types` 条件和通配 export 不做静态文件全展开。
- EMFILE/ENFILE 等瞬态读取资源失败继续作为 I/O 失败传播，不伪装成“缺 entrypoint”。
- 开发态不得等待自动更新、重试 Server 两次或引导用户使用“修复组件”。
- 打包态不得引导用户运行 npm；修复动作必须经用户确认，且失败不得形成自动 relaunch 循环。
- `preferences.json` 不存在返回默认值；损坏 JSON、权限拒绝和其他读取失败继续输出脱敏日志。
- 未能运行真实 Windows/macOS 阻断行时，对应 Ticket 保持未完成，不以其他平台或 synthetic fixture 代替。

### 状态转换与不变量

```text
开发态：preflight healthy → spawn
       preflight broken → fail-fast → developer runs volta run npm ci → reverify

打包态：artifact ready → spawn
       missing → one backoff/retry → ready → spawn
                                  → persistent → user confirm repair → repair success → relaunch
                                                               └ cancel/failure → log + quit
```

- 一次启动最多触发一次模块缺失退避和一次经确认的 artifact repair。
- 组件修复永远不作用于 agents、sessions、settings 或 artifact 根下非白名单状态。
- 运行时完整性门禁不改变 package 或 lock 内容。
- T-22/T-23 Evidence 必须来自同一个包含 T-27 的固定点；T-25 不实现产品修复。

## 3. 用户故事

- **US-001**：作为 HanaKDE 维护者，我希望冻结的 v0.446.6 成为可审计的新基座并完整吸收正常上游迭代，以便后续同步不依赖长期 fork 兼容壳。
- **US-002**：作为 Workspace 用户，我希望当前工作目录始终是唯一 `main`，且额外挂载继续可管理和编辑但不冒充另一个 Workspace。
- **US-003**：作为 Workspace 用户，我希望查看 `main` 内文本文件的版本、删除历史、diff、retention 状态并安全 restore。
- **US-004**：作为 Agent 对话用户，我希望按当前对话或操作查看相关文件影响，并在适用时复用共享 diff/restore。
- **US-005**：作为使用外部编辑器的用户，我希望内部写入、外部写入和丢失事件后的修复最终产生一致 History、Knowledge 与 UI。
- **US-006**：作为执行 restore 的用户，我希望系统在写入前检查 root 与当前版本，并在成功后让所有读取面收敛。
- **US-007**：作为 File Tool、Office 和 Knowledge 用户，我希望受支持文档通过一个共享抽取能力转为 Markdown，并得到明确失败原因。
- **US-008**：作为 Resource 调用者，我希望 copy、transfer 与 materialize 保持不同生命周期和安全语义。
- **US-009**：作为 HanaKDE 用户，我希望基础设施降级时看到准确状态、错误和 scoped recovery，而不是错误归因。
- **US-010**：作为未发布产品的维护者，我希望直接建立唯一新 schema 与基础设施基线，不引入不存在的旧数据迁移。
- **US-011**：作为安全负责人，我希望 root identity、scope、symlink/junction 与 effect 前重校验在危险操作上一致生效。
- **US-012**：作为发布负责人，我希望 Windows、macOS、production/native packaging、去冗余和 sync ledger 都形成阻断 Evidence。
- **US-013**：作为源码开发者，我希望残缺依赖在启动前被准确识别并收到 Volta 兼容的干净恢复命令。
- **US-014**：作为打包应用用户，我希望损坏组件可经确认从签名 seed 恢复，且个人数据不受影响。
- **US-015**：作为首次启动用户，我希望尚未创建可选偏好文件时应用安静使用默认设置。

## 4. 验收合同

| ID | 前置条件 | 动作或事件 | 可观察结果 | 验证接缝 |
|---|---|---|---|---|
| AC-001 | 整合 HEAD 已形成 | 检查冻结 target ancestry 与 staged merge audit | `5f08a4f30203abb61dafac7dbb7ab92d11c23efa` 是最终 HEAD ancestor；checkpoint、overlap 与语义裁决可追踪 | Git fixed-point inspection + sync ledger |
| AC-002 | v0.446.6 功能已吸收 | 运行上游功能及关联 settings/persistence/build 回归 | 冻结上游正常功能和修复可用，不为旧内部实现保留兼容壳 | 上游回归 + 产品集成测试 |
| AC-003 | HanaKDE 与上游完成语义融合 | 运行 Knowledge、Resource、Transfer、安全和 Workbench 合同 | HanaKDE 二开能力无行为回退，开放边界保持 | Vitest、Knowledge E2E、open boundary gate |
| AC-004 | 一个 `main` 已打开 | 用户切换工作目录 | 旧 `main` 关闭，新目录成为全新 `main`，旧状态不自动继承 | Workspace lifecycle integration |
| AC-005 | `main` 有额外挂载 | 编辑/浏览挂载并查询 Workspace History | 挂载能力保持；Workspace History 不捕获挂载且不建挂载 store | Workspace/History scope test |
| AC-006 | `main` 含符合策略的文本文件 | 内外部修改、rename、delete 或 reconciliation observation | History 正确显示版本、删除、origin、timeline 和 diff，无内容变化不重复 | File History integration |
| AC-007 | History 使用冻结默认策略 | 高频保存、超大文件或 retention 到期 | merge window、单快照上限、年龄/容量和噪音排除策略保持 | Policy/store deterministic tests |
| AC-008 | Agent 对话关联资源变化 | 打开 Agent 文件变化入口 | 按对话/操作过滤并复用共享 timeline/diff/restore，不创建第二事实源 | Agent projection integration |
| AC-009 | N 个消费者订阅同一 canonical root | 同时订阅和退订 | 始终最多一个 physical watcher，最后消费者释放后关闭 | Watch coordinator/descriptor regression |
| AC-010 | 旧 owner 观察真实 root | 执行切换或失败恢复 | 旧 owner 停止先于新 owner 启动，overlap count 为 0 | Cutover state-machine + Gate Evidence |
| AC-011 | ResourceIO 或 watcher 产生同版本变化 | ResourceEventBus 接收 mutation 与 echo | 顺序单调、来源可辨、同版本重复合并、subscriber 失败隔离 | ResourceEventBus contract tests |
| AC-012 | cursor 过期或 watcher 丢事件 | catch-up/resume/repair | 进入 scoped reconciliation，共享 baseline 只 observation 一次 | Reconciliation + scan counter |
| AC-013 | observation/派生链健康变化 | error、gap、retry、repair | 状态按 HEALTHY/DEGRADED/RECONCILING/FAILED 转换并可 scoped retry | Health transition + UI state |
| AC-014 | root 与资源已授权 | 比较路径关系、大小写别名、symlink/junction/root replacement | ProviderRootIdentity 是 authority，unknown/越界/替换 fail closed | Root Identity + malicious workspace |
| AC-015 | 用户选择历史版本并携带 expected current | 当前版本未变时 restore | 只经 ResourceIO 写盘，产生 `history_restore` correlation 和可反悔版本 | History/ResourceIO integration |
| AC-016 | 文件或 root 在打开历史后变化 | 使用旧 expected version restore | 请求拒绝，磁盘不变，返回可识别冲突/安全失败 | Restore conflict + TOCTOU tests |
| AC-017 | 合法 restore 完成 | 等待事件与 repair 收敛 | Disk、Preview、History、Knowledge、Search、Agent Read 一致 | Restore E2E consistency |
| AC-018 | 已授权文档不超过 50 MiB | 抽取冻结支持格式 | 返回 derived Markdown、detected format 与 warnings | Extraction fixture tests |
| AC-019 | 文档不支持、过大、扫描 PDF 或损坏 | 调用抽取 | 返回稳定 unsupported/too-large/scanned-pdf/parse-failed，超限先拒绝 | Extraction failure matrix |
| AC-020 | abstract Resource 需要 path-only converter | bounded read 或 Materialize 后抽取 | 成功或稳定失败；staging 清理；未授权拒绝 | ResourceIO/Materialize/Extraction |
| AC-021 | Office 文档位于 Knowledge 来源 | 创建或修改 | 共享 Extraction 进入 Semantic IR/index/Search，版本变化重抽取 | Office Knowledge integration/E2E |
| AC-022 | 抽取成功或 PDF 无文字层 | ingestion 或 scanned-pdf | 不自动生成同名 Markdown、不启动 OCR、不形成循环 | Filesystem + failure test |
| AC-023 | 调用者执行 copy/transfer/materialize | 三类操作分别完成 | 生命周期、授权、恢复和 side effect 独立，固定 budgets 不降低 | ResourceIO contract tests |
| AC-024 | 用户进入 Workbench/Agent Conversation | 查看 History、diff、restore、deleted、`@` 与健康状态 | 产品入口分离但共享底层；UI 无 shadow file truth | Component + Playwright flows |
| AC-025 | 新 `main` 首次打开无旧 History 数据 | 初始化 store 成功或失败 | 只创建唯一新基线；失败可 retry 且不破坏其他能力；无 migration 状态 | New-store failure tests |
| AC-026 | 外部/LAN/Renderer 查询或收事件 | 携带 raw root、新 public workspaceId 或越界资源 | 绑定授权 `main`/ResourceRef/opaque key；越界拒绝且不泄漏绝对路径 | Route schema + security tests |
| AC-027 | Windows 与 macOS 构建输入就绪 | 运行原生安全、watcher、restore、native extraction 与 production package | 两平台分别形成通过 Evidence；任一阻断失败则 change 不完成 | Windows/macOS runners + package smoke |
| AC-028 | 所有行为合同通过 | 执行重复 owner/parser 扫描并审查架构与 sync ledger | 重复 watcher/baseline/root helper/parser 删除，文档与 ledger 完整 | Structural scan + review + ledger |
| AC-029 | production dependency 的 manifest 存在但精确 runtime entrypoint 缺失，或 Pi AI 无法 import | 运行 postinstall、`start*`、CLI 或 Server launcher | 在 helper/build/spawn 前以 `HANA_DEPENDENCY_INTEGRITY` 失败，指出 package/entrypoint 与 `volta run npm ci`；完整安装全部通过 | dependency fixture、Pi import smoke、launcher contract |
| AC-030 | packaged artifact readiness 或 Server import 持续缺模块 | 启动应用并经过一次短退避 | 显示 packaged component 错误与“修复并重启/退出”；确认后只清 artifact 白名单并成功才 relaunch，取消/失败不循环 | server-readiness、artifact-repair、Desktop startup integration |
| AC-031 | 新 Profile 尚无 `user/preferences.json` | Desktop 读取 proxy、keep-awake、quick-chat 或 update channel | 静默返回既有默认值；损坏 JSON、权限和其他 I/O 错误仍记录脱敏日志 | startup/safe-read contract |

### 用户故事覆盖

| 用户故事 | 覆盖合同 |
|---|---|
| US-001 | AC-001—AC-003、AC-028 |
| US-002 | AC-004、AC-005、AC-025 |
| US-003 | AC-006、AC-007、AC-015—AC-017、AC-024 |
| US-004 | AC-008、AC-024 |
| US-005 | AC-009—AC-013、AC-017 |
| US-006 | AC-015—AC-017 |
| US-007 | AC-018—AC-022 |
| US-008 | AC-020、AC-023 |
| US-009 | AC-013、AC-024、AC-025、AC-029—AC-031 |
| US-010 | AC-025 |
| US-011 | AC-014、AC-016、AC-020、AC-026 |
| US-012 | AC-001、AC-027、AC-028 |
| US-013 | AC-029 |
| US-014 | AC-030 |
| US-015 | AC-031 |

## 5. 范围

### IN

- 运行时 dependency entrypoint verifier、postinstall 与源码 launcher preflight。
- Desktop 模块缺失分类、开发态 fail-fast、打包态确认修复、本地化和首次偏好读取降噪。
- 真实 Windows/macOS native、watcher、安全、restore、extraction、production package 和启动恢复 Gate。
- 最终固定点上的 AC-001—AC-031、15 项原 umbrella DoD、结构与 Evidence 审查。

### REUSE

- 归档 umbrella change 的 T-01..T-21、T-24、T-26 实现与 Evidence。
- `<Path>scripts/build-server-deps.mjs</Path>` 的 existing entrypoint verifier 和重试 errno 合同。
- `<Path>desktop/src/shared/artifact-repair.cjs</Path>` 的白名单清理与签名 seed 正常 boot 路径。
- 现有 T-22/T-23 platform runner、package inventory、E2E 与 Evidence 格式。

### OUT

- **OOS-001**：依赖升级、lock 版本变化和自动开发依赖修复；它们不是本次根因修复所需。
- **OOS-002**：新的 artifact 存储格式、签名 key、OTA protocol 或自动无确认 repair。
- **OOS-003**：legacy profile/schema migration、OCR、relocation 和公共 `workspaceId`。
- **OOS-004**：签名、公证、发布、部署、远程写入、真实用户数据修改和 Git 集成动作。
- **OOS-005**：用 Linux、mock、synthetic package 或 blocking skip 替代 Windows/macOS 原生 Evidence。

## 6. 已锁定实现约束

- **DEC-001**：上游正常功能、修复和优化默认吸收；真实 HanaKDE 产品、安全、数据或开放边界差异做语义融合。来源：归档 Spec。
- **DEC-002**：`main`、History、Resource、Extraction、Knowledge、Root Identity 与平台阻断合同继续使用归档 umbrella 的唯一新基线。来源：AC-004—AC-028。
- **DEC-003**：Windows/macOS 是阻断平台，Linux 非阻断；两平台都需要原生与 production package Evidence。来源：ADR-001。
- **DEC-004**：平台 Gate 发现的阻断产品缺陷由当前 change 的独立 T-27 修复，平台 Ticket 保持 harness/validation ownership。来源：ADR-002。
- **DEC-005**：shared runtime dependency verifier 具有 `root-only` 与 `all-exact` 两种 scope；existing packaged build 保持 root-only，根开发安装使用 all-exact 校验生产依赖的精确非通配运行时入口并 smoke import Pi AI；不静态展开 wildcard export，不把 type-only target 当运行时要求。来源：ADR-003。
- **DEC-006**：开发态完整性失败零重试、指导 `volta run npm ci`、不自动修改依赖。来源：ADR-003、ADR-004。
- **DEC-007**：打包态只保留一次短退避；持续缺失后由用户确认 artifact repair，成功才 relaunch。来源：ADR-004。
- **DEC-008**：可选偏好文件 ENOENT 静默，其他读取失败保持脱敏可观察。来源：LOG-004。
- **DEC-009**：T-22/T-23 必须在包含 T-27 的同一最终固定点重跑；T-25 只读汇总且不实现修复。来源：ADR-002。

## 7. 数据、接口与兼容

- **公共接口变化：** 无对外 HTTP/schema 变化；新增内部 npm script `verify:runtime-deps` 和稳定内部启动错误标识 `HANA_DEPENDENCY_INTEGRITY`、`DEV_DEPENDENCY_INCOMPLETE`、`PACKAGED_COMPONENT_INCOMPLETE`。
- **数据模型与持久化：** 无 schema 变化；artifact repair 继续使用现有白名单，偏好文件缺失不创建新状态。
- **兼容要求：** Node 24.16.0、Pi SDK 0.80.3、typebox 1.1.38、现有 Volta 与 package-lock 保持；完整安装的既有开发、CLI、Server 与 packaged startup 行为不退化。
- **迁移要求：** 无数据迁移。当前本地残缺安装需在 T-27 实现前由开发者显式执行 `volta run npm ci`，该操作不是产品自动迁移。
- **发布或运维影响：** package/start Gate 增加 dependency preflight 和 packaged repair smoke；不签名、不发布。

## 8. 非功能要求

- **NFR-001 安全与隐私：** 修复只清 artifact 白名单，不写真实用户数据；日志继续脱敏绝对 home/HANA_HOME 路径；开发进程不自动执行依赖重建。
- **NFR-002 性能与容量：** 开发 preflight 必须早于 expensive build；只扫描精确 runtime targets，避免遍历 package 全文件树或展开 wildcard exports。
- **NFR-003 可用性与可靠性：** 同一失败给出与运行模式匹配的唯一恢复路径；修复失败不得 relaunch loop；阻断平台验证不能 silent skip。
- **NFR-004 可观测性与运营：** 错误标识、损坏 package/target、恢复结果、失败分类和 Evidence SHA 可追踪；预期 ENOENT 不污染错误日志。

## 9. 验证策略

| 接缝 | 层级 | 覆盖合同 | 现有先例或命令 | Evidence 类型 |
|---|---|---|---|---|
| dependency exports 与 import smoke | 单元/进程集成 | AC-029 | `<Path>tests/build-server-deps.test.ts</Path>`、直接 import `@earendil-works/pi-ai` | fixture 结果、exit code、错误文本 |
| npm scripts 与 launcher order | 脚本合同 | AC-029 | `<Path>tests/startup-contract.test.ts</Path>`、postinstall/launcher 子进程 | source/child-process contract |
| Desktop module classification | 稳定 shared module | AC-029、AC-030 | `<Path>tests/server-readiness.test.ts</Path>` | Vitest 状态/重试断言 |
| artifact repair | 文件系统/启动集成 | AC-030 | `<Path>tests/artifact-repair.test.ts</Path>` 与 Desktop startup contract | 白名单、确认、relaunch/quit 断言 |
| optional preferences | Desktop startup contract | AC-031 | `<Path>tests/startup-contract.test.ts</Path>` | ENOENT/parse/permission 日志断言 |
| 本地化 parity | 静态/组件 | AC-029—AC-031 | `<Path>tests/i18n-locale-parity.test.ts</Path>` | locale key parity |
| Windows production/native | 平台/Package | AC-009—AC-010、AC-014—AC-023、AC-027、AC-029—AC-031 | `volta run npm run dist:win`、`<Path>scripts/platform/windows/run-gate.mjs</Path>`、NSIS install/start/repair smoke | Windows Evidence、package inventory、启动日志 |
| macOS production/native | 平台/Package | AC-009—AC-010、AC-012—AC-023、AC-027、AC-029—AC-031 | `volta run npm run dist`、macOS runner、app/DMG/startup smoke | macOS Evidence、descriptor/sleep/startup 结果 |
| umbrella fixed point | 仓库/全合同 | AC-001—AC-031 | test/typecheck/lint/build、结构扫描、归档 Evidence 审查 | final SHA、命令与 verdict |

### 原 umbrella Definition of Done

| DoD | 完成条件 | 验收合同 |
|---|---|---|
| 1 | 冻结 v0.446.6 target 是最终 HEAD ancestor | AC-001 |
| 2 | HanaKDE Knowledge / Resource / Workbench 无回退 | AC-002、AC-003 |
| 3 | `main` File History 完整，Agent 变化使用共享底层投影 | AC-005—AC-008、AC-024 |
| 4 | Document Extraction 完整可用 | AC-018—AC-020 |
| 5 | Office 文档通过统一 Extraction 进入 Knowledge | AC-021、AC-022 |
| 6 | Materialize 与 Transfer 同时存在且语义清晰 | AC-023 |
| 7 | Root Identity 是统一 physical root authority | AC-014、AC-016、AC-026 |
| 8 | 同一 Workspace root 无多个业务 physical watcher | AC-009、AC-010 |
| 9 | ResourceEventBus 是统一 mutation fan-out | AC-011 |
| 10 | Baseline reconciliation 不重复完整扫描同一 root | AC-012 |
| 11 | Restore 后 Disk / Preview / History / Knowledge / Agent Read 一致 | AC-015—AC-017 |
| 12 | Windows/macOS 关键门禁通过 | AC-027 |
| 13 | Package/native production build 可用 | AC-027 |
| 14 | 重复基础设施和重叠 parser 被删除 | AC-021—AC-023、AC-028 |
| 15 | 架构与 upstream sync ledger 进入仓库 | AC-001、AC-028 |

## 10. 风险、假设与未决问题

### 风险

- verifier 若把 wildcard/type-only export 当成静态 runtime 文件，或把 all-exact 错用于 NFT-pruned artifact，会误报；通过 scope 默认值、明确过滤和 fixture 反例控制。
- Desktop 启动 catch 改为可选择恢复后，若错误分类不严格可能错误清理 artifact；只有 packaged context 与稳定错误标识同时成立才显示 repair。
- T-27 修改共享启动路径，使 T-23 已有 review Evidence 过期；必须在最终固定点重跑受影响 Gate。
- macOS x64 与物理 sleep/wake 仍依赖真实硬件/runner availability，不能由文档计划消除。

### 已采用的低影响假设

- 根 package-lock 不镜像 npm script 文本，因此新增/调整 scripts 正常不改 lock；实现后以 `git diff -- package-lock.json` 验证。
- verifier 的局部组织和测试 fixture 文件名可按现有脚本/测试惯例调整，但不得改变 DEC-005 的 target 语义。
- Windows installer 文件名按 `<Path>package.json</Path>` electron-builder 配置解析，不在合同中硬编码版本化绝对路径。

### 未决问题

无。

## 11. 验收范围覆盖（2026-08-22）

用户确认当前没有真实 macOS x64、物理 sleep/wake 和 literal kernel descriptor 环境，并明确要求取消这些测试后归档。本节作为最新权威验收决定覆盖前文中要求 T-23 全部阻断行必须执行的完成条件：

- T-23 以 `cancelled` 终止；macOS x64、物理 sleep/wake、literal descriptor，以及依赖这些环境的最终 package/startup/repair 重跑不再是本 change 的完成门。
- 缺失平台结果不得标记为 pass；它们以 approved waiver 和残余风险记录在 T-23/T-25 Evidence。
- AC-009—AC-010、AC-012—AC-023、AC-027、AC-029—AC-031 的最终接受基于真实 Windows T-22、macOS arm64、现有 package/direct-flow 和共享合同回归；不据此主张 macOS x64 或物理睡眠覆盖。
- 原 umbrella DoD 12/13 的本 change 验收范围收缩为已取得的真实 Windows 与 macOS arm64 package/native 证据；生产签名、公证与发布仍不在范围。
