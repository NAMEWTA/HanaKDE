# OpenHanako 知识工作区实施交接 32

## 已关闭

- Tickets 01–32 已关闭，共 32/57；M2/P1/P2 Markdown 阶段完成 10/17。
- Ticket 32 主线实现提交为 `972e4fa0`。
- Knowledge Markdown 在 Live Preview 与 Source 中继续使用同一 `EditorView.lineWrapping`、文档、selection 与 history；没有 wrap 开关、固定折行列、硬换行或持久化视觉位置。
- Markdown 最高优先级 keymap 让 `↑/↓`、`Home/End` 与四种 Shift 组合只按真实逻辑行和 UTF-16 源码位置运行；没有视觉行导航状态机。
- Markdown 两种模式均无常驻 line-number gutter。
- 新全局 Knowledge 底栏独立于网络 `StatusBar`，只从活动 `view/session` 投影 selection head 的真实行列和未保存 buffer 的 Unicode code point 总数。
- 活动组/标签切换更新状态；资源树或侧栏聚焦保留最后活动 Markdown；资产与 missing/source-unavailable 保留同高度空栏。
- 底栏跨 workspace 三栏、固定 `1.75rem` 单行；22rem 以下用 container query 整组隐藏，不截断、不换行、不滚动。
- 行起点与 Unicode 字符总数按 buffer 缓存，cursor-only 更新只做二分定位；没有 observer、timer 或新增持久化状态。
- 五语言、只读 `role=status`/ARIA 已交付；没有按钮、菜单、导航或 save/dirty/conflict/offline 文本。
- 精确测试 2 files、11/11；相关定向 8 files、82/82；最终实现提交后产品范围全仓 1043 files passed、1 skipped，10517 tests passed、6 skipped。
- typecheck、boundary、目标 ESLint、diff check 与 Renderer production build 通过；本票 Playwright 不适用。

## M2 当前状态

- Ticket 33 应继续复用 Ticket 31 的普通 fence/Mermaid 分流和 Ticket 32 的纯 visual wrap/真实源码坐标，不把 Mermaid/数学派生渲染引入第二份文档模型。
- Ticket 34 的脚注定义/预览/补全尚未开始。
- Tickets 35–39 的 HTML 安全、查找替换、Wikilink completion、embed 和粘贴尚未开始。

## 下一步

1. 实施 Ticket 33：Mermaid 与数学静态渲染。
2. 实施 Ticket 34：脚注定义、预览与补全。
3. 实施 Ticket 35：安全 HTML 与外部链接。

## 保护边界

- 不得把 Knowledge 状态混入现有网络 `StatusBar`；底栏只投影活动 Knowledge `view/session`，且不显示保存、dirty、冲突或离线状态。
- visual wrap 不能写文档、建立 undo history、持久化视觉行或引入第二套坐标；所有编辑语义继续使用 1-based UTF-16 源码位置。
- 不得恢复 Markdown 常驻行号、wrap toggle、固定折行列或按视觉行导航。
- 资产、不可用与窄宽度必须保留固定单行底栏高度；状态文本只能整组显示或整组隐藏。
- Ticket 33 的 Mermaid/数学只允许安全静态派生；不得执行脚本、开放 HTML 或复用普通 code 的执行/toolbar 路径。
- 用户的 `.gitignore` 以及 ignored `temp/**`、`teach/**` 内容不属于本 change，不能随 ticket 提交。
- 只有 Lead 操作 Git；不覆盖用户修改。
