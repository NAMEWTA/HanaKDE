---
schema_version: 3
artifact: spec
change: 2026-08-13-markdown-wechat-plugin
status: ready
ready_for_tickets: true
sources:
  - USER-DECISION:2026-08-13-core-closure
  - USER-DECISION:2026-08-13-page-widget-pure-output
  - USER-DECISION:2026-08-13-private-persistence-resource-io
  - USER-DECISION:2026-08-13-local-media-no-migration
  - ADR-001
  - ADR-002
  - ADR-003
  - ADR-004
  - ADR-005
  - ADR-006
  - CODE:<Path>temp/md-wechat/</Path>
  - CODE:<Path>examples/plugins/sdk-showcase/</Path>
  - CODE:<Path>packages/plugin-sdk/src/index.ts</Path>
  - CODE:<Path>core/plugin-manager.ts</Path>
---

# Spec: Markdown 公众号排版内置插件

- **Spec：** `<Path>{roots.state}/specdev/changes/2026-08-13-markdown-wechat-plugin/spec.md</Path>`
- **当前 ADR：** `<Path>{roots.state}/specdev/changes/2026-08-13-markdown-wechat-plugin/ADR.md</Path>`
- **当前领域上下文：** `<Path>{roots.state}/specdev/changes/2026-08-13-markdown-wechat-plugin/CONTEXT.md</Path>`

## 1. 问题与目标

### 问题陈述

HanaKDE 当前没有一个面向公众号作者的内置 Markdown 排版工作面。用户需要在外部工具中编辑 Markdown、反复调整公众号样式、复制结果，再手动管理文章文件；这使排版预览、主题设置、导入导出和 Hana 资源权限彼此割裂。参考项目 `<Path>temp/md-wechat/</Path>` 证明了核心交互可行，但它是独立的 Vue/Vite 浏览器应用，不能直接成为 Hana 插件的运行时合同。

### 目标用户与场景

- **公众号作者：** 在 Hana 的 Page 中编辑 Markdown，实时查看公众号样式，调整主题/字体后复制富文本到公众号后台。
- **内容编辑者：** 从用户资源导入 `.md`/`.markdown`/`.txt` 文档，通过浏览器下载 Markdown 或 HTML，必要时显式写回工作区。
- **Agent 调用者：** 给定 Markdown 字符串或 ResourceRef，获取排版后的 HTML 和 SessionFile 产物，不让 Agent 默认修改用户工作区。
- **侧栏使用者：** 从 Widget 查看插件入口或轻量最近文档信息，进入 Page 继续编辑；Widget 不维护第二份编辑状态。

### 成功标准

1. 内置插件从 `<Path>plugins/markdown-wechat/</Path>` 被 PluginManager 发现并加载，声明的 Page 与 Widget route 均可打开；删除该目录后 HanaKDE 仍可构建和启动。
2. Page 提供稳定的 Markdown 编辑、实时公众号预览、主题/字号/字体调整、核心 Markdown 语法渲染和响应式布局；Widget 只提供辅助入口并与 Page 共享插件私有数据。
3. 用户可以在明确的用户手势下复制 HTML+plain text 剪贴板 payload；公众号富文本复制失败时显示失败状态，不把纯文本降级冒充为成功。
4. 文档、主题、编辑器设置和草稿在插件私有数据中恢复；导入、Page/Widget 下载和工作区写回遵守 ResourceIO/插件私有数据边界，Agent tool 继续遵守 SessionFile 边界。
5. Agent 纯产出工具能读取 Markdown 字符串或 ResourceRef，返回可观察的渲染 HTML，并在有 session 上下文时交付 SessionFile；不直接覆盖用户工作区。

### 非目标

- 团队协作、共享文档、多文档工作区、回收站、复杂历史版本和第三方图床。
- 自动迁移参考项目的 localStorage、IndexedDB、SQLite、媒体缓存、设置或 metadata。
- 新增 Hana 系统级编辑器、渲染器、权限、调度器或跨插件共享文档契约。
- 通过系统内部路径、`file://`、`MEDIA:` 或未经授权的 raw `fs` 访问交付或修改用户资源。
- 在首版追求参考项目全部 26 套主题的像素级复刻；主题覆盖以关键行为和视觉回归为准。

## 2. 解决方案与外部行为

### 解决方案摘要

新增一个 `markdown-wechat` 内置 full-access 插件。插件以 Page + Widget 贡献面提供工作台和入口，以插件私有数据保存 active document/settings，以 routes 处理 Page/Widget shell 与私有数据读写，以 `tools/` 提供 Agent 纯产出渲染工具，以 `assets/` 承载打包后的 UI 资源。Page/Widget 导出通过浏览器下载，Agent tool 在有 session context 时交付 SessionFile。插件只消费 PluginManager、ResourceIO、SessionFile（仅 Agent tool）、Page/Widget host 和剪贴板接缝，不修改系统本体。

Markdown 渲染核心复用仓库已有的 `markdown-it`、CodeMirror Markdown 相关依赖与现有测试惯例；参考项目的主题/渲染行为和测试意图可以选择性重建，但不得整体复制其浏览器存储、图床网络或旧适配器。富文本复制使用 iframe 用户手势触发的 `ClipboardItem` HTML+plain text 写入；`hana.clipboard.writeText` 用于纯文本/降级路径和 capability 诊断。目标运行环境为 Hana 桌面 Chromium iframe，若 ClipboardItem 与回退均不可用，操作必须失败可见。

### 主要流程

#### Page 打开与编辑

1. 用户打开 Page，插件 route 返回带 `hana-theme`/`hana-css` 处理的 shell，加载 `assets/` 中的 UI bundle。
2. UI 调用 `hana.ready()`，读取插件私有 active document/settings；没有可恢复数据时创建空 Markdown 草稿。
3. 用户编辑 Markdown；编辑器状态标记为 dirty，渲染器同步生成公众号风格 HTML 预览，主题、字号和字体设置立即影响预览。
4. 私有持久化写入采用版本化 envelope；写入失败保留内存草稿并显示可恢复错误，不丢弃用户正在编辑的内容。

#### 主题与预览

1. 用户选择主题或调整字号/字体；Page 预览更新，未保存设置不改变 Markdown 源文。
2. 页面支持桌面宽度和窄窗口；编辑区、预览区、工具栏和状态提示不得重叠或因文本长度改变固定工具尺寸。
3. 核心语法至少包括标题、段落、强调、删除线、链接、列表、嵌套引用、代码块、表格、分割线、图片和视频占位；不支持或危险的 HTML 输入以安全、可解释的降级结果呈现。

#### 富文本复制

1. 用户在 Page 点击“复制排版”按钮，操作必须发生在用户手势上下文。
2. 插件生成已清理预览元数据的 HTML，并同时准备 `text/html` 与 `text/plain` 两种剪贴板表示；本地媒体按 v1 规则保留可访问预览或显式占位。
3. 目标环境支持 `ClipboardItem` 时写入 HTML+plain text；不支持时使用同一 iframe 内的 contenteditable/selection 回退。
4. 成功只在写入调用成功后反馈；浏览器权限拒绝、API 不可用或回退失败时显示失败状态，并提供复制 Markdown/导出 HTML 的替代动作。
5. “复制源码”始终是显式的纯文本动作，不与富文本复制混淆。

#### 导入、导出与写回

1. 用户点击导入，Page 通过 `hana.resources.pick({ mode: 'file', multiple: false, capability: 'resource.read' })` 选择一个资源。
2. 插件 route/tool 使用 `ctx.resources.read(ref)` 读取内容；只接受 Markdown 文本类输入，无法读取或内容不是可处理文本时显示失败，不覆盖当前草稿。
3. 导入成功后，内容进入插件私有 active document；原草稿是否替换由用户动作明确触发，不能因 Widget 或后台恢复隐式覆盖。
4. 用户导出 Markdown 或 HTML；Page/Widget 在 iframe 内生成对应内容，通过 Blob/浏览器下载交付，使用稳定文件名和格式；不注册 SessionFile、不写用户工作区。
5. 用户若要写回工作区，必须另行选择目标资源并通过 `ctx.resources.write`/`writeExpectedVersion` 执行；版本冲突、权限拒绝或目标不可写时保持源草稿和目标文件不变，显示可恢复失败。

#### Widget 与 Agent tool

1. Widget 显示插件入口、当前 active document 的有限摘要或“打开排版工作台”动作；它通过同一插件 route 读取私有数据，不复制编辑器状态。
2. Agent 工具接受以下两种输入之一：Markdown 字符串，或 ResourceRef。两者同时提供、均缺失或 ResourceRef 无法读取时失败并返回可诊断文本。
3. 工具使用同一渲染核心生成 HTML；返回结构化文本摘要和 HTML 结果，若调用上下文有 `sessionId`/`sessionRef` 且可用 `stageFile()`，再交付 HTML SessionFile。
4. 工具是 `plugin_output`/reviewer-bound 的纯产出动作；不得写用户工作区、上传第三方服务或读取宿主绝对路径。

### 边界、失败与稳定错误行为

| 失败类别 | 触发 | 外部行为 | 不变量 |
|---|---|---|---|
| 输入无效 | Markdown/ResourceRef 缺失、同时提供或不可读 | 返回清晰的输入失败文本；当前文档不变 | 不产生部分导出物，不覆盖草稿 |
| 资源拒绝 | `resource.pick/read/write` 被拒绝或目标不可写 | Page/Agent 显示权限/资源失败；保留源内容 | 不绕过 ResourceIO，不使用绝对路径 |
| 持久化失败 | 私有 envelope 读写、版本校验或数据损坏 | 保留内存草稿，显示恢复/重试入口 | 不静默丢稿，不把损坏数据当成功读取 |
| 渲染失败 | parser/highlight/主题输入异常 | 预览显示安全降级或错误状态，源文可继续编辑 | 不注入未清理 HTML，不阻断导出错误解释 |
| 剪贴板失败 | ClipboardItem、selection 回退或 `writeText` 均失败 | 不报告复制成功；提供源码复制/HTML 导出替代 | 不把纯文本当公众号富文本成功 |
| 导出失败 | Blob/浏览器下载不可用，或 Agent SessionFile 注册失败 | Page/Widget 显示下载失败并保留源码/复制替代；Agent 返回导出失败 | 不写用户工作区，不伪造 SessionFile、`file://` 或 `MEDIA:` |
| 写回冲突 | `writeExpectedVersion` 版本不匹配 | 保留草稿和目标文件，要求用户重新选择/确认 | 不静默覆盖用户变更 |
| 不支持能力 | 第三方图床、旧数据库迁移或未支持 Markdown 扩展 | 明确告知不在 v1 范围；保留源文 | 不发网络请求、不扫描旧浏览器数据库 |

### 状态转换与不变量

```text
absent -> loading -> ready
ready --edit--> dirty --private-save-success--> saved
ready/saved/dirty --import-success--> dirty
ready/saved/dirty --copy/export--> ready/saved/dirty
任何状态 --recoverable-failure--> same state + visible error
```

- Page 与 Widget 读取同一个插件私有 document/settings envelope；Widget 不得写入另一套状态。
- private document、settings 和 schema envelope 是插件自有数据，不是 ResourceRef。
- 导入是显式事件；导入成功才替换 active document，失败不改变现有草稿。
- 导出/复制是产出动作，不改变 Markdown 源文或主题设置。
- 用户工作区写回必须携带 ResourceIO 身份和适用版本；冲突 fail closed。
- v1 不创建网络上传任务，不访问旧浏览器数据库，不声明新的系统 capability。

## 3. 用户故事

- **US-001**：作为公众号作者，我希望在 Page 中编辑 Markdown 并实时看到公众号样式预览，以便在复制前确认层级、强调、代码、表格和引用的视觉结果。
- **US-002**：作为公众号作者，我希望切换主题、字号和字体，并在桌面与窄窗口使用稳定的编辑/预览布局，以便适配不同文章风格和工作区尺寸。
- **US-003**：作为公众号作者，我希望一键复制带 HTML 样式的排版结果，以便直接粘贴到公众号后台；复制失败时我需要明确知道失败，并可选择复制源码或导出 HTML。
- **US-004**：作为内容编辑者，我希望通过资源选择器导入 Markdown，并从 Page/Widget 下载 Markdown/HTML，以便在不隐式改写工作区的情况下继续处理或分享文章。
- **US-005**：作为内容编辑者，我希望插件重启后恢复草稿、主题和设置，以便 Page 与 Widget 不依赖浏览器 iframe 存储继续工作。
- **US-006**：作为侧栏使用者，我希望 Widget 能打开排版工作台并显示有限的当前文档信息，以便快速回到上次工作位置而不维护第二套编辑器。
- **US-007**：作为 Agent 调用者，我希望给定 Markdown 或 ResourceRef 获得公众号 HTML 和可选 SessionFile，以便生成排版产物而不直接写入用户工作区。
- **US-008**：作为安全敏感的用户，我希望 v1 不上传图床、不迁移旧浏览器数据库，且资源拒绝/版本冲突不会被绕过，以便保持数据和凭据边界可解释。

## 4. 验收合同

| ID | 前置条件 | 动作或事件 | 可观察结果 | 验证接缝 |
|---|---|---|---|---|
| AC-001 | Hana PluginManager 扫描内置目录 | 加载 `markdown-wechat` | 插件状态为 loaded，manifest 含 hidden/full-access、Page、Widget，且无未解析 route/asset 错误 | PluginManager fixture/diagnostics；`<Path>core/plugin-manager.ts</Path>` |
| AC-002 | 插件已加载 | 打开 Page route 和 Widget route | 两个 surface 均完成 `hana.ready()`；Page 显示编辑/预览工作台，Widget 显示辅助入口；两者使用同一插件数据 | Plugin UI route integration + Playwright surface smoke；`<Path>examples/plugins/sdk-showcase/routes/page.js</Path>` |
| AC-003 | Page 已 ready | 输入标题、段落、强调、删除线、列表、嵌套引用、代码、表格、分割线、链接、图片和视频标记 | 预览实时更新为安全、公众号风格 HTML；核心结构和文本可观察，未知/危险 HTML 安全降级 | renderer contract tests；参考 `<Path>temp/md-wechat/tests/renderer.test.js</Path>` |
| AC-004 | Page 已 ready | 切换主题、字号和字体，在桌面/窄窗口查看 | 预览样式更新且源文不变；布局无重叠、工具尺寸稳定、Widget 不出现第二编辑器 | UI component/Playwright visual and accessibility smoke |
| AC-005 | Page 已 ready，浏览器允许用户手势剪贴板 | 点击复制排版 | `text/html` 与 `text/plain` 同时写入；成功提示只在写入成功后出现，HTML 保留公众号样式和清理后的媒体引用 | browser ClipboardItem/selection integration; `<Path>temp/md-wechat/src/lib/clipboard.js</Path>` |
| AC-006 | ClipboardItem 不可用或权限拒绝 | 点击复制排版 | 尝试回退；回退失败时不报告成功，并提供复制源码和导出 HTML 入口 | browser failure injection + UI state test |
| AC-007 | Page 已 ready，存在可读 Markdown Resource | 通过 resource picker 选择并导入 | route/tool 经 `ctx.resources.read` 读取，成功替换 active document 并标记 dirty；拒绝/不可读时旧草稿保持不变 | ResourceIO integration with read-denied fixture |
| AC-008 | Page/Widget 已 ready | 导出 Markdown 和 HTML | 浏览器下载对应格式的文件，文件名和 MIME 正确；不注册 SessionFile、不写工作区 | Playwright download smoke + browser download failure injection |
| AC-009 | 存在可访问或不可访问的本地图片/视频引用 | 预览或复制排版 | 可访问媒体有预览/复制占位，不可访问媒体显示可解释占位并保留源文；不发生上传 | resource/media renderer tests + no-network scan |
| AC-010 | 用户选择了可写目标及当前版本 | 显式执行工作区写回 | `ctx.resources.writeExpectedVersion` 成功才替换目标；冲突/拒绝时目标不变、草稿保留、错误可见 | ResourceIO write/conflict integration |
| AC-011 | Page 已加载且私有数据不存在 | 编辑并触发私有保存后重启/重载 Page 和 Widget | 文档、主题、字体、字号从同一版本化 private envelope 恢复；损坏/版本不支持时显示恢复错误而不伪造成功 | plugin data store tests + reload smoke |
| AC-012 | Widget 已打开 | 查看摘要并点击打开工作台 | Widget 只读同一 active document 摘要并导航 Page；不产生第二份文档或设置 | Page/Widget shared-store integration |
| AC-013 | Agent 有 session 上下文 | 调用纯产出排版工具并传 Markdown 字符串 | 返回渲染 HTML 文本及 HTML SessionFile；工具权限显示 plugin_output/reviewer-bound 语义 | plugin tool invocation fixture；参考 `<Path>examples/plugins/sdk-showcase/tools/create-note.js</Path>` |
| AC-014 | Agent 传入单个 ResourceRef | 调用纯产出排版工具 | 工具经 `ctx.resources.read` 获取 Markdown 并返回同等 HTML；不得接受或解析宿主绝对路径 | ResourceIO/tool integration |
| AC-015 | Agent 同时省略或同时提供 Markdown 与 ResourceRef | 调用工具 | 返回输入失败；不写文件、不创建 SessionFile、不修改 private document | tool invalid-input tests |
| AC-016 | 插件 manifest 与源码已构建 | 扫描 v1 产品代码 | 不存在 `network.fetch`、SM.MS/GitHub/custom host、旧 localStorage/IndexedDB/SQLite migration、iframe 第三方 fetch 或自定义静态资源 route | static policy scan + manifest test |
| AC-017 | 插件目录存在 | 从构建临时副本删除 `<Path>plugins/markdown-wechat/</Path>` | HanaKDE 构建/启动仍成功，其它插件不出现 unresolved import | isolated removal smoke + build command |
| AC-018 | 已加载插件且服务可诊断 | 打开插件诊断/运行 dev scenario | diagnostics 显示 Page、Widget、tools、routes、activation 和失败类别；scenario 至少覆盖 open-page 与纯产出 tool | plugin dev diagnostics/scenario; `<Path>PLUGINS.md</Path>` |

## 5. 范围

### IN

- `<Path>plugins/markdown-wechat/</Path>` 内置插件及其 manifest、Page/Widget routes、React/Vite assets、Markdown renderer、主题/字体设置、private data envelope、ResourceIO 适配、浏览器下载、纯产出 tool 和插件内测试。
- 核心 Markdown 语法、公众号预览、HTML+plain text 复制、Markdown 导入、Page/Widget Markdown/HTML 浏览器下载、Agent tool HTML SessionFile 产出、显式工作区写回。
- 本地图片/视频预览或复制占位；不可访问媒体的安全降级。
- PluginManager/Plugin Dev Loop 可观察的加载、诊断、surface 和 scenario 验证。

### REUSE

- Hana 的 PluginManager、Page/Widget route registry、asset serving、`hana.ready()`、`hana.assets.url()`、`hana.api.fetch()`、`hana.resources.pick()` 和 `hana.clipboard.writeText()`。
- `ctx.resources` 的 read/writeExpectedVersion 接口与 `toolCtx.stageFile()`/SessionFile media details。
- 仓库已有 `markdown-it`、CodeMirror Markdown、React/Vite、TypeScript、Vitest/Playwright 依赖和测试命令。
- 参考项目 `<Path>temp/md-wechat/</Path>` 的渲染行为、主题设计和测试意图；不复用其浏览器存储或图床实现。

### OUT

- **OOS-001**：第三方图床、网络媒体托管、token/schema/allowedHosts 配置；原因：v1 不声明 `network.fetch`。
- **OOS-002**：参考项目 localStorage/IndexedDB/SQLite、设置、媒体缓存和 metadata 自动迁移；原因：无稳定格式和真实迁移样本。
- **OOS-003**：多文档管理、回收站、复杂版本历史和跨设备同步；原因：超出核心闭环。
- **OOS-004**：系统本体编辑器/渲染器/权限/调度器或跨插件共享数据契约；原因：插件必须可删除并只消费现有宿主能力。
- **OOS-005**：Agent 直接创建/覆盖用户工作区文件、读取宿主绝对路径或绕过 ResourceIO；原因：数据安全和权限边界。
- **OOS-006**：像素级复刻参考项目全部主题；原因：首版硬门优先是宿主接缝和核心行为，主题以关键覆盖逐步补齐。

## 6. 已锁定实现约束

- **DEC-001**：插件落点固定为 `<Path>plugins/markdown-wechat/</Path>`，manifest 必须作为内置 hidden full-access 插件被扫描；来源：`ADR-001`。
- **DEC-002**：Page + Widget 是唯一 UI 贡献面；Page 是完整工作台，Widget 不维护第二套编辑器状态；来源：`LOG-004`、`ADR-001`。
- **DEC-003**：文档、设置、主题和草稿使用插件私有 versioned envelope；不得以 iframe localStorage/IndexedDB 或用户工作区作为唯一权威；来源：`ADR-002`。
- **DEC-004**：导入使用 `resource.pick` + `ctx.resources.read`；Page/Widget 导出使用浏览器下载；Agent tool 在有 session context 时使用 `stageFile()` SessionFile；工作区写回必须显式选择并使用 ResourceIO 版本写入；来源：`ADR-003`、`ADR-006`。
- **DEC-005**：Agent tool 只读/纯产出，接受 Markdown 或 ResourceRef，不能直接修改用户工作区；来源：`LOG-005`、`ADR-003`。
- **DEC-006**：v1 不声明 `network.fetch`，不访问第三方图床，不迁移旧浏览器数据库；来源：`ADR-004`、`ADR-005`。
- **DEC-007**：富文本复制必须在用户手势下生成 HTML+plain text；优先使用 ClipboardItem，失败时使用 contenteditable/selection 回退；`hana.clipboard.writeText` 仅用于纯文本/降级路径；两者都失败不得报告成功。来源：`LOG-010`、CODE:<Path>temp/md-wechat/src/lib/clipboard.js</Path>、CODE:<Path>desktop/src/react/plugin-ui/capabilities.ts</Path>。
- **DEC-008**：产品实现与测试只写 `<Path>plugins/markdown-wechat/**</Path>`；宿主、根构建脚本、公共测试和其它插件只读，除非后续上游偏差重新授权。来源：`ADR-001`、SpecDev path ownership rules。

## 7. 数据、接口与兼容

- **公共接口变化：** 不新增系统本体接口；插件新增 namespaced tool（候选名 `markdown_wechat_render`，最终名称必须遵守 PluginManager namespacing）、Page `/page`、Widget `/widget` 和插件私有 route 接口。
- **数据模型与持久化：** 插件私有 versioned envelope，至少包含 active Markdown document、theme、font、fontSize、schema version 和 dirty/save metadata；不属于 ResourceIO workspace resource。
- **资源接口：** Page 使用 `resource.pick` host capability；服务端读取使用 `ctx.resources.read`；显式写回使用 `ctx.resources.writeExpectedVersion`；Agent 输入使用 ResourceRef，不接受新增的宿主绝对路径参数。
- **产物接口：** Page/Widget 导出通过浏览器下载交付 Markdown/HTML，不返回 SessionFile identity；Agent tool 在有 session context 时使用 `toolCtx.stageFile()` 生成 HTML SessionFile media details，无 session 时只返回 HTML 文本和明确状态；不得以 `file://`、`MEDIA:` 或裸路径冒充文件身份。
- **剪贴板接口：** UI manifest 声明 `clipboard.writeText` 供纯文本/降级路径使用；富文本使用目标桌面 Chromium iframe 的 ClipboardItem/selection adapter，需通过浏览器 smoke 验证。
- **兼容要求：** Hana 桌面 Chromium、Page/Widget host capability registry、PluginManager source priority 和现有 SDK public protocol；未知插件 manifest 字段由宿主忽略。
- **迁移要求：** 不迁移参考项目浏览器数据库；显式 Markdown 文件导入是 v1 文章迁移路径；未来 JSON importer 必须另建 change。
- **发布或运维影响：** 内置插件随 Hana server runtime 通过 `<Path>plugins/</Path>` 扫描；构建需包含 plugin assets 和可解析运行时依赖；dev loop 使用 `plugin.dev.install/reload/diagnostics/scenario`，正式安装前做删除 smoke。

## 8. 非功能要求

- **NFR-001 安全与隐私：** iframe 不直连第三方 API；manifest 不声明 `network.fetch`；不保存图床 token；用户资源只经 ResourceIO；输入 HTML/Markdown 在预览和复制前清理危险内容；Agent 工具不得写工作区。
- **NFR-002 性能与容量：** 编辑输入使用稳定编辑器状态和增量/可取消渲染策略，避免每次按键创建不可控的历史副本；私有 envelope 写入应可合并/防抖；大媒体不得被 base64 无限复制到内存。具体阈值由实现测试和目标桌面基线测量，不在 Spec 中虚构。
- **NFR-003 可用性与可靠性：** Page/Widget 遵循 Hana theme；关键按钮有清晰 label/tooltip 和键盘路径；桌面与窄窗口无重叠；失败保留草稿并提供恢复动作；Widget 不制造第二状态。
- **NFR-004 可观测性与运营：** PluginManager diagnostics 能看到加载、surface、routes、tools、activation 和错误类别；关键失败写入插件 log 的脱敏摘要；dev scenarios 可重复运行，不依赖第三方网络或旧用户数据。

## 9. 验证策略

| 接缝 | 层级 | 覆盖合同 | 现有先例或命令 | Evidence 类型 |
|---|---|---|---|---|
| Markdown renderer interface | 稳定单元 | AC-003、AC-004、AC-009 | 参考 `<Path>temp/md-wechat/tests/renderer.test.js</Path>`；插件内 Vitest tests | unit test output + rendered HTML assertions |
| Clipboard adapter | 浏览器集成 | AC-005、AC-006 | `<Path>temp/md-wechat/src/lib/clipboard.js</Path>` 的 ClipboardItem/selection 先例；Playwright Chromium user-gesture smoke | browser test + permission/API failure evidence |
| ResourceIO import/write | 插件 route/tool 集成 | AC-007、AC-010、AC-014 | `<Path>PLUGIN_SDK.md</Path>` ResourceIO；测试 ResourceRef/read-denied/conflict adapter | integration test result |
| Private data envelope | 插件持久化集成 | AC-011、AC-012 | Plugin lifecycle/dataDir fixture；Page/Widget reload test | store/reload test result |
| Browser download output | Page/Widget 浏览器集成 | AC-008 | Playwright download smoke；browser download failure injection | downloaded file metadata + content assertions |
| SessionFile output | Agent tool 集成 | AC-013、AC-015 | `<Path>examples/plugins/sdk-showcase/tools/create-note.js</Path>`；plugin tool invocation fixture | structured tool result + media details |
| Plugin surfaces | PluginManager/UI 集成 | AC-001、AC-002、AC-012、AC-018 | `<Path>examples/plugins/sdk-showcase/manifest.json</Path>`、`<Path>examples/plugins/sdk-showcase/routes/page.js</Path>`；Plugin Dev Loop diagnostics/scenario | diagnostics + Playwright semantic snapshot |
| Policy and removal | 构建/静态验证 | AC-016、AC-017 | `npm run build:server`、`npm run build:client`、`npm run typecheck`、`npm test`；isolated plugin-directory removal smoke | scan/build/test output |

## 10. 风险、假设与未决问题

### 风险

- 桌面 Chromium iframe 的 ClipboardItem 权限或 `execCommand` 回退可能因宿主安全策略失败；通过 AC-005/006 的真实浏览器和故障注入验证，失败必须可见且不虚报。
- 参考项目的主题/渲染细节多于 v1 核心闭环，选择性重建可能导致视觉差异；通过关键语法、主题和窄布局快照控制，不把像素级复刻作为宿主硬门。
- 插件私有 envelope 的损坏或并发写入可能造成草稿恢复问题；通过 schema 版本、原子写入/恢复测试和保留内存草稿缓解。
- `markdown-it`/CodeMirror 现有依赖版本与参考项目不同；通过插件内行为测试锁定外部 HTML，不复制内部实现。

### 已采用的低影响假设

- **假设 A-001：** 当前 Hana 桌面 Chromium 允许用户手势触发 ClipboardItem 或 selection 回退；验证：AC-005/006 浏览器 smoke，失败不影响导出/源码替代路径的可观察性。
- **假设 A-002：** Page 与 Widget route 能在同一 PluginManager entry 下共享 `ctx.dataDir`；验证：AC-011/012 reload integration。
- **假设 A-003：** `stageFile()` 在 Agent tool 有 session 上下文时能登记插件生成的 HTML；验证：AC-013 tool fixture。Page/Widget 不依赖该接缝。
- **假设 A-004：** 现有 `markdown-it`、CodeMirror、React/Vite 和 TypeScript 依赖足够支撑 v1，不需修改根依赖；验证：AC-003/004 与 build/typecheck。

### 未决问题

无。
