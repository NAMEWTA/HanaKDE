# OpenHanako 知识工作区实施交接 24

## 已关闭

- Tickets 01–24 已关闭，共 24/57；M2/P1/P2 Markdown 阶段完成 2/17。
- Ticket 24 主线实现提交为 `8a5a4f17`。
- 新增 `knowledge-link-field`：共享 Markdown IR 是唯一词法入口，Wikilink 与标准 Markdown destination 都直接复用 Ticket 23 `LinkResolver`，Renderer 没有第二套 decode、normalize、scheme 或跨来源猜测。
- 同源 Page/Asset 插入只生成 Source 根相对 Wikilink，保留真实扩展名与结构字符转义，不写 `sourceKey:`；跨来源输入 fail-closed。
- CM6 Surface 通过 policy 注入链接 StateField/ViewPlugin；Wikilink conceal 与 Markdown label 都是派生装饰，不改变正文、undo 或保存基线。
- 内部目标存在性只以完整 KnowledgeResourceAddress 经既有 Renderer Resource client `stat` 检查；missing、unavailable、非法目标、外链均有独立视觉/ARIA 状态。
- 普通单击与 Enter/Space 激活只传递共享 resolver 的结果；外链不预取，非法/检查中/不可用目标不导航；文档变化与销毁取消旧 stat。
- zh-CN、zh-TW、en、ja、ko、focus-visible、亮暗 token 与窄布局样式同步交付。
- 精确测试 1 file、7/7；相关定向 5 files、67/67；产品范围全仓 1032 files passed、1 skipped，10363 tests passed、6 skipped。
- typecheck、boundary、目标 ESLint、diff check 与 Renderer production build 通过。
- E2E-KW-009 要求的补全/延迟建页、embed/backlink 和资源打开入口分别归 Tickets 37、39、48；当前未以私有 route 或缩减场景冒充发布 PASS。

## M2 当前状态

- Ticket 23 提供唯一 canonical address/LinkResolver，Ticket 24 已把该语义接入知识 Markdown 的真实 CM6 Surface。
- Ticket 25 可推进 YAML Frontmatter 保真投影；Ticket 27 已解锁 Live Preview/Source 模式状态。
- Ticket 37 后续只负责补全、tab 导航与缺失 Page pending session，不得重写链接词法或地址解析。

## 下一步

1. 实施 Ticket 25：保持 YAML Frontmatter 原始字节语义和字段投影，不把 UI 修改扩散为无关重排。
2. 按 DAG 推进 Tickets 26–39，所有 Markdown 知识语义继续消费 Ticket 11 IR。
3. Tickets 37、39、48 完成后创建并执行完整 E2E-KW-009（desktop-full、web-open），回填本票关联证据。

## 保护边界

- 知识 Markdown 链接只在当前页面 sourceKey 内解析；同名其他来源不参与存在性判断、断裂恢复或导航。
- Wikilink 是 Source 根相对，标准 Markdown 文件链接是页面目录相对；两者不得交换基准。
- Renderer 不做文件系统访问、cwd/path 推断、percent-decode、dot-segment normalize、source registry 搜索或网络预取。
- 只有共享 resolver 返回的 `http:`/`https:` 可作为外链明确激活；其他 scheme 和越界目标保持禁用。
- missing 可交给 Ticket 37 创建 pending Page；unavailable、非法和 checking 状态不能触发创建或导航。
- 用户的 `.gitignore` 以及 ignored `temp/**`、`teach/**` 内容不属于本 change，不能随 ticket 提交。
- 只有 Lead 操作 Git；不覆盖用户修改。
