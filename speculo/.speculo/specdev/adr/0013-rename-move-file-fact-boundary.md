# ADR-0013: 同源 rename/move 以文件事实为事务边界

- Status: Accepted
- Date: 2026-08-09
- Source: `<Path>{roots.state}/specdev/archive/2026-07/2026-07-24-openhanako-knowledge-workspace/ADR.md</Path>` (`ADR-0295`)

## 决策上下文

重命名和移动会影响主资源、已保存链接、会话、事件和索引，但这些层不能形成一个物理事务。

## 决策

主资源及全部已计划、已保存链接写入构成 rollback 边界。成功后先写 `COMMITTED`，再幂等执行 session rebind、ResourceEvent 与 index convergence；投影失败进入降级重试，不回滚已提交文件事实。

## 后果

用户文件结果可恢复且语义明确，派生投影允许短暂滞后并需要可靠重试。
