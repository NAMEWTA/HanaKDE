---
artifact: wayfinder-ticket
id: INV-01
name: 核验宿主插件契约与文档漂移
parent_map: <Path>{roots.state}/specdev/changes/2026-08-09-internalize-todolist-plugin/wayfinder-map.md</Path>
label: wayfinder:research
status: closed
blocked_by: []
resolution: answered
---

# 核验宿主插件契约与文档漂移

## 问题

以当前代码、SDK 文档与测试为准，确认 builtin activation、TaskRegistry readiness/recovery、全局 `notification` 事件、Session/Agent helpers、ResourceIO、manifest capabilities 与 iframe host capabilities 的真实可用合同，并裁决 ADR-006 与当前 Spec 对通知能力的表述差异；列出 Todo 可直接消费的能力、必须 fail closed 的缺口，以及若缺失时应拆出的独立系统前置 change。
