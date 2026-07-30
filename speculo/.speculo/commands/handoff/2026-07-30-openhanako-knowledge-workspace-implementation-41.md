# OpenHanako 知识工作区实施交接 41

## 已关闭

- Tickets 01–41 已关闭，共 41/57；M3 索引/查询阶段完成 2/7。
- Ticket 41 主线实现提交为 `4a3e0cc3`。
- Markdown 抽取器没有 Renderer buffer/source-string 入口，只接收带 expected version token 的已保存内容读取函数；测试证明未保存编辑不进入 Server 索引。
- 原始文件大于 10 MiB 时在读取前返回 metadata-only replacement；严格 UTF-8 必须完整解码，非法字节不产生部分事实，开头 UTF-8 BOM 不进入正文。
- 页面标题只取真实文件名去除 `.md`，Frontmatter `title`/`aliases` 仍是普通属性；安全的平面 Frontmatter 投影进入 JSON，原始元数据参与 folded 搜索。
- 标题、Frontmatter/body 标签、GFM task、Wikilink、embed、content-ref 与 Markdown link 全部复用共享 Markdown IR/LinkResolver；代码、HTML、URL 等排除边界保持一致。
- Wikilink/embed/link 只解析同来源规范相对路径；坏路径、外链保持 unresolved，不做同名、跨来源或搜索回退。
- Page embed 只记录宿主到源 Page 的一条边，不复制源正文、标题、属性、标签、任务或内部链接。
- heading slug 已上移为 Renderer/Server 共享纯函数，既有 Renderer 导出保持兼容。
- `KnowledgeIndexRebuild.replaceResource` 只接收结构化 DTO，不暴露 Database；每资源更新在单一 `BEGIN IMMEDIATE` transaction 中删除旧派生行、写入资源/page/结构/FTS，约束失败完整 rollback。
- 页面跨越大小/编码/可用性门禁时，旧 page/headings/links/tags/tasks/body FTS 被清除，只保留资源身份 metadata FTS。
- 精确 1 file、10/10；相关 Markdown/Frontmatter/tags/links 7 files、133/133；索引/持久化 4 files、31/31；最终产品范围全仓 1059 files，1058 passed、1 skipped；10662 tests，10656 passed、6 skipped、0 failed。
- typecheck、boundary、目标 ESLint、diff check、Renderer 与 Open Server production build 通过；better-sqlite3 runtime smoke 通过。
- persistence schema/ownership/DATA_EPOCH 不变；compatible 指纹为 `sha256:a551ca1bc369462c81082e37fba6e59e7ad9e0b4555d4b6157f80bd271bef442`。
- E2E-KW-013 尚不存在且本票明确不运行 Playwright；仅保留发布级关联，未伪记为通过。

## 下一步

1. 实施 Ticket 42：非 Markdown 安全文本抽取。
2. 完成 Ticket 43 watcher/rebuild，再按依赖完成 Tickets 44–46 的查询、超级搜索和当前资源视图。
3. 完成 Tickets 47–56 的资源树交互与资源操作，再由 Ticket 57 执行完整发布 Gate。

## 保护边界

- Ticket 42 必须复用相同 `KnowledgeIndexResourceDocument`/事务替换接缝，不新增第二套 Store、schema 或 Database 暴露。
- 所有正文读取必须经 ResourceIO/provider 的 stat/expected-version/openRead 链路；event payload、Renderer buffer 和绝对路径都不是索引事实。
- Markdown 大于 10 MiB 或非严格 UTF-8 时不得读取/解析部分正文、容错解码、自动转码或保留旧结构索引。
- 页面标题来自文件名；第一个 H1、Frontmatter `title`/`aliases` 不得改变标题或链接解析。
- Markdown IR、Frontmatter projection、heading slug、标签与 LinkResolver 必须继续共享，不能在 Server 复制近似解析器。
- Embed 只保存关系边；被嵌入内容只归属于真实源 Page，不得重复进入宿主索引。
- 取消、版本冲突和读失败在产生 replacement DTO 前失败；SQLite 写失败必须 rollback，不得留下半更新资源。
- E2E-KW-013 必须等待后续真实公开搜索入口，不能添加私有 route、测试捷径或缩减发布场景。
- 用户的 `.gitignore` 以及 ignored `temp/**`、`teach/**` 内容不属于本 change，不能随 ticket 提交。
- 只有 Lead 操作 Git；不覆盖用户修改。
