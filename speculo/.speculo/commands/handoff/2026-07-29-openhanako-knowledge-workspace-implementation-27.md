# OpenHanako 知识工作区实施交接 27

## 已关闭

- Tickets 01–27 已关闭，共 27/57；M2/P1/P2 Markdown 阶段完成 5/17。
- Ticket 27 主线实现提交为 `510687bf`。
- Live Preview/Source 通过 conceal compartment 在同一 EditorView 上切换，共享 buffer、selection 与 undo history，不触发保存。
- inline、活动行与活动块三种 reveal 粒度已按 Markdown 语义落地；Source mode 统一卸载全部 Live Preview decorations/widgets。
- mode/scroll 按 viewId 独立保持；dispatch 故障不写 registry，并恢复原滚动位置。
- 五语言、ARIA pressed group、键盘 focus、亮暗主题与 38rem 窄布局同步交付。
- 精确测试 1 file、4/4；相关定向 104/104；产品范围全仓 1035 files passed、1 skipped，10408 tests passed、6 skipped。
- typecheck、boundary、目标 ESLint、diff check 与 Renderer production build 通过。
- E2E-KW-005 spec 当前不存在，因此未运行；保留至完整公开入口的发布回填。

## M2 当前状态

- Ticket 28 可直接在当前 Surface 上实现 Enter transaction；不得另建 editor keymap 或绕过共享 IR。
- Ticket 29 的 Tab/Shift+Tab 必须与 Ticket 28 共用列表上下文与 selection mapping，不能通过字符串全局替换实现。
- Ticket 30 的格式命令必须继续保持一个用户动作对应一个 CM6 transaction/undo step。

## 下一步

1. 实施 Ticket 28：列表、引用与任务的 Enter 事务和终止规则。
2. 实施 Ticket 29：Tab/Shift+Tab 行级缩进与反缩进事务。
3. 实施 Ticket 30：格式工具栏、快捷键与保真切换。

## 保护边界

- 模式切换不得重建 EditorView、document 或 history，不得触发 ResourceIO/save。
- Source mode 不保留任何 conceal/widget；Live Preview 只显露 caret/selection 所触达的局部语法。
- 同一 session 的不同 view 不共享 mode/scroll；registry 只在成功或幂等切换后更新。
- 不恢复会阻止编辑 fenced code marker 的旧 caret filter。
- 用户的 `.gitignore` 以及 ignored `temp/**`、`teach/**` 内容不属于本 change，不能随 ticket 提交。
- 只有 Lead 操作 Git；不覆盖用户修改。
