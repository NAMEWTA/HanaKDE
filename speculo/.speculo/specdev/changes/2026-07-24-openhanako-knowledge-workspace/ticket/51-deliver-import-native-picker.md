# Ticket 51: 交付外部导入与原生 Picker

- **被阻塞于：** [`01-freeze-real-repository-baseline.md`](./01-freeze-real-repository-baseline.md)、[`03-freeze-open-knowledge-contract.md`](./03-freeze-open-knowledge-contract.md)、[`04-define-errors-and-diagnostics.md`](./04-define-errors-and-diagnostics.md)、[`06-complete-resource-io-http-seams.md`](./06-complete-resource-io-http-seams.md)、[`10-trace-knowledge-operation-protocol.md`](./10-trace-knowledge-operation-protocol.md)、[`14-establish-malicious-workspace-tests.md`](./14-establish-malicious-workspace-tests.md)、[`48-deliver-tree-keyboard-range-selection.md`](./48-deliver-tree-keyboard-range-selection.md)
- **状态：** 未开始

## 战略与背景

- **战略：** 通过最小 preload picker 或已授权 ResourceIO 来源建立复制计划，导入文件或目录并逐项报告冲突和失败。
- **需求追踪：** KW-US-165, KW-US-180, KW-US-181, KW-RULE-OP, KW-RULE-SEC, KW-RULE-IMPORT, KW-RULE-NATIVE
- **当前现状：** 当前实现接缝位于 `desktop/preload.cjs`、`desktop/main.cjs`、`server/routes/mobile-workbench.ts`；本 ticket 只扩展这些公开边界。
- **用户可验证结果：** 完成本 ticket 后，验收者能够通过公开 API、真实临时 workspace 或可交互 UI 验证本标题声明的单一能力。

## 范围边界

| IN | REUSE | OUT |
|---|---|---|
| 通过最小 preload picker 或已授权 ResourceIO 来源建立复制计划，导入文件或目录并逐项报告冲突和失败。 | `desktop/preload.cjs`<br>`desktop/main.cjs`<br>`server/routes/mobile-workbench.ts` | 未列入本 ticket 的后续功能；修改生成 bundle；创建平行文件系统、编辑器内核或私有 route 捷径 |

## 交付物

> 以下仅列主要交付物，不构成文件白名单或完整清单；为满足本 ticket 验收而新增/修改的同范围实现、类型、schema、fixture、测试、i18n 与文档同属交付物。

- `shared/knowledge-native-contract.ts`
- `core/knowledge-workspace/knowledge-import-service.ts`
- `tests/knowledge-import.test.ts`

## 实施时需阅读的文件

> 以下列出本 ticket 的具体代码接缝；实施前还必须按 [`README.md`](../README.md) 的文档权威关系读取 accepted [`LOG.md`](../LOG.md)、[`ADR.md`](../ADR.md)、[`CONTEXT.md`](../CONTEXT.md)、[`spec.md`](../spec.md) 及本 ticket 的固定实施契约，不能因本节或交付物未逐项复写而遗漏已确认结论。

- `desktop/preload.cjs`
- `desktop/main.cjs`
- `server/routes/mobile-workbench.ts`

## 固定实施契约

- [`implementation-contracts.md`](../implementation-contracts.md)
- [`operation-journal-contract.md`](../operation-journal-contract.md)

## 实施顺序

1. 在现有 window.hana 增加两个固定方法和 IPC channels。
2. Desktop-owned Server 每次启动生成 `nativeBridgeToken` 并写入现有 `0o600` `server-info.json`；Main 随 readiness polling 读取且不经 `get-server-token`/`server-restarted` 暴露。Main-only route 验证 loopback、本地认证 principal 与 `X-Hana-Native-Bridge`，再实现 60 秒单次 grant 的 replay/action/window 检查。
3. picker/clipboard 路径由 Main 直接提交本地 Server，不返回 Renderer。
4. Open/Web 的原生动作返回 `knowledge_native_capability_unavailable`；import service 可从调用者已经获权的 ResourceRef/ResourceIO 来源执行，不新增浏览器本机目录上传协议。

## 实现约束

1. 普通资源访问必须经现有 ResourceIO/provider；复合 mutation 必须经公开 coordinator 和 Operation Journal。
2. Renderer 不访问 Node 文件系统；远程 DTO、日志和 release evidence 不含绝对路径、正文或凭证。
3. 测试使用隔离临时 HANA_HOME、workspace、来源和端口，不依赖开发机固定路径或网络。
4. 实现不得引入未在 ADR/实施契约冻结的新存储引擎、IPC path surface、恢复状态或 E2E 框架。
5. picker/clipboard 输入通过 Ticket 06 的 ResourceIO transfer 流式进入 sibling staging；普通 Renderer server token 不能调用 Main-only route。
6. plan 在副作用前拒绝超过 100,000 entries、128 层或 100 GiB 已知 aggregate size 的顶层资源，并拒绝 device/socket/FIFO；symbolic link 只按 link entry、绝不解引用。

## 自动化证据

**Primary ownership：** KW-US-165, KW-US-180, KW-US-181

**必须创建或更新：**

- `tests/knowledge-native-contract.test.ts`
- `tests/knowledge-import.test.ts`
- `desktop/src/react/__tests__/services/knowledge-native-client.test.ts`

**Playwright 用户流程：** 适用；运行 E2E-KW-017

## 验收标准

- [ ] 远程端不接收本机路径；错误/缺失 native credential、普通 server token 和 replay 均被拒绝；取消不写入；批次结果确定；symlink 与超限输入按威胁模型拒绝。
- [ ] 本 ticket 拥有的每个 `KW-US-*` 都由上列精确测试直接证明；不存在范围兜底或 Ticket 57 代实现。
- [ ] 本 ticket 拥有的每个 `KW-RULE-*` 都满足对应契约文档，并有正常、取消/冲突、权限/不可用和故障注入覆盖。
- [ ] 相关既有回归、`npm run typecheck` 和 `npm run lint:boundary` 通过；涉及 composition、Renderer、preload/main 时运行相应 build。
- [ ] ticket 交付记录只填写实际执行命令、平台和结果；普通执行结果不写入 `LOG.md`。
- [ ] 交付物没有未决的“可能”“按需”“A 或 B”、未选框架、未选 schema 或未定义恢复语义。
