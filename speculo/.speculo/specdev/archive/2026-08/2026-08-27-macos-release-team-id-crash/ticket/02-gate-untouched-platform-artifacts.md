---
schema_version: 3
artifact: ticket
change: 2026-08-27-macos-release-team-id-crash
id: T-02
title: 阻断不可启动或带平台身份的原始发行物
status: done
planning_depth: deep
planning_depth_reason: 发布门必须在真实 macOS arm64/x64 和 Windows 安装边界判卷，并安全执行 true-unsigned 到 ad-hoc 的限定回退
ready: true
risk: high
blocked_by: [T-01]
contract_ids: [AC-001, AC-002, AC-004, AC-005, AC-009, AC-010]
owner: root
expected_changes: ["<Path>.github/workflows/build.yml</Path>", "<Path>scripts/platform/macos/run-packaged-direct-flow.mjs</Path>", "<Path>scripts/platform/macos/run-gate.mjs</Path>", "<Path>scripts/platform/windows/run-gate.mjs</Path>", "<Path>tests/platform/macos/macos-packaged-direct-flow.test.ts</Path>", "<Path>tests/platform/macos/macos-gate.test.ts</Path>", "<Path>tests/platform/windows/windows-gate.test.ts</Path>", "<Path>tests/ci-workflow-guards.test.ts</Path>", "<Path>README.md</Path>", "<Path>README_EN.md</Path>", "<Path>docs/index.md</Path>", "<Path>docs/troubleshooting/resource-consistency.md</Path>"]
writable_paths: ["<Path>.github/workflows/build.yml</Path>", "<Path>scripts/platform/macos/run-packaged-direct-flow.mjs</Path>", "<Path>scripts/platform/macos/run-gate.mjs</Path>", "<Path>scripts/platform/windows/run-gate.mjs</Path>", "<Path>tests/platform/macos/macos-packaged-direct-flow.test.ts</Path>", "<Path>tests/platform/macos/macos-gate.test.ts</Path>", "<Path>tests/platform/windows/windows-gate.test.ts</Path>", "<Path>tests/ci-workflow-guards.test.ts</Path>", "<Path>README.md</Path>", "<Path>README_EN.md</Path>", "<Path>docs/index.md</Path>", "<Path>docs/troubleshooting/resource-consistency.md</Path>"]
read_only_paths: ["<Path>package.json</Path>", "<Path>scripts/verify-seed-kit.mjs</Path>", "<Path>scripts/platform/windows/run-packaged-direct-flow.mjs</Path>", "<Path>tests/windows-installer-contract.test.ts</Path>"]
shared_paths: ["<Path>tests/ci-workflow-guards.test.ts</Path>"]
shared_path_owners: ["<Path>tests/ci-workflow-guards.test.ts</Path> => T-02"]
---

# Ticket T-02: 阻断不可启动或带平台身份的原始发行物

- **Ticket 文件：** `<Path>{roots.state}/specdev/changes/2026-08-27-macos-release-team-id-crash/ticket/02-gate-untouched-platform-artifacts.md</Path>`
- **总体 Map：** `<Path>{roots.state}/specdev/changes/2026-08-27-macos-release-team-id-crash/tickets-map.md</Path>`
- **上游 Spec：** `<Path>{roots.state}/specdev/changes/2026-08-27-macos-release-team-id-crash/spec.md</Path>`
- **完成 Evidence：** `<Path>{roots.state}/specdev/changes/2026-08-27-macos-release-team-id-crash/evidence/T-02.md</Path>`

## 1. 战略与来源

- **目标：** 让 Release workflow 只上传已按最终用户路径启动成功的原始 macOS/Windows 产物，并移除会掩盖问题的测试重签能力。
- **可观察产出：** macOS 用户执行 `sudo xattr -rd com.apple.quarantine /Applications/HanaKDE.app` 后可启动；Windows 安装器明确为 NotSigned 且可完成安装/启动；任一平台失败都阻止上传。
- **来源：** `AC-001`、`AC-002`、`AC-004`、`AC-005`、`AC-009`、`AC-010`、`DEC-002`、`DEC-005`。
- **当前事实：** macOS harness 可传 `--adhoc-resign` 并修改 DMG 中复制出的 app，历史 Evidence 因而没有验证原始发布字节；Build job 当前只构建/上传，不运行原始 app；Windows 只依赖“无证书环境”而没有对最终 Authenticode 状态做硬断言。
- **Planning Depth 原因：** 这是跨架构、跨 OS 的发布阻断门，且包含一次受控模式选择和真实安装/启动 E2E。

## 2. 决策状态

### 已锁定决策

- 删除 `--adhoc-resign` 参数、`adhocResignApp` 和测试 receipt 中的补签成功口径。
- macOS Gate 对 DMG 中复制出的 app 记录包内哈希，模拟 quarantine、执行等价的递归清理并原样启动；启动后再次核对包内哈希。
- true unsigned arm64 只有在明确的 executable-signature enforcement 上失败时才允许把 T-01 配置改为 `identity: "-"`；回退后从头重跑 arm64/x64 Gate。
- Windows Gate 必须读取最终 installer/executable 的 Authenticode 状态并要求 `NotSigned`，随后复用真实 packaged direct flow。
- 平台 Gate 全部位于 Release assets upload 之前；内部 seed verification 仍为前置门。

### 已采用的低影响假设

- CI 中对 sandbox copy 使用无 `sudo` 的 `xattr` 与用户在 `/Applications` 使用 `sudo xattr` 语义等价；文档保留用户要求的命令。

### 未决问题

无。

## 3. 范围边界

| IN（本 Ticket 构建） | REUSE（复用且不改变契约） | OUT（明确不做） |
|---|---|---|
| 原样 DMG/Windows Gate、CI 接线、fallback Gate、用户说明和遗留文档收缩 | 现有 packaged direct flow、seed verification、release upload | 新版本发布、用户数据迁移、正式平台签名 |

## 4. 要构建什么

发布维护者触发构建后，每个 macOS 架构都必须从刚生成的 DMG 安装一个临时副本，清除 quarantine 并启动到 `main-loaded`，且整个过程不能调用 `codesign` 或改变包内字节。若 true unsigned 在 arm64 因操作系统要求签名结构失败，维护者应用唯一允许的 ad-hoc 配置并重跑全部 macOS 门。Windows job 对安装器签名状态做硬断言后完成真实安装/启动。只有这些结果和 seed 完整性校验同时为绿，release job 才能下载并上传资产。

## 5. 实现契约

- **入口或接缝：** Build workflow platform jobs、macOS/Windows gate runner、用户安装文档。
- **输入与输出：** 输入为 freshly built DMG/ZIP/NSIS；输出为可上传资产和结构化 gate receipt。
- **公共接口变化：** 无。
- **不变量：** 测试不修改 app bundle 内容；quarantine xattr 可变；HANA_HOME 与安装根位于临时 sandbox；cleanup 停止进程并卸载 DMG。
- **状态或数据流：** build -> seed verify -> platform package -> raw signature/status inspection -> install/copy -> quarantine clear/SmartScreen-equivalent approval -> launch/direct flow -> upload eligibility。
- **错误与失败行为：** Team ID/dyld、invalid signature、missing marker、unexpected Authenticode signer、hash drift 或 cleanup failure 均非零退出并阻断上传。
- **兼容要求：** arm64/x64 DMG/ZIP、Windows NSIS、现有 asset names 和 updater metadata 保持。
- **安全与隐私要求：** 日志不声称 unsigned 包可信；不输出内部 signing key；测试仅操作临时 app/HANA_HOME。

## 6. 执行路线

1. 先修改 harness contract，使现有 `--adhoc-resign` 路径和缺失 raw hash/签名断言变红。
2. 移除补签实现，为 macOS receipt 增加模式、签名摘要、启动前后 hash 与 quarantine flow 证据。
3. 对 T-01 的 true unsigned 产物运行 arm64 Gate；只按锁定条件决定是否切换统一 ad-hoc，并从头验证 arm64/x64。
4. 给 Windows Gate 增加 Authenticode NotSigned 断言并执行 packaged direct flow。
5. 把 macOS/Windows gates 接到 Build workflow 的 upload 前，更新 CI guard tests。
6. 更新中英文安装说明、仓库索引和排障文档，删除临时重签作为发布验证的叙述。
7. 运行 focused/full regression，记录各架构/平台 receipt 与未运行项；不执行 tag/upload。

## 7. 路径访问契约

- **预计修改点：** 与 frontmatter `expected_changes` 一致。
- **可写范围：** 与 frontmatter `writable_paths` 一致。
- **只读上下文：** T-01 最终 package config、seed verifier、Windows direct-flow 和 installer contract。
- **共享路径：** `<Path>tests/ci-workflow-guards.test.ts</Path>` 由 T-02 统一拥有；T-01 不得在完成后继续修改。
- **保留或不动：** release digest 历史、SpecDev archive、内部 artifact crypto、兼容标识。

## 8. 验证矩阵

| 行为或风险 | 验证接缝 | 命令或步骤 | 预期结果 | Evidence |
|---|---|---|---|---|
| 正常路径 | raw macOS packaged flow | 对 fresh arm64/x64 DMG 执行 run-gate direct flow，不传重签参数 | `main-loaded`/health/direct flow 通过，包内 hash 不变 | `<Path>{roots.state}/specdev/changes/2026-08-27-macos-release-team-id-crash/evidence/T-02.md</Path>` |
| 失败路径 | controlled raw-package checks | 对夹具模拟 Team ID/signature/hash drift 或重新暴露 resign option | Gate 失败且 upload step 不可达 | `<Path>{roots.state}/specdev/changes/2026-08-27-macos-release-team-id-crash/evidence/T-02.md</Path>` |
| 正常路径 | Windows installer gate | Authenticode inspection + packaged direct flow | 状态 `NotSigned`，安装/启动/cleanup 通过 | `<Path>{roots.state}/specdev/changes/2026-08-27-macos-release-team-id-crash/evidence/T-02.md</Path>` |
| 回归 | CI/config/full checks | focused platform/CI tests、typecheck、build client/server、seed verify 和适用 full test | 上传前依赖边成立，内部 signature tests 仍绿 | `<Path>{roots.state}/specdev/changes/2026-08-27-macos-release-team-id-crash/evidence/T-02.md</Path>` |
| 文档 | README/doc scan | 检查中英文命令和警告 | 精确说明 `sudo xattr`、SmartScreen、无可信签名和内部边界 | `<Path>{roots.state}/specdev/changes/2026-08-27-macos-release-team-id-crash/evidence/T-02.md</Path>` |

- **Workspace checks：** current workspace focused tests、typecheck、lint/build 和 platform-independent harness contracts。
- **E2E disposition：** required：用户报告正是下载后真实启动失败，必须在 current workspace 对 freshly built 原始包执行。
- **E2E owner/environment：** Lead / current-workspace；真实 macOS arm64、macOS x64/Rosetta、Windows runner。缺失任一 required 环境时 Ticket 保持 blocked，不以静态检查替代。
- **Integration evidence：** implementation commit、parent before/result SHA、raw artifact hashes、platform receipts、Lead Evidence。

## 9. 发布、迁移与恢复

- **迁移顺序：** T-01 配置收缩 -> mac true-unsigned arm64 Gate -> 必要时 ad-hoc fallback -> mac x64 Gate -> Windows Gate -> workflow guard -> 文档。
- **兼容窗口：** 不保留可由测试补签才能运行的旧包；v0.0.6 历史资产不改写。
- **监控信号：** dyld stderr、main-loaded marker、包内 hash、codesign/TeamIdentifier 摘要、Authenticode status、platform receipt、upload dependency graph。
- **回滚或前向恢复：** 任一门失败时不发布并回到 T-01 result；若 true unsigned 失败，只允许锁定的 ad-hoc fallback。已生成的本地产物可删除重建，不涉及用户数据。
- **不可逆操作与批准点：** tag、push、GitHub Release upload 均未授权且不在本 Ticket。
- **收缩条件：** release harness 中 `adhoc-resign`/整包 `codesign` 为零，上传前 raw-platform gates 存在并通过。

## 10. 验收标准

- [x] `AC-001`、`AC-002`、`AC-004`、`AC-005`、`AC-009`、`AC-010` 全部满足。
- [x] 验证矩阵全部执行并记录到 `<Path>{roots.state}/specdev/changes/2026-08-27-macos-release-team-id-crash/evidence/T-02.md</Path>`。
- [x] 实际项目修改未超出 `writable_paths`，shared path 由 T-02 修改。
- [x] Ticket 形成非空 implementation commit，direct-parent 验证通过且父分支 result 已记录。
- [x] required E2E 在真实 macOS arm64、原生 Intel x64 与 Windows runner 完成；原始包 Gate 包含启动 smoke、hash/identity 检查与 Windows 静默安装。
- [x] 未发生未批准的范围、契约或发布偏差。
- [x] Ticket、Tickets Map 和 Evidence 状态一致。
