# Ticket 53: 交付资源树与编辑器拖拽协议

- **被阻塞于：** [`38-deliver-attachments-cross-source-copy.md`](./38-deliver-attachments-cross-source-copy.md)、[`48-deliver-tree-keyboard-range-selection.md`](./48-deliver-tree-keyboard-range-selection.md)、[`50-deliver-create-page-folder.md`](./50-deliver-create-page-folder.md)、[`51-deliver-import-native-picker.md`](./51-deliver-import-native-picker.md)、[`52-deliver-internal-clipboard.md`](./52-deliver-internal-clipboard.md)
- **状态：** 未开始

## 战略与背景

- **战略：** 统一内部资源、外部文件、树目标和编辑器插入的 typed drag payload、effect 与 preflight。
- **需求追踪：** KW-RULE-OP, KW-RULE-DND
- **当前现状：** 当前实现接缝位于 `desktop/src/react/components/desk/DeskTree.tsx`、`desktop/src/react/utils/app-file-drag.ts`；本 ticket 只扩展这些公开边界。
- **用户可验证结果：** 完成本 ticket 后，验收者能够通过公开 API、真实临时 workspace 或可交互 UI 验证本标题声明的单一能力。

## 范围边界

| IN | REUSE | OUT |
|---|---|---|
| 统一内部资源、外部文件、树目标和编辑器插入的 typed drag payload、effect 与 preflight。 | `desktop/src/react/components/desk/DeskTree.tsx`<br>`desktop/src/react/utils/app-file-drag.ts` | 未列入本 ticket 的后续功能；修改生成 bundle；创建平行文件系统、编辑器内核或私有 route 捷径 |

## 交付物

- `shared/knowledge-drag-contract.ts`
- `desktop/src/react/components/knowledge-workspace/knowledge-drag-controller.ts`

## 需阅读的真实文件

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

**Primary ownership：** 无直接用户故事；按上列规则域交付

**必须创建或更新：**

- `tests/knowledge-drag-contract.test.ts`
- `desktop/src/react/__tests__/components/knowledge-drag-controller.test.ts`

**对应端到端场景：** E2E-KW-018

## 验收标准

- [ ] 跨来源永远 copy；同源 move 进入重构计划；非法 drop 不修改文件或 Markdown。
- [ ] `Primary ownership` 明确为无直接用户故事；本 ticket 不新增未分配的产品行为，也不替其他 ticket 兜底。
- [ ] 本 ticket 拥有的每个 `KW-RULE-*` 都满足对应契约文档，并有正常、取消/冲突、权限/不可用和故障注入覆盖。
- [ ] 相关既有回归、`npm run typecheck` 和 `npm run lint:boundary` 通过；涉及 composition、Renderer、preload/main 时运行相应 build。
- [ ] ticket 交付记录只填写实际执行命令、平台和结果；普通执行结果不写入 `LOG.md`。
- [ ] 交付物没有未决的“可能”“按需”“A 或 B”、未选框架、未选 schema 或未定义恢复语义。
