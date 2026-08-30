---
schema_version: 3
artifact: spec
change: 2026-08-30-entity-dossier-plugin
status: ready
ready_for_tickets: true
planning_depth: deep
sources:
  - "USER-DECISION:2026-08-30-confirm-all-design-consensus"
  - "<Path>{roots.state}/specdev/changes/2026-08-30-entity-dossier-plugin/design-tree.json</Path>"
  - "<Path>{roots.state}/specdev/changes/2026-08-30-entity-dossier-plugin/ADR.md</Path>"
  - "<Path>{roots.state}/specdev/changes/2026-08-30-entity-dossier-plugin/CONTEXT.md</Path>"
---

# Spec: Hana Dossiers 规范化档案插件

- **Spec：** `<Path>{roots.state}/specdev/changes/2026-08-30-entity-dossier-plugin/spec.md</Path>`
- **当前 ADR：** `<Path>{roots.state}/specdev/changes/2026-08-30-entity-dossier-plugin/ADR.md</Path>`
- **当前领域上下文：** `<Path>{roots.state}/specdev/changes/2026-08-30-entity-dossier-plugin/CONTEXT.md</Path>`

## 1. 问题与目标

### 问题陈述

用户需要围绕个人、组织、项目或自定义对象建立规范化档案，把结构化属性、可复用联系人和相关资料归集在同一档案中。当前工作区文件本身不能表达档案类型、联系人、分类、活动和迁移语义；外部路径引用又会在移动工作区或更换设备后失效。

该能力必须作为独立 HanaKDE 插件交付。产品实现不得修改系统模块、公共 SDK、根依赖或其他插件，也不得建立第二套宿主文件管理器。档案库必须随当前工作区迁移，并允许 Agent 只从相对清单入口按任务需要读取资料，而不是预先把完整资料发送给模型。

### 目标用户与场景

- 本机单用户在当前 HanaKDE 工作区中创建并长期维护多个档案。
- 用户从工作区外、工作区其他目录或整个文件夹导入资料，形成目标档案内的受管副本。
- 用户按模板和 typed fields 维护个人、组织、项目及自定义档案属性。
- 用户维护一个联系人并将其以不同角色关联到多个档案。
- 用户通过 Page 搜索、筛选、查看、分类、删除、恢复、导入和导出档案。
- Agent 通过插件工具查询或修改档案，并从相对 `dossier.json`/资料引用按需读取必要内容。
- 用户复制整个 `Dossiers/`，在另一设备或干净插件缓存中恢复完整档案库。

### 成功标准

1. HanaKDE 能把 `<Path>plugins/dossiers/</Path>` 发现为 id `dossiers` 的内置 full 插件，并打开完整档案 Page。
2. 所有结构化权威数据和受管资料均位于当前工作区固定 `Dossiers/` 根；插件私有目录丢失不影响恢复。
3. 用户能够完成档案、类型、字段、联系人、资料、分类、标签、回收站和导入导出闭环。
4. 目标档案外文件加入时形成目标档案内受管副本；冲突、重复、失败和恢复均有可判定结果。
5. 约 1 万档案、5 万联系人关系、10 万资料元数据的列表和筛选保持分页，不在启动时加载全部对象。
6. Agent 只获得工作区相对档案清单或资料引用；资料读取由 Agent 当前任务按需触发并记录实际来源。
7. 产品代码、资源、构建配置和插件专属测试的最终 diff 仅位于 `<Path>plugins/dossiers/**</Path>`。

### 非目标

- **OOS-001**：不建模或展示档案之间的公司、项目、隶属或图谱关系。
- **OOS-002**：不提供多用户账号、共享权限、实时协作或并发副本自动合并。
- **OOS-003**：不建立资料正文索引、全文搜索、OCR 或后台全库扫描。
- **OOS-004**：不修改 `<Path>core/**</Path>`、`<Path>server/**</Path>`、`<Path>desktop/**</Path>`、`<Path>shared/**</Path>`、`<Path>packages/**</Path>`、根级构建配置或根依赖锁定文件。
- **OOS-005**：不调用内部 Knowledge Workspace HTTP 路由，不复刻其文件树、编辑器、剪贴板或全文索引状态机。
- **OOS-006**：不在导入完成、Page 首次加载或后台定时任务中自动调用模型。
- **OOS-007**：不把 Markdown、SQLite 或插件私有缓存建立为 `dossier.json` 之外的第二档案清单权威。
- **OOS-008**：不在本 change 发布、推送、部署、写入市场或修改远程仓库。

## 2. 解决方案与外部行为

### 解决方案摘要

新增内置 full 插件 `dossiers`。插件提供 route-backed WebView/iframe Page、插件内 API routes 和 Agent tools，使用公开 Hana SDK。iframe 通过 `hana.api.fetch` 调用同插件 routes，通过 `hana.resources.pick/open` 请求宿主资源交互；服务端插件代码只通过 `ctx.resources` 读取、复制、移动、回收或写入工作区资源。

每个活动工作区固定使用 `Dossiers/`。目录包含版本化根 manifest、类型清单、联系人清单、每份档案的 `dossier.json`、按主分类组织的受管资料、持久操作日志、回收站、审计记录和可重建 `catalog.sqlite`。每份档案目录以稳定 dossier id 命名，展示名称变化不得改变目录身份。

### 主要流程

#### 2.1 初始化与打开

1. 用户打开 Hana Dossiers Page。
2. 插件解析当前工作区 ResourceRef，并检查 `Dossiers/`。
3. 不存在时创建兼容根；空目录可初始化；兼容 manifest 可恢复。
4. 非兼容同名目录、迁移预检失败或不可写时进入阻塞状态，不执行权威写入。
5. 派生索引缺失、陈旧或损坏时从版本化清单重建；权威清单仍可读取。

#### 2.2 创建和维护档案

1. 用户选择个人、组织、项目或自定义模板，也可从文件/文件夹导入入口开始。
2. 插件创建稳定 dossier id 和版本化 `dossier.json`，写入名称、类型、typed field 值、标签、联系人关系、资料引用、版本和时间信息。
3. 用户可修改字段、标签和联系人关系；不兼容模板字段改型必须先预览并受控迁移。
4. 公司、企业和机构默认是组织模板实例；自定义类型通过复制模板创建。

#### 2.3 添加、分类和移动资料

1. 添加资料前展示来源、目标档案、主分类、命名结果、哈希重复、冲突和预计复制容量。
2. 来源不在目标档案受管目录时，通过 ResourceIO 复制到 `Dossiers/dossiers/<stable-id>/documents/<category>/` 的逻辑位置。
3. 来源已经位于目标档案受管目录时只登记相对引用，不重复复制。
4. 相同字节由内容哈希识别；同名不同内容获得稳定后缀，绝不静默覆盖。
5. 只有全部所需文件复制成功且清单原子发布后，导入才可观察为完成。失败或取消不得留下已发布的半成品引用。
6. 修改主分类时，通过 ResourceIO move 移动物理文件并原子更新清单；逻辑标签不改变物理路径。

#### 2.4 联系人

1. 联系人拥有独立稳定 id 和版本化根级 JSON 清单。
2. 档案通过带角色的关系记录关联联系人；关系属性不得写入联系人本体。
3. 更新联系人后，所有关联档案投影显示最新联系人信息。
4. 解除关系不删除联系人；删除联系人前展示引用并禁止静默破坏现有关系。

#### 2.5 搜索与 Page

1. Page 左侧提供分页档案列表和基于名称、类型、档案字段、联系人、资料标题、主分类及标签的元数据筛选。
2. Page 右侧提供概览、属性、联系人、资料和活动视图；不显示档案关系视图。
3. 列表查询使用可重建派生索引；索引不可用时显示重建状态，不把陈旧结果冒充当前事实。
4. 资料正文、模型摘要和未读内容不进入全文搜索。

#### 2.6 Agent

插件提供稳定 Agent 行为面：列出/查询档案、读取单档案清单、创建/更新档案、添加联系人关系、添加资料、返回 AI 资料入口、保存经确认的智能建议、准备/确认删除、恢复和导出。

- 纯读操作标记为只读。
- 档案普通写入使用精确的工作区写入 side-effect 描述和版本前置条件。
- 批量修改、删除、覆盖文件和接受智能建议需要明确确认。
- 全局模型访问默认开启，用户可关闭。关闭后，返回正文读取入口的 AI 操作 fail closed；元数据查询仍可用。
- 插件只返回工作区相对 `dossier.json`、档案目录或资料 ResourceRef。Agent 根据任务使用现有受控资源/Office 工具读取必要文件或片段。
- 未被 Agent 实际读取的资料不得进入模型上下文；模型产物记录实际来源引用、时间和模型身份。

#### 2.7 删除、恢复和清理

1. 删除档案先进入插件回收站，默认保留 30 天。
2. 恢复时若目标身份或路径冲突，停止并展示冲突，不覆盖现有档案。
3. 最终清理前检查联系人和资料引用；删除档案不直接删除独立联系人。
4. 只有无其他引用的受管文件可在确认后物理清理。
5. 普通活动保留 1 年；迁移、删除、恢复和安全审计永久保留。

#### 2.8 导出、导入与迁移

1. 单档案导出 zip 包含 `dossier.json`、联系人快照、受管资料和校验清单。
2. zip 导入先验证 schema、校验和、路径规范和解包边界，再展示冲突预览；联系人快照不得静默覆盖全局联系人。
3. 全库迁移以复制完整 `Dossiers/` 为唯一合同；插件私有缓存不参与。
4. 旧 schema 迁移先备份和预检，再以持久操作日志执行；中断或失败后保留原数据并可重试。

### 边界、失败与稳定错误行为

- **非兼容根：** 显示当前 `Dossiers/` 不能安全接管及原因；保持只读阻塞，不创建、移动或删除其中内容。
- **无当前工作区或授权不足：** Page 显示不可用状态；API/工具不回退到进程 cwd、绝对路径或插件私有目录。
- **版本冲突：** 使用期望版本拒绝陈旧写入，返回当前版本供刷新；不得 last-write-wins。
- **复制/移动失败：** 不发布新引用；暂存内容可重试或安全清理，旧清单和旧路径继续有效。
- **索引失败：** 权威 JSON 保持可读；查询显示重建/失败状态，支持重新构建。
- **迁移失败：** 保留备份、旧 schema 和操作日志；禁止把半迁移数据标为 ready。
- **zip 不可信：** 路径穿越、绝对路径、符号链接逃逸、校验失败或不支持 schema 均在写入前拒绝。
- **模型访问关闭：** 需要资料内容的 Agent 流程明确拒绝；不得绕过开关或静默发送。
- **资料格式不支持：** 返回可定位的 ResourceRef 和不支持状态；不得声称已读取或已基于正文摘要。
- **容量不足：** 导入或迁移在发布前停止，报告预计需求和失败项；不得留下可见半档案。

### 状态转换与不变量

- 档案：`active -> trash -> active | permanently_deleted`；`permanently_deleted` 不可恢复。
- 导入：`preview -> committing -> completed | failed | cancelled`；只有 `completed` 发布权威清单引用。
- 迁移：`preflight -> backed_up -> migrating -> ready | blocked`；`blocked` 保留可恢复材料。
- 索引：`missing | stale | ready | rebuilding | failed`；任何索引状态都不改变 JSON 权威。
- 智能建议：`proposed -> accepted | rejected`；只有 `accepted` 可改变档案事实。
- 稳定 id 不因重命名、分类、移动、导出或恢复而变化。
- 所有持久引用是工作区相对 ResourceRef 或档案库内部 id，不持久化 materialized 绝对路径。
- `dossier.json`、联系人清单、类型清单和根 manifest 是权威；`catalog.sqlite`、缩略图和 UI 缓存均可删除重建。
- 插件不能修改目标档案目录之外的用户文件，除非当前动作是经预览确认的导入来源读取。

## 3. 用户故事

- **US-001**：作为本机用户，我希望在当前工作区安全初始化或恢复固定档案库，以便档案随工作区迁移且不覆盖已有文件。
- **US-002**：作为档案维护者，我希望使用内置或自定义模板创建档案并维护 typed fields，以便不同对象都能规范归集。
- **US-003**：作为档案维护者，我希望维护独立联系人并以角色关联多个档案，以便联系方式只有一个一致来源。
- **US-004**：作为档案维护者，我希望把文件或文件夹复制归入目标档案并分类、标记，以便每份档案目录自包含且可迁移。
- **US-005**：作为日常用户，我希望通过分页列表、元数据搜索和详情视图快速查找并查看档案。
- **US-006**：作为 Agent 使用者，我希望 Agent 能执行有界档案操作并按相对引用读取必要资料，以便完成摘要和整理而不预先发送完整档案库。
- **US-007**：作为数据所有者，我希望高风险 Agent 写入和模型资料访问受明确开关、确认与审计约束。
- **US-008**：作为数据所有者，我希望删除的档案可在 30 天内恢复，最终清理不会误删共享联系人或仍被引用的资料。
- **US-009**：作为迁移用户，我希望导出单档案 zip 或复制完整 `Dossiers/`，并能安全导入或升级旧 schema。
- **US-010**：作为维护者，我希望派生索引损坏后可以从清单重建，并能观察导入、迁移、删除和安全事件。
- **US-011**：作为 HanaKDE 维护者，我希望 Dossiers 完全封装在插件盒子内，以便新增功能不改变系统其他模块。

## 4. 验收合同

| ID | 覆盖故事 | 前置条件 | 动作或事件 | 可观察结果 | 验证接缝 |
|---|---|---|---|---|---|
| AC-001 | US-011 | 仓库包含 Dossiers 插件实现 | 检查最终产品 diff | 产品代码、资源、构建和插件专属测试只位于 `<Path>plugins/dossiers/**</Path>`；禁止路径无修改 | Git 路径 allowlist |
| AC-002 | US-011 | HanaKDE 启动并扫描内置插件 | 加载 id `dossiers` | 插件加载成功，Page 路由和声明工具可发现，其他插件加载不受影响 | PluginManager/route/UI contribution 回归 |
| AC-003 | US-001 | 当前工作区没有 `Dossiers/` | 首次打开 Page | 创建版本化兼容根并进入 ready；不写插件私有权威数据 | 插件应用/ResourceIO 集成测试 |
| AC-004 | US-001 | `Dossiers/` 是非空且无兼容 manifest 的普通目录 | 打开 Page 或调用写工具 | 显示阻塞原因并保持零写入，不猜测或清空目录 | 初始化失败合同测试 |
| AC-005 | US-001, US-009 | 复制完整兼容 `Dossiers/` 到干净工作区且清空插件缓存 | 打开 Page | 档案、模板、字段、联系人、资料、标签和审计恢复；索引可重建 | 迁移恢复集成测试 |
| AC-006 | US-002 | ready 档案库 | 创建个人、组织、项目及自定义类型档案 | 所有类型走同一稳定身份、生命周期和 CRUD 合同；组织实例可表示公司、企业或机构 | 领域/application 测试 |
| AC-007 | US-002 | 已有档案使用模板字段 | 修改模板或尝试不兼容改型 | 已有值不被静默删除；不兼容变更先给预览并要求迁移确认 | schema/模板迁移测试 |
| AC-008 | US-003 | 一个联系人已关联档案 A | 以不同角色关联档案 B 并更新联系方式 | A/B 均显示最新联系人；两个关系角色互不覆盖 | 联系人关系测试 |
| AC-009 | US-003, US-008 | 联系人仍被档案引用 | 解除单一关系或请求删除联系人 | 解除关系不删除联系人；删除展示引用并拒绝静默破坏 | 删除引用测试 |
| AC-010 | US-004 | 来源文件位于目标档案目录外 | 预览并提交添加资料 | 文件复制到目标档案分类目录，`dossier.json` 只发布相对引用，来源文件不被修改 | ResourceIO 复制集成测试 |
| AC-011 | US-004 | 来源已在目标档案受管目录 | 添加资料 | 不产生第二物理副本，只登记规范相对引用 | 同目录引用测试 |
| AC-012 | US-004 | 存在相同字节或同名不同内容 | 添加资料 | 相同字节识别为重复；同名异内容使用稳定后缀；任何情况均不静默覆盖 | 哈希/命名属性测试 |
| AC-013 | US-004 | 复制多文件或移动主分类 | 中途取消、容量不足或 ResourceIO 失败 | 权威清单不发布半成品引用；旧路径和旧清单保持有效；暂存可重试或清理 | 故障注入测试 |
| AC-014 | US-004 | 资料已存在且有标签 | 改变主分类或标签 | 主分类移动物理文件并原子更新引用；标签变化不移动文件 | 分类事务测试 |
| AC-015 | US-005 | 档案库包含规模 fixture | 搜索名称、类型、字段、联系人、资料标题、分类或标签 | 返回分页且可复现的元数据结果；启动与查询不加载所有对象 | 查询/规模测试 |
| AC-016 | US-005 | 资料正文包含仅正文可见词语 | 搜索该词语 | 不因正文、模型摘要或未读内容命中，明确保持元数据检索边界 | 负向检索测试 |
| AC-017 | US-005 | 桌面或窄屏宿主打开 Page | 浏览列表和档案详情 | 概览、属性、联系人、资料、活动可访问且不出现档案关系视图或 Widget | 真实宿主 Playwright |
| AC-018 | US-006 | Agent 查询一个档案 | 调用只读上下文行为 | 首次结果只包含结构化元数据、相对 `dossier.json`/目录/ResourceRef，不包含完整资料正文或 materialized 绝对路径 | Agent tool 合同测试 |
| AC-019 | US-006 | Agent 明确需要某份资料 | Agent 使用现有受控资源或 Office 工具读取 | 只有实际读取的资源或片段进入任务上下文；产物记录实际来源；未读文件不进入请求 | Agent 场景/调用观测测试 |
| AC-020 | US-006, US-007 | Agent 提出分类、属性或联系人建议 | 未确认与确认写入分别执行 | 未确认不改变权威清单；确认后以当前版本写入并记录 actor/来源 | Agent 建议确认测试 |
| AC-021 | US-007 | 全局模型访问开关关闭 | 请求需要资料内容的 AI 行为 | fail closed 且不返回正文读取入口；元数据查询仍可用 | 权限开关测试 |
| AC-022 | US-007 | Page 首次加载、资料导入完成或应用空闲 | 观察模型调用 | 不发生插件发起的模型请求或后台全库扫描 | 负向模型调用观测 |
| AC-023 | US-007 | Agent 请求批量修改、删除或覆盖文件 | 未确认执行 | 操作被拒绝且权威数据不变；确认后才执行并审计 | side-effect/确认合同测试 |
| AC-024 | US-008 | active 档案 | 删除、恢复、超过保留期并最终清理 | 删除进入 30 天回收站；可恢复；最终清理前检查引用并要求确认 | 可控时钟生命周期测试 |
| AC-025 | US-008 | 恢复目标存在身份或路径冲突 | 请求恢复 | 停止并展示冲突，不覆盖当前档案或文件 | 恢复冲突测试 |
| AC-026 | US-009 | active 档案包含联系人和资料 | 导出单档案 zip | 包含版本化清单、联系人快照、资料及校验清单，路径均在包根内 | 导出包合同测试 |
| AC-027 | US-009 | zip 含路径穿越、绝对路径、符号链接逃逸、坏哈希或不支持 schema | 预览导入 | 在任何权威写入前拒绝，并给出可定位原因 | 不可信 zip 安全测试 |
| AC-028 | US-009 | 兼容旧 schema | 执行迁移并注入中断 | 迁移前有可验证备份；中断后旧数据保留且可恢复重试；未完成状态不标 ready | 迁移演练测试 |
| AC-029 | US-010 | `catalog.sqlite` 缺失、陈旧或损坏 | 重建索引 | 从 JSON 权威恢复相同分页/筛选投影；重建可观察，失败不损坏清单 | 索引重建测试 |
| AC-030 | US-010 | 普通活动和永久审计跨越保留边界 | 运行清理 | 超过 1 年的普通活动被幂等清理；迁移、删除、恢复和安全审计保留 | 可控时钟审计测试 |
| AC-031 | US-007, US-010 | 执行资料、联系人或模型相关动作 | 检查日志与审计 | 不出现资料正文、联系人敏感值、凭据、完整模型输入或 materialized 绝对路径 | 日志脱敏扫描 |
| AC-032 | US-011 | 精确发布目录已构建 | 从复制后的插件目录执行 standalone smoke | 无 unresolved repo-only SDK import，manifest、routes、tools 和 assets 可加载 | 插件 package smoke |

## 5. 范围

### IN

- `<Path>plugins/dossiers/**</Path>` 内的 manifest、Page shell、React UI、静态 assets、插件 API routes、Agent tools、领域/application/infrastructure、构建脚本、插件包元数据、README、验证说明和测试。
- 固定工作区 `Dossiers/` 的根 manifest、版本化 JSON schema、类型/联系人/档案清单、受管资料、操作日志、回收站、审计和派生索引合同。
- 个人、组织、项目内置模板及自定义模板/typed fields。
- 联系人独立身份和档案联系人角色关系。
- 文件/文件夹导入预览、复制、哈希重复、同名冲突、分类移动、标签和取消/失败恢复。
- Page 的列表/详情/搜索/筛选/活动/回收站/导入导出体验。
- 有界 Agent 工具、全局模型访问开关、相对 AI 资料入口和确认门。
- 单档案 zip、全库目录迁移、安全初始化和旧 schema 可恢复迁移。
- 插件内测试、standalone package smoke 和真实宿主 E2E 场景。

### REUSE

- 复用 Hana 插件 manifest、PluginManager、route-backed Page、iframe surface session、EventBus 和插件错误隔离。
- 复用 `@hana/plugin-runtime` 的工具/session permission/ResourceIO 契约；不直接使用内部 server service。
- 复用 `@hana/plugin-sdk` 的 `hana.api.fetch`、ready、资源选择/打开和 host messaging。
- 复用 `@hana/plugin-components` 与 host theme；不导入 `<Path>desktop/src/react/**</Path>`。
- 复用 `ctx.resources` 的 read/list/writeExpectedVersion/mkdir/copy/move/trash/materialize 适用能力以及 ResourceRef 身份。
- 复用已有 Agent 的受控资源/Office 工具读取相对资料；Dossiers 插件不实现正文解析或全文索引。
- 复用 `<Path>plugins/todolist/</Path>` 的分层、dataDir 级 runtime、薄 route、乐观并发、原子存储、错误映射、UI build、package smoke 和真实宿主测试模式，但不复用其业务模型。
- 复用 `<Path>plugins/office/</Path>` 已有 Office 文档读取能力作为 Agent 可选工具，不建立硬运行依赖。

### OUT

- 所有 OOS 条目。
- 任何需要修改系统公共能力才能实现的全文搜索、原生 Renderer UI、富原生卡片或 Knowledge Workspace 内部集成。
- 外部网络、第三方云存储、账号同步、市场发布和后台定时自动化。
- 项目根依赖、根 lockfile、根脚本或现有插件代码的修改。

## 6. 已锁定实现约束

- **DEC-001**：所有产品实现与插件专属测试只写 `<Path>plugins/dossiers/**</Path>`；系统和公共 SDK 路径只读。来源：ADR-011、ADR-012。
- **DEC-002**：插件是 id `dossiers` 的内置 full-access Page + Agent tools 插件；UI 为 route-backed WebView/iframe。来源：ADR-011、ADR-012。
- **DEC-003**：当前工作区固定 `Dossiers/` 是完整迁移权威，插件私有目录只允许可重建缓存。来源：ADR-004、ADR-007。
- **DEC-004**：档案使用统一实体与模板化类型；首版内置个人、组织、项目，支持稳定 typed fields。来源：ADR-001、LOG-009、LOG-023。
- **DEC-005**：联系人为独立实体，档案只保存带角色的联系人关系；首版无档案间关系。来源：ADR-003、ADR-006。
- **DEC-006**：目标档案目录拥有受管资料副本，目录外来源必须复制；同哈希识别重复，同名异内容不覆盖。来源：ADR-002、ADR-009。
- **DEC-007**：`dossier.json`、类型和联系人 JSON 是权威；`catalog.sqlite` 是可重建派生索引。不得为了具体 SQLite 驱动修改根依赖或 lockfile。来源：ADR-010、ADR-013。
- **DEC-008**：固定根采用兼容门、备份、预检和持久操作日志迁移；不兼容目录 fail closed。来源：ADR-014。
- **DEC-009**：资料搜索只覆盖元数据，不索引正文。Agent 只接收相对引用并按需读取。来源：ADR-008、LOG-010、LOG-019。
- **DEC-010**：全局模型访问默认开启且可关闭；它不授权后台自动扫描。批量、删除、覆盖和智能建议写入需要确认。来源：ADR-005、LOG-011、LOG-023、LOG-025。
- **DEC-011**：普通活动保留 1 年，迁移/删除/恢复/安全审计永久保留且最小化敏感内容。来源：ADR-015。
- **DEC-012**：新插件静态资源放在 `assets/`，iframe 同插件 API 使用 `hana.api.fetch`，工作区资源只通过 `ctx.resources`。来源：hana-plugin-creator skill、ADR-011。
- **DEC-013**：精确发布目录必须通过 standalone smoke；不得依赖仓库 workspace symlink 或宿主隐式提供裸 SDK package。来源：hana-plugin-creator skill、`<Path>PLUGIN_SDK.md</Path>`。

## 7. 数据、接口与兼容

- **公共接口变化：** 新增 plugin id `dossiers`、一个 Page contribution 和一组前缀为 `dossiers_` 的 Agent 工具。工具至少覆盖 list/query、get/context、create、update、add-contact、add-document、accept-suggestion、delete prepare/confirm、restore、export；精确参数 schema 在 Ticket 中依据本 Spec 行为锁定，不能改变确认和相对引用合同。
- **Page/API 接口：** iframe 只通过 `hana.api.fetch` 调用同插件 routes。routes 返回 JSON-safe DTO、当前 revision/record version、允许动作和结构化失败描述；不得返回宿主绝对路径、凭据或 request-scoped capability 对象。
- **Manifest 能力：** 仅声明实际使用的 ResourceIO 与 iframe host capabilities。预期至少包含服务端 `resource.read`、`resource.write`，UI `resource.pick`、`resource.open`；不声明 network、Knowledge 内部或后台模型调用能力。
- **数据模型与持久化：** `Dossiers/` 根具有 schema/version/identity manifest；`types/`、`contacts/` 和 `dossiers/<stable-id>/dossier.json` 是版本化 JSON 权威；资料位于档案目录的 `documents/<category>/`；操作日志、回收站和审计位于根内；`catalog.sqlite` 是派生数据。
- **身份与并发：** dossier/type/field/contact/document/relation/operation 使用稳定不透明 id；所有修改携带期望版本，陈旧写入拒绝。目录名、展示名和路径是 locator，不代替身份。
- **兼容要求：** 未识别但 schema 允许保留的扩展字段在读写往返中不得丢失；不支持的新主 schema 只读阻塞，不能降级写入。
- **迁移要求：** 任何权威 schema 迁移均为 Deep Gate：备份、空间预检、dry-run/报告、持久日志、故障恢复、数据核对和幂等重试全部通过后才发布 ready。
- **发布或运维影响：** 新增一个内置插件目录；不改变系统启动、公共 API、根依赖或远程服务。发布前验证精确打包产物能发现并加载该插件。

## 8. 非功能要求

- **NFR-001 安全与隐私：** 拒绝路径穿越、绝对路径持久化、符号链接逃逸、zip slip 和跨档案目录越界；默认模型访问可关闭且 fail closed；日志和审计不得记录资料正文、联系人敏感值、凭据或完整模型输入。
- **NFR-002 数据完整性：** 清单、资料移动和索引更新通过可恢复操作边界协调；任何失败不得发布悬空引用、覆盖原件或制造双重权威；陈旧版本写入被拒绝。
- **NFR-003 性能与容量：** 支持约 1 万档案、5 万联系人关系、10 万资料元数据和数十 GB 资料；列表/搜索分页，不在启动时加载全部对象；规模验证记录资源占用与查询计划，不把正文加入索引。
- **NFR-004 可用性与可靠性：** 索引可删除重建；迁移中断可恢复；导入/移动/导出可取消且状态可见；Page 在桌面和窄屏无重叠、无内容裁切并遵循 Hana theme。
- **NFR-005 可观测性：** 导入、迁移、索引重建、删除、恢复、清理和 Agent 写入具有进度或结构化结果；错误指出受影响档案/资料而不泄露敏感内容。
- **NFR-006 可移植性：** 仅复制 `Dossiers/` 到受支持工作区即可恢复权威数据；所有持久引用保持工作区相对；插件缓存、materialized path 和当前设备路径不参与恢复。
- **NFR-007 插件隔离：** 插件加载、Page/API 或工具失败不阻塞 HanaKDE 和其他插件；产品 diff 和运行时写入均遵守插件盒子边界。
- **NFR-008 可访问性与本地化：** 用户可见核心操作具有可访问名称和键盘路径；至少覆盖仓库既有插件的中英文 locale fallback，不把展示文案作为持久身份。

## 9. 验证策略

| 接缝 | 层级 | 覆盖合同 | 现有先例或命令 | Evidence 类型 |
|---|---|---|---|---|
| Dossiers domain/application/store | 单元与故障注入 | AC-006–AC-016、AC-024–AC-031 | 在 `<Path>plugins/dossiers/</Path>` 运行 `npm test`；先例 `<Path>plugins/todolist/tests/*.test.ts</Path>` | Ticket focused test logs |
| 插件 TypeScript/UI/package | 静态与构建 | AC-001、AC-002、AC-017、AC-032 | 在 `<Path>plugins/dossiers/</Path>` 运行 `npm run verify`；先例 `<Path>plugins/todolist/package.json</Path>`、`<Path>plugins/todolist/scripts/verify-package.mjs</Path>` | build/package receipts |
| Plugin API 与 request context | 合同/集成 | AC-003–AC-005、AC-010–AC-014、AC-021、AC-023 | 插件内 HTTP/ResourceIO fixtures；先例 `<Path>plugins/todolist/tests/http-crud.test.ts</Path>`、`<Path>plugins/todolist/tests/contract.test.ts</Path>` | API contract logs |
| PluginManager/route/Page contribution | 仓库回归 | AC-002、AC-032 | 定向运行 `<Path>tests/plugin-manager.test.ts</Path>`、`<Path>tests/plugin-routes.test.ts</Path>`、`<Path>tests/plugin-ui-contributions.test.ts</Path>` | repository regression logs |
| Agent tool/relative reference scenario | 集成与观测 | AC-018–AC-023、AC-031 | 插件内 fake context + dev loop tool scenario；精确发布目录 diagnostics/invoke tool | tool payload and request-observation evidence |
| 真实宿主 Page | E2E | AC-003、AC-004、AC-017、AC-021、AC-022、AC-024–AC-027 | 在 `<Path>plugins/dossiers/</Path>` 运行 `npm run test:e2e`；先例 `<Path>plugins/todolist/tests/e2e/real-host.spec.ts</Path>` | Playwright report and screenshots |
| 迁移/规模/索引重建 | Deep 演练 | AC-005、AC-015、AC-028–AC-030 | 插件内生成式 fixture、可控时钟、迁移中断和索引破坏演练 | migration/scale rehearsal report |
| 仓库静态与组合状态 | 回归 | AC-001、AC-002、NFR-007 | `npm run typecheck`、`npm run lint`、`npm test`、`npm run build:client` | full-suite command logs |
| 路径所有权 | 静态审计 | AC-001、DEC-001、DEC-012 | Git diff allowlist + 禁止 import/API/URL pattern scan | path/boundary audit |

## 10. 风险、假设与未决问题

### 风险

- **RISK-001 数据冗余：** 同一资料加入多个档案会产生物理副本。通过导入容量预览、同档案哈希重复识别和明确磁盘状态缓解；不引入跨档案全局内容池。
- **RISK-002 清单与索引分歧：** 通过 JSON 单一权威、持久操作日志、索引 generation/staleness 和可重建验证缓解。
- **RISK-003 固定目录冲突：** 通过兼容 root manifest 和 fail-closed 接管门缓解，不自动推断普通目录。
- **RISK-004 模型数据暴露：** 用户选择全局默认允许模型访问。通过可见全局开关、显式任务触发、相对引用、按需读取、来源审计和日志脱敏降低风险。
- **RISK-005 大文件与不支持格式：** Agent 读取依赖既有资源/Office 工具；不支持时显式报告，不伪装正文摘要。
- **RISK-006 SQLite 驱动与打包：** 派生索引不得迫使修改根依赖。Ticket 必须在插件盒子内选择可打包实现并通过精确发布目录 smoke；索引不可用不能影响 JSON 权威。
- **RISK-007 单一巨型 change：** 功能跨数据、文件、UI、Agent、迁移与 E2E，Tickets 必须按垂直切片拆分，并为共享 manifest/schema/build 路径设置唯一 owner。

### 已采用的低影响假设

- **ASSUMPTION-001**：稳定 id 使用实现者选择的跨平台不透明标识格式；格式不暴露为用户语义。验证：重命名、导出、恢复后身份不变。
- **ASSUMPTION-002**：默认资料分类的具体中文文案和 icon 属于可逆 UI 默认值；分类 id 稳定且用户可自定义。验证：locale 和分类重命名测试。
- **ASSUMPTION-003**：Page 的窄屏断点、列表密度和分页默认大小沿用 Hana 插件组件惯例，只要满足无重叠、分页和可访问验收。验证：桌面/窄屏 E2E。
- **ASSUMPTION-004**：派生索引的具体 SQLite driver 是插件内部可替换实现，不改变 `catalog.sqlite` 可删除重建的外部合同。验证：standalone package smoke 与索引重建。
- **ASSUMPTION-005**：单档案 zip 的扩展名和 MIME 使用标准 zip；用户可见建议文件名不参与档案身份。验证：导出/导入往返。

### 未决问题

无。
