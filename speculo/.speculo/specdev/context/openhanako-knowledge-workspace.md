# OpenHanako Knowledge Workspace 规范术语

本文件只保存跨 change 仍有效的规范术语。318 个细粒度交互定义及完整 `_Avoid_` 边界保留在归档 change，不在永久上下文中复制。

- Promoted: 2026-08-09
- Source: `<Path>{roots.state}/specdev/archive/2026-07/2026-07-24-openhanako-knowledge-workspace/CONTEXT.md</Path>`

## Workspace 与来源

**Workspace**：用户当前活动工作根及其会话级附加来源组成的知识工作环境。
_Avoid_: 第二套独立知识 workspace、Obsidian Vault

**活动工作根**：session 当前选择的 cwd 或 Studio `workspaceMountId` 对应根。
_Avoid_: 可热替换且不重置会话的 main

**main**：活动工作根在 Knowledge 协议中的固定 `sourceKey`。
_Avoid_: 在 Markdown 中持久化 `main:` 前缀

**来源（Source）**：一个由 provider 控制、具有独立地址和索引域的文件空间。
_Avoid_: 用展示名称代替来源身份

**附加来源**：本次 Workspace 会话中显式挂载、关闭后不自动恢复的额外来源。
_Avoid_: 默认挂载、跨 Workspace 自动继承

**sourceKey**：来源的内部稳定路由键；不写入 Markdown。
_Avoid_: 绝对路径、displayName

**displayName**：来源的展示名称，不参与解析或身份判断。
_Avoid_: 把展示名称当唯一标识

**ResourceRef**：HanaKDE 既有的 provider 联合资源引用。
_Avoid_: 为 Knowledge 复制第二套 provider 引用

**KnowledgeResourceAddress**：由 `sourceKey` 与规范 `relativePath` 组成的知识协议地址。
_Avoid_: resolvedPath、本机绝对路径

**知识地址**：Markdown 中持久化的当前来源内规范相对路径。
_Avoid_: sourceKey、跨来源 URI

**ProviderRootIdentity**：provider 在 Server 内给出的 `identityNamespace`、不透明根身份与 scope proof，用于判定真实根关系；不得进入远程 DTO、Renderer 或日志。
_Avoid_: provider ID、用户输入路径字符串、displayName

**RootRelation**：两个 provider 根之间的 `same`、`ancestor`、`descendant`、`disjoint` 或 `unknown` 关系；只有 `disjoint` 可同时活动。
_Avoid_: 把 unknown 当 disjoint

## 资源与编辑

**页面（Page）**：可使用 Markdown 知识语义编辑的真实 Markdown 文件。
_Avoid_: 虚拟页面、数据库对象

**资产（Asset）**：除 Markdown 页面外的普通文件、未知文件或文件系统链接条目。
_Avoid_: 自动把未知文件解释为页面

**磁盘已保存内容**：成功写入 provider 并可重新读取的页面正文或资产字节，是索引与 Server 查询唯一可持久依赖的知识事实。
_Avoid_: 未保存 Renderer buffer、派生索引

**文档会话（Document Session）**：页面共享的 buffer、baseline、version、history 与 dirty 状态。
_Avoid_: 把 cursor/scroll 作为共享文档状态

**文档视图（Document View）**：单个编辑组中的 cursor、selection、scroll 与 mode 状态。
_Avoid_: 为每个视图复制文档 buffer

**编辑组（Editor Group）**：承载一组 tabs 的可递归水平或垂直面板。
_Avoid_: 独立浮动知识窗口

**临时预览标签（Preview Tab）**：可被下一次普通预览替换、固定后转为普通 tab 的视图。
_Avoid_: 自动固定所有预览

**资源树**：按来源根分组、一比一投影 provider 真实文件与目录的可交互树；派生知识视图不伪装为真实目录节点。
_Avoid_: 把 tags/backlinks 当物理目录

**Live Preview**：同一 Markdown buffer 上以 decorations/widgets 隐藏或渲染语法的编辑模式。
_Avoid_: 第二份预览文档模型

**源码模式（Source Mode）**：显示完整 Markdown 标记的同一 buffer 视图模式。
_Avoid_: 独立源码副本

**悬空未保存文档**：来源丢失、资源被外部移除或 identity 暂时失效后，仍保留在 Renderer 中且尚未保存的文档会话。
_Avoid_: 来源失效时静默丢弃 buffer

## Markdown 语义

**Wikilink**：`[[...]]` 或 `![[...]]` 形式的同源知识链接。
_Avoid_: 跨来源自动回退

**Markdown Link**：标准 Markdown 链接；内部文件目标按引用页面目录相对解析。
_Avoid_: 按来源根解析所有相对链接

**LinkResolver**：把页面上下文和链接词法结果解析为同源 `KnowledgeResourceAddress` 的纯领域服务。
_Avoid_: 用搜索结果猜目标

**断裂引用**：在引用页面所属来源中无法解析的内部引用。
_Avoid_: 自动跨来源修复

**内容引用**：带位置范围和持久显示快照的同源 Wikilink。
_Avoid_: 跨来源内容块 identity

**嵌入（Embed）**：宿主页面内只读展示目标页面或章节的同源引用。
_Avoid_: 在宿主中直接编辑源页面

**Frontmatter 投影**：对同一 Markdown buffer 顶部 YAML 的保真可视化编辑层。
_Avoid_: 丢弃未知键、重排原文

**标签（Tag）**：从 Frontmatter 或正文安全抽取、保存后进入来源分区索引的值。
_Avoid_: 未保存标签进入 Server 查询

**页面任务（Page Task）**：当前 Markdown 页面内的标准 `[ ]`/`[x]` 列表项。
_Avoid_: V1 高级任务数据库

**知识语义 IR**：跨 Renderer/Server 共享的文本范围、token 与规范化结果。
_Avoid_: 把 CM6 syntax tree 作为 Server 契约

## 索引与查询

**来源分区索引**：只包含单一来源已保存磁盘内容的可重建派生存储。
_Avoid_: 跨来源共享数据库事实

**超级搜索（Super Search）**：同时查询当前来源集合、按来源分组并在组内排序的入口。
_Avoid_: 用全局排名隐藏来源归属

**索引 Generation**：单一来源某一完整 schema/extractor 版本的 SQLite 索引实例。
_Avoid_: 原地跨版本迁移当前索引

**索引 Manifest**：以原子替换方式指向当前可查询 generation 的 Server 内部 `current.json`。
_Avoid_: 直接 rename 仍打开 WAL 的数据库

**搜索折叠文本（foldSearchText）**：仅为搜索匹配生成的 NFC 加 locale-neutral lowercase 派生文本；不移除变音符，也不改变真实文件名、地址、正文或展示字符。
_Avoid_: accent folding、路径身份大小写折叠、写回知识文件

## 操作与恢复

**操作计划（Operation Plan）**：提交前包含目标、预期版本、影响项与风险的不可变预览。
_Avoid_: 提交时静默扩大影响范围

**操作提交（Operation Commit）**：使用 plan id 和 expected versions 执行复合操作的请求。
_Avoid_: 无 plan 的复合 mutation

**OperationCorrelationId**：把 commit、ResourceEvent、watcher 和诊断摘要关联起来的标识。
_Avoid_: 用绝对路径或正文做关联键

**Checkpoint**：复合操作或编辑会话在失败恢复前保存的可验证恢复点。
_Avoid_: 把普通未保存输入长期写入 journal

**结构化批次结果**：逐项记录成功、失败、跳过和回滚状态的公开结果。
_Avoid_: 用单个 boolean 隐藏部分完成

**同源重构**：同一来源内 rename/move 的单一用户操作；持久事务边界包含主资源与已计划的同源链接文件，派生投影在提交后幂等收敛。
_Avoid_: 跨来源移动、把索引瞬时更新纳入文件事务

**跨来源复制**：把正文或字节原样复制到另一来源，不重写副本内部链接。
_Avoid_: 复制后删除源、自动改写正文

**工作区回收站**：每来源根级 `.trash/` 中由批次 manifest 管理的可恢复区域。
_Avoid_: 普通资源树节点、永久删除入口

**系统废纸篓**：由操作系统提供的最终可恢复删除能力。
_Avoid_: 系统废纸篓失败时回退永久删除

**Operation Journal**：复合 mutation 的持久 intent、步骤 outcome、checkpoint 引用与恢复状态；不保存正文或绝对路径。
_Avoid_: 仅内存操作记录

**恢复屏障（Recovery Barrier）**：Server 暴露 Knowledge mutation route 前必须完成的未决 operation 扫描与恢复阶段。
_Avoid_: 未恢复时继续接受相关来源写入

**文件事实事务边界**：复合 mutation 中必须一起成功或一起回滚的主资源和已计划用户文件写入；`COMMITTED` 后的 session、事件与索引更新是可重试投影。
_Avoid_: 宣称跨 Renderer、事件与 SQLite 的全局物理原子

**跨 Provider Transfer**：经 ResourceIO 在两个已授权 provider scope 之间以有界流、目录 staging 和原子发布完成的字节复制。
_Avoid_: Renderer 中转、全文件入内存、跟随 symlink、半目录发布

## 组合、安全与原生能力

**内容门禁（Content Gate）**：在编辑、预览、渲染或索引前根据类型、编码、大小和安全策略做出的判定。
_Avoid_: 读取完整内容后才检查大小

**Open composition**：不依赖闭源产品模块的共享 Server 组合根。
_Avoid_: 从 Open 动态导入 Full 实现

**Full composition**：在 Open 共享能力上注入 Desk 等完整产品能力的组合根。
_Avoid_: 改写共享 DTO 语义

**兼容 facade**：保留旧 URL/DTO 含义并把调用迁移到新共享契约的适配层。
_Avoid_: 永久并行实现

**恶意工作区**：用于验证越界、主动内容、别名、TOCTOU 和资源耗尽防护的测试数据集。
_Avoid_: 仅用字符串 mock 代替真实文件系统边界

**可审计适配**：记录第三方来源、哈希、许可义务、采用方式与目标实现的复用方式。
_Avoid_: 无 provenance 的复制或实质改写

**NativeResourceGrant**：绑定 owner、window、action、`KnowledgeResourceAddress` 和 version 的 60 秒单次 Electron 原生操作授权。
_Avoid_: 长期、多次或跨窗口授权

**原生能力矩阵**：当前客户端对 picker、系统剪贴板、默认应用、文件定位和系统废纸篓的明确可用性集合。
_Avoid_: 在不支持客户端伪造成功

**Native Bridge Credential**：Desktop-owned Server 每次启动生成、仅在 Electron Main 与本地 Server 之间使用的 Main-only 凭据。
_Avoid_: Renderer 可见 token、IPC getter、用长期凭据替代单次 grant

**认证 Principal**：由 Server 已认证 Hono context 提供的 owner/user/studio 身份；公共 body 中同名或近似身份字段必须拒绝。
_Avoid_: 信任客户端提交的 principal、ownerId、userId、studioId

**多 Renderer Context 隔离**：Server、session、订阅、异步投影和 native grant 对现有多个 Renderer context 保持 owner/window 隔离。
_Avoid_: 无 owner/window 的全局 session 单例、V1 新增浮动知识窗口

**Server 内部系统命名空间**：`<HANA_HOME>/knowledge-workspace/` 下的索引、journal、source binding 和证据目录，不属于用户来源或知识内容。
_Avoid_: 将派生目录放入来源根并被 watcher/index 消费

## 交付治理

**Primary Requirement Owner**：对一条 `KW-US-*` 的实现与自动化验收负唯一责任的 ticket；最终发布 ticket 不能担任。
_Avoid_: 多个 primary owner、无人唯一负责

**Acceptance Evidence**：把 Requirement ID、owner ticket、实际测试命令、测试路径、平台和结果连接起来的发布证据。
_Avoid_: 无命令、无平台或未执行却标记通过

**Implementation Preflight**：实现前对 Git、Node、package、关键接缝、依赖和 SilverBullet hashes 的可执行检查。
_Avoid_: 只验证文档链接后直接编码
