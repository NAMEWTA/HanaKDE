---
artifact: wayfinder-ticket
id: INV-03
name: A 股数据能力层与降级治理
parent_map: <Path>{roots.state}/specdev/changes/2026-08-13-personal-quant-finance-workbench/wayfinder-map.md</Path>
label: wayfinder:research
status: closed
blocked_by: []
resolution: answered
---

# A 股数据能力层与降级治理

## 问题

AFK Research：在固定 commit `3a3149dedbe30cda58b5c94387039d7e707cedcd` 上，a-stock-data 的行情、研报、信号、资金、新闻、财务、公告、打板、期权和舆情能力如何定义请求、字段、源优先级、限流与备用源；其中哪些是可产品化的数据契约，哪些只是易失的抓取技巧或不适合内置插件的风险？

穷尽问题集包括：端点/协议/依赖/鉴权/地域限制；字段语义和标的规范化；缓存、限流、超时和降级；点时数据、复权、交易日历与质量校验缺口；来源条款和许可证；HTTP 与 mootdx TCP 的 Hana 权限适配；数据 provider 接口应怎样隔离源变化；首版必需与延后能力。

停止条件：每一数据层均有主源、备用源、稳定性、合规/许可、规范化和 Hana 接入结论；明确禁止把未经验证的网页接口承诺成稳定产品契约。目标答案写入 `<Path>{roots.state}/specdev/changes/2026-08-13-personal-quant-finance-workbench/investigation/comments/INV-03/01-solution.md</Path>`。
