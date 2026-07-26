# Ticket 12: 抽取策略驱动的共享 CM6 表面

- **被阻塞于：** [`01-freeze-real-repository-baseline.md`](./01-freeze-real-repository-baseline.md)、[`02-audit-silverbullet-reference.md`](./02-audit-silverbullet-reference.md)、[`11-define-markdown-semantic-ir.md`](./11-define-markdown-semantic-ir.md)
- **状态：** 已完成

## 战略与背景

- **战略：** 从 PreviewEditor 抽取共享表面，并注入 save、attachment、open-link 和 content-gate 策略。
- **需求追踪：** KW-US-057, KW-RULE-MARKDOWN
- **当前现状：** PreviewEditor 已有 CM6、600ms autosave、expected-version、checkpoint、表格、数学和 Mermaid。
- **用户可验证结果：** 完成本 ticket 后，验收者能够通过公开 API、真实临时 workspace 或可交互 UI 验证本标题声明的单一能力。

## 范围边界

| IN | REUSE | OUT |
|---|---|---|
| 从 PreviewEditor 抽取共享表面，并注入 save、attachment、open-link 和 content-gate 策略。 | `desktop/src/react/components/PreviewEditor.tsx`<br>`desktop/src/react/editor/`<br>`desktop/src/react/utils/markdown-attachments.ts` | 未列入本 ticket 的后续功能；修改生成 bundle；创建平行文件系统、编辑器内核或私有 route 捷径 |

## 交付物

> 以下仅列主要交付物，不构成文件白名单或完整清单；为满足本 ticket 验收而新增/修改的同范围实现、类型、schema、fixture、测试、i18n 与文档同属交付物。

- `desktop/src/react/components/preview/MarkdownEditorSurface.tsx`
- `desktop/src/react/editor/create-markdown-editor-extensions.ts`
- `desktop/src/react/__tests__/components/MarkdownEditorSurface.test.tsx`

## 实施时需阅读的文件

> 以下列出本 ticket 的具体代码接缝；实施前还必须按 [`README.md`](../README.md) 的文档权威关系读取 accepted [`LOG.md`](../LOG.md)、[`ADR.md`](../ADR.md)、[`CONTEXT.md`](../CONTEXT.md)、[`spec.md`](../spec.md) 及本 ticket 的固定实施契约，不能因本节或交付物未逐项复写而遗漏已确认结论。

- `desktop/src/react/components/PreviewEditor.tsx`
- `desktop/src/react/editor/`
- `desktop/src/react/utils/markdown-attachments.ts`

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

**Primary ownership：** KW-US-057

**必须创建或更新：**

- `desktop/src/react/__tests__/components/MarkdownEditorSurface.test.tsx`

**Playwright 用户流程：** 不适用；本 ticket 使用上述 Vitest 单元、组件、契约或集成测试，不运行 Playwright；下游或发布级用户流程可继续覆盖相关行为

## 验收标准

- [x] Preview 继续 600ms autosave 和原附件语义；Knowledge 手动保存；撤销历史与现有 decorations 无回归。
- [x] 本 ticket 拥有的每个 `KW-US-*` 都由上列精确测试直接证明；不存在范围兜底或 Ticket 57 代实现。
- [x] 本 ticket 拥有的每个 `KW-RULE-*` 都满足对应契约文档，并有正常、取消/冲突、权限/不可用和故障注入覆盖。
- [x] 相关既有回归、`npm run typecheck` 和 `npm run lint:boundary` 通过；涉及 composition、Renderer、preload/main 时运行相应 build。
- [x] ticket 交付记录只填写实际执行命令、平台和结果；普通执行结果不写入 `LOG.md`。
- [x] 交付物没有未决的“可能”“按需”“A 或 B”、未选框架、未选 schema 或未定义恢复语义。

## 实现交接摘要

- **实现提交：** 本 worktree `a6dd62d5`（分支 `speculo/specdev/2026-07-24-openhanako-knowledge-workspace-12`；继承上会话草稿 `82559edd`，先 rebase 到主线 `e5b3e1d7`（无冲突，rebase 后为 `be269041`），经双轴审查修复后 amend 为单一 feat 提交）。
- **平台：** macOS Darwin 25.5.0 arm64、Node `v24.16.0`（volta）、npm `11.13.0`。
- **实现范围：** 新增 `desktop/src/react/components/preview/MarkdownEditorSurface.tsx`（唯一 CM6 EditorView 生命周期宿主：host-ready 检测、按 `configurationKey` 重建、卸载时先执行调用方 cleanup 再 destroy、root 同步）与 `desktop/src/react/editor/create-markdown-editor-extensions.ts`（策略工厂：`savePolicy`/`attachmentPolicy`/`openLinkPolicy`/`contentPolicy` 四个注入点 + 既有 decorations/compartment 组装）；`link-handler.ts` 改为 `createLinkClickHandler(openLink)` 工厂；`PreviewEditor.tsx` 重构为该表面的第一个适配器，注入 600ms autosave、checkpoint、expected-version、原附件粘贴/拖放语义与 `openInternalLink` 打开策略，公共 props/handle 不变。
- **KW-US-057 证据：** `desktop/src/react/__tests__/components/MarkdownEditorSurface.test.tsx`（6 用例）——`strictUtf8MaxBytes` 内容门禁在 10 MiB 精确边界（`MARKDOWN_EDITOR_MAX_UTF8_BYTES`）通过等/超一字节、多字节字符（2/3/4 字节、surrogate pair）增量计数、非法 UTF-8（lone surrogate、拆分 surrogate 的插入与删除）拒绝、初始内容非法/超限 fail-closed（throw）；字节数按 UTF-8 对 buffer 文本确定性计算，不依赖平台编码，跨平台一致。
- **接缝证明：** PreviewEditor 为真实 autosave 适配器；测试内以「手动保存策略（仅记录 dirty，不写盘）+ 10 MiB 门禁」在同一表面组合出 Knowledge 形态，`Transaction.remote` 重载不触发 dirty——证明 ticket 18/19 可用手动保存策略复用同一表面，无需第二编辑器内核。
- **行为决定：** ① Preview 不注入 content gate，完整保留既有语义（ADR-0291：门禁由策略注入，Knowledge 侧启用）；② 编辑器重建键从「`remoteContentRef` 对象引用」改为内容字段键（kind/mountId/rootId/subdir/name/contentPath，显式排除 `version`），避免远程保存后版本更新或引用抖动导致无谓销毁重建、丢失撤销历史，`saveDocument`/版本经 ref 转发始终最新；③ 编辑器门禁对 buffer 文本按 UTF-8（LF）计数维持编辑侧不变量，打开前按磁盘原始大小 stat 的门禁属 Server/文档会话票（18/19 与索引侧）职责。
- **审查修复（相对草稿）：** ① 删除无消费者的 `savePolicy.shouldPersistTransaction` 可选钩子，保持策略接口最小、无投机通用性；② `MarkdownEditorOpenLinkPolicy.open` 复用 `link-handler.ts` 的 `MarkdownLinkOpenHandler` 类型，消除重复形状定义；③ 字节计数 StateField 在增量计算不可用时对 `transaction.newDoc` 全量重算，消除潜在计数漂移；④ 补齐 surrogate 拆分删除/插入拒绝与 4 字节字符精确计数用例；⑤ 补齐手动保存 + 门禁组合接缝用例；⑥ 新测试文件补 `Range.prototype.getClientRects/getBoundingClientRect` stub（与既有 PreviewEditor 测试同惯例），消除 jsdom 下 block-handles 测量导致的 unhandled error。
- **红灯证据：** 将 `PreviewEditor.tsx`、`link-handler.ts` 检出到基线 `e5b3e1d7` 并临时移除两个新实现文件后，`volta run npx vitest run desktop/src/react/__tests__/components/MarkdownEditorSurface.test.tsx` 因无法解析 `create-markdown-editor-extensions` 导入失败（1 failed / no tests），随后恢复工作树；草稿继承自上会话，无法在本会话重放「实现文件存在但语义未实现」的原始红灯，如实以模块缺失失败作为对基线的红灯证据。
- **自动化（macOS，全部实际执行）：** `volta run npx vitest run desktop/src/react/__tests__/components/MarkdownEditorSurface.test.tsx`（6/6）；既有回归 `PreviewEditor.file-sync/cover-drop/block-handles + EditorContextMenu`（4 files 64/64）；`desktop/src/react/__tests__/editor/`（8 files 79/79）；`desktop/src/react/__tests__/components/` 全目录（124 files 762/762，无 unhandled error）；`markdown-attachments/PreviewPanel.status/MarkdownChrome.layout/markdown-editor-selection-style` 等周边（12 files 97/97）；新增/修改文件 targeted ESLint 0 error 0 warning；`volta run npm run typecheck`、`volta run npm run lint:boundary`、`volta run npm run build:renderer` 通过（chunk 体积警告为既有状况）。
- **UI 横切结论：** 本票为纯结构抽取，无新增用户可见文案、控件或状态：Preview 外观与交互不变，content gate 在本票无 UI 消费者（Preview 不启用；Knowledge 的保存/拒绝提示 UI 属 ticket 18/19 交付），故五语言、键盘、ARIA/focus、亮暗主题、窄布局与取消/错误状态在本票不产生新增交付面。
- **Playwright：** 本票明确不适用；组件/契约行为由上述 Vitest 覆盖。
- **边界遵守：** Renderer 未访问 Node 文件系统（仅沿用既有 `window.platform` 桥）；未引入新存储引擎、IPC surface、第二编辑器内核或私有 route；未修改生成 bundle 语义。
