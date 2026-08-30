# 当前 Change 架构决策

## ADR-001: 统一档案实体与模板化类型

**Status:** accepted
**Source:** LOG-004 / user decision
**Supersedes:** none

### Context
个人、公司、项目、企业以及特定机构档案既共享属性、联系人和资料能力，又需要不同的字段集合。为每种类型建立独立模型会复制行为并使自定义类型无法进入同一查询与迁移合同。

### Decision
所有档案使用统一稳定身份和共同生命周期。档案类型由模板定义：系统提供常用内置模板，用户可以创建自定义类型和 typed fields；模板差异不得演变成互不兼容的独立存储模型。

### Trade-off
统一模型需要字段定义、值校验和模板演进机制，查询也不能依赖固定列覆盖全部业务属性；作为交换，新类型无需修改核心 schema，跨类型搜索、关系、导入导出和 Agent 工具可以复用同一合同。

### Consequences
档案类型、字段定义和字段值必须有稳定 ID。模板变化不得静默删除已有值；具体字段类型和演进规则由 D-007 锁定。

### Verification / Migration
验证内置和自定义类型可以走同一 CRUD、搜索、导出与恢复链路；模板修改后的旧档案仍可读取并显示兼容状态。

## ADR-002: 档案资料受管副本属于当前工作区

**Status:** accepted
**Source:** LOG-005 / user decision
**Supersedes:** none

### Context
只保存外部文件引用会在源文件移动、设备变化或工作区迁移后失效；把资料放入插件私有 `dataDir` 又会使复制工作区无法带走档案原件。用户明确以适度文件冗余换取整体可迁移性。

### Decision
档案资料的受管副本写入当前打开工作区内的固定档案库根，并按档案和资料分类组织。外部文件加入档案时必须通过 ResourceIO 复制到该根内；持久身份使用工作区相对 ResourceRef 或档案库内部标识，不保存物化绝对路径。已经位于受管范围的资料可以建立相对引用，精确边界由 D-015、D-016 锁定。

### Trade-off
受管副本会占用额外磁盘并引入同名冲突、去重、引用计数和清理问题；作为交换，档案资料不依赖外部路径，工作区级备份和迁移更完整。

### Consequences
插件需要 `resource.read` 与 `resource.write` 能力，并必须对复制失败、版本冲突、部分写入和源文件变化给出显式状态。插件私有目录只能保存可重建缓存或非迁移权威状态。

### Verification / Migration
验证工作区外导入、工作区内引用、跨设备相对地址恢复、同名冲突、复制中断回滚以及复制整个工作区后的档案可用性。

## ADR-003: 联系人使用独立实体与带角色关系

**Status:** accepted
**Source:** LOG-008 / user decision
**Supersedes:** none

### Context
同一联系人可能同时出现在公司、项目和企业档案中，并在不同关系里承担不同角色。档案内嵌副本会造成联系方式分叉，也会把关系属性错误写入联系人本体。

### Decision
联系人拥有独立稳定身份。档案与联系人通过独立关系记录关联，关系保存角色及适用的关系属性；同一联系人可关联多个档案，解除一条关系不删除联系人。

### Trade-off
独立联系人需要去重、合并和孤立联系人清理规则；作为交换，联系方式只有一个可维护来源，多档案关系可以一致查询。

### Consequences
联系人 CRUD、档案关系 CRUD 和删除恢复必须分离。后续导入需要提供重复候选而非静默合并。

### Verification / Migration
验证一个联系人关联多个档案、角色互不覆盖、更新联系人后各档案投影一致、解除关系不误删实体。

## ADR-004: 每个工作区使用固定 Dossiers 根

**Status:** accepted
**Source:** LOG-013 / user decision
**Supersedes:** ADR-002 中尚未确定的固定根部分

### Context
可配置或分散路径会增加发现、授权、迁移和恢复歧义。用户选择让每个当前工作区使用相同的固定约定。

### Decision
当前工作区的唯一档案库根固定为 `<workspace>/Dossiers/`。每份档案及受管资料只能归属于该根；切换活动工作区即切换档案库，不提供逐档案根路径配置。

### Trade-off
固定英文目录名降低个性化并可能与已有同名目录冲突，需要首次初始化探测和安全接管规则；作为交换，档案库可以无配置发现，迁移与恢复路径确定。

### Consequences
插件首次打开必须检测 `Dossiers/` 是否为空、是否已有兼容 manifest、是否存在非档案内容，并在不能安全接管时停止写入。结构化权威数据是否也位于该根由 D-018 决定。

### Verification / Migration
验证新工作区初始化、已有兼容根恢复、非兼容同名目录拒绝接管、工作区切换和跨设备相对恢复。

## ADR-005: 模型默认拥有全局档案访问授权

**Status:** accepted
**Source:** LOG-012 / user decision
**Supersedes:** none

### Context
逐档案授权能降低敏感资料外发风险，但会增加自动摘要和 Agent 工作流的操作摩擦。用户明确选择全局默认允许当前模型处理档案资料。

### Decision
插件默认允许将档案资料发送给当前配置模型，不要求逐档案或逐次确认。用户可以通过全局设置关闭模型访问；关闭后所有需要正文外发的摘要和 Agent 操作必须失败关闭，不得降级为静默外发。

### Trade-off
默认授权提供连贯的智能体验，但扩大个人和商业资料的外发范围，并把模型供应商配置变成重要安全边界。

### Consequences
UI 必须持续显示模型访问状态和当前模型身份；正文、联系人敏感值和凭据不得进入日志；每个模型产物记录来源资料、时间和模型。批量删除、覆盖文件等非模型高风险动作仍按 D-011 确认。

### Verification / Migration
验证默认启用、全局关闭、关闭后的 fail-closed、模型切换可见性、无正文日志以及摘要来源追踪。

## ADR-006: 首版不建设档案间关系模型

**Status:** accepted
**Source:** LOG-014 / user decision
**Supersedes:** none

### Context
档案间有向关系和图谱能够表达组织、项目与个人的结构，但会把规范化存档扩大为实体关系管理系统，并增加关系生命周期、查询和 UI 复杂度。

### Decision
首版不建模、不展示也不推理档案之间的关系。联系人仍可通过带角色关系关联档案，但档案不能把另一个档案作为关系目标。

### Trade-off
用户无法在产品内导航公司与项目等实体结构；作为交换，数据模型和工作台专注于单份档案的规范化归集。

### Consequences
移除关系视图、关系 CRUD 和图谱索引。自定义字段不得偷偷承担档案关系身份；未来若需要关系必须另建 change。

## ADR-007: Dossiers 目录包含全部迁移权威

**Status:** accepted
**Source:** LOG-018 / user decision
**Supersedes:** ADR-004 中尚未确定的结构化数据位置

### Context
资料文件与档案结构分处工作区和插件私有目录会导致迁移只得到文件，丢失模板、属性、联系人、标签和审计语义。

### Decision
`<workspace>/Dossiers/` 同时承载结构化权威数据和受管资料，是完整档案库迁移单元。插件私有目录只能保存可从 `Dossiers/` 重建的缓存，不得成为第二权威。

### Trade-off
工作区会包含应用管理的结构化文件，复制和备份体积更大；作为交换，档案库不依赖本机 HANA_HOME，可以随工作区完整恢复。

### Consequences
所有 schema 版本、操作日志和迁移必须位于 `Dossiers/`。具体清单与索引格式由 D-020 决定。

### Verification / Migration
在空插件私有目录和另一设备环境中，仅使用复制后的工作区重建并验证档案、联系人、标签、审计与资料引用。

## ADR-008: Agent 通过相对引用按需读取资料

**Status:** accepted
**Source:** LOG-019 / user decision
**Supersedes:** ADR-005 中可能被误读为默认全量发送的部分

### Context
全局模型授权不等于插件应把整份资料预先装入模型上下文。大文件和无关正文会浪费上下文，也扩大不必要的数据暴露。

### Decision
插件只向 Agent 提供工作区相对的档案目录或清单引用。Agent 根据当前任务通过受控 ResourceIO 工具读取所需文件或片段；插件不建立正文索引，不预先解析并发送整份资料，也不暴露宿主绝对路径。

### Trade-off
Agent 需要额外的发现和读取调用，摘要速度取决于文件工具和格式支持；作为交换，模型读取范围与实际任务一致，来源可精确审计。

### Consequences
每个档案必须提供稳定的 AI 可读清单入口。模型产物记录实际读取的资源引用；读取失败、格式不支持和上下文预算不足必须显式返回。

### Verification / Migration
验证 Agent 首次只收到相对引用、按需读取可审计、未读文件不进入请求、绝对路径不泄露以及大文件分段读取。

## ADR-009: 目标档案目录拥有受管资料副本

**Status:** accepted
**Source:** LOG-017 / user decision
**Supersedes:** ADR-002 中尚未确定的工作区内部复制边界

### Context
仅复制工作区外文件仍会让档案依赖工作区其他目录，单独移动或恢复档案时引用可能失效。

### Decision
任何不在目标档案受管目录内的文件都复制到 `Dossiers/dossiers/<stable-id>/documents/<category>/`；目标目录内文件才以相对引用登记。相同字节使用内容哈希识别，同名不同内容使用稳定后缀，不静默覆盖。

### Trade-off
同一资料加入多个档案会产生物理冗余并增加磁盘占用；作为交换，每份档案目录自包含，移动、备份和恢复边界明确。

### Consequences
导入预览必须显示复制量、哈希重复和命名结果；发布元数据前完成复制，失败时回滚暂存文件。

### Verification / Migration
覆盖外部文件、工作区其他目录、目标目录内文件、同哈希、同名异内容、复制中断及多档案冗余。

## ADR-010: 版本化清单是结构化权威，SQLite 是派生索引

**Status:** accepted
**Source:** LOG-022 / user decision
**Supersedes:** none

### Context
中等规模列表和筛选需要 SQLite 性能，但根级数据库作为唯一真相不利于单份档案自包含、人工审阅、Agent 按引用读取和损坏恢复。

### Decision
档案、联系人和类型由 `Dossiers/` 内版本化清单文件持久化为权威。根级 SQLite 仅保存可从清单重建的查询投影；持久操作日志协调清单写入、文件移动和索引更新。

### Trade-off
清单加索引需要处理投影滞后和重建成本；作为交换，迁移与恢复不依赖数据库文件，Agent 可以按目录读取权威数据。

### Consequences
索引损坏不能阻塞权威数据读取；重建需要进度和取消。精确清单格式由 D-026 决定。

### Verification / Migration
删除派生索引后从清单重建，并验证分页查询、标签和联系人投影一致；模拟索引更新失败时保留可恢复操作日志。

## ADR-011: 产品实现严格封装在内置插件目录

**Status:** accepted
**Source:** LOG-026 / user decision / hana-plugin-creator skill
**Supersedes:** none

### Context
档案功能需要 Page、API、Agent tools 和工作区资源访问，但这些能力已由 Hana 插件 SDK 提供。修改系统模块会破坏插件独立性和可卸载边界。

### Decision
所有产品代码、资源和插件专属测试位于 `plugins/<plugin-id>/`。采用 full-access、route-backed WebView/iframe Page 和 Agent tools，只使用公开 `@hana/plugin-runtime`、`@hana/plugin-sdk`、`@hana/plugin-components`、`ctx.resources` 与 `hana.api.fetch`。不得修改或导入 `core/`、`server/`、`desktop/`、`shared/`、`packages/` 及根级构建配置中的内部实现。

### Trade-off
插件不能直接复用未公开的 Knowledge FTS、标签或内部路由，某些原生 UI 能力也不可用；作为交换，功能可以独立安装、启用、卸载和验证，不影响系统其他功能。

### Consequences
首版仅做元数据搜索；工作区写入通过 ResourceIO，iframe 文件选择/打开通过声明的 host capabilities。若后续需求只能通过系统改动实现，必须新建 change，不得在实现阶段越界。

### Verification / Migration
路径所有权检查确保产品 diff 仅位于 `plugins/<plugin-id>/`；静态扫描禁止 Renderer 内部 import、内部 Knowledge API、iframe 直接文件访问和硬编码插件 API URL。

## ADR-012: 插件稳定身份为 dossiers

**Status:** accepted
**Source:** LOG-027 / user decision
**Supersedes:** ADR-011 中的占位 plugin-id

### Context
`archive` 在 HanaKDE 已用于生命周期归档，若作为业务档案插件身份会混淆数据、路由和运维语义。

### Decision
插件 manifest id 和目录名固定为 `dossiers`，实现根为 `<Path>plugins/dossiers/</Path>`，用户可见名称为 `Hana Dossiers / 档案`。

### Trade-off
英文 Dossier 对部分用户不如 Archive 常见；作为交换，持久身份准确表达实体资料归集，并避开 archived 状态冲突。

### Consequences
所有 route、tool、capability owner、数据 ownership 和构建输出使用 `dossiers`；展示名称可本地化但不得改变 id。

## ADR-013: dossier.json 是单档案清单权威

**Status:** accepted
**Source:** LOG-028 / user decision
**Supersedes:** ADR-010 中未确定的 JSON/Markdown 格式

### Context
双写 JSON 和 Markdown 会产生冲突权威；Markdown frontmatter 对嵌套 typed fields、版本迁移和严格校验不如 JSON 明确。

### Decision
每份档案在自己的受管目录内使用版本化 `dossier.json` 作为唯一档案清单权威。联系人和模板使用根级版本化 JSON 文件；`catalog.sqlite` 仅为派生索引。Markdown 只能是可删除的展示或导出产物。

### Trade-off
用户手工阅读 JSON 不如 Markdown 自然；作为交换，schema、迁移、校验和 Agent 机器读取均有单一稳定格式。

### Consequences
所有写入使用结构化 parser 和 schema 校验，不通过字符串拼接改 JSON。AI 入口优先指向 `dossier.json` 和相对资料目录。

### Verification / Migration
验证 schema 拒绝、未知字段前向兼容、原子写入、索引重建以及不存在 Markdown 投影时功能完整。

## ADR-014: 固定根采用兼容门与可恢复迁移

**Status:** accepted
**Source:** LOG-029 / user decision
**Supersedes:** none

### Context
固定 `Dossiers/` 可能与用户已有普通目录冲突，旧 schema 迁移也可能在文件移动或清单改写中失败。

### Decision
插件只接管空目录或具有兼容根 manifest 的 `Dossiers/`。非兼容同名目录必须停止写入并报告冲突。旧 schema 迁移先创建可验证备份和预检报告，再通过持久操作日志执行；失败保留原数据并支持恢复重试。

### Trade-off
严格门禁可能要求用户先处理同名目录，迁移也需要额外磁盘；作为交换，插件不会误覆盖用户文件，失败不会留下不可判定状态。

### Consequences
首次初始化、打开、迁移和恢复共享同一兼容检测。禁止猜测目录语义或自动清空。

### Verification / Migration
覆盖空目录、兼容根、非兼容同名目录、备份空间不足、迁移中断、恢复和重复重试。

## ADR-015: 审计采用分级保留

**Status:** accepted
**Source:** LOG-031 / user decision
**Supersedes:** none

### Context
全部活动永久保留会持续增长并扩大敏感元数据暴露；仅保留短期记录又无法审计迁移和破坏性操作。

### Decision
普通档案活动保留 1 年；迁移、删除、恢复和安全相关审计永久保留。两类记录均不得包含资料正文、联系人敏感值或完整模型输入。

### Trade-off
分级保留需要事件分类和清理任务；作为交换，日常日志体积受控，高事故半径行为仍可长期追踪。

### Consequences
清理过程本身产生永久审计，但不得影响当前档案事实或回收站保留合同。

### Verification / Migration
使用可控时钟验证 1 年边界、永久事件保留、敏感字段脱敏和清理幂等性。
