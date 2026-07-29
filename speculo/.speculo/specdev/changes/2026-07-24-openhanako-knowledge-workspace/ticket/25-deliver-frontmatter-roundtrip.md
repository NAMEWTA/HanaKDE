# Ticket 25: 交付 YAML Frontmatter 保真投影

- **被阻塞于：** [`11-define-markdown-semantic-ir.md`](./11-define-markdown-semantic-ir.md)、[`12-extract-policy-driven-cm6-surface.md`](./12-extract-policy-driven-cm6-surface.md)、[`19-deliver-manual-save-tracer.md`](./19-deliver-manual-save-tracer.md)
- **状态：** 已完成

## 战略与背景

- **战略：** 解析可安全编辑的顶层属性，同时原样保留未知嵌套 YAML、注释、顺序和换行。
- **需求追踪：** KW-US-174, KW-RULE-MARKDOWN
- **当前现状：** 当前实现接缝位于 `package.json`、`desktop/src/react/editor/md-decorations.ts`；本 ticket 只扩展这些公开边界。
- **用户可验证结果：** 完成本 ticket 后，验收者能够通过公开 API、真实临时 workspace 或可交互 UI 验证本标题声明的单一能力。

## 范围边界

| IN | REUSE | OUT |
|---|---|---|
| 解析可安全编辑的顶层属性，同时原样保留未知嵌套 YAML、注释、顺序和换行。 | `package.json`<br>`desktop/src/react/editor/md-decorations.ts` | 未列入本 ticket 的后续功能；修改生成 bundle；创建平行文件系统、编辑器内核或私有 route 捷径 |

## 交付物

> 以下仅列主要交付物，不构成文件白名单或完整清单；为满足本 ticket 验收而新增/修改的同范围实现、类型、schema、fixture、测试、i18n 与文档同属交付物。

- `lib/knowledge-workspace/frontmatter-projection.ts`
- `desktop/src/react/editor/frontmatter-field.ts`
- `tests/frontmatter-roundtrip.test.ts`

## 实施时需阅读的文件

> 以下列出本 ticket 的具体代码接缝；实施前还必须按 [`README.md`](../README.md) 的文档权威关系读取 accepted [`LOG.md`](../LOG.md)、[`ADR.md`](../ADR.md)、[`CONTEXT.md`](../CONTEXT.md)、[`spec.md`](../spec.md) 及本 ticket 的固定实施契约，不能因本节或交付物未逐项复写而遗漏已确认结论。

- `package.json`
- `desktop/src/react/editor/md-decorations.ts`

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
6. 复用现有 `js-yaml` 仅做语义校验；可视属性仅接受唯一顶层字符串键及 JSON 标量/一维 JSON 标量数组值，并以源码范围 patch 保留未触及字节。directive、多文档、重复键、merge、custom tag、anchor/alias、嵌套结构、block scalar、无效 YAML 或范围不确定时，整个属性区回到源码模式。

## 自动化证据

**Primary ownership：** KW-US-174

**必须创建或更新：**

- `tests/frontmatter-roundtrip.test.ts`

**Playwright 用户流程：** 不适用；本 ticket 使用上述 Vitest 单元、组件、契约或集成测试，不运行 Playwright；下游或发布级用户流程可继续覆盖相关行为

## 验收标准

- [x] round-trip 矩阵覆盖注释、anchors、嵌套、重复键和无效 YAML；无法安全编辑时退回源码。
- [x] KW-US-174 由 IR 与编辑器投影测试直接证明；复杂/未知 YAML 无法无损投影时保留原文并回到源码模式。
- [x] 新增、修改和删除可投影字段分别只形成一个 CM6 transaction；该 transaction 保持未触及字段、独立注释、顺序、现有 LF/CRLF 序列和正文，删除字段不连带删除相邻独立注释；最终保存对混合换行只执行 LOG-0065 的统一规范化。
- [x] 本 ticket 拥有的每个 `KW-RULE-*` 都满足对应契约文档，并有正常、取消/冲突、权限/不可用和故障注入覆盖。
- [x] 相关既有回归、`npm run typecheck` 和 `npm run lint:boundary` 通过；涉及 composition、Renderer、preload/main 时运行相应 build。
- [x] ticket 交付记录只填写实际执行命令、平台和结果；普通执行结果不写入 `LOG.md`。
- [x] 交付物没有未决的“可能”“按需”“A 或 B”、未选框架、未选 schema 或未定义恢复语义。

## 实施交付记录

- **实现提交：** `d3f3b22d`
- **平台：** macOS Darwin 25.5.0 / Apple M5 arm64 / APFS；Node `v24.16.0` / npm `11.13.0`
- **唯一范围来源：** Frontmatter 边界只取 Ticket 11 共享 IR 的 BOM-aware `frontmatter` token；范围扫描器只定位保守的单行顶层字段，`js-yaml` 继续作为唯一 YAML 语义校验器，不引入第二 parser，不调用 `dump` 或全量序列化。
- **投影资格：** 仅接受唯一顶层字符串键，以及 string/finite number/boolean/null 或一维同类数组；`title`、`aliases` 均为普通字段。directive/document end、重复键、merge、custom tag、anchor/alias、嵌套 map/sequence、block scalar、timestamp/NaN、无效 YAML 与不确定范围会让整个属性区回到源码。
- **保真 patch：** 修改只替换字段 value range；新增只在 closer 前按当前最后 line ending 插入 JSON-compatible YAML 行；删除只移除目标字段行。未触及字段、顺序、独立注释、inline comment 之外内容、LF/CRLF/混合序列与正文保持原样；空值加 inline comment 的 spacing 边界有专门回归。
- **CM6 事务：** shared policy-driven Markdown Surface 固定安装 `frontmatterField`；安全投影以单一 block widget 显示，set/add/delete 各 dispatch 一个 transaction 并立即重新投影。非法可视输入不改 buffer；外部编辑形成复杂 YAML 时当前真实源码保留且 widget 立即退出。
- **横切 UI：** zh-CN、zh-TW、en、ja、ko 文案、原生键盘控件、ARIA label/error、`:focus-visible`、亮暗 token 与 560px 窄布局同步交付。
- **保存语义：** CM buffer 遵循既有 LF 逻辑；纯范围 patch 证明输入 LF/CRLF/混合序列不被改写，最终磁盘保存继续复用 Ticket 19/LOG-0065 的 BOM 与单一主 line-ending 编码，不新增保存路径。
- **精确自动化：** `npx vitest run tests/frontmatter-roundtrip.test.ts`（1 file、24/24）。
- **相关回归：** `npx vitest run tests/frontmatter-roundtrip.test.ts tests/markdown-knowledge-ir.test.ts desktop/src/react/__tests__/editor/md-decorations.test.ts desktop/src/react/__tests__/components/MarkdownEditorSurface.test.tsx desktop/src/react/__tests__/components/KnowledgeDocumentEditor.save.test.tsx tests/i18n-locale-parity.test.ts tests/knowledge-i18n-a11y-contract.test.ts`（7 files、88/88）。
- **全仓回归：** `npx vitest run --exclude 'temp/**' --exclude 'teach/**' --silent`（1033 files passed、1 skipped；10387 tests passed、6 skipped）。
- **门禁与构建：** `npm run typecheck`、`npm run lint:boundary`、目标 ESLint、`git diff --check` 与 `npm run build:renderer` 通过；未改变 composition、preload/main 或 Server。
- **Playwright：** 按本 ticket 契约不适用，未运行。
- **Handoff：** `speculo/.speculo/commands/handoff/2026-07-29-openhanako-knowledge-workspace-implementation-25.md`
