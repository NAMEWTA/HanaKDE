# Ticket 38: 交付附件与跨来源复制后引用

- **被阻塞于：** [`10-trace-knowledge-operation-protocol.md`](./10-trace-knowledge-operation-protocol.md)、[`23-define-knowledge-address-resolver.md`](./23-define-knowledge-address-resolver.md)、[`27-deliver-live-preview-modes.md`](./27-deliver-live-preview-modes.md)
- **状态：** 已完成

## 战略与背景

- **战略：** Knowledge 粘贴/拖入把资产写入当前页面同级 assets，跨来源先字节复制再插入 Wikilink。
- **需求追踪：** KW-US-005, KW-US-006, KW-US-115, KW-US-116, KW-US-117, KW-US-118, KW-RULE-MARKDOWN, KW-RULE-COPY
- **当前现状：** Preview 附件使用 Electron 直写与“文本附件”；Knowledge 目标语义为 ResourceIO、同级 assets 与 Wikilink。
- **用户可验证结果：** 完成本 ticket 后，验收者能够通过公开 API、真实临时 workspace 或可交互 UI 验证本标题声明的单一能力。

## 范围边界

| IN | REUSE | OUT |
|---|---|---|
| Knowledge 粘贴/拖入把资产写入当前页面同级 assets，跨来源先字节复制再插入 Wikilink。 | `desktop/src/react/utils/markdown-attachments.ts`<br>`lib/resource-io/resource-io.ts`<br>`core/mount-aware-file-service.ts` | 未列入本 ticket 的后续功能；修改生成 bundle；创建平行文件系统、编辑器内核或私有 route 捷径 |

## 交付物

> 以下仅列主要交付物，不构成文件白名单或完整清单；为满足本 ticket 验收而新增/修改的同范围实现、类型、schema、fixture、测试、i18n 与文档同属交付物。

- `core/knowledge-workspace/knowledge-copy-service.ts`
- `desktop/src/react/editor/knowledge-attachment-policy.ts`

## 实施时需阅读的文件

> 以下列出本 ticket 的具体代码接缝；实施前还必须按 [`README.md`](../README.md) 的文档权威关系读取 accepted [`LOG.md`](../LOG.md)、[`ADR.md`](../ADR.md)、[`CONTEXT.md`](../CONTEXT.md)、[`spec.md`](../spec.md) 及本 ticket 的固定实施契约，不能因本节或交付物未逐项复写而遗漏已确认结论。

- `desktop/src/react/utils/markdown-attachments.ts`
- `lib/resource-io/resource-io.ts`
- `core/mount-aware-file-service.ts`

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
6. 所有跨 provider copy 使用 Ticket 06 的 ResourceIO transfer；不得通过 Renderer、绝对路径或全量内存 buffer 中转。

## 自动化证据

**Primary ownership：** KW-US-005, KW-US-006, KW-US-115, KW-US-116, KW-US-117, KW-US-118

**必须创建或更新：**

- `tests/knowledge-copy-service.test.ts`
- `desktop/src/react/__tests__/editor/knowledge-attachment-policy.test.ts`

**Playwright 用户流程：** 适用；运行 E2E-KW-010

## 验收标准

- [x] 文件名使用日期前缀和确定冲突后缀；复制失败不修改 Markdown；副本正文/字节不重写。
- [x] 本 ticket 拥有的每个 `KW-US-*` 都由上列精确测试直接证明；不存在范围兜底或 Ticket 57 代实现。
- [x] 本 ticket 拥有的每个 `KW-RULE-*` 都满足对应契约文档，并有正常、取消/冲突、权限/不可用和故障注入覆盖。
- [x] 相关既有回归、`npm run typecheck` 和 `npm run lint:boundary` 通过；涉及 composition、Renderer、preload/main 时运行相应 build。
- [x] ticket 交付记录只填写实际执行命令、平台和结果；普通执行结果不写入 `LOG.md`。
- [x] 交付物没有未决的“可能”“按需”“A 或 B”、未选框架、未选 schema 或未定义恢复语义。

## 实施交付记录

- **实现提交：** `f68345f0`
- **平台：** macOS Darwin 25.5.0 / Apple arm64 / APFS；Node `v24.16.0` / npm `11.13.0`
- **复制与命名：** 同来源 Page/Asset 直接写来源内 Wikilink；跨来源 Page 先逐字节复制完整 `.md` 到当前页面目录，跨来源 Asset 与系统文件先复制到页面同级小写 `assets/`。附件名固定为 `YYYY-MM-DD-original.ext`，缺名回退 `image.ext`，冲突按最后扩展名前 `_2`、`_3` 递增。
- **资源原子性：** 复制经 ResourceIO transfer 和 `expectedTargetVersion: null` 提交；正文/二进制字节保持原样，不迁移、删除或重写来源引用。目标 `assets` 被非目录占用、版本冲突、取消、权限/来源不可用、长度不符或传输异常时不插入链接，不留下正式半文件；批次按输入顺序允许逐项部分成功。
- **编辑历史：** 每个成功项生成一行 Markdown；安全静态媒体使用 `![[...]]`，Page 与不支持嵌入的附件使用 `[[...]]`。整批成功链接由一个 CM6 transaction 写入；Undo 只移除正文引用并保留副本，Redo 重新复制原始项并使用新的确定性冲突名后插入新引用。
- **外部文件与安全边界：** 系统 File 通过一次性 `session_file` RequestBody provider 分块流入 ResourceIO，不在 Renderer 使用 Node 文件系统、绝对路径或整文件 byte buffer。自定义拖放 MIME 仅接收数量与字节上限内的严格 source-scoped 地址；远程 DTO、错误和日志不暴露本地路径或正文。
- **公开组合：** Engine public facade、Knowledge route、`files.write` 授权、Renderer client 与编辑器策略贯通内部资源和外部文件两条路径；外部元数据使用有上限的 opaque base64url header，Server 在进入 provider 前拒绝多余字段、绝对路径和来源不匹配。
- **UI：** 可写 Knowledge Markdown 文档启用粘贴/拖入策略；失败以五语言非阻塞消息提示，成功项不受同批失败项影响。菜单 Redo 与平台快捷键使用同一附件历史；没有新增主题、布局或独立状态机。
- **精确自动化：** `npx vitest run tests/knowledge-copy-service.test.ts desktop/src/react/__tests__/editor/knowledge-attachment-policy.test.ts --exclude 'temp/**' --reporter=dot`（2 files、17/17）；覆盖同源直链、跨来源 Page/Asset、系统文件、命名冲突、并发复制、批次部分成功、整批 transaction、Undo/重新复制 Redo、超 1.5 MiB 分块字节一致性、取消、长度不符清理、权限/不可用与不安全字段拒绝。
- **相关回归：** 最终硬化后的 copy/client/route/editor/history 核心定向为 5 files、79/79；ResourceIO、编辑器组合、groups 与 i18n 相关定向为 10 files、65/65。
- **产品范围全仓：** `npm test -- --exclude 'temp/**' --reporter=dot` 在实现提交前的同一代码状态真实退出 0（1055 files；1054 passed、1 skipped；10625 tests，10619 passed、6 skipped、0 failed）。
- **门禁与构建：** `npm run typecheck`、`npm run lint:boundary`、目标 ESLint 与 `git diff --check` 通过；Renderer、Open Server 与带一次性临时 Ed25519 签名材料的 Full Server production build 通过，临时签名材料已删除。
- **Playwright：** E2E-KW-010 当前未执行；仓库实际只有 `E2E-KW-001-shell.spec.ts`，不存在 E2E-KW-010 spec。未创建私有 route、测试捷径或缩减场景；后续真实资源树拖拽入口与发布 E2E 完成后必须补建并执行，最终发布前不得保留该缺口。
- **Handoff：** `speculo/.speculo/commands/handoff/2026-07-30-openhanako-knowledge-workspace-implementation-38.md`
