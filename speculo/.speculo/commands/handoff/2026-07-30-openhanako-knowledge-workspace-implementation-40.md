# OpenHanako 知识工作区实施交接 40

## 已关闭

- Tickets 01–40 已关闭，共 40/57；M3 索引/查询阶段完成 1/7。
- Ticket 40 主线实现提交为 `7fe54ac1`。
- 建立严格 schema v1 和 meta/PRAGMA 契约；全文候选列使用 folded trigram FTS5，磁盘 generation 是索引事实。
- 每个 workspace/source root identity 使用不可逆摘要独立分区；SourceRegistry 在构建前与 publish 前重新验证身份和 scope，单来源损坏不会污染其他来源。
- `current.json` 经 tmp、fsync、rename 原子发布；发布前执行 WAL checkpoint、quick_check、schema/meta/count invariant、close 和 sidecar 检查，失败或取消保留旧 current。
- 单 writer lock 使用原子目录和 10 秒 heartbeat；同 host 活进程不抢锁、死进程超过 60 秒才回收，其他 host 不自动抢锁。
- query lease 保持当前/上一 generation 的 Windows-safe 生命周期；清理至少保留上一代和 24 小时窗口，不删除仍被租用的 generation。
- health 统一为 ready/building/stale/degraded/corrupt/locked/unavailable，不暴露绝对路径、正文、SQLite handle 或原始错误。
- schema/extractor mismatch 只触发新 generation rebuild，不做 in-place migration；manifest、主库、WAL、symlink、磁盘满、checkpoint busy 与锁清理故障均有注入测试。
- 索引已登记为可丢弃、可独立重建且不进入 checkpoint 的 regenerable persistence store；`DATA_EPOCH` 未变化。
- 精确 2 files、13/13；最终产品范围全仓 1058 files，1057 passed、1 skipped；10652 tests，10646 passed、6 skipped、0 failed。
- typecheck、boundary、目标 ESLint、diff check 与 Open Server production build 通过；better-sqlite3 runtime smoke 通过。
- E2E-KW-013/014 尚不存在且本票明确不运行 Playwright；仅保留发布级关联，未伪记为通过。

## 下一步

1. 实施 Ticket 41：提取 Markdown 索引事实。
2. 按依赖顺序完成 Tickets 42–46，交付结构/引用投影、watcher/rebuild、查询、搜索和当前资源视图。
3. 完成 Tickets 47–56 的资源树交互与资源操作，再由 Ticket 57 执行完整发布 Gate。

## 保护边界

- 普通资源内容必须经 ResourceIO/provider 读取；索引层不能旁路来源授权或把绝对路径持久化到 manifest、DTO、日志或 evidence。
- 分区身份必须由 workspace/source/root identity 共同决定，并在 publish 前重新验证；不能只按 sourceKey 或相对路径复用。
- 索引是可丢弃派生数据，磁盘 Markdown/资源仍是唯一事实；schema/extractor 变化不得原地迁移或提升 `DATA_EPOCH`。
- publish 前必须 checkpoint、验证、close 并拒绝 sidecar；取消、故障或锁清理失败不能回滚已成功发布的 generation，也不能破坏旧可用 current。
- Database handle、内部 publish/cancel 能力和管理路径不得暴露给 route、Renderer 或 extractor。
- Ticket 41 只负责源 Page 的抽取与写入；嵌入派生正文不得重复进入宿主索引。
- E2E-KW-013/014 必须等待后续真实公开入口，不能添加私有 route、测试捷径或缩减发布场景。
- 用户的 `.gitignore` 以及 ignored `temp/**`、`teach/**` 内容不属于本 change，不能随 ticket 提交。
- 只有 Lead 操作 Git；不覆盖用户修改。
