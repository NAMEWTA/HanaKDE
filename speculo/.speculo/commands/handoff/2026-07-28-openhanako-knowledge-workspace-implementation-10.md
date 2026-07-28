# OpenHanako 知识工作区实施交接 10

## 已关闭

- Tickets 01–11、13 已关闭，共 12/57。
- Ticket 10 主线实现提交为 `bfd5fa93`。
- Operation plan 使用服务端 UUIDv4、递归 canonical JSON SHA-256 request hash 与 15 分钟 TTL，并冻结 owner/source/root/version/target；coordinator 与 provider 两层重验 source version 和 target absent。
- Operation Journal 以 fsync、原子 rename、`.prev` 回退、稳定地址锁和 request-hash 幂等提交持久化状态；checkpoint 先于高风险 rename，失败可用同一 operationId/correlation 回滚，失败恢复进入 `RECOVERY_REQUIRED`。
- mutation route 注册前执行 recovery barrier；恢复会重建缺失终态结果、续跑 rollback/commit projections，并只按当前 source root identity 聚合 `recovering` 状态。
- Renderer 公开 client 提供 plan/commit/cancel/get 严格 DTO；响应、journal、错误和证据均不暴露绝对路径、正文、凭证或 provider-native identity。
- 精确 operation/journal/recovery 测试 22/22；相关定向 16 files、255/255；持久化回归 21/21；开放边界/closure/export 回归 56/56。
- 干净全仓（排除用户本地 ignored `temp/**` scratch）1013 files passed、1 skipped，10190 tests passed、6 skipped；typecheck、boundary、目标 ESLint、Renderer/Open Server build 和 diff check 均通过。
- 标准轴与规范轴复审均通过，0 blocker、0 nonblocker。

## 下一步

1. Ticket 10 已关闭；按 P0 拓扑继续 Ticket 12，提取 policy-driven CM6 surface，并保持 Ticket 11 的共享 Markdown IR 为唯一语义入口。
2. Ticket 12 完成后继续已就绪的 Ticket 14；P0 的 01–14 全部完成前不宣告 P0 Gate。
3. 后续 mutation tickets 50–56 必须复用 Ticket 10 coordinator 与 Operation Journal，不得各自创建平行批次、锁、幂等或恢复协议。

## 保护边界

- 普通资源访问继续只走共享 `KnowledgeResourceAddress` 与 ResourceIO/provider；复合 mutation 必须走公开 coordinator 和 Operation Journal。
- Operation plan、journal schema、状态机、TTL、request hash、checkpoint、rollback 与 recovery 语义已经冻结；后续 owner tickets 只能扩展 operation kind 与逐项步骤，不得分叉协议。
- mutation route 必须在 recovery barrier 后注册；持久化终态与 post-commit projections 保持“已提交不回滚、失败可重放”的边界。
- 远程 DTO、错误、日志和 release evidence 不携带本机绝对路径、正文、凭证或 provider-native identity。
- 用户的 `.gitignore` 以及 ignored `temp/**`、`teach/**` 内容不属于本 change；全仓 Vitest 显式排除这些本地 scratch 目录。
- 只有 Lead 操作 Git；不覆盖用户修改。
