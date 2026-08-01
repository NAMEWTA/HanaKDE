# Ticket 53: 交付资源树与编辑器拖拽协议

- **被阻塞于：** [`38-deliver-attachments-cross-source-copy.md`](./38-deliver-attachments-cross-source-copy.md)、[`48-deliver-tree-keyboard-range-selection.md`](./48-deliver-tree-keyboard-range-selection.md)、[`50-deliver-create-page-folder.md`](./50-deliver-create-page-folder.md)、[`51-deliver-import-native-picker.md`](./51-deliver-import-native-picker.md)、[`52-deliver-internal-clipboard.md`](./52-deliver-internal-clipboard.md)
- **状态：** 已完成

## 战略与背景

- **战略：** 统一内部资源、外部文件、树目标和编辑器插入的 typed drag payload、effect 与 preflight。
- **需求追踪：** KW-US-184, KW-US-185, KW-RULE-OP, KW-RULE-DND
- **当前现状：** 当前实现接缝位于 `desktop/src/react/components/desk/DeskTree.tsx`、`desktop/src/react/utils/app-file-drag.ts`；本 ticket 只扩展这些公开边界。
- **用户可验证结果：** 完成本 ticket 后，验收者能够通过公开 API、真实临时 workspace 或可交互 UI 验证本标题声明的单一能力。

## 范围边界

| IN | REUSE | OUT |
|---|---|---|
| 统一内部资源、外部文件、树目标和编辑器插入的 typed drag payload、effect 与 preflight。 | `desktop/src/react/components/desk/DeskTree.tsx`<br>`desktop/src/react/utils/app-file-drag.ts` | 未列入本 ticket 的后续功能；修改生成 bundle；创建平行文件系统、编辑器内核或私有 route 捷径 |

## 交付物

> 以下仅列主要交付物，不构成文件白名单或完整清单；为满足本 ticket 验收而新增/修改的同范围实现、类型、schema、fixture、测试、i18n 与文档同属交付物。

- `shared/knowledge-drag-contract.ts`
- `desktop/src/react/components/knowledge-workspace/knowledge-drag-controller.ts`

## 实施时需阅读的文件

> 以下列出本 ticket 的具体代码接缝；实施前还必须按 [`README.md`](../README.md) 的文档权威关系读取 accepted [`LOG.md`](../LOG.md)、[`ADR.md`](../ADR.md)、[`CONTEXT.md`](../CONTEXT.md)、[`spec.md`](../spec.md) 及本 ticket 的固定实施契约，不能因本节或交付物未逐项复写而遗漏已确认结论。

- `desktop/src/react/components/desk/DeskTree.tsx`
- `desktop/src/react/utils/app-file-drag.ts`

## 固定实施契约

- [`operation-journal-contract.md`](../operation-journal-contract.md)

## 实施顺序

1. 先以当前真实文件和公开契约建立失败测试，不访问 Engine 私有字段。
2. 实现本 ticket 的最小垂直切片，复用 ResourceIO、共享 IR、coordinator 或既有 UI 接缝。
3. 补齐取消、冲突、权限/不可用、外部变化和清理路径。
4. 运行精确自动化、相关回归、typecheck 与 boundary 检查并记录实际结果。

## 实现约束

1. 普通资源访问必须经现有 ResourceIO/provider；复合 mutation 必须经公开 coordinator 和 Operation Journal。
2. Renderer 不访问 Node 文件系统；远程 DTO、日志和 release evidence 不含绝对路径、正文或凭证。
3. 测试使用隔离临时 HANA_HOME、workspace、来源和端口，不依赖开发机固定路径或网络。
4. 实现不得引入未在 ADR/实施契约冻结的新存储引擎、IPC path surface、恢复状态或 E2E 框架。
5. 本 ticket 新增 UI 同时交付 zh-CN、zh-TW、en、ja、ko、键盘、ARIA、focus、亮暗主题和窄布局。

## 自动化证据

**Primary ownership：** KW-US-184, KW-US-185

**必须创建或更新：**

- `tests/knowledge-drag-contract.test.ts`
- `desktop/src/react/__tests__/components/knowledge-drag-controller.test.ts`

**Playwright 用户流程：** 适用；运行 E2E-KW-018

## 验收标准

- [x] 跨来源永远 copy；同源 move 进入重构计划；非法 drop 不修改文件或 Markdown。
- [x] KW-US-184/185 由 typed effect、800ms hover expand、edge scroll、cancel、选择和焦点恢复测试直接证明。
- [x] 本 ticket 拥有的每个 `KW-RULE-*` 都满足对应契约文档，并有正常、取消/冲突、权限/不可用和故障注入覆盖。
- [x] 相关既有回归、`npm run typecheck` 和 `npm run lint:boundary` 通过；涉及 composition、Renderer、preload/main 时运行相应 build。
- [x] ticket 交付记录只填写实际执行命令、平台和结果；普通执行结果不写入 `LOG.md`。
- [x] 交付物没有未决的“可能”“按需”“A 或 B”、未选框架、未选 schema 或未定义恢复语义。

## 实现交接摘要

- **实现结果：** 树与编辑器共享的无绝对路径拖拽协议、内部 payload、外部导入和 drop controller 已交付。
- **精确自动化：** `knowledge-drag-contract、knowledge-drag-controller` 相关测试包含于最终聚合命令，23 files、65/65 tests 通过；E2E-KW-018 已在 macOS arm64 的实际 Playwright project 中通过。
- **仓库门禁：** `npm run lint`（0 errors）、`npm run typecheck`、`npm run lint:boundary`、Open/Full/Renderer/preload/main/server build 与本机 E2E 矩阵通过；完整 `npm test` 的最终复跑由 Ticket 57 汇总。
- **提交与偏差：** 实现位于当前工作树（基于 HEAD `442ef4f4`，本次未创建提交）；无产品或架构偏差，未使用内置插件。
