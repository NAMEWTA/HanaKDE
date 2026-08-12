# Handoff: local run and platform gates

## 当前上下文

本次会话在 HanaKDE `hanakde` 分支上继续。此前的 integration 分支已经合并回当前分支，最新提交为 `af658cbe`，父提交包含最终 macOS direct-flow 文档固定点 `b7f35c1b`。

用户最近在本地启动项目时遇到两个依赖安装问题：

- `diff@8.0.4` 已声明在 `package.json` 与 `package-lock.json`，但旧的 `node_modules` 中缺失；重新安装后 `npm ls diff --depth=0` 已显示 `diff@8.0.4`，`build:renderer` 已成功。
- Electron `42.3.0` 的 postinstall 曾留下不完整目录，缺少 `node_modules/electron/path.txt`。在本机补跑 Electron 安装脚本后，Electron 应用包已完整解压（约 287 MB），`node_modules/electron/path.txt` 存在，Electron 自检返回 `v42.3.0`。

之后复跑 `volta run --node 24.16.0 -- npm run start:dev` 已成功经过 preload、renderer、splash、theme 构建；Server 已 ready，Electron 与 Server WebSocket 已连接，并进入首次 Onboarding。日志中的传统 `<script>` Vite warning、chunk warning 和“未配置模型/API key”均不是启动阻塞。用户应在设置中配置模型/API key 后继续完整使用测试。

## 权威状态

- 分支：`hanakde`
- HEAD：`af658cbe`
- 产品代码：当前已合并结果；没有因本次诊断产生的 tracked 源码修改。
- 包管理器：npm workspaces，锁文件为 `package-lock.json`；Node 约束为 `>=24.12.0 <25`，推荐 Volta Node `24.16.0`。
- 开发数据目录：`scripts/dev-env.js` 固定为用户目录下的 `~/.hanako-dev`；不要误称外部 `HANA_HOME` 可覆盖开发启动器的默认目录。
- 观察到 Electron/server 进程仍可能由用户终端运行；不要在没有确认归属前终止它们。

## 当前工作树注意事项

`git status` 显示大量 Speculo 管理文件的删除、新增和修改：原 integration change 正在归档，新的后续 change 目录也未提交。它们是当前并发/归档流程内容，不得使用 `git reset`、`git checkout` 或批量删除来清理。

当前后续 change 的主要文件：

- `speculo/.speculo/specdev/changes/2026-08-12-openhanako-v0-446-6-platform-gates/source.md`
- `speculo/.speculo/specdev/changes/2026-08-12-openhanako-v0-446-6-platform-gates/triage.md`
- `speculo/.speculo/specdev/changes/2026-08-12-openhanako-v0-446-6-platform-gates/.status.json`
- `speculo/.speculo/specdev/changes/2026-08-12-openhanako-v0-446-6-platform-gates/goal-plan.md`
- `speculo/.speculo/specdev/changes/2026-08-12-openhanako-v0-446-6-platform-gates/evidence/T-22.md`
- `speculo/.speculo/specdev/changes/2026-08-12-openhanako-v0-446-6-platform-gates/evidence/T-23.md`
- `speculo/.speculo/specdev/changes/2026-08-12-openhanako-v0-446-6-platform-gates/evidence/T-25.md`

## SpecDev 后续工作

后续 change 状态仍为 active，但尚未 ready for execution。阻断项是：

- 真实 Windows runner 尚不可用。
- macOS x64 runtime/DMG、物理 sleep/wake 与自然 event-loss/reconcile、literal kernel descriptor 证据尚未完成。

原 change 的已验证产品工件不要复制；需要引用原 change 的 source、triage、status 和对应 Evidence。当前新 change 的执行入口应遵循 `speculo/workflows/specdev/INDEX.md` 中的 implement/handoff 流程。

## 推荐验证入口

本地开发启动：

```bash
volta run --node 24.16.0 -- npm ci
volta run --node 24.16.0 -- npm run start:dev
```

Web 开发端：

```bash
volta run --node 24.16.0 -- npm run dev:web
```

常规回归：

```bash
volta run --node 24.16.0 -- npm run typecheck
volta run --node 24.16.0 -- npm run lint
volta run --node 24.16.0 -- npm test -- --maxWorkers=1 --reporter=dot
volta run --node 24.16.0 -- npm run test:knowledge:e2e:open -- --workers=1
volta run --node 24.16.0 -- npm run test:knowledge:e2e:full -- --workers=1
volta run --node 24.16.0 -- npm run test:knowledge:e2e:desktop -- --workers=1
```

macOS gate（仅当前 Apple Silicon 本机能力）：

```bash
volta run --node 24.16.0 -- node --experimental-strip-types scripts/platform/macos/run-gate.mjs
```

Windows gate 在本机 macOS 上不能声称通过；真实 Windows、x64 runtime 和硬件 sleep/wake 必须在对应外部 runner 执行。

## 建议 skills

- `orca-cli`：若需要继续管理 Orca worktree、终端或 handoff。
- `officecli`：若继续做 DOCX/XLSX/PPTX 内容与格式验证。

