---
schema_version: 3
artifact: ticket
change: 2026-07-24-openhanako-knowledge-workspace
id: T-34
title: "交付脚注定义、预览与补全"
status: done
planning_depth: standard
planning_depth_reason: "历史完成 Ticket 的 SpecDev v3 兼容迁移；保留既有实现、验证与验收记录。"
ready: false
risk: medium
blocked_by: ["T-11","T-27"]
contract_ids: ["KW-US-088","KW-US-089","KW-US-090","KW-RULE-MARKDOWN"]
owner: historical-implementer
expected_changes: ["<Path>{roots.state}/specdev/changes/2026-07-24-openhanako-knowledge-workspace/ticket/34-deliver-footnotes.md</Path>"]
writable_paths: []
read_only_paths: []
shared_paths: []
shared_path_owners: []
---
# Ticket 34: 交付脚注定义、预览与补全

- **被阻塞于：** [`11-define-markdown-semantic-ir.md`](./11-define-markdown-semantic-ir.md)、[`27-deliver-live-preview-modes.md`](./27-deliver-live-preview-modes.md)
- **状态：** 已完成

## 战略与背景

- **战略：** 基于共享 IR 实现脚注定义/引用、同文档导航、悬停预览和补全。
- **需求追踪：** KW-US-088, KW-US-089, KW-US-090, KW-RULE-MARKDOWN
- **当前现状：** SilverBullet footnote 文件是临时审计参考；Markdown IR 由 Ticket 11 交付，不能把两者误写为当前基座已有实现。
- **用户可验证结果：** 完成本 ticket 后，验收者能够通过公开 API、真实临时 workspace 或可交互 UI 验证本标题声明的单一能力。

## 范围边界

| IN | REUSE | OUT |
|---|---|---|
| 基于共享 IR 实现脚注定义/引用、同文档导航、悬停预览和补全。 | `silverbullet/client/codemirror/footnote.ts`<br>`lib/knowledge-workspace/markdown-knowledge-ir.ts` | 未列入本 ticket 的后续功能；修改生成 bundle；创建平行文件系统、编辑器内核或私有 route 捷径 |

## 交付物

> 以下仅列主要交付物，不构成文件白名单或完整清单；为满足本 ticket 验收而新增/修改的同范围实现、类型、schema、fixture、测试、i18n 与文档同属交付物。

- `desktop/src/react/editor/knowledge-footnote-field.ts`
- `desktop/src/react/__tests__/editor/knowledge-footnote-field.test.ts`

## 实施时需阅读的文件

> 以下列出本 ticket 的具体代码接缝；实施前还必须按 [`README.md`](../README.md) 的文档权威关系读取 accepted [`LOG.md`](../LOG.md)、[`ADR.md`](../ADR.md)、[`CONTEXT.md`](../CONTEXT.md)、[`spec.md`](../spec.md) 及本 ticket 的固定实施契约，不能因本节或交付物未逐项复写而遗漏已确认结论。

- `silverbullet/client/codemirror/footnote.ts`
- `lib/knowledge-workspace/markdown-knowledge-ir.ts`（由 Ticket 11 交付）

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

**Primary ownership：** KW-US-088, KW-US-089, KW-US-090

**必须创建或更新：**

- `desktop/src/react/__tests__/editor/knowledge-footnote-field.test.ts`

**Playwright 用户流程：** 适用；运行 E2E-KW-011

## 验收标准

- [x] 脚注不跨页面或来源；重复/缺失定义显示确定状态；代码区不参与。
- [x] 本 ticket 拥有的每个 `KW-US-*` 都由上列精确测试直接证明；不存在范围兜底或 Ticket 57 代实现。
- [x] 本 ticket 拥有的每个 `KW-RULE-*` 都满足对应契约文档，并有正常、取消/冲突、权限/不可用和故障注入覆盖。
- [x] 相关既有回归、`npm run typecheck` 和 `npm run lint:boundary` 通过；涉及 composition、Renderer、preload/main 时运行相应 build。
- [x] ticket 交付记录只填写实际执行命令、平台和结果；普通执行结果不写入 `LOG.md`。
- [x] 交付物没有未决的“可能”“按需”“A 或 B”、未选框架、未选 schema 或未定义恢复语义。

## 实施交付记录

- **实现提交：** `549dd6d5`
- **平台：** macOS Darwin 25.5.0 / Apple M5 arm64 / APFS；Node `v24.16.0` / npm `11.13.0`
- **共享 IR：** `markdown-knowledge-ir.ts` 新增 reference definition/reference/inline footnote 三类 process-neutral token；标签按原始字符串大小写敏感完整匹配，winning definition 固定为文档顺序第一个，后续同标签 token 显式标记 `duplicate`，reference 只携带同一份 Markdown IR 内的首定义 range。
- **多行定义：** `[^label]:` 首行后只接纳至少四个 ASCII 空格或一个真实 Tab 的续行；空行只有在后续存在有效缩进行时才并入正文，续行只去掉一层兼容缩进，定义原始 range/raw 与磁盘源码不移动、不重写。
- **解析排除：** Frontmatter、fenced/indented/inline code、HTML 结构与 Markdown link syntax 使用同一共享 IR exclusion seam；escaped marker、空标签、带空白 reference label 与未闭合输入不产生脚注 token。
- **单一 Live Preview owner：** `knowledge-footnote-field.ts` 是脚注装饰唯一 owner；reference/inline syntax 在任一 selection range 未触碰时替换为稳定紧凑序号，触碰即显示真实源码，Source 模式不安装 decoration field。
- **同文档交互：** resolved reference 普通 pointer/Enter/Space 跳到 winning definition；Alt/Option + pointer/keyboard 返回 reference source；inline marker 与 missing marker 直接返回自身源码。所有动作只 dispatch selection/scroll，不修改正文、不创建 definition、不进入 undo history。
- **静态悬停：** winning definition 与 inline content 复用受支持 Markdown renderer 后再经 preview sanitizer；在 inert `template` 中移除脚注尾列表及 image/audio/video/object/embed 等 resource-bearing element，tooltip 不执行链接或控件交互，不联网、不访问文件系统。
- **确定诊断：** missing exact label 显示 `!` 非阻断 marker 与本地化说明；后续 exact duplicate 在真实定义位置显示可聚焦 badge。删除或移动首定义后由当前 buffer 重新计算；`[^Note]` 与 `[^note]` 永远独立。
- **当前页面补全：** 新增直接依赖 `@codemirror/autocomplete@6.20.1`；可编辑 Markdown 输入 `[^` 后只读取当前 editor buffer 的有效首定义，按定义位置、大小写敏感 prefix 排列并去重。选择一次性替换为完整 `[^label]`、光标置于 `]` 后，单个普通 history transaction 可一步撤销；read-only 与 code context 返回 unavailable，Source 模式保留补全。
- **五语言与布局：** zh-CN、zh-TW、en、ja、ko 提供 jump/edit/missing/duplicate 文案；marker/diagnostic 均有 button role、ARIA、tooltip role、focus-visible、Enter/Space、亮暗主题 token，tooltip 使用 viewport-bounded 宽高和 overflow 适配窄布局。
- **精确自动化：** `npx vitest run desktop/src/react/__tests__/editor/knowledge-footnote-field.test.ts tests/markdown-knowledge-ir.test.ts --exclude 'temp/**' --reporter=dot`（2 files、27/27）；其中 ticket owner 文件 7/7 直接覆盖 KW-US-088–090，共享 IR 文件 20/20 覆盖 token/range/代码排除/重复与大小写。
- **相关回归：** `npx vitest run desktop/src/react/__tests__/editor/knowledge-footnote-field.test.ts desktop/src/react/__tests__/editor/knowledge-live-preview.test.ts desktop/src/react/__tests__/editor/knowledge-math-field.test.ts desktop/src/react/__tests__/editor/knowledge-mermaid-field.test.ts desktop/src/react/__tests__/utils/markdown.test.ts desktop/src/react/__tests__/utils/markdown-html-sanitizer.test.ts desktop/src/react/__tests__/lib/i18n-flat-keys.test.ts tests/markdown-knowledge-ir.test.ts tests/silverbullet-reference-integrity.test.ts --exclude 'temp/**' --reporter=dot`（实际收集 8 files、90/90）。
- **产品范围全仓：** 最终实现提交前的同一代码状态执行 `npm test -- --exclude 'temp/**' --silent=passed-only`（1046 files passed、1 skipped；10539 tests passed、6 skipped）。首次完整受控运行的三个大文件 I/O timeout 已由隔离 53/53 及随后未改 timeout/worker 的同一标准全仓命令通过共同消解。
- **门禁与构建：** `npm run typecheck`、`npm run lint:boundary`、目标 ESLint、`git diff --check`、package-lock offline dry-run 与 `npm run build:renderer` 通过；未改变 preload/main、Server、ResourceIO、IPC 或持久化。
- **IO/权限边界：** 本 ticket 只解析当前 CM6 buffer 并生成 Renderer 内存派生；不持有页面/来源/global index，不调用 ResourceIO，不发起网络/文件系统/权限请求或 mutation。read-only/code context、缺失、重复、非法输入与 renderer/sanitizer 异常均 fail-safe，正文仍是唯一事实。
- **参考适配：** SilverBullet `client/codemirror/footnote.ts` 仅作为已冻结矩阵中的审计参考；实现重新建立在 OpenHanako 共享 IR、CM6 public API 与既有 sanitizer 上，不导入 SilverBullet runtime 或生产模块。
- **Playwright：** E2E-KW-011 当前未执行；仓库尚无该 spec，真实资源树单击/双击/Enter/Space 打开 Markdown 的公开产品入口由 Tickets 48/49 交付。未创建私有 route、测试捷径或缩减场景；48/49 完成后必须补建并执行，最终发布前不得保留该缺口。
- **Handoff：** `speculo/.speculo/commands/handoff/2026-07-29-openhanako-knowledge-workspace-implementation-34.md`
