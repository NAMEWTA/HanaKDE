# OpenHanako 知识工作区实施交接 25

## 已关闭

- Tickets 01–25 已关闭，共 25/57；M2/P1/P2 Markdown 阶段完成 3/17。
- Ticket 25 主线实现提交为 `d3f3b22d`。
- Frontmatter 精确范围只来自 Ticket 11 共享 IR；`js-yaml` 是唯一语义校验器，没有新增 parser、`dump` 或全量序列化。
- 安全投影只接受唯一顶层字符串键和 JSON scalar/一维 scalar array；`title`、`aliases` 没有特殊行为。
- directive/document end、重复键、merge、custom tag、anchor/alias、嵌套 map/sequence、block scalar、timestamp/NaN、无效 YAML 和不确定范围均整区回到源码，原文不修复、不丢弃。
- 修改、添加、删除分别只 patch value range、closer 前插入点和目标字段行；注释、顺序、LF/CRLF/混合序列、未知字段和正文保持。
- `frontmatterField` 已进入 shared Markdown Surface；每个可视编辑恰好一个 transaction，随后立即重新校验。非法输入不改 buffer，复杂化后 widget 退出且源码保留。
- 五语言、键盘原生控件、ARIA/error、focus、亮暗主题与窄布局同步交付。
- 精确测试 1 file、24/24；相关定向 7 files、88/88；产品范围全仓 1033 files passed、1 skipped，10387 tests passed、6 skipped。
- typecheck、boundary、目标 ESLint、diff check 与 Renderer production build 通过；本票 Playwright 不适用。

## M2 当前状态

- Ticket 25 为 Ticket 26 tags 提供安全 Frontmatter 字段投影；Ticket 26 提取 tags 时必须复用相同值边界，不得宽松解析复杂 YAML。
- Ticket 27 可在同一 Surface 上增加 Live Preview/Source 模式开关；Source 模式必须显示当前真实 YAML，不创建另一缓冲区。
- Cover 的既有 nested YAML 属于复杂结构，Frontmatter 属性投影会整区源码回退；既有 cover widget 仍按自己的公开接缝运行，不被属性投影部分解析。

## 下一步

1. 实施 Ticket 26：从安全 Frontmatter `tags` 与共享 IR body tags 建立同页、同来源投影，并交付标准 GFM Page Task toggle。
2. 实施 Ticket 27：单一 buffer 的 Live Preview/Source mode 与局部 syntax reveal。
3. 后续搜索/索引消费者只读取已保存页面并复用本票/共享 IR 语义，不把 UI widget 状态持久化。

## 保护边界

- 不使用 YAML dump、对象全量重写或数据库属性副本；磁盘 Markdown 仍是唯一事实。
- 不对复杂 Frontmatter 投影安全子集；任何阻断条件都使整个属性区回到源码。
- range patch 不移动字段、不整理注释、不统一引号、不排序 key、不擅自规范化 line ending。
- `title`/`aliases` 只是普通属性，不改变文件名页面标题、Wikilink 或 tab label。
- 可视输入只接受 JSON scalar/一维 scalar array；对象、嵌套数组、NaN/Infinity、日期等不得写入。
- 用户的 `.gitignore` 以及 ignored `temp/**`、`teach/**` 内容不属于本 change，不能随 ticket 提交。
- 只有 Lead 操作 Git；不覆盖用户修改。
