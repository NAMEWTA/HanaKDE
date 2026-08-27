---
schema_version: 3
artifact: spec
change: 2026-08-27-macos-release-team-id-crash
status: ready
ready_for_tickets: true
sources:
  - DIAGNOSIS:2026-08-27-macos-release-team-id-crash
  - USER-DECISION:2026-08-27-credential-free-platform-distribution
---

# Spec: 实验版无证书跨平台发行

- **Spec：** `<Path>{roots.state}/specdev/changes/2026-08-27-macos-release-team-id-crash/spec.md</Path>`

## 1. 问题与目标

### 问题陈述

当前 macOS v0.0.6 发布包同时使用 ad-hoc 签名与 hardened runtime，主程序和 Electron Framework 无法满足同 Team ID 的 library validation，导致用户即使清除 quarantine 也会在应用代码运行前遭遇 dyld `SIGABRT`。仓库虽然已移除旧 HanaAgent 公证钩子，仍保留本地整包重签脚本、桌面 entitlements，以及 Server seed 的可选 Developer ID 双模式，发行边界没有真正收敛为实验版的无证书策略。

### 目标用户与场景

- macOS 实验用户从 Release 下载 DMG、拖入 Applications，执行指定的 quarantine 清理命令后直接启动 HanaKDE。
- Windows 实验用户下载未 Authenticode 签名的安装器，经 SmartScreen 的“仍要运行”路径安装并启动。
- 发布维护者在没有 Apple/Windows 证书、Team ID、公证凭据或签名密钥的环境中构建发行壳，同时继续使用 HanaKDE 内部 seed/OTA 完整性签名。

### 成功标准

- 未经用户侧或测试侧二次重签的 macOS DMG 原始应用，在清除 quarantine 后越过 dyld 并产生 `main-loaded` 启动标记。
- macOS arm64 与 x64 产物均由真实平台门验证；arm64 首选完全 unsigned，必要时仅采用无身份、无证书、无公证的统一 ad-hoc 兜底。
- Windows 安装器保持无 Authenticode 签名，并通过现有安装/启动 direct flow。
- 仓库不再包含 Developer ID、公证、HanaAgent 平台签名身份或本地整包补签路径；内部 manifest `.sig`、`HANA_SIGN_KEY`、`HANA_SIGN_KEYSET` 和篡改拒绝行为保持不变。

### 非目标

- 不购买、配置或使用 Apple Developer ID、Windows Authenticode 证书或公证服务。
- 不移除 HanaKDE 自身的 seed/OTA 完整性签名。
- 不进行全仓 HanaAgent 品牌字符串清除；兼容标识、旧进程清理、npm 别名和历史工件继续保留。
- 本计划不创建 tag、不上传 Release、不改写已发布的 v0.0.6 资产。

## 2. 解决方案与外部行为

### 解决方案摘要

将系统发行签名与内部完整性签名明确分层。桌面壳先采用 electron-builder 的 `mac.identity: null`、关闭 hardened runtime 并移除桌面签名 entitlements；使用原样 DMG 启动门验证。若且仅若 Apple Silicon 因缺少可执行签名结构而失败，则把桌面壳切换为 `mac.identity: "-"` 的统一 ad-hoc 模式，仍不启用 hardened runtime、Team ID、证书或公证。Server seed 内 Mach-O 固定为 ad-hoc，删除 Developer ID 双模式；内部 seed/OTA 清单签名保持原样。Windows 继续显式禁止证书自动发现，并新增无 Authenticode 产物断言。

### 主要流程

1. 构建系统在无平台证书环境中生成 macOS DMG/ZIP、Windows NSIS 和内部签名 seed。
2. macOS 门从 DMG 复制原始 app，不执行 `codesign` 修复；模拟并清除 quarantine 后直接启动，等待 `main-loaded` 和健康状态。
3. 完全 unsigned 模式若通过则成为最终配置；若仅因 Apple Silicon 可执行签名要求失败，则使用统一 ad-hoc 兜底并重跑同一门。
4. Windows 门断言安装器为 `NotSigned`，再执行安装与启动 direct flow。
5. 只有原始产物门和内部 seed 完整性门全部通过，构建产物才允许进入上传步骤。

### 边界、失败与稳定错误行为

- macOS 原始应用仍出现 Team ID、library validation、invalid signature 或启动前 `SIGABRT` 时，构建失败，不允许通过测试脚本重签制造绿色。
- true unsigned 仅在明确的 Apple Silicon signature enforcement 上失败时才能进入 ad-hoc 兜底；其他失败按真实根因修复，不自动放宽安全边界。
- Windows 产物出现有效 Authenticode signer 或构建读取平台证书变量时，构建失败。
- seed manifest/signature 缺失、密钥不匹配或归档被篡改时，继续 fail closed；不得以“实验版”为由绕过。

### 状态转换与不变量

```text
mac identity=null + hardened runtime off
  ├─ raw arm64/x64 launch pass -> 采用 true unsigned
  └─ arm64 仅因 executable signature requirement fail
       -> mac identity="-" + hardened runtime off
       -> raw arm64/x64 launch pass -> 采用 ad-hoc fallback
       -> fail -> blocked / deviation，不发布
```

- 平台发行凭据始终为空；ad-hoc 不携带 Team ID 或证书身份。
- raw package 在测试开始后保持字节不变，quarantine xattr 的写入/删除不计入包内字节修改。
- 内部 artifact 签名与系统代码签名是不同边界，前者不因本变更降级。

## 3. 用户故事

- **US-001**：作为 macOS 实验用户，我希望只需清除 HanaKDE.app 的 quarantine 即可启动，以便无需开发者证书或本地补签。
- **US-002**：作为 Windows 实验用户，我希望能在确认 SmartScreen 风险后安装并启动未签名版本，以便实验发行不依赖 Authenticode。
- **US-003**：作为发布维护者，我希望仓库只保留无身份的必要 ad-hoc 与内部完整性签名，以便旧 HanaAgent 平台凭据路径不会再次进入构建。
- **US-004**：作为更新链路维护者，我希望 seed/OTA 篡改检测保持 fail closed，以便移除系统发行签名不会顺带移除内部供应链边界。

## 4. 验收合同

| ID | 前置条件 | 动作或事件 | 可观察结果 | 验证接缝 |
|---|---|---|---|---|
| AC-001 | 无 Apple 证书/Team ID/公证凭据的 arm64 DMG | 从 DMG 复制原始 app，设置后执行 `sudo xattr -rd com.apple.quarantine /Applications/HanaKDE.app` 等价清理，再启动 | 应用越过 dyld，产生 `main-loaded`，无 Team ID/library validation 崩溃 | `<Path>scripts/platform/macos/run-packaged-direct-flow.mjs</Path>` |
| AC-002 | 无平台凭据的 x64 DMG | 在真实 macOS/Rosetta 环境执行相同原始产物流程 | x64 应用产生 `main-loaded`，测试未重签 app | `<Path>scripts/platform/macos/run-gate.mjs</Path>` |
| AC-003 | macOS 包配置 | 检查最终选定模式 | 最终为 `identity: null`，或仅在 AC-001 的限定失败下为 `identity: "-"`；两者均关闭 hardened runtime且不引用桌面 entitlements | package contract test +产物签名检查 |
| AC-004 | macOS direct-flow harness | 执行 release gate | harness 不提供 `--adhoc-resign`，启动前后包内文件哈希一致，不能掩盖原始包错误 | macOS harness contract test |
| AC-005 | Windows NSIS 产物 | 检查签名并执行安装/启动 | Authenticode 状态为 `NotSigned`，SmartScreen 绕过后 direct flow 可启动 | Windows gate/direct-flow |
| AC-006 | 跨平台构建配置 | 扫描平台签名入口 | 不存在 Developer ID、公证、`HANA_MACHO_SIGN_IDENTITY`、平台证书 secret 或旧 HanaAgent 平台签名入口；无签名 guard 和必要 ad-hoc 允许存在 | CI/config contract test |
| AC-007 | darwin Server seed | 装箱并启动内置 Node | 所有 Mach-O 仅做无身份 ad-hoc，Node 启动 smoke 通过，不存在 Developer ID/hardened/entitlements 双模式 | `<Path>tests/build-server-artifact.test.ts</Path>` |
| AC-008 | seed/OTA 产物 | 验证正常和篡改夹具 | `HANA_SIGN_KEY`/`HANA_SIGN_KEYSET`、manifest `.sig` 与篡改拒绝测试保持通过 | seed/artifact focused tests |
| AC-009 | Release workflow | 构建各平台并准备上传 | 原始 macOS 与 Windows 门位于上传之前；任一失败都阻止上传 | `<Path>.github/workflows/build.yml</Path>` contract test |
| AC-010 | 用户文档 | 阅读 macOS/Windows 安装说明 | 文档准确说明 unsigned/ad-hoc 实验边界、macOS `sudo xattr` 命令和 Windows SmartScreen 操作，不声称公证或可信签名 | README/document scan |

## 5. 范围

### IN

- macOS electron-builder 身份、hardened runtime、entitlements 与本地补签策略。
- Server seed 中 Developer ID Mach-O 分支的删除和 ad-hoc-only 收敛。
- macOS 原样 DMG 启动门、Windows 未 Authenticode 断言及其 Release workflow 接线。
- 相关测试、构建表面清单、README 和排障文档。

### REUSE

- 现有 macOS/Windows packaged direct-flow、seed kit 校验、内部 artifact keygen/sign/verify 和发布资产上传流程。
- 现有兼容标识 `com.hanako.app`、`HANA_HOME`、`hana`/`hanakde` CLI、旧应用/进程清理与 npm 早期访问别名。

### OUT

- **OOS-001**：不移除 `HANA_SIGN_KEY`、`HANA_SIGN_KEYSET`、pinned keyset、manifest `.sig` 或 OTA verification。
- **OOS-002**：不删除历史 SpecDev archive、release digest 历史或 `package-lock.json` 中 electron-builder 的传递依赖记录。
- **OOS-003**：不迁移 bundle ID、用户数据、插件 ID、更新身份或持久化 schema。
- **OOS-004**：不发布新版本；发布需要后续单独授权和 Release Spec。

## 6. 已锁定实现约束

- **DEC-001**：系统发行层不使用 Apple Developer ID、Team ID、公证、Windows Authenticode 或相应凭据。来源：`USER-DECISION:2026-08-27-credential-free-platform-distribution`。
- **DEC-002**：macOS 首选 true unsigned；只有原始 arm64 门证明操作系统要求签名结构时，才采用无身份 ad-hoc 兜底。来源：同上。
- **DEC-003**：ad-hoc 兜底不重新启用 hardened runtime；任何需要恢复 library-validation entitlement 的路线属于 Spec 偏差。来源：诊断与用户“先以能够运行为目的”的决定。
- **DEC-004**：内部 seed/OTA 完整性签名必须保留并维持 fail closed。来源：用户明确决定。
- **DEC-005**：验收对象必须是未经二次重签的原始发行产物；历史 `--adhoc-resign` 路线从发布判卷接缝移除。来源：诊断漏检结论。

## 7. 数据、接口与兼容

- **公共接口变化：** 无。
- **数据模型与持久化：** 无。
- **兼容要求：** bundle ID、数据根、CLI/插件标识、旧应用和旧进程清理保持不变。
- **迁移要求：** 无用户数据迁移；构建配置直接收缩，不保留 Developer ID 兼容窗口。
- **发布或运维影响：** 后续发行仍会触发 Gatekeeper/SmartScreen 警告；维护者不提供平台签名 secrets。发布前必须取得原始产物启动 Evidence。

## 8. 非功能要求

- **NFR-001 安全与隐私：** 不把 `xattr` 或 SmartScreen 绕过描述为可信来源证明；内部 artifact 篡改检测不得降级。
- **NFR-002 性能与容量：** 不适用：只改变构建与验证路径，不改变运行时性能合同。
- **NFR-003 可用性与可靠性：** macOS arm64/x64 和 Windows 安装器必须在上传前通过原始产物启动门。
- **NFR-004 可观测性与运营：** CI 日志必须明确记录最终 macOS 模式、TeamIdentifier/Signature 摘要、Windows Authenticode 状态和 raw-package 启动结果，且不得输出秘密材料。

## 9. 验证策略

| 接缝 | 层级 | 覆盖合同 | 现有先例或命令 | Evidence 类型 |
|---|---|---|---|---|
| 包配置与禁止项扫描 | contract | AC-003、AC-006、AC-007、AC-008 | focused Vitest over build-server/CI/shell contracts | Ticket Evidence |
| 原始 DMG packaged flow | E2E | AC-001、AC-002、AC-004、AC-009 | `<Path>scripts/platform/macos/run-gate.mjs</Path>` direct flow，不传重签参数 | Ticket Evidence |
| Windows installer gate | E2E | AC-005、AC-009 | `<Path>scripts/platform/windows/run-gate.mjs</Path>` 与 packaged direct flow | Ticket Evidence |
| seed kit 与篡改夹具 | integration | AC-007、AC-008 | `npm run verify:seed-kit` 与 artifact focused tests | Ticket Evidence |
| 文档扫描 | contract | AC-010 | README/CI guard focused test | Ticket Evidence |

## 10. 风险、假设与未决问题

### 风险

- true unsigned 在 Apple Silicon 上可能因可执行签名强制要求失败；限定的 ad-hoc fallback 已锁定。
- 关闭 hardened runtime 会降低运行时保护，这是实验发行明确接受的边界；不得在文档中表述为正式安全发行。
- 测试若修改包内字节会再次掩盖问题，因此必须同时记录启动前后哈希。
- macOS 系统升级可能改变 Gatekeeper 行为，真实目标环境门是发布前必要条件。

### 已采用的低影响假设

- 当前 macOS CI runner 能运行本架构产物，x64 在 arm64 runner 上继续复用 Rosetta；若 runner 事实变化，只调整执行环境，不改变验收合同。
- `package-lock.json` 中 `@electron/notarize` 作为 electron-builder 传递依赖保留，不视为启用公证路径。

### 未决问题

无。
