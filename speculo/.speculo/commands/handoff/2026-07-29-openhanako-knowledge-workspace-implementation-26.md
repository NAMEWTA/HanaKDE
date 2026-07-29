# OpenHanako 知识工作区实施交接 26

## 已关闭

- Tickets 01–26 已关闭，共 26/57；M2/P1/P2 Markdown 阶段完成 4/17。
- Ticket 26 主线实现提交为 `0c1ede97`。
- 页面标签投影固定携带 `sourceKey`；Frontmatter/body 同页精确去重但保留各自 origin，不跨来源合并。
- Frontmatter `tags` 只复用 Ticket 25 可安全投影字段中的 string/string[]；复杂 YAML 整区不读取局部标签，没有新增 YAML parser。
- body tags 直接消费共享 IR，覆盖 Unicode/NFC、heading、纯数字、代码、URL、link destination 与转义边界。
- 原 Lezer checkbox handler 已删除；`taskField` 只装饰共享 IR GFM marker，切换只写 `[ ]`/`[x]` 三字符并形成一个 transaction/undo step。
- 陈旧位置、只读/不可用、解析取消和 dispatch 故障均保持 buffer 不被提前修改。
- 五语言、原生键盘控件、ARIA、focus、亮暗主题与窄布局同步交付。
- 精确测试 1 file、16/16；相关定向 7 files、94/94；产品范围全仓 1034 files passed、1 skipped，10403 tests passed、6 skipped。
- typecheck、boundary、目标 ESLint、diff check 与 Renderer production build 通过；本票 Playwright 不适用。

## M2 当前状态

- Ticket 27 可在同一 policy-driven Surface 上建立 Live Preview/Source mode 状态；切换只能重配 decoration/interaction，不能重建 buffer/history。
- Ticket 28 的 Enter task continuation 必须继续写标准 `[ ]`，并与本票 `taskField` 的共享 IR 识别结果一致。
- Ticket 41 的 Markdown 索引抽取必须在成功保存并从磁盘重读后调用 `extractKnowledgePageTags`；不得从 Renderer widget 或未保存 buffer 写 Server 索引。

## 下一步

1. 实施 Ticket 27：单一 buffer/history 的 Live Preview 与 Source 模式，以及局部 syntax reveal。
2. 实施 Ticket 28–30：基于同一 CM6 Surface 的 Enter、Tab 和格式事务。
3. Ticket 41 接入已保存磁盘抽取时复用本票标签投影，不复制词法或 Frontmatter 解析。

## 保护边界

- 不在复杂或不可安全投影 Frontmatter 中读取“看起来安全”的 `tags` 子集。
- 不按逗号或空格拆分 Frontmatter string，不做大小写折叠，不跨来源聚合。
- 不把普通段落、引用同形文本、inline/fenced code 中的 `[ ]` 当作 task。
- task toggle 不改任务文本、列表标记或空白，只替换准确三字符 marker。
- 不从当前未保存 buffer、DOM checkbox 或 Renderer state 更新 Server 索引。
- 用户的 `.gitignore` 以及 ignored `temp/**`、`teach/**` 内容不属于本 change，不能随 ticket 提交。
- 只有 Lead 操作 Git；不覆盖用户修改。
