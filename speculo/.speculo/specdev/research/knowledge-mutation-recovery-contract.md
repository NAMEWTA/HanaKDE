# Knowledge Mutation Recovery Contract

- Promoted: 2026-08-09
- Source: `<Path>{roots.state}/specdev/archive/2026-07/2026-07-24-openhanako-knowledge-workspace/operation-journal-contract.md</Path>`
- Status: Current mutation and recovery contract

## 持久模型

每个 operation 在 `<HANA_HOME>/knowledge-workspace/operations/v1/<operation-id>/` 保存 journal、上一版本 journal、公开 result 和必要 checkpoint 引用。不得保存正文、凭证或绝对路径。

Server 生成 UUIDv4 operation id。plan TTL 为 15 分钟，完成结果保留 7 天。commit 使用 canonical JSON 的 SHA-256 request hash 实现幂等：相同 id/hash 返回已有结果，不同 hash 返回 `operation_id_reused`。

## 状态与顺序

主状态沿 `PLANNED -> PREPARING -> PREPARED -> COMMITTING -> COMMITTED -> FINALIZED` 推进；提交前失败逆序进入 rollback，不确定状态进入 `RECOVERY_REQUIRED`。任何副作用前先持久化 intent，副作用后再持久化 outcome；状态文件通过 temp、fsync、atomic rename 写入。

Prepare 必须规范化选择、稳定排序获取地址锁、重验 versions/scope/目标、处理 dirty session、建立 checkpoint，并冻结文件写入与 post-commit 投影计划。

同源 rename/move 先提交主资源与全部已计划链接，再写 `COMMITTED`。之后的 session rebind、ResourceEvent 和 index convergence 是幂等投影，失败不得回滚已提交文件事实。

## 恢复屏障

Server 注册 mutation route 前扫描未决 journal。`COMMITTING` 依据磁盘事实继续 commit 或 rollback；`COMMITTED` 补齐 result 与派生投影；无法确定时保持 `RECOVERY_REQUIRED`。恢复期间受影响来源的 mutation 返回 `source_recovery_in_progress`，只读可继续并显示 degraded。

故障测试必须覆盖 prepare 后崩溃、主资源移动后崩溃、链接部分失败、写 `COMMITTED` 后崩溃、投影失败、rollback 失败、磁盘满和权限变化。
