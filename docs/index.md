# HanaKDE (HanaAgent) — 项目目录结构完整索引

> **项目名称**: HanaAgent（npm 包名 `hanako`）
> **版本**: v0.416.51
> **描述**: 带有记忆和灵魂的个人 AI 助理
> **作者**: liliMozi
> **许可证**: Apache-2.0
> **仓库**: GitHub `liliMozi/openhanako`
> **文档生成日期**: 2026-07-24

---

## 目录

- [1. 项目整体概览](#1-项目整体概览)
- [2. 根目录文件清单](#2-根目录文件清单)
- [3. 核心源码目录](#3-核心源码目录)
  - [3.1 core/ — 引擎核心](#31-core--引擎核心)
  - [3.2 server/ — HTTP + WebSocket 服务器](#32-server--http--websocket-服务器)
  - [3.3 desktop/ — Electron 桌面应用](#33-desktop--electron-桌面应用)
  - [3.4 shared/ — 跨层共享工具](#34-shared--跨层共享工具)
  - [3.5 lib/ — 功能库](#35-lib--功能库)
  - [3.6 cli/ — 命令行接口](#36-cli--命令行接口)
  - [3.7 hub/ — 消息调度中心](#37-hub--消息调度中心)
- [4. 插件与扩展](#4-插件与扩展)
  - [4.1 plugins/ — 内置系统插件](#41-plugins--内置系统插件)
  - [4.2 packages/ — 插件 SDK (npm workspace)](#42-packages--插件-sdk-npm-workspace)
  - [4.3 skills2set/ — 内置技能包](#43-skills2set--内置技能包)
  - [4.4 examples/ — 插件开发示例](#44-examples--插件开发示例)
- [5. 开发工作流](#5-开发工作流)
  - [5.1 speculo/ — Speculo 框架](#51-speculo--speculo-框架)
  - [5.2 scripts/ — 构建与工具脚本](#52-scripts--构建与工具脚本)
  - [5.3 build/ — 构建配置产物](#53-build--构建配置产物)
  - [5.4 tests/ — 测试套件](#54-tests--测试套件)
- [6. CI/CD 与项目配置](#6-cicd-与项目配置)
  - [6.1 .github/ — GitHub 配置](#61-github--github-配置)
  - [6.2 TypeScript 配置](#62-typescript-配置)
  - [6.3 Vite 构建配置](#63-vite-构建配置)
  - [6.4 代码规范与安全](#64-代码规范与安全)
- [7. 架构总览](#7-架构总览)
- [8. 关键入口点](#8-关键入口点)
- [9. 不存在但可能被期待的目录](#9-不存在但可能被期待的目录)

---

## 1. 项目整体概览

HanaAgent 是一个基于 **Electron 42 + React 19 + Hono Server** 的桌面端个人 AI 助理，具备以下核心特性：

- **多 Agent 架构**：支持多代理通信（频道、DM、事件总线）
- **记忆系统**：高斯衰减记忆、事实存储、反思编译
- **插件体系**：内置 5 个系统插件 + 社区插件 SDK
- **多平台桥接**：Telegram、飞书、钉钉、QQ、微信
- **Computer Use**：macOS Swift 原生 + Windows C++ 沙盒辅助
- **30+ LLM Provider**：Anthropic、OpenAI、Gemini、DeepSeek、Kimi、Qwen 等
- **多平台桌面端**：macOS (arm64/x64)、Windows (x64)、Linux (x64)

### 技术栈速览

| 层级 | 技术选型 |
|------|----------|
| 运行时 | Electron 42.3.0 |
| 前端 UI | React 19.2.4 + TypeScript 5.9.3 |
| 状态管理 | Zustand 5.0.11 |
| 富文本 | TipTap 3.22 + CodeMirror 6 |
| 动画 | Motion 12.40 |
| 图表 | Mermaid 11.10 |
| 后端服务器 | Hono 4.12.9 |
| 数据库 | better-sqlite3 12.6.2 |
| AI 核心 | @earendil-works/pi-agent-core 0.80.3 |
| 构建工具 | Vite 7.3.1 |
| 打包工具 | electron-builder 26.8.1 |
| 测试框架 | Vitest 4.0.18 |
| 代码规范 | ESLint 9.39.4 |
| Node.js | >= 24.12.0 < 25 |
| 模块系统 | ESM (type: "module") + 部分 CJS 兼容 |

---

## 2. 根目录文件清单

| 文件 | 说明 |
|------|------|
| `package.json` | 项目元信息、npm 脚本（32 个）、依赖声明、electron-builder 配置 |
| `tsconfig.json` | 主 TypeScript 配置（桌面渲染端 + packages），继承 tsconfig.base.json |
| `tsconfig.base.json` | 共享基线：ES2022、ESNext 模块、strict 模式 |
| `tsconfig.node.json` | Node 端配置（core/lib/server/hub/cli/plugins） |
| `tsconfig.test.json` | 测试文件配置 |
| `index.js` | 入口点 → 导入 `cli/entry.ts` 的 `main()` |
| `CLAUDE.md` | Claude Code 代理手册入口 → 参见 `AGENTS.md` |
| `AGENTS.md` | Speculo 运行时配置，引导加载工作区和工作流 |
| `README.md` / `README_EN.md` | 中/英文项目说明 |
| `CONTRIBUTING.md` | 贡献指南（当前仅接受 Issue） |
| `CODE_OF_CONDUCT.md` | 贡献者公约 v2.1 |
| `SECURITY.md` | 安全策略（沙盒逃逸、凭证泄露、RCE、XSS） |
| `PLUGINS.md` / `PLUGINS_EN.md` | 社区插件开发完整指南（中/英文，60KB+） |
| `PLUGIN_SDK.md` | SDK 包参考文档（29KB） |
| `eslint.config.js` | ESLint 扁平化配置 |
| `vitest.config.js` | Vitest 测试配置 |
| `vite.config.ts` | 主 Vite 配置（渲染端，13KB） |
| `vite.config.main.js` | Electron 主进程打包 |
| `vite.config.preload.js` | Electron preload 打包 |
| `vite.config.server.js` | Hono Server 打包 |
| `vite.config.splash.ts` | Splash 启动页独立构建 |
| `vite.config.theme.js` | 主题运行时独立构建（IIFE） |
| `vite.csp-profiles.ts` | 集中式 CSP 策略定义（6 个 profile） |
| `.gitignore` | Git 忽略规则（2.3KB） |
| `.gitattributes` | Git 文件属性（统一 LF，标记二进制） |
| `.npmrc` | npm 供应链防护（精确版本、审计、延迟安装） |
| `export-manifest.json` | 开源边界清单（24KB） |
| `release-digest.v1.json` | 版本发布摘要 v1 |
| `release-digest.v2.json` | 版本发布摘要 v2（135KB，更全面） |

---

## 3. 核心源码目录

### 3.1 core/ — 引擎核心

**定位**: AI 引擎编排层，是整个应用的"大脑"。管理 Agent、Session、Model、Provider、Plugin、Skill、Channel、Bridge 等核心生命周期。

**规模**: ~120 个 TypeScript 文件

#### 核心文件

| 文件 | 说明 |
|------|------|
| `engine.ts` | **HanaEngine** — 顶层门面，组合所有管理器（AgentManager、SessionCoordinator、ConfigCoordinator、ChannelManager、BridgeSessionManager、ModelManager、PreferencesManager、SkillManager、PluginManager 等） |
| `agent.ts` / `agent-manager.ts` | Agent CRUD、初始化、切换 |
| `session-*.ts` (15+ 文件) | 会话生命周期：协调器、清单、JSONL 文件、压缩、健康检查、关闭、思考级别、轮次上下文、提醒、权限模式、项目目录、行内媒体修剪、分支头 |
| `model-manager.ts` / `model-sync.ts` / `model-execution-config.ts` | 模型注册、发现、同步、执行配置 |
| `llm-client.ts` / `llm-request-policy.ts` / `llm-utils.ts` | LLM API 客户端与请求策略 |
| `plugin-manager.ts` / `plugin-config.ts` / `plugin-context.ts` | 插件系统：加载、配置、开发工具、iframe/surface session 托管 |
| `provider-*.ts` | Provider 注册表、目录、兼容/序列化、提示词补丁 |
| `config-coordinator.ts` / `preferences-manager.ts` | 配置和偏好管理 |
| `skill-manager.ts` | Skill 注册/同步 |
| `bridge-session-manager.ts` | 外部平台桥接会话管理 |
| `channel-manager.ts` | 频道 CRUD |
| `first-run.ts` | 首次运行初始化 |
| `platform-prompt.ts` | 平台特定系统提示词 |
| `vision-*.ts` (5 文件) | 视觉/视觉上下文管线、桥接、准备、注入器、辅助策略 |
| `yuan-registry.ts` | Yuan（Agent 角色/人格）注册表 |

#### 子目录

| 子目录 | 说明 |
|--------|------|
| `computer-use/` | **Computer Use (CUA)** 子系统。host 抽象、provider 契约与注册表、模型策略、租约注册表；Provider 实现：`macos-cua-provider.ts`（Swift 原生）、`windows-uia-provider.ts`（C++ 沙盒）、`command-runner.ts`、`mock-provider.ts` |
| `media/` | 媒体管理：通用媒体管理器、任务存储、图片提交/轮询/下载、图片任务运行器、会话分叉、本地 CLI 包装器 |
| `media-adapters/` | 图片生成适配器：OpenAI、Gemini、DashScope、MiniMax、火山引擎、Agnes、OpenAI Codex；模型目录、分辨率层级 |
| `provider-compat/` | Provider 兼容层：Anthropic、DeepSeek、OpenAI 系列、Kimi、Qwen、智谱、火山引擎、Mimo、LongCat、OpenRouter、Agnes、Codex Responses、输入音频、视频 URL、输出预算、推理内容回放、工具配对 |
| `session-manifest/` | 会话清单子系统：存储、解析器、引用、ID、DB 文件、检查点、旧版迁移、启动迁移、路径规范化 |
| `slash-commands/` | 斜杠命令系统：注册/分发、Bridge 命令、会话操作、RC（角色卡）状态/路由/摘要、列出代理会话 |
| `speech-recognition/` | 语音识别适配器 |
| `execution-*.ts` | 执行租约注册表、服务、路由、边界 |
| `resource-*.ts` | 资源访问服务、票证服务 |
| `data-epoch-*.ts` | 数据纪元协调器、迁移、恢复、检查点 |
| `security-*.ts` | 安全审计日志、主体 |
| `server-*.ts` | 服务器认证、身份、网络配置、端口选择、运行时上下文 |

---

### 3.2 server/ — HTTP + WebSocket 服务器

**定位**: 基于 Hono 框架的 HTTP + WebSocket API 服务器，在 Electron 内作为嵌入式进程运行，同时支持独立部署。

**规模**: ~45 个 TypeScript 文件

#### 核心文件

| 文件 | 说明 |
|------|------|
| `index.ts` | **服务器入口** — 初始化 HanaEngine，设置 Hono 应用（所有路由、WebSocket、CORS、认证） |
| `bootstrap.ts` | 服务器启动生命周期 |
| `boot.cjs` | CJS 启动包装器 |
| `main-full.ts` | 完整版组合（所有路由） |
| `main-open.ts` | 开源版组合（仅开源路由） |
| `hono-helpers.ts` | Hono 框架辅助工具 |
| `ws-protocol.ts` / `ws-scope.ts` | WebSocket 协议和作用域 |
| `app-events.ts` | 应用事件定义 |
| `block-extractors.ts` / `suggestion-blocks.ts` | 内容块提取与建议渲染 |
| `deferred-result-*.ts` | 延迟结果间奏和总线处理器 |
| `task-bus-handlers.ts` | 任务执行总线处理器 |
| `session-stream-store.ts` | 会话流状态 |
| `cli.ts` | 服务器端 CLI 入口 |

#### 子目录

| 子目录 | 说明 |
|--------|------|
| `routes/` (40+ 文件) | **API 路由**：agents、sessions、chat、config、desk、skills、plugins、providers、models、auth、bridge、channels、media、files、upload、checkpoints、character-cards、devices、diary、experiments、mobile、preferences、resources、speech-recognition、usage、access、avatar、cards、commands、confirm、dm、fs、html-preview、input-drafts、mobile-static、mobile-workbench、plugin-*、provider-credentials、resource-io、server-identity、session-collab、session-projects、settings-snapshot、studio-workspaces、web-auth、ws-auth 等 |
| `composition/` | 依赖注入/组装契约：`contract.ts`、`full-root.ts`、`open-root.ts` |
| `http/` | HTTP 工具：边界、能力守卫、CORS 策略、文件内容、插件资源、请求主体、资源操作上下文、路由错误/安全、安全审计、传输上下文 |
| `cards/` | 交互式卡片文档渲染 |
| `utils/` | 路径安全、解析 Agent、上传 Skill 包验证 |

---

### 3.3 desktop/ — Electron 桌面应用

**定位**: Electron 42 桌面外壳，包含主进程、预加载脚本、React 渲染端和原生辅助程序。

**规模**: ~400+ 个文件（含 394 个 .tsx React 组件）

#### A. 主进程（根目录 CJS 文件）

| 文件 | 说明 |
|------|------|
| `bootstrap.cjs` | **Electron 入口点** (`package.json` 的 `"main"`) — 加载 Windows CA 注入、解析 HANA_HOME、验证启动完整性、加载主进程 bundle |
| `main.cjs` | **主进程** (~500+ 行) — 创建 BrowserWindow、启动嵌入式 Hono Server、管理启动页/托盘/自动更新/文件监视、IPC 处理、单实例锁、通知 |
| `preload.cjs` | **预加载桥接** — 通过 `contextBridge` 暴露 `window.hana` API（服务器端口、令牌、版本、自动更新、文件 I/O、剪贴板、通知等） |
| `auto-updater.cjs` | 自动更新集成 |
| `file-watch-*.cjs` | 文件系统监听（适配器、注册表、路径） |
| `workspace-watch-registry.cjs` | 工作区文件变更监听 |
| `ipc-wrapper.cjs` | IPC 处理器包装器 |
| `keep-awake.cjs` | 防止系统休眠 |
| `login-item-settings.cjs` | 开机自启 |
| `file-text-io.cjs` | 文本文件一致性读写 |
| `entitlements.mac.plist` | macOS 权限声明 |

#### B. 原生辅助程序

| 路径 | 说明 |
|------|------|
| `native/HanaComputerUseHelper/` | **macOS Swift 原生应用** — Computer Use 鼠标/键盘自动化 (`main.swift`) |
| `native/HanaWindowsSandboxHelper/` | **Windows C++ 沙盒辅助** — 受限令牌执行 (`main.cpp`) |

#### C. 渲染端入口 (`desktop/src/`)

| 文件 | 说明 |
|------|------|
| `main.tsx` | React 渲染端入口 → 挂载 `<App />` |
| `index.html` + `main.tsx` | 主聊天窗口 |
| `settings.html` + `settings-main.tsx` | 设置面板 |
| `quick-chat.html` + `quick-chat-main.tsx` | 浮动快速聊天 |
| `onboarding.html` + `onboarding-main.tsx` | 新用户引导 |
| `splash.html` + `splash-main.tsx` | 启动加载页（独立构建） |
| `mobile.html` + `mobile-main.tsx` + PWA | 移动端 PWA 布局 |
| `browser-viewer.html` + `browser-viewer-main.tsx` | 浏览器查看器 |
| `viewer-window.html` + `viewer-window-entry.tsx` | 文件查看器 |

#### D. React 应用 (`desktop/src/react/`)

| 子目录 | 说明 |
|--------|------|
| `App.tsx` | 根组件（标题栏 + 侧栏 + 主内容 + 浮层） |
| `app-init.ts` / `bootstrap.ts` | 应用初始化（主题、拖拽防护） |
| `MainContent.tsx` | 主内容区布局 |
| `components/` | **UI 组件** — 按功能区组织：`app/`（标题栏、侧栏）、`chat/`（消息渲染）、`input/`（输入区，InputArea.tsx 92KB）、`preview/`（预览面板）、`settings/`（设置面板）、`channels/`（频道）、`desk/`（自动化调度）、`automation/`、`floating-input/`、`plugin/`、`shared/`、`selection/`、`right-workspace/`、`notices/`；顶层组件：SessionList.tsx (75KB)、ChannelsPanel.tsx (48KB)、SkillsPanel.tsx (32KB)、BridgePanel.tsx (22KB) 等 20+ 个 |
| `ui/` | **UI 原语** — 按钮、开关、选择器、浮层、确认/通知弹窗、上下文菜单、工具提示、动画原语（FadeIn、Collapse、SlideIn、AnimatedList）、查找框、Provider 图标 |
| `hooks/` | **React Hooks** — 自适应流文本、流缓冲、连续底部滚动、框选、侧栏拖拽、斜杠项、插件 iframe/surface、自动更新状态、配置获取、Mermaid 图表、动画存在、面板、平台、主题、国际化 |
| `stores/` | **Zustand 状态管理** — 23 个切片：Connection、Session、SessionProject、Streaming、UI、Agent、Channel、Desk、Model、Input、Chat、ChatFind、Toast、Preview、Browser、Context、Automation、Activity、AgentActivity、Bridge、PluginUi、Selection、SubagentPreview、ComputerOverlay、Screenshot |
| `services/` | **前端服务** — server-connection.ts (27KB)、ws-message-handler.ts (43KB)、stream-resume、resource-events/access、app-event-actions、websocket、file-change-events、workspace-change-events、appearance-sync、session-refresh-scheduler、studio-access、stream-key-dispatcher、resource-url |
| `editor/` | **CodeMirror/TipTap 编辑器** — Markdown 块处理、装饰、命令、选区、控件（引用块、复选框、代码块、CSV 表格、分割线、图片、链接、Mermaid、表格）、主题、排版、高亮、链接处理 |
| `settings/` | **设置 UI** — 标签页：关于、访问、Agent、Bridge、Browser、ComputerUse、实验、通用、界面、MCP、我、媒体、插件市场、插件、Providers、安全、共享、Skills、工作 |
| `mobile/` | **移动端 PWA** — MobileApp.tsx、初始化、平台适配、CSS |
| `plugin-ui/` | **插件 UI 托管** — 能力声明、宿主控制器 |
| `onboarding/` | **引导流程**（含测试） |
| `quick-chat/` | **快速聊天**迷你窗口 |
| `splash/` | **启动屏幕** |
| `browser-viewer/` | **浏览器查看器** |
| `errors/` | 错误处理组件 |
| `utils/` / `types/` | 共享工具和类型 |

#### E. 桌面端共享 (`desktop/src/shared/`)

| 文件 | 说明 |
|------|------|
| `theme-registry.ts/cjs` | 主题注册表（sakura、midnight、warm-paper 等） |
| `theme.ts` / `appearance-preferences.ts` | 主题和外观偏好 |
| `artifact-*.cjs` (5 文件) | OTA 构件：启动、GC、OTA、修复、开发绕过 |
| `single-instance-lock.cjs` | 单实例锁 |
| `window-state.cjs` | 窗口位置/大小持久化 |
| `desktop-notification-policy.cjs` | 通知抑制规则 |
| `desktop-launch-diagnostics.cjs` | 启动诊断日志 |
| `server-readiness.cjs` / `server-process-env.cjs` / `stale-server-info.cjs` | 服务器生命周期管理 |
| `onboarding-completion.cjs` | 引导完成标记 |
| `train-update-apply.cjs` | 更新列车应用 |
| `update-digest-history.cjs` / `post-update-announcement.cjs` | 更新摘要/公告 |
| `browser-wait.cjs` | 浏览器就绪检测 |
| `gpu-startup-policy.cjs` | GPU 启动策略 |
| `launch-integrity.cjs` | 启动完整性校验 |
| `path-to-file-url.cjs` | 路径转换 |
| `screenshot-markdown.cjs` | 截图 Markdown |
| `trash-item-path.cjs` / `agent-avatar-path.cjs` | 路径解析 |
| `windows-server-guardian.cjs` | Windows 服务器进程守护 |
| `windows-system-ca.cjs` | Windows 系统 CA 证书加载 |

#### F. 桌面端模块 (`desktop/src/modules/`)

| 文件 | 说明 |
|------|------|
| `platform.js` | **平台适配层** — Electron：使用预加载注入的 `window.hana`；Web：HTTP 回退到服务器 API |
| `connection-csp.js` | 连接 CSP 配置 |

#### G. 资源与国际化

| 路径 | 说明 |
|------|------|
| `desktop/src/assets/` | 应用资源：角色图片（Hanako、Butter、Kong、Ming）、角色卡、封面画廊、托盘图标（开发/生产模板、.ico、.png）、纹理、截图预览 |
| `desktop/src/locales/` | 多语言 UI 字符串：`en.json`、`zh.json`、`ja.json`、`ko.json`、`zh-TW.json` |
| `desktop/src/themes/` | 主题 CSS：absolutely、contemplation、coral、deep-think、delve、grass-aroma、high-contrast、midnight、midnight-contrast、new-warm-paper、warm-paper；字体 |
| `desktop/src/screenshot-themes/` | 截图主题：sakura-light、sakura-light-desktop、solarized-dark、solarized-dark-desktop、solarized-light、solarized-light-desktop |

---

### 3.4 shared/ — 跨层共享工具

**定位**: core、server、desktop 三个主要层之间共享的类型、常量和工具函数。

**规模**: ~70 个文件

#### 核心文件

| 文件 | 说明 |
|------|------|
| `hana-root.ts` / `hana-runtime-paths.ts/cjs` | Hanako 主目录和运行时路径解析 |
| `config-schema.ts` / `config-scope.ts` | 配置 Schema 和作用域 |
| `model-ref.ts` / `model-capabilities.ts` / `known-models.ts` | 模型引用、能力、已知模型 |
| `errors.ts` / `error-bus.ts` | 错误类型和事件总线 |
| `default-workspace.ts` / `workspace-scope.ts` / `workspace-history.ts` | 工作区管理 |
| `agent-id.ts` | Agent ID 处理 |
| `provider-auth.ts` / `secret-custody.ts` | Provider 认证和密钥管理 |
| `safe-fs.ts` / `safe-parse.ts` / `link-aware-fs.ts` | 安全文件系统操作 |
| `log-redactor.ts/cjs` | 日志敏感数据脱敏 |
| `network-proxy.ts/cjs` / `net-utils.ts` | 网络代理配置 |
| `contract-versions.ts/cjs/json` | 内部契约版本 |
| `tool-categories.ts` / `tool-arg-summary.ts` / `tool-outcome.ts` | 工具元数据和结果类型 |
| `browser-preferences.ts` / `notification-preferences.ts` / `editor-typography.ts` | 用户偏好模型 |
| `audio-mime.ts` / `image-mime.ts` / `video-mime.ts` | 媒体 MIME 类型 |
| `session-projects.ts` / `input-drafts.ts` | 会话项目和输入草稿 |
| `experiments-schema.ts` | 功能实验 Schema |
| `search-providers.ts` | Web 搜索 Provider 配置 |
| `oauth-login.ts` | OAuth 登录工具 |
| `yuan-visuals.ts` / `cover-gallery-presets.ts` | 角色视觉和封面预设 |
| `access-scope-profiles.ts` | 访问范围配置 |
| `retry.ts` | 重试工具 |
| `text-signature.ts` | 文本签名生成 |

#### 子目录

| 子目录 | 说明 |
|--------|------|
| `artifact-core/` | **OTA 构件核心库**：激活、索引、密钥集、清单、OTA 核心、固定密钥集、指针渠道、指针存储、ustar |
| `persistence/` | **持久化层**：存储注册表、启动阶段、存储注册表类型 |

---

### 3.5 lib/ — 功能库

**定位**: 跨应用实现的可重用功能库。这是项目最丰富的模块集合。

**规模**: ~170+ 个文件，30+ 个子目录

#### 核心子目录

| 子目录 | 说明 |
|--------|------|
| `tools/` (25+ 文件) | **Agent 工具实现**：browser-tool、file-tool、terminal-tool、session-tool、subagent-tool、automation-tool、web-search、web-fetch、web-reader、computer-use-tool、channel-tool、dm-tool、notify-tool、output-file-tool、card-guide-tool、show-card-tool、stop-task-tool、check-deferred-tool、todo、workflow-tool、current-status-tool、pinned-memory、install-skill、session-folders-tool 等 |
| `providers/` (30+ 文件) | **LLM Provider 集成**：anthropic、openai、gemini、deepseek、kimi、qwen、zhipu、mistral、ollama、openrouter、groq、fireworks、together、perplexity、hunyuan、minimax、mimo、moonshot、stepfun、siliconflow、modelscope、infini、volcengine、dashscope、baichuan、baidu-cloud、opencode、xai-oauth、agnes；媒体 Schema 辅助工具、Token 计划、语音 Provider |
| `sandbox/` (16+ 文件) | **安全沙盒**：工具包装器、策略、路径守卫、bwrap (Linux Bubblewrap)、seatbelt (macOS)、读取增强、图片视觉、Office 媒体、执行辅助、脚本、托管配置守卫；Windows 特定：win32-bash-guard、win32-command-router、win32-exec、win32-legacy-*、win32-path、win32-policy、win32-sandbox-helper |
| `memory/` (14+ 文件) | **Agent 记忆系统**：深层记忆、事实存储、记忆搜索、记忆计时器、记忆反思运行器、编译记忆、固定记忆存储、滚动摘要格式、会话摘要、会话派生状态、LLM 预算、时间上下文；`prompts/` 子目录 |
| `bridge/` (20 文件) | **外部平台桥接**：bridge-manager、bridge-context、bridge-presentation；钉钉适配器、飞书适配器、QQ 适配器、Telegram 适配器、微信适配器（ilink 媒体加密/登录）；交互能力、媒体投递、所有者策略、出站 HTTP、收据能力、会话密钥、流式能力 |
| `channels/` (4 文件) | 频道管理：mentions、store、ticker、conversation-export |
| `desk/` (10 文件) | 自动化调度台：desk-manager、activity-store、agent-run-automation、自动化执行上下文/执行器/规范化器/建议回执、cron-scheduler/store、heartbeat、权限 |
| `exec-command/` (6 文件) | 命令执行：guidance、policy、runner、schema、shell、tool |
| `shell/` (4 文件) | Shell 工具：command-runner、execution-cwd、shell-profile、shell-utils |
| `terminal/` (3 文件) | 终端：node-pty-backend、shell-resolver、terminal-session-manager |
| `browser/` (3 文件) | 浏览器：browser-manager、browser-search-extractors、browser-transport |
| `search/` (3 文件) | 会话搜索：session-find、session-search、session-search-tokenizer |
| `skills/` (5 文件) | Skills：session-skill-snapshot、skill-file-identity、skill-metadata、skill-name-translation-cache、skill-package-installer |
| `skill-bundles/` (2 文件) | Skill 打包：package-service、store |
| `workflow/` (7 文件) | Workflow 执行引擎：concurrency、host-api、journal、meta、sandbox、structured-output |
| `llm/` (7+ 文件) | LLM 工具：cache-prefix-contract、cache-strategy-contract、prompt-layout、provider-cache-affinity、provider-client、session-snapshot-side-task-runner、usage-context/ledger/observer |
| `session-collab/` (5 文件) | 会话协作：decision-record、delivery、draft-store、handbook、transcript |
| `resource-io/` (10+ 文件) | 资源 I/O：agent-tools、errors、pi-tool-operations、resource-access-policy、resource-event-bus、resource-io、resource-refs、resource-watch-registry、sandbox-resource-io、session-file-resolver、providers/ |
| `conversations/` (5 文件) | Agent 通话：activity、projection、prompt、runtime、session |
| `permission/` | 权限系统：approval-review-context、safety-policy、tool-invocation-permission |
| `session-files/` (4 文件) | 会话文件：bridge-inbound-files、browser-screenshot-file、session-file-registry、session-file-response |
| `identity-templates/` | Agent 身份 Markdown 模板（hanako、butter、ming） |
| `ishiki-templates/` | "意识"（Ishiki）Markdown 模板 |
| `public-ishiki-templates/` | 公开 Ishiki 模板 |
| `yuan/` | Yuan 角色定义（hanako、butter、kong、ming） |
| `pi-sdk/` | PI SDK 适配器层：index、search-tools、session-options、stream-guard、tool-outcome-adapter（**所有 PI SDK 导入必须经过此层**） |
| `agent-review/` | Agent 审查轮次协调器 |
| `auth/` | 认证：xai-oauth |
| `character-cards/` | 角色卡服务 |
| `experiments/` | 功能实验注册表 |
| `extensions/` | 引擎扩展：compaction-guard-ext、deferred-result-ext |
| `notifications/` | 通知服务 |
| `net/` | 出站代理 |
| `text/` | 内部叙述文本处理 |
| `compat/` | 兼容性检查 |
| `resources/` | 资源信封 |
| `file-ref/` | 文件引用资源 I/O |
| `fresh-compact/` | 每日刷新压缩调度器与策略 |
| `diary/` | 日记编写 |

#### 核心单文件

| 文件 | 说明 |
|------|------|
| `approval-gateway.ts` | 审批网关 |
| `activity-hub.ts` | 活动中心 |
| `checkpoint-store.ts` / `checkpoint-wrapper.ts` | 检查点存储 |
| `confirm-store.ts` | 确认对话框存储 |
| `debug-log.ts` | 调试日志模块 |
| `deferred-result-*.ts` (4 文件) | 延迟结果协调器、通知、载荷、存储 |
| `file-metadata.ts` | 文件元数据检测 |
| `i18n.ts` | 国际化 |
| `pii-guard.ts` | PII 保护守卫 |
| `plugin-format-guard.ts` / `plugin-install-*.ts` / `plugin-marketplace.ts` / `plugin-versioning.ts` | 插件格式验证、安装备份/记录、市场、语义版本 |
| `secret-fingerprint.ts` | 密钥指纹 |
| `session-execution-registry.ts` / `session-jsonl.ts` | 会话执行注册表、JSONL 格式 |
| `subagent-executor-metadata.ts` / `subagent-run-store.ts` / `subagent-thread-store.ts` | 子代理执行器元数据、运行和线程管理 |
| `task-registry.ts` | 后台任务注册表 |
| `time-utils.ts` | 时间工具 |
| `tool-protocol-sanitizer.ts` | 工具协议输入净化 |
| `turn-input-presentation.ts` | 轮次输入呈现格式化 |
| `user-profile-store.ts` | 用户资料存储 |
| `workflow-activity-store.ts` | Workflow 活动存储 |
| `zip-writer.ts` / `extract-zip.ts` | ZIP 文件读写 |
| `default-models.json` / `known-models.json` / `known-model-fallbacks.json` | 模型目录数据 |
| `config.example.yaml` | 示例配置 |
| `identity.example.md` / `ishiki.example.md` / `pinned.example.md` | 示例模板 |

---

### 3.6 cli/ — 命令行接口

**定位**: `hana` 命令行工具的入口，支持服务管理、交互式聊天、数据操作等。

**规模**: 9 个 TypeScript 文件

| 文件 | 说明 |
|------|------|
| `entry.ts` | **CLI 入口** (`hana` 命令) — 解析参数，路由到子命令 |
| `args.ts` | 命令行参数解析和帮助文本 |
| `chat.ts` | 交互式聊天模式 |
| `client.ts` | 服务器 API 客户端 |
| `local-server.ts` | 本地服务器连接解析 |
| `server-runner.ts` | 服务器生命周期管理 |
| `bundle.ts` | 打包/归档操作 |
| `data.ts` | 数据诊断/检查点/恢复 |
| `terminal-theme.ts` | 终端颜色主题（ANSI） |

**支持命令**: `serve`、`chat`、`bundle pull/status`、`data diagnose/checkpoints/restore`、`status`

---

### 3.7 hub/ — 消息调度中心

**定位**: 多 Agent 通信的后台编排中心，负责消息路由、事件分发、调度和定期维护。

**规模**: 9 个 TypeScript 文件

| 文件 | 说明 |
|------|------|
| `index.ts` | **Hub 类** — 消息调度中心，编排所有路由器和处理器 |
| `channel-router.ts` | 频道消息路由（群聊） |
| `dm-router.ts` | 直接消息路由（Agent 间 DM） |
| `guest-handler.ts` | 访客/共享会话处理 |
| `scheduler.ts` | 心跳 + Cron 调度 |
| `event-bus.ts` | 统一内部事件总线 |
| `event-bus-capabilities.ts` | 事件总线能力注册 |
| `agent-executor.ts` | Agent 执行调度 |
| `fresh-compact-maintainer.ts` | 定期内存压缩维护 |

---

## 4. 插件与扩展

### 4.1 plugins/ — 内置系统插件

**定位**: 运行时动态加载的系统插件，每个插件遵循 `manifest.json` + `index.ts` + 可选 `tools/`、`routes/`、`skills/`、`providers/`、`lib/` 结构。

| 插件 | 说明 |
|------|------|
| `beautify/` | **美化工具** — 封面图片生成、HTML 样式指南、Markdown 封面服务（`lib/` 5 文件 + `tools/` 5 文件） |
| `jimeng-cli/` | **即梦 AI** — Dreamina 图片生成 CLI 集成（`adapters/dreamina.ts`、`providers/jimeng-cli.ts`） |
| `mcp/` | **Model Context Protocol** — MCP 协议支持，HTTP 和 stdio 传输、OAuth 认证（`lib/` 5 文件 + `routes/api.ts`） |
| `media/` | **媒体生成** — AI 图片/视频生成工具和能力描述（`skills/` + `tools/`） |
| `office/` | **办公文档** — .docx/.pdf 读取、HTML 转 PDF（`lib/` 4 文件 + `tools/` 3 文件） |

---

### 4.2 packages/ — 插件 SDK (npm workspace)

**定位**: 正式的 npm workspace (`packages/*`)，为社区插件开发者提供类型化 SDK。

| 包名 | 说明 | 依赖 |
|------|------|------|
| `plugin-protocol/` | WebView↔Host 共享协议常量和消息格式（8.9KB 类型定义） | 无 |
| `plugin-sdk/` | WebView/iframe 浏览器端类型化辅助工具 | plugin-protocol |
| `plugin-runtime/` | 插件 Node.js 运行时辅助工具（工具、生命周期、EventBus、Providers、Pi SDK 扩展） | plugin-protocol |
| `plugin-components/` | 带主题回退的 Hana 风格 React UI 组件库（controls.tsx、layout.tsx、theme.tsx、classnames.ts、styles.css） | react >=19（peer） |

所有包通过 `tsc -p tsconfig.json` 私有构建，TS 路径别名 `@hana/plugin-*`。

---

### 4.3 skills2set/ — 内置技能包

**定位**: Claude Code / AgentSkills 兼容的技能定义，出厂预装的 Agent 能力。

| 技能 | 说明 |
|------|------|
| `character-creator/` | Agent 角色/人格定义（含反套话指南） |
| `hana-plugin-creator/` | 一键创建 Hana 插件（含 Python 脚本和 SDK tarball 资源） |
| `quiet-musing/` | 安静反思/思考技能 |
| `skill-creator/` | 通用 Skill 创建工具（修改自 Anthropic 版，含 Python 脚本、评估查看器） |
| `user-guide/` | 用户指南技能 |

---

### 4.4 examples/ — 插件开发示例

| 路径 | 说明 |
|------|------|
| `plugins/sdk-showcase/` | SDK 功能展示插件（manifest.json、index.js、routes/、tools/、ui/） |

---

## 5. 开发工作流

### 5.1 speculo/ — Speculo 框架

**定位**: Speculo 元框架，提供结构化的 Agent 驱动开发工作流（SpecDev）。

| 路径 | 说明 |
|------|------|
| `config.json` | 项目配置（语言 zh-CN，外部写入前需确认） |
| `.speculo/workspace.json` | 工作区根路径别名 |
| `commands/` | 5 个命令：`archive-and-consolidate`、`docs-sync`、`handoff`、`retro`、`status` |
| `skills/` | 6 个技能：`agents-md-builder`、`archive-and-consolidate`、`docs-sync`、`github-npm-ops`、`speculo-retro`、`writing-great-skills` |
| `workflows/specdev/` | **SpecDev 工作流** — 完整 SDLC 阶段：I-init-setup、S-spec、P-goal-plan、T-tickets、I-implement、D-diagnose-bugs、G-grill-with-docs、W-wayfinder、A-archive-and-consolidate、T-triage、INDEX.md |

---

### 5.2 scripts/ — 构建与工具脚本

**规模**: 55+ 个脚本文件

#### 构建与打包

| 脚本 | 说明 |
|------|------|
| `build-server.mjs` / `build-server-open.mjs` | 生产环境 Server 打包（完整版 / 开源版） |
| `build-server-phases.mjs` / `build-server-deps.mjs` / `build-server-prune.mjs` | 多阶段 Server 构建、依赖分析、精简 |
| `build-server-runtime-assets.mjs` / `build-server-plugin-runtime-deps.mjs` / `build-server-artifact.mjs` | Server 运行时资源、插件依赖、发布归档 |
| `build-shell.mjs` | Electron Shell/安装器资源构建 |
| `build-computer-use-helper.mjs` / `build-windows-sandbox-helper.mjs` | 原生辅助程序构建 |
| `build-standalone-server-artifact.mjs` | 独立 Server 包创建 |
| `compute-cli-closure.mjs` | 开源运行时闭包计算 |
| `pack-renderer-box.mjs` | 渲染端资源打包 |

#### 启动与开发

| 脚本 | 说明 |
|------|------|
| `launch.js` | 通用启动器（CLI / Server / Electron 模式） |
| `dev-web.js` / `dev-web-runtime.js` | Web 开发服务器 |
| `dev-env.js` | 开发环境变量 |

#### 代码签名与公证

| 脚本 | 说明 |
|------|------|
| `notarize.cjs` | macOS 公证（electron-builder afterSign 钩子） |
| `sign-local.cjs` | 本地开发构建签名 |
| `artifact-sign.mjs` / `artifact-keygen.mjs` | 构件签名逻辑和密钥生成 |
| `verify-seed-kit.mjs` / `verify-standalone-server-artifact.mjs` | Seed 归档和独立 Server 包验证 |

#### 发布与分发

| 脚本 | 说明 |
|------|------|
| `generate-release-digest.mjs` / `validate-release-digest.mjs` / `release-digest-schema.mjs` | 发布摘要生成、验证、Schema |
| `publish-train.mjs` | 发布训练编排 |
| `mirror-release-to-atomgit.mjs` / `merge-latest-mac-yml.cjs` / `merge-audit.mjs` | 镜像发布、macOS 更新合并、审计合并 |

#### 平台辅助

| 脚本 | 说明 |
|------|------|
| `generate-windows-icon.cjs` | Windows .ico 图标生成 |
| `download-mingit.js` / `smoke-mingit.mjs` / `mingit-runtime.js` | MinGit 下载、冒烟测试、路径解析 |
| `smoke-windows-sandbox-helper.mjs` / `ensure-windows-sandbox-helper.mjs` / `diagnose-win32-powershell.mjs` | Windows 沙盒辅助程序管理 |

#### 国际化

| 脚本 | 说明 |
|------|------|
| `sync-locale-parity.mjs` | 翻译键同步 |
| `i18n-backfill-zh.json` / `i18n-backfill-ja.json` / `i18n-backfill-ko.json` | 中/日/韩文翻译回填 |

#### 持久化与数据库

| 脚本 | 说明 |
|------|------|
| `generate-persistence-schema-fingerprint.mjs` | 持久化 Schema 指纹生成 |
| `scan-persistent-stores.mjs` | 持久化存储扫描 |
| `session-manifest-audit.mjs` / `session-manifest-rollback.mjs` / `session-path-identity-audit.mjs` | 会话清单审计/回滚/路径身份审计 |

#### 其他工具

| 脚本 | 说明 |
|------|------|
| `fix-modules.cjs` | electron-builder afterPack 钩子 — 修复模块路径 |
| `patch-pi-sdk.cjs` | PI SDK postinstall 补丁 |
| `export-open-tree.mjs` / `rehearse-open-export.mjs` / `lint-open-boundary.mjs` | 开源导出 |
| `smoke-open-server.mjs` | 开源 Server 冒烟测试 |
| `splash-assets.mjs` | Splash 资源复制 |
| `gen-provider-icons.mjs` / `sync-known-models-from-pi.mjs` | Provider 图标和模型同步 |
| `style-discipline.mjs` | CSS/样式纪律检查 |
| `test-inventory.mjs` | 测试文件清单 |
| `generate-screenshot-previews.cjs` | 截图预览生成 |

---

### 5.3 build/ — 构建配置产物

| 文件 | 说明 |
|------|------|
| `installer.nsh` | Windows NSIS 安装器自定义钩子（534 行）— 进程停止、安装完整性验证、清理 |
| `cli-runtime-closure.json` | CLI 运行时闭包分析 |
| `open-boundary-baseline.json` | 开源边界基线 |
| `persistence-schema-fingerprint.json` | 数据库 Schema 指纹 |
| `persistence-startup-receipt.json` | 持久化启动回执 |
| `persistence-store-inventory.json` | 持久化存储清单 |
| `server-macho-entitlements.plist` | macOS Server 可执行文件权限 |
| `shell-surface-manifest.json` | Shell 表面清单 |

---

### 5.4 tests/ — 测试套件

**规模**: 430+ 个 Vitest 测试文件

**测试覆盖范围**：
- Agent 生命周期、session 协调器、bridge 会话
- Provider 注册表、模型同步、LLM 客户端兼容性
- 插件管理器、插件 SDK、插件路由
- 频道路由器、DM 路由器、Telegram/飞书/钉钉/微信适配器
- MCP 运行时、资源 I/O、沙盒策略
- 构建脚本验证、CI 工作流守卫、发布摘要 Schema
- 桌面启动诊断、自动更新器、GPU 启动策略
- 数据纪元/检查点、迁移、持久化存储
- Computer Use 工具、浏览器工具、终端工具
- 记忆编译、日记编写、工作流编排

#### 子目录

| 子目录 | 说明 |
|--------|------|
| `tests/manual/` | 手动/冒烟测试（Windows 打包冒烟测试） |
| `tests/provider-compat/` | Provider 兼容性测试（14 个文件：deepseek、kimi、qwen、mimo、zhipu、volcengine、agnes、openai-input-audio 等） |
| `tests/slash-commands/` | 斜杠命令测试（8 个文件：bridge-commands、rc-router、rc-state、session-ops 等） |

---

## 6. CI/CD 与项目配置

### 6.1 .github/ — GitHub 配置

#### 品牌资源 (`assets/`)

| 文件 | 说明 |
|------|------|
| `banner.jpg` | 仓库 README 横幅 |
| `HanaAgent-280.png` | 280×280 应用图标 |
| `screenshot-main.jpg` | 主界面截图 |

#### Issue 模板 (`ISSUE_TEMPLATE/`)

| 文件 | 说明 |
|------|------|
| `bug_report.md` | Bug 报告模板 |
| `feature_request.md` | 功能请求模板 |

#### CI/CD 工作流 (`workflows/`)

| 文件 | 说明 |
|------|------|
| `build.yml` (29KB) | **主构建流水线** — 跨 4 并行 job 构建所有平台安装程序（macOS arm64/x64、Windows x64、Linux x64），发布到 GitHub Releases、发布更新列车清单、镜像到 AtomGit |
| `ci.yml` | **持续集成** — PR/推送到 main：类型检查、lint、测试、Windows 独立包构建、开放组合冒烟测试 |
| `close-prs.yml` | 自动关闭 PR（项目目前仅接受 Issue） |
| `mirror-release-to-atomgit.yml` | 镜像发布到 AtomGit（加速中国区访问） |
| `publish-train.yml` | 发布训练流水线（手动触发，用于发布/重试更新列车） |

---

### 6.2 TypeScript 配置

| 文件 | 用途 | 严格模式 | JSX |
|------|------|---------|-----|
| `tsconfig.base.json` | 共享基线：ES2022、ESNext 模块、bundler 解析、noEmit | ✅ | — |
| `tsconfig.json` | 桌面渲染端 + packages | ✅ (继承) | react-jsx |
| `tsconfig.node.json` | Node 端代码（core/lib/server/hub/cli/plugins） | ❌ | — |
| `tsconfig.test.json` | 测试文件 | ❌ | react-jsx |

**路径别名**（在 tsconfig.json、vite.config.ts、vitest.config.js 中一致定义）：
- `@hana/plugin-protocol` → `packages/plugin-protocol/src/index.ts`
- `@hana/plugin-sdk` → `packages/plugin-sdk/src/index.ts`
- `@hana/plugin-runtime` → `packages/plugin-runtime/src/index.ts`
- `@hana/plugin-components` → `packages/plugin-components/src/index.ts`
- `@/*` → `desktop/src/react/*`

---

### 6.3 Vite 构建配置

使用 **7 个独立 Vite 配置文件**：
| 文件 | 构建目标 | 输出 | 格式 | 目标 |
|------|---------|------|------|------|
| `vite.config.main.js` | `desktop/main.cjs` | `desktop/main.bundle.cjs` | CJS | node24 |
| `vite.config.preload.js` | `desktop/preload.cjs` | `desktop/preload.bundle.cjs` | CJS | node24 |
| `vite.config.ts` | 渲染端 React 应用（主配置） | `desktop/dist-renderer/` | ESM + 多入口 | 浏览器 |
| `vite.config.splash.ts` | 启动页独立构建 | `desktop/dist-splash/` | ESM | 浏览器 |
| `vite.config.theme.js` | 主题运行时 | `desktop/dist-renderer/lib/theme.js` | IIFE | 浏览器 |
| `vite.config.server.js` | Hono 服务器打包 | `dist-server-bundle/` | ESM | node24 |

CSP 策略在 `vite.csp-profiles.ts` 中集中定义，覆盖 6 个 HTML 入口，开发模式自动放宽以支持 HMR。

---

### 6.4 代码规范与安全

**ESLint** (`eslint.config.js`):
- `@eslint/js` 推荐 + `typescript-eslint` 推荐
- `react-hooks/rules-of-hooks` 报 error，`exhaustive-deps` 报 warn
- 禁止 React 组件中 `document.createElement`（应使用 JSX）
- 禁止在 core/lib/hub/server 中直接导入 `@mariozechner/*` / `@earendil-works/*`（必须通过 `lib/pi-sdk/index.js` 适配器）
- 禁止在 server routes 中访问 `engine._*` 私有属性

**npm 供应链防护** (`.npmrc`):
- `save-exact=true` — 精确版本锁定
- `min-release-age=1` — 延迟 1 天安装新版本
- `package-lock=true`、`audit=true`

**安全策略** (`SECURITY.md`):
- 72 小时响应时间
- 范围：沙盒逃逸、凭证泄露、RCE、Electron 渲染器 XSS

---

## 7. 架构总览

```
                         ┌─────────────────────┐
                         │     desktop/         │  Electron 42 桌面应用
                         │  (Main + React UI)   │
                         └──────────┬──────────┘
                                    │ IPC + HTTP
                    ┌───────────────┼───────────────┐
                    │               │               │
               ┌────▼────┐    ┌────▼────┐    ┌────▼────┐
               │  cli/   │    │ server/ │    │  hub/   │  交付接口层
               │ (终端)  │    │ (Hono)  │    │ (调度)  │
               └────┬────┘    └────┬────┘    └────┬────┘
                    │               │               │
                    └───────────────┼───────────────┘
                                    │
                             ┌──────▼──────┐
                             │    core/    │         引擎编排层
                             │ (HanaEngine)│
                             └──────┬──────┘
                                    │
                    ┌───────────────┼───────────────┐
                    │               │               │
               ┌────▼────┐    ┌────▼────┐    ┌────▼────┐
               │  lib/   │    │ shared/ │    │plugins/ │  库与共享层
               │ (功能库)│    │ (共享)  │    │ (插件)  │
               └─────────┘    └─────────┘    └─────────┘
```

**分层说明**：

1. **桌面层** (`desktop/`) — Electron 主进程 + React 19 渲染端，多窗口（主界面、设置、快速聊天、引导、Splash、移动端 PWA、浏览器查看器），含 macOS Swift 和 Windows C++ 原生辅助
2. **交付接口层** — `cli/`（终端访问）、`server/`（Hono HTTP + WebSocket API，42 个路由模块）、`hub/`（多 Agent 消息调度中心）
3. **引擎编排层** (`core/`) — 组合 15+ 管理器：Agent、Session、Model、Provider、Plugin、Config、Channel、Bridge、Skill、Media、Computer-Use 等
4. **库与共享层** — `lib/`（100+ 功能模块）、`shared/`（跨层类型和工具）、`plugins/`（5 个内置系统插件）
5. **扩展生态** — `packages/`（社区插件 SDK）、`skills2set/`（内置技能包）、`examples/`（插件示例）
6. **开发框架** — `speculo/`（SpecDev 工作流）、`scripts/`（55+ 脚本）、`tests/`（430+ 测试）

**关键架构特性**：
- **双 Artifact 管线**：启动页独立构建；渲染端和服务器均作为签名 Artifact 通过 OTA 热更新交付
- **开放/闭合组合**：`server/main-open.ts`（仅开源路由）和 `server/main-full.ts`（完整路由），有严格导入边界检查
- **PI SDK 适配器层** (`lib/pi-sdk/`)：所有对 PI AI 框架的导入必须经过此层（ESLint 强制）
- **多平台沙盒**：macOS Seatbelt、Linux Bubblewrap、Windows Restricted Token
- **高斯衰减记忆系统**：日频率、命中奖励、编译阈值可配置

---

## 8. 关键入口点

| 入口 | 文件 | 说明 |
|------|------|------|
| Electron 主进程 | `desktop/bootstrap.cjs` → `desktop/main.cjs` | 桌面应用启动 |
| Electron 预加载 | `desktop/preload.cjs` | 渲染进程桥接 |
| React 渲染端 | `desktop/src/main.tsx` | React 应用挂载 |
| HTTP Server | `server/index.ts` | HTTP + WebSocket API |
| CLI | `cli/entry.ts` | `hana` 命令 |
| 引擎核心 | `core/engine.ts` | HanaEngine 门面 |
| 消息调度 | `hub/index.ts` | Hub 消息调度中心 |
| 项目入口 | `index.js` | → `cli/entry.ts` 的 `main()` |

---

## 9. 不存在但可能被期待的目录

| 目录 | 说明 |
|------|------|
| `src/` | **不存在** — 项目使用顶层多目录布局，无统一 `src/` 目录 |
| `src/main/` | **不存在** — Electron 主进程为 `desktop/main.cjs` |
| `src/renderer/` | **不存在** — React 渲染端为 `desktop/src/` |
| `src/preload/` | **不存在** — 预加载脚本为 `desktop/preload.cjs` |
| `apps/` | **不存在** — 非多应用 Monorepo，交付目标为同级目录 |
| `libs/` 或 `libraries/` | **不存在** — 功能库为 `lib/` |
| `extensions/`（顶层） | **不存在** — 扩展在 `lib/extensions/` |
| `tools/`（顶层） | **不存在** — Agent 工具在 `lib/tools/` |
| `e2e/` 或 `integration/` | **不存在** — 端到端测试作为手动冒烟测试 |
| `config/` | **不存在** — 配置分散在 `shared/config-schema.ts`、`speculo/config.json`、`lib/config.example.yaml` |
| `patches/` | **不存在** — 补丁通过 `scripts/patch-pi-sdk.cjs` 在 postinstall 时应用 |
| `assets/`（根级别） | **不存在** — 资源分布在 `.github/assets/` 和 `desktop/src/assets/` |
| `resources/`（根级别） | **不存在** |
| `.claude/` | **不存在（已忽略）** — 由 Claude Code 在运行时创建，被 `.gitignore` 排除 |
| `.env` / `.env.*` | **不存在（已忽略）** — 被 `.gitignore` 排除 |
| `.vscode/` | **不存在** — 无共享 VSCode 工作区配置 |
| `node_modules/` | **不存在（未安装）** — 当前工作副本未安装依赖 |
| `Dockerfile` / `docker-compose.yml` | **不存在** — 无容器化支持 |
| `Makefile` / `CMakeLists.txt` | **不存在** — 无传统构建系统（原生辅助程序使用 Swift Package 和直接 C++ 编译） |

---

> 本文档由 Claude Code 自动生成，基于对项目目录结构的全面探查。如需更新，请重新运行探查流程。
