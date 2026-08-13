---
schema_version: 1
artifact: triage
change: 2026-08-13-hanakde-engineering-cognitive-mentor
mode: intake
source: <Path>{roots.state}/specdev/changes/2026-08-13-hanakde-engineering-cognitive-mentor/source.md</Path>
classification: investigation
risk: medium
route: specdev/engineering-cognitive-mentor
ready_for_implementation: false
external_action: not-applicable
updated_at: 2026-08-13T00:00:00+08:00
---

# Triage: HanaKDE 工程认知导师教学

## 当前判定

- **影响：** 形成一套可恢复、可追溯的项目源码与架构教学材料；不改变产品行为。
- **紧急度：** normal
- **当前证据：** 用户明确要求项目全景教学、按业务域并行深入，并确认文档只落在 change 工件；Lead 已静态勘察顶层目录、构建配置、入口、代码规范和核心业务边界。
- **相关代码/工件：** `<Path>README.md</Path>`、`<Path>docs/index.md</Path>`、`<Path>core/engine.ts</Path>`、`<Path>server/index.ts</Path>`、`<Path>hub/index.ts</Path>`、`<Path>desktop/main.cjs</Path>`、`<Path>packages/plugin-protocol/src/index.ts</Path>`、`<Path>lib/resource-io/resource-io.ts</Path>`。

## 未知项

- **可发现事实：** 各 agent 域报告中需要补齐的具体符号、测试覆盖、启动顺序和跨域调用映射。
- **需要用户决定：** 无；文档落点已确认为 change 工件。
- **低影响实现细节：** 教学附件编号、章节顺序和交叉引用由 Lead 按统一文档合同决定。

## 路由

- **下一 Work：** `<Path>{roots.workflows}/specdev/E-engineering-cognitive-mentor/E-engineering-cognitive-mentor.md</Path>`
- **理由：** 请求的核心是非执行型源码研究、因果解释、Why、方案边界和理解路线；不需要 Spec、Ticket 或项目实现。

## 外部动作

- **远程目标：** 无
- **关闭能力：** not-applicable
- **当前状态：** not-applicable
- **授权记录：** 无
- **尝试与结果：** 无
