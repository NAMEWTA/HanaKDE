# OpenHanako 知识工作区实施交接 44

## 已关闭

- Tickets 01–44 已关闭，共 44/57；M3 索引/查询阶段完成 5/7。
- Ticket 44 主线实现提交为 `59f03eca`。
- `KnowledgeIndexQueryLease` 新增来源分区 tags、outbound、backlinks 与 outline 类型化查询；Database 实例仍不离开 Store 边界。
- `queryKnowledgeIndex` 对 unknown 输入执行严格字段、sourceKey、canonical relativePath、tag、generationId 与 limit 校验；默认 50、最大 100，并返回确定性排序和 `hasMore`。
- 查询只打开请求 sourceKey 的 current generation，不做跨来源 join；同相对路径在不同来源分别解析，标签和 backlinks 只读已保存索引。
- outbound/outline 提供已保存 generation 基线；Ticket 46 必须从当前 Renderer buffer 实时计算当前页面 outline/outbound，不能把未保存内容写入 Server index。
- 请求可绑定 generationId；current generation 已变化时返回 `knowledge_version_conflict` 与 `stale_generation`，不静默续读新 generation。
- AbortSignal、权限拒绝、索引不可用、底层查询故障和 lease 释放均已覆盖；公开 DTO 不含绝对路径、数据库位置、正文、原始链接文本或 SQLite/provider 原始错误。
- 新增 `POST /api/knowledge-workspace/query` 与 `GET /api/knowledge-workspace/index/status`，二者均要求 `files.read`，并位于共享 Open composition route。
- 精确 1 file、6/6；相关索引/抽取/route 8 files、90/90；持久化/Composition 3 files、26/26；CLI closure 19/19。
- 最终产品范围全仓 1063 files，1062 passed、1 skipped；10713 tests，10707 passed、6 skipped、0 failed。
- typecheck、boundary、目标 ESLint、diff check 与 Open Server production build 通过；better-sqlite3 runtime smoke 通过。
- SQLite schema、持久化字节、ownership、checkpoint/restore policy、`DATA_EPOCH` 与用户事实不变；compatible 指纹为 `sha256:69afabc257caa46498145d054631595bffe3b907e95a393d5229c99bc3a348bf`。
- 本票未新增 UI；E2E-KW-013 尚不存在且本票明确不运行 Playwright，仅保留发布级关联，未伪记为通过。

## 下一步

1. 实施 Ticket 45：超级搜索词法、来源分组、独立分页、连续子串与结果打开。
2. 实施 Ticket 46：当前 buffer outline/outbound 与已保存 backlinks 的真实 UI。
3. 完成 Tickets 47–56 的资源树交互与资源操作，再由 Ticket 57 执行完整发布 Gate。

## 保护边界

- Ticket 45 搜索必须继续通过类型化 query lease，不得向 route、Renderer 或调用方暴露 Database。
- 搜索 cursor 至少绑定 sourceKey、generationId、folded query、filter 与 sort key；generation 变化必须明确 stale。
- 1–2 code points 使用有界可取消扫描，3+ code points 使用 trigram candidate 加 `instr` 确认；不能因 FTS token/rank 漏掉连续子串。
- 多来源搜索必须分别查询、分别分页并按 main/挂载顺序分组；不得跨来源 join 或统一排名。
- 当前 outline/outbound 读取未保存 buffer；Server backlinks/tags/search 只读已保存索引，不能混合两种事实来源。
- query/search/diagnostic DTO 不得包含正文全集、绝对路径、凭证、数据库位置、原始链接文本或未脱敏 provider/SQLite 错误。
- E2E-KW-013 当前不存在；不得用私有 route、测试捷径、Vitest 或缩减场景伪装发布 E2E。
- 用户的 `.gitignore` 以及 ignored `temp/**`、`teach/**` 内容不属于本 change，不能随 ticket 提交。
- 只有 Lead 操作 Git；不覆盖用户修改。
