# OpenHanako 知识工作区实施交接 07

## 已关闭

- Tickets 01–07、11、13 已关闭，共 9/57。
- Ticket 07 主线实现提交为 `5ef59690`。
- Server、Desk、Mobile Workbench 与 Knowledge route 已通过共享兼容适配器消费同一逻辑 `main`；活动 session mount 优先，`selectedAgentId` 只参与授权。
- 旧 Desk/Workbench URL 与响应语义保留；远程显式目录/本机路径输入被拒绝，响应与 provider 故障不泄露绝对路径。
- ResourceIO/provider 已提供带 expected-version、Range、HEAD、ETag、scope/root identity 复验的 bounded `openRead`；多块读取保持 chunk 独立。
- Desk 工作区技能与 move 预检已迁移到 ResourceIO/provider；直接 workspace mkdir/delete 豁免已从持久化注册表移除。
- 定向 15 files、165/165；全仓 1007 files passed、1 skipped，10092 tests passed、6 skipped；typecheck、boundary、目标 ESLint、packages/Full/Open build 均通过。
- 标准轴和规范轴复审均通过，0 个阻塞项。

## 下一步

1. Ticket 07 已解锁 Ticket 08 与 Ticket 09；按 P0 拓扑继续 Ticket 08。
2. 同时已就绪的 P0 仍包括 Ticket 09、10、12、14，但在 Ticket 08 完成前不启动依赖其输出的后续 UI tickets。
3. P0 的 01–14 全部完成前，不宣告 P0 Gate。

## 保护边界

- `selectedAgentId` 不得成为 workspace/main 选择输入；与 legacy `agentId` 冲突时继续 fail-closed。
- 普通工作区资源访问继续只走 ResourceIO/provider；不得把 Desk/Workbench 重新分叉成平行文件系统。
- 远程 DTO、错误、日志和 release evidence 不携带本机绝对路径、正文或凭证。
- Full build 本地验证的一次性签名密钥和 keyset 已删除且未进入工作树。
- 用户的 `.gitignore` 以及 ignored `temp/**`、`teach/**` 内容不属于本 change；全仓 Vitest 显式排除这些本地 scratch 目录。
- 只有 Lead 操作 Git；不覆盖用户修改。
