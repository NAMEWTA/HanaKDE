---
schema_version: 3
artifact: ticket
change: 2026-07-24-openhanako-knowledge-workspace
id: T-37
title: "交付 Wikilink 补全、导航与延迟建页"
status: done
planning_depth: standard
planning_depth_reason: "历史完成 Ticket 的 SpecDev v3 兼容迁移；保留既有实现、验证与验收记录。"
ready: false
risk: medium
blocked_by: ["T-20","T-23","T-24","T-27"]
contract_ids: ["KW-US-113","KW-US-121","KW-RULE-MARKDOWN"]
owner: historical-implementer
expected_changes: ["<Path>{roots.state}/specdev/changes/2026-07-24-openhanako-knowledge-workspace/ticket/37-deliver-wikilink-completion-navigation.md</Path>"]
writable_paths: []
read_only_paths: []
shared_paths: []
shared_path_owners: []
---
# Ticket 37: 交付 Wikilink 补全、导航与延迟建页

- **被阻塞于：** [`20-deliver-groups-tabs-breadcrumbs.md`](./20-deliver-groups-tabs-breadcrumbs.md)、[`23-define-knowledge-address-resolver.md`](./23-define-knowledge-address-resolver.md)、[`24-deliver-wikilink-markdown-links.md`](./24-deliver-wikilink-markdown-links.md)、[`27-deliver-live-preview-modes.md`](./27-deliver-live-preview-modes.md)
- **状态：** 已完成

## 战略与背景

- **战略：** 补全仅查询当前来源，导航复用全局 tab，断裂目标创建 pending page 并延迟落盘。
- **需求追踪：** KW-US-113, KW-US-121, KW-RULE-MARKDOWN
- **当前现状：** 当前实现接缝位于 `desktop/src/react/editor/`、`desktop/src/react/stores/preview-slice.ts`；本 ticket 只扩展这些公开边界。
- **用户可验证结果：** 完成本 ticket 后，验收者能够通过公开 API、真实临时 workspace 或可交互 UI 验证本标题声明的单一能力。

## 范围边界

| IN | REUSE | OUT |
|---|---|---|
| 补全仅查询当前来源，导航复用全局 tab，断裂目标创建 pending page 并延迟落盘。 | `desktop/src/react/editor/`<br>`desktop/src/react/stores/preview-slice.ts` | 未列入本 ticket 的后续功能；修改生成 bundle；创建平行文件系统、编辑器内核或私有 route 捷径 |

## 交付物

> 以下仅列主要交付物，不构成文件白名单或完整清单；为满足本 ticket 验收而新增/修改的同范围实现、类型、schema、fixture、测试、i18n 与文档同属交付物。

- `desktop/src/react/editor/knowledge-link-completion.ts`
- `desktop/src/react/commands/knowledge-link-navigation.ts`

## 实施时需阅读的文件

> 以下列出本 ticket 的具体代码接缝；实施前还必须按 [`README.md`](../README.md) 的文档权威关系读取 accepted [`LOG.md`](../LOG.md)、[`ADR.md`](../ADR.md)、[`CONTEXT.md`](../CONTEXT.md)、[`spec.md`](../spec.md) 及本 ticket 的固定实施契约，不能因本节或交付物未逐项复写而遗漏已确认结论。

- `desktop/src/react/editor/`
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

**Primary ownership：** KW-US-113, KW-US-121

**必须创建或更新：**

- `desktop/src/react/__tests__/editor/knowledge-link-completion.test.ts`
- `desktop/src/react/__tests__/commands/knowledge-link-navigation.test.ts`

**Playwright 用户流程：** 适用；运行 E2E-KW-009

## 验收标准

- [x] 其他来源同名项不出现；未编辑关闭 pending page 不创建文件；首次保存创建父目录。
- [x] 本 ticket 拥有的每个 `KW-US-*` 都由上列精确测试直接证明；不存在范围兜底或 Ticket 57 代实现。
- [x] 本 ticket 拥有的每个 `KW-RULE-*` 都满足对应契约文档，并有正常、取消/冲突、权限/不可用和故障注入覆盖。
- [x] 相关既有回归、`npm run typecheck` 和 `npm run lint:boundary` 通过；涉及 composition、Renderer、preload/main 时运行相应 build。
- [x] ticket 交付记录只填写实际执行命令、平台和结果；普通执行结果不写入 `LOG.md`。
- [x] 交付物没有未决的“可能”“按需”“A 或 B”、未选框架、未选 schema 或未定义恢复语义。

## 实施交付记录

- **实现提交：** `bc0a60ab`
- **平台：** macOS Darwin 25.5.0 / Apple arm64 / APFS；Node `v24.16.0` / npm `11.13.0`
- **同源补全：** `[[` 通过 Renderer ResourceIO 递归列出当前页面 `sourceKey` 下的 Page 与 Asset，`![[` 只列 Markdown、受支持图片/音频/视频与 PDF；根 `.trash` 不进入候选。Unicode NFC 不区分大小写的连续子串过滤与 natural path 排序固定，候选只显示 Source 根相对路径，不泄露 `sourceKey`、来源显示名或元数据。
- **编辑语义：** Frontmatter、fenced/indented/inline code 内不触发候选；异步递归查询绑定 CM6 completion 取消信号。候选选择以一次 transaction 写入完整 `[[path]]` 或 `![[path]]` 并保留 undo；无结果、Esc 或取消均不创建资源、不复制、不猜测路径。Wikilink 与 Ticket 34 脚注 source 由一个 `autocompletion({ override })` owner 统一调度。
- **同源导航：** 点击或键盘激活后重新 stat 解析出的当前来源地址；任意编辑组已有同址 view 时全局激活复用，否则在当前组创建临时 preview。其他来源同名资源不搜索、不回退；精确且区分大小写的首个 heading fragment 使用现有 CM6 view 聚焦并滚动，不修改正文、资源树 selection 或历史。
- **延迟建页：** 只有同源缺失 `.md` Wikilink 且来源可写时建立空白 `pendingCreate` session；打开、关闭或销毁未编辑 session 不执行写入。首次编辑或显式保存以 `expectedVersion: null` 经 ResourceIO 创建缺失 Page（provider 负责父目录），并发首次创建按 registry/address 合并；成功推进 baseline/version，冲突、只读、不可用或异常保留 buffer 与 pending 状态。缺失 Asset 与普通 Markdown link 不创建 Page。
- **UI 与边界：** autocomplete popup 复用现有主题 token、CM6 ARIA/键盘/焦点行为与响应式最大尺寸；候选行仅有路径，因此没有新增可见 prose 或 locale key。Renderer 未访问 Node 文件系统，导航/补全没有新增 IPC、持久化、树 follow/history 或跨来源读取。
- **精确自动化：** `npx vitest run desktop/src/react/__tests__/editor/knowledge-link-completion.test.ts desktop/src/react/__tests__/commands/knowledge-link-navigation.test.ts desktop/src/react/__tests__/components/KnowledgeDocumentEditor.save.test.tsx --exclude 'temp/**' --reporter=dot`（3 files、25/25）；覆盖递归同源过滤与排序、embed allowlist、语法排除、单事务/无结果、唯一 autocomplete owner、全局 view seam、精确 heading、pending 零写入、首次编辑/显式空保存、冲突、只读/不可用与缺失 Asset/Markdown link。
- **相关回归：** completion/navigation/save、link/footnote fields、document registry、link resolver、Markdown IR、groups 与 Markdown surface 受控分批合计 `10 files、115/115`；首次合并运行中的两个 DOM lifecycle 用例触及固定 timeout，两个文件立即隔离复验均为 10/10。
- **产品范围全仓：** `npm test -- --exclude 'temp/**' --reporter=json --outputFile=/tmp/hana-ticket37-vitest-rerun.json` 在实现提交前的同一代码状态真实退出 0（2782 suites；10601 tests，10595 passed、6 skipped、0 failed）。首次全仓收集受并行资源争用影响产生 21 个分散 suite 结果缺口；涉及的 10 个文件随后隔离 36 suites、172/172，并由第二次完整运行消解。
- **门禁与构建：** `npm run typecheck`、`npm run lint:boundary`、目标 ESLint、`git diff --check`、锁文件 offline dry-run、baseline/preflight、style discipline 与 `npm run build:renderer` 通过。
- **Playwright：** E2E-KW-009 当前未执行；仓库只有 E2E-KW-001 spec，完整链接/嵌入场景仍依赖 Ticket 39 与 Tickets 48/49 的真实资源树公开打开入口。未创建私有 route、测试捷径或缩减场景；依赖完成后必须补建并执行，最终发布前不得保留该缺口。
- **Handoff：** `speculo/.speculo/commands/handoff/2026-07-30-openhanako-knowledge-workspace-implementation-37.md`
