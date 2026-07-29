# OpenHanako 知识工作区实施交接 29

## 已关闭

- Tickets 01–29 已关闭，共 29/57；M2/P1/P2 Markdown 阶段完成 7/17。
- Ticket 29 主线实现提交为 `ee09a121`。
- 可写 Markdown 的 Tab/Shift+Tab 以最高优先级 keymap 接入既有单一 CM6 Surface。
- 空 caret 在普通文本和 fenced code 中固定插入两个 ASCII spaces；显式选区按实际触及的完整行处理。
- Shift+Tab 每行最多移除两个行首 ASCII spaces，不删除 tab，不产生负层级。
- selection、反向 selection、多 caret 在同一 ChangeSet 中稳定映射；一次动作只有一个 transaction/undo step。
- 不联动列表后代或相邻行，不修复结构，不重排已有有序编号。
- text/code/csv、只读 Markdown 与非编辑上下文不接管 Tab，保留浏览器焦点语义。
- 精确测试 1 file、18/18；相关定向 6 files、93/93；产品范围全仓 1037 files passed、1 skipped，10458 tests passed、6 skipped。
- typecheck、boundary、目标 ESLint、diff check 与 Renderer production build 通过；本票 Playwright 不适用。

## M2 当前状态

- Ticket 30 应复用同一 Surface 与 keymap precedence，交付冻结的格式快捷键和固定斜杠菜单，不引入可扩展 command runtime。
- Ticket 30 的每个格式或 slash 动作继续遵守一个用户动作一个 transaction/undo step，并保持 fenced code、只读和 selection 的固定边界。
- Ticket 31 接续交付 GFM table 与普通 fenced code 的源码/预览状态。

## 下一步

1. 实施 Ticket 30：格式快捷键与固定斜杠命令集合。
2. 实施 Ticket 31：表格与代码块编辑预览。
3. 实施 Ticket 32：软换行与编辑器状态栏。

## 保护边界

- 不复制 SilverBullet runtime；只在现有 CM6 Surface 上实现独立命令和 UI。
- Tab 固定使用两个 ASCII spaces，不写 tab，不按语言改变宽度。
- 不把 list descendants、相邻行或未选中行加入缩进事务，不重排有序编号。
- readonly 和非 Markdown Surface 不得劫持 Tab 焦点导航。
- 用户的 `.gitignore` 以及 ignored `temp/**`、`teach/**` 内容不属于本 change，不能随 ticket 提交。
- 只有 Lead 操作 Git；不覆盖用户修改。
