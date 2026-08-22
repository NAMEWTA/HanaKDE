---
schema_version: 3
artifact: ticket
change: 2026-08-12-openhanako-v0-446-6-platform-gates
id: T-27
title: 加固运行时依赖完整性与启动恢复
status: done
planning_depth: deep
planning_depth_reason: "变更跨 npm 安装/开发 launcher、共享依赖校验、Desktop 启动错误分类、用户确认的 artifact 修复与五语本地化，并直接解除双平台发布阻断。"
ready: true
risk: critical
blocked_by: []
contract_ids: [AC-029, AC-030, AC-031]
owner: startup-integrity-owner
expected_changes: ["<Path>package.json</Path>", "<Path>shared/runtime-dependency-integrity.cjs</Path>", "<Path>scripts/verify-runtime-dependencies.mjs</Path>", "<Path>scripts/build-server-deps.mjs</Path>", "<Path>scripts/build-server-plugin-runtime-deps.mjs</Path>", "<Path>scripts/patch-pi-sdk.cjs</Path>", "<Path>scripts/launch.js</Path>", "<Path>desktop/main.cjs</Path>", "<Path>desktop/src/shared/server-readiness.cjs</Path>", "<Path>desktop/src/shared/optional-json.cjs</Path>", "<Path>desktop/src/locales/*.json</Path>", "<Path>tests/*runtime-dependency*.test.ts</Path>", "<Path>tests/build-server-plugin-runtime-deps.test.ts</Path>", "<Path>tests/server-readiness.test.ts</Path>", "<Path>tests/artifact-repair.test.ts</Path>", "<Path>tests/startup-contract.test.ts</Path>", "<Path>tests/i18n-locale-parity.test.ts</Path>"]
writable_paths: ["<Path>package.json</Path>", "<Path>shared/runtime-dependency-integrity.cjs</Path>", "<Path>scripts/verify-runtime-dependencies.mjs</Path>", "<Path>scripts/build-server-deps.mjs</Path>", "<Path>scripts/build-server-plugin-runtime-deps.mjs</Path>", "<Path>scripts/patch-pi-sdk.cjs</Path>", "<Path>scripts/launch.js</Path>", "<Path>desktop/main.cjs</Path>", "<Path>desktop/src/shared/server-readiness.cjs</Path>", "<Path>desktop/src/shared/optional-json.cjs</Path>", "<Path>desktop/src/locales/*.json</Path>", "<Path>tests/build-server-deps.test.ts</Path>", "<Path>tests/build-server-plugin-runtime-deps.test.ts</Path>", "<Path>tests/runtime-dependency-integrity.test.ts</Path>", "<Path>tests/server-readiness.test.ts</Path>", "<Path>tests/artifact-repair.test.ts</Path>", "<Path>tests/optional-json.test.ts</Path>", "<Path>tests/startup-contract.test.ts</Path>", "<Path>tests/i18n-locale-parity.test.ts</Path>"]
read_only_paths: ["<Path>package-lock.json</Path>", "<Path>server/**</Path>", "<Path>desktop/src/shared/artifact-repair.cjs</Path>", "<Path>scripts/platform/**</Path>", "<Path>tests/platform/**</Path>"]
shared_paths: ["<Path>package.json</Path>", "<Path>shared/runtime-dependency-integrity.cjs</Path>", "<Path>scripts/build-server-deps.mjs</Path>", "<Path>desktop/main.cjs</Path>", "<Path>desktop/src/shared/server-readiness.cjs</Path>"]
shared_path_owners: ["<Path>package.json</Path> => startup-integrity-owner", "<Path>shared/runtime-dependency-integrity.cjs</Path> => startup-integrity-owner", "<Path>scripts/build-server-deps.mjs</Path> => startup-integrity-owner", "<Path>desktop/main.cjs</Path> => startup-integrity-owner", "<Path>desktop/src/shared/server-readiness.cjs</Path> => startup-integrity-owner"]
---

# Ticket T-27: 加固运行时依赖完整性与启动恢复

- **Ticket 文件：** `<Path>{roots.state}/specdev/changes/{change}/ticket/27-runtime-dependency-startup-hardening.md</Path>`
- **总体 Map：** `<Path>{roots.state}/specdev/changes/{change}/tickets-map.md</Path>`
- **上游 Spec：** `<Path>{roots.state}/specdev/changes/{change}/spec.md</Path>`
- **完成 Evidence：** `<Path>{roots.state}/specdev/changes/{change}/evidence/T-27.md</Path>`

## 1. 战略与来源

- **目标：** 把“运行时包内容完整”提升为 postinstall、开发入口和 packaged startup 的显式合同，并按运行模式提供准确恢复路径。
- **可观察产出：** 残缺根依赖在构建前快速失败并指导 `volta run npm ci`；完整依赖照常启动；打包组件持续缺失时可经用户确认修复重启；首次可选偏好缺失无错误噪声。
- **来源：** `US-013`—`US-015`、`AC-029`—`AC-031`、`ADR-002`—`ADR-004`、`DIAG-001`。
- **当前事实：** `<Path>scripts/build-server-deps.mjs</Path>` 已有 root entrypoint verifier 和 errno 测试，但只用于 build output 且忽略 export subpaths；`postinstall` 只运行 Pi marker verifier；`desktop/main.cjs` 对 source 与 packaged 模块缺失使用同一重试和自动更新文案；artifact repair 已安全存在。
- **Planning Depth 原因：** 这是跨安装、构建、Desktop 生命周期和用户恢复的共享启动核心路径；错误分类或修复边界错误会阻断所有开发/发布入口或触碰组件状态。

## 2. 决策状态

### 已锁定决策

- 将纯校验 primitive 放在 `<Path>shared/runtime-dependency-integrity.cjs</Path>`，供 ESM build/verify scripts 和 CJS Desktop readiness 共用；不复制两套 export 解析规则。
- shared verifier 暴露 `root-only` 与 `all-exact` scope。existing `<Path>scripts/build-server-deps.mjs</Path>` wrapper 默认保持 root-only，尤其 NFT prune 后不得要求未使用 subpath；根开发 verifier 显式使用 all-exact。
- all-exact runtime targets 包含 `exports` 中精确、非通配 subpath 下除 `types` 外的静态字符串 target；目标去重。无 `exports` 时按 `module`/`main` 现有回退校验。wildcard key/target 和动态映射不静态展开。
- 根 verifier 从 `<Path>package.json</Path>` 读取全部 production dependencies，校验入口后真实 import `@earendil-works/pi-ai`；不得硬编码只检查 typebox。
- `verify:runtime-deps` 接入 postinstall，并位于 `start`、`start:dev`、`start:vite` 的第一步；`scripts/launch.js` 对 `electron`、`electron-dev`、`electron-vite`、`cli`、`server` spawn 前也执行，允许重复只读检查以覆盖直接 launcher 调用。
- 开发失败使用 `HANA_DEPENDENCY_INTEGRITY`/`DEV_DEPENDENCY_INCOMPLETE`，零 Server retry，明确输出 `volta run npm ci`；不得自动执行依赖命令。
- packaged failure 使用 `PACKAGED_COMPONENT_INCOMPLETE`，仅 packaged artifact context 可触发一次 2 秒退避和“修复并重启/退出”交互。
- `startServer()` 只负责按 context 重试、分类并抛出带 cause 的错误；`app.whenReady()` 外层 catch 在通用 `showErrorBox` 之前识别 `PACKAGED_COMPONENT_INCOMPLETE`，写入现有启动诊断后运行异步确认/修复流程，避免在 spawn loop 中清理 artifact。
- 用户确认后复用 `<Path>desktop/src/shared/artifact-repair.cjs</Path>`；`failed.length === 0` 才 relaunch，取消或失败均记录并退出。
- Desktop 可选 JSON 读取抽到 `<Path>desktop/src/shared/optional-json.cjs</Path>`：ENOENT 静默，其他错误经注入 logger 脱敏记录。

### 已采用的低影响假设

- verifier 正常路径耗时以当前生产依赖数量可接受；若实测明显影响启动，只能在保持同一早期门禁和直接 launcher 覆盖的前提下优化缓存，不能删除门禁。
- locale 保持现有 zh、zh-TW、en、ja、ko 五语 key parity；具体自然语言措辞遵循相邻文案风格。

### 未决问题

无。

## 3. 范围边界

| IN（本 Ticket 构建） | REUSE（复用且不改变契约） | OUT（明确不做） |
|---|---|---|
| shared runtime export verifier、root verify command、npm/launcher preflight、Desktop mode classification、packaged repair dialog、optional JSON、locale/test coverage | existing Pi marker verifier、artifact repair 白名单、artifact boot/seed、crash log/redaction、existing build-server verification | 依赖升级、lock 改写、自动 npm 修复、新 artifact protocol、平台 harness、签名/发布、真实用户数据 |

## 4. 要构建什么

开发者在任何源码入口启动时，系统先检查生产依赖声明的实际运行时入口并 smoke import Pi AI；残缺安装直接指出损坏目标和唯一恢复命令，不再完成 helper/renderer 构建后由 Server 崩溃。完整安装继续启动。已打包用户若组件在 readiness 或 import 阶段持续缺失，先经历一次有限退避，再看到与 npm 无关的组件损坏交互；确认后只重置 artifact 白名单并从签名 seed 正常恢复。新 Profile 没有偏好文件时安静使用默认值。

## 5. 实现契约

- **入口或接缝：** `verify:runtime-deps` npm script、`scripts/launch.js` spawn boundary、`startServer`/`server-readiness.cjs`、Desktop launch failure dialog、optional JSON helper。
- **输入与输出：** package root + production dependency names → `{packageName, exportKey, target, resolvedPath}` failures 或成功；Server stderr + packaged context → retry/dev-fail/packaged-fail；artifact repair → removed/failed；JSON read → parsed value/fallback + optional error log。
- **公共接口变化：** 仅内部 npm script 与内部错误 code；不改变 HTTP、IPC、数据 schema 或公开 CLI 参数。
- **不变量：** 根开发 all-exact 的 runtime target 缺失必失败；packaged build root-only 现有语义不扩张；types/wildcard 不误报；EMFILE/ENFILE 不降级为缺文件；开发态零重试且不改依赖；packaged 最多一次退避；修复需确认且不触碰用户数据；非 ENOENT 可观察。
- **状态或数据流：** install/launcher preflight → healthy spawn 或 integrity fail；packaged spawn → module failure → one retry → `startServer()` 抛 persistent component error → outer startup catch 记录诊断并 confirm → repair success relaunch / cancel-or-failure quit。
- **错误与失败行为：** verifier 非零退出包含稳定 code、package/target 和恢复命令；Desktop friendly error 保留 cause/diagnostic；repair 部分失败不得 relaunch；locale 缺 key 由 parity test 阻断。
- **兼容要求：** 保持 Node 24.16.0、现有依赖版本、package-lock、完整安装启动行为和 artifact seed/receipt/quarantine 语义。
- **安全与隐私要求：** 不执行自动依赖写入；repair 固定白名单；日志通过既有 redaction；错误对话框不暴露敏感路径，优先显示 package 与相对 target。

## 6. 执行路线

1. 在完整/残缺 package fixture 上先补红灯测试：root-only/all-exact、精确 subpath、wildcard/types、去重、main/module fallback、NFT-pruned root-only compatibility 和 errno 区分；抽取 shared CJS verifier，并让现有 build-server wrapper 以 root-only 复用。
2. 新增 root verifier 与 `verify:runtime-deps`，对全部 production dependencies 运行静态入口检查并 import Pi AI；接入 postinstall、start 系列第一步与 launcher spawn boundary，验证残缺安装在 expensive build 前失败。
3. 扩展 server-readiness 的结构化模块分类和 packaged critical entrypoint readiness；保持旧 `isModuleResolutionError` 返回契约，main 按 context 实现 dev 零重试与 packaged 单次退避。
4. 将 persistent packaged failure 接到用户确认 dialog；确认后调用 existing artifact repair，只在完整成功时 relaunch，补齐五语文案和 locale parity。
5. 抽取 optional JSON helper，main 的四类 preference read 统一使用；测试 ENOENT 静默和其他错误脱敏记录。
6. 执行 `volta run npm ci` 恢复当前残缺依赖，运行定向测试、Pi import、postinstall、test/typecheck/lint/build 和 `start:dev` smoke；记录 lockfile 未变、基线失败分类与 Evidence。

## 7. 路径访问契约

- **预计修改点：** 与 frontmatter `expected_changes` 对齐；新增 shared verifier、root verifier、optional JSON helper及对应测试。
- **可写范围：** 仅 frontmatter `writable_paths`；不得写 `<Path>package-lock.json</Path>`、platform harness、Server 业务代码或 artifact repair 白名单实现。
- **只读上下文：** package lock、Server import chain、artifact repair、T-22/T-23 runner。
- **共享路径：** 根 manifest、shared verifier、build verifier 和 Desktop startup/readiness 由 `startup-integrity-owner` 唯一修改。
- **保留或不动：** 依赖版本、artifact format/key/receipt、真实用户数据、现有未跟踪 build artifacts。

## 8. 验证矩阵

| 行为或风险 | 验证接缝 | 命令或步骤 | 预期结果 | Evidence |
|---|---|---|---|---|
| 正常路径 | shared/root verifier + Pi import | Vitest fixtures；`volta run npm run verify:runtime-deps`；直接 import Pi AI | 完整生产依赖全部通过，Pi AI 可导入 | `<Path>{roots.state}/specdev/changes/{change}/evidence/T-27.md</Path>` |
| 失败路径 | 残缺 package/launcher | 删除 fixture 的 root 或 exact subpath target；运行 start contract；以 root-only 校验 NFT-pruned fixture | 开发 all-exact 稳定失败并给恢复命令；packaged root-only 不对未使用 subpath 误报；helper/build/spawn 未执行 | `<Path>{roots.state}/specdev/changes/{change}/evidence/T-27.md</Path>` |
| 模式分类 | server-readiness | dev/packaged stderr fixtures，第一次/第二次 attempt | dev 零重试；packaged 仅一次重试并进入 component error | `<Path>{roots.state}/specdev/changes/{change}/evidence/T-27.md</Path>` |
| E2E（owner：startup-integrity-owner） | Desktop packaged startup | 隔离 HANA_HOME 注入 persistent module failure，选择取消/修复 | 取消退出；确认只清白名单，成功 relaunch；失败不循环 | `<Path>{roots.state}/specdev/changes/{change}/evidence/T-27.md</Path>` |
| 可选配置 | optional JSON helper | ENOENT、invalid JSON、EACCES/注入 I/O error | ENOENT 无 error log；其他失败有脱敏日志并 fallback | `<Path>{roots.state}/specdev/changes/{change}/evidence/T-27.md</Path>` |
| 回归 | repo quality/start smoke | 定向 Vitest；`volta run npm test`、typecheck、lint、build:client、`start:dev` | 无新失败；Server ready；无 preferences ENOENT 噪声 | `<Path>{roots.state}/specdev/changes/{change}/evidence/T-27.md</Path>` |
| E2E disposition | `required`；`current-workspace` / `direct-parent` | 隔离 packaged startup repair flow | 取消、成功修复与失败不循环均可观察 | `<Path>{roots.state}/specdev/changes/{change}/evidence/T-27.md</Path>` |

## 9. 发布、迁移与恢复

- **迁移顺序：** 无数据迁移；先恢复本地依赖，再完成 verifier，随后 Desktop 恢复，最后双平台 Gate。产品不自动执行 `npm ci`。
- **兼容窗口：** 单一新行为立即生效；完整安装无差异，损坏安装从延迟崩溃变为早期失败；旧统一自动更新文案不保留兼容入口。
- **监控信号：** integrity error code/package/target、dev/package classification、retry count、artifact repair removed/failed、relaunch decision、optional JSON non-ENOENT error。
- **回滚或前向恢复：** verifier 误报时以 fixture 修正规则并重跑 package build；若启动接入必须临时回滚，保留 independent verifier、错误分类和数据边界。packaged repair 失败只退出，由现有 `--repair-artifacts` 作为人工恢复入口。
- **不可逆操作与批准点：** 实现开始执行 `volta run npm ci` 会重建根依赖，已由用户的恢复策略确认但必须先记录当前红灯；artifact repair 只能在用户点击确认后运行。commit/merge/push/release 未授权。
- **收缩条件：** 旧“所有 ERR_MODULE_NOT_FOUND 都是自动更新竞态”的分支和文案调用点为零；所有启动入口受 verifier 或稳定 fallback 分类覆盖；五语 locale parity 通过。

## 10. 验收标准

- [x] `AC-029`：残缺精确 runtime entrypoint 在 postinstall/launcher 的早期门禁失败，完整依赖和 Pi import 通过，恢复命令准确。
- [x] `AC-030`：packaged 持久缺失只有一次退避；用户确认修复成功才 relaunch，取消/失败不循环且用户数据不受影响。
- [x] `AC-031`：optional preferences ENOENT 静默，其他读取失败保持脱敏可观察。
- [x] Node/Pi/typebox 版本和 `<Path>package-lock.json</Path>` 无变化，全部修改在授权路径内。
- [x] 验证矩阵和基线失败分类完整记录到 `<Path>{roots.state}/specdev/changes/{change}/evidence/T-27.md</Path>`。
- [x] Ticket、Tickets Map、Goal Plan 与 Evidence 状态一致，无未批准偏差。
