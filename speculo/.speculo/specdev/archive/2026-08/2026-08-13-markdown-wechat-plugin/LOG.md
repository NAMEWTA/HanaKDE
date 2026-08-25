## LOG-001 — 2026-08-13T11:32:58+08:00 — 内置插件落点
- **设计树节点：** D-001
- **轮次与依赖：** round 1 / 无
- **状态：** confirmed
- **问题：** Markdown 公众号排版能力应落在内置插件还是系统本体？
- **事实与来源：** 用户明确要求内置插件；`<Path>.agents/skills/feature-placement/SKILL.md</Path>` 判定门；`<Path>PLUGIN_SDK.md</Path>`、`<Path>PLUGINS.md</Path>` 的 Page/ResourceIO/SessionFile 契约。
- **选项：** 内置插件消费已有契约；系统本体新增共享编辑器/渲染器契约。
- **推荐：** 内置插件，因为功能可整块删除且产物不属于系统共享状态。
- **结论：** 采用 `<Path>plugins/markdown-wechat/</Path>` 作为内置插件落点，暂不修改系统本体。
- **原因：** 七条插件盒子判据均可装入；没有命中三条破盒硬门。
- **影响工件：** CONTEXT、ADR、Spec、Ticket
- **约束或不变量：** 插件消费稳定宿主契约；不得私造系统级 scheduler、权限能力或全局数据迁移。
- **后续：** 进入 G-grill-with-docs，锁定范围、权限、持久化和验收。
- **替代/被替代：** 无

## LOG-012 — 2026-08-13T15:04:00+08:00 — Page/Widget 导出交付修订
- **设计树节点：** T-tickets 阶段实现地形核对
- **轮次与依赖：** post-consensus / ADR-003
- **状态：** confirmed
- **问题：** Page/Widget 没有 sessionId/sessionPath 时，导出 Markdown/HTML 如何交付？
- **事实与来源：** `stageFile()`/`registerSessionFile()` 强制要求 session identity；独立 plugin surface session 只包含插件身份；`sessionFile.open` 只打开已有 SessionFile。
- **选项：** A 新增宿主 SessionFile 创建接缝；B Page/Widget 浏览器下载，Agent tool 保留 SessionFile；C 伪造或复用当前会话身份。
- **推荐：** B，保持现有宿主公共契约和插件可删除边界。
- **结论：** 用户选择 B。Page/Widget 在 iframe 内生成 Markdown/HTML 并通过浏览器下载，不注册 SessionFile、不写工作区；Agent tool 在有 session context 时继续用 `stageFile()` 交付 SessionFile。
- **原因：** B 不扩大宿主接口，且保留 Agent 对话内文件产出能力；C 违反会话身份和权限不变量。
- **影响工件：** ADR-006、Spec、Ticket
- **约束或不变量：** UI 不猜测 `sessionId`/`sessionPath`；无 session 的 Agent tool 只返回 HTML 文本和明确状态。
- **后续：** 重新发布 S-spec，通过后进入 T-tickets。
- **替代/被替代：** ADR-003 的 Page/Widget SessionFile 导出部分由 ADR-006 supersede。

## LOG-002 — 2026-08-13T11:32:58+08:00 — 参考来源冻结
- **设计树节点：** 不适用
- **轮次与依赖：** round 1 / 无
- **状态：** confirmed
- **问题：** 参考项目提供了哪些可验证事实？
- **事实与来源：** `<Path>temp/md-wechat/</Path>`，固定提交 `edcfe87d35b1381ad48545d16c608aba44ef52b2`；README、`<Path>temp/md-wechat/src/lib/renderer.js</Path>`、`<Path>temp/md-wechat/src/lib/clipboard.js</Path>`、`<Path>temp/md-wechat/tests/</Path>`。
- **选项：** 整体迁移；选择性吸收行为与测试意图；只做空壳。
- **推荐：** 选择性吸收，先按 Hana 插件契约重新设计。
- **结论：** 参考仓库作为行为研究输入，不是生产代码或外部行为合同。
- **原因：** 参考项目是浏览器本地应用，无法直接证明 Hana 的 ResourceIO、SessionFile、iframe 和权限接缝。
- **影响工件：** CONTEXT、Spec
- **约束或不变量：** 任何复用行为必须通过 Hana 侧稳定接缝和测试重新证明。
- **后续：** 在实现前继续核对内置插件构建/安装和 UI smoke。
- **替代/被替代：** 无

## LOG-003 — 2026-08-13T11:36:00+08:00 — v1 功能对齐范围
- **设计树节点：** D-002
- **轮次与依赖：** round 1 / 无
- **状态：** confirmed
- **问题：** v1 是完整对齐参考项目，还是核心排版闭环？
- **事实与来源：** 用户回答 `B`；来源参考项目 README 与源码中已观察到的编辑器、预览、主题、语法、复制和导入导出能力。
- **选项：** A 完整对齐；B 核心闭环；C 轻量首版。
- **推荐：** B。先锁定宿主接缝与最小可交付行为，将高风险媒体/图床/复杂文档管理留给后续 change。
- **结论：** v1 采用 B：编辑器、实时预览、主题/字号/字体、核心 Markdown 语法、富文本复制、Markdown 导入/导出；图片/视频高级处理、多文档回收站和图床不在本 change 首版范围。
- **原因：** 用户明确选择 B；该范围能形成完整发布闭环，同时控制资源、网络和持久化风险。
- **影响工件：** CONTEXT、Spec、Ticket
- **约束或不变量：** 后续实现不得把被排除的高级媒体、图床或复杂多文档能力作为隐含必需依赖。
- **后续：** 继续询问 D-003 与 D-004；其余节点依赖这两项。
- **替代/被替代：** 无

## LOG-004 — 2026-08-13T11:45:56+08:00 — 主 UI 贡献面
- **设计树节点：** D-003
- **轮次与依赖：** round 2 / D-002
- **状态：** confirmed
- **问题：** 排版工具的宿主入口采用哪种 UI 贡献面？
- **事实与来源：** 用户回答 `B`；Hana 插件文档允许同一插件同时声明 Page 与 Widget；参考项目是宽屏双栏编辑/预览工作面。
- **选项：** A 仅 Page；B Page + Widget；C 仅 Widget。
- **推荐：** A 可降低首版 UI 面积，但 B 能保留完整工作台并提供快速入口。
- **结论：** 采用 Page + Widget。Page 承载完整编辑器和预览，Widget 只提供快速入口或轻量最近文档入口，不复制完整编辑器状态。
- **原因：** 用户明确选择 B；Widget 的作用域被限定为辅助入口，避免形成第二套编辑器状态。
- **影响工件：** CONTEXT、ADR、Spec、Ticket
- **约束或不变量：** Page 是完整排版工作面的唯一权威；Widget 不得分叉文档、主题或持久化状态。
- **后续：** 继续收敛文档与设置持久化边界。
- **替代/被替代：** 无

## LOG-005 — 2026-08-13T11:45:56+08:00 — Agent 工具边界
- **设计树节点：** D-004
- **轮次与依赖：** round 2 / D-002
- **状态：** confirmed
- **问题：** 是否同时提供 Agent 可调用的 Markdown 公众号排版工具？
- **事实与来源：** 用户回答 `B`；Hana Plugin SDK 的 `tools/`、ResourceRef、`stageFile()` 与 SessionFile 合同。
- **选项：** A 不提供 Agent tool；B 只读/纯产出；C 可直接写工作区。
- **推荐：** B。它复用渲染核心并保持用户工作区写入 reviewer-bound/显式 ResourceIO 边界。
- **结论：** 提供只读/纯产出 Agent tool：接受 Markdown 或 ResourceRef，返回渲染 HTML/SessionFile；不直接创建或覆盖用户工作区文件。
- **原因：** 用户明确选择 B；纯产出工具能服务 Agent 流程，同时不扩大插件写权限。
- **影响工件：** CONTEXT、ADR、Spec、Ticket
- **约束或不变量：** 输入使用 Markdown 字符串或 ResourceRef；用户资源读取走 `ctx.resources`；生成文件走 `stageFile()`；不得接受宿主绝对路径作为新公共参数。
- **后续：** 继续询问文档与设置持久化，再决定导入/导出工具接缝。
- **替代/被替代：** 无

## LOG-006 — 2026-08-13T11:50:00+08:00 — 文档与设置持久化
- **设计树节点：** D-005
- **轮次与依赖：** round 3 / D-002, D-003
- **状态：** confirmed
- **问题：** 文档、主题和编辑器设置的默认持久化边界是什么？
- **事实与来源：** 用户回答 `A`；Hana 插件运行时提供插件私有 `dataDir` 与生命周期/routes；参考项目使用浏览器 `localStorage`/`IndexedDB`，但 iframe 存储策略不应成为 Hana 插件合同。
- **选项：** A 插件私有数据；B 浏览器本地状态；C 用户资源优先。
- **推荐：** A。插件重启后可恢复且不依赖浏览器存储，同时与用户工作区 ResourceIO 边界清晰。
- **结论：** 文档、主题和编辑器设置存放在插件私有数据中，由插件 routes/lifecycle 管理；用户资源只在显式导入/导出流程中访问。
- **原因：** 用户明确选择 A；该边界让 Page 与 Widget 共享一套插件数据，并避免隐式工作区写入。
- **影响工件：** CONTEXT、ADR、Spec、Ticket
- **约束或不变量：** 插件私有数据不得冒充用户资源；不得把 iframe `localStorage`/`IndexedDB` 作为唯一权威；并发更新和 schema 版本由插件自身定义。
- **后续：** 继续询问 D-006，锁定导入/导出与文件写回。
- **替代/被替代：** 无

## LOG-007 — 2026-08-13T14:10:29+08:00 — 导入导出与文件写回
- **设计树节点：** D-006
- **轮次与依赖：** round 4 / D-004, D-005
- **状态：** confirmed
- **问题：** 导入 Markdown、导出 Markdown/HTML 以及复制富文本的交付语义是什么？
- **事实与来源：** 用户回答 `A`；Hana Plugin SDK 的 `resource.pick`、`ctx.resources`、`stageFile()` 和 `hana.clipboard` 合同。
- **选项：** A 显式 ResourceIO 导入 + SessionFile 导出；B 直接操作当前工作区路径；C 只支持剪贴板。
- **推荐：** A。它把用户资源访问和插件生成物交付分开，避免隐式文件写入与宿主绝对路径。
- **结论：** 导入通过 `resource.pick` 与 ResourceIO 读取；Markdown/HTML 导出默认生成 SessionFile；用户如需写入工作区，必须另行选择路径并显式执行；富文本复制通过宿主剪贴板能力交付。
- **原因：** 用户明确选择 A；该语义符合插件权限边界并可在 Page、Widget 和 Agent tool 中复用。
- **影响工件：** CONTEXT、ADR、Spec、Ticket
- **约束或不变量：** 不把导入资源自动覆盖到插件私有文档；不把导出文件写入工作区；不以 `file://`、绝对路径或自定义 `MEDIA:` 字符串替代 ResourceIO/SessionFile。
- **后续：** 继续询问 D-007 与 D-008；两项共同决定媒体和兼容范围。
- **替代/被替代：** 无

## LOG-008 — 2026-08-13T14:13:45+08:00 — 媒体与第三方网络
- **设计树节点：** D-007
- **轮次与依赖：** round 5 / D-002, D-005, D-006
- **状态：** confirmed
- **问题：** 图片/视频与图床能力是否进入 v1？
- **事实与来源：** 用户回答 `A`；参考项目包含本地媒体预览、视频复制占位和 SM.MS/GitHub/自定义图床；Hana 要求外部 HTTP 使用 `ctx.network.fetch()`、`network.allowedHosts` 和显式 secret/config 能力。
- **选项：** A 本地媒体预览/占位但无第三方图床；B 支持第三方图床；C 不做媒体增强。
- **推荐：** A。保留核心排版所需的本地媒体语义，避免首版引入网络副作用、凭据存储和外部服务失败面。
- **结论：** v1 保留本地图片/视频预览与公众号复制所需的占位语义，但不接入 SM.MS、GitHub 或自定义第三方图床。
- **原因：** 用户明确选择 A；网络图床可作为后续独立 change，届时重新设计 capability、allowedHosts、配置 schema、错误和隐私合同。
- **影响工件：** CONTEXT、ADR、Spec、Ticket
- **约束或不变量：** v1 不声明 `network.fetch`，不保存图床 token，不在 iframe 中直连第三方服务；本地媒体输入仍必须遵守 ResourceIO/SessionFile 边界。
- **后续：** 进入最终验收优先级决策。
- **替代/被替代：** 无

## LOG-009 — 2026-08-13T14:13:45+08:00 — 旧项目数据迁移
- **设计树节点：** D-008
- **轮次与依赖：** round 5 / D-005, D-006
- **状态：** confirmed
- **问题：** 是否迁移参考项目或现有 md-wechat 数据？
- **事实与来源：** 用户回答 `A`；参考项目使用浏览器 localStorage/IndexedDB；当前 change 已锁定 Hana 插件私有持久化与显式 Markdown 文件导入。
- **选项：** A 不做自动迁移；B 迁移 localStorage/IndexedDB/SQLite；C 只导入 Markdown 文件且不迁移设置/媒体缓存。
- **推荐：** A。没有可验证的真实数据样本和稳定跨实现格式时，不伪造兼容合同；未来真实迁移需求另建 importer 设计。
- **结论：** 不做参考项目 localStorage/IndexedDB/SQLite 的自动迁移；未来如存在真实用户数据，再单独设计版本化 JSON importer。
- **原因：** 用户明确选择 A；显式 Markdown 导入已覆盖文章内容迁移的可验证路径，避免读取另一套浏览器数据库。
- **影响工件：** CONTEXT、ADR、Spec、Ticket
- **约束或不变量：** v1 不扫描、解析或修改参考项目的浏览器数据库；不声称旧设置、媒体缓存或文档 metadata 兼容。
- **后续：** 进入 D-009 最终验收优先级。
- **替代/被替代：** 无

## LOG-010 — 2026-08-13T14:18:00+08:00 — 兼容与验收重点
- **设计树节点：** D-009
- **轮次与依赖：** round 6 / D-002, D-003, D-004, D-006, D-007, D-008
- **状态：** confirmed
- **问题：** 首版发布验收优先级如何排序？
- **事实与来源：** 用户回答 `A`；SpecDev 证据与验证规则；Hana Plugin SDK/PluginManager 的内置插件、Page/Widget、ResourceIO、SessionFile 接缝；参考项目的渲染与复制测试意图。
- **选项：** A 宿主边界与核心行为为硬门；B 视觉/26 主题优先；C 两者同等阻塞。
- **推荐：** A。先证明插件可加载、可使用、可删除，资源权限和核心渲染/复制正确，再用关键主题和行为快照覆盖视觉质量。
- **结论：** 首版发布阻塞验收优先保证 Hana 内置插件加载/删除、Page/Widget 可用、资源权限与核心渲染/复制行为；主题数量和视觉细节使用关键覆盖验证，可逐步补齐。
- **原因：** 用户明确选择 A；宿主契约错误会阻断整个插件，而视觉数量不足可以在不破坏边界的情况下迭代。
- **影响工件：** CONTEXT、Spec、Ticket、Evidence
- **约束或不变量：** 不得用视觉覆盖通过掩盖插件加载、权限、资源、导出或复制失败；任何未覆盖主题必须明确标记为非阻塞残余风险。
- **后续：** 请求用户确认完整设计树共识；确认后路由到 Spec 或 Tickets，不自动实现。
- **替代/被替代：** 无

## LOG-011 — 2026-08-13T14:20:00+08:00 — 设计树总共识确认
- **设计树节点：** 不适用（D-001～D-009）
- **轮次与依赖：** round 7 / 完整 frontier 为空
- **状态：** confirmed
- **问题：** 用户是否接受完整设计树及其下游合同？
- **事实与来源：** 用户明确回复“确认”；设计树 9 个节点均为 answered；`grill` 阶段校验通过。
- **选项：** 接受当前共识并路由下游；指出遗漏并继续访谈。
- **推荐：** 接受当前共识，进入 S-spec 编写外部行为与验收合同。
- **结论：** 用户确认完整设计共识；设计树状态设为 `consensus`。
- **原因：** 所有高影响产品、权限、数据、迁移、媒体、兼容和验收决策均已逐轮回答并写入 LOG/CONTEXT/ADR。
- **影响工件：** Spec、Ticket、Goal Plan
- **约束或不变量：** G 不实现产品代码；永久 `context/` 与 `adr/` 保持只读；下游不得重新打开已确认决策而不建立 supersedes 记录。
- **后续：** 下一 Work 为 `<Path>{roots.workflows}/specdev/S-spec/S-spec.md</Path>`。
- **替代/被替代：** 无
