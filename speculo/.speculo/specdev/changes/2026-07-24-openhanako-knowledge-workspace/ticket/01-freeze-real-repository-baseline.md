# Ticket 01: 冻结真实仓库基线与兼容契约

- **被阻塞于：** 无
- **状态：** 未开始

## 战略与背景

- **战略：** 把当前 hanakde、upstream、公开路由、ResourceIO、Desk、CM6 和构建接缝固化为可执行基线。
- **需求追踪：** KW-RULE-PREFLIGHT, KW-RULE-TEST
- **当前现状：** 当前分支 hanakde 与 upstream/main 只有 Speculo 文档差异；相关类型检查、boundary、Open build 和 155 个目标测试已通过。
- **用户可验证结果：** 完成本 ticket 后，验收者能够通过公开 API、真实临时 workspace 或可交互 UI 验证本标题声明的单一能力。

## 范围边界

| IN | REUSE | OUT |
|---|---|---|
| 把当前 hanakde、upstream、公开路由、ResourceIO、Desk、CM6 和构建接缝固化为可执行基线。 | `server/composition/open-root.ts`<br>`server/composition/full-root.ts`<br>`server/index.ts`<br>`tests/server-composition-boundary.test.ts` | 未列入本 ticket 的后续功能；修改生成 bundle；创建平行文件系统、编辑器内核或私有 route 捷径 |

## 交付物

- `implementation-baseline.md`
- `tests/knowledge-baseline-contract.test.ts`

## 需阅读的真实文件

- `server/composition/open-root.ts`
- `server/composition/full-root.ts`
- `server/index.ts`
- `tests/server-composition-boundary.test.ts`

## 固定实施契约

- [`implementation-baseline.md`](../implementation-baseline.md)
- [`implementation-baseline.md`](../implementation-baseline.md)
- [`test-strategy.md`](../test-strategy.md)

## 实施顺序

1. 按 `README.md` 文档核对清单与 `implementation-baseline.md` preflight 项在仓库根当场核对，记录所有检查结果。
2. 确认 audited commit 为 HEAD 祖先；关键接缝漂移时先更新 change。
3. 安装并锁定 @playwright/test@1.62.0，增加固定 scripts/config skeleton。
4. 建立 requirements ownership 与 release evidence contract tests。

## 实现约束

1. 普通资源访问必须经现有 ResourceIO/provider；复合 mutation 必须经公开 coordinator 和 Operation Journal。
2. Renderer 不访问 Node 文件系统；远程 DTO、日志和 release evidence 不含绝对路径、正文或凭证。
3. 测试使用隔离临时 HANA_HOME、workspace、来源和端口，不依赖开发机固定路径或网络。
4. 实现不得引入未在 ADR/实施契约冻结的新存储引擎、IPC path surface、恢复状态或 E2E 框架。

## 自动化证据

**Primary ownership：** 无直接用户故事；按上列规则域交付

**必须创建或更新：**

- `tests/knowledge-baseline-contract.test.ts`
- `tests/knowledge-preflight.test.ts`

**对应端到端场景：** 无独立 E2E；由契约/集成测试证明并被下游场景覆盖

## 验收标准

- [ ] 基线文档记录 commit、调用图、现有能力和命令；公开行为测试不访问 Engine 私有状态。
- [ ] `Primary ownership` 明确为无直接用户故事；本 ticket 不新增未分配的产品行为，也不替其他 ticket 兜底。
- [ ] 本 ticket 拥有的每个 `KW-RULE-*` 都满足对应契约文档，并有正常、取消/冲突、权限/不可用和故障注入覆盖。
- [ ] 相关既有回归、`npm run typecheck` 和 `npm run lint:boundary` 通过；涉及 composition、Renderer、preload/main 时运行相应 build。
- [ ] ticket 交付记录只填写实际执行命令、平台和结果；普通执行结果不写入 `LOG.md`。
- [ ] 交付物没有未决的“可能”“按需”“A 或 B”、未选框架、未选 schema 或未定义恢复语义。
