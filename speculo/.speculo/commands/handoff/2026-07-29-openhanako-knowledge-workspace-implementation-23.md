# OpenHanako 知识工作区实施交接 23

## 已关闭

- Tickets 01–23 已关闭，共 23/57；M2/P1/P2 Markdown 阶段完成 1/17。
- Ticket 23 主线实现提交为 `35a27e0d`。
- 新增 `knowledge-address` 纯领域层：Source 根相对路径使用 `/` 协议分隔符，拒绝空值、绝对/UNC/盘符、空段、dot 段和控制字符，不折叠大小写、不执行 Unicode normalization、不隐式 percent-decode。
- 字面反斜杠默认 fail-closed；只有 provider 对精确 `{sourceKey, relativePath}` 给出验证时才能作为段内真实名称接受，不把它当平台分隔符。
- Wikilink resolver 直接消费 Ticket 11 共享词法已反转义字段；地址以当前 Source 根为基准，不 percent-decode，不接受 `sourceKey:` 或其他来源回退。空地址加 fragment 指向当前页面。
- Markdown destination resolver 直接消费 CommonMark 已反转义文本；`http:`/`https:` 明确分类为外链，其他 scheme、protocol-relative、rooted、盘符/UNC、query 与原始反斜杠不进入内部解析。
- Markdown 内部路径逐段严格 UTF-8 percent-decode 一次；无效 escape/UTF-8、编码 `/`、编码 `\`、NUL/控制字符全部拒绝。原始或编码 `.`/`..` 参与页面目录相对 lexical normalize，越出 Source 立即 out-of-scope。
- Wikilink 重构输出 Source 根相对 canonical path 并转义结构字符；Markdown 重构输出等价 POSIX relative 的页面目录相对路径，真实名称段按 RFC 3986 编码，同目录不加 `./`，fragment 保留。
- 精确测试 1 file、22/22；相关定向 5 files、142/142；产品范围全仓 1031 files passed、1 skipped，10356 tests passed、6 skipped。
- typecheck、boundary、目标 ESLint 与 diff check 均通过；本票未修改 composition/Renderer/preload/main，不触发额外 build。固定点 `7ff84472` 到 `35a27e0d` 的规范轴和标准轴本地复审无未决 blocker。
- 本票按契约不运行 Playwright；E2E-KW-009 保留为 Tickets 24/37 真实渲染、编辑和导航入口完成后的发布级场景。
- 全仓 fail-closed evidence 门禁同时发现 Ticket 22 通过行使用“同上”且含失败词；已改为每行直接列出真实命令并使用非状态歧义描述。

## M2 当前状态

- Ticket 23 已建立后续 Markdown link、补全/导航、索引、嵌入及资源重构共享的唯一地址解析边界。
- Ticket 24 已解锁：需要把共享 IR 中的 Wikilink/Markdown link 投影到编辑器渲染与交互，并继续复用本票 resolver。
- Tickets 25、26 可在 DAG 允许时推进 Frontmatter 保真投影与标签/Page Task；不得另建地址或 Markdown parser。

## 下一步

1. 实施 Ticket 24：交付 Wikilink 与 Markdown link 的 CM6 渲染/点击交互，断裂与不安全目标明确显示且不导航。
2. 按 DAG 推进 Tickets 25–39，所有链接消费者统一使用 `link-resolver.ts`，不得自行 path join、percent-decode 或跨来源搜索。
3. Tickets 37/48/49 完成真实补全、导航和资源树打开入口后执行 E2E-KW-009，并在 Ticket 57 发布矩阵回填。

## 保护边界

- Markdown 知识地址永不写 `sourceKey:`、绝对路径、URI 或最短唯一文件名；不同 Source 的地址空间、链接图和回链域保持隔离。
- Wikilink 以 Source 根解析且不 percent-decode；Markdown 文件链接以包含页面目录解析且只 decode 一次。两者不得互换基准。
- 任何 dot segment、rooted/UNC/drive、query、无效 percent、编码分隔符或 lexical root escape 必须 fail-closed。
- 大小写、Unicode 序列和扩展名是 provider 的真实身份事实；不得 NFC、lowercase、扩展名补全或同名猜测。
- LinkResolver 不依赖进程 cwd、`path` 平台语义、Renderer 文件系统、全局搜索或其他来源列表。
- 同源重构生成 Wikilink 时使用根相对 canonical path；生成 Markdown destination 时使用页面目录相对 POSIX 语义并逐段 RFC 3986 编码。
- 用户的 `.gitignore` 以及 ignored `temp/**`、`teach/**` 内容不属于本 change，不能随 ticket 提交。
- 只有 Lead 操作 Git；不覆盖用户修改。
