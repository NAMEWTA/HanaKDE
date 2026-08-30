# ADR-0030: 退役被拒绝的独立工作台插件

- Status: Accepted
- Date: 2026-08-30
- Source: `<Path>{roots.state}/specdev/archive/2026-08/2026-08-28-knowledge-explorer-convergence/spec.md</Path>`、`<Path>{roots.state}/specdev/archive/2026-08/2026-08-28-knowledge-explorer-convergence/evidence/T-00.md</Path>`、`<Path>{roots.state}/specdev/archive/2026-08/2026-08-28-knowledge-explorer-convergence/evidence/T-03.md</Path>`

## 决策上下文

Finance Workbench 与 Markdown WeChat 曾作为内置插件交付，但它们扩展了独立数据、页面、构建、持久化和测试表面，同时与 Knowledge、Todo 和共享 Desk/Preview owner 形成重复或被用户拒绝的产品方向。继续把历史发布事实当作现役架构，会让后续维护者恢复已经删除的消费者或为无运行时入口的领域契约继续投入。

## 决策

Finance Workbench 与 Markdown WeChat 从 HanaKDE 的 bundled/runtime 产品中退役。它们的源码、生成资产、专属页面能力、持久化登记和独占测试接缝不再属于现役系统；历史实现与验收只保留在 SpecDev archive 和 release digest 中。

Knowledge 继续由共享 Desk/Preview 和 Knowledge backend 交付，Todo 继续由现有 builtin Todo plugin 交付。恢复任一退役工作台必须通过新的明确产品、安全和维护成本决策，不得仅因历史 ADR、归档或 release digest 存在而重新启用。

## 后果

现役产品减少两个独立 owner 和对应维护面，牺牲短期功能广度以换取单一支持路径和更清晰的运行时边界。与退役工作台绑定的永久术语不再作为当前知识；相关历史 ADR 保留并标记为被本决策取代。Host 通用插件 surface capability 仍由 ADR-0028 约束，不随具体插件退役。
