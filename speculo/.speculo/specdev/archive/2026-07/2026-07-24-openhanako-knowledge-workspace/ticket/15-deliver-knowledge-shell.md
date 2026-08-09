---
schema_version: 3
artifact: ticket
change: 2026-07-24-openhanako-knowledge-workspace
id: T-15
title: "交付知识视图壳与空白 main 会话"
status: done
planning_depth: standard
planning_depth_reason: "历史完成 Ticket 的 SpecDev v3 兼容迁移；保留既有实现、验证与验收记录。"
ready: false
risk: medium
blocked_by: ["T-05","T-08"]
contract_ids: ["KW-US-011","KW-US-167","KW-US-168","KW-US-169"]
owner: historical-implementer
expected_changes: ["<Path>{roots.state}/specdev/changes/2026-07-24-openhanako-knowledge-workspace/ticket/15-deliver-knowledge-shell.md</Path>"]
writable_paths: []
read_only_paths: []
shared_paths: []
shared_path_owners: []
---
# Ticket 15: 交付知识视图壳与空白 main 会话

- **被阻塞于：** [`05-adapt-workspace-source-registry.md`](./05-adapt-workspace-source-registry.md)、[`08-migrate-renderer-resource-client.md`](./08-migrate-renderer-resource-client.md)
- **状态：** 已完成

## 战略与背景

- **战略：** 在现有导航中加入知识视图，显示 main、来源区、树区和单个空编辑组。
- **需求追踪：** KW-US-011, KW-US-167, KW-US-168, KW-US-169
- **当前现状：** 当前实现接缝位于 `desktop/src/react/components/app/AppPages.tsx`、`desktop/src/react/stores/desk-slice.ts` 以及相关 co-located `*.module.css`；本 ticket 只扩展这些公开边界。
- **用户可验证结果：** 完成本 ticket 后，验收者能够通过公开 API、真实临时 workspace 或可交互 UI 验证本标题声明的单一能力。

## 范围边界

| IN | REUSE | OUT |
|---|---|---|
| 在现有导航中加入知识视图，显示 main、来源区、树区和单个空编辑组。 | `desktop/src/react/components/app/AppPages.tsx`<br>`desktop/src/react/stores/desk-slice.ts` | 未列入本 ticket 的后续功能；修改生成 bundle；创建平行文件系统、编辑器内核或私有 route 捷径 |

## 交付物

> 以下仅列主要交付物，不构成文件白名单或完整清单；为满足本 ticket 验收而新增/修改的同范围实现、类型、schema、fixture、测试、i18n 与文档同属交付物。

- `desktop/src/react/components/knowledge-workspace/KnowledgeWorkspace.tsx`
- `desktop/src/react/components/knowledge-workspace/KnowledgeLayout.tsx`

## 实施时需阅读的文件

> 以下列出本 ticket 的具体代码接缝；实施前还必须按 [`README.md`](../README.md) 的文档权威关系读取 accepted [`LOG.md`](../LOG.md)、[`ADR.md`](../ADR.md)、[`CONTEXT.md`](../CONTEXT.md)、[`spec.md`](../spec.md) 及本 ticket 的固定实施契约，不能因本节或交付物未逐项复写而遗漏已确认结论。

- `desktop/src/react/components/app/AppPages.tsx`
- `desktop/src/react/stores/desk-slice.ts`

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

**Primary ownership：** KW-US-011, KW-US-167, KW-US-168, KW-US-169

**必须创建或更新：**

- `desktop/src/react/__tests__/components/KnowledgeWorkspace.test.tsx`
- `tests/knowledge-i18n-a11y-contract.test.ts`

**Playwright 用户流程：** 适用；运行 E2E-KW-001、E2E-KW-023

## 验收标准

- [x] 首次打开无恢复 tabs、挂载或树展开；Desk 紧凑视图行为不变。
- [x] 本 ticket 拥有的每个 `KW-US-*` 都由上列精确测试直接证明；不存在范围兜底或 Ticket 57 代实现。
- [x] 本 ticket 拥有的每个 `KW-RULE-*` 都满足对应契约文档，并有正常、取消/冲突、权限/不可用和故障注入覆盖。
- [x] 相关既有回归、`npm run typecheck` 和 `npm run lint:boundary` 通过；涉及 composition、Renderer、preload/main 时运行相应 build。
- [x] ticket 交付记录只填写实际执行命令、平台和结果；普通执行结果不写入 `LOG.md`。
- [x] 交付物没有未决的“可能”“按需”“A 或 B”、未选框架、未选 schema 或未定义恢复语义。

## 实施交付记录

- **实现提交：** `9a7dda3b`
- **平台：** macOS Darwin 25.5.0 / Apple M5 arm64 / APFS；Node `v24.16.0` / npm `11.13.0`
- **视图与状态：** Knowledge 作为 Chat 的固定同级顶层视图交付，独占主页面并隐藏 Chat sidebar、Preview 与 Workspace Companion；首次进入只创建一个可聚焦空编辑组，main 来源始终在首位，不恢复 tabs、挂载或树展开。
- **数据边界：** 复用唯一 `knowledgeWorkspaceClient` 与 Ticket 08 store slice；workspace identity 变化时取消旧请求并清空来源、树和 tabs，同 identity 重挂载不重置，响应切换前遮蔽旧来源名；错误消息保持脱敏并提供重试。
- **隔离与可访问性：** Knowledge 不触发 Chat 文件拖放、附件副作用或可拖拽频道语义；zh-CN、zh-TW、en、ja、ko、亮暗主题、窄布局、ARIA、键盘与可见 focus 均有自动化覆盖。
- **精确自动化：** `npx vitest run desktop/src/react/__tests__/components/KnowledgeWorkspace.test.tsx tests/knowledge-i18n-a11y-contract.test.ts`（2 files、6/6）。
- **相关回归：** 9 files、65/65；全仓 1018 files passed、1 skipped，10219 tests passed、6 skipped。
- **用户流程：** `E2E-KW-001` 在 desktop-full 与 web-open 通过；`E2E-KW-023` 在 desktop-full 通过，覆盖五语言、亮暗主题、窄布局、键盘 focus 与 ARIA。desktop-full 2/2，web-open 1/1。
- **门禁：** `npm run typecheck`、`npm run lint:boundary`、目标 ESLint、`npm run build:client` 与 `git diff --check` 通过；双轴复审无未决 blocker。
- **Handoff：** `speculo/.speculo/commands/handoff/2026-07-28-openhanako-knowledge-workspace-implementation-15.md`
