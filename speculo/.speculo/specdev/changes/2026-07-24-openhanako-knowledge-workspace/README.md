# OpenHanako Knowledge Workspace Change

本目录是 HanaKDE/OpenHanako 知识工作区的 Speculo/specdev **Markdown 文档包**。  
**当前仓库内位置（勿移动）：**

```text
speculo/.speculo/specdev/changes/2026-07-24-openhanako-knowledge-workspace/
```

包内文档之间使用**相对本文件/ticket 的链接**；对产品代码、测试、`silverbullet/` 的引用一律写**仓库根相对路径**（例如 `desktop/src/react/...`、`server/composition/open-root.ts`）。本地 SilverBullet 参考固定为仓库根下的 `silverbullet/`。

本包**仅含 `.md` 文档**（加 `ticket/` 下切片），不包含校验脚本或机器 JSON 清单。

## 基础事实层

1. [`ADR.md`](./ADR.md)：完整架构、产品、安全、事务及实施细化决定。
2. [`CONTEXT.md`](./CONTEXT.md)：规范词汇、全部细粒度定义和 `_Avoid_`。
3. [`LOG.md`](./LOG.md)：完整设计问答、理由、取舍与代价；不是运行日志。

三者可以为消除冲突和歧义做语义一致的合并修正，但不能删减原意或信息覆盖。所有其他文件由它们派生。

## 产品与架构

- [`spec.md`](./spec.md)：173 条用户故事、22 个冻结规则域与完成定义。
- [`architecture.md`](./architecture.md)：当前 HanaKDE/OpenHanako 代码投影。
- [`rules.md`](./rules.md) / [`OPENHANAKO_AI_RULES.md`](./OPENHANAKO_AI_RULES.md)：工程与 AI 实施纪律。
- [`implementation-contracts.md`](./implementation-contracts.md)：preflight、provider identity、native bridge、内部目录和并发。
- [`index-store-contract.md`](./index-store-contract.md)：better-sqlite3 schema、generation、迁移、锁与 rebuild。
- [`operation-journal-contract.md`](./operation-journal-contract.md)：持久 mutation journal、幂等、rollback 和崩溃恢复。
- [`test-strategy.md`](./test-strategy.md)：Vitest/Playwright、24 个 E2E 场景、CI 与平台矩阵。

## 执行与证据

- [`requirements-traceability.md`](./requirements-traceability.md)：173 条故事的 Primary Owner、supporting tickets、自动化证据路径与 E2E（可读权威矩阵）。
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
4. [`requirements-traceability.md`](./requirements-traceability.md) 覆盖 KW-US-001–173，且 Primary owner 均非 57。
5. 即将修改的「需阅读的真实文件 / REUSE」路径在仓库根下存在（未来 `knowledge-workspace` 交付物除外）。
6. `silverbullet/` 参考文件与 [`silverbullet-reference-matrix.md`](./silverbullet-reference-matrix.md) 描述一致；复用代码时更新 matrix，并在仓库根维护第三方声明。

通过后从 Ticket 01/02 开始。Ticket 57 只运行和汇总证据，不首次实现任何能力。
