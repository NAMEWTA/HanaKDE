# 知识工作区实施契约

本文件冻结会直接影响代码结构、数据安全和跨平台行为的实施级契约。它从 `ADR.md`、`CONTEXT.md`、`LOG.md` 派生，与 `architecture.md`、`index-store-contract.md`、`operation-journal-contract.md` 和 `test-strategy.md` 共同构成可编码边界。

## 1. 契约优先级

1. 基础事实层：`ADR.md`、`CONTEXT.md`、`LOG.md`。
2. 产品验收：`spec.md`。
3. 实施契约：本文件、`architecture.md`、`index-store-contract.md`、`operation-journal-contract.md`、`test-strategy.md`。
4. 执行切片：`ticket/`。

实施契约只能把上位决定变成唯一可编码方案，不得重新定义产品语义。

## 2. 实现前仓库 Preflight

实现必须从**仓库根**按 [`implementation-baseline.md`](./implementation-baseline.md) 与 [`README.md`](./README.md) 文档核对清单完成 preflight（本包仅 Markdown，无独立校验脚本）。

Preflight 必须验证：

- 当前 Git 分支为 `hanakde`；`a7ff307c` 是当前 HEAD 的祖先。
- Node 满足仓库 `engines.node`；当前基线为 `>=24.12.0 <25`。
- `package.json` 名称、版本、关键 scripts、核心依赖与 `implementation-baseline.md` 描述一致。
- `desktop/`、`server/`、`core/`、`lib/`、`shared/`、`tests/` 以及全部关键接缝存在。
- `./silverbullet/` 中矩阵列出的参考文件与 [`silverbullet-reference-matrix.md`](./silverbullet-reference-matrix.md) 一致；许可证见 `silverbullet/LICENSE.md`。
- dirty 工作树必须记录具体数量并产生警告；自动化不得清理、reset、checkout 或覆盖无关修改。

基线漂移不是自动失败的“历史差异”，而是必须先重新审计的当前事实。若 audited commit 不再是祖先、关键文件消失或契约改变，Ticket 01 保持未完成，先同步修正本 change 文档。

## 3. Provider 根身份

### 3.1 Server 内部类型

```ts
type ProviderRootIdentity = {
  providerId: string;
  opaqueRootId: string;
  scopeToken: string;
  caseMode: "sensitive" | "insensitive" | "unknown";
};

type RootRelation = "same" | "ancestor" | "descendant" | "disjoint" | "unknown";

interface ProviderRootIdentityResolver {
  getRootIdentity(root: ResourceRef, context: ResourceOperationContext): Promise<ProviderRootIdentity>;
  compareRoots(a: ProviderRootIdentity, b: ProviderRootIdentity): Promise<RootRelation>;
}
```

- `opaqueRootId` 与 `scopeToken` 只存在于 Server，不进入 Renderer、LAN、Mobile DTO 或日志。
- LocalFsProvider 使用 `realpath.native`、文件系统身份和平台路径规则证明关系；不得只比较输入字符串。
- MountProvider 必须由 provider 自己实现同一 provider 内的根关系。不同 provider 只有在双方明确证明隔离时才可返回 `disjoint`。
- 任一比较结果为 `same`、`ancestor`、`descendant` 或 `unknown` 时，SourceRegistry 拒绝注册，错误码为 `SOURCE_ROOT_NOT_DISJOINT` 或 `SOURCE_ROOT_IDENTITY_UNPROVABLE`。
- 每次 commit、rebuild、restore 和 trash 前重新验证 `scopeToken`，防止 symlink、junction、mount replacement 与 TOCTOU。

### 3.2 SourceRegistry 不变量

- `main` 必须存在且不可卸载。
- 活动 sourceKey 唯一，格式 `[a-z][a-z0-9-]{0,31}`。
- 活动来源两两可证明 `disjoint`。
- 历史 key 只在用户显式重选同一 `opaqueRootId` 且 key 未占用时复用。
- 来源能力来自 provider 当前 capability，不从旧配置推断。

## 4. 内部系统目录

Server 管理的数据不得放入用户来源树内，唯一例外是产品定义的来源级 `.trash/`。

```text
<HANA_HOME>/knowledge-workspace/
├── index/v1/<workspace-fingerprint>/<source-fingerprint>/
├── operations/v1/<operation-id>/
├── source-bindings/v1.json
└── evidence/                       # 仅测试或发布过程显式写入
```

- 索引和 operation journal 永不进入资源树、搜索、watch scope 或用户备份语义。
- `.trash/` 位于来源根，由 ResourceIO/provider 和 trash service 访问；普通 list/search/index/link resolver 必须排除。
- `.trash/`、索引目录、journal 和 manifest 的访问分别使用独立 capability，不能通过普通 Renderer 路径请求直接读取。

## 5. Native Bridge

普通知识业务继续通过 HTTP/WS。Electron IPC 只负责系统选择器、系统文件剪贴板、默认应用、文件管理器定位和系统废纸篓。

### 5.1 Preload 表面

在现有 `window.hana` 中新增：

```ts
knowledgeNativeCapabilities(): Promise<KnowledgeNativeCapabilities>;
knowledgeNativeInvoke(request: KnowledgeNativeRequest): Promise<KnowledgeNativeResult>;
```

IPC channel 固定为：

```text
knowledge-native:capabilities
knowledge-native:invoke
```

不得新增接受任意绝对路径的 Knowledge 专用 IPC。

### 5.2 一次性授权

对 `openDefault`、`reveal` 和 `trash`：

1. Renderer 用 `KnowledgeResourceAddress` 请求 Server 创建 `NativeResourceGrant`。
2. grant 与 owner、window/session、action、address、resource version 绑定，60 秒过期，只可消费一次。
3. Renderer 只把 `grantId` 交给 Electron。
4. Main 使用本地 server token 消费 grant；绝对路径只在 Server 与 Main 之间出现，不返回 Renderer。
5. Main 执行系统动作并把结构化结果回传；Server 对 trash 结果继续完成 operation journal。

对 picker 和系统文件剪贴板导入：Main 获取本机路径后直接提交给本地 Server 的 desktop-only 导入入口；Renderer 只接收 plan 摘要和结果，不接收路径。

### 5.3 Capability 与错误

```ts
type KnowledgeNativeCapabilities = {
  directoryPicker: boolean;
  filePicker: boolean;
  fileClipboard: boolean;
  openDefault: boolean;
  reveal: boolean;
  systemTrash: boolean;
};
```

独立 Open Server 和非 Electron 客户端返回 `CAPABILITY_UNAVAILABLE`。不得静默回退到路径泄露、永久删除或 Renderer Node API。

## 6. 多窗口与并发

- SourceRegistry、operation journal 和 index coordinator 属于 Server 实例；Renderer 只是投影。
- 每个请求携带 owner/session/window context；授权和 native grant 不跨窗口复用。
- 每来源索引只有一个 writer；查询可并发。
- 同一资源的复合 mutation 由 coordinator 地址锁串行化；普通 expected-version write 仍由 provider 冲突控制。

## 7. 契约变更

任何实施中发现的新歧义，必须先判断是否改变设计意图：

- 不改变意图：直接同步修正 ADR/LOG/CONTEXT 与派生契约。
- 改变意图：新增或修订 ADR 与同号 LOG，再同步 Spec、架构、追踪和 ticket。
- 不允许只在代码、PR 描述或 ticket 交付记录中留下永久例外。
