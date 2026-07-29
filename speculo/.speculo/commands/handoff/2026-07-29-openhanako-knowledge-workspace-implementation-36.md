# OpenHanako 知识工作区实施交接 36

## 已关闭

- Tickets 01–36 已关闭，共 36/57；M2/P1/P2 Markdown 阶段完成 14/17。
- Ticket 36 主线实现提交为 `ec2531cc`。
- 当前 Markdown 查找直接消费活动 CM6 `EditorState`，覆盖未提交 buffer 与 Live Preview 隐藏源码；不搜索渲染 DOM。
- `@codemirror/search` `6.6.0` 以直接锁定依赖提供公开 `SearchQuery` seam；查询固定 literal、regexp 关闭，默认 Unicode case-insensitive，并有显式 case/whole-word toggles。
- 单行真实源码 selection 初始化查询，多行 selection 清空；上一项/下一项首尾循环并显示 current/total。
- 单次替换与 replace-all 都进入 CM6 transaction/history；前者激活替换范围之后的下一 match start，后者冻结执行前 match snapshot 并提供单步 undo。
- `KnowledgeEditorGroups` 是唯一 find session owner；同组 Markdown tab 保留临时状态，跨组、Asset、不可用 view 与 workspace 切换关闭并重置。
- 固定右上角 overlay 不改变布局；全部/当前匹配 decoration、实时重算、避让 overlay scroll margin、Esc/关闭 focus 恢复与封闭 focus loop 已交付。
- Mod-F/Mod-H 重入保留状态并聚焦目标输入；没有 F3、历史、建议、持久化或日志。
- 五语言、亮暗 token、窄布局、ARIA、focus-visible 和 read-only/空查询/无匹配/唯一匹配安全空操作已交付。
- Ticket 精确 17/17；相关 13 files、135/135；最终受控全仓 10587 tests，10581 passed、6 skipped、0 failed。
- typecheck、boundary、目标 ESLint、diff check、锁文件 offline dry-run、baseline/preflight、style discipline 与 Renderer production build 通过。
- E2E-KW-012 尚无真实可执行公开打开入口；Tickets 48/49 完成后必须补建并执行，最终发布前不得保留。

## M2 当前状态

- Ticket 37 可在 Ticket 24 Wikilink field/resolver、Ticket 34 footnote completion 与当前 CM6 surface 上建立唯一 autocomplete owner；不得产生第二个 popup owner。
- Ticket 38 必须沿用 Ticket 10 operation/copy contract、Ticket 23 source-scoped address 与 Ticket 27 transaction seam；跨来源复制不能退化成路径猜测或 Renderer 文件系统访问。
- Ticket 39 页面/章节嵌入依赖 Ticket 37 navigation/completion seam，并复用 Ticket 35 安全渲染与 Ticket 33 Mermaid/math；派生内容不得写回正文。

## 下一步

1. 实施 Ticket 37：Wikilink 补全、导航与延迟建页。
2. 实施 Ticket 38：附件与跨来源复制后引用。
3. 实施 Ticket 39：同源页面与章节嵌入。

## 保护边界

- 查找只读取当前活动 Markdown source buffer；不得搜索 rendered DOM、其他组、Asset viewer 或持久化副本。
- 查询和替换必须 literal；不得启用 regexp、F3、查询历史、建议或关闭后的状态恢复。
- replace-all 必须使用稳定的执行前 match snapshot 与单一 CM6 undo transaction；read-only/空查询/无匹配保持零修改。
- 同组 Markdown tab 才可保留临时状态；跨组、Asset、不可用 view 或 workspace 切换必须关闭并重置。
- 只有一个 overlay/session owner；不得为组、tab 或 mode 建立平行状态机。
- E2E-KW-012 只能在 Tickets 48/49 的真实资源打开入口完成后执行，不能添加私有 route/test shortcut。
- 用户的 `.gitignore` 以及 ignored `temp/**`、`teach/**` 内容不属于本 change，不能随 ticket 提交。
- 只有 Lead 操作 Git；不覆盖用户修改。
