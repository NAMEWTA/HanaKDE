# OpenHanako 知识工作区实施交接 34

## 已关闭

- Tickets 01–34 已关闭，共 34/57；M2/P1/P2 Markdown 阶段完成 12/17。
- Ticket 34 主线实现提交为 `549dd6d5`。
- 共享 Markdown IR 现在原生投影 reference definition/reference/inline footnote；标签 exact + case-sensitive，首定义固定生效，后续同标签显式 duplicate。
- 多行定义只接纳四个 ASCII 空格或一个真实 Tab 的续行；空行后的续段仍须缩进，正文只去掉一层兼容缩进，原始源码/range 不移动不改写。
- Frontmatter、fenced/indented/inline code 与结构 syntax 使用共享 exclusion；脚注不跨 editor buffer、页面或来源。
- `knowledge-footnote-field.ts` 是 Live Preview 唯一脚注 decoration owner；任一 selection 触碰 marker 即回源，Source 模式始终 literal。
- reference 普通 click/Enter/Space 跳到同文档 winning definition，Alt/Option 激活回到引用源码；inline/missing marker 直接回源，均不修改文档或 history。
- hover 内容经 Markdown renderer + sanitizer，在 inert template 内移除脚注尾列表与 resource-bearing element；不联网、不访问文件、不执行链接/控件。
- missing reference 与 later duplicate 都有确定、可聚焦、五语言的非阻断诊断；删除/移动首定义后按当前 buffer 重新计算。
- 当前页 `[^` 补全按首定义位置和大小写 prefix 排序，duplicate 一次，完整 reference 单 transaction 插入并一步撤销；read-only/code unavailable，Source 模式仍有真实 CM6 completion。
- 新增直接依赖 `@codemirror/autocomplete@6.20.1`；后续 Ticket 37 加 Wikilink completion 时必须合并 completion sources，不能安装互相覆盖的第二个 `autocompletion({override})`。
- 五语言、亮暗 token、viewport-bounded 窄 tooltip、button/tooltip role、ARIA、focus-visible、pointer 与 Enter/Space 均已交付。
- 精确 ticket + IR 2 files、27/27；相关定向实际 8 files、90/90；最终标准全仓 1046 files passed、1 skipped，10539 tests passed、6 skipped。
- typecheck、boundary、目标 ESLint、diff check、package-lock offline dry-run 与 Renderer production build 通过。
- E2E-KW-011 尚无真实可执行公开打开入口；Tickets 48/49 完成后必须补建并执行，最终发布前不得保留。

## M2 当前状态

- Ticket 35 的安全 HTML 内嵌 Markdown必须复用既有 sanitizer/ResourceIO 安全边界；不能借脚注 tooltip 的静态 fragment 路径建立第二套通用 HTML renderer。
- Ticket 37 必须把 Wikilink 与脚注 completion source 组合到同一个 CM6 autocomplete owner，并保持脚注候选只来自当前 buffer 的 exact definition。
- Ticket 39 页面嵌入必须消费保存后的共享 IR/解析契约；脚注 reference 不得跨嵌入、页面或来源解析，也不得把 hover 派生内容写入正文或索引。

## 下一步

1. 实施 Ticket 35：安全 HTML、本地 URL 与外部链接。
2. 实施 Ticket 36：当前 Markdown 文档查找替换。
3. 实施 Ticket 37：Wikilink 补全、导航与延迟建页，并合并 autocomplete owner。

## 保护边界

- 脚注标签始终 exact、case-sensitive、same-document first-wins；不得 lowercase、Unicode casefold、fuzzy/global search 或跨来源猜测。
- definition/source 是真实 Markdown 事实；不得搬到底部、自动创建、合并、重命名、修复、重写缩进或生成第二份 footnote list。
- 只有四 ASCII spaces/真实 Tab 构成 continuation；空行后的非缩进行不能并入定义。
- hover 只能显示净化后的静态派生；不得加载媒体、预取链接、执行动态内容或把派生结果进入 history/index/disk。
- missing/duplicate 必须显式但非阻断，且所有 click/keyboard 动作只改变 selection/scroll。
- Source 模式只显示源码，但当前页补全仍可用；read-only/code context 必须返回 unavailable。
- `knowledgeFootnoteCompletion` 当前是唯一 autocomplete override；Ticket 37 必须组合 source，不能叠加竞争 owner。
- E2E-KW-011 只能在 Tickets 48/49 的真实资源打开入口完成后执行，不能添加私有 route/test shortcut。
- 用户的 `.gitignore` 以及 ignored `temp/**`、`teach/**` 内容不属于本 change，不能随 ticket 提交。
- 只有 Lead 操作 Git；不覆盖用户修改。
