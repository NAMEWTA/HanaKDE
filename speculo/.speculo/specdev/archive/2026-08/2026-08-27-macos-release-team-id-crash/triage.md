---
schema_version: 1
artifact: triage
change: 2026-08-27-macos-release-team-id-crash
mode: intake
source: <Path>{roots.state}/specdev/changes/2026-08-27-macos-release-team-id-crash/source.md</Path>
classification: bug
risk: high
route: specdev/diagnose-bugs
ready_for_implementation: true
external_action: not-applicable
updated_at: 2026-08-30T10:15:00+08:00
---

# Triage: macOS release Team ID crash

## 当前判定

- **影响：** 无平台发行身份的 macOS 包可能无法启动，Windows 未签名安装路径也必须真实验证。
- **紧急度：** immediate。
- **当前证据：** 实现固定点 `0e6bfc40` 已进入父分支；`v0.0.7` Build run `33060569590` 的 macOS arm64、原生 Intel x64、Windows x64 与 Linux job 全部成功。

## 未知项

- **可发现事实：** 无；required platform receipts 已重读。
- **需要用户决定：** 仅剩归档 dry-run 计划确认。
- **低影响实现细节：** 无。

## 路由

- **下一 Work：** 已完成 diagnose、spec、tickets 与 implement；当前进入 archive。
- **理由：** required platform receipts、direct-parent integration 与 release assets 已完成。

## 外部动作

- **远程目标：** 无。
- **关闭能力：** not-applicable。
- **当前状态：** not-applicable。
- **授权记录：** 无需 Issue/PR 关闭动作。
- **尝试与结果：** 无。
