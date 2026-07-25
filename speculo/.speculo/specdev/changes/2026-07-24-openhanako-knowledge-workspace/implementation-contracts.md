# 知识工作区实施契约

本文件冻结会直接影响代码结构、数据安全和跨平台行为的实施级契约。它编码 accepted `LOG.md`、`ADR.md`、`CONTEXT.md` 与 `spec.md` 的现行要求，不得缩减其中任何已确认结论。它与 `architecture.md`、`index-store-contract.md`、`operation-journal-contract.md` 和 `test-strategy.md` 共同构成可编码边界。

## 1. 契约优先级

1. 架构与词义：`ADR.md`、`CONTEXT.md`。
2. 产品验收：`spec.md`。
3. 实施契约：本文件、`architecture.md`、`index-store-contract.md`、`operation-journal-contract.md`、`test-strategy.md`。
4. 工程纪律与执行：`rules.md`、`requirements-traceability.md`、`ticket/`。

实施契约只能把上位决定变成唯一可编码方案，不得重新定义产品语义。

## 2. 实现前仓库 Preflight

实现必须从**仓库根**按 [`implementation-baseline.md`](./implementation-baseline.md) 与 [`README.md`](./README.md) 文档核对清单完成 preflight（本包无独立校验脚本）。

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
  identityNamespace: string;
  opaqueRootId: string;
  scopeToken: string;
  caseMode: "sensitive" | "insensitive" | "unknown";
};

type RootRelation = "same" | "ancestor" | "descendant" | "disjoint" | "unknown";

interface ProviderRootIdentityResolver {
  getRootIdentity(root: ResourceRef, context: ResourceOperationContext): Promise<ProviderRootIdentity>;
}

interface ProviderRootIdentityBroker {
  compareRoots(a: ProviderRootIdentity, b: ProviderRootIdentity): Promise<RootRelation>;
}
```

- `opaqueRootId` 与 `scopeToken` 只存在于 Server，不进入 Renderer、LAN、Mobile DTO 或日志。
- `identityNamespace` 表示可比较的物理/虚拟根身份域，不等于 providerId。LocalFsProvider 与本地 backing 的 MountProvider 都必须解析为同一个 `local_fs` namespace，并用 `realpath.native`、文件系统身份和平台路径规则比较；不得只比较输入字符串。
- broker 对相同 identityNamespace 调用该 namespace 的唯一比较器。不同 namespace 只有在 composition 中注册了双向、静态的 `intrinsicallyDisjoint` provider-pair 证明时才返回 `disjoint`；否则返回 `unknown`。不得根据“providerId 不同”推断隔离。
- 任一比较结果为 `same`、`ancestor`、`descendant` 或 `unknown` 时，SourceRegistry 拒绝注册，错误码为 `source_root_not_disjoint` 或 `source_root_identity_unprovable`。
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

## 5. ResourceIO transfer 与公共身份边界

### 5.1 公共身份

- 所有新增 Knowledge route 与本 change 修改的 `/api/resource-io/*` route 只从认证后的 Hono context 构造 `ResourceOperationContext`。
- 外部 body 若出现 `principal`、`userId`、`studioId`、`owner`、`scopeToken`、`resolvedPath` 或等价身份/路径字段，schema 必须拒绝；不得用客户端字段覆盖 context。
- 普通 loopback compatibility response 可以保持当前明确需要的本地字段；LAN/Mobile 与 Knowledge DTO 必须剔除 `filePath`、`resolvedPath`、root identity、scope token 和 native credential。

### 5.2 Provider-neutral transfer

现有 `ResourceIO.copy` 的 same-kind 限制保留兼容；Knowledge copy/import 使用新增的：

```ts
interface ResourceTransferRequest {
  source: ResourceRef;
  targetDirectory: ResourceRef;
  targetName: string;
  expectedTargetVersion?: string | null;
  signal?: AbortSignal;
  operationId: string;
}

interface ResourceTransferResult {
  target: ResourceRef;
  version: string;
  bytesTransferred: number;
}

class ResourceIO {
  transfer(
    request: ResourceTransferRequest,
    context: ResourceOperationContext,
  ): Promise<ResourceTransferResult>;
}
```

- Provider SPI 固定为 `exportTree(ref, options): AsyncIterable<ResourceExportEntry>` 与 `importTreeAtomically(targetDirectory, targetName, entries, options)`。entry path 是相对 source root item 的已验证名称段数组，kind 为 `directory | file | symbolic_link`；file entry 必须在 body 前提供非负 `sizeBytes` 与 version，body 是一次性 `AsyncIterable<Uint8Array>`；symbolic link 只携带未解引用的 link target。SPI 仅在 Server/lib 内部，不序列化到 HTTP。
- 同 provider 且 provider 证明可安全 copy 时可走快速路径。
- 跨 provider 使用上述 export/import 与 backpressure；chunk 最大 1 MiB、并发 file stream 最大 4、进程内 transfer buffer 总量最大 8 MiB。不得要求 Renderer 提供路径，也不得把任意大小文件整体放入内存。
- 文件写入目标同级 staging，完成、fsync/close 与 scope 复验后原子 rename。symbolic link 从不跟随；目标 provider 不支持创建同等 link entry 时该顶层资源失败，不退化为复制 target 内容。
- 目录完整 staged 后一次发布；失败清理 staging，正式目标不得出现半棵树。
- 原始 server-local path import/materialize 是内部 adapter 能力，不加入公共 Renderer API。
- progress、cancel、部分完成结果以 operationId 关联；批次原子性是资源级，单个目录原子性是整棵目录。
- V1 每个顶层 transfer/import 计划硬上限为 100,000 entries、128 层、100 GiB 已知 aggregate size；遍历中 size 未知、特殊 device/socket/FIFO 或超过任一上限时在副作用前拒绝该顶层资源。上限不提供单次绕过开关。

## 6. Native Bridge

普通知识业务继续通过 HTTP/WS。Electron IPC 只负责系统选择器、系统文件剪贴板、默认应用、文件管理器定位和系统废纸篓。

### 6.1 Preload 表面

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

### 6.2 Main-only 凭据与一次性授权

当 `HANA_SERVER_OWNER=desktop` 时，Server 每次启动以 `crypto.randomBytes(32).toString("base64url")` 生成 `nativeBridgeToken`，作为同名字段写入现有 owner-only `0o600` `<HANA_HOME>/server-info.json`；standalone owner 不生成该字段。Electron Main 随现有 readiness polling 读取并只保存在 Main 内存，重启/复用 Server 时重新读取当前值。它绝不进入 `get-server-token`、`server-restarted` payload、`window.hana`、preload、Renderer、公共 DTO、诊断或日志。Main-only route 必须同时验证：

1. transport 为 loopback；
2. Hono context 是本地已认证 principal；
3. `X-Hana-Native-Bridge` 与当前 token 常量时间相等。

普通 Renderer 已知的 server token 不能替代以上第三项，也不再引入无法可靠证明的“desktop process identity”或额外 nonce。

对 `openDefault`、`reveal` 和 `trash`：

1. Renderer 用 `KnowledgeResourceAddress` 请求 Server 创建 `NativeResourceGrant`。
2. grant 与 owner、window/session、action、address、resource version 绑定，60 秒过期，只可消费一次。
3. Renderer 只把 `grantId` 交给 Electron。
4. Main 使用 `nativeBridgeToken` 消费 grant；绝对路径只在 Server 与 Main 之间出现，不返回 Renderer。
5. Main 执行系统动作并把结构化结果回传；Server 对 trash 结果继续完成 operation journal。

对 picker 和系统文件剪贴板导入：Main 获取本机路径后直接提交给本地 Server 的 desktop-only 导入入口；Renderer 只接收 plan 摘要和结果，不接收路径。

### 6.3 Capability 与错误

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

独立 Open Server 和非 Electron 客户端对原生动作返回 `knowledge_native_capability_unavailable`；核心 import service 仍可接受调用者已经获权的 ResourceRef/ResourceIO 来源，不依赖 Electron 内存，也不新增未定义的浏览器本机目录上传协议。不得静默回退到路径泄露、永久删除或 Renderer Node API。

## 7. 地址与链接解析

- `KnowledgeResourceAddress.relativePath` 与 Wikilink 持久地址都是 Source 根相对 canonical path：协议分隔符为 `/`，至少一个非空段，无开头/结尾 `/`、`.`/`..` 段、NUL/控制字符、盘符或 UNC；保留真实 Unicode 序列、大小写和扩展名。字面 `\` 只能是 provider 已验证的段内字符，不能作为分隔符。
- Wikilink 先按共享词法拆出 address/fragment/display，再反转义 `\`、`#`、`|`、`[`、`]` 等结构字符；address 不做 URL percent-decode，反转义后必须已经满足 canonical path。`sourceKey:`、绝对路径和无法证明同 Source 的目标返回 broken/out-of-scope，不做搜索回退。
- 标准 Markdown destination 先由 CommonMark parser 处理 Markdown 转义，再由 LinkResolver 分类。`http:`/`https:` 是显式外链；其他 scheme、`//host`、以 `/` 或 `\` 开头、盘符、UNC、query string 和无效 percent escape 均不得作为内部文件链接。
- Markdown 内部文件 path 按 `/` 分段并只 percent-decode 一次 UTF-8；编码后的 `/`、`\`、NUL 或控制字符被拒绝。原始 `.`/`..` 段允许参与页面目录相对解析，但 lexical normalize 后必须仍在包含页面的 Source 内，得到的 canonical result 不含 dot segment。空 path 加 fragment 指向当前页面。
- 同源重构生成 Wikilink 时写 Source 根相对 canonical path；生成标准 Markdown 文件链接时使用 `path.posix.relative(dirname(page), target)` 的结果（同目录不加 `./`），逐个真实名称段按 RFC 3986 percent-encode，并保留原 fragment。解析或重写不得依赖进程 cwd、平台路径分隔符或全局搜索。

## 8. Frontmatter 保真投影

- 继续复用仓库现有 `js-yaml` 做 YAML 语义校验，不增加第二个 YAML parser，也不得用 `dump`/全量序列化覆盖用户原文。
- 可视属性投影只接受可选 UTF-8 BOM 后第一个解码字符开始、由 `---` 包围的单一 Frontmatter 文档中的唯一顶层字符串键；可编辑值固定为 JSON 标量（string、finite number、boolean、null）或一维 JSON 标量数组。`title`、`aliases` 没有特殊产品语义；`tags` 仍按同一值边界进入来源内标签提取。
- 出现 YAML directive、多文档、重复键、merge key、custom tag、anchor/alias、嵌套 map/sequence、block scalar、无效 YAML，或无法确定安全源码范围时，整个 Frontmatter 属性区进入源码模式；不得只投影“看起来安全”的子集。
- 在可投影文档中，新增、修改或删除字段只能 patch 对应源码范围；该编辑 transaction 不改变未触及的源码、字段顺序、独立注释、现有行尾序列和 Frontmatter 之外正文。删除字段不连带删除相邻独立注释；最终磁盘保存仍统一服从 `LOG-0065`，因此混合换行只可发生该既定的整文档规范化。
- 每次可视编辑形成一个 CM6 transaction，并立即重新校验投影资格；解析失败保留当前真实缓冲区并切回源码模式，不生成修复版 YAML。

## 9. 标签与页面任务词法

- Frontmatter `tags` 只从一个 string 或一维 string array 提取；每个值执行 Unicode NFC 和首尾空白去除，空值或含控制字符的值忽略，不按空格或逗号二次拆分。展示保留大小写；同一页面以 NFC 后的精确值去重，不跨 Source 合并。
- 正文标签固定为共享 Markdown syntax tree 中、代码/链接目标/autolink/URL 之外且未转义的 `#tag`。`#` 前必须是文档起点，或不是 Unicode letter/mark/number、`_`、`/`、`\`、`#` 的字符；tag 由一个或多个 Unicode letter/mark/number、`_`、`-`、`/` 组成且至少含一个 letter、mark 或 `_`。Markdown heading marker、纯数字、空标签和 `#<...>` 不作为 V1 标签。
- 正文标签去掉 `#` 后执行同样的 NFC、保留大小写和页面内精确去重；Frontmatter/body 同值在页面聚合展示中只显示一次，但索引 `origin` 仍分别记录。
- Page Task 只识别共享 Markdown parser 判定为 GFM task list item 起始标记的 `[ ]`、`[x]`、`[X]`。切换只把该三字符范围写为 `[ ]` 或 `[x]`，形成一个 CM6 transaction；不把普通段落、代码或引用文本中的同形字符当作 task。

## 10. 多 Renderer context 与并发

- SourceRegistry、operation journal 和 index coordinator 属于 Server 实例；Renderer 只是投影。
- 每个请求携带 owner/session/window context；授权和 native grant 不跨窗口复用。
- 每来源索引只有一个 writer；查询可并发。
- 同一资源的复合 mutation 由 coordinator 地址锁串行化；普通 expected-version write 仍由 provider 冲突控制。
- 这些约束用于现有桌面生命周期、异常恢复和自动化隔离，不新增独立浮动知识窗口、标签脱离窗口或“新建知识窗口”产品入口。

## 11. 错误码

本 change 新增错误码统一为 lowercase snake_case。至少冻结：

```text
knowledge_resource_not_found
knowledge_resource_conflict
knowledge_version_conflict
knowledge_resource_out_of_scope
knowledge_operation_plan_expired
knowledge_operation_precondition_failed
knowledge_link_rewrite_failed
knowledge_index_unavailable
knowledge_transfer_limit_exceeded
knowledge_transfer_entry_unsupported
knowledge_trash_entry_not_found
knowledge_trash_parent_blocked
knowledge_native_capability_unavailable
source_root_not_disjoint
source_root_identity_unprovable
operation_id_reused
source_recovery_in_progress
```

共享 schema 为每个错误固定 HTTP status、`retryable` 和可选安全 details；message 只用于展示，不作为控制流。

## 12. 契约变更

任何实施中发现的新歧义，必须先判断是否改变设计意图：

- 不改变意图：直接同步修正受影响的 CONTEXT/spec/契约/追踪。
- 改变难以逆转的架构意图：新增或修订 ADR，并同步 spec、LOG、架构、追踪和 ticket。
- 不允许只在代码、PR 描述或 ticket 交付记录中留下永久例外。
