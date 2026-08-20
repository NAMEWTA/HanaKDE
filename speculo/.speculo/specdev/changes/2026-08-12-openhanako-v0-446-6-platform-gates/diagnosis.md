---
schema_version: 1
artifact: diagnosis
change: 2026-08-12-openhanako-v0-446-6-platform-gates
status: root-cause-confirmed
feedback_loop_ready: true
red_command: "volta run node --input-type=module -e \"await import('@earendil-works/pi-ai')\""
red_evidence: "ERR_MODULE_NOT_FOUND: node_modules/typebox/build/index.mjs"
cleanup_status: clean
updated_at: 2026-08-13T00:03:47+08:00
---

# Diagnosis: Windows 开发启动的运行时依赖目录不完整

- **诊断 ID：** `DIAG-001`

## 1. 现象与影响

在真实 Windows 环境执行 `volta run npm run start:dev` 时，Windows sandbox guardian 能正常拉起 Server，但 `<Path>server/main-full.ts</Path>` 的导入阶段稳定失败：`@earendil-works/pi-ai` 解析 `typebox` 时找不到 `<Path>node_modules/typebox/build/index.mjs</Path>`。Desktop 随后等待 2 秒重试一次，第二次仍失败，并把原因错误描述为自动更新文件落地竞态。

同一次首次启动还反复记录缺少 `preferences.json` 的 `ENOENT`。该文件在新开发 Profile 中本来就是可选文件，此日志不是 Server 崩溃原因。

## 2. 红灯反馈回路

- **命令：** `volta run node --input-type=module -e "await import('@earendil-works/pi-ai')"`
- **至少一次真实输出：** `Error [ERR_MODULE_NOT_FOUND]: Cannot find module '.../node_modules/typebox/build/index.mjs' imported from .../node_modules/@earendil-works/pi-ai/dist/index.js`
- **精确症状断言：** 直接导入 Pi AI 即命中与 Desktop Server 相同的缺失模块，不需要启动 Electron、renderer 或 sandbox helper。
- **耗时：** 约 0.5 秒。
- **确定性/复现率：** 当前损坏安装上 100%。
- **Agent 可运行性：** autonomous。
- **无法建立时已尝试方式和所需输入：** 不适用。

## 3. 最小复现

- **环境与输入：** Windows x64；Volta 固定 Node 24.16.0；根依赖树声明 `@earendil-works/pi-ai@0.80.3` 与 `typebox@1.1.38`。
- **剩余步骤：** 只执行红灯命令；无需用户数据、网络代理、Electron 或打包产物。
- **逐项删除证据：** 去掉 Desktop、server bootstrap、Windows guardian 和 renderer 构建后仍红；直接导入嵌套完整副本的 `typebox` 则成功。
- **最后红灯证据：** 根 `<Path>node_modules/typebox/package.json</Path>` 声明 `.` 导出到 `./build/index.mjs`，但目标文件不存在。
- **捕获物：** 无；命令结果与文件清单记录在本工件。

## 4. 假设与证伪

| 排名 | 假设与预测 | 支持证据 | 单变量实验 | 结果 |
|---|---|---|---|---|
| 1 | 首次 `npm install` 被中断，留下版本元数据正确但文件不完整的根包目录 | 本会话首次安装进程在约 5 秒时被终止；根 `typebox` 文件时间集中在安装开始窗口 | 对比根包、官方 tarball 与嵌套同版本副本 | 确认：根包 239 个文件，官方与嵌套副本均 1383 个文件；根包恰为残缺子集 |
| 2 | `typebox@1.1.38` 上游发布包缺文件 | 缺失路径与 package exports 一致 | `npm pack typebox@1.1.38 --dry-run --json` | 排除：官方包包含 `build/index.mjs` 及 compile/type/value 入口 |
| 3 | package/lock 版本不一致或依赖提升错误 | 缺失发生在提升后的根副本 | `npm ls typebox @earendil-works/pi-ai --all` 并检查 lock integrity | 排除：依赖树有效，所有相关版本与 integrity 一致 |
| 4 | HanaKDE 构建或补丁脚本删除了根包文件 | 仓库包含 server prune 和 Pi SDK 校验逻辑 | 搜索根 `node_modules` 删除路径并运行现有 postinstall verifier | 排除：prune 仅作用于构建输出；postinstall 是只读验证且在损坏状态下错误通过 |
| 5 | 自动更新写盘竞态 | Desktop 文案和重试逻辑如此归因 | 检查 `artifactBootContext` 与重复红灯 | 排除：开发态 context 为 null，不经过 artifact updater；等待和重试不改变文件集合 |

## 5. 已确认根因

- **触发条件：** 根依赖安装在 npm 并发 reify/extract 过程中被中断，随后再次运行普通 `npm install`。
- **失败机制：** 根 `<Path>node_modules/typebox/package.json</Path>` 与 lock 元数据已存在且版本正确，但 1144 个包内文件未落盘。npm 后续增量安装不做逐文件完整性修复，因此保留残缺目录；Pi AI 的运行时根导入立即解析到不存在的 `build/index.mjs`。
- **根因位置：** 安装状态位于 `<Path>node_modules/typebox/**</Path>`；产品漏检位于 `<Path>scripts/patch-pi-sdk.cjs</Path>`、`<Path>scripts/build-server-deps.mjs</Path>` 与 `<Path>desktop/main.cjs</Path>` 的开发启动完整性和错误分类接缝。
- **漏检原因：** 根 postinstall 只检查 Pi SDK 版本和源码 marker；开发启动没有运行时依赖入口门禁；现有打包完整性助手只用于 server 构建输出且仅校验 root export；Desktop 对所有模块解析错误统一采用打包更新竞态解释。
- **为何排除其他候选：** 官方 tarball和嵌套副本完整；依赖版本与 lock 一致；没有项目脚本删除根包；开发态不存在 artifact update 过程。
- **确认实验：** `verifyExternalEntrypoints(process.cwd(), Object.keys(packageJson.dependencies))` 只报告 `typebox` 缺失入口；同版本嵌套副本直接 import 成功。

## 6. 修复契约

- **必须改变：** 在 postinstall 和所有开发入口前验证生产依赖的精确运行时入口，并对 Pi AI 做 import smoke；开发态完整性失败立即给出 `volta run npm ci`，不得启动 Electron 或自动修改依赖；Desktop 按开发态与打包态分类恢复；打包态持久缺模块时经用户确认复用现有组件修复；可选偏好文件缺失不记错误。
- **必须保持：** Node 24.16.0、Pi SDK 0.80.3、typebox 1.1.38 与 lock integrity 不变；NFT-pruned packaged output 的 existing root-only entrypoint 校验语义不被 all-exact 开发门禁扩张；打包 artifact 的签名、receipt、seed、quarantine 与用户数据边界不变；非 ENOENT 的偏好读取错误仍可观察。
- **正确测试 seam：** `<Path>tests/build-server-deps.test.ts</Path>`、`<Path>tests/server-readiness.test.ts</Path>`、`<Path>tests/artifact-repair.test.ts</Path>`、`<Path>tests/startup-contract.test.ts</Path>` 与真实 Windows T-22 runner。
- **回归测试：** 人工构造“package.json 存在但精确 export 文件缺失”的 fixture，修复前现有 postinstall/启动门禁错误通过，修复后必须在 expensive build 前稳定失败；完整 fixture、Pi import、开发启动和打包修复路径保持绿色。
- **OUT：** 升级依赖、增加 npm 自动修复、改写 lockfile、自动清理开发者 `node_modules`、签名/发布、迁移或触碰真实用户数据。
- **风险与回滚：** 入口扫描过宽可能误报通配导出或 type-only 条件；仅检查精确非通配运行时 target，并保留现有 root/main/module 行为。若门禁误报，可回退启动接入但保留独立 verifier 和测试，不得回退错误分类与用户数据边界。
- **推荐下游：** S-spec → T-tickets → P-goal-plan → I-implement。

## 7. 清理

- **原始回路重跑：** 仍为红，作为实现前基线保留；T-27 实现阶段先执行 `volta run npm ci` 恢复本地依赖，再要求该命令与新 verifier 变绿。
- **`[DEBUG-...]` 搜索：** 未添加调试 marker。
- **一次性脚本/原型：** 无；所有探针均为只读 shell/Node 单行命令。
- **未清理项 owner 与删除条件：** 根依赖残缺由 T-27 实现 owner 在开始时使用 `volta run npm ci` 恢复；现有未跟踪 `<Path>dist-sandbox/**</Path>` 与 `<Path>main.obj</Path>` 不属于诊断产物，不得由本 change 自动删除。
