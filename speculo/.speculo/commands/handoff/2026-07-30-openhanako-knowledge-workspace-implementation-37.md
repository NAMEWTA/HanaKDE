# OpenHanako 知识工作区实施交接 37

## 已关闭

- Tickets 01–37 已关闭，共 37/57；M2/P1/P2 Markdown 阶段完成 15/17。
- Ticket 37 主线实现提交为 `bc0a60ab`。
- `[[` 递归列出当前 Page sourceKey 内的 Page/Asset；`![[` 只列 Markdown 与静态可嵌入图片、音频、视频、PDF，根 `.trash` 不进入候选。
- Unicode NFC case-insensitive 连续子串、natural source-relative path 排序与仅路径候选行已固定；不显示来源身份、display name 或 metadata。
- Frontmatter、fenced/indented/inline code 不触发 popup；异步 list 绑定 CM6 cancellation。Enter/click 一次 transaction 写入完整链接，Esc/无结果零副作用。
- Wikilink 与 Ticket 34 脚注 completion source 共用唯一 `autocompletion({ override })` owner，没有竞争 popup 或平行状态机。
- 内部链接经 Ticket 23 同源 resolver 后重新 stat；全局已有同址 view 时复用激活，否则当前组打开 temporary preview。首个 exact case-sensitive heading 可滚动聚焦，不修改正文或树状态。
- 只有同源缺失 `.md` Wikilink 且来源可写时建立 `pendingCreate`；打开/未编辑关闭零写入，首次编辑或显式保存以 `expectedVersion: null` 创建，成功推进 baseline/version。
- 并发首次创建按 registry/address 合并；冲突、权限/不可用、缺失 Asset 与普通 Markdown link 保留状态并拒绝创建，其他来源同名目标不搜索、不猜测。
- Ticket 精确 3 files、25/25；相关受控分批 10 files、115/115；最终受控全仓 2782 suites、10601 tests，10595 passed、6 skipped、0 failed。
- typecheck、boundary、目标 ESLint、diff check、锁文件 offline dry-run、baseline/preflight、style discipline 与 Renderer production build 通过。
- E2E-KW-009 尚无完整真实入口；Ticket 39 与 Tickets 48/49 完成后必须补建并执行，最终发布前不得保留。

## M2 当前状态

- Ticket 38 必须复用 Ticket 10 operation/copy contract、Ticket 23 source-scoped address 与 Ticket 27 CM6 transaction seam；附件与跨来源复制不能退化成 Renderer 文件系统访问、地址猜测或普通 link navigation。
- Ticket 39 可复用 Ticket 37 navigation/completion seam、Ticket 35 安全渲染与 Ticket 33 Mermaid/math；页面/章节嵌入只读取同源资源，派生内容不得写回正文。
- Ticket 37 的 pending Page 是文档 session 生命周期，不是资源树 create flow；Ticket 50 后续仍拥有显式新建 Page/folder 与 operation journal 语义。

## 下一步

1. 实施 Ticket 38：附件与跨来源复制后引用。
2. 实施 Ticket 39：同源页面与章节嵌入。
3. 进入 Ticket 40：来源分区索引 Store 与 Schema。

## 保护边界

- completion/navigation 只允许当前页面 sourceKey；不得跨来源 fuzzy/global search、fallback 或暴露来源身份。
- 普通 Wikilink 候选可含 Page/Asset，embed 候选只能使用冻结静态 allowlist；根 `.trash` 不可见。
- 只有缺失 `.md` Wikilink 可 pending create；Asset、普通 Markdown link、只读/不可用来源与 stat 异常都不能创建。
- pending session 未编辑关闭必须零写入；首次创建必须使用 ResourceIO `expectedVersion: null` 并保留冲突 buffer。
- 已有同址 view 必须跨组复用；新目标只在当前组 temporary preview，不联动资源树 selection、follow 或 back history。
- Wikilink 与脚注必须保持单一 autocomplete owner；不得安装第二个 `autocompletion({ override })`。
- E2E-KW-009 只能在 Ticket 39 与 Tickets 48/49 的真实公开入口完成后执行，不能添加私有 route/test shortcut。
- 用户的 `.gitignore` 以及 ignored `temp/**`、`teach/**` 内容不属于本 change，不能随 ticket 提交。
- 只有 Lead 操作 Git；不覆盖用户修改。
