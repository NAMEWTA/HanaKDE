# OpenHanako 知识工作区实施交接 39

## 已关闭

- Tickets 01–39 已关闭，共 39/57；M2 Markdown 阶段完成 17/17。
- Ticket 39 主线实现提交为 `d80c3046`。
- Live Preview 交付同来源整页 `![[Page.md]]` 和章节 `![[Page.md#Heading]]` 的只读静态派生渲染；跨来源仍必须先复制。
- heading 使用大小写精确首匹配；章节包含命中 heading 和更深子标题，到下一个同级或更高级 heading 截止。
- 循环键使用完整 `{sourceKey, relativePath}`，只终止当前分支；递归深度固定上限 8，外层和兄弟嵌入保持可用。
- 嵌入只读取已保存磁盘快照，stat 先于 read，并受 10 MiB、严格 UTF-8、取消和 stale-result 门禁保护；不会读取源页面未保存 buffer。
- 源页面保存以完整 provider-neutral 版本触发当前同来源宿主派生内容刷新；宿主源码、cursor、scroll、selection 和 undo history 不变。
- 静态 DOM 复用共享 Markdown IR、LinkResolver、安全 HTML、Mermaid、math 和导航接缝；不创建第二编辑器/buffer，不写宿主或源页面。
- 内部链接按源 Page 解析，嵌入内容不重复进入宿主索引；显式链接/脚注/heading 和文本选择优先于普通容器打开源 Page。
- 五语言、键盘、ARIA、亮暗主题、窄布局和标准 OS 文本选择/复制已覆盖；Source 模式保留原始语法。
- 精确命令 3 files、30/30；相关 11 files、93/93；最终产品范围全仓 1056 files，1055 passed、1 skipped；10639 tests，10633 passed、6 skipped、0 failed。
- typecheck、boundary、目标 ESLint、diff check 与 Renderer production build 通过。
- E2E-KW-009 尚不存在；仓库只有 E2E-KW-001 spec。Ticket 46 backlinks 与 Tickets 48/49 真实资源树打开入口完成后必须补建并执行，最终发布前不得保留。

## M2 完成状态

- Tickets 23–39 的 canonical address、共享 Markdown IR/CM6、Wikilink/Markdown link、frontmatter、tags/tasks、Live Preview、编辑事务、表格/code、状态栏、Mermaid/math、脚注、安全 HTML/媒体/外链、find/replace、补全/导航/延迟建页、附件复制后引用和页面/章节嵌入均已交付。
- M2 的未决项仅是依赖后续真实入口的发布级 E2E 回填，不把缺失 spec 伪记为已运行，也不创建私有 route 或缩减场景。
- Ticket 39 的派生内容当前不进入宿主索引；Ticket 41 只负责源页面抽取，Ticket 46 才拥有 backlinks/current-resource view。

## 下一步

1. 实施 Ticket 40：来源分区索引 Store 与 Schema。
2. 按依赖顺序完成 Tickets 41–46，交付抽取、watcher/rebuild、查询、搜索和当前资源视图。
3. 完成 Tickets 47–56 的资源树交互与资源操作，再由 Ticket 57 执行完整发布 Gate。

## 保护边界

- Embed 只允许同来源 Page；跨来源必须先复制，不能建立跨来源持久链接或同名搜索回退。
- 嵌入读取已保存磁盘事实，不读取未保存 source buffer；派生内容不得写回宿主/源 Page 或建立第二编辑历史。
- 循环身份必须保留 sourceKey 与 relativePath；不能只按路径或标题判断，也不能因单个坏分支隐藏外层和兄弟内容。
- 内部链接保持源 Page 所有权并相对源 Page 解析；嵌入正文不得复制进宿主索引。
- 缺失、超限、非法 UTF-8、权限/来源不可用与取消必须保持非阻断且相互隔离；异步旧结果不能覆盖新状态。
- E2E-KW-009 必须使用后续真实公开入口，不能添加私有 route、测试捷径或缩减发布场景。
- 用户的 `.gitignore` 以及 ignored `temp/**`、`teach/**` 内容不属于本 change，不能随 ticket 提交。
- 只有 Lead 操作 Git；不覆盖用户修改。
