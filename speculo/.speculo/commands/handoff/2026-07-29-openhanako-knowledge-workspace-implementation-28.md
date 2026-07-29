# OpenHanako 知识工作区实施交接 28

## 已关闭

- Tickets 01–28 已关闭，共 28/57；M2/P1/P2 Markdown 阶段完成 6/17。
- Ticket 28 主线实现提交为 `3531cf72`。
- 无序/有序列表、任务和引用 Enter 在单一 Markdown Surface 的最高优先级 keymap 中交付。
- task 始终延续为 `[ ]`；嵌套空项只退出一层；quote/list/task 组合保留父结构、delimiter、indent 与 spacing。
- 有序列表只生成当前编号加一，绝不改写现有前后编号。
- 顶层、引用内和列表内 fenced code、selection、多 cursor、prefix caret、readonly 均 fail-closed。
- 每次 Enter 只有一个 input transaction/undo step；dispatch 故障不提前修改 state。
- 精确测试 1 file、32/32；相关定向 6 files、95/95；产品范围全仓 1036 files passed、1 skipped，10440 tests passed、6 skipped。
- typecheck、boundary、目标 ESLint、diff check 与 Renderer production build 通过；本票 Playwright 不适用。

## M2 当前状态

- Ticket 29 应复用同一 Surface/keymap precedence，并把 Tab/Shift+Tab 限定在当前行或显式选择的完整行。
- Ticket 29 固定使用两个 ASCII spaces；不得联动列表后代，不得重排有序编号。
- Ticket 30 的 format/slash commands 继续遵守一个用户动作一个 transaction/undo step。

## 下一步

1. 实施 Ticket 29：Tab/Shift+Tab 行级缩进、反缩进与 fenced code 固定两空格。
2. 实施 Ticket 30：格式快捷键与固定斜杠命令集合。
3. 实施 Ticket 31：GFM table 与普通 fenced code 源码/预览行为。

## 保护边界

- 不复制 SilverBullet runtime；只在现有 CM6 Surface 上使用独立命令。
- Enter 不重建 EditorView、不保存、不触发 ResourceIO，不修改当前行和 caret 插入之外的文本。
- 不继承完成 task 状态，不在 fenced code 中补结构，不一次退出全部嵌套。
- 不自动重排既有有序编号，不把 Live Preview 渲染序号写回源码。
- 用户的 `.gitignore` 以及 ignored `temp/**`、`teach/**` 内容不属于本 change，不能随 ticket 提交。
- 只有 Lead 操作 Git；不覆盖用户修改。
