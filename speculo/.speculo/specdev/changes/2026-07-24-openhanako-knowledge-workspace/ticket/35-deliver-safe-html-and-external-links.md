# Ticket 35: 交付安全 HTML、本地 URL 与外链策略

- **被阻塞于：** [`14-establish-malicious-workspace-tests.md`](./14-establish-malicious-workspace-tests.md)、[`17-deliver-open-policy-and-asset-viewer.md`](./17-deliver-open-policy-and-asset-viewer.md)、[`23-define-knowledge-address-resolver.md`](./23-define-knowledge-address-resolver.md)、[`27-deliver-live-preview-modes.md`](./27-deliver-live-preview-modes.md)
- **状态：** 已完成

## 战略与背景

- **战略：** 统一现有 sanitizer、资源 URL 和 Electron openExternal 协议白名单。
- **需求追踪：** KW-US-091, KW-US-092, KW-US-093, KW-US-094, KW-US-122, KW-RULE-MARKDOWN, KW-RULE-SEC
- **当前现状：** 当前实现接缝位于 `desktop/src/react/utils/markdown-html-sanitizer.ts`、`desktop/src/react/utils/link-open.ts`、`desktop/preload.cjs`；本 ticket 只扩展这些公开边界。
- **用户可验证结果：** 完成本 ticket 后，验收者能够通过公开 API、真实临时 workspace 或可交互 UI 验证本标题声明的单一能力。

## 范围边界

| IN | REUSE | OUT |
|---|---|---|
| 统一现有 sanitizer、资源 URL 和 Electron openExternal 协议白名单。 | `desktop/src/react/utils/markdown-html-sanitizer.ts`<br>`desktop/src/react/utils/link-open.ts`<br>`desktop/preload.cjs` | 未列入本 ticket 的后续功能；修改生成 bundle；创建平行文件系统、编辑器内核或私有 route 捷径 |

## 交付物

> 以下仅列主要交付物，不构成文件白名单或完整清单；为满足本 ticket 验收而新增/修改的同范围实现、类型、schema、fixture、测试、i18n 与文档同属交付物。

- `desktop/src/react/utils/knowledge-safe-rendering.ts`
- `tests/knowledge-safe-links.test.ts`

## 实施时需阅读的文件

> 以下列出本 ticket 的具体代码接缝；实施前还必须按 [`README.md`](../README.md) 的文档权威关系读取 accepted [`LOG.md`](../LOG.md)、[`ADR.md`](../ADR.md)、[`CONTEXT.md`](../CONTEXT.md)、[`spec.md`](../spec.md) 及本 ticket 的固定实施契约，不能因本节或交付物未逐项复写而遗漏已确认结论。

- `desktop/src/react/utils/markdown-html-sanitizer.ts`
- `desktop/src/react/utils/link-open.ts`
- `desktop/preload.cjs`

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

**Primary ownership：** KW-US-091, KW-US-092, KW-US-093, KW-US-094, KW-US-122

**必须创建或更新：**

- `tests/knowledge-safe-links.test.ts`
- `desktop/src/react/__tests__/utils/knowledge-safe-rendering.test.ts`

**Playwright 用户流程：** 适用；运行 E2E-KW-011

## 验收标准

- [x] javascript/data 主动内容被拒绝；本地资源经受控 URL；外链只允许明确协议并需用户动作。
- [x] 本 ticket 拥有的每个 `KW-US-*` 都由上列精确测试直接证明；不存在范围兜底或 Ticket 57 代实现。
- [x] 本 ticket 拥有的每个 `KW-RULE-*` 都满足对应契约文档，并有正常、取消/冲突、权限/不可用和故障注入覆盖。
- [x] 相关既有回归、`npm run typecheck` 和 `npm run lint:boundary` 通过；涉及 composition、Renderer、preload/main 时运行相应 build。
- [x] ticket 交付记录只填写实际执行命令、平台和结果；普通执行结果不写入 `LOG.md`。
- [x] 交付物没有未决的“可能”“按需”“A 或 B”、未选框架、未选 schema 或未定义恢复语义。

## 实施交付记录

- **实现提交：** `ef654120`
- **平台：** macOS Darwin 25.5.0 / Apple M5 arm64 / APFS；Node `v24.16.0` / npm `11.13.0`
- **共享 IR 与单一渲染边界：** `markdown-knowledge-ir.ts`/`markdown-lexer.ts` 原生投影 block、inline、comment raw HTML token；`knowledge-safe-rendering.ts` 是 HTML 语义解析与安全模型的唯一 owner，复用共享 Markdown IR、真实 link resolver、脚注/数学 renderer 与既有严格 Mermaid renderer，未放宽通用 preview sanitizer。
- **HTML allowlist：** 只接受显式语义标签和属性；`style`、`class`、`id`、事件属性、script/style/iframe/object/embed/source、未配对/未闭合/未知标签、comment 和媒体内嵌 element 全部在原源码位置显示 blocked 状态。Live Preview 仅在所有 selection 离开 token 后派生 widget；Source 模式始终显示字面源码，任何回源动作只变更 selection/scroll。
- **链接策略：** HTML 内部链接沿用同来源地址解析和现有激活入口；外链只规范化绝对 `http:`/`https:`，仅显式 pointer click 或 Enter/Space 后经 Electron/system open boundary 打开。`javascript:`、`data:`、`file:`、凭证 URL、协议相对与自定义协议不传入系统边界；main、mobile 与 web fallback 同步收紧。
- **本地媒体：** 只允许当前页面目录下的相对同来源 `img`/`audio`/`video`，拒绝远程、绝对、sourceKey 和越界地址。Renderer 先用 Ticket 17 `evaluateResourceOpenPolicy` stat，再经注入的 ResourceIO 读取 base64；实际字节长度/版本漂移失败关闭。成功后只创建 owned Blob URL，无自动播放；destroy/取消会 abort 并 revoke，权限、不可用、冲突与读取失败保持不可用状态且不泄露路径。
- **可访问性与布局：** zh-CN、zh-TW、en、ja、ko 提供 blocked、loading、unavailable、外链与媒体文案；widget 交付 button/link role、ARIA、focus-visible、Enter/Space、亮暗主题 token 和窄布局响应样式。
- **精确与相关自动化：** `volta run npx vitest run tests/knowledge-safe-links.test.ts tests/markdown-knowledge-ir.test.ts tests/knowledge-malicious-workspace.test.ts tests/persistence-schema-tripwire.test.ts desktop/src/react/__tests__/utils/knowledge-safe-rendering.test.ts desktop/src/react/__tests__/editor/knowledge-safe-html-field.test.ts desktop/src/react/__tests__/utils/link-open.test.ts desktop/src/react/__tests__/mobile/mobile-platform.test.ts desktop/src/react/__tests__/modules/platform-web.test.ts desktop/src/react/__tests__/components/KnowledgeDocumentEditor.save.test.tsx desktop/src/react/__tests__/lib/i18n-flat-keys.test.ts --exclude 'temp/**' --reporter=dot`（11 files、85/85）；覆盖正常渲染、Source/selection、链接用户手势、恶意协议/嵌套内容、媒体取消/revoke、版本冲突、权限/不可用、系统边界和五语言 key。
- **产品范围全仓：** `npm test -- --exclude 'temp/**' --reporter=json --outputFile=/tmp/hana-ticket35-vitest-final2.json` 在实现提交前的同一代码状态真实退出 0（1050 files；10570 tests，10564 passed、6 skipped、0 failed）。
- **参考与基础门禁：** `SILVERBULLET_REFERENCE_ROOT=/Users/wta/Documents/01-Code/myCode/HanaKDE volta run npx vitest run tests/knowledge-baseline-contract.test.ts tests/knowledge-preflight.test.ts --exclude 'temp/**' --reporter=dot`（17/17）。
- **门禁与构建：** `npm run typecheck`、`npm run lint:boundary`、目标 ESLint、`git diff --check`、`node --check desktop/main.cjs desktop/preload.cjs desktop/src/modules/platform.js`、`npm run build:renderer`、`npm run build:preload`、`npm run build:main` 通过。
- **持久化指纹：** `desktop/main.cjs` 受 persistence source hash tripwire 约束；本票仅改变非持久化外链协议规范化，执行 `node scripts/generate-persistence-schema-fingerprint.mjs --classification compatible --compatibility-reason "External-link protocol normalization changes only non-persistent Electron navigation behavior; store schemas, ownership, DATA_EPOCH, and persisted bytes are unchanged."` 合法重钉 payload `sha256:f72894a5d99281fabac1cfaea048a09b97cdd01c21361fcc0764fbcb126e4cbb`，tripwire 7/7 通过。
- **Playwright：** E2E-KW-011 当前未执行；仓库尚无该 spec，真实资源树单击/双击/Enter/Space 打开 Markdown 的公开入口由 Tickets 48/49 交付。未创建私有 route、测试捷径或缩减场景；48/49 完成后必须补建并执行，最终发布前不得保留该缺口。
- **Handoff：** `speculo/.speculo/commands/handoff/2026-07-29-openhanako-knowledge-workspace-implementation-35.md`
