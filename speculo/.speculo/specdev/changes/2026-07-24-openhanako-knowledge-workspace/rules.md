# 知识工作区局部工程规则

## 权威关系

1. `LOG.md` 中 `Status: accepted` 的条目：用户已确认且当前有效的完整产品决定、具体场景与禁止边界。
2. `ADR.md`：保留稳定编号的架构、安全、事实来源及已提升决定；不得删除或复用既有编号。
3. `CONTEXT.md`：所有文档和代码共用的核心词义、细粒度定义与 `_Avoid_`。
4. `spec.md`：把 accepted 决定规范化为产品行为、Requirement ID 与验收。
5. `architecture.md` 与实施契约：上述决定的唯一可编码方案；本文件约束工程实施纪律。
6. `requirements-traceability.md`、`tickets-map.md` 与 `ticket/`：归属和执行切片，不得缩减已确认范围。

上述文件必须表达同一最终设计；不得用抽象“优先级”选择性忽略 accepted LOG。发现冲突时必须同步修正所有受影响文档，不得只在 ticket、代码注释或 PR 描述中创造永久例外。普通执行结果不能写入 LOG。

## 必须复用

- 文件访问：`lib/resource-io/`、provider、ResourceEventBus。
- 工作根与 mount：`core/mount-aware-file-service.ts`、Studio mount registry。
- Server：现有 Engine public facade、open/full composition。
- 编辑器：`PreviewEditor.tsx` 与 `desktop/src/react/editor/`。
- 资产：现有 MediaViewer、file-preview、resource URL 与 HTML sanitizer。
- Renderer 状态：现有 Zustand 模式；不得保存 EditorView、DOM 或文件句柄。

禁止创建第二个 watcher、WebSocket、文件系统、编辑器内核、索引事实源或顶级应用。

## 目录

```text
shared/knowledge-*.ts                    stable DTO/schema/errors
lib/knowledge-workspace/                 platform-neutral domain/parser/persistence adapters
core/knowledge-workspace/                lifecycle/coordinator/facade
server/routes/knowledge-workspace.ts     HTTP boundary
desktop/src/react/components/knowledge-workspace/
desktop/src/react/editor/                CM6 extensions and transactions
desktop/src/react/services/              Renderer HTTP/WS clients
desktop/src/react/stores/                serializable UI projections
tests/                                   Server/domain/contracts/security
desktop/src/react/__tests__/              Renderer/CM6/UI
```

新增文件使用现有项目命名习惯。React 主组件使用 PascalCase；其他 TypeScript 使用 kebab-case。不得创建 `common/`、`misc/`、`helpers/` 或按操作拆成多个平行 routes。

## 契约

- 不重定义 `ResourceRef`；知识 DTO 使用 `KnowledgeResourceAddress`。
- 所有 route body 和 response 有 schema；Server 以 `unknown` 接收外部数据。
- principal、owner 与 scope 只从认证后的 Hono context 派生；schema 拒绝 body 中的 `principal`、`userId`、`studioId` 等身份字段。
- DTO、Zustand 和日志不含绝对路径、正文、凭证、EditorView、DOM 或 native handle。
- 普通 CRUD 走 ResourceIO；复合操作走 KnowledgeOperationCoordinator。
- 跨 provider copy/import 走 ResourceIO `transfer`：有界流式传输、目标同级 staging、目录整体发布，不经 Renderer 或全量内存 buffer 中转。
- route 只调用 Engine public facade，不访问 manager 私有字段。
- Open 代码不得动态 import、路径拼接或反射加载 Full 实现。
- 新 Knowledge 错误码只用 lowercase snake_case；HTTP status、错误码和 retryable 必须由共享 schema 固定。

## Markdown 与 CM6

- 共享词法/IR 放 `lib/knowledge-workspace/`；CM6 extension 消费 IR 并管理视图。
- command 必须返回单一 CM6 transaction，可单步撤销。
- Preview autosave 与 Knowledge manual save 通过 policy 分开，不允许全局改变 Preview。
- 不把 SilverBullet parser、Space、plugin、Lua、query 或 UI runtime 直接接入。

## 文件与事务

- 地址规范化只执行一次；provider 再做 realpath/scope 校验。
- 跨来源复制保持正文/字节原样；同源 rename/move 才能重写引用。
- plan/commit 之间必须检查 expected versions、来源状态和目标冲突；所有复合 mutation 还必须持久化 Operation Journal 并支持启动恢复。
- 同源重构的 rollback 边界只含主资源和已保存链接改写；event、session rebind 与 index 是 `COMMITTED` 后可重试投影，不得因派生投影失败回滚磁盘事实。
- watcher 事件携带 correlation；索引在 commit 后重读磁盘。索引只使用 `index-store-contract.md` 的 better-sqlite3 schema/generation 和连续子串算法，不得自选方案。
- 数据变更测试必须有失败注入、rollback/checkpoint 和部分完成断言。

## 安全

- symlink/junction、UNC/盘符、大小写、Unicode normalization、控制字符、TOCTOU 和超大资源使用真实临时目录测试。
- 打开、embed 与索引必须先 stat 再读取；超过 10 MiB 的文本不得先整体载入内存后才拒绝。
- HTML/SVG/Mermaid/URI 不执行主动内容；Mermaid 丢弃 `bindFunctions`、消毒 SVG、阻止 stale result；外链只允许明确协议和用户动作。
- `.trash`、索引目录和 manifest 必须防外部替换和越界。
- 日志只允许稳定错误码和脱敏地址。
- Main-only route 使用只存在于 Server/Main 的 `nativeBridgeToken`，不能使用 Renderer 已知的普通 loopback token 证明 Main 身份。

## UI

每个 UI ticket 同时完成 zh-CN、zh-TW、en、ja、ko，键盘路径、ARIA、focus、亮暗主题、窄布局和取消/错误状态。每个 ticket 的“交付物”只列主要交付物；同范围的实现、类型、schema、fixture、测试、i18n 与文档即使未逐项列名，也必须随该 ticket 完成。最终发布 ticket 不补做遗漏。

## 验证

每个 ticket 至少运行相关 Vitest、`npm run typecheck` 和 `npm run lint:boundary`。Playwright 不是通用 ticket 门禁：只有 ticket 直接交付需要在真实 Browser/Electron 中串联操作与反馈的用户流程时，才运行该 ticket 标注的 Playwright 场景；纯逻辑、契约、存储、索引、API、安全、fixture、文档和组件级行为使用 Vitest 即可。E2E ID 的需求追踪关系本身不构成该 ticket 必跑 Playwright 的理由。涉及 composition 时运行 `npm run build:server:open`；涉及 Renderer/preload/main 时运行对应 build。交付记录只能列实际执行命令。

## 第三方参考

只按 `silverbullet-reference-matrix.md` 读取仓库根 `silverbullet/`。若采用代码，在同一 commit 更新 matrix，并在仓库根维护/更新第三方声明（许可证原文见 `silverbullet/LICENSE.md`）；未记录 provenance 的代码不得合入。


## 实施闭环

- Ticket 01 必须通过 implementation-preflight，并为后续用户流程 ticket 引入固定 Playwright 依赖和 scripts；Ticket 01 自身只需运行其 Vitest/preflight 门禁。
- Provider 根 identity 不能证明 disjoint 时拒绝来源。
- Knowledge native IPC 不接受任意绝对路径，只消费一次性 grant；Main-only HTTP route 还必须验证独立 native bridge credential。
- 每个 KW-US 只由 `requirements-traceability.md`（及 ticket「需求追踪」行）指定的 primary owner 实现；57 不兜底。
- 发布证据写 `release-evidence.md`，普通执行结果不写设计 `LOG.md`。
