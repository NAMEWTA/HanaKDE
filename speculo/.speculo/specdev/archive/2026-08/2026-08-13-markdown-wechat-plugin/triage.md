---
schema_version: 1
artifact: triage
change: 2026-08-13-markdown-wechat-plugin
mode: intake
source: <Path>{roots.state}/specdev/changes/2026-08-13-markdown-wechat-plugin/source.md</Path>
classification: feature
risk: high
route: specdev/tickets
ready_for_implementation: true
external_action: not-applicable
updated_at: 2026-08-25T23:31:09+08:00
---

# Triage: Markdown 公众号排版内置插件

## 当前判定

- **影响：** 新增一个随 HanaKDE 分发、可独立删除的 Markdown 公众号排版工作面；涉及 Page UI、主题渲染、剪贴板、用户资源读写、生成文件交付和可选网络图床，因此需要先锁定外部行为与权限边界。
- **紧急度：** normal
- **当前证据：** 参考项目是无后端 Vue/Vite 应用；Hana 已提供 WebView/iframe Page、`hana.clipboard.writeText()`、ResourceIO、SessionFile 与插件资产路由；内置插件目录为 `<Path>plugins/</Path>`。
- **相关代码/工件：** `<Path>temp/md-wechat/</Path>`、`<Path>skills2set/hana-plugin-creator/SKILL.md</Path>`、`<Path>PLUGIN_SDK.md</Path>`、`<Path>PLUGINS.md</Path>`、`<Path>core/plugin-manager.ts</Path>`。

## 功能落点判定

### 功能本质

该功能消费 Hana 已有的插件 Page/Widget、资源读写、剪贴板和 SessionFile 能力，新增插件私有的 Markdown 文档/主题/排版状态与渲染工作面，产物归用户（富文本剪贴板、HTML/Markdown 文件或显式导出资源）而不是系统共享状态。

### 判据清单

| 判据 | 判定 | 证据 |
|---|---|---|
| 需要修改特权子系统 | 能装进盒子 | 只消费 PluginManager、ResourceIO、剪贴板和 SessionFile；不新增会话、Provider、权限主体或迁移。 |
| 定义被别人依赖的契约原语 | 能装进盒子 | 渲染器、主题和文档模型只服务插件自身，不注册系统级共享服务。 |
| 必须启动即常驻且不可按需激活 | 能装进盒子 | Page 打开或工具调用即可激活；无需在任何会话前常驻。 |
| 可整块删除性 | 能装进盒子 | 删除 `<Path>plugins/markdown-wechat/</Path>` 不应使 HanaKDE 引擎或其它插件失效。 |
| 可用贡献面表达 | 能装进盒子 | Page/Widget、routes、tools、assets 与可选 lifecycle 足以承载功能。 |
| 权限自洽 | 能装进盒子 | `full-access`、`ui.hostCapabilities`、`resource.read/write` 与显式网络声明可覆盖所需能力。 |
| 产物归属 | 能装进盒子 | 文章/导出物是用户可见文件或剪贴板内容，设置和草稿是插件私有数据。 |

### 裁决

**落点：内置插件**。关键反方是富文本复制、资源导入和图床配置可能触及宿主权限，但这些均有现成的 UI host capability、ResourceIO 或网络声明边界，不构成破盒硬门。建议目录为 `<Path>plugins/markdown-wechat/</Path>`；候选形态是 `professional-react/full`，具体贡献面与权限由 G 访谈锁定。

## 未知项

- **可发现事实：** 参考项目实际功能边界、Hana 插件 SDK 的资源/剪贴板/资产接缝、内置插件扫描与构建收录方式已完成初查；实现前仍需核对生产安装依赖与 UI smoke test 方式。
- **需要用户决定：** 无；Page/Widget 下载与 Agent tool SessionFile 的导出边界已由 LOG-012、ADR-006 和 Spec 固化。
- **低影响实现细节：** React 组件拆分、Markdown parser/highlight.js 的具体组织、CSS token 命名、测试文件命名和内部模块边界由实现者遵循仓库惯例决定。

## 路由

- **下一 Work：** `<Path>{roots.workflows}/specdev/T-tickets/T-tickets.md</Path>`
- **理由：** 导出交付冲突已通过用户选择 B 修订并验证 Spec；下一步拆分可独立验证的垂直执行切片。

## 外部动作

- **远程目标：** 无
- **关闭能力：** not-applicable
- **当前状态：** not-applicable
- **授权记录：** 无
- **尝试与结果：** 仅执行了只读 Git clone；未写入远程系统。
