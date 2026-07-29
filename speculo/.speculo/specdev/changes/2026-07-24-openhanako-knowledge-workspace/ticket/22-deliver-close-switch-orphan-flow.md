# Ticket 22: 交付关闭、Workspace 切换与悬空文档

- **被阻塞于：** [`05-adapt-workspace-source-registry.md`](./05-adapt-workspace-source-registry.md)、[`18-establish-document-session-registry.md`](./18-establish-document-session-registry.md)、[`19-deliver-manual-save-tracer.md`](./19-deliver-manual-save-tracer.md)、[`20-deliver-groups-tabs-breadcrumbs.md`](./20-deliver-groups-tabs-breadcrumbs.md)、[`21-deliver-external-change-conflicts.md`](./21-deliver-external-change-conflicts.md)
- **状态：** 已完成

## 战略与背景

- **战略：** 统一文档关闭、组关闭、窗口关闭、来源卸载和 workspace 切换的逐文档决策顺序。
- **需求追踪：** KW-US-045, KW-US-046, KW-US-047, KW-US-048, KW-US-050, KW-US-051, KW-US-052, KW-US-136, KW-US-137, KW-US-138, KW-US-139, KW-US-140, KW-US-141, KW-US-142
- **当前现状：** 当前实现接缝位于 `desktop/src/react/stores/session-actions.ts`、`desktop/src/react/stores/workspace-ui-state-actions.ts`；本 ticket 只扩展这些公开边界。
- **用户可验证结果：** 完成本 ticket 后，验收者能够通过公开 API、真实临时 workspace 或可交互 UI 验证本标题声明的单一能力。

## 范围边界

| IN | REUSE | OUT |
|---|---|---|
| 统一文档关闭、组关闭、窗口关闭、来源卸载和 workspace 切换的逐文档决策顺序。 | `desktop/src/react/stores/session-actions.ts`<br>`desktop/src/react/stores/workspace-ui-state-actions.ts` | 未列入本 ticket 的后续功能；修改生成 bundle；创建平行文件系统、编辑器内核或私有 route 捷径 |

## 交付物

> 以下仅列主要交付物，不构成文件白名单或完整清单；为满足本 ticket 验收而新增/修改的同范围实现、类型、schema、fixture、测试、i18n 与文档同属交付物。

- `core/knowledge-workspace/knowledge-workspace-lifecycle.ts`
- `desktop/src/react/components/knowledge-workspace/UnsavedDocumentsDialog.tsx`

## 实施时需阅读的文件

> 以下列出本 ticket 的具体代码接缝；实施前还必须按 [`README.md`](../README.md) 的文档权威关系读取 accepted [`LOG.md`](../LOG.md)、[`ADR.md`](../ADR.md)、[`CONTEXT.md`](../CONTEXT.md)、[`spec.md`](../spec.md) 及本 ticket 的固定实施契约，不能因本节或交付物未逐项复写而遗漏已确认结论。

- `desktop/src/react/stores/session-actions.ts`
- `desktop/src/react/stores/workspace-ui-state-actions.ts`

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

**Primary ownership：** KW-US-045, KW-US-046, KW-US-047, KW-US-048, KW-US-050, KW-US-051, KW-US-052, KW-US-136, KW-US-137, KW-US-138, KW-US-139, KW-US-140, KW-US-141, KW-US-142

**必须创建或更新：**

- `tests/knowledge-workspace-lifecycle.test.ts`
- `desktop/src/react/__tests__/components/UnsavedDocumentsDialog.test.tsx`

**Playwright 用户流程：** 适用；运行 E2E-KW-008

## 验收标准

- [x] 取消或保存失败立即停止；来源丢失的 dirty 文档转 orphan；保存 orphan 必须选择当前可用来源。
- [x] 本 ticket 拥有的每个 `KW-US-*` 都由上列精确测试直接证明；不存在范围兜底或 Ticket 57 代实现。
- [x] 本 ticket 拥有的每个 `KW-RULE-*` 都满足对应契约文档，并有正常、取消/冲突、权限/不可用和故障注入覆盖。
- [x] 相关既有回归、`npm run typecheck` 和 `npm run lint:boundary` 通过；涉及 composition、Renderer、preload/main 时运行相应 build。
- [x] ticket 交付记录只填写实际执行命令、平台和结果；普通执行结果不写入 `LOG.md`。
- [x] 交付物没有未决的“可能”“按需”“A 或 B”、未选框架、未选 schema 或未定义恢复语义。

## 实施交付记录

- **实现提交：** `1e1f7cb7`
- **平台：** macOS Darwin 25.5.0 / Apple M5 arm64 / APFS；Node `v24.16.0` / npm `11.13.0`
- **统一关闭顺序：** `knowledge-workspace-lifecycle` 按稳定文档顺序逐个执行保存、放弃或取消；非最后 view 直接关闭，最后 dirty view 才询问。任一取消或保存失败立即停止，先前已完成结果不回滚；并发关闭请求不会替换当前决策。
- **公开生命周期接缝：** group、workspace、session 与显式窗口关闭复用同一 Renderer close guard；workspace/Studio 切换在任何路径、持久化或服务端动作之前等待 guard。`beforeunload` 在批准后只允许一次重试，组件卸载会安全取消待决对话框。
- **来源丢失与恢复：** 来源事件触发可用性复核；clean 文档保留原地址和不可用占位，dirty 文档立即转 orphan。来源恢复只允许 clean 文档按原地址重载，orphan 不自动重绑、不猜测新位置。
- **orphan 新建保存：** 只列出当前 workspace 中 available 且具 write 能力的来源；用户选择新 Page 地址后经 ResourceIO `expectedVersion: null` 原子创建，目标已存在或已打开均返回冲突且不覆盖。成功后仅重绑当前 session/views/breadcrumb，正文以 UTF-8、无 BOM、LF 写入，不改写旧地址引用。
- **状态与 UI：** Workspace 每次打开重置为单空组，不恢复历史 preview/pinned/layout。逐文档对话框支持 save/discard/cancel、orphan 来源/路径选择、持久错误、键盘与 focus；五语言、ARIA、亮暗主题及窄布局同步交付。
- **精确自动化：** `npx vitest run tests/knowledge-workspace-lifecycle.test.ts desktop/src/react/__tests__/components/UnsavedDocumentsDialog.test.tsx`（2 files、25/25）。
- **相关回归：** `npx vitest run tests/knowledge-workspace-lifecycle.test.ts desktop/src/react/__tests__/components/UnsavedDocumentsDialog.test.tsx desktop/src/react/__tests__/components/KnowledgeEditorGroups.test.tsx desktop/src/react/__tests__/components/KnowledgeConflictResolver.test.tsx desktop/src/react/__tests__/stores/knowledge-document-registry.test.ts desktop/src/react/__tests__/utils/knowledge-document-operations.test.ts`（6 files、61/61）。
- **持久化 tripwire：** `node scripts/scan-persistent-stores.mjs`、`node scripts/generate-persistence-schema-fingerprint.mjs --classification compatible --compatibility-reason "Refreshes the deterministic persistence inventory after the external ResourceIO create path changed; persisted store schemas and existing record readers remain unchanged."`；`npx vitest run tests/persistence-store-registry.test.ts tests/persistence-schema-tripwire.test.ts tests/persistence-startup-receipt.test.ts`（3 files、21/21）。
- **全仓回归：** `npx vitest run --exclude 'temp/**' --exclude 'teach/**' --silent`（1030 files passed、1 skipped；10334 tests passed、6 skipped）。
- **门禁与复审：** `npm run typecheck`、`npm run lint:boundary`、目标 ESLint（0 errors）、`npm run build:renderer` 与 `git diff --check` 通过；固定点 `18a1ce19` 到实现提交 `1e1f7cb7` 的规范轴与标准轴本地复审无未决 blocker。
- **Playwright：** E2E-KW-008 尚未执行；当前真实产品资源树打开旅程仍由 Tickets 48/49 交付。未建立私有 route 或测试捷径，发布前必须执行并回填。
- **Handoff：** `speculo/.speculo/commands/handoff/2026-07-29-openhanako-knowledge-workspace-implementation-22.md`
