# Ticket 02: 建立 SilverBullet 可审计参考边界

- **被阻塞于：** 无
- **状态：** 已完成

## 战略与背景

- **战略：** 为本地 SilverBullet 2.9.0 建立文件级 provenance、哈希、MIT notice 和适配边界。
- **需求追踪：** KW-RULE-LICENSE
- **当前现状：** 本地参考为 @silverbulletmd/silverbullet 2.9.0，目录不含独立 .git 元数据，许可证为 MIT。
- **用户可验证结果：** 完成本 ticket 后，验收者能够通过公开 API、真实临时 workspace 或可交互 UI 验证本标题声明的单一能力。

## 范围边界

| IN | REUSE | OUT |
|---|---|---|
| 为本地 SilverBullet 2.9.0 建立文件级 provenance、哈希、MIT notice 和适配边界。 | `silverbullet/package.json`<br>`silverbullet/LICENSE.md`<br>`silverbullet/client/codemirror/` | 未列入本 ticket 的后续功能；修改生成 bundle；创建平行文件系统、编辑器内核或私有 route 捷径 |

## 交付物

> 以下仅列主要交付物，不构成文件白名单或完整清单；为满足本 ticket 验收而新增/修改的同范围实现、类型、schema、fixture、测试、i18n 与文档同属交付物。

- `silverbullet-reference-matrix.md`
- 仓库根第三方声明（见 `silverbullet/LICENSE.md` 与 `silverbullet-reference-matrix.md`）

## 实施时需阅读的文件

> 以下列出本 ticket 的具体代码接缝；实施前还必须按 [`README.md`](../README.md) 的文档权威关系读取 accepted [`LOG.md`](../LOG.md)、[`ADR.md`](../ADR.md)、[`CONTEXT.md`](../CONTEXT.md)、[`spec.md`](../spec.md) 及本 ticket 的固定实施契约，不能因本节或交付物未逐项复写而遗漏已确认结论。

- `silverbullet/package.json`
- `silverbullet/LICENSE.md`
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

## 自动化证据

**Primary ownership：** 无直接用户故事；按上列规则域交付

**必须创建或更新：**

- `tests/silverbullet-reference-integrity.test.ts`

**对应端到端场景：** 无独立 E2E；由契约/集成测试证明并被下游场景覆盖

## 验收标准

- [x] 每个参考能力有来源文件、SHA-256、允许采用方式和 HanaKDE 落点；不引入 SilverBullet 运行时。
- [x] `Primary ownership` 明确为无直接用户故事；本 ticket 不新增未分配的产品行为，也不替其他 ticket 兜底。
- [x] 本 ticket 拥有的每个 `KW-RULE-*` 都满足对应契约文档，并有正常、取消/冲突、权限/不可用和故障注入覆盖。
- [x] 相关既有回归、`npm run typecheck` 和 `npm run lint:boundary` 通过；涉及 composition、Renderer、preload/main 时运行相应 build。
- [x] ticket 交付记录只填写实际执行命令、平台和结果；普通执行结果不写入 `LOG.md`。
- [x] 交付物没有未决的“可能”“按需”“A 或 B”、未选框架、未选 schema 或未定义恢复语义。

## 实现交接摘要

- **Commit：** `e5257959`
- **实现：** 新增 `tests/silverbullet-reference-integrity.test.ts` 与仓库根 `THIRD_PARTY_NOTICES.md`；严格审计覆盖 8 个单文件、3 个目录聚合哈希、9 行能力采用边界、MIT/版本/Node 要求，以及生产源码和 runtime manifest 不引用 SilverBullet。
- **严格证据：** `SILVERBULLET_REFERENCE_REQUIRED=1 SILVERBULLET_REFERENCE_ROOT=<repo-root> volta run npx vitest run tests/silverbullet-reference-integrity.test.ts`，5/5 通过、0 skip；严格模式缺失 snapshot 时退出码非零。
- **共享门禁：** `volta run npm run typecheck` 通过；`volta run npm run lint:boundary` 通过（仅报告 1 条已跟踪既有债务）；`volta run npx eslint tests/silverbullet-reference-integrity.test.ts` 通过。
- **审查：** standards reviewer 与 spec reviewer 在两轮修复后均 `APPROVED`；已消除 linked-worktree 路径推导、过窄 runtime 证明和 snapshot 缺失仍 0-exit 的伪通过风险。
- **偏差：** 无。矩阵记录的 8 个单文件与 3 个目录哈希全部一致，未修改 `silverbullet/`，未采用 SilverBullet runtime。
