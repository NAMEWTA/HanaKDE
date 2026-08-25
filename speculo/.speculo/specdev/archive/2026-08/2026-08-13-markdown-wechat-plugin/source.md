---
schema_version: 1
artifact: source
change: 2026-08-13-markdown-wechat-plugin
source_type: conversation
canonical_locator: null
captured_at: 2026-08-13T11:32:58+08:00
content_sha256: efc4e85201041113ac6c6c70a355a1ef38c6819751d006396d634642b249da58
remote_state: not-applicable
close_capability: not-applicable
---

# Source: Markdown 公众号排版内置插件

## Capture Metadata

- **Capture method:** conversation with referenced GitHub repository and local skill
- **Author:** user
- **Created / updated:** 2026-08-13 / 2026-08-13
- **Labels or classification supplied by source:** 新功能、内置插件、Markdown、公众号排版、SpecDev G-grill-with-docs
- **Attachments:** `<Url>https://github.com/laogou717/md-wechat</Url>`; `<Path>skills2set/hana-plugin-creator/</Path>`
- **Redactions:** none

## Original Content

激活 /Users/wta/Documents/01-Code/myCode/HanaKDE/speculo/workflows/specdev/G-grill-with-docs/G-grill-with-docs.md 请你将 https://github.com/laogou717/md-wechat clone 到/Users/wta/Documents/01-Code/myCode/HanaKDE/temp 然后深度的思考之后，读取 /Users/wta/Documents/01-Code/myCode/HanaKDE/skills2set/hana-plugin-creator 将该功能作为一个内置插件的形式，成为一个 markdown 公众号排版工具，先创建一个新的 change

## Source Comments

- 已将参考仓库克隆到 `<Path>temp/md-wechat/</Path>`。
- 参考仓库固定到提交 `edcfe87d35b1381ad48545d16c608aba44ef52b2`，提交主题为升级 `nanoid` 以修复 CVE-2026-67213。
- 参考项目 README 与源码显示：Vue 3 + Vite；Markdown 实时渲染；26 套主题；字号/字体与自定义 CSS；图片画廊；本地图片 IndexedDB；视频预览与复制占位；代码高亮、表格、嵌套引用、分割线；满屏/手机/桌面预览；多文档、回收站、本地自动保存；Markdown 导入/导出；富文本复制；无后端、浏览器本地存储。
- 当前 Hana 插件文档要求：UI 插件使用 Page/Widget route 与 `full-access`；iframe 资源经 `assets/`；用户资源使用 `ctx.resources`；生成文件使用 `stageFile()`；iframe 不直连第三方 API。
