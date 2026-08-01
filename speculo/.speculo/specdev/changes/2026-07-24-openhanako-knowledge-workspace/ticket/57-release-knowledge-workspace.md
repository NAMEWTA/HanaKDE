# Ticket 57: 执行集成、迁移与发布 Gate

- **被阻塞于：** [`09-migrate-mobile-lan-contract.md`](./09-migrate-mobile-lan-contract.md)、[`13-establish-performance-fixtures.md`](./13-establish-performance-fixtures.md)、[`14-establish-malicious-workspace-tests.md`](./14-establish-malicious-workspace-tests.md)、[`22-deliver-close-switch-orphan-flow.md`](./22-deliver-close-switch-orphan-flow.md)、[`33-deliver-mermaid-and-math.md`](./33-deliver-mermaid-and-math.md)、[`34-deliver-footnotes.md`](./34-deliver-footnotes.md)、[`35-deliver-safe-html-and-external-links.md`](./35-deliver-safe-html-and-external-links.md)、[`36-deliver-find-replace.md`](./36-deliver-find-replace.md)、[`39-deliver-page-section-embeds.md`](./39-deliver-page-section-embeds.md)、[`45-deliver-super-search.md`](./45-deliver-super-search.md)、[`46-deliver-current-resource-views.md`](./46-deliver-current-resource-views.md)、[`53-deliver-resource-drag-drop.md`](./53-deliver-resource-drag-drop.md)、[`54-deliver-atomic-rename-move.md`](./54-deliver-atomic-rename-move.md)、[`56-deliver-trash-restore-cleanup.md`](./56-deliver-trash-restore-cleanup.md)
- **状态：** implemented_waiting_gate（本机门禁通过；等待 Windows/Linux 与 reference performance runner）

## 战略与背景

- **战略：** 只汇总已实现能力的 Open/Full、Desktop、Server、LAN/Mobile、三平台、五语言、a11y、主题、性能、安全与迁移证据。
- **需求追踪：** KW-RULE-RELEASE, KW-RULE-TEST
- **当前现状：** change 文档位于本 ticket 的父目录，代码根的 `package.json` 位于仓库根；本 ticket 只汇总 blocker 已产生的证据。
- **用户可验证结果：** 完成本 ticket 后，验收者能够通过公开 API、真实临时 workspace 或可交互 UI 验证本标题声明的单一能力。

## 范围边界

| IN | REUSE | OUT |
|---|---|---|
| 只汇总已实现能力的 Open/Full、Desktop、Server、LAN/Mobile、三平台、五语言、a11y、主题、性能、安全与迁移证据。 | `spec.md`<br>`requirements-traceability.md`<br>`package.json`<br>`tickets-map.md` | 未列入本 ticket 的后续功能；修改生成 bundle；创建平行文件系统、编辑器内核或私有 route 捷径 |

## 交付物

> 以下仅列主要交付物，不构成文件白名单或完整清单；为满足本 ticket 验收而新增/修改的同范围实现、类型、schema、fixture、测试、i18n 与文档同属交付物。

- `tests/knowledge-workspace-e2e/`
- `release-checklist.md`
- `release-evidence.md`

## 实施时需阅读的文件

> 以下列出本 ticket 的具体代码接缝；实施前还必须按 [`README.md`](../README.md) 的文档权威关系读取 accepted [`LOG.md`](../LOG.md)、[`ADR.md`](../ADR.md)、[`CONTEXT.md`](../CONTEXT.md)、[`spec.md`](../spec.md) 及本 ticket 的固定实施契约，不能因本节或交付物未逐项复写而遗漏已确认结论。

- `../spec.md`
- `../requirements-traceability.md`
- `package.json`
- `../tickets-map.md`

## 固定实施契约

- [`test-strategy.md`](../test-strategy.md)
- [`release-evidence.md`](../release-evidence.md)
- [`release-checklist.md`](../release-checklist.md)

## 实施顺序

1. 运行 ownership validator，确认 193 条 story 的非 57 owner 全部完成。
2. 执行 24 个 E2E 场景及三 project/平台矩阵。
3. 填写 release-evidence.md 的实际命令、artifact、失败与未执行项。
4. 不得修改 LOG.md 记录普通测试运行，不得首次实现功能。

## 实现约束

1. 普通资源访问必须经现有 ResourceIO/provider；复合 mutation 必须经公开 coordinator 和 Operation Journal。
2. Renderer 不访问 Node 文件系统；远程 DTO、日志和 release evidence 不含绝对路径、正文或凭证。
3. 测试使用隔离临时 HANA_HOME、workspace、来源和端口，不依赖开发机固定路径或网络。
4. 实现不得引入未在 ADR/实施契约冻结的新存储引擎、IPC path surface、恢复状态或 E2E 框架。

## 自动化证据

**Primary ownership：** 无直接用户故事；按上列规则域交付

**必须创建或更新：**

- `tests/knowledge-workspace-e2e/`
- `tests/knowledge-release-evidence.test.ts`

**Playwright 发布回归：** 适用；运行 E2E-KW-001、E2E-KW-002、E2E-KW-003、E2E-KW-004、E2E-KW-005、E2E-KW-006、E2E-KW-007、E2E-KW-008、E2E-KW-009、E2E-KW-010、E2E-KW-011、E2E-KW-012、E2E-KW-013、E2E-KW-014、E2E-KW-015、E2E-KW-016、E2E-KW-017、E2E-KW-018、E2E-KW-019、E2E-KW-020、E2E-KW-021、E2E-KW-022、E2E-KW-023、E2E-KW-024

## 验收标准

- [x] 不得首次实现业务行为；全部需求有 owner/ticket/test；24 个固定 E2E 场景和实际执行命令有证据，未执行项明确列出。
- [x] `Primary ownership` 明确为无直接用户故事；本 ticket 不新增未分配的产品行为，也不替其他 ticket 兜底。
- [ ] 本 ticket 拥有的每个 `KW-RULE-*` 都满足对应契约文档，并有正常、取消/冲突、权限/不可用和故障注入覆盖。
- [x] 相关既有回归、`npm run typecheck` 和 `npm run lint:boundary` 通过；涉及 composition、Renderer、preload/main 时运行相应 build。
- [x] ticket 交付记录只填写实际执行命令、平台和结果；普通执行结果不写入 `LOG.md`。
- [x] 交付物没有未决的“可能”“按需”“A 或 B”、未选框架、未选 schema 或未定义恢复语义。

## 实现交接摘要

- **本机结果：** macOS arm64 的 Desktop Full 为 21 passed/3 matrix skips，Web Open 为 16/8，Web Full 为 1/23；`E2E-KW-001`—`024` 全部存在可执行 spec，并按 project 适用性实际运行。
- **仓库门禁：** ownership/evidence validator 4/4、Ticket 46–56 精确聚合 65/65、lint 0 errors、typecheck、boundary、Open smoke、packages/Renderer/preload/main/Open/Full server build 均通过；`npm test -- --maxWorkers=4` 为 1088 files passed/1 skipped、10795 tests passed/6 skipped。
- **发布阻断：** 当前机器无法产出 Windows/Linux 文件系统与 native matrix；完整 performance 必须在满足 8 logical CPU、16 GiB、SSD、production build 的 reference runner 上写出原始 JSON，当前保持“未执行”。因此本 ticket 为 `implemented_waiting_gate`，不得宣称发布 Gate 全绿。
- **提交与偏差：** 证据对应当前工作树（基于 HEAD `442ef4f4`，本次未创建提交）；未修改 `LOG.md`，未使用内置插件，未在本 ticket 首次实现业务能力。
