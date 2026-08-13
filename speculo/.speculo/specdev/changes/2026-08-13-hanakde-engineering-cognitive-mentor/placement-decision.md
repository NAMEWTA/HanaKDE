---
schema_version: 1
artifact: feature-placement
change: 2026-08-13-hanakde-engineering-cognitive-mentor
---

# 落点裁决：HanaKDE 工程认知教学资料

**功能本质**：消费仓库源码、测试、配置和 Speculo 研究规则，新增一组只读、可恢复的工程教学工件；产物归当前 Speculo change，不改变 HanaKDE 运行时状态或用户数据。

**落点**：HanaKDE 系统本体之外的 Speculo change 工件（不进入 `plugins/`）。

## 关键判据

- **支持 change 工件落点：** 不新增会话编排、Provider、权限、持久化迁移或系统契约；不需要启动即常驻；不需要任何插件贡献面；教学记录必须跨越多个系统域并由工程认知导师负责恢复。
- **反对插件落点（最强反方）：** 文档可以被某个插件页面展示，但那会把跨域研究误归为可删除的运行时能力，无法成为 HanaKDE 的插件消费契约，也不能替代 Speculo 教学工件的事实/推断/待验证治理。

## 边界风险

判据一边倒，风险低。后续若要把稳定知识同步到项目长期 `docs/`，应另行确认文档 owner、版本维护和归档提升，不在本 change 的 E Work 内隐式执行。

## 落点建议

- 主产物：`<Path>{roots.state}/specdev/changes/2026-08-13-hanakde-engineering-cognitive-mentor/engineering-cognitive-mentor.md</Path>`
- 深度教学附件：`<Path>{roots.state}/specdev/changes/2026-08-13-hanakde-engineering-cognitive-mentor/teaching/</Path>`
- 详细并行调查：`<Path>{roots.state}/specdev/changes/2026-08-13-hanakde-engineering-cognitive-mentor/investigation/</Path>`（仅在需要保留 agent 原始调查时使用）

## 下游衔接

本 change 使用工程认知导师 Work；不触发插件脚手架、不生成实现 Ticket，也不修改系统本体。
