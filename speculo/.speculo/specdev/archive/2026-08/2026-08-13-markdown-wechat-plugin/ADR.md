# Markdown 公众号排版内置插件架构决策

本文件只记录当前 change 已确认、可供下游使用的架构合同；永久 ADR namespace 保持只读。

## ADR-001: 排版能力作为可删除的内置插件

**Status:** accepted
**Source:** LOG-001 / user decision
**Supersedes:** none

### Context
用户要求把参考项目的 Markdown 公众号排版能力纳入 HanaKDE，但参考项目是独立的浏览器应用，不能把其本地状态、UI 或渲染实现直接焊入系统本体。Hana 已有 Page/Widget、ResourceIO、剪贴板、SessionFile 和插件资产贡献面。

### Decision
将该能力实现为 `<Path>plugins/markdown-wechat/</Path>` 内置插件。插件可以拥有自己的渲染器、主题、文档状态、routes/tools 和 UI assets，但必须消费 Hana 已声明的宿主能力；不新增系统级编辑器契约、权限能力、全局数据迁移或不可删除的常驻基础设施。

### Trade-off
直接修改系统本体可能更容易复用内部渲染或文件 API，但会扩大系统共享状态与删除半径。插件形态需要显式处理 iframe 资源、ResourceIO、SessionFile 和权限声明，却保留隔离、可测试和可整块删除性。

### Consequences
插件落点和删除边界在本 change 内固定；是否采用 Page+Widget、是否提供 Agent tool、具体资源与网络权限、持久化和迁移策略仍由后续设计节点决定。

### Verification / Migration
下游实现必须通过 PluginManager 加载、UI/资源权限 smoke、核心渲染/复制测试和删除 `<Path>plugins/markdown-wechat/</Path>` 后的系统构建验证。旧项目数据不因本 ADR 自动迁移。

## ADR-002: 文档与设置使用插件私有持久化

**Status:** accepted
**Source:** LOG-006 / user decision
**Supersedes:** none

### Context
参考项目把文档和设置放在浏览器 `localStorage`/`IndexedDB`，但 Hana 的 Page/Widget 是宿主管理的 iframe/WebView，浏览器存储不应成为跨入口、跨重启的产品权威。另一方面，强制每篇文档绑定工作区文件会把草稿和用户资源混为一谈，并引入隐式写回风险。

### Decision
Markdown 文档、主题、编辑器设置和草稿状态存放在 `<Path>plugins/markdown-wechat/</Path>` 的插件私有数据目录，由插件 routes/lifecycle 管理。用户工作区只通过显式导入/导出操作经 ResourceIO 访问；Widget 与 Page 共享同一插件私有数据权威。

### Trade-off
插件需要维护私有 schema、版本和并发更新，比直接使用浏览器存储或强绑定工作区文件更复杂；但它提供稳定的宿主生命周期边界，避免隐式文件副作用，也不依赖 iframe 存储策略。

### Consequences
后续实现必须定义插件数据 schema、损坏/升级行为、Page 与 Widget 的一致性和导入导出边界。该 ADR 不授权自动迁移参考项目的 `localStorage`/`IndexedDB` 数据。

### Verification / Migration
验证 Hana 重启后数据恢复、Page/Widget 同源读取、schema 版本拒绝或升级、显式导入/导出以及删除插件目录后的系统完整性。旧项目存储保持不迁移。

## ADR-003: 文件导入导出采用显式 ResourceIO 与 SessionFile

**Status:** accepted
**Source:** LOG-007 / user decision
**Supersedes:** none

### Context
Markdown 公众号排版需要从文件导入文章，并把 Markdown/HTML 结果交付给用户。插件不能把 iframe 中的浏览器文件对象、宿主绝对路径或隐式工作区写入当作稳定合同；Hana 已提供资源选择、ResourceIO 和 SessionFile 交付链路。

### Decision
导入通过 `resource.pick` 选择资源，再由服务端 route/tool 使用 `ctx.resources` 读取；Markdown/HTML 导出默认写入插件生成目录并经 `stageFile()` 作为 SessionFile 返回；用户需要写回工作区时，必须另行选择目标并执行显式 ResourceIO 写入。富文本复制走宿主剪贴板能力，不能用自建文件或 `MEDIA:`/`file://` 字符串替代。

### Trade-off
显式流程比直接绑定当前工作区路径多一步用户操作，也要求插件处理资源权限拒绝和导出文件生命周期；但它保持插件私有草稿、用户资源和 SessionFile 身份的清晰分离，并适配桌面与远程宿主。

### Consequences
Page、Widget 和 Agent tool 必须复用同一导入导出合同。导入失败、权限拒绝、导出失败和工作区写回冲突都必须可观察；导出默认不产生工作区副作用。

### Verification / Migration
覆盖资源选择/读取、权限拒绝、Markdown/HTML SessionFile 交付、富文本剪贴板、显式写回和删除插件后的系统完整性；不迁移或猜测旧项目浏览器存储。

## ADR-004: v1 不接入第三方图床网络

**Status:** accepted
**Source:** LOG-008 / user decision
**Supersedes:** none

### Context
参考项目提供 SM.MS、GitHub 和自定义图床，但这会引入网络 capability、allowedHosts、secret 配置、外部副作用和第三方失败面。v1 的核心闭环只需要本地媒体预览与公众号复制占位语义。

### Decision
v1 保留本地图片/视频预览和复制所需的占位行为，不声明 `network.fetch`，不实现 SM.MS、GitHub 或自定义图床上传。任何未来图床能力必须在独立 change 中重新设计网络权限、凭据存储、域名 allowlist、错误和隐私合同。

### Trade-off
首版无法直接把本地媒体上传为公网 URL，文章跨设备发布需要用户自行准备资源；作为交换，插件没有第三方网络副作用和 token 管理风险，核心排版闭环更容易验证。

### Consequences
本 change 的 manifest 不得包含图床网络 capability 或 token schema；本地媒体仍通过 ResourceIO/SessionFile 处理。后续图床不是实现阶段可自行扩大的范围。

### Verification / Migration
静态扫描确保 iframe 无第三方直连、manifest 无 `network.fetch`，并测试本地媒体预览、复制占位和失败降级。

## ADR-005: v1 不迁移参考项目浏览器数据

**Status:** accepted
**Source:** LOG-009 / user decision
**Supersedes:** none

### Context
参考项目数据位于浏览器 localStorage/IndexedDB，当前没有经过验证的跨实现导出格式、真实用户样本或稳定的 Hana 迁移接缝。直接扫描浏览器数据库既不可移植，也会把参考项目私有存储误当成公共合同。

### Decision
v1 不读取、解析或修改参考项目的 localStorage、IndexedDB 或 SQLite 数据，不声称旧设置、媒体缓存或 metadata 兼容。文章内容只能通过显式 Markdown 文件导入进入新插件；未来真实迁移需求另建版本化 JSON importer change。

### Trade-off
已有参考项目用户不能自动带入文档和设置，需要显式导出/导入；但迁移边界可验证、可回滚，不会把未知旧格式固化到插件私有 schema。

### Consequences
实现和验收不得添加旧数据库探测或兼容分支；任何迁移请求必须重新进行 SpecDev 设计和样本验证。

### Verification / Migration
静态扫描与测试确认不依赖旧浏览器数据库；Markdown 导入覆盖文章迁移主路径；未来 importer 必须拥有独立格式版本、校验和回滚证据。

## ADR-006: Page/Widget 导出使用浏览器下载，Agent tool 保留 SessionFile

**Status:** accepted
**Source:** LOG-012 / user decision
**Supersedes:** ADR-003 的 Page/Widget SessionFile 导出部分

### Context
现有 Hana `stageFile()`/`registerSessionFile()` 需要 `sessionId` 或 `sessionPath`。独立 Page/Widget surface 只有插件身份，没有可合法用于创建 SessionFile 的会话身份；`sessionFile.open` 只能打开已有 SessionFile，不能创建导出物。

### Decision
Page/Widget 导出 Markdown 或 HTML 时，在 iframe 内生成文件内容并通过浏览器下载交付；导出动作不注册 SessionFile，也不隐式写入用户工作区。Agent tool 的输出合同不变：在调用上下文提供 `sessionId`/`sessionRef` 且 `stageFile()` 可用时，继续交付 HTML SessionFile；无 session context 时只返回 HTML 文本和明确的无文件说明。

### Trade-off
Page/Widget 下载不具备 SessionFile 的跨会话引用和宿主媒体管理，但不需要扩大系统公共接口；Agent 调用仍保留 SessionFile 产出。

### Consequences
Page/Widget 的导出验收改为浏览器下载、文件名/格式和失败可见；Agent tool 继续验证 SessionFile media details。UI 路由不得猜测或伪造 `sessionId`/`sessionPath`。

### Verification / Migration
通过 Page/Widget 浏览器下载 smoke、下载 API 故障回退和 Agent tool SessionFile fixture 验证；不新增宿主 capability，不迁移旧数据。
