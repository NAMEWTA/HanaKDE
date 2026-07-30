# OpenHanako 知识工作区实施交接 43

## 已关闭

- Tickets 01–43 已关闭，共 43/57；M3 索引/查询阶段完成 4/7。
- Ticket 43 主线实现提交为 `1527ac95`。
- `KnowledgeIndexEventCoordinator` 按来源维护独立 FIFO；同来源写入串行、不同来源可并行，一个来源 unavailable 不阻断其他来源。
- ResourceEvent 只提供需要失效的地址提示；实际存在性、版本、类型、编码和正文都由 ResourceIO 重新 stat/expected-version read，event payload 不成为索引事实。
- 事件采用 100ms debounce、500ms 上限、同路径最后一次重读；同 operationId 关联但不跳过 commit 后每个不同路径的磁盘重读。
- 5,000 events/10s、sequence gap、stale catch-up、不可解析 hint、stale/corrupt/unavailable health 都升级为来源级 full rebuild；重复或乱序旧事件幂等忽略。
- active generation 增量替换/删除获取 writer lock，在单一 SQLite transaction 中更新资源派生行和 `last_complete_sequence`；manifest 发布失败回滚数据并恢复旧 manifest。
- full rebuild 扫描排除 `.trash`，每 200 个资源或 50ms yield；期间事件进入 replay queue，发布前重新读盘、重验 scope/sequence，再走 Ticket 40 checkpoint/验证/原子 manifest 切换。
- 取消、来源失联、scope token 漂移、锁定、schema/extractor stale、损坏、manifest/磁盘故障均不替换旧 current；旧 generation 可继续 lease 读取，没有旧 generation 时明确 unavailable。
- building/stale/degraded/corrupt/locked/unavailable 六类非 ready health 均由 Ticket 43 测试直接覆盖；诊断只含 sourceKey、状态、reason、sequence 与合法 operationId，不含路径、正文或原始 SQLite/provider 错误。
- 精确 2 files、23/23；相关索引/抽取/ResourceEvent/operation 11 files、100/100；持久化 registry/startup/schema tripwire 3 files、21/21。
- 最终产品范围全仓 1062 files，1061 passed、1 skipped；10707 tests，10701 passed、6 skipped、0 failed。
- typecheck、boundary、目标 ESLint、diff check 与 Open Server production build 通过；better-sqlite3 runtime smoke 通过。
- SQLite schema、ownership、checkpoint/restore policy、`DATA_EPOCH` 与用户事实不变；compatible 指纹为 `sha256:1602dd92fc1721fa9fa407d0f38107e613ee4f646eb881cf6aa310d3ac5ac65f`。
- 本票未新增 UI；E2E-KW-013、E2E-KW-014 尚不存在且本票明确不运行 Playwright，仅保留发布级关联，未伪记为通过。

## 下一步

1. 实施 Ticket 44：标签与引用查询 API。
2. 按依赖完成 Ticket 45 超级搜索与 Ticket 46 当前大纲/引用视图。
3. 完成 Tickets 47–56 的资源树交互与资源操作，再由 Ticket 57 执行完整发布 Gate。

## 保护边界

- Ticket 44 查询只能通过 `KnowledgeIndexCoordinator.acquireQueryLease` 读取当前来源 generation，不向 route、Renderer 或调用方暴露 Database、绝对路径或 SQLite 原始错误。
- 标签和反向引用必须严格来源内查询；不得跨来源 join、按同名猜测目标或把未保存 buffer 写入反向引用结果。
- query cursor 必须绑定 sourceKey、generationId、folded query/filter/sort；generation 变化返回明确 stale cursor，不能静默续读新 generation。
- 当前查询已获得的旧 generation lease 必须可完成；新查询只进入原子切换后的 current generation。
- active generation 增量事务和 full rebuild 必须继续共用单一 writer lock/FIFO，不得创建第二套索引或绕过 ResourceIO 重读。
- operationId 只用于 correlation；内部 mutation event 不能被当作已提交文件事实，rollback 事件仍需重新读盘。
- query/diagnostic DTO 不得包含正文全集、绝对路径、凭证、数据库位置或未脱敏 provider/SQLite 错误。
- E2E-KW-013、E2E-KW-014 当前不存在；不得用私有 route、测试捷径、Vitest 或缩减场景伪装发布 E2E。
- 用户的 `.gitignore` 以及 ignored `temp/**`、`teach/**` 内容不属于本 change，不能随 ticket 提交。
- 只有 Lead 操作 Git；不覆盖用户修改。
