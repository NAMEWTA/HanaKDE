# OpenHanako 知识工作区实施交接 08

## 已关闭

- Tickets 01–08、11、13 已关闭，共 10/57。
- Ticket 08 主线实现提交为 `1783fbeb`。
- Renderer 已通过唯一生产级 `knowledgeWorkspaceClient` 消费共享地址、Knowledge/ResourceIO HTTP 与资源事件协议，不访问 Node 文件系统、provider identity 或本机路径。
- Knowledge workspace 使用独立、仅会话态的空白命名空间；启动与切换均不恢复旧 Desk tabs、树状态、挂载或 reading position，Desk 持久状态保持兼容。
- Resource event catch-up/live 已串行化，严格校验 DTO，在 handler 成功后提交 cursor；gap、server sequence epoch 回退与本地路径事件触发权威重查和 watch/preview 恢复。
- 地址 route 从认证上下文执行 `files.read`/`files.write` 授权，并在真实路径与最近存在祖先上复验来源边界；symlink、反斜杠分隔符、伪造 body authority 与 mount 换根均 fail-closed。
- 定向 11 files、193/193；干净全仓 1009 files passed、1 skipped，10130 tests passed、6 skipped；typecheck、boundary、目标 ESLint、Renderer/packages/server build 均通过。
- 标准轴和规范轴复审均通过，0 个阻塞项。

## 下一步

1. Ticket 08 已关闭；按 P0 拓扑继续 Ticket 09，迁移 Mobile 与 LAN 知识契约。
2. 同时已就绪的 P0 包括 Ticket 10、12、14；P0 的 01–14 全部完成前，不宣告 P0 Gate。
3. Ticket 16 接入资源树前必须新增显式 source-root listing 接缝；冻结的 `KnowledgeResourceAddress.relativePath` 不允许为空，不能用空路径或 provider 私有引用绕过。

## 保护边界

- Renderer knowledge client 保持唯一生产实例；不得新建平行 cursor、原生路径或直接 `recordResourceEvent*` 接缝。
- 普通资源访问继续只走共享 `KnowledgeResourceAddress` 与 ResourceIO/provider；复合 mutation 继续走公开 coordinator 和 Operation Journal。
- Knowledge 状态保持独立且仅会话态；不得复用或恢复 Desk tabs、tree、mounts、reading position。
- 远程 DTO、错误、日志和 release evidence 不携带本机绝对路径、正文、凭证或 provider-native identity。
- 用户的 `.gitignore` 以及 ignored `temp/**`、`teach/**` 内容不属于本 change；全仓 Vitest 显式排除这些本地 scratch 目录。
- 只有 Lead 操作 Git；不覆盖用户修改。
