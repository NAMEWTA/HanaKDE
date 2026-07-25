# OpenHanako Knowledge Workspace Change

本目录是 HanaKDE/OpenHanako 知识工作区的 Speculo/specdev **Markdown 文档包**。<br>
**当前仓库内位置（勿移动）：**

```text
speculo/.speculo/specdev/changes/2026-07-24-openhanako-knowledge-workspace/
```

包内文档之间使用**相对本文件/ticket 的链接**；对产品代码、测试、`silverbullet/` 的引用一律写**仓库根相对路径**（例如 `desktop/src/react/...`、`server/composition/open-root.ts`）。本地 SilverBullet 参考固定为仓库根下的 `silverbullet/`。

本包包含 `.md` 文档、`ticket/` 切片和 Speculo 必需的 `.status.json`；不包含校验脚本或自定义机器清单。

## 文档权威关系

1. [`LOG.md`](./LOG.md) 中 `Status: accepted` 的条目是用户已经确认、当前仍有效的完整产品结论与边界；`deferred` 不得实施，`superseded` 只保留历史。
2. [`ADR.md`](./ADR.md) 保留已有稳定编号及被提升的架构决定，不得删除或复用编号；同号 LOG 保存完整理由和场景。
3. [`CONTEXT.md`](./CONTEXT.md) 保存核心词义、细粒度领域定义和已经确认的 `_Avoid_` 禁止边界。
4. [`spec.md`](./spec.md) 把 accepted 结论规范化为产品行为、Requirement ID 与验收。
5. [`architecture.md`](./architecture.md) 及实施契约把上述决定冻结为唯一可编码方案；[`rules.md`](./rules.md) 约束实施纪律。
6. [`requirements-traceability.md`](./requirements-traceability.md)、[`tickets-map.md`](./tickets-map.md) 与 [`ticket/`](./ticket/) 只负责归属和执行切片，不得缩减上位决策。

这些文件是同一最终设计的不同投影，不允许通过“优先级”忽略冲突。发现 accepted LOG、ADR、CONTEXT、Spec 或实施契约不一致时，必须在编码前同步修正。普通运行结果只写入发布证据，不写入 LOG。

## 产品与架构

- [`spec.md`](./spec.md)：193 条用户故事、22 个冻结规则域与完成定义。
- [`architecture.md`](./architecture.md)：当前 HanaKDE/OpenHanako 代码投影。
- [`rules.md`](./rules.md)：工程与 AI 实施纪律；已删除重复的平行规则文件。
- [`implementation-contracts.md`](./implementation-contracts.md)：preflight、provider identity、native bridge、内部目录和并发。
- [`index-store-contract.md`](./index-store-contract.md)：better-sqlite3 schema、generation、迁移、锁与 rebuild。
- [`operation-journal-contract.md`](./operation-journal-contract.md)：持久 mutation journal、幂等、rollback 和崩溃恢复。
- [`test-strategy.md`](./test-strategy.md)：Vitest/Playwright、24 个 E2E 场景、CI 与平台矩阵。

## 执行与证据

- [`goal-plan.md`](./goal-plan.md)：57 个 ticket 的 P0/P1/P2 Gate、21 个建议波次、Lead+Subagent 八步协议、里程碑验收与进度格式；所有 subagent 固定使用 `gpt-5.6-sol`、medium。
- [`requirements-traceability.md`](./requirements-traceability.md)：193 条故事的 Primary Owner、supporting tickets、自动化证据路径与 E2E（可读权威矩阵）。
- [`tickets-map.md`](./tickets-map.md)、[`ticket/`](./ticket/)：57 个执行切片；各 ticket「需求追踪」行与矩阵一致。
- [`performance-budget.md`](./performance-budget.md)、[`threat-model.md`](./threat-model.md)：可复现性能与威胁—控制—测试矩阵。
- [`release-evidence.md`](./release-evidence.md)、[`release-checklist.md`](./release-checklist.md)：实施后的唯一发布证据位置；不要把运行结果写入 `LOG.md`。
- [`implementation-baseline.md`](./implementation-baseline.md)：当前仓库可读实施基线与 preflight 检查项。
- [`silverbullet-reference-matrix.md`](./silverbullet-reference-matrix.md)：SilverBullet 可审计参考边界与采用级别（许可证见 `silverbullet/LICENSE.md`）。

## 实现前文档核对清单

在仓库根、于开始 Ticket 01/02 之前人工确认：

1. 本包路径仍为上文 Speculo changes 位置；未误挪到其它目录。
2. [`implementation-baseline.md`](./implementation-baseline.md) 中的分支、祖先 commit、版本与关键接缝仍与真实仓库一致。
3. [`tickets-map.md`](./tickets-map.md) 与 `ticket/*.md` 的阻塞关系、需求追踪无占位或断链。
4. [`requirements-traceability.md`](./requirements-traceability.md) 覆盖 KW-US-001–193，且 Primary owner 均非 57。
5. ticket 中标为“当前基座”的文件必须在仓库根存在；标为“由 blocker 交付”的路径必须由对应 blocker 先产生。
6. `silverbullet/` 参考文件与 [`silverbullet-reference-matrix.md`](./silverbullet-reference-matrix.md) 描述一致；复用代码时更新 matrix，并在仓库根维护第三方声明。

通过后从 Ticket 01/02 开始。Ticket 57 只运行和汇总证据，不首次实现任何能力。
