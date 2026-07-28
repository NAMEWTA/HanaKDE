# OpenHanako 知识工作区实施交接 09

## 已关闭

- Tickets 01–09、11、13 已关闭，共 11/57。
- Ticket 09 主线实现提交为 `e2d05469`。
- Mobile Knowledge 使用唯一 Renderer knowledge client，以独立会话态异步水合来源；取消、登录 singleflight、启动 epoch 和 cleanup barrier 已覆盖并发初始化、切换与卸载。
- LAN 资源请求只接受共享 `KnowledgeResourceAddress`；绝对路径、native locator、深层 authority 伪造和 legacy ResourceRef 越权均 fail-closed。
- 跨来源 transfer 由 Server 私下解析 SourceRegistry，远程 DTO、事件、错误和日志不暴露本机路径或 provider identity；同相对路径在不同 sourceKey 下保持隔离。
- 远程 source watcher 具备 principal/Studio 绑定租约、续租、幂等释放、指数退避、server epoch/gap 重建与 BFCache suspend/restore；网络与 close 故障不会遗失清理责任。
- 定向 12 files、274/274；干净全仓 1010 files passed、1 skipped，10161 tests passed、6 skipped；typecheck、boundary、目标 ESLint、Renderer/Open Server build 均通过。
- 标准轴与规范轴复审均通过，0 blocker、0 nonblocker。

## 下一步

1. Ticket 09 已关闭；按 P0 拓扑继续 Ticket 10，冻结并实现 operation tracer、journal、锁与恢复屏障。
2. Ticket 10 必须先通读 `operation-journal-contract.md`，以 UUIDv4、canonical JSON SHA-256、15 分钟 TTL、原子 journal 状态机和命名故障注入形成可执行契约。
3. Ticket 10 完成后继续已就绪的 Ticket 12、14；P0 的 01–14 全部完成前不宣告 P0 Gate。

## 保护边界

- 普通资源访问继续只走共享 `KnowledgeResourceAddress` 与 ResourceIO/provider；复合 mutation 必须走公开 coordinator 和 Operation Journal。
- Mobile、LAN 与 Desktop 保持同一 sourceKey、冲突与稳定错误码语义；不得引入绝对路径、provider-native identity 或平行资源协议。
- Remote watcher 的 lease/renew/release、重试与 BFCache 状态机必须保持串行；不得用 fire-and-forget 删除清理责任。
- 远程 DTO、错误、日志和 release evidence 不携带本机绝对路径、正文、凭证或 provider-native identity。
- 用户的 `.gitignore` 以及 ignored `temp/**`、`teach/**` 内容不属于本 change；全仓 Vitest 显式排除这些本地 scratch 目录。
- 只有 Lead 操作 Git；不覆盖用户修改。
