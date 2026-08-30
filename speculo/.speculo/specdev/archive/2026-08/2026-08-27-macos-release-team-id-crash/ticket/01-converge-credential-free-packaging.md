---
schema_version: 3
artifact: ticket
change: 2026-08-27-macos-release-team-id-crash
id: T-01
title: 收敛无证书平台打包边界
status: done
planning_depth: deep
planning_depth_reason: 删除桌面壳和 Server seed 的平台身份双模式，同时必须保留 Apple Silicon 必要 ad-hoc 与内部 artifact 完整性边界
ready: true
risk: high
blocked_by: []
contract_ids: [AC-003, AC-006, AC-007, AC-008]
owner: root
expected_changes: ["<Path>package.json</Path>", "<Path>scripts/build-server-artifact.mjs</Path>", "<Path>tests/build-server-artifact.test.ts</Path>", "<Path>tests/ci-workflow-guards.test.ts</Path>", "<Path>tests/shell-surface-manifest.test.ts</Path>", "<Path>scripts/sign-local.cjs</Path>", "<Path>desktop/entitlements.mac.plist</Path>", "<Path>build/server-macho-entitlements.plist</Path>", "<Path>build/shell-surface-manifest.json</Path>"]
writable_paths: ["<Path>package.json</Path>", "<Path>scripts/build-server-artifact.mjs</Path>", "<Path>tests/build-server-artifact.test.ts</Path>", "<Path>tests/ci-workflow-guards.test.ts</Path>", "<Path>tests/shell-surface-manifest.test.ts</Path>", "<Path>scripts/sign-local.cjs</Path>", "<Path>desktop/entitlements.mac.plist</Path>", "<Path>build/server-macho-entitlements.plist</Path>", "<Path>build/shell-surface-manifest.json</Path>"]
read_only_paths: ["<Path>scripts/artifact-sign.mjs</Path>", "<Path>scripts/artifact-keygen.mjs</Path>", "<Path>scripts/verify-seed-kit.mjs</Path>", "<Path>desktop/src/shared/artifact-boot.cjs</Path>", "<Path>shared/artifact-core/**</Path>"]
shared_paths: []
shared_path_owners: []
---

# Ticket T-01: 收敛无证书平台打包边界

- **Ticket 文件：** `<Path>{roots.state}/specdev/changes/2026-08-27-macos-release-team-id-crash/ticket/01-converge-credential-free-packaging.md</Path>`
- **总体 Map：** `<Path>{roots.state}/specdev/changes/2026-08-27-macos-release-team-id-crash/tickets-map.md</Path>`
- **上游 Spec：** `<Path>{roots.state}/specdev/changes/2026-08-27-macos-release-team-id-crash/spec.md</Path>`
- **完成 Evidence：** `<Path>{roots.state}/specdev/changes/2026-08-27-macos-release-team-id-crash/evidence/T-01.md</Path>`

## 1. 战略与来源

- **目标：** 把应用壳和 seed Mach-O 收敛为不可能读取平台证书的实验打包配置，同时保留内部 artifact 签名。
- **可观察产出：** 本地/CI 构建无需 Apple 或 Windows 发行凭据；macOS 壳首选 true unsigned，seed Mach-O 仅 ad-hoc；仓库不存在本地整包补签或 Developer ID seed 分支。
- **来源：** `AC-003`、`AC-006`、`AC-007`、`AC-008`、`DEC-001`—`DEC-004`、当前 diagnosis。
- **当前事实：** `<Path>package.json</Path>` 启用 hardened runtime/entitlements 并由 `<Path>scripts/sign-local.cjs</Path>` 修补本地 app；`<Path>scripts/build-server-artifact.mjs</Path>` 仍接受 `HANA_MACHO_SIGN_IDENTITY` 和 Developer ID entitlements；内部 manifest 签名是独立边界。
- **Planning Depth 原因：** 同时触及跨平台供应链、安全保护与 Apple Silicon 启动约束，错误收缩会使应用或内置 Node 无法启动。

## 2. 决策状态

### 已锁定决策

- 桌面壳第一候选为 `mac.identity: null` 且 hardened runtime 关闭；不引用桌面 entitlements。
- Developer ID、timestamp、Team ID、公证和 `HANA_MACHO_SIGN_IDENTITY` 全部移除。
- darwin seed Mach-O 固定执行 `codesign --sign - --force`，它是 Apple Silicon 必要运行结构，不是发行身份。
- `HANA_SIGN_KEY`、`HANA_SIGN_KEYSET`、manifest `.sig`、pinned keyset 和 tamper rejection 不修改。
- Windows 的 `CSC_IDENTITY_AUTO_DISCOVERY=false` 作为禁止误发现证书的 guard 保留，不视为签名能力。

### 已采用的低影响假设

- 删除无引用的桌面/server entitlements 与本地补签脚本后，构建表面清单和文档索引同步收缩。

### 未决问题

无。

## 3. 范围边界

| IN（本 Ticket 构建） | REUSE（复用且不改变契约） | OUT（明确不做） |
|---|---|---|
| macOS unsigned 配置、seed ad-hoc-only、删除平台身份分支和补签脚本、静态合同 | artifact keygen/sign/verify、seed smoke、electron-builder | 原始 DMG E2E、Windows 安装 E2E、发布、品牌/数据迁移 |

## 4. 要构建什么

维护者从无平台凭据的 checkout 运行打包时，构建不能搜索、读取或接受 Developer ID/Authenticode 身份。macOS 壳进入 true-unsigned 候选模式，darwin seed 中每个 Mach-O 仍获得无身份 ad-hoc seal 并通过 Node 启动 smoke；内部 seed manifest 继续被签名和验证。任何重新引入平台身份变量、hardened runtime 或桌面 entitlements 的配置都由合同测试拒绝。

## 5. 实现契约

- **入口或接缝：** root electron-builder config、darwin server archive packer、现有 build/CI contract tests。
- **输入与输出：** 输入为无平台凭据环境与目标 platform/arch；输出为无发行身份的 shell 和内部签名 seed。
- **公共接口变化：** 无。
- **不变量：** darwin Mach-O 可启动；内部 manifest verification fail closed；非 darwin seed 不执行 codesign。
- **状态或数据流：** build server -> darwin Mach-O ad-hoc -> startup smoke -> archive/hash -> internal manifest signature -> electron-builder resources。
- **错误与失败行为：** seed Mach-O 签名/启动或内部 signature verification 失败即停止构建；不回退 Developer ID。
- **兼容要求：** 保留 bundle ID、data roots、CLI、plugin/update identity 和旧安装清理。
- **安全与隐私要求：** 禁止删除或绕过内部 artifact 验证；测试不得将平台私钥写入环境或工件。

## 6. 执行路线

1. 先把当前 Developer ID/hardened/local-resign 配置写成会失败的禁止项合同，并固定内部签名允许清单。
2. 将 macOS 壳设为 `identity: null`、关闭 hardened runtime，移除 entitlements 引用和 `sign-local` 调用。
3. 将 server artifact signer 收缩为 ad-hoc-only，删除身份参数、Developer ID 分支与 server entitlements。
4. 删除已无引用的签名脚本/plist，更新 shell surface manifest 和单元测试。
5. 运行 focused tests、typecheck、seed build/verify 和 darwin Node startup smoke，确认内部签名未回归。

## 7. 路径访问契约

- **预计修改点：** 与 frontmatter `expected_changes` 一致；删除项仍属于本 Ticket。
- **可写范围：** 与 frontmatter `writable_paths` 一致。
- **只读上下文：** 内部 artifact 签名和启动验证实现。
- **共享路径：** 无；T-02 被本 Ticket 阻塞，严格串行。
- **保留或不动：** `<Path>shared/artifact-core/**</Path>`、历史 archive、release digest、兼容标识。

## 8. 验证矩阵

| 行为或风险 | 验证接缝 | 命令或步骤 | 预期结果 | Evidence |
|---|---|---|---|---|
| 正常路径 | build config/unit contracts | focused Vitest over build-server/CI/shell tests | identity null、hardened/entitlements/Developer ID 分支不存在，seed ad-hoc 参数固定 | `<Path>{roots.state}/specdev/changes/2026-08-27-macos-release-team-id-crash/evidence/T-01.md</Path>` |
| 失败路径 | artifact tamper tests | artifact/seed focused tests | 缺失/错误 `.sig` 继续被拒绝 | `<Path>{roots.state}/specdev/changes/2026-08-27-macos-release-team-id-crash/evidence/T-01.md</Path>` |
| 回归 | seed build and verify | `npm run build:server` + `npm run verify:seed-kit` with ephemeral internal key | darwin Node startup smoke 和 seed verification 通过，无平台 identity | `<Path>{roots.state}/specdev/changes/2026-08-27-macos-release-team-id-crash/evidence/T-01.md</Path>` |

- **Workspace checks：** current workspace focused tests、typecheck、server build/seed verification。
- **E2E disposition：** not-required：原始 DMG/Windows 安装 E2E 由 T-02 统一执行；本 Ticket 以配置、seed 和进程启动接缝闭环。
- **E2E owner/environment：** Lead / current-workspace，T-02。
- **Integration evidence：** implementation commit、parent before/result SHA、Lead Evidence。

## 9. 发布、迁移与恢复

- **迁移顺序：** 先建立 guard，再删除身份分支，最后删除无引用文件。
- **兼容窗口：** 无；Developer ID 分支直接收缩为零，发布仍需 T-02 Gate。
- **监控信号：** build logs 只允许 `ad-hoc` seed mode 和 internal signature摘要。
- **回滚或前向恢复：** 回滚本 Ticket commit 可恢复旧构建；未通过 T-02 前不得发布。若 true unsigned 不可运行，T-02 只应用已批准的 ad-hoc shell fallback，不恢复 Developer ID。
- **不可逆操作与批准点：** 无远程/发布动作。
- **收缩条件：** repository scan 对平台身份变量、server entitlements 和 sign-local 为零；历史 archive 与传递依赖除外。

## 10. 验收标准

- [x] `AC-003`、`AC-006`、`AC-007`、`AC-008` 全部满足。
- [x] 验证矩阵全部执行并记录到 `<Path>{roots.state}/specdev/changes/2026-08-27-macos-release-team-id-crash/evidence/T-01.md</Path>`。
- [x] 实际项目修改未超出 `writable_paths`。
- [x] Ticket 形成非空 implementation commit，direct-parent 验证通过且父分支 result 已记录。
- [x] T-02 的原始平台 E2E 由后续 `v0.0.7` Build 完整关闭，不以 T-01 静态检查替代。
- [x] 未发生未批准的范围、契约或发布偏差。
- [x] Ticket、Tickets Map 和 Evidence 状态一致。
