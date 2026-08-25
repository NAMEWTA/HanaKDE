---
artifact: wayfinder-ticket
id: INV-06
name: 金融正确性数据治理与用户安全契约
parent_map: <Path>{roots.state}/specdev/changes/2026-08-13-personal-quant-finance-workbench/wayfinder-map.md</Path>
label: wayfinder:research
status: closed
blocked_by: []
resolution: answered
---

# 金融正确性数据治理与用户安全契约

## 问题

AFK Research：一个个人量化研究工作台若要让行情、因子、筛选、回测、Agent 报告和历史评估可信，必须把哪些金融语义、数据血缘、偏差防线、隐私/秘密、成本控制、免责声明和验收测试定义成不可妥协的产品契约？

穷尽问题集包括：标的/市场/币种/时区/交易日历；复权、公司行动、停牌、ST、涨跌停、T+1、最小手数；手续费、税、滑点和容量；点时数据、幸存者偏差、未来函数、训练/验证区间；缺失/陈旧/冲突数据及血缘；来源许可和访问条款；持仓/研报/密钥隐私；AI 引用、不确定性、事实与推断分离；模型/数据预算、取消与审计；非投资建议边界。

停止条件：每个问题形成可测试的 MUST/MUST NOT/UNKNOWN 条款，并使用交易所、监管、数据源官方材料或代码事实就近举证；不提供个性化投资建议。目标答案写入 `<Path>{roots.state}/specdev/changes/2026-08-13-personal-quant-finance-workbench/investigation/comments/INV-06/01-solution.md</Path>`。
