# OpenHanako 知识工作区实施交接 30

## 已关闭

- Tickets 01–30 已关闭，共 30/57；M2/P1/P2 Markdown 阶段完成 8/17。
- Ticket 30 主线实现提交为 `2f2827f8`。
- 可写 Knowledge Markdown 已交付 Mod-B/I/K/反引号四项基础格式快捷键，selection/caret 明确且每次单 transaction。
- 固定斜杠注册表只有 17 项基础 Markdown 命令，每项仅有固定别名、图标、说明、inline/block、模板和唯一 cursor。
- `/` 在可编辑 Markdown 任意位置触发；连续查询止于首个 Unicode whitespace，Esc/删除触发符/focus 离开均保留正文并关闭。
- 筛选只做 Unicode case-insensitive 名称/别名子串，前缀优先且固定顺序；菜单为五语言单层 listbox，可全键盘和鼠标操作。
- block 模板非行首先换行、行首直接插入；Markdown Link 固定为 `[]()`，所有 17 模板均单步 undo。
- 菜单锚定原 `/` 坐标、上下翻转、限制在当前编辑组；窄分屏不越界。
- 精确测试 2 files、23/23；相关定向 10 files、129/129；产品范围全仓 1039 files passed、1 skipped，10481 tests passed、6 skipped。
- typecheck、boundary、目标 ESLint、diff check 与 Renderer production build 通过；本票 Playwright 不适用。

## M2 当前状态

- Ticket 31 应在同一 CM6 Surface 上交付 GFM table 与普通 fenced code 的源码/预览状态，不把表格加入 Ticket 30 已冻结的斜杠菜单。
- Ticket 31 不得引入电子表格式单元格编辑模型、工具栏或结构化持久层。
- Ticket 32 接续交付软换行与每 view 的状态栏行为。

## 下一步

1. 实施 Ticket 31：表格与代码块编辑预览。
2. 实施 Ticket 32：软换行与编辑器状态栏。
3. 实施 Ticket 33：Mermaid 与数学静态渲染。

## 保护边界

- 不复制 SilverBullet runtime，不引入 Lua、查询、Widget、动态模板或通用命令平台。
- 斜杠命令不读取旧 selection、剪贴板或上下文，不建立多个 Tab 占位点。
- 表格、图片、脚注、数学、Callout、查询、Lua 和 Widget 不进入 V1 初始斜杠菜单。
- readonly、IME、多 cursor、非 Knowledge Surface 不得被格式或 slash keymap 误改。
- 用户的 `.gitignore` 以及 ignored `temp/**`、`teach/**` 内容不属于本 change，不能随 ticket 提交。
- 只有 Lead 操作 Git；不覆盖用户修改。
