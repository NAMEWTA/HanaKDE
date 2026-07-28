# Ticket 20: 交付编辑组、标签、临时预览与面包屑

- **被阻塞于：** [`15-deliver-knowledge-shell.md`](./15-deliver-knowledge-shell.md)、[`18-establish-document-session-registry.md`](./18-establish-document-session-registry.md)
- **状态：** 已完成

## 战略与背景

- **战略：** 实现递归编辑组、组内 tabs、全局资源复用、显式侧边打开、preview tab 和真实路径面包屑。
- **需求追踪：** KW-US-035, KW-US-036, KW-US-037, KW-US-038, KW-US-039, KW-US-040, KW-US-049, KW-US-053, KW-US-054
- **当前现状：** 当前实现接缝位于 `desktop/src/react/components/preview/TabBar.tsx`、`desktop/src/react/stores/preview-slice.ts`；本 ticket 只扩展这些公开边界。
- **用户可验证结果：** 完成本 ticket 后，验收者能够通过公开 API、真实临时 workspace 或可交互 UI 验证本标题声明的单一能力。

## 范围边界

| IN | REUSE | OUT |
|---|---|---|
| 实现递归编辑组、组内 tabs、全局资源复用、显式侧边打开、preview tab 和真实路径面包屑。 | `desktop/src/react/components/preview/TabBar.tsx`<br>`desktop/src/react/stores/preview-slice.ts` | 未列入本 ticket 的后续功能；修改生成 bundle；创建平行文件系统、编辑器内核或私有 route 捷径 |

## 交付物

> 以下仅列主要交付物，不构成文件白名单或完整清单；为满足本 ticket 验收而新增/修改的同范围实现、类型、schema、fixture、测试、i18n 与文档同属交付物。

- `desktop/src/react/components/knowledge-workspace/KnowledgeEditorGroups.tsx`
- `desktop/src/react/components/knowledge-workspace/KnowledgeTabBar.tsx`

## 实施时需阅读的文件

> 以下列出本 ticket 的具体代码接缝；实施前还必须按 [`README.md`](../README.md) 的文档权威关系读取 accepted [`LOG.md`](../LOG.md)、[`ADR.md`](../ADR.md)、[`CONTEXT.md`](../CONTEXT.md)、[`spec.md`](../spec.md) 及本 ticket 的固定实施契约，不能因本节或交付物未逐项复写而遗漏已确认结论。

- `desktop/src/react/components/preview/TabBar.tsx`
- `desktop/src/react/stores/preview-slice.ts`

## 固定实施契约

- [`architecture.md`](../architecture.md)
- [`spec.md`](../spec.md)

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

**Primary ownership：** KW-US-035, KW-US-036, KW-US-037, KW-US-038, KW-US-039, KW-US-040, KW-US-049, KW-US-053, KW-US-054

**必须创建或更新：**

- `desktop/src/react/__tests__/components/KnowledgeEditorGroups.test.tsx`
- `desktop/src/react/__tests__/components/KnowledgeTabBar.test.tsx`

**Playwright 用户流程：** 适用；运行 E2E-KW-004

## 验收标准

- [x] 普通打开复用全局既有视图；只有显式侧边打开创建第二视图；关闭组不丢 dirty session。
- [x] 本 ticket 拥有的每个 `KW-US-*` 都由上列精确测试直接证明；不存在范围兜底或 Ticket 57 代实现。
- [x] 本 ticket 拥有的每个 `KW-RULE-*` 都满足对应契约文档，并有正常、取消/冲突、权限/不可用和故障注入覆盖。
- [x] 相关既有回归、`npm run typecheck` 和 `npm run lint:boundary` 通过；涉及 composition、Renderer、preload/main 时运行相应 build。
- [x] ticket 交付记录只填写实际执行命令、平台和结果；普通执行结果不写入 `LOG.md`。
- [x] 交付物没有未决的“可能”“按需”“A 或 B”、未选框架、未选 schema 或未定义恢复语义。

## 实施交付记录

- **实现提交：** `0150b9c5`
- **平台：** macOS Darwin 25.5.0 / Apple M5 arm64 / APFS；Node `v24.16.0` / npm `11.13.0`
- **递归布局：** `KnowledgeEditorGroups` 以递归 horizontal/vertical split tree 表达当前 workspace 内存布局；每个组独立维护 tabs、活动 view 与唯一 preview，空侧组在移除最后一个 view 后收拢，workspace 变化重建单空组且不持久化。
- **打开语义：** `openResource` 在整棵布局中按精确 `KnowledgeResourceAddress` 全局复用已有 view；只有 `openInSide`、显式分屏或 tab drag 才创建/移动额外 view。同址 Markdown view 继续绑定 Ticket 18 的同一共享 session/history。
- **预览与生命周期：** 每组最多一个 preview；下一次普通预览只替换该 preview。双击、开始编辑、明确固定和拖动均原地 pin。关闭/替换最后一个 clean view 释放 session；dirty session 即使组收拢仍保留，等待 Ticket 22 的统一关闭决策流。
- **标签与面包屑：** 标签始终显示完整文件名和全部扩展名；每组只为活动 tab 显示“来源名 › 目录层级 › 完整文件名”。路径段只通过显式 callback 定位来源根、文件夹或资源，不含绝对路径、不自动驱动资源树。
- **真实组合：** Knowledge shell 的空编辑区已替换为 `KnowledgeEditorGroups`，每个 workspace/Renderer component context 显式创建并销毁隔离的 Document Registry；`KnowledgeDocumentNotices` 只在组合层挂载一次。
- **键盘、ARIA 与视觉：** tablist/tab/tabpanel、group、breadcrumb、方向键/Home/End、可见 focus、拖放、亮暗主题变量与两级窄布局规则已交付；zh-CN、zh-TW、en、ja、ko 同步增加全部新字符串。
- **精确自动化：** `npx vitest run desktop/src/react/__tests__/components/KnowledgeEditorGroups.test.tsx desktop/src/react/__tests__/components/KnowledgeTabBar.test.tsx`（2 files、8/8）。
- **相关回归：** `npx vitest run desktop/src/react/__tests__/components/KnowledgeEditorGroups.test.tsx desktop/src/react/__tests__/components/KnowledgeTabBar.test.tsx desktop/src/react/__tests__/components/KnowledgeWorkspace.test.tsx desktop/src/react/__tests__/components/KnowledgeDocumentEditor.save.test.tsx desktop/src/react/__tests__/components/KnowledgeAssetViewer.test.tsx desktop/src/react/__tests__/stores/knowledge-document-registry.test.ts tests/knowledge-i18n-a11y-contract.test.ts tests/knowledge-contract-schema.test.ts`（8 files、130/130）。
- **全仓回归：** `npx vitest run --exclude 'temp/**' --exclude 'teach/**'`（1025 files passed、1 skipped；10277 tests passed、6 skipped）。
- **门禁与复审：** `npm run typecheck`、`npm run lint:boundary`、目标 ESLint、`npm run build:renderer` 与 `git diff --check` 通过；固定点 `aa262b0b` 到实现提交 `0150b9c5` 的规范轴与标准轴复审均无未决 blocker。
- **Playwright：** E2E-KW-004 尚未执行；真实资源树单击/双击/Space/Enter 到 tabs 的用户入口由 Tickets 48/49 交付，当前仓库仍只有 E2E-KW-001 spec。为避免私有测试入口或提前实现后续 owner，本票保持 E2E 行“未执行”，待真实产品入口完成后回填。
- **Handoff：** `speculo/.speculo/commands/handoff/2026-07-28-openhanako-knowledge-workspace-implementation-20.md`
