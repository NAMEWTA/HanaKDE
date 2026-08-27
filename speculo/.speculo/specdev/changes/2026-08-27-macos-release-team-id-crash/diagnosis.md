---
schema_version: 1
artifact: diagnosis
change: 2026-08-27-macos-release-team-id-crash
status: root-cause-confirmed
feedback_loop_ready: true
red_command: "/Applications/HanaKDE.app/Contents/MacOS/HanaKDE"
red_evidence: "Exit 134; dyld refuses Electron Framework because the mapped framework and process do not have a compatible Team ID."
cleanup_status: clean
updated_at: 2026-08-27T14:45:43+08:00
---

# Diagnosis: macOS v0.0.6 下载后启动即崩溃

## 1. 现象与影响

HanaKDE v0.0.6 arm64 从 `/Applications/HanaKDE.app` 启动即以 `SIGABRT` 退出，Electron 主进程尚未进入应用代码。受影响对象是当前未使用 Developer ID 签名、同时启用 hardened runtime 的 macOS 发布包。

## 2. 红灯反馈回路

- **命令：** 直接执行 `/Applications/HanaKDE.app/Contents/MacOS/HanaKDE`。
- **至少一次真实输出：** 退出码 134；dyld 报告 `Electron Framework.framework` 与 mapping process 的 Team ID 不一致。
- **精确症状断言：** Electron Framework 文件存在，但在主进程映射阶段被 library validation 拒绝。
- **耗时：** 小于 1 秒。
- **确定性/复现率：** 2/2，包括用户 Crash Report 与 Agent 本机直接执行。
- **Agent 可运行性：** autonomous。
- **无法建立时已尝试方式和所需输入：** 不适用。

## 3. 最小复现

- **环境与输入：** Apple Silicon `Mac17,3`、macOS 26.5、v0.0.6 arm64 安装包、SIP enabled。
- **剩余步骤：** 只需执行 app 主二进制；不需要用户配置、网络、插件或应用数据。
- **逐项删除证据：** Framework 文件真实存在且为 arm64；主程序也为 arm64；因此文件缺失和架构不匹配不承载故障。主程序保留 hardened runtime 且没有 `disable-library-validation` 权限时，dyld 在加载第一个 Electron Framework 时稳定失败。
- **最后红灯证据：** `Library not loaded` 后紧跟 `mapping process and mapped file (non-platform) have different Team IDs`。
- **捕获物：** 用户提供的 Crash Report；没有持久化临时捕获物。

## 4. 假设与证伪

| 排名 | 假设与预测 | 支持证据 | 单变量实验 | 结果 |
|---|---|---|---|---|
| 1 | unsigned/ad-hoc Electron 包启用 hardened runtime 的 library validation，但主程序和 Framework 没有可匹配的 Developer Team ID；预测 dyld 在应用代码前拒绝 Framework | 两者均显示 `Signature=adhoc`、`TeamIdentifier=not set`、runtime flag；entitlements 未关闭 library validation | 直接执行并读取 dyld 错误；对照发布流水线的 `CSC_IDENTITY_AUTO_DISCOVERY=false` 与 Apple library-validation 合同 | confirmed |
| 2 | 下载不完整或 Framework 真正缺失；预测目标文件不存在或静态签名校验失败 | 报告标题写 `Library missing` | 检查目标文件并运行 `codesign --verify --deep --strict` | rejected：文件存在且静态校验通过 |
| 3 | arm64/x64 下载错误；预测主程序或 Framework 不是 arm64 | 用户机器为 Apple Silicon | 检查 Mach-O 类型 | rejected：两者均为 arm64 |
| 4 | Gatekeeper quarantine 单独阻止启动；预测 `spctl` 拒绝且不会进入 dyld Framework 映射 | 下载包带 quarantine 属性 | `spctl --assess` 与直接执行 | rejected：本机 assessment 接受，实际终止源是 dyld library validation |

## 5. 已确认根因

- **触发条件：** 在 macOS 26.5 启动 v0.0.6 arm64 发布包。
- **失败机制：** `<Path>package.json</Path>` 为 macOS 开启 hardened runtime；Apple 因而默认启用 library validation。`<Path>.github/workflows/build.yml</Path>` 又关闭证书自动发现并明确不提供 Developer ID，生成物只能采用 ad-hoc 签名。主程序与 Electron Framework 都没有 Apple Team ID，无法满足“Apple 系统库或与主程序相同 Team ID”的加载条件，dyld 在映射 Framework 时终止进程。
- **根因位置：** `<Path>.github/workflows/build.yml</Path>`、`<Path>package.json</Path>`、`<Path>desktop/entitlements.mac.plist</Path>` 的组合发布策略。
- **漏检原因：** v0.0.6 发布门只验证构建和资产存在，没有启动原样下载产物。历史 macOS direct-flow 已观察到同一 raw-app Team ID 崩溃，但用 `--adhoc-resign` 递归重签临时副本后才执行启动测试；v0.0.6 Spec 又明确保持原有 unsigned/not-notarized 策略，不修改 signing boundary。
- **为何排除其他候选：** 目标文件存在，架构正确，静态 `codesign` 校验通过；故障在应用代码运行前由 dyld 给出明确的 library-validation 因果信息。
- **确认实验：** 当前安装包直接执行稳定以相同 Team ID 错误退出；历史 Evidence 记录 raw app 同样失败、递归 ad-hoc 重签后的临时副本可完成 direct-flow。

## 6. 修复契约

- **必须改变：** 让发布签名策略与 hardened runtime 一致。首选为使用同一个 Apple Developer ID 对主程序、Helpers 和全部 Frameworks 正确签名并公证；unsigned 预览包如仍保留，则必须明确选择并验证兼容策略，而不能继续发布当前组合。
- **必须保持：** arm64/x64 双架构发布、现有 Electron 权限需求、DMG/ZIP 内容及应用功能不变；不得把本地临时重签冒充正式发布签名。
- **正确测试 seam：** `<Path>scripts/platform/macos/run-packaged-direct-flow.mjs</Path>` 与 `<Path>.github/workflows/build.yml</Path>`。
- **回归测试：** 对 CI 刚生成且未经任何二次重签的 DMG 解包副本执行启动 smoke，断言主进程越过 dyld、产生 `main-loaded` marker；另断言签名身份/Team ID 和 notarization 策略符合所选发布模式。
- **OUT：** 本次不修改生产配置、不重签 `/Applications/HanaKDE.app`、不发布新版本。
- **风险与回滚：** Developer ID 与公证是正式分发的低风险方向；`disable-library-validation` 或关闭 hardened runtime 会降低保护，只适合作为明确评审后的临时预览策略。回滚为撤销新发布资产，不覆盖用户数据。
- **推荐下游：** S-spec / T-tickets / I-implement。

## 7. 清理

- **原始回路重跑：** 已重跑，仍为 exit 134 和相同 dyld Team ID 错误。
- **`[DEBUG-...]` 搜索：** 未添加调试插桩。
- **一次性脚本/原型：** 无。
- **未清理项 owner 与删除条件：** 无。

## 8. 参考

- Apple Hardened Runtime：<Url>https://developer.apple.com/documentation/security/hardened-runtime</Url>
- Apple Disable Library Validation Entitlement：<Url>https://developer.apple.com/documentation/bundleresources/entitlements/com.apple.security.cs.disable-library-validation</Url>
