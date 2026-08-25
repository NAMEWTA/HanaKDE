# 00 总览：架构地图与阅读方法

## 读者目标

读完本篇，读者应能回答三件事：HanaKDE 由哪些运行边界组成；一次用户行为如何穿过这些边界；后续每篇域卷为什么在当前阅读顺序中出现。

本篇只建立导航，不逐文件解释实现。当前基线是 `package.json` 的 `0.446.6`，研究固定于本 change 记录的 `hanakde` 分支 commit；所有结论均为静态研究，运行时行为若未执行验证会标为“待验证”。

## 职责与非职责

本篇负责建立全局词汇、所有权、依赖方向和阅读路线；不替代后续域卷的实现细节，也不宣称静态地图已经通过运行时测试。

## 一句话心智模型

HanaKDE 是一个 Electron 多端外壳连接独立 HanaAgent Server 的个人 AI 工作台：Server 负责传输、认证、组合和生命周期，Core 的 `HanaEngine` 组织领域管理器，Hub 负责编排后台消息与任务，Lib/Shared 提供资源、安全、记忆、知识、Provider 和自动化能力，Plugin 平台以协议和权限模型向外扩展。

```text
Electron main/preload/React
          | HTTP + WebSocket
Server composition/auth/routes
          |
HanaEngine facade + Managers
          |
Hub EventBus + routers + scheduler
          |
Pi SDK / tools / ResourceIO / domain libraries
          |
JSONL / SQLite / workspace resources / external providers
```

## 顶层目录地图

| 目录 | 业务域 | 阅读问题 |
|---|---|---|
| `<Path>desktop/</Path>` | Electron 主进程、preload、React、原生 helper | 客户端如何连接和消费 Server？哪些能力必须由宿主提供？ |
| `<Path>server/</Path>` | Hono HTTP/WS、认证、组合根、路由 | 请求如何进入系统，如何获得 principal 和流式响应？ |
| `<Path>core/</Path>` | Engine facade、Manager、Session、Model、Plugin、权限和 Workspace | 谁拥有状态、生命周期和系统契约？ |
| `<Path>hub/</Path>` | EventBus、Scheduler、Channel/DM、AgentExecutor | 后台和多 Agent 消息如何被编排？ |
| `<Path>lib/</Path>` | ResourceIO、Memory、Knowledge、Provider、Bridge、Desk、Sandbox 等实现 | 领域机制如何被深层模块封装？ |
| `<Path>shared/</Path>` | 类型、错误、配置、路径、契约版本、持久化基础 | 跨层共享的身份和不变量是什么？ |
| `<Path>packages/</Path>` | Plugin protocol、SDK、runtime、components | 插件如何在宿主权限内获得稳定接缝？ |
| `<Path>plugins/</Path>` | 内置插件贡献 | 哪些能力可以作为可删除的贡献单元？ |
| `<Path>cli/</Path>` | Server discovery、spawn、status、chat、data | 无 UI 操作者如何复用同一个 Server？ |
| `<Path>tests/</Path>` | Vitest 与 Knowledge E2E | 每个行为合同在哪里被验证？ |

## 依赖方向与所有权

```text
shared contracts / safe persistence
        ↓
sandbox + permission + ResourceIO
        ↓
memory / knowledge / bridge / channels / desk
        ↓
core orchestration + Pi SDK + providers
        ↓
server / hub / desktop / cli
```

这是教学上的依赖模型，不等于每个 import 都严格单向。真正重要的是所有权：Server 不应成为领域状态仓库；Desktop 不应成为插件真相源；调用者不应绕过 ResourceIO、PathGuard 或 Provider registry。

## Why 采用分层与稳定接缝

桌面、CLI、Bridge、Mobile 和插件需要复用同一套会话、资源、权限和模型能力；把这些能力集中在 Server、Core、Shared 和 Lib 的稳定接缝后，客户端可以变化而不复制业务真相，代价是生命周期和事件链需要分层阅读。

## 四条主业务流

1. **桌面 Prompt**：`desktop` 连接与鉴权 → `<Path>server/routes/chat.ts</Path>` 建立请求/WS 上下文 → `Hub.send` → `HanaEngine` 的 SessionCoordinator → Pi session、工具和资源 → EventBus/stream store → React stores。
2. **Bridge 外部消息**：平台 adapter → session key/context → Hub owner/guest 路由 → `BridgeSessionManager` 的 SessionRef 与 JSONL transcript → 平台能力声明和 sanitizer → 外部回复。
3. **后台自动化**：`Hub.scheduler` 判断 heartbeat/cron → 显式 automation execution context → `engine.executeIsolated` → ActivityStore/EventBus/notification；scheduler 决定“何时”，Agent executor 决定“做什么”。
4. **资源与知识**：ResourceRef 规范化 → capability/policy/PathGuard → provider 的 version/proof → audit/event → Knowledge extractor/index generation 或 SessionFile 交付。

## 代码规范与阅读纪律

- TypeScript 基线在 `<Path>tsconfig.base.json</Path>`：strict、ES2022、ESNext、bundler resolution；根包为 ESM，但 Electron bootstrap/preload 和部分 helper 保留 CJS 边界。
- `<Path>eslint.config.js</Path>` 禁止后端绕过 `<Path>lib/pi-sdk/index.ts</Path>` 直接导入 Pi SDK；Server route 不得访问 `engine._` 私有成员；React 组件避免直接 `document.createElement`。
- 代码设计规则在 `<Path>{roots.workflows}/specdev/common/rules/codebase-design.md</Path>`：关注 Module、Interface、Depth、Seam、Adapter、Leverage、Locality，而不是逐行翻译。
- 教学结论分为事实、推断、假设、待验证；不要把命名或 README 宣称当作架构证据。

## 推荐阅读顺序

1. 本篇：先记住进程、所有权和四条主流。
2. `01-runtime-lifecycle-and-cli`：理解 Server 如何真正启动、ready 和关闭。
3. `02-core-engine-and-session`：进入 Engine、Agent、Session 和模型执行。
4. `03-server-http-websocket` 与 `04-hub-orchestration`：分别理解传输边界和编排边界。
5. `05-shared-persistence-resource-security`：理解资源身份、版本和安全证明。
6. `06-lib-domain-capabilities`：深入 Memory、Knowledge、Provider、Bridge、Desk。
7. `07-desktop-electron-react`：从客户端角度重走请求和事件流。
8. `08-plugin-protocol-sdk-runtime`：理解扩展为何受协议和权限约束。
9. `09-end-to-end-business-flows`：把域卷重新串成用户行为。
10. `10-tests-and-reading-map`：按测试合同验证你的源码模型。

## 测试阅读入口

先用 `<Path>docs/index.md</Path>` 和本 change 的测试地图定位模块，再按 `10-tests-and-reading-map` 的行为表进入具体测试；本篇自身不提供测试执行结果。

## 事实、推断与待验证

- **事实：** README、`docs/index.md`、入口文件和静态 agent 报告共同支持上述目录和主链路。
- **推断：** “总图 + 域卷 + 跨域业务流”比机械的一目录一文档更适合学习设计原因，因为业务所有权与目录边界并不完全重合。
- **待验证：** 真实 packaged spawn、跨平台运行、崩溃恢复和完整 route inventory 不能仅凭本篇静态地图确认。

## 下一篇

阅读 `01-runtime-lifecycle-and-cli`。在理解任何 Manager 之前，先知道进程是怎样被拉起、如何宣告 ready、为何需要同宅互斥和数据 epoch 闸，以及关闭时为什么必须逆序释放。
