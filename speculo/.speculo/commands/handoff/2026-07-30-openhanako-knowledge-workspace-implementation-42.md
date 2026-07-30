# OpenHanako 知识工作区实施交接 42

## 已关闭

- Tickets 01–42 已关闭，共 42/57；M3 索引/查询阶段完成 3/7。
- Ticket 42 主线实现提交为 `25e4ed0c`。
- 非 Markdown 安全文本抽取只接受 `KnowledgeResourceAddress`，并经真实 ResourceIO 的 `stat`、content gate、expected-version `openRead` 读取；不接收绝对路径、Renderer buffer 或 event payload 正文。
- 无 BOM 内容只接受严格 UTF-8；UTF-8、UTF-16 LE/BE、UTF-32 LE/BE 仅由确定 BOM 选择解码器，不猜测系统代码页，不容错产生部分正文。
- 10 MiB+1 spy provider 在 stat 后零正文 read；实际 stream 长度、stat size 和 expected version 任一漂移均在生成 replacement DTO 前失败。
- PDF、图片、音频、视频、二进制只索引资源元数据，PDF 不抽文本层、不做 OCR；HTML、SVG、URL、Mermaid 等主动内容拒绝索引，全部路径都不执行内容。
- 安全文本复用 Ticket 40 的 `KnowledgeIndexResourceDocument` 与单事务 `replaceResource`；非 Page 只允许正文 FTS，不允许 page/headings/links/tags/tasks 结构事实。
- 文件从可索引文本跨越大小或编码门禁后，事务替换清除旧正文 FTS，只保留资源身份元数据；脱敏 inspection 只返回非空正文行数，不暴露正文或路径。
- 精确 1 file、22/22；相关安全文本/open policy/file kind/索引 Store/Schema/Markdown 抽取 6 files、102/102；索引与持久化专项 6 files、56/56。
- 最终产品范围全仓 1060 files，1059 passed、1 skipped；10684 tests，10678 passed、6 skipped、0 failed。
- typecheck、boundary、目标 ESLint、diff check 与 Open Server production build 通过；better-sqlite3 runtime smoke 通过。
- SQLite schema、ownership、checkpoint/restore policy、`DATA_EPOCH` 与用户事实不变；compatible 指纹为 `sha256:655391089631e5314ad218a5939089c1391ed29e5420efe3d69e2890c4ec2da2`。
- 本票未新增 UI；E2E-KW-013 尚不存在且本票明确不运行 Playwright，仅保留发布级关联，未伪记为通过。

## 下一步

1. 实施 Ticket 43：watcher 增量协调与 rebuild。
2. 按依赖完成 Tickets 44–46 的查询 API、超级搜索和当前资源视图。
3. 完成 Tickets 47–56 的资源树交互与资源操作，再由 Ticket 57 执行完整发布 Gate。

## 保护边界

- Ticket 43 必须复用来源分区 generation Store、Markdown/安全文本抽取器、ResourceIO watcher 和 Ticket 10 operation trace，不新增第二套索引、文件系统或私有 route。
- watcher event 只作为失效信号；索引事实必须重新 `stat` 并按 expected version 读取，不能信任 event payload 的 path/version/content。
- 增量更新必须按来源串行、跨来源可并行；event gap、epoch 变化、overflow、不可解释序列和索引损坏必须升级为来源级 rebuild。
- rebuild 必须写入新 generation，取消或失败保留旧 current；只有完整验证后才能原子发布，不能原地修改 current generation。
- stale event、重复 event 与更新合并必须保持幂等；删除、类型/编码/大小门禁变化必须清除旧派生事实。
- 查询 lease、writer lock、checkpoint/restore policy、schema/extractor version 和 compatible persistence review 必须继续保持 Ticket 40 契约。
- 诊断、trace 与 release evidence 不记录绝对路径、正文、凭证或未脱敏 provider 错误。
- E2E-KW-014 必须等待 watcher/rebuild 公开入口；当前不存在的 spec 不能用私有 route、测试捷径或缩减场景替代。
- 用户的 `.gitignore` 以及 ignored `temp/**`、`teach/**` 内容不属于本 change，不能随 ticket 提交。
- 只有 Lead 操作 Git；不覆盖用户修改。
