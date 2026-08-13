# 06 Lib 领域能力：Memory、Knowledge、Provider、Bridge、Channels、Desk 与 Loop

## 读者目标与前置知识

本篇建立在 `<Path>{roots.state}/specdev/changes/{change}/teaching/05-shared-persistence-resource-security.md</Path>` 之上。读者已经知道 ResourceRef、expected version、PathGuard、session permission 和原子持久化；现在把这些基础接到真正的领域能力上。

目标不是逐文件翻译，而是回答：

- Memory 为什么采用“摘要传送带 + 可恢复 ticker + Dream revision”，而不是每轮都把全部历史交给模型；
- Knowledge Workspace 如何把外部文件变成带 generation、lease、journal 的可查询索引；
- ProviderRegistry 与 Pi SDK facade 如何隔离第三方 SDK 变化、凭证和模型 allowlist；
- Bridge、Channels、Desk、Loop 如何把外部消息和后台自动化接入同一个 Engine/Hub，而不互相篡改真相源。

## 职责与非职责

### 本域负责

- 在 `lib/` 中实现可复用的领域机制、store、adapter、scheduler 和恢复逻辑；
- 通过 Shared、ResourceIO、Permission 和 Core 的公开接口读写状态；
- 把模型调用、外部平台能力和后台触发包装成可测试的业务协议；
- 记录每个领域的状态 owner、并发策略、失败状态和恢复入口。

### 本域不负责

- 不拥有 Server route、WebSocket 或 Electron UI 的最终投影；
- 不替代 `HanaEngine` 的组装、SessionCoordinator 的会话生命周期或 Hub 的全局路由；
- 不把 Provider、Bridge 或 Automation 当成可绕过权限的“后门”；
- 不声称静态源码已经证明外部 API、真实网络、模型质量或跨平台定时行为。

## 目录地图

| 能力 | 关键路径 | 核心问题 |
|---|---|---|
| Memory | `<Path>lib/memory/compile.ts</Path>`、`<Path>lib/memory/memory-ticker.ts</Path>`、`<Path>lib/memory/dream/</Path>` | 摘要如何增量编译、恢复和可逆编辑？ |
| Knowledge Workspace | `<Path>lib/knowledge-workspace/</Path>`、`<Path>core/knowledge-workspace/</Path>` | 文件变化如何成为 generation，查询如何避免读半成品？ |
| Provider/Pi SDK | `<Path>core/provider-registry.ts</Path>`、`<Path>core/provider-catalog.ts</Path>`、`<Path>lib/providers/</Path>`、`<Path>lib/pi-sdk/index.ts</Path>` | provider 声明、用户配置、凭证和 SDK 版本如何隔离？ |
| Bridge | `<Path>lib/bridge/bridge-manager.ts</Path>`、`<Path>lib/bridge/session-key.ts</Path>`、`<Path>lib/bridge/bridge-context.ts</Path>` | Telegram/飞书/QQ/微信等平台如何映射成稳定 session identity？ |
| Channels | `<Path>lib/channels/channel-store.ts</Path>`、`<Path>lib/channels/channel-ticker.ts</Path>` | Markdown 消息流如何锁定、书签化和触发 Agent？ |
| Desk/Automation | `<Path>lib/desk/desk-manager.ts</Path>`、`<Path>lib/desk/cron-store.ts</Path>`、`<Path>lib/desk/cron-scheduler.ts</Path>`、`<Path>lib/desk/automation-execution-context.ts</Path>` | “何时执行”和“以谁的权限执行”如何分离？ |
| Loop | `<Path>lib/loop/loop-controller.ts</Path>`、`<Path>lib/loop/loop-store.ts</Path>`、`<Path>lib/loop/alarm-service.ts</Path>` | 长期循环、闹钟和后台状态如何避免重复运行？ |

## 主链路：总体因果图

```text
用户消息 / 文件变化 / 定时器 / 外部平台
        ↓
身份（studio / session / bridge / automation context）
        ↓
ResourceIO + permission + provider contract
        ↓
领域 store 或 coordinator
        ↓
LLM/Pi session、索引 generation、外部 adapter 或活动记录
        ↓
EventBus / activity / projection / recovery journal
```

最重要的阅读习惯是先找状态 owner，再找触发器。`ticker`、`scheduler`、`adapter` 往往只是入口；真正的真相在 store、journal、session transcript 或 ResourceIO provider。

## 1. Memory：从会话摘要到可逆的长期记忆

### 分层模型

Memory 不是单一的 `memory.md` 文件，而是一条传送带：

```text
Session summary
  → compileToday()
  → compileDaily()
  → assembleWeekFromDaily()
  → rollDailyWindow()
  → longterm.md
  → assemble(facts/today/week/longterm → memory.md)
```

`<Path>lib/memory/compile.ts</Path>` 明确把 `today.md`、`daily/{date}.md`、`week.md`、`longterm.md` 与 `facts.md` 分开。`today-state.json` 和 editable facts state 记录 watermark，而不是把产物文件名当成进度状态；这样重建产物不会丢掉“已经处理到哪一条摘要”的信息。

Why：每轮都把完整 transcript 送给模型会带来 token、延迟和隐私成本；纯文件拼接又无法归纳事实。当前设计让 LLM 只参与摘要/事实编译，窗口装配尽量是确定性代码，降低重复调用和漂移。

### MemoryTicker 是可恢复编排器

`createMemoryTicker()` 在 `<Path>lib/memory/memory-ticker.ts</Path>` 管理 session end、turn threshold、daily window、reflection、cache snapshot 和 Dream。它把每日步骤写入 `daily-state.json`，以 logical date 与 `resetAt` 判断状态是否仍适用；启动时 `_recoverUnsummarized()` 扫描摘要水位后补偿崩溃前未完成的 session。

这解释了“ticker 不等于 cron”：ticker 观察会话事件和日边界，cron 观察用户定义的 automation job。前者维护记忆一致性，后者触发业务动作。

### Dream 是带 revision 的人工/自动维护流程

`<Path>lib/memory/dream/memory-units.ts</Path>` 先把 facts/longterm 拆成 atomic units，再做 exact duplicate、same meaning、subsumes 分组，最后 composition；每一步都验证 source unit coverage，防止 LLM 忽略或跨 section 移动事实。

`<Path>lib/memory/dream/revision-store.ts</Path>` 在 apply 前保存 revision，使用 pending marker；restore 时先创建 `pre_restore` safety revision，再原子写回。`<Path>lib/memory/dream/state-store.ts</Path>` 持久化 run status 和错误码，`<Path>lib/memory/dream/runner.ts</Path>` 保证同一 memoryDir 只有一个 running Dream。

因此 Dream 的业务合同是“可解释、可回滚的整理”，不是让模型直接覆盖长期记忆。代价是 revision 文件、pending 状态和严格 schema 验证增加了维护复杂度；换来的好处是用户可以恢复误删事实。

## 2. Knowledge Workspace：文件真相、索引投影

### Source registry 先确认根身份

Knowledge 的 source 不是一个普通目录字符串。`<Path>core/knowledge-workspace/source-registry.ts</Path>` 保存 sourceKey、mount/root、provider root identity 和授权状态；index、query、mutation 前都要 revalidate source。这样 workspace 被替换、挂载根变化或 symlink 指向其他位置时，旧索引不会继续代表新目录。

### 索引 generation 是可发布的快照

`KnowledgeIndexStore`（`<Path>lib/knowledge-workspace/knowledge-index-store.ts</Path>`）以 workspace fingerprint + source fingerprint 划分 SQLite partition。manifest 包含 `generationId`、`sourceFingerprint`、`lastCompleteSequence` 和 `extractorContractVersion`；health 状态显式区分 ready、building、stale、degraded、corrupt、locked、unavailable。

一次 rebuild 的因果链是：

```text
source revalidate + root identity
  → writer.lock
  → 新 generation SQLite
  → extractor 读取 ResourceIO(expectedVersion)
  → SQLite checkpoint/fsync
  → current.json 原子发布
  → query lease 读取已发布 generation
```

新 generation 完成前，查询仍读旧 generation；因此“索引正在重建”不会让用户看到半成品。`KnowledgeIndexCoordinator`（`<Path>core/knowledge-workspace/knowledge-index-coordinator.ts</Path>`）按 source fingerprint 选择 store，并提供 query lease、mark degraded、clear degraded 等控制面。

### Markdown 与非 Markdown 走不同 extractor

`<Path>lib/knowledge-workspace/markdown-index-extractor.ts</Path>`、`<Path>lib/knowledge-workspace/document-index-extractor.ts</Path>` 解析标题、frontmatter、links、tags、tasks；`<Path>lib/knowledge-workspace/safe-text-index-extractor.ts</Path>` 对图片、PDF、音视频、active content、二进制和不安全编码只保留 metadata 或拒绝内容。读取前先 stat，读取后检查 size/version token；冲突必须重试，不能把不一致正文写进索引。

### 复杂 mutation 用 operation journal，而不是一次大函数

创建、复制、导入、重构、trash/restore 等服务位于 `<Path>core/knowledge-workspace/</Path>`。`DurableKnowledgeOperationJournal`、`KnowledgeOperationCoordinator`、`KnowledgeAtomicOperationCoordinator` 和 `KnowledgeTrashOperationCoordinator` 将 operation 分为 planned/prepared/committing/applied/rolled back 等状态，记录 requestHash、owner、source identity、item steps、projection state 和 result。

例如 trash 的用户可见 manifest 在 `<Path>lib/knowledge-workspace/knowledge-trash-manifest.ts</Path>`，但 intent/outcome 顺序由 coordinator 持有；启动恢复先扫描 journal，再决定完成或回滚。这样“文件移动成功但索引发布失败”不会变成永远无法解释的半完成状态。

### Query 是只读租约，不是随意打开 SQLite

`<Path>lib/knowledge-workspace/knowledge-query.ts</Path>` 通过 index store 的 query lease 读取 generation；source key、address、scope 和 search query 都先规范化。查询结果是索引投影，真正内容仍由 ResourceIO 打开。读者应记住：**Knowledge index 加速搜索，ResourceIO 才是内容 authority。**

## 3. Provider Registry 与 Pi SDK：第三方变化的适配层

### Provider 三层模型

当前 provider 设计可分成三个层级：

1. `<Path>lib/providers/</Path>` 中的声明式 `ProviderPlugin`：provider id、默认 base URL、auth type、模型列表、能力和可选 runtime adapter；
2. `<Path>core/provider-registry.ts</Path>` 中的 `ProviderRegistry`：合并内置声明、本地 provider plugin 和用户 catalog，标准化模型、能力、凭证来源与删除标记；
3. `<Path>lib/pi-sdk/index.ts</Path>` 与 `<Path>lib/llm/provider-client.ts</Path>`：把 registry 结果转成 Pi session 或 HTTP probe 所需的协议形状。

`<Path>core/provider-catalog.ts</Path>` 的 `ProviderCatalogStore` 只保存用户可编辑配置和 catalog version；凭证从 secret/auth lane 读取，不把明文 token 混入普通模型目录。`<Path>shared/provider-auth.ts</Path>` 规范化 auth type、过滤 credential-like headers、mask headers，并允许 loopback/none/optional 的缺 key 兼容规则。

### Pi SDK facade 是 import boundary

ESLint 禁止 Core、Lib、Hub、Server 直接 import `@earendil-works/*`；必须经 `<Path>lib/pi-sdk/index.ts</Path>`。facade 提供 `createAgentSession()`、`createModelRegistry()`、`registerModelProvider()`、`loginOAuthProvider()`、`getPiModel(s)`、`emitSessionShutdown()` 等稳定入口，并在 session 创建后安装 stream guard 与 tool outcome adapter。

Why：Pi SDK 的对象签名、OAuth registry、模型缓存和事件细节会变；把适配集中在一处，升级时只改 facade，而不是全仓库搜索第三方 API。`refreshSessionModelFromRegistry()` 还解决 active session 持有旧 model object、baseUrl 更新不生效的问题。

### Provider 的并发与失败边界

- registry reload 可能重建模型对象，active session 必须显式 refresh 或切换；
- OAuth 登录必须在拥有 AuthStorage 的 ModelRegistry 实例上注册，不能依赖嵌套 npm 包的 module singleton；
- HTTP probe 只接受 2xx，错误 body 截断为短结构化消息；
- Provider header 后来者覆盖，但 credential-like header 会在 AuthStorage 边界被剥离，避免旧 token 覆盖新 token；
- provider/model allowlist 与 Pi 内置模型不是同一个真相源，catalog 投影必须保留协议和能力元数据。

## 4. Bridge 与 Channels：外部消息的身份和文件真相

### Bridge adapter 不拥有 session identity

`<Path>lib/bridge/session-key.ts</Path>` 解析 platform/chatType/chatId/agentId，并由 `resolveBridgeSessionIdentity()` 结合持久化 index 推导 user/principal、aliases 和 display name。`<Path>lib/bridge/bridge-context.ts</Path>` 再从 session key 生成平台能力、role（owner/guest）、notification hint 和文本确认指引。

`BridgeManager`（`<Path>lib/bridge/bridge-manager.ts</Path>`）管理 Telegram、Feishu、DingTalk、QQ、WeChat 等 adapter 的生命周期、去重、流式清理、媒体交付和 outbound receipt；真正 session transcript 由 Core 的 BridgeSessionManager/SessionRef 负责。这个边界避免 adapter 直接拼 session 文件路径或自称 owner。

典型链路：

```text
平台 webhook/poll
  → parse session key
  → resolve principal + bridge context
  → Hub owner/guest route
  → Core BridgeSessionManager + Session JSONL
  → Pi tools under bridge permission mode
  → sanitizer/media capability
  → adapter outbound delivery
```

纯文本平台的 confirmationMode 是 `text_command`，所以 automation suggestion 必须引导 `/apply`，不能假设桌面有可点击确认卡片。

### Channel 是 Markdown 消息流

`<Path>lib/channels/channel-store.ts</Path>` 把一个 channel 表示成带 frontmatter 的 Markdown 文件，正文按 `### sender | timestamp` 追加消息；`withFileLock()` 对同一文件串行化 append/rewrite，不同 channel 互不阻塞。每个 Agent 的 `channels.md` 保存 bookmark，表示已经消费到哪一个时间戳。

`<Path>lib/channels/channel-ticker.ts</Path>` 周期性扫描成员、bookmark、mention 和 proactive 设置，再把未读窗口交给 Hub/AgentExecutor。ticker 只负责“是否该投递、从哪里开始读”，不直接拥有 LLM transcript；消息真相仍是 channel 文件。

这与 Bridge 的区别是：Channel 是多 Agent 的共享协作资源，Bridge 是外部平台连接；两者都通过 identity/context 进入 Hub，但持久化 owner 不同。

## 5. Desk、Cron 与 Automation：把“何时”和“以谁”分开

### CronStore 是带 revision 的配置 store

`<Path>lib/desk/cron-store.ts</Path>` 保存 `cron-jobs.json` 与 `cron-runs/`，读取时清洗旧 schema、修复 every schedule、补齐 consecutiveErrors，并在写入时使用 `atomicWriteSync()`。`storeRevision` 和每个 job 的 `configRevision` 用来阻止旧执行结果覆盖新配置；reentrant write 会被显式拒绝。

### CronScheduler 只做确定性时间判断

`<Path>lib/desk/cron-scheduler.ts</Path>` 每 60 秒检查到期 job，捕获一个不可变 store handle，重新读取 job 后再 dispatch。执行回调由 Engine 提供；scheduler 本身不调用 LLM。成功/失败都会 `markRun()`、写 run log，并按 config revision 判断 cursor 是否仍可推进；超时会调用 abortJob，默认 execution timeout 为 20 分钟。

这条职责分离很关键：调度器决定“何时”，`automation-execution-context` 决定“以哪个 studio、agent、cwd、workspace folders、Bridge target 和 notification context”，Engine/AgentExecutor 决定“做什么”。

### Execution context 是不可猜的安全输入

`normalizeAutomationExecutionContext()` 和 `requireAutomationExecutionContext()`（`<Path>lib/desk/automation-execution-context.ts</Path>`）要求 source session identity、studio binding、workspace scope、filesystem scope 和 delivery target 可验证；`automationExecutionScopeKey()` 可作为去重/并发键。`<Path>lib/desk/automation-executors.ts</Path>` 将 normalized job 转成 agent session、notification 或插件 action executor，并把 permission mode、abort signal 和 activity metadata 传入下游。

自动化不能从用户 prompt 临时猜 cwd 或 actor；缺少 context 应 fail closed。这样一个用户编辑 job 后，旧 scheduler 批次即使还在内存中，也不会在错误 Studio 记录 run。

## 6. Loop：长期循环的单独状态机

`<Path>lib/loop/loop-store.ts</Path>` 以 target 计算 loop key，保存启停、interval、lastRun、nextRun 和错误状态；`<Path>lib/loop/loop-controller.ts</Path>` 负责 start/stop/tick、并发保护和错误归一化；`<Path>lib/loop/alarm-service.ts</Path>` 提供带 abort/timeout 的睡眠与闹钟边界。

Loop 与 Cron 的区别：Cron 是用户定义的离散 job，有 config revision、run log 和 schedule；Loop 是面向一个持续目标的控制器，重点是单目标运行状态、停止和重复 tick。二者都不能绕过 Automation execution context 或 session permission。

典型 Loop 链：

```text
loop target + persisted state
  → controller 检查 stopped/running/next alarm
  → alarm service 等待或被 abort
  → callback 进入 Engine/Hub
  → outcome 写回 LoopStore + activity/event
```

## 7. 跨域状态、错误、并发与恢复

| 领域 | 权威状态 | 并发控制 | 失败/恢复 |
|---|---|---|---|
| Memory | summary JSON、memory section files、daily-state、Dream state/revision | ticker 单飞、Dream running guard、atomic writes | `_recoverUnsummarized()`、pending Dream apply、revision restore |
| Knowledge | source registry、SQLite generation、current manifest、operation journal | writer lock、query lease、address lock、operation serialization | rebuild health、journal recovery、trash restore/rollback |
| Provider | provider catalog、secret/auth storage、registry entries | registry reload + session model refresh | unsupported catalog version、missing credential、probe error、OAuth lane |
| Bridge | bridge index、session key/context、Session JSONL、media registry | idempotency key、session ownership、adapter lifecycle | orphan repair、receipt/outbound error、media cleanup |
| Channel | channel Markdown、channels.md bookmarks | per-file Promise lock、bookmark advancement | reread after append、missing file returns empty、ticker stop |
| Desk/Cron | cron-jobs JSON、run logs、activity | storeRevision、captured store、one check at a time | `.tmp` recovery、timeout abort、backoff、stale cursor |
| Loop | LoopStore state、alarm promise | running flag、abortable alarm | stop waits in-flight check，typed LoopError |

共同模式是“intent/identity/version 先于副作用”：先确认 owner 和版本，再执行；执行后写 outcome 和事件；恢复时读取权威记录，而不是凭内存猜测。

## 8. Why、代价、边界与替代设计

### Why 采用领域分工

Memory、Knowledge、Bridge、Automation 看起来都能“调用 Agent”，但它们的真相源、生命周期和失败代价不同。把它们全部塞进 Hub 会让 Hub 同时拥有文件、索引、外部平台和定时器；把它们全部塞进 Core 又会让 Engine 失去 facade 的清晰边界。当前设计让 Lib 持有领域算法和 store，Core 组装公开接口，Hub 负责路由和触发。

### 关键代价

- 同一用户行为可能穿过多个 coordinator，阅读成本高；
- 静态 schema、旧数据修复、legacy layout 和运行时 registry 要同时维护；
- LLM 参与 Memory/Dream/Provider 适配时，仍需 deterministic validator 和 revision 才能得到可恢复结果；
- Bridge、Cron、Loop 都有自己的 backoff/abort/receipt 语义，不能只依赖一个全局 retry。

### 替代方案比较

| 方案 | 优点 | 代价 | 当前不选/反转条件 |
|---|---|---|---|
| 所有状态放 SQLite、所有触发器放一个 Scheduler | 查询与调度集中 | 外部可编辑 Markdown、Session JSONL 和平台生命周期难表达 | 若产品不再需要文件可见性或多种触发器 |
| 每个平台各自拥有 Agent session | adapter 简单 | identity、权限、记忆和恢复重复实现 | 若只支持单一平台且无共享 session |
| Memory 只保留一个 LLM 生成的 `memory.md` | 文件少 | 无 watermark、无法局部恢复、误删不可逆 | 若记忆只是一次性提示词缓存 |
| 当前 Lib domain + Core facade + Hub orchestration | 领域可测试、跨入口复用、失败可定位 | 接口和文档较多 | 只有在维护成本持续超过隔离收益时才考虑收敛 |

## 9. 事实、推断、假设与待验证

| ID | 类型 | 陈述 | 证据/推导 | 状态 |
|---|---|---|---|---|
| F-06-01 | 事实 | Memory compile 使用 daily/weekly/longterm/facts 分层，并以 state/watermark 做增量。 | `<Path>lib/memory/compile.ts</Path>`、`<Path>lib/memory/memory-ticker.ts</Path>` | 已确认（静态） |
| F-06-02 | 事实 | Dream 在 apply/restore 前创建 revision，并用 pending marker 与原子写支持恢复。 | `<Path>lib/memory/dream/revision-store.ts</Path>`、`<Path>lib/memory/dream/state-store.ts</Path>` | 已确认（静态） |
| F-06-03 | 事实 | Knowledge index 以 fingerprint partition、manifest、writer lock、query lease 和 health 状态管理 generation。 | `<Path>lib/knowledge-workspace/knowledge-index-store.ts</Path>`、`<Path>core/knowledge-workspace/knowledge-index-coordinator.ts</Path>` | 已确认（静态） |
| F-06-04 | 事实 | ProviderRegistry 合并插件声明与 Provider Catalog，Pi SDK 调用统一经过 facade。 | `<Path>core/provider-registry.ts</Path>`、`<Path>core/provider-catalog.ts</Path>`、`<Path>lib/pi-sdk/index.ts</Path>` | 已确认（静态） |
| F-06-05 | 事实 | Bridge context 从 session key 和平台声明重建 interaction capabilities；Channel store 用 Markdown + per-file lock。 | `<Path>lib/bridge/bridge-context.ts</Path>`、`<Path>lib/bridge/session-key.ts</Path>`、`<Path>lib/channels/channel-store.ts</Path>` | 已确认（静态） |
| F-06-06 | 事实 | CronScheduler 每分钟检查并在 dispatch 前重读 job，使用 config revision 防旧批次推进新 cursor。 | `<Path>lib/desk/cron-scheduler.ts</Path>`、`<Path>lib/desk/cron-store.ts</Path>` | 已确认（静态） |
| I-06-01 | 推断 | Lib 是“领域机制与状态 owner”，Core 是“组合/公开门面”，Hub 是“跨领域编排”。 | 由模块依赖、store 构造和总览主链推导 | 高可信 |
| I-06-02 | 推断 | 所有领域都在把身份、版本、事件、恢复记录置于模型输出或 UI 投影之前。 | Memory/Knowledge/Bridge/Cron 结构的共同模式 | 高可信 |
| A-06-01 | 假设 | Provider 外部 API 的真实成功率、Bridge 平台限制和 Loop 长期运行行为不在本静态 Work 中验证。 | Work 约束 | 明确保留 |
| V-06-01 | 待验证 | Knowledge generation publication、Dream crash recovery、Cron 跨 Studio 切换、Provider 多实例 OAuth 和 Bridge 媒体清理需运行或专门诊断。 | 仅有静态合同与测试文件 | 不阻塞教学 |

## 10. 测试索引：按领域合同阅读

以下路径是建议的测试阅读顺序，不是执行结果：

- Memory：`<Path>tests/memory-compile-contracts.test.ts</Path>`、`<Path>tests/memory-daily-conveyor.test.ts</Path>`、`<Path>tests/memory-ticker-orchestration.test.ts</Path>`、`<Path>tests/memory-dream-runner.test.ts</Path>`、`<Path>tests/memory-dream-revision.test.ts</Path>`、`<Path>tests/memory-cache-snapshot-runtime.test.ts</Path>`；
- Knowledge：`<Path>tests/knowledge-index-store.test.ts</Path>`、`<Path>tests/knowledge-index-rebuild.test.ts</Path>`、`<Path>tests/knowledge-index-event-coordinator.test.ts</Path>`、`<Path>tests/knowledge-operation-journal.test.ts</Path>`、`<Path>tests/knowledge-operation-recovery.test.ts</Path>`、`<Path>tests/knowledge-trash-crash-recovery.test.ts</Path>`、`<Path>tests/knowledge-query-api.test.ts</Path>`、`<Path>tests/knowledge-malicious-workspace.test.ts</Path>`；
- Provider/Pi：`<Path>tests/provider-registry-crud.test.ts</Path>`、`<Path>tests/provider-catalog.test.ts</Path>`、`<Path>tests/provider-auth.test.ts</Path>`、`<Path>tests/provider-client.test.ts</Path>`、`<Path>tests/provider-cache-affinity.test.ts</Path>`、`<Path>tests/pi-sdk-create-session-adapter.test.ts</Path>`、`<Path>tests/pi-sdk-import-boundary.test.ts</Path>`、`<Path>tests/pi-sdk-oauth-login-adapter.test.ts</Path>`、`<Path>tests/pi-sdk-stream-guard.test.ts</Path>`；
- Bridge/Channel：`<Path>tests/bridge-context.test.ts</Path>`、`<Path>tests/bridge-session-key.test.ts</Path>`、`<Path>tests/bridge-handle-message.test.ts</Path>`、`<Path>tests/bridge-session-orphan-repair.test.ts</Path>`、`<Path>tests/bridge-send-media-route.test.ts</Path>`、`<Path>tests/channel-store-locking.test.ts</Path>`、`<Path>tests/channel-ticker-membership.test.ts</Path>`、`<Path>tests/channel-router-trigger.test.ts</Path>`；
- Desk/Loop/Automation：`<Path>tests/desk-route-cron.test.ts</Path>`、`<Path>tests/desk-activity-store.test.ts</Path>`、`<Path>tests/automation-tool.test.ts</Path>`、`<Path>tests/workflow-activity-restart.test.ts</Path>`、`<Path>tests/loop/loop-controller.test.ts</Path>`、`<Path>tests/loop/alarm-service.test.ts</Path>`、`<Path>tests/loop/loop-store.test.ts</Path>`、`<Path>tests/loop/bridge-loop-turn.test.ts</Path>`。

推荐每个领域采用“入口 → store/coordinator → 成功测试 → 失败/恢复测试”的循环。例如先读 `<Path>core/knowledge-workspace/knowledge-index-runtime.ts</Path>`，再读 `<Path>lib/knowledge-workspace/knowledge-index-store.ts</Path>`，最后对照 rebuild 和 crash-recovery 测试；不要只读 route 或 UI 测试。

## 下一篇

读完本篇后回到 `<Path>{roots.state}/specdev/changes/{change}/teaching/07-desktop-electron-react.md</Path>`，从客户端重新走一遍 ResourceEvent、Knowledge query、Bridge context 和 Desk activity 的投影；随后再读 `<Path>{roots.state}/specdev/changes/{change}/teaching/09-end-to-end-business-flows.md</Path>`，检验各领域的状态 owner 是否在端到端链路中保持一致。
