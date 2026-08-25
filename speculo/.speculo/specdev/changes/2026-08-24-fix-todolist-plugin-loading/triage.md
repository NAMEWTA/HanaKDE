---
schema_version: 1
artifact: triage
change: 2026-08-24-fix-todolist-plugin-loading
mode: intake
source: <Path>{roots.state}/specdev/changes/2026-08-24-fix-todolist-plugin-loading/source.md</Path>
classification: bug
risk: medium
route: specdev/diagnose-bugs
ready_for_implementation: true
external_action: not-applicable
updated_at: 2026-08-25T22:39:44+08:00
---

# Triage: Todo 插件 Page 加载与鉴权

## 当前判定

- **影响：** Todo Page 因 surface session 与 ready 协议错误持续 loading，阻断用户 CRUD。
- **紧急度：** immediate
- **当前证据：** 诊断定位真实宿主 403 与 SDK 协议不匹配；插件实现提交 `0003a6734faddb170a9c06aa8a2fd282cef6becf`、30/30 插件测试、8/8 宿主合同与 12/12 真实 E2E 均通过。
- **相关代码/工件：** `<Path>plugins/todolist/</Path>`、`<Path>{roots.state}/specdev/changes/2026-08-24-fix-todolist-plugin-loading/diagnosis.md</Path>`、`<Path>{roots.state}/specdev/changes/2026-08-24-fix-todolist-plugin-loading/evidence/direct-spec.md</Path>`。

## 未知项

- **可发现事实：** 无。
- **需要用户决定：** 无。
- **低影响实现细节：** 无；修复与发行已闭环。

## 路由

- **下一 Work：** `<Path>{roots.workflows}/specdev/A-archive-and-consolidate/A-archive-and-consolidate.md</Path>`
- **理由：** 本地完成门通过，conversation 来源不支持远程关闭。

## 外部动作

- **远程目标：** 无
- **关闭能力：** not-applicable
- **当前状态：** not-applicable
- **授权记录：** 无需远程动作
- **尝试与结果：** 无

外部动作只投影最终完成，不替代本地状态、Spec 或 Evidence。
