---
schema_version: 3
artifact: ticket
change: 2026-07-24-openhanako-knowledge-workspace
id: T-11
title: "建立 Markdown 知识语义 IR"
status: done
planning_depth: standard
planning_depth_reason: "历史完成 Ticket 的 SpecDev v3 兼容迁移；保留既有实现、验证与验收记录。"
ready: false
risk: medium
blocked_by: ["T-02","T-03"]
contract_ids: ["KW-RULE-MARKDOWN"]
owner: historical-implementer
expected_changes: ["<Path>{roots.state}/specdev/changes/2026-07-24-openhanako-knowledge-workspace/ticket/11-define-markdown-semantic-ir.md</Path>"]
writable_paths: []
read_only_paths: []
shared_paths: []
shared_path_owners: []
---
# Ticket 11: 建立 Markdown 知识语义 IR

- **被阻塞于：** [`02-audit-silverbullet-reference.md`](./02-audit-silverbullet-reference.md)、[`03-freeze-open-knowledge-contract.md`](./03-freeze-open-knowledge-contract.md)
- **状态：** 已完成

## 战略与背景

- **战略：** 共享 Wikilink、代码区、Frontmatter、标签、任务、标题和链接的文本范围语义，避免模块各自解析。
- **需求追踪：** KW-RULE-MARKDOWN
- **当前现状：** 当前实现接缝位于 `desktop/src/react/editor/`、`silverbullet/client/markdown_parser/`、`silverbullet/client/codemirror/`；本 ticket 只扩展这些公开边界。
- **用户可验证结果：** 完成本 ticket 后，验收者能够通过公开 API、真实临时 workspace 或可交互 UI 验证本标题声明的单一能力。

## 范围边界

| IN | REUSE | OUT |
|---|---|---|
| 共享 Wikilink、代码区、Frontmatter、标签、任务、标题和链接的文本范围语义，避免模块各自解析。 | `desktop/src/react/editor/`<br>`silverbullet/client/markdown_parser/`<br>`silverbullet/client/codemirror/` | 未列入本 ticket 的后续功能；修改生成 bundle；创建平行文件系统、编辑器内核或私有 route 捷径 |

## 交付物

> 以下仅列主要交付物，不构成文件白名单或完整清单；为满足本 ticket 验收而新增/修改的同范围实现、类型、schema、fixture、测试、i18n 与文档同属交付物。

- `lib/knowledge-workspace/markdown-knowledge-ir.ts`
- `lib/knowledge-workspace/markdown-lexer.ts`
- `tests/markdown-knowledge-ir.test.ts`

## 实施时需阅读的文件

> 以下列出本 ticket 的具体代码接缝；实施前还必须按 [`README.md`](../README.md) 的文档权威关系读取 accepted [`LOG.md`](../LOG.md)、[`ADR.md`](../ADR.md)、[`CONTEXT.md`](../CONTEXT.md)、[`spec.md`](../spec.md) 及本 ticket 的固定实施契约，不能因本节或交付物未逐项复写而遗漏已确认结论。

- `desktop/src/react/editor/`
- `silverbullet/client/markdown_parser/`
- `silverbullet/client/codemirror/`

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

**Primary ownership：** 无直接用户故事；按上列规则域交付

**必须创建或更新：**

- `tests/markdown-knowledge-ir.test.ts`

**Playwright 用户流程：** 不适用；本 ticket 使用上述 Vitest 单元、组件、契约或集成测试，不运行 Playwright；下游或发布级用户流程可继续覆盖相关行为

## 验收标准

- [x] Renderer 与 Server 对同一语料得到相同知识 token；CM6 parse tree 不跨进程序列化。
- [x] `Primary ownership` 明确为无直接用户故事；本 ticket 不新增未分配的产品行为，也不替其他 ticket 兜底。
- [x] 本 ticket 拥有的每个 `KW-RULE-*` 都满足对应契约文档，并有正常、取消/冲突、权限/不可用和故障注入覆盖。
- [x] 相关既有回归、`npm run typecheck` 和 `npm run lint:boundary` 通过；涉及 composition、Renderer、preload/main 时运行相应 build。
- [x] ticket 交付记录只填写实际执行命令、平台和结果；普通执行结果不写入 `LOG.md`。
- [x] 交付物没有未决的“可能”“按需”“A 或 B”、未选框架、未选 schema 或未定义恢复语义。

## 实现交接摘要

- **主线实现提交：** `b0331575`（隔离 worktree 原始提交 `42c15276`）。
- **平台：** macOS 26.5（Darwin 25.5.0，arm64）、Node `v24.16.0`、npm `11.13.0`。
- **实现范围：** 使用直接精确依赖 `@lezer/markdown@1.6.3` 的 CommonMark/GFM step parser，投影纯 JSON 可序列化的共享 Markdown Knowledge IR；覆盖 Frontmatter、代码、标题、Wikilink、Markdown link/image、标签和 GFM task 的 UTF-16 半开原始范围及精确子范围。
- **边界与复杂度：** 不导出 Lezer/CM6 tree，不依赖 EditorState、DOM 或文件系统；BOM、LF/CRLF/CR/mixed、Unicode/NFC、合法 containment 与无 partial overlap 均冻结。HTML block/comment/tag 属性、script/style、code、URL、目标地址不误抽正文语义。
- **规模与取消：** Lezer step、预处理、escape、tree projection、wikilink/tag 与 line-ending 扫描均周期检查 `AbortSignal`；130,000 个高密度 token 不再通过参数 spread 触发栈溢出，规模倍增回归保持线性。
- **自动化：** `volta run npx vitest run tests/markdown-knowledge-ir.test.ts tests/knowledge-baseline-contract.test.ts`，2 files、29/29；target ESLint 0 warning；`volta run npm run typecheck`、`volta run npm run lint:boundary`、`npm ls @lezer/markdown --depth=0` 与 `git diff --check` 通过。
- **质量与规格检查：** 两轴均无未决问题；已修复手写近似解析、O(n²) 扫描、子范围不精确、标签语法缺口、HTML 误抽、CRLF 切分、数组展开栈溢出及不可取消线性阶段。
- **Playwright：** 本票明确不适用；无直接用户故事，不替下游 resolver/editor ticket 兜底。
- **交接：** `speculo/.speculo/commands/handoff/2026-07-26-openhanako-knowledge-workspace-implementation-03.md`。
