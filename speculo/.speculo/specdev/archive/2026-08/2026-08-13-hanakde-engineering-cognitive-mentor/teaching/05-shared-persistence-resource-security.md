# 05 Shared、持久化、ResourceIO 与安全边界

## 读者目标与前置知识

本篇面向已经读完总览、启动流程、Core、Server 和 Hub 的读者。你应先知道 `HanaEngine` 是组合与生命周期门面，Server 是传输边界，Hub 是编排层；本篇继续追问一个更基础的问题：**当多个客户端和多个领域同时读写同一份数据时，系统凭什么知道“这是什么资源、谁能碰它、它是否还是刚才那一版”？**

读完后应能复述：

1. Shared 契约怎样把配置、身份、scope、持久化格式和启动阶段固定下来；
2. ResourceIO 怎样把不同来源统一成带 provider、version、authority proof 的资源地址；
3. SessionFile 为什么是“会话交付身份”而不是裸文件路径；
4. PathGuard、Sandbox、Permission、Exec 如何从路径级 ACL 收敛到工具执行边界；
5. 原子写、expected version、事件序列、journal 和恢复流程分别解决什么故障。

## 一句话心智模型

Shared 定义跨层都能理解的名词和不变量；ResourceIO 把这些不变量应用到资源操作；安全层在 ResourceIO 之前拒绝越权；持久化层在 ResourceIO 之后保证结果可恢复。可以把主链路记成：

```text
输入（配置 / 身份 / ResourceRef）
  → 规范化与 authority 绑定
  → provider capability + PathGuard / Permission
  → stat/read/write(expectedVersion)
  → atomic persistence + audit + ResourceEventBus
  → 客户端、Knowledge、SessionFile 或工具消费
```

## 职责与非职责

### 本域负责

- 为跨进程、跨客户端共享的数据定义稳定类型、错误码、scope 和版本字段；
- 维护 JSON、JSONL、Markdown、SQLite、目录树等持久化边界的读写与恢复约束；
- 统一本地文件、挂载、SessionFile、内部资源和 URL 的 ResourceIO 协议；
- 让路径检查、外部读取授权、会话权限和命令沙盒在同一条拒绝优先链上收敛；
- 为上层 Memory、Knowledge、Bridge、Plugin 和工具提供可审计的读写接缝。

### 本域不负责

- 不决定一次聊天应该由哪个 Agent 执行；那是 Core/Hub 的职责；
- 不实现具体的 Markdown 知识解析、记忆编译或 Provider API 协议；这些在后续 Lib 域卷；
- 不把 Server route 或 Desktop store 当作持久化真相源；它们只投影和传输本域结果；
- 不保证外部网络、操作系统或真实崩溃恢复已经成功；本篇只记录静态证据，未运行的行为标为待验证。

## 目录地图

| 层 | 主要入口 | 读者要问的问题 |
|---|---|---|
| Shared contracts | `<Path>shared/config-schema.ts</Path>`、`<Path>shared/config-scope.ts</Path>`、`<Path>shared/access-scope-profiles.ts</Path>`、`<Path>shared/errors.ts</Path>` | 哪些字段是 global、哪些是 agent；请求 principal 用什么 scope 表达？ |
| Persistence registry | `<Path>shared/persistence/store-registry-types.ts</Path>`、`<Path>shared/persistence/store-registry.ts</Path>`、`<Path>shared/persistence/startup-phases.ts</Path>` | 每个 store 谁拥有、何时能打开、怎样迁移和恢复？ |
| Safe/secret filesystem | `<Path>shared/safe-fs.ts</Path>`、`<Path>shared/secret-fs.ts</Path>`、`<Path>shared/secret-custody.ts</Path>` | 如何避免半写文件、凭证泄漏和错误信息扩散？ |
| Resource kernel | `<Path>lib/resource-io/types.ts</Path>`、`<Path>lib/resource-io/resource-io.ts</Path>`、`<Path>lib/resource-io/resource-refs.ts</Path>` | 资源地址、provider capability、version 和事件如何统一？ |
| Resource providers | `<Path>lib/resource-io/providers/local-fs-provider.ts</Path>`、`<Path>lib/resource-io/providers/mount-provider.ts</Path>`、`<Path>lib/resource-io/providers/session-file-resolver.ts</Path>`、`<Path>lib/resource-io/providers/url-provider.ts</Path>` | 不同来源怎样暴露同一组操作而不互相越权？ |
| SessionFile | `<Path>lib/session-files/session-file-registry.ts</Path>`、`<Path>lib/session-files/session-file-response.ts</Path>`、`<Path>lib/resources/resource-envelope.ts</Path>` | 交付给聊天、Bridge、媒体和插件的文件如何稳定寻址？ |
| Path/Sandbox | `<Path>lib/sandbox/policy.ts</Path>`、`<Path>lib/sandbox/path-guard.ts</Path>`、`<Path>lib/resource-io/resource-access-policy.ts</Path>` | 读取、写入、删除分别需要什么级别？符号链接和外部授权如何处理？ |
| Permission/Exec | `<Path>core/session-permission-mode.ts</Path>`、`<Path>lib/permission/tool-invocation-permission.ts</Path>`、`<Path>lib/exec-command/tool.ts</Path>`、`<Path>lib/exec-command/policy.ts</Path>` | 工具的副作用如何被分类、审查、限制和记录？ |

## 1. Shared contracts：先固定名词，再允许实现变化

### 配置 scope 是所有权声明

`CONFIG_SCHEMA` 在 `<Path>shared/config-schema.ts</Path>` 中把配置字段分成 `global` 与 `agent`。例如 locale、sandbox、channels、bridge 和 automation 的总开关属于 global；未声明字段默认落在 agent scope。`splitByScope()` 在 `<Path>shared/config-scope.ts</Path>` 把前端 patch 拆成两条写入路径，`injectGlobalFields()` 再把 Engine 的 global getter 投影回 agent 配置。

这不是单纯的序列化便利，而是业务因果：

```text
用户修改配置
  → schema 判断所有权
  → global setter 或 agent config 写入
  → 后续请求只从 owner 读取
```

如果把 `sandbox` 误写到某个 agent 的 YAML，另一个 Agent 可能采用不同安全策略；如果把 `user.name` 当 agent 字段，不同会话就会对同一个人产生不同身份。因此 scope 表本身是数据一致性约束。

### Principal 与 scope 是请求身份，不是 UI 标签

`normalizePrincipal()` 在 `<Path>core/security-principal.ts</Path>` 规范化 `kind`、`principalId`、`userId`、`studioId`、`serverNodeId`、`credentialKind`、`trustState` 和 `scopes`。`principalHasScope()` 对局部连接有兼容放行，对远程/设备/插件/Bridge 请求则按精确 scope、namespace 或 wildcard 检查。

Shared 的 `<Path>shared/access-scope-profiles.ts</Path>` 再把 mobile 与 desktop 远程连接映射到不同 scope 集合：desktop 可管理 providers、secrets、bridge，mobile 默认只有 chat 与资源读写。这里的 Why 是把“请求来自哪里”与“请求能做什么”分离：连接类型、凭证类型和权限 scope 各自可审计，不能由客户端自报一个 `isOwner` 布尔值替代。

### 持久化注册表把隐含文件变成显式合同

`StoreDescriptor`（`<Path>shared/persistence/store-registry-types.ts</Path>`）记录：

- owner module、路径模式、文件/目录形态和 persistence format；
- schema source/contract、open/migration entry；
- 最早允许打开与写入的 `StartupPhase`；
- epoch policy、checkpoint policy、restore policy；
- identity contract、site rules 和 bootstrap safety。

`STARTUP_PHASES`（`<Path>shared/persistence/startup-phases.ts</Path>`）把启动分为 `home_guard`、epoch 预读、transport bind、identity seed、engine construct、runtime ready 等阶段。这样做的核心因果是：**先确认 HANA_HOME 与数据 epoch，再打开依赖身份的 store，最后才接收外部请求**。持久化注册表不是运行时数据库本身，而是静态治理和启动顺序的单一索引。

### Safe FS 与 Secret FS 的分工

`atomicWriteSync()` 在 `<Path>shared/safe-fs.ts</Path>` 用 `.tmp` + rename，避免进程在写 JSON、Markdown 或状态文件中途崩溃而留下半份内容；`safeReadFile()`、`safeReadJSON()` 将可选文件缺失与解析错误区分，并把后者送到 ErrorBus。

凭证不能只依赖调用者记得传 mode，因此 `<Path>shared/secret-fs.ts</Path>` 提供没有 mode 参数的 `writeSecretFileSync()`，Unix 使用 `0600` 文件、`0700` 目录，并在临时文件和 rename 前后重复收紧；Windows 则承认 chmod 不表达 NTFS ACL，依赖用户目录的继承权限。`<Path>shared/secret-custody.ts</Path>` 只按精确 key mask、合并 masked patch，并可收集 secret patch paths。其边界很重要：这是“防其他系统账户或意外共享”的文件权限层，不是防同一用户进程的加密层。

## 2. 主链路：ResourceIO、SessionFile 与安全边界

### ResourceRef 不是路径字符串

`ResourceRef` 在 `<Path>lib/resource-io/types.ts</Path>` 中有五种形态：`local-file`、`mount`、`session-file`、`resource`、`url`。`normalizeResourceRef()` 和 `resourceKeyForRef()` 在 `<Path>lib/resource-io/resource-refs.ts</Path>` 负责规范斜杠、字段和 provider 映射；内部引用还可以携带不可序列化的 `RESOURCE_SCOPE_ROOT` 与 `RESOURCE_READ_PROOF` symbol。

这解决了一个常见错误：把主机绝对路径当成永恒身份。路径可能被 rename、挂载根可能变化、SessionFile 可能过期；ResourceRef 把“寻址方式”与“显示路径”分开，provider 才有机会验证当前根身份。

### Provider capability 是结构化的可用性检查

`ResourceProvider` 声明 `stat/read/openRead/write/writeExpectedVersion/edit/list/search/watch/materialize/copy/rename/move/trash` 等能力。`ResourceIO.callProvider()`（`<Path>lib/resource-io/resource-io.ts</Path>`）按 ref 找 provider，先检查 capability，再调用实现；缺失 provider 或 capability 返回 typed error，而不是让调用者碰内部对象。

常见 provider 的职责不同：

- `<Path>lib/resource-io/providers/local-fs-provider.ts</Path>` 处理本地文件身份、realpath、版本和原子写；
- `<Path>lib/resource-io/providers/mount-provider.ts</Path>` 把 studio mount 映射成受控根；
- `<Path>lib/resource-io/providers/session-file-resolver.ts</Path>` 只允许 SessionFile 读/stat/materialize，明确禁止 write、rename、delete；
- `<Path>lib/resource-io/providers/url-provider.ts</Path>` 把网络资源限制在 URL provider 的能力和请求策略内；
- `<Path>lib/resource-io/providers/resource-provider.ts</Path>` 承担内部 `resourceId` 到真实条目的解析。

因此跨 provider `copy`、`move` 默认被拒绝；不是所有“看起来像文件”的对象都能安全互换。

### Version 与 read proof 防止 TOCTOU

`ResourceVersion` 可包含 `mtimeMs`、`size`、`sha256`、`etag`、`sequence`。典型安全读链是：

```text
stat(ref, auditRead)
  → provider 返回 version + 私有 RESOURCE_READ_PROOF
  → openRead(ref, { expectedVersion, proof })
  → provider 再验证
  → 返回可流式 body
```

`writeExpectedVersion()` 返回成功 mutation 或 `{ conflict: true }`，不会静默覆盖另一客户端的新版本。Knowledge 的安全索引读取也采用同样模式：stat 后 openRead 带 expected version，大小或 version token 不一致就抛 `SafeTextIndexVersionConflictError`。

### Mutation、审计与事件是一个事务边界的三个投影

`ResourceIO.write/edit/mkdir/copy/rename/trash` 在 provider 成功后调用 audit，并通过 `<Path>lib/resource-io/resource-event-bus.ts</Path>` 发出 `resource.changed`、`resource.deleted` 或 `resource.renamed`。事件带 `sequence`、`occurredAt`、`source`、`sessionPath` 和可选 `operationId`。

事件总线支持 catch-up：消费者带上次 sequence 请求增量；若内存窗口已经过期，返回 `stale: true`，客户端必须重新拉取状态。这个设计把“实时通知”与“最终一致性恢复”分开，避免 WebSocket 丢包后 UI 永久陈旧。

### Transfer 是可恢复的跨 provider 事务

`ResourceIO.transfer()` 在 `<Path>lib/resource-io/resource-io.ts</Path>` 先导出受预算和 abort signal 保护的 entries，再让目标 provider 原子 import；`operationId`、expected target version、source scope revalidation 和 `recoverTransferPublication()` 用来处理进程在发布边界崩溃的情况。读者应把它理解为小型两阶段协议，而不是普通 `copyFile`。

## 3. SessionFile：会话内文件的稳定交付身份

### 为什么不直接暴露绝对路径

聊天附件、截图、Bridge 入站媒体、模型生成结果都需要在多个请求和客户端间复用。直接给路径会泄露主机布局、绕过 session ownership，也无法表达过期和 fork。`SessionFileRegistry` 在 `<Path>lib/session-files/session-file-registry.ts</Path>` 用 `sessionPath`/`sessionId` 作为 owner，登记 `id`、`filePath`、`realPath`、mime、kind、size、mtime、storageKind、origin、operations、status，并把索引写入与 session 同级的运行时 sidecar（项目代码中由 `sessionPath + ".files.json"` 定位）。本 change 只记录源码证据，不把运行时 sidecar 当作教学工件。

这里的运行时 sidecar 路径是代码行为说明，不是本 change 的写入目标；教学工件本身只引用源码。

### 注册、解析、序列化三步

```text
文件生成/接收
  → SessionFileRegistry.registerFile()
  → session-scoped fileId + sidecar
  → serializeSessionFile()
  → resource envelope / chat block / Bridge media
```

`<Path>lib/session-files/session-file-response.ts</Path>` 只投影安全元数据；`<Path>lib/resources/resource-envelope.ts</Path>` 将稳定 `sf_...` fileId 映射为 `res_...` resourceId，并带 `studioId`、lifecycle、storage 和 content link。`SessionFileResolverProvider` 对这些引用只开放 stat/read/materialize，过期或不存在会变成明确错误。

### Fork 与清理是身份语义的一部分

Session fork 不能复用父会话的 fileId，因为同一文件在两个会话中的可见性和生命周期不同。Registry 的 `forkSessionFiles()` 为子会话重建 id、sidecar 和 managed cache；`get()`、`getByFilePath()`、`getBySourceKey()` 都先按 session scope 过滤。冷会话清理只删除 registry 允许的非活跃缓存，不能让一个会话的路径猜测读取另一个会话。

## 4. PathGuard、Sandbox、Permission、Exec：从文件 ACL 到工具副作用

### PathGuard 只回答“这条路径最低是什么级别”

`<Path>lib/sandbox/policy.ts</Path>` 是 ACL 单一来源：blocked files/dirs、agent read-only files、agent read-write dirs、home read/write dirs、workspace roots 和 protected paths 都在这里声明。`deriveSandboxPolicy()` 输出标准模式 `read-all/write-scoped/network-on`；`<Path>lib/sandbox/path-guard.ts</Path>` 先 realpath（不存在的目标向上解析最近存在祖先），再返回 `BLOCKED`、`READ_ONLY`、`READ_WRITE` 或 `FULL`。

访问级别与操作要求是不同维度：read 接受 read-only 以上，write 需要 read-write，delete/stage 需要 full。符号链接先解析再匹配，避免“把链接放进 workspace”绕过敏感目录。

### ResourceAccessPolicy 把动态授权接上 PathGuard

`<Path>lib/resource-io/resource-access-policy.ts</Path>` 在调用 PathGuard 前先拒绝 NUL、protected metadata 和 managed config；sandbox 关闭时允许正常路径，sandbox 开启时才使用 PathGuard。对于 read，可以额外检查 `getExternalReadPaths()` 的显式授权；write/delete 没有同等宽松出口。最终返回 `path_outside_authorized_roots`、`protected_metadata`、`managed_config_denied`、`invalid_resource_path` 或 `sandbox_denied` 等安全错误，不向上泄露真实系统路径。

### Permission mode 是会话语义，不等于文件 ACL

`<Path>core/session-permission-mode.ts</Path>` 定义 `auto`、`operate`、`ask`、`read_only`，并把信息工具（read、grep、search_memory）与副作用工具（write、edit、bash、automation、dm、channel 等）分组。Bridge 和 automation 还有各自的归一化模式；subagent 的长期记忆和对外副作用在独立拦截层阻断，即使父会话是 operate 也不能扩大边界。

`<Path>lib/permission/tool-invocation-permission.ts</Path>` 进一步要求工具声明受限 descriptor：action、kind、capability、target 和 sideEffect。它会复制并冻结输入、拒绝 accessor、原型污染、循环对象和 host identity 字段，保证审查看到的参数就是实际执行的参数。

### Exec 是“可执行副作用”而不是普通文件写

`<Path>lib/exec-command/policy.ts</Path>` 将命令分为 safe、probe、mutation、dangerous、unknown；会识别 Git、PowerShell、Windows heredoc、危险命令和环境探测。`<Path>lib/exec-command/tool.ts</Path>` 把 `sandbox_permissions` 规范化为默认隔离或显式 `require_escalated`，后者必须带 justification；`<Path>lib/exec-command/runner.ts</Path>` 还限制输出大小、尾部行数、编码和超时，并把完整输出落到临时文件而不是把巨大日志塞进模型上下文。

OS 级实现位于 `<Path>lib/sandbox/seatbelt.ts</Path>`、`<Path>lib/sandbox/bwrap.ts</Path>`、`<Path>lib/sandbox/win32-exec.ts</Path>` 和 `<Path>lib/sandbox/win32-sandbox-helper.ts</Path>`。PathGuard 是前置契约，OS sandbox 是第二道执行约束；两者不能互相替代。

## 5. 状态、错误、并发与恢复

| 场景 | 状态/不变量 | 失败形态 | 恢复策略 |
|---|---|---|---|
| 可选配置缺失 | 读取者有默认值 | `ENOENT` | `safeRead*` 返回 fallback，不当作损坏 |
| JSON/secret 写入 | 临时文件完整后 rename | 解析错误、rename 失败 | 保留旧目标；下次由 `.tmp`/启动修复路径判断 |
| Resource 读写 | version/proof 与资源绑定 | provider unavailable、capability denied、version conflict | 重新 stat；冲突交给调用者合并，不覆盖 |
| Event catch-up | sequence 单调 | 窗口过期 `stale` | 重新 list/stat/search，建立新基线 |
| SessionFile | session-scoped id + sidecar | missing/expired/identity mismatch | 返回安全错误；不能退化为裸路径读取 |
| Knowledge/批量 transfer | operationId + journal/atomic publication | abort、崩溃、source scope 变化 | recovery API 检查 intent/outcome，再决定 commit/rollback |
| Exec | permission descriptor + sandbox + output budget | denied、timeout、non-zero、unsupported syntax | 返回结构化 exec details；升级权限必须显式新请求 |

并发有三种不同工具，不要混为一种 lock：Resource version 是跨进程乐观并发；Channel/Cron 等文件 store 还需要进程内文件锁或 reentrant write 检查；Knowledge/Transfer 的 journal 则处理跨步骤崩溃恢复。

## 6. Why、代价、边界与替代设计

### Why 选择多层接缝

如果只用一个 `fs.readFile(path)` helper，它无法同时表达 URL、mount、SessionFile、权限、版本、审计和事件；如果每个域各自实现，Desktop、CLI、Bridge 和 Plugin 会产生不同的安全语义。ResourceIO 把 provider 差异隔离，Shared 把身份和持久化合同固定，PathGuard/Permission 把“能不能做”分层表达。

### 代价

- 调用链变长：读一个文件要经过 ref normalization、provider capability、policy、version 和 audit；
- 错误类型增多：调用者必须处理 conflict、stale、expired、denied，而不是只 catch 一个字符串；
- identity 与 display path 分离后，调试需要同时看 resourceKey、sessionId、studioId 和 root identity；
- `safeRead*` 的 fallback 便利了启动，但可能掩盖数据损坏，必须结合 ErrorBus 和 persistence registry 判断。

### 替代与反转条件

| 方案 | 何时适用 | 当前不选的原因 | 反转条件 |
|---|---|---|---|
| 各域直接访问文件系统 | 单进程、单用户、无远程/插件 | 无法统一权限、版本和事件 | 系统缩减为单一可信本地脚本 |
| 全部使用数据库 | 强事务、查询优先 | Session/Knowledge/用户 workspace 仍需要文件可见性和外部编辑 | 所有资源都由同一数据库 owner 管理 |
| 仅靠 OS sandbox | 只有命令执行 | 无法表达 session scope、expected version、远程 principal | 不再支持远程/插件/Bridge 资源 |
| ResourceIO + Shared contracts（当前） | 多客户端、多 provider、需要恢复 | 复杂度较高 | 复杂度收益低于维护成本时再收敛 |

## 7. 事实、推断、假设与待验证

| ID | 类型 | 陈述 | 证据/推导 | 状态 |
|---|---|---|---|---|
| F-05-01 | 事实 | `ResourceIO` 通过 provider capability 分派 stat/read/write/edit/list/search/materialize/transfer 等操作，并统一 audit/event。 | `<Path>lib/resource-io/resource-io.ts</Path>`、`<Path>lib/resource-io/types.ts</Path>` | 已确认（静态） |
| F-05-02 | 事实 | `SessionFileResolverProvider` 只开放读取和 materialize，写入能力显式为 false。 | `<Path>lib/resource-io/providers/session-file-resolver.ts</Path>` | 已确认（静态） |
| F-05-03 | 事实 | `PathGuard` realpath 后按 blocked/read-only/read-write/full 匹配；`ResourceAccessPolicy` 先检查 protected metadata 与 managed config。 | `<Path>lib/sandbox/path-guard.ts</Path>`、`<Path>lib/resource-io/resource-access-policy.ts</Path>` | 已确认（静态） |
| F-05-04 | 事实 | secret 写入由 `writeSecretFileSync` 固定 owner-only 模式，masked patch 按精确 secret key 处理。 | `<Path>shared/secret-fs.ts</Path>`、`<Path>shared/secret-custody.ts</Path>` | 已确认（静态） |
| I-05-01 | 推断 | ResourceIO 是跨客户端资源 authority，而不是单纯文件工具。 | 由 ResourceRef、provider、version、audit/event 和 route 投影结构推导 | 高可信，仍未运行验证 |
| I-05-02 | 推断 | SessionFile 的主要价值是稳定的会话可见性和生命周期，而非隐藏所有本地路径。 | Registry 的 session scope、sidecar、fork、expiry 结构推导 | 高可信 |
| A-05-01 | 假设 | 本篇以当前静态源码和 lead 报告为准，不假设 packaged OS sandbox 在所有平台一致。 | Work 约束 | 明确保留 |
| V-05-01 | 待验证 | 多进程同时写同一资源、provider root identity 变化和真实 transfer recovery 的时序仍需运行或专门诊断。 | 仅看到代码合同，未执行测试 | 不阻塞教学 |

## 8. 测试索引：用测试验证心智模型

以下是建议的静态阅读入口，不代表本 Work 已执行：

- Shared/持久化：`<Path>tests/persistence-store-registry.test.ts</Path>`、`<Path>tests/persistence-startup-receipt.test.ts</Path>`、`<Path>tests/persistence-schema-tripwire.test.ts</Path>`、`<Path>tests/secret-fs.test.ts</Path>`、`<Path>tests/secret-custody.test.ts</Path>`；
- ResourceIO：`<Path>tests/resource-io.test.ts</Path>`、`<Path>tests/resource-io-provider-contract.test.ts</Path>`、`<Path>tests/resource-io-authority-boundary.test.ts</Path>`、`<Path>tests/resource-io-local-fs-provider.test.ts</Path>`、`<Path>tests/resource-io-session-file-resolver.test.ts</Path>`、`<Path>tests/resource-io-transfer.test.ts</Path>`、`<Path>tests/resource-event-bus.test.ts</Path>`；
- 安全与 Exec：`<Path>tests/sandbox-policy.test.ts</Path>`、`<Path>tests/sandbox-tool-wrapper.test.ts</Path>`、`<Path>tests/permission-catalog-tools.test.ts</Path>`、`<Path>tests/tool-invocation-permission.test.ts</Path>`、`<Path>tests/exec-command-policy.test.ts</Path>`、`<Path>tests/exec-command-tool.test.ts</Path>`、`<Path>tests/seatbelt-sandbox-policy.test.ts</Path>`、`<Path>tests/win32-sandbox-policy.test.ts</Path>`；
- SessionFile/Envelope：`<Path>tests/resource-envelope.test.ts</Path>`、`<Path>tests/bridge-inbound-files.test.ts</Path>`、`<Path>tests/engine-build-tools-session-files.test.ts</Path>`、`<Path>tests/session-manifest-coordinator.test.ts</Path>`。

阅读一个成功用例后，务必再读一个 conflict、expired、authority denied、crash recovery 或 platform-specific 用例；只有 happy path 不能证明本域的安全不变量。

## 下一篇

继续阅读 `<Path>{roots.state}/specdev/changes/{change}/teaching/06-lib-domain-capabilities.md</Path>`。下一篇会展示这些 shared/resource/security 接缝怎样承载 Memory、Knowledge Workspace、Provider/Pi SDK、Bridge、Channels、Desk、Loop 和 Automation；读者应特别关注“哪个域拥有状态，哪个域只负责调度”。
