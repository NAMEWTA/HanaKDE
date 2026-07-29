# OpenHanako 知识工作区实施交接 31

## 已关闭

- Tickets 01–31 已关闭，共 31/57；M2/P1/P2 Markdown 阶段完成 9/17。
- Ticket 31 主线实现提交为 `b99576ce`。
- inactive GFM table 现在是整块静态派生 preview；任意 header/delimiter/body selection 或 caret 都恢复同一 Markdown 源码，Source 模式始终是源码。
- GFM `:---`、`:---:`、`---:`、`---` 分别派生 left/center/right/default；不重排、不回写，也没有 contentEditable cell、spreadsheet model 或 toolbar。
- 表格 widget 提供五语言 ARIA、focus、指针、Enter/Space 源码入口，激活只改变 selection，不写文档或 history。
- inactive 普通 fenced code 隐藏 fence、保留静态 body 与已知语言高亮；未知/无语言为纯 monospaced text，任意 block 位置进入时整块源码显露。
- JavaScript、Lua、query、template 与未知围栏都无执行、复制、输出、行号或 toolbar；Mermaid 继续由专用字段拥有。
- 普通 code 长行只做响应式视觉 soft wrap；resize 不增加源码行、transaction 或 undo history。
- 非法表格、错配/未闭合 fence 保持源码；新字段不创建 observer，EditorView 销毁会清理自身 observer。
- 精确测试 2 files、25/25；相关定向 5 files、74/74；产品范围全仓 1041 files passed、1 skipped，10506 tests passed、6 skipped。
- typecheck、boundary、目标 ESLint、diff check 与 Renderer production build 通过；本票 Playwright 不适用。

## M2 当前状态

- Ticket 32 在已有全局 `EditorView.lineWrapping` 基线上交付冻结的 per-view wrap 状态与编辑器状态栏，不应重复发明 code-block 专用持久化。
- Ticket 33 可复用 Ticket 31 的普通 fence 分流边界；Mermaid 仍是专用静态 renderer，不能进入普通代码执行或 toolbar 路径。
- Ticket 34 之后的脚注/HTML/查找/Wikilink completion/embed 尚未开始。

## 下一步

1. 实施 Ticket 32：软换行与编辑器状态栏。
2. 实施 Ticket 33：Mermaid 与数学静态渲染。
3. 实施 Ticket 34：脚注定义、预览与补全。

## 保护边界

- 表格只有整块源码与静态派生 preview；不得恢复 contentEditable cell、cell navigation、toolbar、自动增删列或 Markdown 重排。
- 普通 code fence 永不执行；不得新增 run/copy/output/line-number toolbar，Lua/query/template 只作为静态文本。
- 未知语言必须安全退化；Mermaid 必须继续由专用字段拥有，不能双重装饰。
- visual wrap 不能修改 Markdown、建立 history 或依赖容器 observer；Source/Live Preview 切换不能写入文档。
- 用户的 `.gitignore` 以及 ignored `temp/**`、`teach/**` 内容不属于本 change，不能随 ticket 提交。
- 只有 Lead 操作 Git；不覆盖用户修改。
